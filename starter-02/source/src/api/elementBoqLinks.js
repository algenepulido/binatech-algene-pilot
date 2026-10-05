// ============================================================
// Element ↔ BOQ links — the many-to-many join that closes the loop between
// real parsed IFC elements and the bill of quantities. One element can back
// several BOQ lines; one BOQ line can be backed by several elements.
// Additive join table; degrades gracefully if it doesn't exist yet.
// (The legacy single link boq_items.element_id still works and is shown too.)
// ============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentProjectId } from '../lib/currentProject.js';

function missing(error) {
  const m = (error?.message || '').toLowerCase();
  return error?.code === '42P01' || (m.includes('does not exist') && m.includes('element_boq_links'));
}

export async function listLinksForElement(elementGuid, projectId = getCurrentProjectId()) {
  try {
    const { data, error } = await supabase.from('element_boq_links').select('*').eq('project_id', projectId).eq('element_guid', elementGuid);
    if (error) { if (missing(error)) return []; throw error; }
    return data ?? [];
  } catch (e) { if (missing(e)) return []; throw e; }
}

export async function listLinksForBoq(boqItemId, projectId = getCurrentProjectId()) {
  try {
    const { data, error } = await supabase.from('element_boq_links').select('*').eq('project_id', projectId).eq('boq_item_id', boqItemId);
    if (error) { if (missing(error)) return []; throw error; }
    return data ?? [];
  } catch (e) { if (missing(e)) return []; throw e; }
}

/** All links for the project (for counts / bidirectional lookups). Never throws. */
export async function listAllLinks(projectId = getCurrentProjectId()) {
  try {
    const { data, error } = await supabase.from('element_boq_links').select('*').eq('project_id', projectId);
    if (error) { if (missing(error)) return []; throw error; }
    return data ?? [];
  } catch (e) { if (missing(e)) return []; throw e; }
}

export async function linkElementBoq(elementGuid, boqItemId, projectId = getCurrentProjectId()) {
  // Avoid duplicates.
  const existing = await listLinksForElement(elementGuid, projectId);
  if (existing.some((l) => l.boq_item_id === boqItemId)) return existing.find((l) => l.boq_item_id === boqItemId);
  const { data, error } = await supabase.from('element_boq_links').insert({ project_id: projectId, element_guid: elementGuid, boq_item_id: boqItemId }).select().single();
  if (error) throw error;
  return data;
}

export async function unlinkElementBoq(elementGuid, boqItemId, projectId = getCurrentProjectId()) {
  const { error } = await supabase.from('element_boq_links').delete().eq('project_id', projectId).eq('element_guid', elementGuid).eq('boq_item_id', boqItemId);
  if (error) throw error;
}
