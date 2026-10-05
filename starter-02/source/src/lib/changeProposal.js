// ============================================================
// changeProposal — the controlled AI Change Assistant engine.
//
// The AI may DRAFT, suggest, prepare, classify and calculate. It must NEVER
// directly approve, certify, submit, release, or move money — and it must never
// mutate a table directly. This module turns a request into a structured PROPOSAL
// that is previewed, validated, role-checked, human-confirmed and audited before
// anything is applied. It is pure (no DB, no side effects) so it is fully testable;
// the actual apply goes through the existing role-gated API + an audit record.
//
// Three modes the UI drives:
//   Ask           — read-only answers (commercialAdvisoryEngine.answerQuestion)
//   Draft Change  — buildProposal(...) returns a draft proposal (NEVER applies)
//   Apply Approved— canApplyProposal(...) must pass, then the API applies + audits
// ============================================================

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round2 = (n) => Math.round(n * 100) / 100;

// ── Forbidden AI actions (the AI refuses to draft or apply these) ──
export const FORBIDDEN_AI_ACTIONS = [
  'approve_wir', 'close_ncr', 'certify_quantity', 'approve_ipc', 'approve_invoice',
  'release_retention', 'submit_etimad', 'mark_paid', 'edit_locked_certified',
  'change_certified_value', 'bypass_roles',
];
const FORBIDDEN_RE = /\b(certif(y|ies|ication)?|approv(e|es|al)?|close[sd]?\s+(the\s+)?ncr|release\s+retention|submit.*etimad|mark.*paid|set.*paid|move\s+money|release\s+payment)\b/i;

export function isForbiddenAiAction(input) {
  if (!input) return false;
  const s = String(input).toLowerCase();
  if (FORBIDDEN_AI_ACTIONS.includes(s)) return true;
  return FORBIDDEN_RE.test(s);
}

export const REFUSAL_MESSAGE =
  'I can prepare a recommendation or a draft proposal, but I can’t approve, certify, submit, release, or move money — a named, authorised user must confirm those actions. BinaTech AI is advisory only.';

// ── Supported Draft-Change action types per advisory area (UI dropdowns) ──
// SUPPORTED draft actions only — every action here produces a structured draft
// preview. No "soon"/unbuilt options are listed. Unsupported actions are simply
// absent (the UI never shows a disabled-but-selectable option).
export const ACTION_CATALOG = {
  evidence: { label: 'Evidence Register', actions: [
    { type: 'evidence_entry_draft', label: 'Prepare evidence entry draft' },
    { type: 'evidence_link_proposal', label: 'Prepare evidence link proposal' },
    { type: 'evidence_missing_request', label: 'Prepare missing evidence request' },
  ] },
  boq: { label: 'BOQ / Quantities', actions: [
    { type: 'boq_rate_adjustment', label: 'Prepare BOQ rate adjustment proposal' },
    { type: 'boq_quantity_correction', label: 'Prepare quantity correction proposal' },
    { type: 'boq_wir_linkage', label: 'Prepare BOQ/WIR linkage proposal' },
  ] },
  measurement: { label: 'Measurement Records', actions: [
    { type: 'measurement_record_draft', label: 'Prepare measurement record draft' },
    { type: 'measurement_joint_request', label: 'Prepare joint measurement request' },
    { type: 'measurement_mark_missing', label: 'Mark measurement evidence missing' },
  ] },
  ipc_readiness: { label: 'IPC Readiness', actions: [
    { type: 'ipc_blocker_list', label: 'Prepare IPC blocker list' },
    { type: 'ipc_submission_checklist', label: 'Prepare consultant submission checklist' },
    { type: 'ipc_carry_forward', label: 'Prepare carry-forward proposal' },
  ] },
  etimad: { label: 'Etimad / Government', actions: [
    { type: 'etimad_doc_checklist', label: 'Prepare Etimad document checklist' },
    { type: 'etimad_tracker_draft', label: 'Prepare manual claim tracker draft' },
  ] },
  subcontractors: { label: 'Subcontractors', actions: [
    { type: 'sub_claim_review', label: 'Prepare subcontractor claim review note' },
    { type: 'sub_backcharge', label: 'Prepare backcharge proposal' },
  ] },
};

