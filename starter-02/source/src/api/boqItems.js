// ============================================================
// BoQ line-item data access — one row per element/BoQ line.
// The QS view aggregates these by code.
// ============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentProjectId } from "../lib/currentProject.js";

// A real, measurable BoQ LINE ITEM (linkable to a model element) — as opposed
// to a subtotal / section header / VAT / retention / grand-total summary row.
// Summary rows are stored in the same table but have no real code (empty, or the
// legacy placeholder "(no code)" written by an older import), or are obvious
// total/VAT/retention rows, or section titles with no unit/qty/rate. A genuine
// line item has a REAL code AND a measure (a unit, or a non-zero qty/rate).
// Identifying summary rows: (a) missing/placeholder code, (b) no measure, or
// (c) the description is a total/VAT/retention/subtotal line with no unit.
// Additive: no schema change.
const SUMMARY_DESC_RX = /^\s*(sub[\s-]*total|total|grand[\s-]*total|vat\b|retention\b|carried\b|brought\s+forward|summary)\b/i;
export function isBoqLineItem(b) {
  const code = (b?.code ?? '').toString().trim();
  if (!code || code.toLowerCase() === '(no code)') return false;        // (a)
  const hasUnit = (b?.unit ?? '').toString().trim().length > 0;
  const hasMeasure = hasUnit || Number(b?.qty) > 0 || Number(b?.rate) > 0;
  if (!hasMeasure) return false;                                        // (b)
  const desc = (b?.description ?? '').toString();
  if (!hasUnit && SUMMARY_DESC_RX.test(desc)) return false;            // (c)
  return true;
}

export async function listBoqItems(projectId = getCurrentProjectId()) {
  // Order by source POSITION (preserves the imported bill's structure/order),
  // then code as a tie-break. Falls back to code order if the additive
  // `position` column isn't migrated yet.
  let res = await supabase.from('boq_items').select('*').eq('project_id', projectId).order('position', { ascending: true, nullsFirst: false }).order('code', { ascending: true });
  if (res.error && /position|column/i.test(res.error.message || '')) {
    res = await supabase.from('boq_items').select('*').eq('project_id', projectId).order('code', { ascending: true }).order('element_id', { ascending: true });
  }
  if (res.error) throw res.error;
  return res.data ?? [];
}

// Server-side paginated / searchable / sortable BoQ rows — for the Line Items
// view at scale (no client load-all). Returns { rows, count }. Search and order
// run in Postgres (needs the indexes in supabase/boq_scale_indexes_additive.sql).
const PAGE_SORT_COLS = { code: 'code', element: 'element_id', description: 'description', unit: 'unit', qty: 'qty', approved: 'approved_qty', rate: 'rate' };
export async function listBoqItemsPage({ projectId = getCurrentProjectId(), q = '', sortKey = 'code', sortDir = 'asc', pkg = 'all', page = 0, pageSize = 100 } = {}) {
  const col = PAGE_SORT_COLS[sortKey] || 'code';
  let query = supabase.from('boq_items').select('*', { count: 'exact' }).eq('project_id', projectId);
  if (pkg && pkg !== 'all') query = pkg === 'unassigned' ? query.is('package_id', null) : query.eq('package_id', pkg);
  const safe = (q || '').replace(/[,%()*]/g, ' ').trim();
  if (safe) query = query.or(`code.ilike.%${safe}%,description.ilike.%${safe}%`);
  query = query.order(col, { ascending: sortDir === 'asc', nullsFirst: false }).range(page * pageSize, page * pageSize + pageSize - 1);
  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data ?? [], count: count ?? 0 };
}
// Strip the additive `package_id` and retry if that column doesn't exist yet,
// so BOQ create/edit keeps working before the (additive) migration is run.
// Additive columns that may not be migrated yet — stripped on a column error.
const OPTIONAL_COLS = ['package_id', 'position'];
function stripOptional(fields) { const r = { ...fields }; OPTIONAL_COLS.forEach((k) => delete r[k]); return r; }
const isColErr = (e) => /package_id|position|column/i.test(e?.message || '');
function stripPackage(fields) { const { package_id, ...rest } = fields; return rest; }
const isPkgColErr = (e) => /package_id|position|column/i.test(e?.message || '');

export async function createBoqItem(fields) {
  let res = await supabase.from('boq_items').insert({ project_id: getCurrentProjectId(), ...fields }).select().single();
  if (res.error && isColErr(res.error) && OPTIONAL_COLS.some((k) => k in fields)) {
    res = await supabase.from('boq_items').insert({ project_id: getCurrentProjectId(), ...stripOptional(fields) }).select().single();
  }
  if (res.error) throw res.error;
  return res.data;
}
export async function updateBoqItem(id, fields) {
  let res = await supabase.from('boq_items').update(fields).eq('id', id).select().single();
  if (res.error && 'package_id' in fields && isPkgColErr(res.error)) {
    res = await supabase.from('boq_items').update(stripPackage(fields)).eq('id', id).select().single();
  }
  if (res.error) throw res.error;
  return res.data;
}
export async function deleteBoqItem(id) {
  const { error } = await supabase.from('boq_items').delete().eq('id', id);
  if (error) throw error;
}
