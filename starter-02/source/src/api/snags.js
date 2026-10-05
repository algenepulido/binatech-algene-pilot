// ============================================================
// Snag data access — same template as api/wirs.js.
// ============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentProjectId } from "../lib/currentProject.js";


export async function listSnags(projectId = getCurrentProjectId()) {
  const { data, error } = await supabase
    .from('snags')
    .select('*')
    .eq('project_id', projectId)
    .order('raised_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createSnag(fields) {
  const { data, error } = await supabase.from('snags').insert({ project_id: getCurrentProjectId(), ...fields }).select().single();
  if (error) throw error;
  return data;
}

export async function updateSnag(id, fields) {
  const { data, error } = await supabase.from('snags').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteSnag(id) {
  const { error } = await supabase.from('snags').delete().eq('id', id);
  if (error) throw error;
}
