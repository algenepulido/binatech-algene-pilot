// ============================================================
// evidencePacks — pure model + derivation for Evidence Packs: evidence viewed
// as a certification-readiness bundle per scope, not a flat file list.
//
// FRONTEND DISPLAY ONLY, DEMO/READINESS DATA. There is no unified evidence-pack
// aggregation on the backend yet, and the storage upload path is not RLS-
// verified end-to-end, so this runs on SYNTHETIC packs behind the mandatory
// badge (EVIDENCE_BADGE). It NEVER certifies — evidence supports certification;
// it does not certify payment by itself (EVIDENCE_BOUNDARY). No uploads here.
// Real wiring (live WIRs + attachment counts + NCR/BOQ links) is a drop-in on
// deriveEvidencePacks once a batch attachment-count helper + verified storage
// scoping exist — documented, not built.
// ============================================================

// Required copy (asserted by tests — keep byte-exact).
export const EVIDENCE_BOUNDARY = 'Evidence supports certification. It does not certify payment by itself.';
export const EVIDENCE_BADGE = 'Demo/readiness data. Not backend-certified.';

// ── The nine pack statuses (owner-specified), with tone + bilingual labels.
export const EVIDENCE_STATUS = {
  complete:        { label: 'Complete',         labelAr: 'مكتمل',              color: '#15803d', soft: '#dcfce7' },
  missing_wir:     { label: 'Missing WIR',      labelAr: 'بدون طلب فحص',        color: '#b45309', soft: '#fef3c7' },
  missing_evidence:{ label: 'Missing evidence', labelAr: 'أدلة ناقصة',          color: '#b45309', soft: '#fef3c7' },
  missing_mir:     { label: 'Missing MIR',      labelAr: 'بدون اعتماد مواد',    color: '#b45309', soft: '#fef3c7' },
  missing_drawing: { label: 'Missing drawing',  labelAr: 'بدون مخطط',           color: '#b45309', soft: '#fef3c7' },
  ncr_hold:        { label: 'NCR hold',         labelAr: 'معلّق بمخالفة',       color: '#b91c1c', soft: '#fee2e2' },
  not_linked_boq:  { label: 'Not linked to BOQ',labelAr: 'غير مربوط بالكميات',  color: '#7c3aed', soft: '#ede9fe' },
  expired:         { label: 'Expired / invalid',labelAr: 'منتهٍ / غير صالح',     color: '#b91c1c', soft: '#fee2e2' },
  review:          { label: 'Review required',  labelAr: 'يتطلب مراجعة',        color: '#7c3aed', soft: '#ede9fe' },
};
export const statusLabel = (k, lang) => (lang === 'ar' ? EVIDENCE_STATUS[k]?.labelAr : EVIDENCE_STATUS[k]?.label) || k;

// Priority order when a pack qualifies for several statuses (worst first).
const STATUS_PRIORITY = ['ncr_hold', 'expired', 'not_linked_boq', 'missing_wir', 'missing_mir', 'missing_drawing', 'missing_evidence', 'review', 'complete'];

// ── The evidence slots that make up a pack. `req` = required for a Complete
// pack; `whenMaterial`/`whenSdn` = conditionally required. Each slot is either
// present (has ≥1 item) or missing.
export const EVIDENCE_SLOTS = [
  { key: 'wir',        label: 'Linked WIR',            labelAr: 'طلب فحص مرتبط',   req: true },
  { key: 'boq',        label: 'Linked BOQ',            labelAr: 'بند كميات مرتبط', req: true },
  { key: 'photo',      label: 'Photos',                labelAr: 'صور',             req: true },
  { key: 'measurement',label: 'Measurement sheet',     labelAr: 'كشف قياس',        req: true },
  { key: 'mir',        label: 'MIR / material approval',labelAr: 'اعتماد مواد',     req: false, whenMaterial: true },
  { key: 'drawing',    label: 'Drawing',               labelAr: 'مخطط',            req: false },
  { key: 'ncr',        label: 'NCR clearance',         labelAr: 'إغلاق مخالفة',    req: false },
  { key: 'sdn',        label: 'Delivery note (SDN)',   labelAr: 'إشعار تسليم',     req: false, whenSdn: true },
  { key: 'element',    label: 'Model element',         labelAr: 'عنصر النموذج',    req: false },
];
export const slotLabel = (k, lang) => { const s = EVIDENCE_SLOTS.find((x) => x.key === k); return s ? (lang === 'ar' ? s.labelAr : s.label) : k; };

