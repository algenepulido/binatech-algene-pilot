// ============================================================
// commercialAdvisoryEngine — READ-ONLY deterministic commercial advisories for
// the BinaTech certification money chain (WIR → BOQ → Evidence → Certification →
// IPC Readiness → IPC → Invoice / Etimad → Payment).
//
// SAFETY INVARIANT: this engine ONLY analyses available data and FLAGS / explains
// / recommends. It NEVER certifies a quantity, approves an IPC, closes an NCR,
// approves a variation, submits an Etimad claim, releases retention, issues an
// invoice, or moves money. Any advisory whose recommended action is value-moving
// carries requiresHumanApproval: true. It powers the advisory banner, the
// Commercial-Advisor chatbot fallback, and dashboard alerts.
//
// Honesty rule: when the data needed for a check is NOT loaded, the engine does
// NOT claim "no blockers" — it records the check as INCOMPLETE so the UI can say
// "some checks may be incomplete because <module> has missing data".
// ============================================================
import { fmt } from './format.js';
import { detectActionIntent, actionLabel } from './changeProposal.js';

export const SEVERITY_RANK = { info: 0, warning: 1, blocker: 2, critical: 3 };

const A = (o) => ({ requiresHumanApproval: false, linkedEntityType: null, linkedEntityId: null, recommendedAction: '', ...o });

/**
 * Run the deterministic advisories over whatever context is available.
 * ctx (all optional — missing data → incomplete check, never a false "all clear"):
 *   project: { isGovernmentProject }
 *   route, counts: { openNcrs, openWirs }, finance: { certifiable, blockedValue, certifiedIpc, approvedValue, readyNotInvoiced }
 *   boqItems: [{ id, code, description, qty, approved_qty }], wirs: [{ boq_item_id, element_guid, status }]
 *   guidsByBoq: { [boqId]: Set<guid> }, ipcLines, measurementSheets, materialEvidence,
 *   ipcs, invoices, etimadClaims, subClaims, auditEvents, article109TargetDays
 * @returns {{ advisories: object[], incomplete: string[] }}
 */
