// ============================================================
// controlRoom — pure, READ-ONLY derivation for the Certification Control Room.
// The central operating view for the commercial certification workflow: what is
// ready to certify, what is blocked, why, who owns the blocker, and what can be
// recovered before the next IPC.
//
// FRONTEND DISPLAY ONLY. Nothing here certifies, writes, or derives certified
// truth — certified quantity remains the stored boq_items.approved_qty written
// by the existing engine (recertify), and real enforcement is backend Gate 1
// (the backend owner's lane). Owner / next-action / target-IPC have NO data
// model yet: they are DERIVED SUGGESTIONS from the blocker reason (same idiom
// as ipaReconciliationData REASON_CODES) and are labelled as derived in the UI.
// ============================================================
import { lineReadiness } from './boqReadiness.js';
import { isBoqLineItem } from '../api/boqItems.js';

// ── Required product copy (asserted by tests — keep byte-exact).
export const CONTROL_ROOM_TAGLINE = 'Turn approved site progress into certified payment value.';
export const CONTROL_ROOM_EVIDENCE_TAGLINE = 'Connect inspection evidence to payment certification.';
export const CONTROL_ROOM_BOUNDARY = 'Certification Control Room is display/readiness only until backend Gate 1 enforcement is connected.';

const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

// ── Blocker taxonomy. `owner`/`action` are derived defaults (no owner field
// exists in the schema yet); `bucket` feeds the recovery forecast.
//   this_week — internal, fast (attach files);  next_ipc — internal, one cycle
//   (raise WIR / close NCR);  external — outside contractor control (consultant
//   approval court);  write_off — non-claimable without a variation.
// `inCertifiable: true` marks risk flags whose value lives INSIDE certifiable
// value — they appear as actions/flags but are EXCLUDED from the recovery
// forecast, which must stay a partition of blocked + overclaim money (adding
// them would double count against "Ready to certify").
export const BLOCKER_META = {
  NCR_HOLD:         { label: 'NCR hold', labelAr: 'معلّق بمخالفة', owner: 'QA/QC', action: 'Close NCR & verify rework', actionAr: 'أغلق المخالفة وتحقق من الإصلاح', bucket: 'next_ipc', color: 'var(--sc-danger)', soft: 'var(--sc-danger-bg)' },
  OVERCLAIM:        { label: 'Overclaim above contract', labelAr: 'مطالبة فوق العقد', owner: 'Commercial', action: 'Claim ruling — split claimable vs excess', actionAr: 'قرار تجاري — افصل القابل للمطالبة عن الزائد', bucket: 'write_off', color: 'var(--sc-ink-2)', soft: 'var(--sc-surface-2)' },
  WIR_PENDING:      { label: 'WIR awaiting approval', labelAr: 'فحص بانتظار الاعتماد', owner: 'Consultant', action: 'Approve / return submitted WIRs', actionAr: 'اعتمد أو أعد طلبات الفحص المقدمة', bucket: 'external', color: 'var(--sc-action)', soft: 'var(--sc-action-bg)' },
  MISSING_WIR:      { label: 'No WIR coverage', labelAr: 'بدون تغطية فحص', owner: 'QA/QC', action: 'Raise WIR for executed scope', actionAr: 'ارفع طلب فحص للأعمال المنفذة', bucket: 'next_ipc', color: 'var(--sc-warning)', soft: 'var(--sc-warning-bg)' },
  MISSING_EVIDENCE: { label: 'Evidence gap', labelAr: 'فجوة أدلة', owner: 'QA/QC', action: 'Compile & attach evidence pack', actionAr: 'اجمع وأرفق حزمة الأدلة', bucket: 'this_week', color: '#7c3aed', soft: '#ede9fe', inCertifiable: true },
  REVIEW_ANOMALY:   { label: 'Measurement review', labelAr: 'مراجعة قياس', owner: 'QS', action: 'Re-measure; reconcile certifiable vs claimed', actionAr: 'أعد القياس وطابق القابل للاعتماد مع المُطالب به', bucket: 'next_ipc', color: '#115e59', soft: '#ccfbf1', inCertifiable: true },
};