// Per-action metadata for the generic structured draft (follow-up, approval, role,
// whether a target record is required, and the route to the related page).
const ACTION_META = {
  evidence_entry_draft: { followUp: 'Attach the document and link it to a WIR / BOQ / IPC line.', approval: false, role: 'qaqc', route: 'evidence' },
  evidence_link_proposal: { followUp: 'Confirm the target WIR / BOQ / IPC line to link.', approval: false, role: 'qs', route: 'evidence', needsTarget: true },
  evidence_missing_request: { followUp: 'Identify the BOQ line and the evidence type required.', approval: false, role: 'qs', route: 'evidence' },
  boq_quantity_correction: { followUp: 'Quantity corrections require approval before they affect certification.', approval: true, role: 'commercial', route: 'qs', needsTarget: true },
  boq_wir_linkage: { followUp: 'Confirm the WIR and BOQ line to link.', approval: false, role: 'qs', route: 'qs', needsTarget: true },
  measurement_record_draft: { followUp: 'Attach the measurement sheet and link the BOQ line/location.', approval: false, role: 'qs', route: 'measurement' },
  measurement_joint_request: { followUp: 'Nominate the consultant and date for joint measurement.', approval: false, role: 'qs', route: 'measurement' },
  measurement_mark_missing: { followUp: 'Link the BOQ item and measurement sheet.', approval: false, role: 'qs', route: 'measurement', needsTarget: true },
  // These three are about the CONTRACTOR's certification position, so they
  // belong in the Certification Queue. Route 'readiness' is the SUPPLIER
  // invoice readiness engine (procurement/AP) — a different domain entirely.
  ipc_blocker_list: { followUp: 'Review blockers before consultant submission.', approval: false, role: 'commercial', route: 'certqueue' },
  ipc_submission_checklist: { followUp: 'Complete the checklist before submitting to the consultant.', approval: false, role: 'commercial', route: 'certqueue' },
  ipc_carry_forward: { followUp: 'Blocked quantity carried to the next IPC period.', approval: true, role: 'commercial', route: 'certqueue' },
  etimad_doc_checklist: { followUp: 'Complete the document checklist before Etimad submission.', approval: false, role: 'finance', route: 'etimad' },
  etimad_tracker_draft: { followUp: 'Link the IPC and invoice; this is a manual tracker, not a live integration.', approval: false, role: 'finance', route: 'etimad' },
  sub_claim_review: { followUp: 'Cap certified quantity at min(claimed, site-approved, client-certified).', approval: false, role: 'commercial', route: 'subcontracts' },
  sub_backcharge: { followUp: 'Attach evidence; a backcharge needs approval before it reduces a payment.', approval: true, role: 'commercial', route: 'subcontracts' },
};

export function actionLabel(type) {
  for (const a of Object.values(ACTION_CATALOG)) { const m = a.actions.find((x) => x.type === type); if (m) return m.label; }
  return type;
}

const SUBMITTED_OR_CERTIFIED = /submit|certif|approv|paid|lock/i;
function ipcIsLocked(ipc) { return SUBMITTED_OR_CERTIFIED.test(String(ipc?.status || '')); }

/**
 * Build a BOQ rate-adjustment DRAFT proposal. Pure — computes the preview and
 * commercial impact, detects certified/locked impact, and NEVER mutates.
 */
