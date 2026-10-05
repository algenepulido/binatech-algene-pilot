// ============================================================
// Vendor master data access — same template as api/wirs.js.
// ============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentProjectId } from "../lib/currentProject.js";

export const VENDOR_TYPES = ['permanent', 'non-permanent', 'subcontract', 'service', 'equipment', 'vehicle'];

export async function listVendors(projectId = getCurrentProjectId()) {
  const { data, error } = await supabase.from('vendors').select('*').eq('project_id', projectId).order('vendor_code', { ascending: true });
  if (error) throw error;
  return data ?? [];
}
export async function createVendor(fields) {
  const { data, error } = await supabase.from('vendors').insert({ project_id: getCurrentProjectId(), ...fields }).select().single();
  if (error) throw error;
  return data;
}
export async function updateVendor(id, fields) {
  const { data, error } = await supabase.from('vendors').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}
export async function deleteVendor(id) {
  const { error } = await supabase.from('vendors').delete().eq('id', id);
  if (error) throw error;
}
