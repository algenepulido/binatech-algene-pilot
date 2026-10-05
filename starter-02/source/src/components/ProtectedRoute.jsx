// ============================================================
// ProtectedRoute — THE single authorization boundary for the signed-in
// application. Authorization decisions live here and nowhere else: no page
// makes its own call about whether it may render.
//
// Guarantees (all test-backed):
//   • children render ONLY on a verified session → no protected-content flash
//   • while verifying, a BOUNDED gate shows (the provider's 5s timeout ends it)
//   • an unauthenticated deep link goes to the dedicated sign-in route and
//     REMEMBERS the destination — the legacy modal is not part of this path
//   • every failure resolves to a recoverable screen, never a hang
//
// The frontend is not the security boundary — RLS is. This decides only *when*
// protected UI may be revealed.
// ============================================================
import { useEffect } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { AUTH_STATUS, detectLang, isAuthFailure, isRetryable } from '../lib/authState.js';
import { PUBLIC_HOME, SIGN_IN_ROUTE, currentHash, navigate, rememberIntendedRoute } from '../lib/routes.js';
import { LoginGate } from './LoginGate.jsx';
import { AuthStatusScreen } from './AuthStatusScreen.jsx';

export function ProtectedRoute({ children }) {
  const { isAuthenticated, authStatus, retryAuthInit } = useAuth();

  // Remember where the user was heading so sign-in can restore it. Runs while
  // access is unresolved too, but redirecting waits for the explicit
  // unauthenticated state — a slow valid session must never bounce to sign-in.
  const blocked = !isAuthenticated;
  useEffect(() => {
    if (blocked) rememberIntendedRoute(currentHash());
  }, [blocked, authStatus]);

  useEffect(() => {
    if (authStatus !== AUTH_STATUS.unauthenticated) return;
    navigate(SIGN_IN_ROUTE, { replace: true });
  }, [authStatus]);

  if (isAuthenticated) return children;

  if (authStatus === AUTH_STATUS.checking) return <LoginGate loading />;

  if (isAuthFailure(authStatus)) {
    return (
      <AuthStatusScreen
        status={authStatus}
        lang={detectLang()}
        onRetry={isRetryable(authStatus) ? retryAuthInit : null}
        onSignIn={() => navigate(SIGN_IN_ROUTE)}
        onPublicSite={() => navigate(PUBLIC_HOME)}
      />
    );
  }

  // The effect above replaces the blocked URL with the dedicated public sign-in
  // route. Render nothing during that single routing turn; importantly, do not
  // mount LoginGate, whose non-loading state opens the legacy AuthModal.
  return null;
}
