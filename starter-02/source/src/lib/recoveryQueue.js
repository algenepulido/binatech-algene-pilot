// ============================================================
// recoveryQueue — pure data + derivation for the Blocked Value / Recovery
// Queue: every riyal that is NOT becoming certified payment value, why it is
// stuck, who must act, and when it can be recovered.
//
// FRONTEND DISPLAY ONLY, DEMO/READINESS DATA. The reason-code / owner /
// disposition / target-IPC workflow has NO backend source yet (no fields, no
// module) — so the queue runs on SYNTHETIC rows behind the mandatory badge
// (RECOVERY_BADGE). Rules follow the ipaReconciliationData idiom:
//   • disposition is DERIVED from the reason code, never typed by hand;
//   • blocked qty/value are RECOMPUTED (claimed − certifiable), never trusted;
//   • certifiable can never exceed WIR-approved — violations route to Review;
//   • nothing here certifies, approves, pays, or writes commercial values.
// All figures are SYNTHETIC. No real project values are reproduced.
// ============================================================

// Mandatory badge (asserted by tests — keep byte-exact).
export const RECOVERY_BADGE = 'Demo/readiness data. Not backend-certified.';

const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

// ── The five dispositions (labels exactly as specified by the owner).
export const DISPOSITION_META = {
  recoverable_next_ipc: { label: 'Recoverable next IPC',              labelAr: 'قابل للاسترداد بالمستخلص القادم', color: '#15803d', soft: '#dcfce7', kind: 'recover' },
  recoverable_external: { label: 'Recoverable after external approval', labelAr: 'قابل للاسترداد بعد موافقة خارجية', color: '#b45309', soft: '#fef3c7', kind: 'recover' },
  blocked:              { label: 'Blocked',                            labelAr: 'موقوف',                       color: '#b91c1c', soft: '#fee2e2', kind: 'blocked' },
  write_off:            { label: 'Write-off',                          labelAr: 'شطب',                         color: '#475569', soft: '#f1f5f9', kind: 'writeoff' },
  review:               { label: 'Review',                             labelAr: 'مراجعة',                      color: '#7c3aed', soft: '#ede9fe', kind: 'review' },
};
export const dispositionLabel = (k, lang) => (lang === 'ar' ? DISPOSITION_META[k]?.labelAr : DISPOSITION_META[k]?.label) || k;

// ── Owner lanes → Arabic labels.
const OWNER_AR = { 'QA/QC': 'الجودة', Procurement: 'المشتريات', Commercial: 'التجاري', QS: 'حصر الكميات', Site: 'الموقع' };
export const ownerLabel = (owner, lang) => (lang === 'ar' ? (OWNER_AR[owner] || owner) : owner) || owner;

