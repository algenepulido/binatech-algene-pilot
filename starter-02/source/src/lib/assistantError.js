// ============================================================
// assistantError — pure, non-sensitive classification of an ai-assist failure
// into a user-facing STATE. Kept separate from Assistant.jsx so it is unit-
// testable without the network, and so the diagnostic tag is guaranteed to
// carry NO tokens, keys, session values, or message content — only an error
// name + HTTP status.
// ============================================================

export const ASSISTANT_STATE = {
  OK: 'ok',
  NOT_CONFIGURED: 'not_configured', // function not deployed (404) or key missing (configured:false)
  UNAVAILABLE: 'unavailable',       // temporary / network / auth / upstream failure
};

/** HTTP status of a supabase FunctionsHttpError, if any (its `.context` is the
 *  Response). Never touches the body. */
function statusOf(error) {
  return error?.context?.status ?? error?.status ?? null;
}

/**
 * Decide the user-facing state from a supabase.functions.invoke result
 * ({ data, error }) or a thrown error ({ error }).
 *  - no error + configured:false  → NOT_CONFIGURED (deployed but no API key)
 *  - error with 404               → NOT_CONFIGURED (function not deployed)
 *  - anything else with an error  → UNAVAILABLE (temporary/network/auth/upstream)
 */
export function classifyAssistantResult({ data, error } = {}) {
  if (!error) {
    if (data && data.configured === false) return ASSISTANT_STATE.NOT_CONFIGURED;
    return ASSISTANT_STATE.OK;
  }
  return statusOf(error) === 404 ? ASSISTANT_STATE.NOT_CONFIGURED : ASSISTANT_STATE.UNAVAILABLE;
}

/**
 * A short, non-sensitive diagnostic tag safe to console.warn. Emits only the
 * error class name and HTTP status — NEVER tokens, keys, session, or messages.
 */
export function assistantDiagTag(error) {
  if (!error) return 'unknown';
  const name = error.name || 'Error';
  const status = statusOf(error);
  return status ? `${name} (${status})` : name;
}
