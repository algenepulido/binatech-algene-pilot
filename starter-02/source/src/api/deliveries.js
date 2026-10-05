// ============================================================
// Delivery / SDN data access — same template as api/wirs.js.
// ============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentProjectId } from "../lib/currentProject.js";

export const SDN_STATUSES = ['Pending DN', 'Pending SDN', 'Pending QC', 'Approved', 'Rejected'];

export async function listDeliveries(projectId = getCurrentProjectId()) {
  const { data, error } = await supabase.from('deliveries').select('*').eq('project_id', projectId).order('delivery_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function createDelivery(fields) {
  const { data, error } = await supabase.from('deliveries').insert({ project_id: getCurrentProjectId(), ...fields }).select().single();
  if (error) throw error;
  return data;
}
export async function updateDelivery(id, fields) {
  const { data, error } = await supabase.from('deliveries').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}
export async function deleteDelivery(id) {
  const { error } = await supabase.from('deliveries').delete().eq('id', id);
  if (error) throw error;
}
