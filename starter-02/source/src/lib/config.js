// ============================================================
// Runtime configuration — the ONE place the app learns which environment it
// is talking to.
//
// Why this file exists: until 2026-08-19 `supabase.js` hardcoded the
// production URL and production anon key as fallbacks and declared itself
// configured unconditionally, and seven other modules repeated the production
// URL inline. A build with no environment variables therefore connected to
// PRODUCTION silently. That made a staging environment impossible to trust —
// a missing variable did not fail, it just pointed at live contractor data.
//
// The rule now: no module may name an environment. Everything environment-
// specific is read here, and absence is an explicit, visible failure —
// never a silent fallback.
//
// The anon key is public by design (it ships in the bundle; RLS is what
// protects data). It is required here anyway, because requiring it is what
// forces a deploy to state which project it is for.
// NEVER put a service_role key in this file or any VITE_ variable.
// ============================================================

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

/** Trimmed string value, or '' when unset/blank/non-string. */
function read(name) {
  const v = env[name];
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

const missing = [];

/** Read a variable the app cannot run without; records it when absent. */
function required(name) {
  const v = read(name);
  if (!v) missing.push(name);
  return v;
}

/** Read a variable that has a safe environment-neutral default. */
function optional(name, fallback) {
  return read(name) || fallback;
}

// --- Required: which Supabase project this build talks to -------------------
export const SUPABASE_URL = required('VITE_SUPABASE_URL');
export const SUPABASE_ANON_KEY = required('VITE_SUPABASE_ANON_KEY');

// --- Optional: names that are stable across environments --------------------
// Bucket names are per-project, so the same names are correct in staging and
// production; they are overridable for throwaway environments.
export const ATTACHMENTS_BUCKET = optional('VITE_ATTACHMENTS_BUCKET', 'attachments');
export const MODELS_BUCKET = optional('VITE_MODELS_BUCKET', 'models');

// The deployed slug of the Edge Function that signs R2 URLs.
// (Pilot starter: the slugs here are neutral placeholders; storage and Edge
// Functions are not available in the starter.)
//
// The default selects the legacy signer contract; setting
// VITE_R2_SIGN_FUNCTION=secure-r2-signer selects the secure contract.
export const R2_SIGN_FUNCTION = optional('VITE_R2_SIGN_FUNCTION', 'legacy-r2-signer');

/**
 * Which signer CONTRACT to speak. The legacy 'legacy-r2-signer' takes a
 * caller-supplied object key; the secure replacement takes a model_id (read)
 * or a project_id + filename (write) and derives the key server-side. They are
 * not interchangeable, so the contract follows the slug, selected by a single
 * environment variable.
 */
export const R2_SIGNER_IS_SECURE = R2_SIGN_FUNCTION !== 'legacy-r2-signer';

/** Variable names that are required but absent. Empty when fully configured. */
export const missingConfig = Object.freeze([...missing]);

/**
 * Truthful: true only when every required variable is actually present.
 * (It used to be hardcoded true, which is why a misconfigured build silently
 * reached production instead of failing.)
 */
export const isSupabaseConfigured = missing.length === 0;

/** Thrown on any attempt to use Supabase without complete configuration. */
export class ConfigError extends Error {
  constructor(names) {
    super(
      `BinaTech is not configured: missing ${names.join(', ')}. ` +
        'Copy .env.example to .env and set the values for the environment you ' +
        'intend to use. There is deliberately no fallback — a missing variable ' +
        'must never resolve to the production project.',
    );
    this.name = 'ConfigError';
    this.missing = names;
  }
}

/** Throw unless every required variable is present. */
export function assertConfigured() {
  if (!isSupabaseConfigured) throw new ConfigError(missingConfig);
}

/**
 * Absolute URL of a deployed Edge Function, derived from the configured
 * project. Call sites name the SLUG only — never a host.
 */
export function functionUrl(slug) {
  assertConfigured();
  return `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/${slug}`;
}

/**
 * The Supabase project ref parsed out of the configured URL, e.g. the
 * `sb-<ref>-auth-token` localStorage key. Derived, never hardcoded.
 * Returns '' when the URL is not a supabase.co host (self-hosted/local).
 */
export function projectRef() {
  const m = /^https?:\/\/([a-z0-9-]+)\.supabase\.(co|in)/i.exec(SUPABASE_URL);
  return m ? m[1] : '';
}