export function buildBoqRateAdjustment({
  boqLines = [], targetCodes = null, multiplier, percentage, reason,
  requestedBy = null, projectId = null, pageContext = 'boq', ipcs = [], proposalId = null,
}) {
  const factor = multiplier != null ? num(multiplier) : (percentage != null ? 1 + num(percentage) / 100 : null);
  // resolve targets (by code; null/'all' = every line)
  const wanted = targetCodes && targetCodes.length && !/^all$/i.test(String(targetCodes))
    ? (Array.isArray(targetCodes) ? targetCodes : [targetCodes]).map((c) => String(c).trim())
    : null;
  const targets = (boqLines || []).filter((b) => !wanted || wanted.includes(String(b.code)));

  const affected_records = [];
  const before_values = [];
  const after_values = [];
  let contractImpact = 0, certifiedImpact = 0;
  for (const b of targets) {
    const oldRate = num(b.rate);
    const newRate = factor != null ? round2(oldRate * factor) : oldRate;
    affected_records.push({ id: b.id, code: b.code, description: b.description, qty: num(b.qty), approved_qty: num(b.approved_qty) });
    before_values.push({ id: b.id, code: b.code, rate: oldRate });
    after_values.push({ id: b.id, code: b.code, rate: newRate });
    contractImpact += (newRate - oldRate) * num(b.qty);
    certifiedImpact += (newRate - oldRate) * num(b.approved_qty);
  }

  // Certified/locked detection: IPCs are summary rows (no ipc_lines), so any
  // submitted/certified IPC in the project means historical certified value is
  // locked — the rate change cannot mutate it (must be prospective / variation).
  const lockedIpcs = (ipcs || []).filter(ipcIsLocked).map((i) => ({ id: i.id, ipc_number: i.ipc_number, status: i.status, gross_amount: i.gross_amount }));
  const draftIpcs = (ipcs || []).filter((i) => !ipcIsLocked(i)).map((i) => ({ id: i.id, ipc_number: i.ipc_number, status: i.status }));
  const affects_certified = lockedIpcs.length > 0;

  const validation = validateProposalFields({ reason, factor, targetsCount: targets.length });
  const blocked_reasons = [];
  if (affects_certified) {
    blocked_reasons.push('Historical certified values are locked: this project has submitted/certified IPC(s). The rate change must apply prospectively only and requires a variation / corrective-certificate workflow — it cannot mutate certified records.');
  }
  blocked_reasons.push(...validation.blocked_reasons);

  return {
    id: proposalId || `boq_rate_adjustment:${(wanted || ['all']).join(',')}:${factor}`,
    type: 'boq_rate_adjustment',
    project_id: projectId,
    page_context: pageContext,
    requested_by: requestedBy,
    target_scope: { boq_codes: wanted || 'all', count: targets.length },
    proposed_changes: { multiplier: factor, reason: reason || null },
    affected_records,
    before_values,
    after_values,
    calculated_impact: {
      contract_value_delta: round2(contractImpact),
      certified_value_delta: round2(certifiedImpact),
      total_commercial_impact: round2(contractImpact),
    },
    affected_future_claims: draftIpcs,
    affected_certified_ipcs: lockedIpcs,
    historical_certified_locked: affects_certified,
    applies_prospectively_only: affects_certified,
    requires_variation_workflow: affects_certified,
    validation_results: validation.validation_results,
    blocked_reasons,
    required_role: 'commercial',           // Commercial Manager (admin also allowed)
    approval_required: true,
    audit_required: true,
    status: affects_certified ? 'requires_variation' : (validation.ok ? 'draft' : 'invalid'),
  };
}

function validateProposalFields({ reason, factor, targetsCount }) {
  const validation_results = [];
  const blocked_reasons = [];
  const need = (ok, msg) => { validation_results.push({ check: msg, ok }); if (!ok) blocked_reasons.push(msg); };
  need(!!(reason && String(reason).trim()), 'A reason is required.');
  need(factor != null && factor > 0, 'A valid multiplier or percentage is required.');
  need(targetsCount > 0, 'At least one matching BOQ line is required.');
  return { ok: blocked_reasons.length === 0, validation_results, blocked_reasons };
}

/** Re-validate any proposal (used before showing Apply + before applying). */
export function validateProposal(p) {
  const blocked = [...(p?.blocked_reasons || [])];
  return { ok: blocked.length === 0 && (p?.status === 'draft' || p?.status === 'approved'), blocked_reasons: blocked };
}

/**
 * Decide whether the Apply button may act. Requires: not forbidden, validation
 * passes, records not locked, the user holds the required role, and a human
 * approval is present. Returns { canApply, reasons }.
 */
export function canApplyProposal(p, { role = null, hasApproval = false } = {}) {
  const reasons = [];
  if (!p) return { canApply: false, reasons: ['No proposal.'] };
  if (isForbiddenAiAction(p.type)) reasons.push('Action is forbidden for AI.');
  if (p.historical_certified_locked) reasons.push('Affected records are locked (certified).');
  if ((p.blocked_reasons || []).length) reasons.push('Validation/blockers not cleared.');
  const allowedRoles = [p.required_role, 'admin'].filter(Boolean);
  if (!role || !allowedRoles.includes(role)) reasons.push(`Requires role: ${allowedRoles.join(' or ')}.`);
  if (p.approval_required && !hasApproval) reasons.push('Human approval is required.');
  return { canApply: reasons.length === 0, reasons };
}

/**
 * Build the audit events for an applied proposal (one per affected record).
 * Caller supplies user/role/approvalId/timestamp; the table write is the API's job.
 */
export function buildAuditEvents(p, { user, role, approvalId, timestamp }) {
  return (p.affected_records || []).map((rec, i) => ({
    user, role,
    project: p.project_id,
    entity_type: 'boq_item',
    entity_id: rec.id,
    action_type: p.type,
    before_value: p.before_values?.[i]?.rate ?? null,
    after_value: p.after_values?.[i]?.rate ?? null,
    reason: p.proposed_changes?.reason ?? null,
    ai_proposal_id: p.id,
    approval_id: approvalId ?? null,
    timestamp: timestamp ?? null,
  }));
}

