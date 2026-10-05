// ============================================================
// LoginGate — the protected boundary's two non-failure screens:
//   • loading → the BOUNDED "checking your session" gate (the provider's 5s
//     timeout guarantees it cannot persist; it is never the final state)
//   • otherwise → "please sign in", which opens the AuthModal
//
// Rendered only by ProtectedRoute, so it never appears on a public or auth
// route. Bilingual EN/AR with RTL direction.
// ============================================================
import { useEffect } from 'react';
import { LogIn } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { COL } from '../lib/theme.js';
import { AUTH_ACTION_LABELS, AUTH_GATE_COPY, detectLang } from '../lib/authState.js';
import { Logo } from './Logo.jsx';

export function LoginGate({ loading, lang }) {
  const { openAuth } = useAuth();
  const l = (lang || detectLang()) === 'ar' ? 'ar' : 'en';
  const ar = l === 'ar';
  const copy = AUTH_GATE_COPY[l];

  // Auto-open the sign-in dialog once the auth check has finished.
  useEffect(() => { if (!loading) openAuth(); }, [loading, openAuth]);

  return (
    <div
      dir={ar ? 'rtl' : 'ltr'}
      className="w-full h-screen flex flex-col items-center justify-center"
      style={{ background: COL.bg, color: COL.text, fontFamily: ar ? "'Cairo', system-ui, sans-serif" : '"Inter", system-ui, -apple-system, sans-serif' }}
    >
      <div className="mb-4">
        <Logo size={40} withWordmark />
      </div>
      {loading && (
        <div className="w-6 h-6 mb-3 rounded-full" style={{ border: `2px solid ${COL.border}`, borderTopColor: COL.accent, animation: 'lpspin .7s linear infinite' }} />
      )}
      <style>{`@keyframes lpspin { to { transform: rotate(360deg); } }`}</style>
      <div className="text-sm mb-4" style={{ color: COL.textDim }} aria-live="polite">
        {loading ? copy.checking : copy.signInPrompt}
      </div>
      {!loading && (
        <button onClick={openAuth} className="px-4 py-2 text-sm rounded font-medium flex items-center gap-2 text-white" style={{ background: COL.accent }}>
          <LogIn size={15} /> {AUTH_ACTION_LABELS[l].signIn}
        </button>
      )}
    </div>
  );
}
