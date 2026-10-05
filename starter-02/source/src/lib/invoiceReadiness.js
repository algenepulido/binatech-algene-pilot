// ============================================================
// Three-pillar invoice readiness (category-aware). Per the contractor's payment
// standard, an invoice is payable only when its CATEGORY's three pillars are
// present: (1) Commitment (the contract: PO / agreement / subcontract),
// (2) Proof of completion (the category-specific document: Delivery Note / IPC /
// Certificate of Progress / Approved Timesheet), and (3) the Invoice itself.
//
// Pure logic. Reuses the existing evidence chain (lib/invoiceChain.js: PO /
// delivery / work) + the invoice's docs jsonb. Never touches the certification
// chain. "held" = commitment + invoice present but proof not yet recorded (the
// real "held in a folder pending proof" state).
// ============================================================
import { CATEGORY_REQUIREMENTS, categoryForType } from '../data/documents.js';

// Map a category's proof requirement to an ok/detail signal from chain + docs.
function proofSignal(source, docs, chain) {
  switch (source) {
    case 'delivery':
      return chain?.delivery?.ok
        ? { ok: true, detail: 'Delivery Note recorded + confirmed' }
        : { ok: !!(docs.signedDn || docs.sdn), detail: (docs.signedDn || docs.sdn) ? 'DN attached' : 'DN not yet recorded' };
    case 'paymentCert':
      return (docs.paymentCert || chain?.work?.ok)
        ? { ok: true, detail: docs.paymentCert ? 'IPC / payment certificate attached' : 'Work proven (WIR approved)' }
        : { ok: false, detail: 'IPC / payment certificate not yet certified' };
    case 'serviceApproval':
      return { ok: !!docs.paymentCertOrServiceApproval, detail: docs.paymentCertOrServiceApproval ? 'Certificate of Progress attached' : 'Certificate of Progress not recorded' };
    case 'timesheet':
      return { ok: !!docs.timesheet, detail: docs.timesheet ? 'Approved timesheet attached' : 'Approved timesheet not recorded' };
    default:
      return { ok: true, detail: 'N/A' };
  }
}

/**
 * @param si    invoice card ({ category, type, docs, ... })
 * @param chain output of computeInvoiceChain(si, proc)
 * @returns { category, commitment, proof, invoice, ready, held, missing[] }
 *          each pillar = { label, ok, detail }
 */
export function threePillars(si, chain) {
  const docs = si?.docs || {};
  const category = si?.category || categoryForType(si?.type);
  const req = CATEGORY_REQUIREMENTS[category] || CATEGORY_REQUIREMENTS.Materials;

  const commitmentOk = !!chain?.po?.ok || !!docs[req.commitmentDocKey];
  const commitment = { label: req.commitment, ok: commitmentOk, detail: chain?.po?.note || (commitmentOk ? `${req.commitment} on file` : `${req.commitment} not linked`) };

  const ps = proofSignal(req.proofSource, docs, chain);
  const proof = { label: req.proof, ok: ps.ok, detail: ps.detail };

  const invoiceOk = !!(docs.supplierInvoice || docs.invoice);
  const invoice = { label: 'Invoice', ok: invoiceOk, detail: invoiceOk ? 'Invoice document attached' : 'Invoice document not attached' };

  const ready = commitment.ok && proof.ok && invoice.ok;
  const held = commitment.ok && invoice.ok && !proof.ok; // waiting on the completion document
  const missing = [];
  if (!commitment.ok) missing.push(req.commitment);
  if (!proof.ok) missing.push(req.proof);
  if (!invoice.ok) missing.push('Invoice');

  return { category, commitment, proof, invoice, ready, held, missing };
}
