// ============================================================
// invoice_wir_links — an ADDITIVE, parallel evidence link between client/
// supplier invoices and the WIRs that prove the billed work. This is separate
// from the element->BOQ->IPC certification computation and never affects it.
// Degrades gracefully (returns [] / no-ops) if the table doesn't exist yet.
// ============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentProjectId } from '../lib/currentProject.js';

const missing = (e) => !!e && (e.code === '42P01' || /relation|does not exist|invoice_wir_links/i.test(e.message || ''));

/** All invoice<->WIR links in the current project. */
export async function listInvoiceWirLinks(projectId = getCurrentProjectId()) {
  const { data, error } = await supabase.from('invoice_wir_links').select('*').eq('project_id', projectId);
  if (error) { if (missing(error)) return []; throw error; }
  return data ?? [];
}

/** WIR ids linked to one invoice. */
export async function listWirsForInvoice(invoiceId) {
  const { data, error } = await supabase.from('invoice_wir_links').select('wir_id').eq('invoice_id', invoiceId);
  if (error) { if (missing(error)) return []; throw error; }
  return (data ?? []).map((r) => r.wir_id);
}

/** Invoice ids linked to one WIR. */
export async function listInvoicesForWir(wirId) {
  const { data, error } = await supabase.from('invoice_wir_links').select('invoice_id').eq('wir_id', wirId);
  if (error) { if (missing(error)) return []; throw error; }
  return (data ?? []).map((r) => r.invoice_id);
}

export async function linkInvoiceWir(invoiceId, wirId) {
  const { error } = await supabase.from('invoice_wir_links').insert({ project_id: getCurrentProjectId(), invoice_id: invoiceId, wir_id: wirId });
  if (error && !/duplicate|unique/i.test(error.message || '')) {
    if (missing(error)) throw new Error('Link table isn’t set up yet — run the invoice_wir_links SQL.');
    throw error;
  }
}

export async function unlinkInvoiceWir(invoiceId, wirId) {
  const { error } = await supabase.from('invoice_wir_links').delete().eq('invoice_id', invoiceId).eq('wir_id', wirId);
  if (error && !missing(error)) throw error;
}