// ── The eleven canonical reason codes → derived disposition + default owner +
// required action, with Arabic mirrors. Owner/action are workflow DEFAULTS.
export const REASON_CODES = [
  { code: 'Missing WIR',                  codeAr: 'بدون طلب فحص',              disposition: 'recoverable_next_ipc', owner: 'QA/QC',       action: 'Raise WIR for executed scope',            actionAr: 'ارفع طلب فحص للأعمال المنفذة' },
  { code: 'WIR rejected/resubmission',    codeAr: 'فحص مرفوض/إعادة تقديم',      disposition: 'recoverable_next_ipc', owner: 'QA/QC',       action: 'Correct & resubmit WIR',                  actionAr: 'صحّح وأعد تقديم طلب الفحص' },
  { code: 'Missing evidence',             codeAr: 'أدلة ناقصة',                disposition: 'recoverable_next_ipc', owner: 'QA/QC',       action: 'Compile & attach evidence pack',          actionAr: 'اجمع وأرفق حزمة الأدلة' },
  { code: 'Material not approved',        codeAr: 'مواد غير معتمدة',            disposition: 'recoverable_external', owner: 'Procurement', action: 'Chase MIR / material approval',           actionAr: 'تابع اعتماد المواد' },
  { code: 'NCR hold',                     codeAr: 'معلّق بمخالفة',              disposition: 'blocked',              owner: 'QA/QC',       action: 'Close NCR & verify rework',               actionAr: 'أغلق المخالفة وتحقق من الإصلاح' },
  { code: 'Overclaim',                    codeAr: 'مطالبة زائدة',              disposition: 'review',               owner: 'QS',          action: 'Re-measure; split claimable vs excess',   actionAr: 'أعد القياس وافصل القابل للمطالبة عن الزائد' },
  { code: 'CO/VO pending',                codeAr: 'أمر تغيير معلّق',            disposition: 'recoverable_external', owner: 'Commercial',  action: 'Progress CO/VO approval',                 actionAr: 'تابع اعتماد أمر التغيير' },
  { code: 'In progress not certifiable',  codeAr: 'قيد التنفيذ غير معتمد',      disposition: 'blocked',              owner: 'Site',        action: 'Await completion; recheck next period',   actionAr: 'انتظر الإنجاز وأعد الفحص' },
  { code: 'Unclaimable quantity',         codeAr: 'كمية غير قابلة للمطالبة',    disposition: 'write_off',            owner: 'Commercial',  action: 'Remove from claim; record reason',        actionAr: 'أزل من المطالبة وسجّل السبب' },
  { code: 'Commercial review',            codeAr: 'مراجعة تجارية',              disposition: 'review',               owner: 'Commercial',  action: 'Commercial ruling on claimability',       actionAr: 'قرار تجاري بشأن القابلية للمطالبة' },
  { code: 'Procurement evidence missing', codeAr: 'أدلة مشتريات ناقصة',         disposition: 'recoverable_external', owner: 'Procurement', action: 'Obtain SDN / delivery evidence',          actionAr: 'احصل على إشعار التسليم' },
];
const REASON_BY_CODE = Object.fromEntries(REASON_CODES.map((x) => [x.code, x]));
export const reasonLabel = (code, lang) => (lang === 'ar' ? REASON_BY_CODE[code]?.codeAr : code) || code;

export const PRIORITY_META = {
  high:   { label: 'High',   labelAr: 'عالية',   color: '#b91c1c', soft: '#fee2e2', rank: 0 },
  medium: { label: 'Medium', labelAr: 'متوسطة',  color: '#b45309', soft: '#fef3c7', rank: 1 },
  low:    { label: 'Low',    labelAr: 'منخفضة',  color: '#475569', soft: '#f1f5f9', rank: 2 },
};
export const priorityLabel = (k, lang) => (lang === 'ar' ? PRIORITY_META[k]?.labelAr : PRIORITY_META[k]?.label) || k;

export const EVIDENCE_META = {
  complete: { label: 'Complete', labelAr: 'مكتمل', color: '#15803d' },
  partial:  { label: 'Partial',  labelAr: 'جزئي',  color: '#b45309' },
  missing:  { label: 'Missing',  labelAr: 'ناقص',  color: '#b91c1c' },
};
export const evidenceLabel = (k, lang) => (lang === 'ar' ? EVIDENCE_META[k]?.labelAr : EVIDENCE_META[k]?.label) || k;

/** Disposition is DERIVED from the reason code — with the integrity guard:
 *  certifiable claiming more than WIR-approved is a data problem → Review. */
export function dispositionFor(row) {
  if (Number(row.certifiableQty) > Number(row.wirApprovedQty) + 0.001) return 'review';
  return REASON_BY_CODE[row.reasonCode]?.disposition || 'review';
}

export const ownerForReason = (code) => REASON_BY_CODE[code]?.owner || 'Commercial';
export const actionForReason = (code) => REASON_BY_CODE[code]?.action || 'Commercial ruling required';
/** Localized required-action for a reason code. */
export const reasonAction = (code, lang) => (lang === 'ar' ? REASON_BY_CODE[code]?.actionAr : REASON_BY_CODE[code]?.action) || actionForReason(code);

/** Priority default: NCR/rejection always high; then by blocked value. */
export function priorityFor(row) {
  if (row.reasonCode === 'NCR hold' || row.reasonCode === 'WIR rejected/resubmission') return 'high';
  const v = Number(row.blockedValue) || 0;
  if (v >= 100000) return 'high';
  if (v >= 25000) return 'medium';
  return 'low';
}

/** Enrich a raw row: recompute blocked qty/value, derive disposition, owner,
 *  action and priority. Explicit row values win only where a human would have
 *  entered them (owner/action/priority overrides); money is always recomputed. */
