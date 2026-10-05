// ============================================================
// Drawing register data access — same template as api/wirs.js.
// `linked_elements` is a text[] of element ids.
// ============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentProjectId } from "../lib/currentProject.js";

export const DRAWING_STATUSES = ['Approved', 'Approved with Comments', 'Under Review', 'Rejected', 'Superseded'];

export async function listDrawings(projectId = getCurrentProjectId()) {
  const { data, error } = await supabase
    .from('drawings')
    .select('*')
    .eq('project_id', projectId)
    .order('drawing_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createDrawing(fields) {
  const { data, error } = await supabase.from('drawings').insert({ project_id: getCurrentProjectId(), ...fields }).select().single();
  if (error) throw error;
  return data;
}

export async function updateDrawing(id, fields) {
  const { data, error } = await supabase.from('drawings').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteDrawing(id) {
  const { error } = await supabase.from('drawings').delete().eq('id', id);
  if (error) throw error;
}