const has = (v) => Array.isArray(v) ? v.length > 0 : !!v;

/**
 * Derive a pack's readiness from its raw slot data. Pure — no I/O.
 * raw: { id, boqCode, description, location, discipline, certUse, needsMaterial,
 *        needsSdn, ncrOpen, wirResult, slots: {wir,boq,photo,measurement,mir,drawing,ncr,sdn,element} }
 */
export function derivePack(raw) {
  const slots = raw.slots || {};
  const present = {};
  const missing = [];
  for (const s of EVIDENCE_SLOTS) {
    const ok = has(slots[s.key]);
    present[s.key] = ok;
    const required = s.req || (s.whenMaterial && raw.needsMaterial) || (s.whenSdn && raw.needsSdn);
    if (required && !ok) missing.push(s.key);
  }
  const reqSlots = EVIDENCE_SLOTS.filter((s) => s.req || (s.whenMaterial && raw.needsMaterial) || (s.whenSdn && raw.needsSdn));
  const presentReq = reqSlots.filter((s) => present[s.key]).length;
  const completeness = reqSlots.length ? Math.round((presentReq / reqSlots.length) * 100) : 100;

  // Status precedence — the single worst condition drives the badge.
  let status;
  if (raw.ncrOpen) status = 'ncr_hold';
  else if (/reject|expir|supersed|invalid/i.test(raw.wirResult || '')) status = 'expired';
  else if (!present.boq) status = 'not_linked_boq';
  else if (!present.wir) status = 'missing_wir';
  else if (raw.needsMaterial && !present.mir) status = 'missing_mir';
  else if (raw.needsDrawing && !present.drawing) status = 'missing_drawing';
  else if (!present.photo || !present.measurement) status = 'missing_evidence';
  else if (raw.reviewFlag) status = 'review';
  else status = 'complete';

  return {
    ...raw,
    present, missing, completeness,
    status,
    missingLabels: missing, // slot keys; UI localizes
    isBackendDerived: false,
  };
}

/** Pack unit is a WIR-centric evidence bundle when WIRs exist; falls back to
 *  the synthetic demo set. Real wiring: map each WIR → raw pack (attachments by
 *  doc-type → slots, element NCR → ncrOpen, boq_item_id → boq). Not built here
 *  (needs a batch attachment-count helper + verified storage scoping). */
export function deriveEvidencePacks(rawPacks = []) {
  const packs = rawPacks.map(derivePack);
  packs.sort((a, b) => (STATUS_PRIORITY.indexOf(a.status) - STATUS_PRIORITY.indexOf(b.status)) || (a.completeness - b.completeness));
  return packs;
}

/** KPI rollup: count per status + overall completeness. */
export function evidenceKpis(packs) {
  const byStatus = {};
  for (const k of Object.keys(EVIDENCE_STATUS)) byStatus[k] = 0;
  let sum = 0;
  for (const p of packs) { byStatus[p.status] = (byStatus[p.status] || 0) + 1; sum += p.completeness; }
  return {
    total: packs.length,
    complete: byStatus.complete,
    needsAction: packs.length - byStatus.complete,
    avgCompleteness: packs.length ? Math.round(sum / packs.length) : 0,
    byStatus,
  };
}

export function filterPacks(packs, { status = 'all', q = '' } = {}) {
  const needle = q.trim().toLowerCase();
  return packs.filter((p) =>
    (status === 'all' || p.status === status) &&
    (!needle || `${p.boqCode} ${p.description} ${p.location} ${p.wirNo || ''}`.toLowerCase().includes(needle)));
}

