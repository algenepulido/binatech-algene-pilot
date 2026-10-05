// ============================================================
// Supplier invoices — the data behind the Invoice Readiness Engine and the
// Supplier Portal. A supplier/subcontractor submits an invoice with its
// required documents; the readiness engine checks completeness and routes
// it. Scoped to the open project. Degrades gracefully if the table doesn't
// exist yet (returns [] so the screens show clearly-labelled sample data).
// ============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentProjectId } from '../lib/currentProject.js';
import { REQUIRED_DOCS } from '../data/documents.js';

function missing(error) {
  const m = (error?.message || '').toLowerCase();
  return error?.code === '42P01' || (m.includes('does not exist') && m.includes('supplier_invoices'));
}

/** Derive a readiness status from the attached docs + PO reference. */
export function deriveStatus({ inv_type, po_ref, docs = {} }) {
  const required = REQUIRED_DOCS[inv_type] || [];
  const needsPo = required.includes('po');
  if (needsPo && !po_ref && !docs.po) return 'Blocked'; // missing PO reference
  const allComplete = required.every((d) => docs[d]);
  return allComplete ? 'Ready for Accounting' : 'Pending Docs';
}

export async function listSupplierInvoices(projectId = getCurrentProjectId()) {
  try {
    const { data, error } = await supabase
      .from('supplier_invoices')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) { if (missing(error)) return []; throw error; }
    return data ?? [];
  } catch (e) { if (missing(e)) return []; throw e; }
}

async function nextNumber(projectId) {
  const year = new Date().getFullYear();
  const { count } = await supabase.from('supplier_invoices').select('*', { count: 'exact', head: true }).eq('project_id', projectId);
  return `SI-${year}-${100 + ((count || 0) + 1)}`;
}

export async function createSupplierInvoice(fields, projectId = getCurrentProjectId()) {
  const net = Number(fields.net_amount || 0);
  const payload = {
    project_id: projectId,
    si_number: fields.si_number || (await nextNumber(projectId)),
    vendor_id: fields.vendor_id || null,
    vendor_name: fields.vendor_name || null,
    inv_type: fields.inv_type || 'permanent',
    po_ref: (fields.po_ref || '').trim() || null,
    invoice_number: (fields.invoice_number || '').trim() || null,
    net_amount: net,
    vat: fields.vat != null ? Number(fields.vat) : Math.round(net * 0.15),
    docs: fields.docs || {},
    exception_note: fields.exception_note || null,
    approver: fields.approver || null,
    status: fields.status || deriveStatus({ inv_type: fields.inv_type, po_ref: fields.po_ref, docs: fields.docs }),
    submitted_date: fields.submitted_date || new Date().toISOString().slice(0, 10),
  };
  const { data, error } = await supabase.from('supplier_invoices').insert(payload).select().single();
  if (error) throw error;
  return data;
}

/** Set an invoice's category (additive). Graceful: no-op-ish if the column
 *  isn't migrated yet, so existing invoice behavior never breaks. */
export async function updateSupplierInvoiceCategory(id, category) {
  const { error } = await supabase.from('supplier_invoices').update({ category: category || null }).eq('id', id);
  if (error && !/category|column/i.test(error.message || '')) throw error;
}

export async function updateSupplierInvoiceStatus(id, status) {
  const { data, error } = await supabase.from('supplier_invoices').update({ status }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

/** Normalise a DB row to the shape the cards/portal expect. */
export function toCard(row) {
  const submitted = row.submitted_date || (row.created_at || '').slice(0, 10);
  const ageDays = submitted ? Math.max(0, Math.round((Date.now() - new Date(submitted).getTime()) / 86400000)) : 0;
  return {
    id: row.si_number || row.invoice_number || row.id,
    rowId: row.id,
    vendor: row.vendor_id,
    vendorName: row.vendor_name,
    type: row.inv_type,
    category: row.category || null,
    poRef: row.po_ref,
    qty: row.qty != null ? Number(row.qty) : null,
    amount: Number(row.net_amount || 0),
    vat: Number(row.vat || 0),
    submitted,
    ageDays,
    status: row.status,
    docs: row.docs || {},
    exceptionNote: row.exception_note,
    approver: row.approver,
    // Returns / resubmission / booked (additive — null/0 until migrated).
    returnReason: row.return_reason || null,
    requiredCorrection: row.required_correction || null,
    returnedBy: row.returned_by || null,
    returnedAt: row.returned_at || null,
    resubmittedAt: row.resubmitted_at || null,
    resubmissionCount: row.resubmission_count != null ? Number(row.resubmission_count) : 0,
    bookedAt: row.booked_at || null,
    approvedAt: row.approved_at || null,
    live: true,
  };
}

// Additive write helpers. Each strips the new fields and retries if the
// procurement_returns migration hasn't run, so existing behavior never breaks.
const RETURN_FIELDS = ['return_reason', 'required_correction', 'returned_by', 'returned_at', 'resubmitted_at', 'resubmission_count', 'booked_at'];
async function updateGraceful(id, patch) {
  const { error } = await supabase.from('supplier_invoices').update(patch).eq('id', id);
  if (!error) return;
  const msg = (error.message || '').toLowerCase();
  if (RETURN_FIELDS.some((f) => msg.includes(f)) || msg.includes('column')) {
    const stripped = { ...patch };
    for (const f of RETURN_FIELDS) delete stripped[f];
    if (Object.keys(stripped).length === 0) return; // nothing left to persist pre-migration
    const { error: e2 } = await supabase.from('supplier_invoices').update(stripped).eq('id', id);
    if (e2) throw e2;
    return;
  }
  throw error;
}

/** Return a package to the supplier with written comments + required correction. */
export async function returnToSupplier(id, { reason, correction } = {}) {
  // returned_by / returned_at are SERVER-stamped by the
  // supplier_invoices_return_provenance trigger (migration 000029) — client
  // values are discarded, so sending them would only imply the client is
  // trusted with actor attribution. It is not.
  await updateGraceful(id, {
    status: 'Returned to Supplier',
    return_reason: (reason || '').trim() || null,
    required_correction: (correction || '').trim() || null,
  });
}

/** Supplier resubmits a returned package — records the resubmission, clears the active return. */
export async function resubmitInvoice(id, { count = 0 } = {}) {
  await updateGraceful(id, {
    status: 'Pending Docs',
    resubmitted_at: new Date().toISOString(),
    resubmission_count: Number(count || 0) + 1,
  });
}

/** Mark a package booked (posted to accounting) — terminal state. */
export async function bookInvoice(id) {
  await updateGraceful(id, { status: 'Booked', booked_at: new Date().toISOString() });
}