export function runAdvisories(ctx = {}) {
  const out = [];
  const incomplete = [];
  const boq = ctx.boqItems;
  const wirs = ctx.wirs;
  const guidsByBoq = ctx.guidsByBoq || {};

  // Rules 1 + 2 — per-line WIR linkage + over-claim (need BOQ + WIR data).
  if (Array.isArray(boq) && Array.isArray(wirs)) {
    boq.forEach((b) => {
      const claimed = Number(b.qty || 0);
      const approvedWir = Math.max(0, Number(b.approved_qty || 0));
      const guids = guidsByBoq[b.id];
      const lineWirs = wirs.filter((w) => w && (w.boq_item_id === b.id || (w.element_guid && guids && guids.has && guids.has(w.element_guid))));
      const hasApprovedWir = approvedWir > 0 || lineWirs.some((w) => /approv|pass|closed/i.test(w.status || ''));
      if (claimed > 0 && !hasApprovedWir) {
        out.push(A({ id: `wir-missing-${b.id}`, severity: 'blocker', category: 'WIR',
          title: 'Claimed quantity has no approved WIR support',
          message: `BOQ ${b.code || b.id} — claimed ${fmt(claimed)} with no approved WIR.`,
          linkedEntityType: 'boq', linkedEntityId: b.id,
          recommendedAction: 'Raise/approve a WIR for this line before it can be certified.' }));
      }
      const over = claimed - approvedWir;
      if (approvedWir > 0 && over > 0.001) {
        out.push(A({ id: `overclaim-${b.id}`, severity: 'blocker', category: 'BOQ',
          title: 'Claimed quantity exceeds approved WIR quantity',
          message: `BOQ ${b.code || b.id} — claimed ${fmt(claimed)} vs approved WIR ${fmt(approvedWir)}; ${fmt(over)} blocked.`,
          linkedEntityType: 'boq', linkedEntityId: b.id, requiresHumanApproval: true,
          recommendedAction: 'Certify only up to the approved WIR quantity, or approve a further WIR (human commercial approval).' }));
      }
    });
  } else {
    incomplete.push('WIR-linkage and over-claim checks need BOQ + WIR data (open the Dashboard, BOQ/Quantities, or Certification Queue).');
  }

  // Rule 4 — open NCRs block certification (works from counts).
  if (ctx.counts && ctx.counts.openNcrs != null) {
    if (ctx.counts.openNcrs > 0) {
      const atRisk = ctx.finance && ctx.finance.blockedValue > 0 ? ` — SAR ${fmt(ctx.finance.blockedValue)} at risk` : '';
      out.push(A({ id: 'ncr-open', severity: 'blocker', category: 'NCR',
        title: 'Open NCR prevents certification',
        message: `${ctx.counts.openNcrs} open NCR(s)${atRisk}.`,
        linkedEntityType: 'ncr', requiresHumanApproval: true,
        recommendedAction: 'Resolve and close the NCRs (named QA/QC + consultant approval) before certifying the affected scope.' }));
    }
  } else {
    incomplete.push('NCR-hold check needs NCR counts.');
  }

  // Rule 7 — certified but not invoiced (finance summary).
  if (ctx.finance && ctx.finance.readyNotInvoiced > 0) {
    out.push(A({ id: 'ready-not-invoiced', severity: 'warning', category: 'Invoice',
      title: 'Certified value has not been invoiced',
      message: `SAR ${fmt(ctx.finance.readyNotInvoiced)} certified but not yet invoiced.`,
      requiresHumanApproval: true,
      recommendedAction: 'Raise the client tax invoice for the certified value (named commercial approval).' }));
  }

  // Rules 3, 5, 6, 8, 9, 10, 11, 12 — record as incomplete when their data isn't loaded
  // (never assert "no blockers" for a check we couldn't run).
  if (!ctx.ipcLines) incomplete.push('BOQ-cap check (cumulative certified vs original BOQ + approved variation) needs IPC line data.');
  if (!ctx.measurementSheets) incomplete.push('Measurement-evidence check needs Measurement Records.');
  if (!ctx.materialEvidence) incomplete.push('Material-evidence check (MIR/SDN) needs procurement data.');
  if (!ctx.invoices) incomplete.push('VAT-base check (gross before retention) needs invoice data.');
  if (ctx.project && ctx.project.isGovernmentProject && !ctx.etimadClaims) incomplete.push('Etimad submission + Article-109 timeline checks need the Etimad Tracker.');
  if (!ctx.subClaims) incomplete.push('Subcontractor over-claim check needs subcontractor claim data.');
  if (!ctx.auditEvents) incomplete.push('Audit-trail completeness check needs the Audit Log.');

  out.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  return { advisories: out, incomplete };
}

/** Compact summary for the page advisory panel + dashboard alerts. */
export function advisorySummary(result, ctx = {}) {
  const advisories = (result && result.advisories) || [];
  const incomplete = (result && result.incomplete) || [];
  const blockers = advisories.filter((a) => a.severity === 'blocker' || a.severity === 'critical');
  const warnings = advisories.filter((a) => a.severity === 'warning');
  const blockedValue = ctx.finance && ctx.finance.blockedValue;
  return {
    blockerCount: blockers.length,
    warningCount: warnings.length,
    topBlockers: blockers.slice(0, 3),
    blockedValue: blockedValue > 0 ? blockedValue : null,
    nextAction: blockers[0]?.recommendedAction || warnings[0]?.recommendedAction || 'Records look clear — human commercial review is still required before certification or payment.',
    incomplete,
    clean: blockers.length === 0 && warnings.length === 0,
  };
}

// ── Chatbot deterministic fallback (Mode B) ───────────────────────────────────
// Value-moving asks the AI must REFUSE (it may only prepare a checklist).
const FORBIDDEN = /\b(certif(y|ies)|approv(e|es)|close[sd]?\s+(the\s+)?ncr|sign\s*off|release\s+retention|submit.*etimad|issue.*(invoice|certificate)|pay(ment)?\b|move\s+money|authoris|authoriz)/i;
const REFUSAL_EN = 'I can prepare a recommendation or checklist, but a named, authorised user must approve this action. BinaTech AI is advisory only — it never certifies, approves, or moves money.';
const REFUSAL_AR = 'يمكنني إعداد توصية أو قائمة تحقّق، لكن يجب أن يعتمد هذا الإجراء مستخدمٌ مخوّل ومُسمّى. مساعد BinaTech استشاري فقط — لا يعتمد ولا يصرّح ولا يحرّك أي مبالغ.';

