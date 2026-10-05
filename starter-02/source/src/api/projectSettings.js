// ============================================================
// Project settings — the editable project/company identity.
// One row per project_id, scoped to whichever project is currently open.
// ============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentProjectId } from '../lib/currentProject.js';


/** Returns the saved settings row, or null if none saved yet. */
export async function getProjectSettings(projectId = getCurrentProjectId()) {
  const { data, error } = await supabase.from('project_settings').select('*').eq('project_id', projectId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveProjectSettings(fields, projectId = getCurrentProjectId()) {
  const { data, error } = await supabase
    .from('project_settings')
    .upsert({ project_id: projectId, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'project_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}
