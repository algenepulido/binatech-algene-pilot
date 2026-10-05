// ============================================================
// IPC data access — same template as api/wirs.js.
// ============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentProjectId } from "../lib/currentProject.js";


export async function listIpcs(projectId = getCurrentProjectId()) {
  const { data, error } = await supabase
    .from('ipcs')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createIpc(fields) {
  const { data, error } = await supabase
    .from('ipcs')
    .insert({ project_id: getCurrentProjectId(), ...fields })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateIpc(id, fields) {
  const { data, error } = await supabase.from('ipcs').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteIpc(id) {
  const { error } = await supabase.from('ipcs').delete().eq('id', id);
  if (error) throw error;
}