export function enrichRow(row) {
  const claimedQty = r2(row.claimedQty);
  const wirApprovedQty = r2(row.wirApprovedQty);
  const certifiableQty = r2(row.certifiableQty);
  // Blocked qty is recomputed, never imported. Cap the certifiable figure at
  // WIR-approved: nothing can be certified beyond what an approved WIR proves,
  // so a row whose certifiable exceeds WIR-approved (the integrity-guard case,
  // → Review) must not understate its blocked value.
  const effectiveCertifiable = Math.min(certifiableQty, wirApprovedQty);
  const blockedQty = r2(Math.max(0, claimedQty - effectiveCertifiable));
  const blockedValue = r2(blockedQty * (Number(row.rate) || 0));
  const base = { ...row, claimedQty, wirApprovedQty, certifiableQty, blockedQty, blockedValue };
  const disposition = dispositionFor(base);
  return {
    ...base,
    disposition,
    owner: row.owner || ownerForReason(row.reasonCode),
    action: row.action || actionForReason(row.reasonCode),
    priority: row.priority || priorityFor(base),
    isBackendDerived: false,          // the trust boundary — always false here
  };
}

/** KPI rollups over enriched rows. */
export function computeKpis(rows) {
  const sum = (pred) => r2(rows.filter(pred).reduce((s, x) => s + x.blockedValue, 0));
  const total = sum(() => true);
  return {
    total,
    lines: rows.length,
    recoverableNextIpc: sum((x) => x.disposition === 'recoverable_next_ipc'),
    recoverableExternal: sum((x) => x.disposition === 'recoverable_external'),
    blocked: sum((x) => x.disposition === 'blocked'),
    writeOff: sum((x) => x.disposition === 'write_off'),
    review: sum((x) => x.disposition === 'review'),
  };
}

/** value-by-<key> chart data, sorted descending. */
export function valueBy(rows, key) {
  const m = {};
  for (const x of rows) {
    const k = x[key] || '—';
    if (!m[k]) m[k] = { key: k, value: 0, count: 0 };
    m[k].value = r2(m[k].value + x.blockedValue);
    m[k].count += 1;
  }
  return Object.values(m).sort((a, b) => b.value - a.value);
}

/** Filter helper for the queue UI. Every filter '' / 'all' means no filter. */
export function filterRows(rows, { reason = 'all', disposition = 'all', owner = 'all', priority = 'all', q = '' } = {}) {
  const needle = q.trim().toLowerCase();
  return rows.filter((x) =>
    (reason === 'all' || x.reasonCode === reason) &&
    (disposition === 'all' || x.disposition === disposition) &&
    (owner === 'all' || x.owner === owner) &&
    (priority === 'all' || x.priority === priority) &&
    (!needle || `${x.boqCode} ${x.description} ${x.location}`.toLowerCase().includes(needle)));
}

/** Sort: priority rank, then blocked value descending. */
export function sortRows(rows) {
  return [...rows].sort((a, b) =>
    (PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank) || (b.blockedValue - a.blockedValue));
}

