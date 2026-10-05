// ============================================================
// Purchase order / subcontract / service-agreement data access.
// ============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentProjectId } from "../lib/currentProject.js";

export const PO_TYPES = ['permanent', 'non-permanent', 'subcontract', 'service', 'equipment', 'vehicle'];

export async function listPurchaseOrders(projectId = getCurrentProjectId()) {
  const { data, error } = await supabase.from('purchase_orders').select('*').eq('project_id', projectId).order('issued_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function createPurchaseOrder(fields) {
  const { data, error } = await supabase.from('purchase_orders').insert({ project_id: getCurrentProjectId(), ...fields }).select().single();
  if (error) throw error;
  return data;
}
export async function updatePurchaseOrder(id, fields) {
  const { data, error } = await supabase.from('purchase_orders').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}
export async function deletePurchaseOrder(id) {
  const { error } = await supabase.from('purchase_orders').delete().eq('id', id);
  if (error) throw error;
}
