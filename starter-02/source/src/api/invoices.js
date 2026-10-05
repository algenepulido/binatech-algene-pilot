// ============================================================
// Invoice register (client / ZATCA) data access.
// ============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentProjectId } from "../lib/currentProject.js";

export const ZATCA_STATUSES = ['Awaiting IPC', 'Reported', 'Cleared', 'Rejected'];
export const PAYMENT_STATUSES = ['Not Issued', 'Pending', 'Paid', 'Overdue'];

export async function listInvoices(projectId = getCurrentProjectId()) {
  const { data, error } = await supabase.from('invoices').select('*').eq('project_id', projectId).order('issue_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
// Strip the additive link columns and retry if they don't exist yet, so
// invoices keep working before the (additive) migration is run.
const LINK_COLS = ['element_guid', 'wir_number'];
const stripLinks = (f) => { const r = { ...f }; LINK_COLS.forEach((k) => delete r[k]); return r; };
const isLinkColErr = (e) => /element_guid|wir_number|column/i.test(e?.message || '');

export async function createInvoice(fields) {
  let res = await supabase.from('invoices').insert({ project_id: getCurrentProjectId(), ...fields }).select().single();
  if (res.error && isLinkColErr(res.error)) res = await supabase.from('invoices').insert({ project_id: getCurrentProjectId(), ...stripLinks(fields) }).select().single();
  if (res.error) throw res.error;
  return res.data;
}
export async function updateInvoice(id, fields) {
  let res = await supabase.from('invoices').update(fields).eq('id', id).select().single();
  if (res.error && isLinkColErr(res.error)) res = await supabase.from('invoices').update(stripLinks(fields)).eq('id', id).select().single();
  if (res.error) throw res.error;
  return res.data;
}
export async function deleteInvoice(id) {
  const { error } = await supabase.from('invoices').delete().eq('id', id);
  if (error) throw error;
}
