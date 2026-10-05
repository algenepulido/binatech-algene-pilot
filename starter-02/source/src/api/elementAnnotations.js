// ============================================================
// Element annotations — user-side metadata (display name, description, material
// tag, package label, notes) keyed by IFC GUID, in the additive
// element_annotations table. Shown ALONGSIDE the read-only IFC native data,
// never replacing it. Every call is wrapped + project-scoped; a missing table
// degrades to "no annotations" with a clear error on write, never throws blind.
// ============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentProjectId } from '../lib/currentProject.js';

const FIELDS = ['display_name', 'description', 'material_tag', 'package_label', 'notes'];

function missing(error) {
  const m = (error?.message || '').toLowerCase();
  return error?.code === '42P01' || (m.includes('does not exist') && m.includes('element_annotations'));
}

/** Read one element's annotation, or null if none / table absent. Never throws. */
export async function getAnnotation(ifcGuid, projectId = getCurrentProjectId()) {
  try {
    const { data, error } = await supabase.from('element_annotations')
      .select('*').eq('project_id', projectId).eq('ifc_guid', ifcGuid).maybeSingle();
    if (error) { if (missing(error)) return null; throw error; }
    return data || null;
  } catch (e) { if (missing(e)) return null; return null; }
}

/**
 * Create/update an element's annotation (upsert on project+guid). Only the known
 * user fields are written — never any IFC native field. Returns the saved row.
 * Throws a friendly Error the UI can show (caught at the call site).
 */
export async function upsertAnnotation(ifcGuid, fields, projectId = getCurrentProjectId()) {
  const patch = {};
  for (const k of FIELDS) if (k in fields) patch[k] = (fields[k] ?? '').toString().trim() || null;
  const row = { project_id: projectId, ifc_guid: ifcGuid, ...patch, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('element_annotations')
    .upsert(row, { onConflict: 'project_id,ifc_guid' }).select().single();
  if (error) {
    if (missing(error)) throw new Error('Annotations table not set up yet — run the element_annotations SQL.');
    throw error;
  }
  return data;
}
