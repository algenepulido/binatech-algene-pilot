// ============================================================
// ipaReconciliationData — DEMO-ONLY data + frontend derivation for the IPA
// Reconciliation module ("Certified Value Gap"). See docs/ipa-reconciliation-module-spec.md.
//
// FRONTEND DISPLAY ONLY. Nothing here derives certified truth. Certified value is
// IMPORTED/DEMO and flagged `is_backend_derived = false` — it must eventually come
// from backend-enforced certification (Gate 1 / the reconciliation data layer),
// which is the backend owner's lane. No money logic, no schema, no RLS here.
//
// Rules encoded (spec §5, §7):
//  • disposition is DERIVED from the reason code, never typed by hand.
//  • variance is RECOMPUTED (reported − certified), never trusted from import.
//  • negative variance (certified > reported) is flagged for review, never counted
//    as recoverable (the over-certification guard).
//  • all money reconciled on BASE amount; VAT tracked separately (not mixed in).
// All figures are SYNTHETIC. No real customer workbook values are reproduced.
// ============================================================

export const VAT_RATE = 0.15;

// ── Canonical reason codes → disposition + default action + default owner (spec §5)
export const REASON_CODES = [
  { code: 'No WIR',                     disposition: 'recoverable',          action: 'Raise WIR',                          owner: 'QA/QC + Site' },
  { code: 'Missing WIR',                disposition: 'recoverable',          action: 'Locate & attach approved WIR',       owner: 'QA/QC' },
  { code: 'WIR resubmission required',  disposition: 'recoverable',          action: 'Resubmit WIR',                       owner: 'QA/QC' },
  { code: 'Material not approved',      disposition: 'recoverable_external', action: 'Chase MIR / material approval',      owner: 'QA/QC + Procurement' },
  { code: 'CO/variation pending',       disposition: 'recoverable_external', action: 'Progress CO/VO approval',            owner: 'Commercial / Contracts' },
  { code: 'Unclaimable quantity',       disposition: 'write_off',            action: 'Remove from claim, record reason',   owner: 'Commercial' },
  { code: 'In progress, not certifiable', disposition: 'blocked',            action: 'Await completion; recheck next period', owner: 'Site / Planning' },
  { code: 'Over-reported',              disposition: 'recoverable',          action: 'Re-measure; split claimable vs excess', owner: 'QS' },
  { code: 'Cancelled item',            disposition: 'write_off',            action: 'Close line',                         owner: 'Commercial' },
  { code: 'Evidence missing',          disposition: 'recoverable',          action: 'Compile & attach evidence',          owner: 'QA/QC' },
  { code: 'Commercial review required', disposition: 'blocked',             action: 'Commercial ruling on claimability',  owner: 'Commercial Manager' },
];

const REASON_BY_CODE = Object.fromEntries(REASON_CODES.map((r) => [r.code, r]));

// ── The five dispositions (spec §5 + the over-certified review from §7)
export const DISPOSITION_META = {
  recoverable:          { label: 'Recoverable',          color: '#0d9488', soft: '#ccfbf1', kind: 'recover' },
  recoverable_external: { label: 'Recoverable (external)', color: '#b45309', soft: '#fef3c7', kind: 'recover' },
  blocked:              { label: 'Blocked',              color: '#b91c1c', soft: '#fee2e2', kind: 'blocked' },
  write_off:            { label: 'Write-off',            color: '#64748b', soft: '#f1f5f9', kind: 'writeoff' },
  review:               { label: 'Review / over-certified', color: '#7c3aed', soft: '#ede9fe', kind: 'review' },
};

export const STATUS_META = {
  open:                { label: 'Open',                color: '#6e6e73' },
  action_in_progress:  { label: 'Action in progress',  color: '#b45309' },
  ready_next_ipa:      { label: 'Ready — next IPA',    color: '#0d9488' },
  recovered:           { label: 'Recovered',           color: '#15803d' },
  written_off:         { label: 'Written off',         color: '#64748b' },
  on_hold:             { label: 'On hold',             color: '#b91c1c' },
};

export const NEXT_PERIOD = 'IPA 11';

/** Disposition is DERIVED, never entered by hand: reason code → disposition, with the
 *  over-certification guard — any negative variance is routed to review, not recovery. */
export function dispositionForLine(line) {
  if (Number(line.certified) > Number(line.reported)) return 'review';
  return REASON_BY_CODE[line.reasonCode]?.disposition || 'blocked';
}

export const actionForReason = (code) => REASON_BY_CODE[code]?.action || '—';
export const ownerForReason = (code) => REASON_BY_CODE[code]?.owner || '—';