/** Hard client-side guard: does this request ask the AI to take a value-moving
 *  action it must never take? Used to refuse BEFORE any LLM call (Mode A too). */
export function isForbiddenRequest(q) {
  return FORBIDDEN.test(String(q || '').toLowerCase());
}

export const REFUSAL = { en: REFUSAL_EN, ar: REFUSAL_AR };

/**
 * Deterministic answer to a user question from project/page data + advisories.
 * Always returns a useful string (never "unavailable"). Safety-first: refuses
 * value-moving requests.
 */
export function answerQuestion(question, ctx = {}) {
  const ar = ctx.lang === 'ar';
  const q = String(question || '').toLowerCase();
  const { advisories, incomplete } = runAdvisories(ctx);
  const sum = advisorySummary({ advisories, incomplete }, ctx);
  const blockers = advisories.filter((a) => a.severity === 'blocker' || a.severity === 'critical');
  const line = (a) => `• ${a.title} — ${a.message}${a.linkedEntityId ? ` (${a.linkedEntityType}:${a.linkedEntityId})` : ''}`;
  const incompleteNote = incomplete.length
    ? `\n\nSome checks may be incomplete because data is missing:\n${incomplete.slice(0, 4).map((s) => `• ${s}`).join('\n')}`
    : '';

  // 1) Safety refusal — value-moving requests.
  if (FORBIDDEN.test(q)) return ar ? REFUSAL_AR : REFUSAL_EN;

  // 2) "What can AI do / approve?"
  if (/(what can (you|ai)|can you do|your role|are you allowed)/.test(q)) {
    return 'I advise, explain, summarise, check, flag, classify and prepare across the certification chain (WIR → BOQ → evidence → certification → IPC → invoice / Etimad → payment). I never certify quantities, approve IPCs or payments, close NCRs, approve variations, submit Etimad claims, release retention, issue invoices, or move money — those always require a named human approver.';
  }

  // 3) Blockers / why not ready.
  if (/(block|not ready|why.*(ready|sar 0|zero)|stopping|prevent)/.test(q)) {
    if (/sar\s*0|zero|commercial.?ready/.test(q)) {
      const certifiable = ctx.finance && ctx.finance.certifiable;
      if (!certifiable || certifiable <= 0) {
        return `Commercial-ready value is SAR 0 because no scope has cleared the certification checks yet.${blockers.length ? `\n\n${blockers.length} blocker(s):\n${blockers.slice(0, 5).map(line).join('\n')}` : ''}${incompleteNote}\n\nAdvisory only — human commercial review is required before certification or payment.`;
      }
    }
    if (blockers.length === 0) {
      return `No blockers detected from available records.${incompleteNote}\n\nHuman commercial review is still required before certification or payment.`;
    }
    return `${blockers.length} item(s) are blocked before certification:\n${blockers.slice(0, 6).map(line).join('\n')}${incompleteNote}\n\nAdvisory only — a named user must approve before certification or payment.`;
  }

  // 4) Over-claims.
  if (/overclaim|over-claim|exceeds|too much/.test(q)) {
    const over = advisories.filter((a) => a.id.startsWith('overclaim'));
    return over.length
      ? `Over-claimed lines (claimed > approved WIR):\n${over.map(line).join('\n')}\n\nCertify only up to the approved WIR quantity — a named user must approve.`
      : `No over-claims detected from available records.${incompleteNote}`;
  }

  // 5) Missing evidence / WIR.
  if (/(missing|no).*(evidence|wir|measurement|document)|evidence.*missing/.test(q)) {
    const miss = advisories.filter((a) => a.category === 'WIR' || /evidence/i.test(a.title));
    return miss.length
      ? `Lines missing approved evidence:\n${miss.map(line).join('\n')}${incompleteNote}`
      : `No missing-evidence blockers from available records.${incompleteNote}`;
  }

  // 6) Next action / what to add.
  if (/(what.*(do next|should i|add)|next step|recommend)/.test(q)) {
    return `Next: ${sum.nextAction}${incomplete.length ? `\n\nTo complete the checks, add data for:\n${incomplete.slice(0, 4).map((s) => `• ${s}`).join('\n')}` : ''}\n\nAdvisory only — approvals are a named-human step.`;
  }

  // 7) Explain IPC readiness / this page.
  if (/(ipc readiness|explain|readiness|this page|what (is|does) (ipc|certif|readiness|this))/.test(q)) {
    return 'IPC readiness means a BOQ line can move to a payment certificate: it has an approved WIR, the claim is within the approved WIR quantity, supporting evidence is attached, no open NCR affects it, and retention/advance/VAT are computed. BinaTech checks these and flags blockers — but a named user must certify. Advisory only.';
  }

  // 8) Which items are ready.
  if (/(ready|certif).*(item|line|boq)|which.*ready/.test(q)) {
    const certifiable = ctx.finance && ctx.finance.certifiable;
    return certifiable > 0
      ? `Approximately SAR ${fmt(certifiable)} of scope has cleared the available checks and is ready for human commercial review.${incompleteNote}`
      : `No lines have cleared the available certification checks yet.${incompleteNote}`;
  }

  // 9) Professional fallback — never make the panel feel broken.
  return ar
    ? 'يمكنني المساعدة في بيانات مشروع BinaTech وجاهزية الاعتماد والأدلة وجدول الكميات وشهادات الدفع والفواتير والمدفوعات وتتبّع اعتماد والمعوّقات. اختر مجالًا استشاريًا أو اطرح سؤالًا متعلقًا بالمشروع.'
    : 'I can help with BinaTech project data, certification readiness, evidence, BOQ, IPCs, invoices, payments, Etimad tracking, and blockers. Choose an advisory area or ask a project-related question.';
}

