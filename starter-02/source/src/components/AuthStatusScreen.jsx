// ============================================================
// AuthStatusScreen — the EXPLICIT outcome when bounded session verification
// does not end in a session (expired / service unavailable / offline / timed
// out). Replaces the old behaviour of sitting on "Checking your session…" for
// as long as the auth library kept retrying.
//
// It never renders protected content, never shows HTTP status codes, provider
// names, token terminology or raw error text — only restrained copy plus the
// three ways out: Retry, Sign in, Return to public site. Bilingual EN/AR with
// RTL direction.
// ============================================================
import { AlertCircle, LogIn, RotateCw } from 'lucide-react';
import { COL } from '../lib/theme.js';
import { AUTH_ACTION_LABELS, authStatusMessage } from '../lib/authState.js';
import { Logo } from './Logo.jsx';

export function AuthStatusScreen({ status, lang = 'en', onRetry, onSignIn, onPublicSite }) {
  const ar = lang === 'ar';
  const { title, body } = authStatusMessage(status, lang);
  const labels = AUTH_ACTION_LABELS[ar ? 'ar' : 'en'];

  const btnBase = 'px-4 py-2 text-sm rounded-lg font-semibold flex items-center gap-2 transition-colors';

  return (
    <div
      dir={ar ? 'rtl' : 'ltr'}
      role="alert"
      aria-live="polite"
      className="w-full h-screen flex flex-col items-center justify-center px-6"
      style={{ background: COL.bg, color: COL.text, fontFamily: ar ? "'Cairo', system-ui, sans-serif" : '"Inter", system-ui, -apple-system, sans-serif' }}
    >
      <div className="mb-5"><Logo size={38} withWordmark /></div>

      <div className="flex items-center gap-2 mb-2">
        <AlertCircle size={16} style={{ color: COL.pending }} />
        <span className="text-sm font-semibold" style={{ color: COL.text }}>{title}</span>
      </div>

      <p className="text-[13px] text-center mb-6 max-w-sm" style={{ color: COL.textDim }}>{body}</p>

      <div className="flex items-center gap-2 flex-wrap justify-center">
        {onRetry && (
          <button type="button" onClick={onRetry} className={`${btnBase} text-white`} style={{ background: COL.accent }}>
            <RotateCw size={14} /> {labels.retry}
          </button>
        )}
        {onSignIn && (
          <button type="button" onClick={onSignIn} className={btnBase} style={{ background: COL.surface, color: COL.text, border: `1px solid ${COL.borderStrong}` }}>
            <LogIn size={14} /> {labels.signIn}
          </button>
        )}
        {onPublicSite && (
          <button type="button" onClick={onPublicSite} className={btnBase} style={{ background: 'transparent', color: COL.textDim }}>
            {labels.publicSite}
          </button>
        )}
      </div>
    </div>
  );
}