/** Localized label/action for a blocker key. */
export const blockerLabel = (key, lang) => (lang === 'ar' ? BLOCKER_META[key]?.labelAr : BLOCKER_META[key]?.label) || key;
export const blockerAction = (key, lang) => (lang === 'ar' ? BLOCKER_META[key]?.actionAr : BLOCKER_META[key]?.action) || '';

// Priority when several blockers tie on value (severity, commercial view).
const BLOCKER_PRIORITY = ['NCR_HOLD', 'OVERCLAIM', 'WIR_PENDING', 'MISSING_WIR', 'MISSING_EVIDENCE', 'REVIEW_ANOMALY'];

export const READINESS_META = {
  ready:   { label: 'Ready',         labelAr: 'جاهز',          color: '#15803d', soft: '#dcfce7' },
  partial: { label: 'Partial-ready', labelAr: 'جاهز جزئياً',   color: 'var(--sc-warning)', soft: 'var(--sc-warning-bg)' },
  blocked: { label: 'Blocked',       labelAr: 'موقوف',         color: 'var(--sc-danger)', soft: 'var(--sc-danger-bg)' },
  review:  { label: 'Review needed', labelAr: 'يتطلب مراجعة',  color: '#7c3aed', soft: '#ede9fe' },
  idle:    { label: 'Not started',   labelAr: 'لم يبدأ',       color: 'var(--sc-faint)', soft: 'var(--sc-surface-2)' },
};
export const readinessLabel = (key, lang) => (lang === 'ar' ? READINESS_META[key]?.labelAr : READINESS_META[key]?.label) || key;

export const RECOVERY_META = {
  this_week: { label: 'Recoverable this week', labelAr: 'قابل للاسترداد هذا الأسبوع', color: '#0d9488' },
  next_ipc:  { label: 'Recoverable next IPC',  labelAr: 'قابل للاسترداد بالمستخلص القادم', color: '#15803d' },
  external:  { label: 'Blocked external',      labelAr: 'موقوف خارجياً', color: 'var(--sc-warning)' },
  write_off: { label: 'Write-off / non-claimable', labelAr: 'شطب / غير قابل للمطالبة', color: 'var(--sc-ink-2)' },
};
export const recoveryLabel = (key, lang) => (lang === 'ar' ? RECOVERY_META[key]?.labelAr : RECOVERY_META[key]?.label) || key;

// The six owner lanes of the action board, in board order.
export const OWNER_GROUPS = ['QS', 'QA/QC', 'Commercial', 'Consultant', 'Procurement', 'Client'];
export const OWNER_LABELS_AR = { QS: 'حصر الكميات', 'QA/QC': 'الجودة', Commercial: 'التجاري', Consultant: 'الاستشاري', Procurement: 'المشتريات', Client: 'العميل' };
export const ownerLabel = (owner, lang) => (lang === 'ar' ? OWNER_LABELS_AR[owner] : owner) || owner;

// NCR statuses that no longer hold certification (shared with the drawer so
// the panel count and the drawer list can never drift).
export const NCR_CLOSED = ['closed', 'cleared', 'resolved', 'void', 'cancelled', 'verified'];

/** Quantity a WIR asserts (its claim), in the line's unit. Explicit approved_qty
 *  first (the takeoff total writes into it), then the claimed scope_qty. */
export function wirClaimQty(w) {
  for (const f of ['approved_qty', 'scope_qty']) {
    const v = w?.[f];
    if (v != null && v !== '' && !isNaN(Number(v))) return Number(v);
  }
  return 0;
}

const isApproved = (w) => /approv/i.test(String(w?.result || ''));
const isRejected = (w) => /reject/i.test(String(w?.result || ''));

/** WIR → BoQ-line attribution, mirroring the certification engine (recertify):
 *  direct wirs.boq_item_id first, else via the element link when the element
 *  maps to exactly ONE line (ambiguous mappings are never guessed). */