// Page-specific suggested prompts for the Commercial Advisor chatbot.
export function suggestedPrompts(route) {
  const P = {
    commercialhub: ['What is blocking IPC readiness?', 'Which BOQ items are ready to certify?', 'Which evidence is missing?', 'What needs human approval?'],
    qs: ['Which BOQ items are overclaimed?', 'Show quantity balance issues.', 'Explain previous vs current certified quantity.'],
    wirs: ['Which WIRs support commercial claims?', 'Which WIRs are pending?', 'Which approved WIRs are not linked to BOQ?'],
    ncrs: ['Which NCRs block certification?', 'Which BOQ items are affected by open NCRs?'],
    evidence: ['Which IPC lines are missing evidence?', 'Which evidence is unlinked?'],
    etimad: ['Which claims are delayed?', 'What is missing before Etimad submission?'],
    dashboard: ['What is blocking certification?', 'What should I do next?', 'What can AI do here?'],
  };
  return P[route] || P.dashboard;
}

// ── Mini-panel page name + guided Advisory-Area → Question catalog ──
const PAGE_NAMES = {
  dashboard: 'Dashboard', home: 'Projects', commercialhub: 'Commercial readiness',
  qs: 'BOQ / Quantities', wirs: 'WIRs / QC', qc: 'QC tests', ncrs: 'NCR holds',
  evidence: 'Evidence register', ipcs: 'IPCs', invoices: 'Client invoices',
  etimad: 'Etimad tracker', certqueue: 'Certification Queue', 'ai-advisor': 'AI Workspace',
};
export function pageName(route) { return PAGE_NAMES[route] || route; }

export const ADVISORY_AREAS = [
  { id: 'current', label: 'Current Page' }, { id: 'certqueue', label: 'Certification Queue' },
  { id: 'wirs', label: 'WIRs / QC' }, { id: 'ncrs', label: 'NCR Holds' },
  { id: 'evidence', label: 'Evidence Register' }, { id: 'boq', label: 'BOQ / Quantities' },
  { id: 'measurement', label: 'Measurement Records' }, { id: 'ipc_readiness', label: 'IPC Readiness' },
  { id: 'ipcs', label: 'IPCs' }, { id: 'invoices', label: 'Client Invoices' },
  { id: 'paytrack', label: 'Payment Tracking' }, { id: 'etimad', label: 'Etimad / Government' },
  { id: 'subcontractors', label: 'Subcontractors' }, { id: 'procurement', label: 'Procurement' },
  { id: 'audit', label: 'Audit / History' }, { id: 'other', label: 'Other' },
];

