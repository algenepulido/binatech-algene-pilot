// ============================================================
// NCR data access — same template as api/wirs.js.
// ============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentProjectId } from "../lib/currentProject.js";


export async function listNcrs(projectId = getCurrentProjectId()) {
  const { data, error } = await supabase
    .from('ncrs')
    .select('*')
    .eq('project_id', projectId)
    .order('ncr_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createNcr(fields) {
  const { data, error } = await supabase.from('ncrs').insert({ project_id: getCurrentProjectId(), ...fields }).select().single();
  if (error) throw error;
  return data;
}

export async function updateNcr(id, fields) {
  const { data, error } = await supabase.from('ncrs').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteNcr(id) {
  const { error } = await supabase.from('ncrs').delete().eq('id', id);
  if (error) throw error;
}
