// ============================================================
// Auth status — the application's own bounded model for verifying a session.
//
// Why it exists: an expired persisted session makes supabase-js attempt a token
// refresh; when the auth endpoint is unreachable it retries internally with
// backoff (~1s,1s,3s,4s,7s…). The UI must never inherit that timeline, so the
// application bounds the check itself and resolves into an EXPLICIT state.
//
// Classification is STRUCTURED-FIRST: HTTP status, then the provider's error
// `code`/`name`, and only then message text as a last resort. Unknown errors
// FAIL CLOSED to a recoverable generic state — they never authenticate.
//
// This module reads no storage and holds no session: a storage key is not
// authentication, so nothing here can be tricked by a planted localStorage value.
// ============================================================

/** Application-controlled bound on protected-route initialization. */
export const AUTH_INIT_TIMEOUT_MS = 5000;

export const AUTH_STATUS = {
  checking: 'checking',
  authenticated: 'authenticated',
  unauthenticated: 'unauthenticated',
  sessionExpired: 'session_expired',
  serviceUnavailable: 'service_unavailable',
  networkError: 'network_error',
  timedOut: 'timed_out',
};

/** Verification did not end in a session AND is worth showing an explicit screen for. */
export const AUTH_FAILURE_STATUSES = [
  AUTH_STATUS.sessionExpired,
  AUTH_STATUS.serviceUnavailable,
  AUTH_STATUS.networkError,
  AUTH_STATUS.timedOut,
];

export const isAuthFailure = (s) => AUTH_FAILURE_STATUSES.includes(s);
/** Failures the user can retry from (an expired session needs sign-in instead). */
export const isRetryable = (s) => s === AUTH_STATUS.serviceUnavailable
  || s === AUTH_STATUS.networkError || s === AUTH_STATUS.timedOut;

// ── Structured error classification ─────────────────────────
// Provider error codes that mean "this session is genuinely over".
const EXPIRED_CODES = new Set([
  'refresh_token_not_found', 'refresh_token_already_used', 'invalid_grant',
  'session_not_found', 'session_expired', 'bad_jwt', 'user_not_found',
]);
// Statuses that mean "the credential is rejected" vs "the service is unhappy".
const EXPIRED_STATUSES = new Set([400, 401, 403]);
const UNAVAILABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
// Last-resort text probes (only consulted when nothing structured is present).
const EXPIRED_TEXT = /refresh[ _-]?token|token not found|invalid[ _-]?grant|jwt expired|session (?:not found|missing|expired)/i;
const FETCH_FAIL_TEXT = /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_network/i;

/**
 * Classify an auth error into a status.
 * @param {*} error  provider error (never logged by callers)
 * @param {{online?: boolean}} ctx
 */
export function classifyAuthError(error, { online = true } = {}) {
  if (!error) return null;

  const name = String(error.name || '');
  const code = String(error.code || error.error || '').toLowerCase();
  const status = Number(error.status ?? error.statusCode ?? error.httpStatus ?? 0) || 0;
  const text = `${name} ${error.message || ''} ${code}`;

  // 1. Explicit cancellation / our own bound → timed out.
  if (name === 'AbortError' || name === 'TimeoutError' || error.__timedOut === true) return AUTH_STATUS.timedOut;

  // 2. The browser says there is no connection — that dominates every shape.
  if (online === false) return AUTH_STATUS.networkError;

  // 3. Structured: provider error code.
  if (code && EXPIRED_CODES.has(code)) return AUTH_STATUS.sessionExpired;

  // 4. Structured: HTTP status.
  if (UNAVAILABLE_STATUSES.has(status)) return AUTH_STATUS.serviceUnavailable;
  if (EXPIRED_STATUSES.has(status)) return AUTH_STATUS.sessionExpired;
  if (status >= 500) return AUTH_STATUS.serviceUnavailable;

  // 5. Structured: the provider's retryable-transport error class.
  if (name === 'AuthRetryableFetchError') return AUTH_STATUS.serviceUnavailable;

  // 6. Last resort: message text. NOTE a 503 usually arrives here as an opaque
  //    fetch failure (status 0) because CORS sits downstream of it, so
  //    503-vs-network is not always distinguishable client-side. Both outcomes
  //    are non-destructive and the copy is accurate either way.
  if (EXPIRED_TEXT.test(text)) return AUTH_STATUS.sessionExpired;
  if (name === 'TypeError' || FETCH_FAIL_TEXT.test(text)) return AUTH_STATUS.serviceUnavailable;

  // 7. Unknown → FAIL CLOSED to a recoverable generic state. Never authenticate.
  return AUTH_STATUS.serviceUnavailable;
}

// ── User-facing copy (EN / AR) ──────────────────────────────
// Implementation-free: no provider names, HTTP codes, token terminology or raw
// error text ever reaches the UI.
const MESSAGES = {
  [AUTH_STATUS.sessionExpired]: {
    en: { title: 'Session expired', body: 'Your session has expired. Sign in again to continue.' },
    ar: { title: 'انتهت صلاحية الجلسة', body: 'انتهت صلاحية جلستك. سجّل الدخول من جديد للمتابعة.' },
  },
  [AUTH_STATUS.serviceUnavailable]: {
    en: { title: 'Authentication unavailable', body: 'We could not reach the authentication service. Try again in a moment.' },
    ar: { title: 'خدمة تسجيل الدخول غير متوفرة', body: 'لم نتمكّن من الوصول إلى خدمة تسجيل الدخول. أعد المحاولة بعد قليل.' },
  },
  [AUTH_STATUS.networkError]: {
    en: { title: 'Connection problem', body: 'Check your connection and try again.' },
    ar: { title: 'مشكلة في الاتصال', body: 'تحقّق من اتصالك وأعد المحاولة.' },
  },
  [AUTH_STATUS.timedOut]: {
    en: { title: 'Still verifying', body: 'Session verification is taking longer than expected.' },
    ar: { title: 'جارٍ التحقّق', body: 'يستغرق التحقّق من الجلسة وقتًا أطول من المتوقّع.' },
  },
};

export const AUTH_ACTION_LABELS = {
  en: { retry: 'Retry', signIn: 'Sign in', publicSite: 'Return to public site' },
  ar: { retry: 'إعادة المحاولة', signIn: 'تسجيل الدخول', publicSite: 'العودة إلى الموقع' },
};

/** Copy for the bounded checking gate / sign-in prompt at the protected boundary. */
export const AUTH_GATE_COPY = {
  en: { checking: 'Checking your session…', signInPrompt: 'Please sign in to continue' },
  ar: { checking: 'جارٍ التحقّق من جلستك…', signInPrompt: 'يُرجى تسجيل الدخول للمتابعة' },
};

/** Copy for a failure status (falls back to the service-unavailable wording). */
export function authStatusMessage(status, lang = 'en') {
  const l = lang === 'ar' ? 'ar' : 'en';
  return (MESSAGES[status] || MESSAGES[AUTH_STATUS.serviceUnavailable])[l];
}

/** Best-effort UI language (document lang, then browser) for shells outside AppShell. */
export function detectLang() {
  try {
    const doc = typeof document !== 'undefined' ? document.documentElement?.lang : '';
    const nav = typeof navigator !== 'undefined' ? navigator.language : '';
    return /^ar/i.test(doc || '') || /^ar/i.test(nav || '') ? 'ar' : 'en';
  } catch { return 'en'; }
}