/** Enrich a raw line: recompute variance (base), derive disposition + sign. VAT kept separate. */
export function enrichLine(line) {
  const reported = Number(line.reported) || 0;
  const certified = Number(line.certified) || 0;
  const variance = Math.round((reported - certified) * 100) / 100;   // recomputed, never imported
  const disposition = dispositionForLine(line);
  return {
    ...line,
    reported, certified, variance,
    sign: variance > 0 ? 'positive' : variance < 0 ? 'negative' : 'zero',
    vat: Math.round(Math.abs(variance) * VAT_RATE * 100) / 100,
    disposition,
    isBackendDerived: false,     // imported/demo — the trust boundary, always false here
  };
}

// ── Synthetic reconciliation lines (current period IPA 10 / Jun-2026). No real values.
const RAW_LINES = [
  { id: 'RL-01', activityId: 'A-1010', activityName: 'Bridge deck — span 3', resourceLine: 'LA-205 · Prestressing steel', boqRef: '03.11.100', coRef: null, reported: 58200, certified: 65100, reasonCode: 'Commercial review required', note: 'Cumulative/timing — certified exceeds reported in-period', owner: 'Commercial Mgr', targetIpa: 'IPA 11', status: 'on_hold', wir: ['WIR-3312'], evidence: ['MS-118'], covo: [] },
  { id: 'RL-02', activityId: 'A-1020', activityName: 'Abutment A2 — backing', resourceLine: 'LA-118 · Permeable backing', boqRef: '02.30.040', coRef: null, reported: 4150, certified: 0, reasonCode: 'No WIR', note: 'No WIR yet — should be invoiced next IPA', owner: 'QA/QC + Site', targetIpa: 'IPA 11', status: 'action_in_progress', wir: [], evidence: ['PHT-402'], covo: [] },
  { id: 'RL-03', activityId: 'A-1035', activityName: 'Pier columns P4–P6', resourceLine: 'LA-330 · Anti-carbonation coating', boqRef: '03.44.220', coRef: null, reported: 28300, certified: 0, reasonCode: 'Material not approved', note: 'Material not yet approved (MIR pending)', owner: 'QA/QC + Procurement', targetIpa: 'IPA 12', status: 'action_in_progress', wir: [], evidence: ['MIR-556'], covo: [] },
  { id: 'RL-04', activityId: 'A-2010', activityName: 'Utilities corridor', resourceLine: 'LA-901 · Utilities relocation', boqRef: '09.10.010', coRef: 'CO-2', reported: 41000, certified: 12000, reasonCode: 'CO/variation pending', note: 'CO#2 & CO#3 items — approval in progress', owner: 'Commercial / Contracts', targetIpa: 'IPA 12', status: 'open', wir: [], evidence: [], covo: ['CO-2', 'CO-3'] },
  { id: 'RL-05', activityId: 'A-2050', activityName: 'Retaining — east run', resourceLine: 'LA-410 · MSE wall panels', boqRef: '02.55.030', coRef: null, reported: 96500, certified: 78000, reasonCode: 'Missing WIR', note: 'Missing WIR for the last two lifts', owner: 'QA/QC', targetIpa: 'IPA 11', status: 'action_in_progress', wir: ['WIR-2980 (partial)'], evidence: ['MS-221'], covo: [] },
  { id: 'RL-06', activityId: 'A-1050', activityName: 'Parapet — link S2', resourceLine: 'LA-220 · Concrete barrier', boqRef: '03.14.220', coRef: null, reported: 43200, certified: 32000, reasonCode: 'WIR resubmission required', note: 'WIRs to be re-submitted by QC', owner: 'QA/QC', targetIpa: 'IPA 11', status: 'action_in_progress', wir: ['WIR-2481 (rejected)'], evidence: ['MS-441'], covo: [] },
  { id: 'RL-07', activityId: 'A-1005', activityName: 'Deck slab — link S2', resourceLine: 'LA-140 · Deck concrete C40', boqRef: '03.10.055', coRef: null, reported: 132000, certified: 128200, reasonCode: 'Evidence missing', note: 'Cube test reports & pour photos not yet compiled', owner: 'QA/QC', targetIpa: 'IPA 11', status: 'action_in_progress', wir: ['WIR-2610'], evidence: [], covo: [] },
  { id: 'RL-08', activityId: 'A-3010', activityName: 'Movement joints', resourceLine: 'LA-505 · Expansion joint', boqRef: '05.60.010', coRef: null, reported: 22400, certified: 0, reasonCode: 'In progress, not certifiable', note: 'Installation in progress', owner: 'Site / Planning', targetIpa: 'IPA 12', status: 'on_hold', wir: [], evidence: [], covo: [] },
  { id: 'RL-09', activityId: 'A-4010', activityName: 'Drainage — main run', resourceLine: 'LA-720 · Drainage pipe DN600', boqRef: '08.20.015', coRef: null, reported: 15600, certified: 9800, reasonCode: 'No WIR', note: 'No WIR raised for the tie-in section', owner: 'QA/QC + Site', targetIpa: 'IPA 11', status: 'ready_next_ipa', wir: [], evidence: ['SDN-118'], covo: [] },
  { id: 'RL-10', activityId: 'A-5010', activityName: 'Lighting — south verge', resourceLine: 'LA-810 · Lighting conduits', boqRef: '16.10.030', coRef: null, reported: 8700, certified: 0, reasonCode: 'Commercial review required', note: '"Considered done if we have the crown" — needs ruling', owner: 'Commercial Manager', targetIpa: '—', status: 'on_hold', wir: [], evidence: [], covo: [] },
  { id: 'RL-11', activityId: 'A-2060', activityName: 'Retaining — capping', resourceLine: 'LA-411 · MSE capping beam', boqRef: '02.55.045', coRef: null, reported: 12200, certified: 0, reasonCode: 'Unclaimable quantity', note: "Qty's cannot be claimed under the contract", owner: 'Commercial', targetIpa: '—', status: 'written_off', wir: [], evidence: [], covo: [] },
  { id: 'RL-12', activityId: 'A-6010', activityName: 'Comms ducting', resourceLine: 'LA-950 · Telecom ducting', boqRef: '09.30.020', coRef: null, reported: 3400, certified: 0, reasonCode: 'Cancelled item', note: 'Item cancelled — omitted in CO#2', owner: 'Commercial', targetIpa: '—', status: 'written_off', wir: [], evidence: [], covo: [] },
  { id: 'RL-13', activityId: 'A-1035', activityName: 'Pier columns — formwork', resourceLine: 'LA-331 · Column formwork', boqRef: '03.44.100', coRef: null, reported: 19800, certified: 21600, reasonCode: 'Commercial review required', note: 'Formwork considered casted — cumulative overrun', owner: 'Commercial Mgr', targetIpa: 'IPA 11', status: 'on_hold', wir: ['WIR-2705'], evidence: [], covo: [] },
  { id: 'RL-14', activityId: 'A-2055', activityName: 'Retaining — extra panels', resourceLine: 'LA-412 · MSE extra panels', boqRef: '02.55.031', coRef: null, reported: 14500, certified: 6000, reasonCode: 'Over-reported', note: 'Some exceeding quantities to be claimed later', owner: 'QS', targetIpa: 'IPA 12', status: 'open', wir: ['WIR-2990'], evidence: ['MS-233'], covo: [] },
];