const AREA_QUESTIONS = {
  certqueue: ['What is blocking certification?', 'Which lines are ready to certify?', 'Which lines are over-claimed?'],
  wirs: ['Which WIRs support commercial claims?', 'Which WIRs are pending?', 'Which approved WIRs are not linked to BOQ?'],
  ncrs: ['Which NCRs block certification?', 'Which BOQ items are affected by open NCRs?'],
  evidence: ['Which IPC lines are missing evidence?', 'Which evidence is unlinked?'],
  boq: ['Which BOQ items are over-claimed?', 'Show quantity balance issues.', 'Which items need variation approval?'],
  measurement: ['Which claims are missing a measurement sheet?'],
  ipc_readiness: ['What is blocking IPC readiness?', 'Which BOQ items are ready to certify?', 'What needs human approval?'],
  ipcs: ['What is the certified vs claimed value?', 'What can AI do here?'],
  invoices: ['Is the invoice value derived from certified value?', 'Flag VAT / retention issues.'],
  paytrack: ['Which payments are outstanding?'],
  etimad: ['Which claims are delayed?', 'What is missing before Etimad submission?'],
  subcontractors: ['Which sub claims exceed certified quantity?'],
  procurement: ['Which materials lack a MIR / SDN?'],
  audit: ['What value-moving actions were recorded?'],
};

/** Questions for an advisory area. 'current' → the page's prompts; 'other' → none
 *  (the UI reveals free-text). Changing the area changes the question list. */
export function areaQuestions(areaId, route = 'dashboard') {
  if (!areaId || areaId === 'current') return suggestedPrompts(route);
  if (areaId === 'other') return [];
  return AREA_QUESTIONS[areaId] || [];
}

// ── Ask-mode answer WITH action buttons (intent routing + data-aware responses) ──
const AREA_ROUTE = { evidence: 'evidence', boq: 'qs', measurement: 'measurement', ipc_readiness: 'certqueue', etimad: 'etimad', subcontractors: 'subcontracts', certqueue: 'certqueue', wirs: 'qc', ncrs: 'ncrs', invoices: 'invoices', paytrack: 'paytrack' };
const AREA_LABEL = { evidence: 'Evidence Register', boq: 'BOQ / Quantities', measurement: 'Measurement Records', ipc_readiness: 'IPC Readiness', etimad: 'Etimad / Government', subcontractors: 'Subcontractors' };

/**
 * Returns { text, actions } where actions are [{ label, route?|switchTo?, area?, action? }].
 * A valid BinaTech workflow intent ("add something to the evidence register") is routed
 * to Draft Change — NOT answered with a generic fallback. Non-BinaTech questions get the
 * professional fallback (no actions).
 */
export function answerWithActions(q, ctx = {}) {
  const ar = ctx.lang === 'ar';
  if (isForbiddenRequest(q)) return { text: ar ? REFUSAL.ar : REFUSAL.en, actions: [] };

  const intent = detectActionIntent(q);
  if (intent && !intent.forbidden) {
    const areaLbl = AREA_LABEL[intent.area] || intent.area;
    return {
      text: `I can help prepare a ${intent.label} draft. Switch to Prepare change → ${areaLbl} → ${actionLabel(intent.action)}, or open ${areaLbl} to do it manually.`,
      actions: [
        { label: `Prepare ${intent.label} draft`, switchTo: 'draft', area: intent.area, action: intent.action },
        { label: `Open ${areaLbl}`, route: AREA_ROUTE[intent.area] },
      ],
    };
  }

  const lower = String(q || '').toLowerCase();
  if (/measurement.*(missing|evidence)|missing.*measurement/.test(lower)) {
    return { text: 'Measurement evidence cannot be fully assessed because no measurement records are linked to this project/page. Add or link measurement sheets, joint measurement records, or BOQ measurement references before IPC readiness can confirm this check.',
      actions: [{ label: 'Open Measurement Records', route: 'measurement' }, { label: 'Prepare missing evidence request', switchTo: 'draft', area: 'evidence', action: 'evidence_missing_request' }] };
  }
  if (/overclaim|over-claim|exceed/.test(lower) && /boq|line|quantit/.test(lower)) {
    return { text: 'Overclaim checks require BOQ claimed quantity, approved WIR quantity, and certified quantity. Open BOQ / Quantities or the Certification Queue to review the available lines and their blocked quantity.',
      actions: [{ label: 'Open BOQ / Quantities', route: 'qs' }, { label: 'Open Certification Queue', route: 'certqueue' }] };
  }

  const text = answerQuestion(q, ctx);
  const isFallback = /I can help with BinaTech project data/.test(text);
  const route = ctx.currentPage?.route || ctx.route;
  const actions = (isFallback || !route) ? [] : [{ label: `Open ${pageName(route)}`, route }];
  return { text, actions };
}
