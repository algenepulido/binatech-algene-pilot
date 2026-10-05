// ============================================================
// PILOT STARTER ONLY — synthetic authentication (TEST BEHAVIOUR).
//
// The starter is "signed in" as one synthetic reviewer from the first render.
// There is no password, no real token and no real sign-in: credential
// operations (sign in, sign up, password reset, user updates, OAuth, OTP)
// reject as unsupported. Sign out works in memory; the evaluator panel can
// sign the synthetic reviewer back in.
// ============================================================
import { StarterUnsupportedOperation } from './strictSupabase.js';

export function createSyntheticAuth({ user, log }) {
  const makeSession = () => ({
    access_token: 'PILOT-SYNTHETIC-SESSION-NOT-A-CREDENTIAL',
    refresh_token: 'PILOT-SYNTHETIC-SESSION-NOT-A-CREDENTIAL',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 4102444800,
    user: structuredClone(user),
  });
  let session = makeSession();
  const listeners = new Set();
  const emit = (event) => { for (const l of [...listeners]) l(event, session); };

  const api = {
    async getSession() { log.record({ kind: 'auth', method: 'getSession' }); return { data: { session }, error: null }; },
    async getUser() { log.record({ kind: 'auth', method: 'getUser' }); return { data: { user: session?.user ?? null }, error: session ? null : { message: 'Auth session missing!', name: 'AuthSessionMissingError', status: 400 } }; },
    onAuthStateChange(callback) {
      listeners.add(callback);
      setTimeout(() => { if (listeners.has(callback)) callback('INITIAL_SESSION', session); }, 0);
      return { data: { subscription: { id: `pilot-${listeners.size}`, callback, unsubscribe: () => listeners.delete(callback) } } };
    },
    async signOut() { log.record({ kind: 'auth', method: 'signOut' }); session = null; emit('SIGNED_OUT'); return { error: null }; },
    async refreshSession() { log.record({ kind: 'auth', method: 'refreshSession' }); return { data: { session, user: session?.user ?? null }, error: null }; },
  };

  const control = {
    /** Evaluator control: sign the synthetic reviewer back in (test behaviour, not a real sign-in). */
    signInSyntheticReviewer() { session = makeSession(); log.record({ kind: 'auth', method: 'synthetic-sign-in' }); emit('SIGNED_IN'); },
    current: () => session,
  };

  const auth = new Proxy(api, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key === 'symbol' || key === 'then') return undefined;
      return () => {
        const error = new StarterUnsupportedOperation(`auth.${String(key)} — the starter has no real authentication`);
        log.record({ kind: 'unsupported', service: 'auth', method: String(key), description: error.message });
        return Promise.reject(error);
      };
    },
  });
  return { auth, control };
}
