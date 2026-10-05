// ============================================================
// Org-label display hygiene — DISPLAY ONLY (never writes to the database).
// Some test/demo rows carry placeholder junk (a consultant literally named
// "CONSULTANT", a client "TEST USER", contractor "ABC/ABC", the old product name
// "BIMQC"). cleanLabel() returns null for those (and for empty values) so the
// UI can render a muted "Not set" instead of leaking placeholders onto the
// screen. Exact-match only (trimmed, lower-cased), so a genuine name that
// merely contains one of these words is never hidden.
// ============================================================
const PLACEHOLDER_LABELS = new Set([
  'client', 'consultant', 'contractor', 'owner', 'main contractor',
  'test user', 'bimqc', 'bim qc', 'abc', 'abc/abc',
  'test', 'tbd', 'n/a', 'na', 'none', 'null', 'xxx', 'asdf', '-', '—',
]);

export function cleanLabel(v) {
  const s = (v ?? '').trim();
  if (!s) return null;
  return PLACEHOLDER_LABELS.has(s.toLowerCase()) ? null : s;
}
