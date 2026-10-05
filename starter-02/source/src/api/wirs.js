// ============================================================
// WIR data access — thin wrappers over supabase.from('wirs').
// This is the template every future module (NCR, snagging, ...) copies:
// list / get / create / update / delete for one table.
// `created_by` is filled by the DB default (auth.uid()), so the client
// never sends it.
// ============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentProjectId } from "../lib/currentProject.js";


export async function listWirs(projectId = getCurrentProjectId()) {
  const { data, error } = await supabase
    .from('wirs')
    .select('*')
    .eq('project_id', projectId)
    .order('inspection_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getWir(id) {
  const { data, error } = await supabase.from('wirs').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function createWir(fields) {
  const insert = { project_id: getCurrentProjectId(), ...fields };
  const { data, error } = await supabase.from('wirs').insert(insert).select().single();
  if (!error) return data;
  // Additive WIR-scope columns: if they aren't created yet, the insert fails —
  // strip them and retry so WIRs keep working before the migration is run.
  const msg = (error.message || '').toLowerCase();
  if (SCOPE_FIELDS.some((f) => msg.includes(f))) {
    const stripped = { ...insert };
    for (const f of SCOPE_FIELDS) delete stripped[f];
    const retry = await supabase.from('wirs').insert(stripped).select().single();
    if (retry.error) throw retry.error;
    return retry.data;
  }
  throw error;
}

// Additive WIR columns (scope metadata + the approved-quantity that drives
// certified value). Stripped + retried on insert/update if not yet migrated.
const SCOPE_FIELDS = ['scope_type', 'scope_package', 'scope_zone', 'scope_qty', 'scope_unit', 'scope_group_id', 'approved_qty', 'approved_unit', 'work_item_id', 'claimable', 'claim_status'];

export async function updateWir(id, fields) {
  const { data, error } = await supabase.from('wirs').update(fields).eq('id', id).select().single();
  if (!error) return data;
  // Same graceful degradation as createWir for the additive scope columns.
  const msg = (error.message || '').toLowerCase();
  if (SCOPE_FIELDS.some((f) => msg.includes(f))) {
    const stripped = { ...fields };
    for (const f of SCOPE_FIELDS) delete stripped[f];
    const retry = await supabase.from('wirs').update(stripped).eq('id', id).select().single();
    if (retry.error) throw retry.error;
    return retry.data;
  }
  throw error;
}

export async function deleteWir(id) {
  const { error } = await supabase.from('wirs').delete().eq('id', id);
  if (error) throw error;
}
