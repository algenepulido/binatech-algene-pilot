// ============================================================
// Controlled-document (DMS) data access — same template as api/wirs.js.
// tags + linked_* are text[] columns.
// ============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentProjectId } from "../lib/currentProject.js";


export async function listDocuments(projectId = getCurrentProjectId()) {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('project_id', projectId)
    .order('doc_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createDocument(fields) {
  const { data, error } = await supabase.from('documents').insert({ project_id: getCurrentProjectId(), ...fields }).select().single();
  if (error) throw error;
  return data;
}

export async function updateDocument(id, fields) {
  const { data, error } = await supabase.from('documents').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteDocument(id) {
  const { error } = await supabase.from('documents').delete().eq('id', id);
  if (error) throw error;
}

// helpers for comma-separated <-> text[] in forms
export const csvToArr = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);
export const arrToCsv = (a) => (a || []).join(', ');
