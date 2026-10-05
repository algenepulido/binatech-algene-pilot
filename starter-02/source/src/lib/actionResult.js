// ============================================================
// tryAction — wrap a write action so failures SURFACE instead of being
// swallowed. Several views used `await write().catch(() => {})` followed by an
// unconditional reload/success message, so a failed write looked like either a
// dead button or — worse — fake success. Handlers await this and branch on
// `ok`, showing `error` (a human-friendly message) when the write failed.
// ============================================================

/** Map a raw API error to a message a non-technical reviewer can act on. */
export function friendlyError(e, fallback = 'The action failed — please try again.') {
  const m = e?.message || '';
  // Supabase "table/column not provisioned" errors → point at the migration.
  if (/relation .+ does not exist|could not find .+ in the schema cache|does not exist/i.test(m)) {
    return 'This feature’s database table isn’t set up yet — run its supabase/*.sql migration, then retry.';
  }
  if (/failed to fetch|network|timeout/i.test(m)) {
    return 'Network problem — check your connection and retry.';
  }
  return m || fallback;
}

/** Run a write action; resolve to { ok: true, value } or { ok: false, error }. Never throws. */
export async function tryAction(run, fallback) {
  try {
    const value = await run();
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: friendlyError(e, fallback) };
  }
}
