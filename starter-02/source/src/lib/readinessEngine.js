// ============================================================
// SHARED READINESS ENGINE — the single source of truth for "is this invoice
// package payable, and if not, who owns the next step?". Every procurement
// surface (Invoice Readiness board, Supplier Portal, POs page) evaluates a
// package through evaluatePackage() so the state is computed once, consistently.
//
// It COMPOSES the existing pieces — never replaces them:
//   • threePillars()        → commitment / proof / invoice (category-aware)
//   • computeInvoiceChain() → the PO/DN/WIR evidence + 3-way qty match
// and layers on approvals, discrepancy, returned-with-comments, and the canonical
// package state. Pure + read-only: it NEVER touches the certification chain
// (certified = Σ(approved_qty × rate), contract ≥ certified, over/over_mapped = 0)
// and never writes — callers persist explicit user actions (return, resubmit,
// book) separately.
// ============================================================
import { threePillars } from './invoiceReadiness.js';

// Canonical package states (the acceptance state machine). Derived, never stored.
export const PACKAGE_STATES = {
  draft:                { key: 'draft',                label: 'Draft',                color: '#78716c', bg: '#f5f5f4' },
  missing_docs:         { key: 'missing_docs',         label: 'Missing Docs',         color: '#b45309', bg: '#fef3c7' },
  pending_approval:     { key: 'pending_approval',     label: 'Pending Approval',     color: '#2563eb', bg: '#dbeafe' },
  discrepancy:          { key: 'discrepancy',          label: 'Discrepancy',          color: '#b91c1c', bg: '#fee2e2' },
  returned:             { key: 'returned',             label: 'Returned to Supplier', color: '#9333ea', bg: '#f3e8ff' },
  ready_for_accounting: { key: 'ready_for_accounting', label: 'Ready for Accounting', color: '#15803d', bg: '#dcfce7' },
  booked:               { key: 'booked',               label: 'Booked',               color: '#0f766e', bg: '#ccfbf1' },
};

export const PACKAGE_STATE_ORDER = ['draft', 'missing_docs', 'returned', 'discrepancy', 'pending_approval', 'ready_for_accounting', 'booked'];

const isBookedStatus = (s) => /\b(paid|booked|posted)\b/i.test(String(s || ''));
const isApprovalDoneStatus = (s) => /(ready for accounting|in accounting|paid|booked|posted)/i.test(String(s || ''));

// A return is "active" until a later resubmission supersedes it.
function returnedState(si) {
  const at = si?.returnedAt || null;
  const reason = si?.returnReason || null;
  const resubmittedAt = si?.resubmittedAt || null;
  const superseded = at && resubmittedAt && new Date(resubmittedAt) >= new Date(at);
  return {
    is: !!(at || reason) && !superseded,
    reason,
    correction: si?.requiredCorrection || null,
    by: si?.returnedBy || null,
    at,
    resubmittedAt,
    count: Number(si?.resubmissionCount || 0),
  };
}

/**
 * Evaluate one invoice package.
 * @param si    invoice card (from toCard): { category, type, docs, status, approver, ageDays, returnedAt, ... }
 * @param chain computeInvoiceChain(si, proc) — may be null
 * @returns {
 *   category,
 *   commitment, proof, invoice,           // each { label, ok, detail }
 *   approvals: { complete, pending, detail },
 *   discrepancy: { present, kind, msg },  // kind: 'over' | 'short' | null
 *   returned:   { is, reason, correction, by, at, resubmittedAt, count },
 *   ready, held,
 *   state, stateMeta,                     // canonical state + its label/colors
 *   nextOwner, daysWaiting, missing[]
 * }
 */
export function evaluatePackage(si, chain) {
  const tp = threePillars(si, chain);

  const returned = returnedState(si);

  const q = chain?.qty;
  const discPresent = q?.state === 'over' || q?.state === 'short';
  const discrepancy = { present: discPresent, kind: discPresent ? q.state : null, msg: discPresent ? q.msg : null };

  const pillarsReady = tp.commitment.ok && tp.proof.ok && tp.invoice.ok;
  const approvalsComplete = isApprovalDoneStatus(si?.status) || !!si?.approvedAt;
  const approvals = {
    complete: approvalsComplete,
    pending: pillarsReady && !approvalsComplete && !returned.is,
    detail: approvalsComplete ? 'Approvals complete' : (si?.approver ? `Awaiting ${si.approver}` : 'Awaiting approval'),
  };

  const booked = isBookedStatus(si?.status) || !!si?.bookedAt;

  // Canonical state — strict priority. Booked is terminal; an active return or a
  // real discrepancy outranks "ready" so nothing books over an open issue.
  let state;
  if (booked) state = 'booked';
  else if (returned.is) state = 'returned';
  else if (!tp.invoice.ok && !tp.commitment.ok && !tp.proof.ok) state = 'draft';
  else if (!pillarsReady) state = 'missing_docs';
  else if (discrepancy.present) state = 'discrepancy';
  else if (!approvals.complete) state = 'pending_approval';
  else state = 'ready_for_accounting';

  const nextOwner = {
    draft: 'Supplier',
    missing_docs: 'Supplier',
    returned: 'Supplier',
    discrepancy: 'Procurement / QS',
    pending_approval: si?.approver || 'Approver',
    ready_for_accounting: 'Accounting / AP',
    booked: '—',
  }[state];

  const missing = [...(tp.missing || [])];
  if (discrepancy.present) missing.push(discrepancy.msg);

  return {
    category: tp.category,
    commitment: tp.commitment,
    proof: tp.proof,
    invoice: tp.invoice,
    approvals,
    discrepancy,
    returned,
    ready: state === 'ready_for_accounting',
    held: tp.held,
    state,
    stateMeta: PACKAGE_STATES[state],
    nextOwner,
    daysWaiting: si?.ageDays ?? 0,
    missing,
  };
}