// ── Synthetic demo packs — every status represented at least once. Slot values
// are illustrative (file names / ids), never real files. Certification use
// states how the pack feeds the chain (WIR approval ≠ certification).
const RAW = [
  {
    id: 'EP-01', boqCode: '03.10.055', wirNo: 'WIR-2610', description: 'Deck slab concrete C40 — span 3', location: 'SYN-BR / Span 3 / Deck',
    discipline: 'Structural', wirResult: 'Approved', ncrOpen: false, needsMaterial: true, needsDrawing: true, reviewFlag: false,
    certUse: 'Supports certifiable quantity on 03.10.055 (approved WIR, evidence complete).',
    source: 'WIR-2610 · rev B · inspected 2026-06-18', element: 'IfcSlab · 1kP3…deck',
    slots: { wir: ['WIR-2610'], boq: ['03.10.055'], photo: ['pour-01.jpg', 'pour-02.jpg', 'finish.jpg'], measurement: ['MS-118'], mir: ['MIR-C40'], drawing: ['SD-DECK-03'], ncr: [], sdn: [], element: ['IfcSlab-1kP3'] },
  },
  {
    id: 'EP-02', boqCode: '02.55.030', wirNo: 'WIR-2980', description: 'MSE wall panels — east run', location: 'SYN-BR / East / Retaining',
    discipline: 'Structural', wirResult: 'Approved', ncrOpen: true, needsMaterial: false, needsDrawing: false, reviewFlag: false,
    certUse: 'Held — open NCR on a linked element blocks certification of this scope.',
    source: 'WIR-2980 · rev A · inspected 2026-06-20', element: 'IfcWall · east-run',
    slots: { wir: ['WIR-2980'], boq: ['02.55.030'], photo: ['panel-01.jpg'], measurement: ['MS-221'], mir: [], drawing: ['SD-MSE-02'], ncr: [], sdn: [], element: ['IfcWall-east'] },
  },
  {
    id: 'EP-03', boqCode: '03.44.220', wirNo: 'WIR-3010', description: 'Anti-carbonation coating P4–P6', location: 'SYN-BR / Piers P4–P6',
    discipline: 'Finishes', wirResult: 'Pending', ncrOpen: false, needsMaterial: true, needsDrawing: false, reviewFlag: false,
    certUse: 'Not certifiable — material approval (MIR) missing; coating cannot be signed off.',
    source: 'WIR-3010 · draft', element: 'IfcColumn · P4-P6',
    slots: { wir: ['WIR-3010'], boq: ['03.44.220'], photo: ['coat-01.jpg'], measurement: ['MS-330'], mir: [], drawing: [], ncr: [], sdn: [], element: ['IfcColumn-P4'] },
  },
  {
    id: 'EP-04', boqCode: '03.14.220', wirNo: 'WIR-2705', description: 'Concrete barrier — parapet link S2', location: 'SYN-BR / Link S2 / Parapet',
    discipline: 'Structural', wirResult: 'Approved', ncrOpen: false, needsMaterial: false, needsDrawing: true, reviewFlag: false,
    certUse: 'Not certifiable — approved shop drawing missing for the as-built barrier profile.',
    source: 'WIR-2705 · rev A', element: 'IfcRailing · parapet-8',
    slots: { wir: ['WIR-2705'], boq: ['03.14.220'], photo: ['barrier-01.jpg', 'barrier-02.jpg'], measurement: ['MS-441'], mir: [], drawing: [], ncr: [], sdn: [], element: ['IfcRailing-8'] },
  },
  {
    id: 'EP-05', boqCode: '03.10.020', wirNo: 'WIR-2611', description: 'Deck slab — link S2 pour 2', location: 'SYN-BR / Link S2 / Deck',
    discipline: 'Structural', wirResult: 'Approved', ncrOpen: false, needsMaterial: false, needsDrawing: false, reviewFlag: false,
    certUse: 'Not certifiable — photo evidence and measurement sheet not compiled.',
    source: 'WIR-2611 · rev A', element: 'IfcSlab · link8-p2',
    slots: { wir: ['WIR-2611'], boq: ['03.10.020'], photo: [], measurement: [], mir: [], drawing: ['SD-DECK-08'], ncr: [], sdn: [], element: ['IfcSlab-l8'] },
  },
  {
    id: 'EP-06', boqCode: '02.30.040', wirNo: null, description: 'Permeable backing — abutment A2', location: 'SYN-BR / Abutment A2',
    discipline: 'Structural', wirResult: null, ncrOpen: false, needsMaterial: false, needsDrawing: false, reviewFlag: false,
    certUse: 'Not certifiable — executed scope has no WIR raised; claimable value is stuck.',
    source: 'no WIR on record', element: 'IfcFooting · A2',
    slots: { wir: [], boq: ['02.30.040'], photo: ['backing-01.jpg'], measurement: [], mir: [], drawing: [], ncr: [], sdn: ['SDN-118'], element: ['IfcFooting-A2'] },
  },
  {
    id: 'EP-07', boqCode: null, wirNo: 'WIR-3120', description: 'Site photos — south verge (unfiled)', location: 'SYN-BR / South verge',
    discipline: 'External works', wirResult: 'Approved', ncrOpen: false, needsMaterial: false, needsDrawing: false, reviewFlag: false,
    certUse: 'Cannot support certification — evidence is not linked to any BOQ line.',
    source: 'WIR-3120 · rev A', element: null,
    slots: { wir: ['WIR-3120'], boq: [], photo: ['verge-01.jpg', 'verge-02.jpg'], measurement: [], mir: [], drawing: [], ncr: [], sdn: [], element: [] },
  },
  {
    id: 'EP-08', boqCode: '03.44.100', wirNo: 'WIR-2481', description: 'Pier column formwork P5', location: 'SYN-BR / Pier P5',
    discipline: 'Structural', wirResult: 'Rejected', ncrOpen: false, needsMaterial: false, needsDrawing: false, reviewFlag: false,
    certUse: 'Invalid — WIR was rejected; evidence is superseded until re-inspection.',
    source: 'WIR-2481 · rejected 2026-06-15', element: 'IfcColumn · P5',
    slots: { wir: ['WIR-2481'], boq: ['03.44.100'], photo: ['form-01.jpg'], measurement: ['MS-500'], mir: [], drawing: ['SD-FORM-05'], ncr: [], sdn: [], element: ['IfcColumn-P5'] },
  },
  {
    id: 'EP-09', boqCode: '02.55.031', wirNo: 'WIR-2990', description: 'MSE extra panels — re-measure', location: 'SYN-BR / East / Retaining',
    discipline: 'Structural', wirResult: 'Approved', ncrOpen: false, needsMaterial: false, needsDrawing: false, reviewFlag: true,
    certUse: 'Review — certifiable quantity exceeds the WIR-approved measurement; QS to reconcile.',
    source: 'WIR-2990 · rev A', element: 'IfcWall · extra',
    slots: { wir: ['WIR-2990'], boq: ['02.55.031'], photo: ['extra-01.jpg'], measurement: ['MS-233'], mir: [], drawing: ['SD-MSE-03'], ncr: [], sdn: [], element: ['IfcWall-extra'] },
  },
  {
    id: 'EP-10', boqCode: '08.20.015', wirNo: 'WIR-3200', description: 'Drainage pipe DN600 — tie-in', location: 'SYN-BR / Drainage main run',
    discipline: 'External works', wirResult: 'Approved', ncrOpen: false, needsMaterial: true, needsDrawing: false, reviewFlag: false,
    certUse: 'Complete — approved WIR, material approved, delivery evidence attached.',
    source: 'WIR-3200 · rev B', element: 'IfcPipe · DN600',
    slots: { wir: ['WIR-3200'], boq: ['08.20.015'], photo: ['pipe-01.jpg', 'pipe-02.jpg'], measurement: ['MS-620'], mir: ['MIR-DN600'], drawing: ['SD-DRN-01'], ncr: [], sdn: ['SDN-140'], element: ['IfcPipe-DN600'] },
  },
];

export function demoEvidencePacks() {
  return deriveEvidencePacks(RAW);
}
