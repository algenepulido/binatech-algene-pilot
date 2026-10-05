// ============================================================
// Work items — the no-model unit of work (BoQ line + location + optional
// drawing). A model element is optional; when absent, the work item IS the
// thing a WIR inspects and certifies. WIRs raised against a work item carry its
// boq_item_id, so the existing certification engine (recertify.js) handles them
// unchanged. Scoped to the open project. Degrades gracefully (returns [] / no-op)
// when the additive table isn't provisioned yet, so nothing breaks pre-migration.
// ============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentProjectId } from '../lib/currentProject.js';

function missing(error) {
  const m = (error?.message || '').toLowerCase();
  return error?.code === '42P01' || (m.includes('does not exist') && m.includes('work_items'));
}

export async function listWorkItems(projectId = getCurrentProjectId()) {
  try {
    const { data, error } = await supabase
      .from('work_items')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) { if (missing(error)) return []; throw error; }
    return data ?? [];
  } catch (e) { if (missing(e)) return []; throw e; }
}

const FIELDS = ['boq_item_id', 'location', 'zone', 'level', 'chainage', 'drawing_ref', 'description', 'element_guid', 'status'];
function clean(fields, projectId) {
  const row = { project_id: projectId };
  for (const f of FIELDS) {
    let v = fields[f];
    if (typeof v === 'string') v = v.trim() || null;
    if (v !== undefined) row[f] = v ?? null;
  }
  return row;
}

export async function createWorkItem(fields, projectId = getCurrentProjectId()) {
  const { data, error } = await supabase.from('work_items').insert(clean(fields, projectId)).select().single();
  if (error) throw error;
  return data;
}

/**
 * Bulk-generate work items from one BoQ line × a list of locations.
 * e.g. boq line "C40 columns" × ["GF","L1","L2","L3"] → 4 work items.
 * Returns the inserted rows.
 */
export async function bulkCreateWorkItems({ boq_item_id, locations = [], drawing_ref = null, description = null }, projectId = getCurrentProjectId()) {
  const rows = locations
    .map((l) => (l || '').trim())
    .filter(Boolean)
    .map((location) => clean({ boq_item_id, location, drawing_ref, description, status: 'planned' }, projectId));
  if (!rows.length) return [];
  const { data, error } = await supabase.from('work_items').insert(rows).select();
  if (error) throw error;
  return data ?? [];
}

export async function updateWorkItem(id, fields) {
  const patch = {};
  for (const f of FIELDS) if (f in fields) { let v = fields[f]; if (typeof v === 'string') v = v.trim() || null; patch[f] = v ?? null; }
  const { data, error } = await supabase.from('work_items').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteWorkItem(id) {
  const { error } = await supabase.from('work_items').delete().eq('id', id);
  if (error) throw error;
}
