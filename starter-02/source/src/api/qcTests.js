// ============================================================
// QC test data access — same template as api/wirs.js.
// ============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentProjectId } from "../lib/currentProject.js";


export async function listQcTests(projectId = getCurrentProjectId()) {
  const { data, error } = await supabase
    .from('qc_tests')
    .select('*')
    .eq('project_id', projectId)
    .order('test_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createQcTest(fields) {
  const { data, error } = await supabase.from('qc_tests').insert({ project_id: getCurrentProjectId(), ...fields }).select().single();
  if (error) throw error;
  return data;
}

export async function updateQcTest(id, fields) {
  const { data, error } = await supabase.from('qc_tests').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteQcTest(id) {
  const { error } = await supabase.from('qc_tests').delete().eq('id', id);
  if (error) throw error;
}
