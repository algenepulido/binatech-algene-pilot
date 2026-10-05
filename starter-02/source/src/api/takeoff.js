// ============================================================
// Measurement takeoff API — the itemized derivation behind a WIR's quantity.
// Rows are { line_no, description, location, qty }; their SUM is what the WIR
// form writes into wirs.approved_qty (so the certification engine is untouched —
// it keeps reading approved_qty). Degrades gracefully if wir_takeoff isn't
// provisioned yet (returns provisioned:false / empty).
// ============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentProjectId } from '../lib/currentProject.js';

function missingTable(e) {
  const m = (e?.message || '').toLowerCase();
  return e?.code === '42P01' || (m.includes('does not exist') && m.includes('takeoff')) || (m.includes('relation') && m.includes('takeoff'));
}

/** Sum of a set of takeoff rows (ignores blank/NaN quantities). Rounded to 2dp. */
export function takeoffTotal(rows) {
  const sum = (rows || []).reduce((acc, r) => {
    const n = Number(r?.qty);
    return acc + (isNaN(n) ? 0 : n);
  }, 0);
  return Math.round(sum * 100) / 100;
}

/** Takeoff rows for a WIR, ordered. { provisioned, rows }. Never throws. */
export async function listTakeoff(wirId) {
  if (!wirId) return { provisioned: true, rows: [] };
  try {
    const { data, error } = await supabase.from('wir_takeoff')
      .select('id,line_no,description,location,qty').eq('wir_id', wirId)
      .order('line_no', { ascending: true });
    if (error) { if (missingTable(error)) return { provisioned: false, rows: [] }; throw error; }
    return { provisioned: true, rows: data || [] };
  } catch (e) {
    if (missingTable(e)) return { provisioned: false, rows: [] };
    throw e;
  }
}

/**
 * Replace all takeoff rows for a WIR (delete + insert the current set). Keeps it
 * simple and idempotent — the form owns the full row set. Returns { provisioned }.
 */
export async function replaceTakeoff(wirId, rows, projectId = getCurrentProjectId()) {
  if (!wirId) return { provisioned: true };
  const clean = (rows || [])
    .map((r, i) => ({
      wir_id: wirId,
      project_id: projectId,
      line_no: i + 1,
      description: (r.description || '').trim() || null,
      location: (r.location || '').trim() || null,
      qty: (r.qty !== '' && r.qty != null && !isNaN(Number(r.qty))) ? Number(r.qty) : null,
    }))
    // keep only rows that carry some content
    .filter((r) => r.description || r.location || r.qty != null);
  try {
    const del = await supabase.from('wir_takeoff').delete().eq('wir_id', wirId);
    if (del.error) { if (missingTable(del.error)) return { provisioned: false }; throw del.error; }
    if (clean.length) {
      const ins = await supabase.from('wir_takeoff').insert(clean);
      if (ins.error) { if (missingTable(ins.error)) return { provisioned: false }; throw ins.error; }
    }
    return { provisioned: true };
  } catch (e) {
    if (missingTable(e)) return { provisioned: false };
    throw e;
  }
}
