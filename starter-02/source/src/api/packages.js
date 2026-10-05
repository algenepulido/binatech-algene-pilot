// ============================================================
// Packages — ONE optional sublevel under a project (also usable as a Zone),
// purely for organisation and partial certification. The project stays the
// single commercial unit (one master BOQ, one IPC stream); packages are just
// groupings/tags under it. Project > Package, one level only.
// Additive + nullable: a project with zero packages behaves exactly as today
// (everything is the implicit single/default package). Degrades gracefully if
// the table doesn't exist yet.
// ============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentProjectId } from '../lib/currentProject.js';

function missing(error) {
  const m = (error?.message || '').toLowerCase();
  return error?.code === '42P01' || (m.includes('does not exist') && m.includes('packages'));
}

export async function listPackages(projectId = getCurrentProjectId()) {
  try {
    const { data, error } = await supabase.from('packages').select('*').eq('project_id', projectId).order('created_at', { ascending: true });
    if (error) { if (missing(error)) return []; throw error; }
    return data ?? [];
  } catch (e) { if (missing(e)) return []; throw e; }
}

export async function createPackage({ name, code, type, description }, projectId = getCurrentProjectId()) {
  const payload = { project_id: projectId, name: (name || '').trim() || 'Package', code: (code || '').trim() || null, type: (type || '').trim() || null, description: (description || '').trim() || null };
  let { data, error } = await supabase.from('packages').insert(payload).select().single();
  if (error && /description|column/i.test(error.message || '')) {
    // `description` is additive — retry without it if the column isn't migrated yet.
    const { description: _d, ...rest } = payload; // eslint-disable-line no-unused-vars
    ({ data, error } = await supabase.from('packages').insert(rest).select().single());
  }
  if (error) throw error;
  return data;
}

/**
 * Bulk-assign BoQ lines to a package (or unassign with packageId = null).
 * Used to accept an auto-split. Organizational only — never touches certification.
 * Graceful: no-op if the package_id column isn't migrated yet.
 */
export async function assignLinesToPackage(boqItemIds = [], packageId) {
  const ids = (boqItemIds || []).filter(Boolean);
  if (!ids.length) return 0;
  const { error } = await supabase.from('boq_items').update({ package_id: packageId || null }).in('id', ids);
  if (error) { if (/package_id|column/i.test(error.message || '')) return 0; throw error; }
  return ids.length;
}

export async function updatePackage(id, fields) {
  const { data, error } = await supabase.from('packages').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deletePackage(id) {
  // Non-destructive to elements/BOQ: their package_id simply becomes a dangling
  // ref shown as "Unassigned" once the package is gone. We only remove the package row.
  const { error } = await supabase.from('packages').delete().eq('id', id);
  if (error) throw error;
}