export const IPA_LINES = RAW_LINES.map(enrichLine);

// ── KPI rollups (spec §7). All on base amount, positive-variance buckets only.
export function computeKpis(lines = IPA_LINES) {
  const sum = (pred, val = (l) => l.variance) => lines.filter(pred).reduce((a, l) => a + val(l), 0);
  const reported = lines.reduce((a, l) => a + l.reported, 0);
  const certified = lines.reduce((a, l) => a + l.certified, 0);
  const isRecover = (l) => DISPOSITION_META[l.disposition]?.kind === 'recover';
  const recoverable = sum((l) => isRecover(l) && l.variance > 0);
  const blocked = sum((l) => l.disposition === 'blocked' && l.variance > 0);
  const writtenOff = sum((l) => l.disposition === 'write_off' && l.variance > 0);
  const overCertified = sum((l) => l.variance < 0, (l) => Math.abs(l.variance)); // flagged, NOT recoverable
  const nextIpaForecast = sum((l) => isRecover(l) && l.variance > 0
    && (l.status === 'action_in_progress' || l.status === 'ready_next_ipa')
    && l.targetIpa === NEXT_PERIOD);
  return {
    reported, certified,
    totalVariance: reported - certified,
    recoverable, blocked, writtenOff, overCertified, nextIpaForecast,
  };
}

/** Reason-code breakdown by |variance| value, tagged with disposition (spec §10). */
export function reasonBreakdown(lines = IPA_LINES) {
  const map = {};
  for (const l of lines) {
    const k = l.reasonCode;
    if (!map[k]) map[k] = { code: k, value: 0, count: 0, disposition: l.disposition };
    map[k].value += Math.abs(l.variance);
    map[k].count += 1;
  }
  return Object.values(map).sort((a, b) => b.value - a.value);
}

// ── Monthly snapshots (spec §5 — immutable once closed; here read-only, no backend lock)
export const PERIODS = [
  { id: 'IPA 08', label: 'IPA 08 / Apr-2026', status: 'closed', reported: 512000, certified: 447500, recoverable: 41200, blocked: 15800, writtenOff: 7500, carriedForward: 39000, recoveredFromPrev: 22400, overCertified: 3100 },
  { id: 'IPA 09', label: 'IPA 09 / May-2026', status: 'closed', reported: 598400, certified: 521900, recoverable: 52600, blocked: 16400, writtenOff: 7500, carriedForward: 46700, recoveredFromPrev: 33500, overCertified: 5900 },
  { id: 'IPA 10', label: 'IPA 10 / Jun-2026', status: 'open', current: true }, // filled live from IPA_LINES
];