// ── Light deterministic instruction parser (Draft-Change free text) ──
// e.g. "Multiply all rates of BOQ item 03.14.220 by 1.1 due to inflation"
export function parseInstruction(text) {
  if (!text) return null;
  const s = String(text);
  if (isForbiddenAiAction(s)) return { forbidden: true };
  const mult = s.match(/by\s+(\d+(?:\.\d+)?)/i);
  const pct = s.match(/(\d+(?:\.\d+)?)\s*%/);
  const code = s.match(/\b(\d{2}\.\d{2}\.\d{3}|[A-Z]?\d{2,}[\.\-]\d+[\.\-]?\d*)\b/);
  const isRate = /\brate/i.test(s) && /(multipl|increase|adjust|by|inflation|×|x\s|\*)/i.test(s);
  if (!isRate) return null;
  const reason = /inflation/i.test(s) ? 'Inflation adjustment' : (s.match(/due to\s+(.+)$/i)?.[1]?.trim() || null);
  return {
    area: 'boq', action: 'boq_rate_adjustment',
    targetCodes: code ? [code[1]] : (/\ball\b/i.test(s) ? 'all' : null),
    multiplier: mult ? Number(mult[1]) : null,
    percentage: pct ? Number(pct[1]) : null,
    reason,
  };
}

// ── Generic structured draft (every supported non-rate action) ──
export function buildDraft(actionType, params = {}) {
  if (actionType === 'boq_rate_adjustment') return buildBoqRateAdjustment(params);
  const meta = ACTION_META[actionType] || { followUp: '—', approval: false, role: 'qs', route: null };
  const { project = null, projectId = null, pageContext = null, reason = null, target = null } = params;
  const needsTarget = !!meta.needsTarget && !target;
  return {
    id: `${actionType}:${target || 'page'}`,
    type: actionType,
    title: actionLabel(actionType),
    project_id: projectId,
    page_context: pageContext,
    requested_by: params.requestedBy || null,
    target_scope: { target: target || (pageContext ? 'current page' : null) },
    proposed_changes: { reason: reason || null },
    affected_records: [],
    fields: {
      Type: actionLabel(actionType),
      Project: project || '—',
      Page: pageContext || '—',
      Target: target || 'current page',
      Reason: reason || '—',
      'Required follow-up': meta.followUp,
      'Approval required': meta.approval ? 'Yes' : 'No (unless attached to a certification decision)',
      'Audit required if applied': 'Yes',
    },
    required_role: meta.role,
    relatedRoute: meta.route,
    approval_required: meta.approval,
    audit_required: true,
    needsTargetContext: needsTarget,
    blocked_reasons: needsTarget ? ['Select a target BOQ item / record first.'] : [],
    validation_results: [{ check: 'reason provided', ok: !!(reason && String(reason).trim()) }],
    status: 'draft',
  };
}

// ── Workflow-intent detection (route a valid request to Draft Change, not fallback) ──
const INTENT_AREAS = [
  { area: 'evidence', re: /evidence/i, action: 'evidence_entry_draft', label: 'evidence entry' },
  { area: 'measurement', re: /measurement|joint measure/i, action: 'measurement_record_draft', label: 'measurement record' },
  { area: 'boq', re: /\bboq\b|bill of quantit|\brate\b|quantity/i, action: 'boq_rate_adjustment', label: 'BOQ change' },
  { area: 'ipc_readiness', re: /readiness|blocker|carry.?forward/i, action: 'ipc_blocker_list', label: 'IPC blocker list' },
  { area: 'etimad', re: /etimad|government claim/i, action: 'etimad_doc_checklist', label: 'Etimad checklist' },
  { area: 'subcontractors', re: /subcontract|backcharge/i, action: 'sub_claim_review', label: 'subcontractor review' },
];
export function detectActionIntent(text) {
  const s = String(text || '');
  if (isForbiddenAiAction(s)) return { forbidden: true };
  if (!/\b(add|create|new|prepare|draft|link|request|mark|adjust|multiply|increase|generate|change)\b/i.test(s)) return null;
  for (const a of INTENT_AREAS) { if (a.re.test(s)) return { area: a.area, action: a.action, label: a.label }; }
  return null;
}