// ── Synthetic demo rows — every reason code represented at least once.
// Locations use a WBS-style path. All values invented.
const RAW_ROWS = [
  { id: 'RQ-01', boqCode: '03.10.055', description: 'Deck slab concrete C40 — span 3', location: 'SYN-BR / Span 3 / Deck', unit: 'm3', rate: 980, claimedQty: 420, wirApprovedQty: 300, certifiableQty: 300, reasonCode: 'Missing WIR', targetIpc: 'IPC-06', evidence: 'partial', ncrStatus: '—' },
  { id: 'RQ-02', boqCode: '02.55.030', description: 'MSE wall panels — east run', location: 'SYN-BR / East / Retaining', unit: 'm2', rate: 310, claimedQty: 1600, wirApprovedQty: 1600, certifiableQty: 900, reasonCode: 'NCR hold', targetIpc: 'IPC-07', evidence: 'complete', ncrStatus: 'open' },
  { id: 'RQ-03', boqCode: '03.44.220', description: 'Anti-carbonation coating P4–P6', location: 'SYN-BR / Piers P4–P6', unit: 'm2', rate: 45, claimedQty: 2400, wirApprovedQty: 0, certifiableQty: 0, reasonCode: 'Material not approved', targetIpc: 'IPC-07', evidence: 'missing', ncrStatus: '—' },
  { id: 'RQ-04', boqCode: '03.14.220', description: 'Concrete barrier — parapet link S2', location: 'SYN-BR / Link S2 / Parapet', unit: 'm', rate: 520, claimedQty: 620, wirApprovedQty: 430, certifiableQty: 430, reasonCode: 'WIR rejected/resubmission', targetIpc: 'IPC-06', evidence: 'partial', ncrStatus: '—' },
  { id: 'RQ-05', boqCode: '03.10.020', description: 'Deck slab concrete — link S2 pour 2', location: 'SYN-BR / Link S2 / Deck', unit: 'm3', rate: 980, claimedQty: 130, wirApprovedQty: 130, certifiableQty: 96, reasonCode: 'Missing evidence', targetIpc: 'IPC-06', evidence: 'missing', ncrStatus: '—' },
  { id: 'RQ-06', boqCode: '09.10.010', description: 'Utilities relocation — corridor', location: 'SYN-BR / Utilities corridor', unit: 'LS', rate: 41000, claimedQty: 1, wirApprovedQty: 1, certifiableQty: 0.29, reasonCode: 'CO/VO pending', targetIpc: 'IPC-07', evidence: 'partial', ncrStatus: '—' },
  { id: 'RQ-07', boqCode: '02.55.045', description: 'MSE capping beam — extras', location: 'SYN-BR / East / Retaining', unit: 'm', rate: 240, claimedQty: 51, wirApprovedQty: 0, certifiableQty: 0, reasonCode: 'Unclaimable quantity', targetIpc: '—', evidence: 'missing', ncrStatus: '—' },
  { id: 'RQ-08', boqCode: '05.60.010', description: 'Expansion joints — movement', location: 'SYN-BR / Span 2–3 joints', unit: 'm', rate: 1450, claimedQty: 64, wirApprovedQty: 0, certifiableQty: 0, reasonCode: 'In progress not certifiable', targetIpc: 'IPC-07', evidence: 'missing', ncrStatus: '—' },
  { id: 'RQ-09', boqCode: '02.55.031', description: 'MSE extra panels — re-measure', location: 'SYN-BR / East / Retaining', unit: 'm2', rate: 310, claimedQty: 210, wirApprovedQty: 140, certifiableQty: 140, reasonCode: 'Overclaim', targetIpc: 'IPC-07', evidence: 'partial', ncrStatus: '—' },
  { id: 'RQ-10', boqCode: '16.10.030', description: 'Lighting conduits — south verge', location: 'SYN-BR / South verge', unit: 'm', rate: 95, claimedQty: 480, wirApprovedQty: 480, certifiableQty: 0, reasonCode: 'Commercial review', targetIpc: '—', evidence: 'partial', ncrStatus: '—' },
  { id: 'RQ-11', boqCode: '08.20.015', description: 'Drainage pipe DN600 — tie-in', location: 'SYN-BR / Drainage main run', unit: 'm', rate: 780, claimedQty: 96, wirApprovedQty: 96, certifiableQty: 58, reasonCode: 'Procurement evidence missing', targetIpc: 'IPC-06', evidence: 'missing', ncrStatus: '—' },
  { id: 'RQ-12', boqCode: '03.11.100', description: 'Prestressing steel — span 3', location: 'SYN-BR / Span 3 / Deck', unit: 't', rate: 12400, claimedQty: 18, wirApprovedQty: 18, certifiableQty: 13.4, reasonCode: 'Missing WIR', targetIpc: 'IPC-06', evidence: 'partial', ncrStatus: '—' },
  { id: 'RQ-13', boqCode: '03.44.100', description: 'Pier column formwork P5', location: 'SYN-BR / Pier P5', unit: 'm2', rate: 180, claimedQty: 340, wirApprovedQty: 260, certifiableQty: 310, reasonCode: 'Commercial review', targetIpc: 'IPC-07', evidence: 'partial', ncrStatus: '—' }, // certifiable > WIR-approved → forced Review (integrity guard)
  { id: 'RQ-14', boqCode: '02.30.040', description: 'Permeable backing — abutment A2', location: 'SYN-BR / Abutment A2', unit: 'm3', rate: 240, claimedQty: 260, wirApprovedQty: 120, certifiableQty: 120, reasonCode: 'NCR hold', targetIpc: 'IPC-07', evidence: 'complete', ncrStatus: 'open' },
];

export const RECOVERY_ROWS = RAW_ROWS.map(enrichRow);
