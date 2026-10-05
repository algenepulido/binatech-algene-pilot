// ============================================================
// Auth context — the single owner of "is there a verified session?".
//
// Initialization is BOUNDED BY THE APPLICATION (5s). An expired persisted
// session makes supabase-js attempt a token refresh; when the auth endpoint is
// unreachable it retries internally with backoff, so the UI must never wait on
// that. One attempt, one timer, one listener, explicit attempt generations:
//
//   • a superseded / abandoned attempt can never write state (stale results lose)
//   • the timeout abandons its attempt and NEVER grants access
//   • Retry starts exactly one fresh attempt; rapid clicks coalesce
//   • sign-out invalidates any pending attempt, so a late refresh cannot
//     resurrect a signed-out session
//   • a transient outage never clears a recoverable stored session; only a
//     genuinely rejected refresh token resolves to "sign in again"
//
// It never reads storage (a storage key is not authentication) and never logs
// provider errors, which can carry session detail.
// See docs/operations/auth-initialization-resilience.md.
// ============================================================
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { clearCurrentProject } from './currentProject.js';
import { clearAllChats } from './aiChatStore.js';
import { clearIntendedRoute } from './routes.js';
import { AUTH_INIT_TIMEOUT_MS, AUTH_STATUS, classifyAuthError } from './authState.js';

const AuthContext = createContext(null);

const onlineNow = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState(AUTH_STATUS.checking);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const mountedRef = useRef(true);
  const attemptRef = useRef(0);      // generation: bumped to abandon an attempt
  const inFlightRef = useRef(false); // single-flight: no duplicate refresh storms
  const timerRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  /** Abandon whatever attempt is running (its result will be ignored). */
  const abandonAttempt = useCallback(() => {
    attemptRef.current += 1;
    inFlightRef.current = false;
    clearTimer();
  }, [clearTimer]);

  /** Exactly one bounded verification attempt. */
  const runInit = useCallback(() => {
    if (!mountedRef.current || inFlightRef.current) return; // coalesce rapid Retry
    inFlightRef.current = true;
    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;
    const isCurrent = () => mountedRef.current && attemptRef.current === attempt;

    setStatus(AUTH_STATUS.checking);

    const settle = (next, nextSession) => {
      if (!isCurrent()) return;              // abandoned or superseded → drop
      clearTimer();
      inFlightRef.current = false;
      setSession(nextSession ?? null);
      setStatus(next);
    };

    clearTimer();
    timerRef.current = setTimeout(() => {
      if (!isCurrent()) return;
      timerRef.current = null;
      // Abandon this attempt: a late result must not flip state minutes later.
      // The timeout grants nothing and clears no stored session.
      attemptRef.current += 1;
      inFlightRef.current = false;
      setStatus(AUTH_STATUS.timedOut);
    }, AUTH_INIT_TIMEOUT_MS);

    // Never log the raw error and never sign out here: an outage must not
    // destroy a session that may still be recoverable.
    const fail = (error) => settle(
      classifyAuthError(error, { online: onlineNow() }) || AUTH_STATUS.serviceUnavailable,
      null,
    );

    let result;
    try {
      result = supabase.auth.getSession();
    } catch (error) { fail(error); return; }

    Promise.resolve(result).then(
      (res) => {
        if (res?.error) { fail(res.error); return; }
        const s = res?.data?.session ?? null;
        settle(s ? AUTH_STATUS.authenticated : AUTH_STATUS.unauthenticated, s);
      },
      (error) => fail(error),
    );
  }, [clearTimer]);

  useEffect(() => {
    mountedRef.current = true;
    runInit();

    let sub;
    try {
      ({ data: sub } = supabase.auth.onAuthStateChange((event, s) => {
        if (!mountedRef.current) return;
        if (s) {
          // A live session from the library is authoritative (sign-in, refresh,
          // restore) — supersede any pending attempt and accept it.
          abandonAttempt();
          setSession(s);
          setStatus(AUTH_STATUS.authenticated);
          return;
        }
        if (event === 'SIGNED_OUT') {
          abandonAttempt();
          setSession(null);
          setStatus(AUTH_STATUS.unauthenticated);
        }
        // A null session on INITIAL_SESSION is ignored on purpose: the bounded
        // attempt classifies WHY (expired vs unavailable vs offline) instead of
        // collapsing everything into a generic unauthenticated state.
      }));
    } catch { /* a listener failure must not break a valid session */ }

    return () => {
      mountedRef.current = false;
      clearTimer();
      try { sub?.subscription?.unsubscribe?.(); } catch { /* ignore */ }
    };
  }, [runInit, abandonAttempt, clearTimer]);

  /** Explicit, bounded, coalesced retry (used by the auth status screen). */
  const retryAuthInit = useCallback(() => {
    if (inFlightRef.current) return;   // an attempt is already running
    runInit();
  }, [runInit]);

  const signIn = useCallback((email, password) => supabase.auth.signInWithPassword({ email, password }), []);
  const signUp = useCallback((email, password) => supabase.auth.signUp({ email, password }), []);

  // Clear sensitive client state on sign-out (project context + AI chat history)
  // so a shared device does not leak one user's data to the next, and invalidate
  // any pending attempt so a late refresh cannot resurrect the session.
  const signOut = useCallback(() => {
    abandonAttempt();
    setSession(null);
    setStatus(AUTH_STATUS.unauthenticated);
    try { clearCurrentProject(); clearAllChats(); clearIntendedRoute(); } catch { /* ignore */ }
    return supabase.auth.signOut();
  }, [abandonAttempt]);

  const openAuth = useCallback(() => setAuthModalOpen(true), []);
  const closeAuth = useCallback(() => setAuthModalOpen(false), []);

  // Run `action` if signed in; otherwise open the login modal.
  const requireAuth = useCallback((action) => {
    if (session?.user) action?.();
    else setAuthModalOpen(true);
  }, [session]);

  const value = {
    session,
    user: session?.user ?? null,
    authStatus: status,
    isAuthenticated: status === AUTH_STATUS.authenticated && Boolean(session?.user),
    retryAuthInit,
    signIn, signUp, signOut,
    authModalOpen, openAuth, closeAuth,
    requireAuth,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
