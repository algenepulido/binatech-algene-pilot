// ============================================================
// AI package-suggest — calls the secure suggest-packages Edge Function (the
// ANTHROPIC_API_KEY lives server-side, never in the browser). Returns proposed
// groups shaped for PackageSplitModal: [{ name, lineIds[] }]. The result is
// PREVIEWED and user-accepted — never applied automatically. Throws on failure
// so the caller can fall back to the deterministic splitter.
// ============================================================
import { supabase } from '../lib/supabase.js';
import { functionUrl, SUPABASE_ANON_KEY } from '../lib/config.js';

export async function suggestPackagesAI(lines = []) {
  const anon = SUPABASE_ANON_KEY;
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token || anon;

  const payload = lines.map((l) => ({ code: l.code, description: l.description, unit: l.unit }));
  const res = await fetch(functionUrl('suggest-packages'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ lines: payload }),
  });
  if (!res.ok) throw new Error(res.status === 404 ? 'AI package suggestion isn’t deployed yet (suggest-packages function).' : `Suggestion failed (${res.status}).`);
  const out = await res.json().catch(() => ({}));
  if (out.error) throw new Error(out.error);

  // Map model indexes back to real line ids; drop anything out of range (the
  // preview parks any uncovered line under "Unassigned", so totals still reconcile).
  const groups = (out.groups || [])
    .map((g) => ({ name: (g.name || 'Package').toString().trim() || 'Package', lineIds: (g.indexes || []).map((i) => lines[i]?.id).filter(Boolean) }))
    .filter((g) => g.lineIds.length);
  if (!groups.length) throw new Error('AI returned no usable groups.');
  return groups;
}