export function indexWirsByLine(wirs = [], boqItems = [], linksByBoq = {}) {
  const boqIds = new Set(boqItems.map((b) => b.id));
  const linesByGuid = {};
  for (const [boqId, guids] of Object.entries(linksByBoq)) {
    guids.forEach((g) => { (linesByGuid[g] = linesByGuid[g] || new Set()).add(boqId); });
  }
  const byLine = {};
  for (const w of wirs) {
    let target = null;
    if (w.boq_item_id && boqIds.has(w.boq_item_id)) target = w.boq_item_id;
    else if (w.element_guid && linesByGuid[w.element_guid]?.size === 1) target = [...linesByGuid[w.element_guid]][0];
    if (target) (byLine[target] = byLine[target] || []).push(w);
  }
  return byLine;
}

/** "IPC-06 (next)" from the existing certificates; falls back to "Next IPC". */
export function nextIpcLabel(ipcs = []) {
  let max = 0;
  for (const p of ipcs) {
    const m = String(p.ipc_number || '').match(/(\d+)\s*$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max > 0 ? `IPC-${String(max + 1).padStart(2, '0')}` : 'Next IPC';
}

function targetIpcFor(bucket, next) {
  if (bucket === 'write_off') return '—';
  if (bucket === 'external') return `${next} +1`;
  return next; // this_week / next_ipc → recover into the next certificate
}

/**
 * Derive the whole Control Room from real read-only data.
 * All inputs are plain data; nothing is written anywhere.
 *  - certifiable value = stored approved_qty capped at contract (same figure QS
 *    and Commercial Readiness show — this view never invents a second engine).
 *  - evidence gap is a risk flag WITHIN certifiable value (approved WIRs with
 *    no attachment on record) — counted once, never added to blocked value.
 *  - wirAttachCounts === null means the attachment index could not be loaded:
 *    evidence status is UNKNOWN, so no gap is derived (never guess a gap).
 */
export function deriveControlRoom({ boqItems = [], linksByBoq = {}, statusMap = {}, wirs = [], ncrs = [], ipcs = [], wirAttachCounts = {} } = {}) {
  const evidenceUnknown = wirAttachCounts == null;
  const attachCounts = wirAttachCounts || {};
  const wirsByLine = indexWirsByLine(wirs, boqItems, linksByBoq);
  const nextIpc = nextIpcLabel(ipcs);
  const lines = [];

  for (const b of boqItems) {
    if (!isBoqLineItem(b)) continue;
    const r = lineReadiness(b, linksByBoq, statusMap);
    const rate = r.rate;
    const lineWirs = wirsByLine[b.id] || [];

    // Quantity decomposition (line units, then × rate). Chain-capped so the
    // buckets partition the contract qty and can never double count.
    const claimedQty = r2(lineWirs.reduce((s, w) => s + (isRejected(w) ? 0 : wirClaimQty(w)), 0));
    const approvedQty = r.approvedQty;                                  // capped, stored
    const ncrQty = r2(Math.min(r.blockedQty, Math.max(0, r.contractQty - approvedQty)));
    const pendingRaw = r2(lineWirs.filter((w) => !isApproved(w) && !isRejected(w)).reduce((s, w) => s + wirClaimQty(w), 0));
    const room = Math.max(0, r.contractQty - approvedQty - ncrQty);
    const pendingQty = r2(Math.min(pendingRaw, room));
    // Mapped scope with no WIR coverage — the remainder of LINKED lines. Two
    // honest exclusions: unlinked lines with nothing proven are "not started",
    // and a linked line with NO WIRs whose linked elements are ALL not-started
    // is simply unexecuted scope — future work, not a blocker to chase.
    const guids = linksByBoq[b.id];
    const allNotStarted = lineWirs.length === 0 && !!guids && [...guids].every((g) => {
      const k = statusMap[g]?.key; return !k || k === 'not_started';
    });
    const missingWirQty = (r.linkedCount > 0 && !allNotStarted) ? r2(Math.max(0, r.contractQty - approvedQty - ncrQty - pendingQty)) : 0;
    const overclaimQty = r2(Math.max(0, claimedQty - r.contractQty));

    // Evidence gap: approved-WIR quantity with NO attachment on record — a risk
    // flag inside certifiable value (a consultant will bounce it), never blocked.
    // If the attachment index failed to load, evidence is UNKNOWN — derive no gap.
    const evidenceGapRaw = evidenceUnknown ? 0
      : r2(lineWirs.filter((w) => isApproved(w) && !(attachCounts[w.id] > 0)).reduce((s, w) => s + wirClaimQty(w), 0));
    const evidenceGapQty = r2(Math.min(evidenceGapRaw, approvedQty));

    // Stored certifiable exceeding what WIRs claim = a measurement anomaly for QS.
    const anomaly = approvedQty > claimedQty + 0.01 && lineWirs.length > 0;

    const v = {
      contract: r2(r.value),
      claimed: r2(claimedQty * rate),
      certifiable: r2(approvedQty * rate),
      ncr: r2(ncrQty * rate),
      pending: r2(pendingQty * rate),
      missingWir: r2(missingWirQty * rate),
      overclaim: r2(overclaimQty * rate),
      evidenceGap: r2(evidenceGapQty * rate),
    };
    const blockedValue = r2(v.ncr + v.pending + v.missingWir);

    const blockers = [];
    if (v.ncr > 0.5) blockers.push({ reason: 'NCR_HOLD', value: v.ncr });
    if (v.overclaim > 0.5) blockers.push({ reason: 'OVERCLAIM', value: v.overclaim });
    if (v.pending > 0.5) blockers.push({ reason: 'WIR_PENDING', value: v.pending });
    if (v.missingWir > 0.5) blockers.push({ reason: 'MISSING_WIR', value: v.missingWir });
    if (v.evidenceGap > 0.5) blockers.push({ reason: 'MISSING_EVIDENCE', value: v.evidenceGap });
    if (anomaly) blockers.push({ reason: 'REVIEW_ANOMALY', value: r2(Math.max(0, (approvedQty - claimedQty) * rate)) });
    blockers.sort((a, c) => (c.value - a.value) || (BLOCKER_PRIORITY.indexOf(a.reason) - BLOCKER_PRIORITY.indexOf(c.reason)));

    // Readiness class. review > ready > partial > blocked > idle.
    let cls;
    if (v.overclaim > 0.5 || anomaly) cls = 'review';
    else if (v.certifiable > 0.5 && blockedValue < 0.5 && v.evidenceGap < 0.5) cls = 'ready';
    else if (v.certifiable > 0.5) cls = 'partial';
    else if (blockedValue > 0.5) cls = 'blocked';
    else cls = 'idle';

    const primary = blockers[0] || null;
    const meta = primary ? BLOCKER_META[primary.reason] : null;
    lines.push({
      id: b.id, code: b.code || '—', description: b.description || '', unit: b.unit || '',
      contractQty: r.contractQty, approvedQty, linkedCount: r.linkedCount,
      values: v, blockedValue, blockers, cls,
      wirs: lineWirs,
      // Derived suggestions (labelled in the UI — no owner/action/target field exists yet).
      owner: meta?.owner || null,
      nextAction: meta?.action || null,
      targetIpc: meta ? targetIpcFor(meta.bucket, nextIpc) : null,
    });
  }
  lines.sort((a, b) => b.blockedValue - a.blockedValue || b.values.contract - a.values.contract);

  // ── KPI strip. "Ready to certify" = certifiable value NOT already carried
  // into a certified/paid certificate (header-level deduction — the current
  // IPC model has no per-line snapshot, so this is the honest project-level
  // figure, same as Commercial Readiness "ready, not invoiced").
  const sum = (fn) => r2(lines.reduce((s, l) => s + fn(l), 0));
  const certifiableTotal = sum((l) => l.values.certifiable);
  const certifiedInIpc = r2(ipcs.filter((p) => p.status === 'certified' || p.status === 'paid')
    .reduce((s, p) => s + (Number(p.gross_amount) || 0), 0));
  const kpis = {
    readyToCertify: Math.max(0, r2(certifiableTotal - certifiedInIpc)),
    certifiableTotal, certifiedInIpc,
    blockedValue: sum((l) => l.blockedValue),
    missingWir: sum((l) => l.values.missingWir),
    missingEvidence: sum((l) => l.values.evidenceGap),
    ncrHold: sum((l) => l.values.ncr),
    overclaim: sum((l) => l.values.overclaim),
    recoverableNextIpc: 0, // filled from the forecast below
    evidenceUnknown,
  };

  // ── Recovery forecast (bucket = derived from blocker type; display-only).
  // STRICT PARTITION of blocked + overclaim money: risk flags whose value sits
  // inside certifiable (evidence gap, measurement anomaly) are actions, not
  // recoverable money — adding them would double count "Ready to certify".
  const recovery = { this_week: 0, next_ipc: 0, external: 0, write_off: 0 };
  for (const l of lines) for (const bl of l.blockers) {
    const meta = BLOCKER_META[bl.reason];
    if (!meta || meta.inCertifiable) continue;
    recovery[meta.bucket] = r2(recovery[meta.bucket] + bl.value);
  }
  kpis.recoverableNextIpc = r2(recovery.this_week + recovery.next_ipc);

  // ── Owner action board (derived owners; Procurement/Client filled honestly below).
  const board = Object.fromEntries(OWNER_GROUPS.map((g) => [g, { owner: g, value: 0, items: [] }]));
  for (const l of lines) for (const bl of l.blockers) {
    const meta = BLOCKER_META[bl.reason];
    const lane = board[meta?.owner];
    if (!lane) continue;
    lane.value = r2(lane.value + bl.value);
    lane.items.push({ lineId: l.id, code: l.code, reason: bl.reason, value: bl.value, action: meta.action });
  }
  for (const g of OWNER_GROUPS) board[g].items.sort((a, b) => b.value - a.value);
  // Client lane: certified certificates awaiting payment (real, from ipcs).
  // Descriptive status, NOT an action verb — this surface never implies paying.
  const certifiedUnpaid = r2(ipcs.filter((p) => p.status === 'certified').reduce((s, p) => s + (Number(p.gross_amount) || 0), 0));
  if (certifiedUnpaid > 0.5) {
    board.Client.value = certifiedUnpaid;
    board.Client.items.push({ lineId: null, code: 'IPC', reason: null, value: certifiedUnpaid, action: 'Certified certificates awaiting payment', actionAr: 'شهادات معتمدة بانتظار الدفع' });
  }

  // ── Evidence gap panel. MIR + drawing links have no module/data yet → demo
  // rows. Counts are LINES carrying the gap (consistent with the values, which
  // are per-line derived — never a project-wide record count).
  const evidencePanel = [
    { key: 'missing_wir',      label: 'Missing WIR',            value: kpis.missingWir,      count: lines.filter((l) => l.values.missingWir > 0.5).length, demo: false },
    evidenceUnknown
      ? { key: 'missing_photo', label: 'Missing photo evidence', value: 0, count: 0, demo: false, unknown: true, hint: 'evidence index unavailable — status unknown' }
      : { key: 'missing_photo', label: 'Missing photo evidence', value: kpis.missingEvidence, count: lines.filter((l) => l.values.evidenceGap > 0.5).length, demo: false, hint: 'approved WIRs with no file attached' },
    { key: 'missing_mir',      label: 'Missing MIR',            value: 0, count: 0, demo: true,  hint: 'material approvals module not live' },
    { key: 'missing_drawing',  label: 'Missing drawing',        value: 0, count: 0, demo: true,  hint: 'BoQ ↔ drawing linkage not live' },
    { key: 'ncr_clearance',    label: 'Missing NCR clearance',  value: kpis.ncrHold, count: lines.filter((l) => l.values.ncr > 0.5).length, demo: false },
  ];

  const counts = { ready: 0, partial: 0, blocked: 0, review: 0, idle: 0 };
  for (const l of lines) counts[l.cls]++;

  return { lines, kpis, recovery, board, evidencePanel, counts, nextIpc };
}

// ============================================================
// Synthetic demo dataset — used ONLY when the project has no BoQ data (or
// Supabase is unconfigured), always behind a loud "synthetic demo data" banner.
// Runs through the SAME deriveControlRoom() so demo mode exercises real code.
// All figures invented; no real project values.
// ============================================================
export function demoControlRoomInputs() {
  const boqItems = [
    { id: 'd1', code: '03.10.055', description: 'Deck slab concrete C40 — link S2', unit: 'm3', qty: 420, rate: 980, approved_qty: 300 },
    { id: 'd2', code: '02.55.030', description: 'MSE wall panels — east run',      unit: 'm2', qty: 1600, rate: 310, approved_qty: 900 },
    { id: 'd3', code: '03.44.220', description: 'Anti-carbonation coating P4–P6',  unit: 'm2', qty: 2400, rate: 45,  approved_qty: 0 },
    { id: 'd4', code: '05.60.010', description: 'Expansion joints — movement',     unit: 'm',  qty: 180, rate: 1450, approved_qty: 0 },
    { id: 'd5', code: '03.14.220', description: 'Concrete barrier — parapet',      unit: 'm',  qty: 620, rate: 520,  approved_qty: 620 },
    { id: 'd6', code: '02.30.040', description: 'Permeable backing — abutment A2', unit: 'm3', qty: 260, rate: 240,  approved_qty: 120 },
  ];
  const linksByBoq = { d1: new Set(['g1']), d2: new Set(['g2', 'g3']), d3: new Set(['g4']), d4: new Set(['g5']), d5: new Set(['g6']), d6: new Set(['g7']) };
  const statusMap = {
    g1: { key: 'approved', clear: true }, g2: { key: 'approved', clear: true }, g3: { key: 'ncr', clear: false },
    g4: { key: 'in_progress', clear: false }, g5: { key: 'not_started', clear: false },
    g6: { key: 'approved', clear: true }, g7: { key: 'approved', clear: true },
  };
  const wirs = [
    { id: 'w1', wir_number: 'WIR-2610', boq_item_id: 'd1', result: 'Approved', approved_qty: 300, element_guid: 'g1' },
    { id: 'w2', wir_number: 'WIR-2611', boq_item_id: 'd1', result: 'Pending',  approved_qty: 80,  element_guid: 'g1' },
    { id: 'w3', wir_number: 'WIR-2980', boq_item_id: 'd2', result: 'Approved', approved_qty: 900, element_guid: 'g2' },
    { id: 'w4', wir_number: 'WIR-3010', boq_item_id: 'd3', result: 'Pending',  approved_qty: 1400, element_guid: 'g4' },
    { id: 'w5', wir_number: 'WIR-2705', boq_item_id: 'd5', result: 'Approved', approved_qty: 620, element_guid: 'g6' },
    { id: 'w6', wir_number: 'WIR-2812', boq_item_id: 'd6', result: 'Approved', approved_qty: 300, element_guid: 'g7' },
  ];
  const ncrs = [{ id: 'n1', ncr_number: 'NCR-118', status: 'open', element_guid: 'g3', title: 'Panel alignment out of tolerance' }];
  const ipcs = [{ id: 'p1', ipc_number: 'IPC-05', status: 'certified', gross_amount: 1240000 }];
  const wirAttachCounts = { w1: 3, w5: 2, w6: 1 }; // w3 approved with no evidence (gap); w6 overclaims → review
  return { boqItems, linksByBoq, statusMap, wirs, ncrs, ipcs, wirAttachCounts };
}
