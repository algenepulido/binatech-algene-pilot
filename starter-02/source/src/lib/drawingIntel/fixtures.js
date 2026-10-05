// ============================================================
// Drawing-intelligence fixtures — a SYNTHETIC extraction result for the demo
// drawing ST-101 P02 plus a normalized BOQ catalog and related-record pools.
// Entirely invented (no real client identifiers). This is the demo-badged
// review path; it is NEVER rendered as a live extraction result — the UI
// carries DRAWING_INTEL_BADGE wherever this data appears.
//
// STATE: demo-badged · read-only · not persisted.
// ============================================================

export const DRAWING_INTEL_BADGE = 'SYNTHETIC EXTRACTION — demo data, not a live AI result';

/** Normalized BOQ catalog (matching.js shape). */
export const DEMO_BOQ_CATALOG = [
  { id: 'BOQ-03.10.020', code: '03.10.020', bill: 'Bill 03', description: 'Vibrated reinforced concrete C30/37 in pad and strip foundations', unit: 'm³', workType: 'Concrete', discipline: 'Structural', material: 'C30/37 concrete', locationConstraints: ['Zone A'], contractQty: 2400, inCurrentIpa: true },
  { id: 'BOQ-03.10.031', code: '03.10.031', bill: 'Bill 03', description: 'Concrete kickers 150mm to foundation walls', unit: 'm³', workType: 'Concrete', discipline: 'Structural', material: 'C30/37 concrete', locationConstraints: ['Zone A'], contractQty: 180, inCurrentIpa: true },
  { id: 'BOQ-04.20.010', code: '04.20.010', bill: 'Bill 04', description: 'Reinforced concrete C40/50 in pier stems', unit: 'm³', workType: 'Concrete', discipline: 'Structural', material: 'C40/50 concrete', locationConstraints: ['Zone B'], contractQty: 960, inCurrentIpa: true },
  { id: 'BOQ-04.10.005', code: '04.10.005', bill: 'Bill 04', description: 'High-yield steel reinforcement to structures', unit: 't', workType: 'Rebar', discipline: 'Structural', material: 'B500B rebar', locationConstraints: [], contractQty: 410, inCurrentIpa: true },
  { id: 'BOQ-09.01.010', code: '09.01.010', bill: 'Bill 09', description: 'Waterproofing membrane below foundations including laps and upstands', unit: 'm²', workType: 'Waterproofing', discipline: 'Structural', material: 'bituminous membrane', locationConstraints: ['Zone A'], contractQty: 3100, inCurrentIpa: false },
  { id: 'BOQ-05.05.140', code: '05.05.140', bill: 'Bill 05', description: 'Precast parapet units including fixing', unit: 'm', workType: 'Precast', discipline: 'Structural', material: 'precast concrete', locationConstraints: [], contractQty: 240, inCurrentIpa: true },
];

/** Related-record pools for candidate enrichment + explicit linking. */
export const DEMO_WIR_POOL = [
  { id: 'WIR-001013', boqItemId: 'BOQ-03.10.020', zone: 'Zone A', status: 'approved', title: 'Zone A foundations pour 3' },
  { id: 'WIR-001009', boqItemId: 'BOQ-03.10.031', zone: 'Zone A', status: 'approved', title: 'Zone A kickers' },
  { id: 'WIR-001021', boqItemId: 'BOQ-04.20.010', zone: 'Zone B', status: 'pending', title: 'Zone B pier stems' },
];
export const DEMO_MEASUREMENT_POOL = [
  { id: 'm-1', zone: 'Zone A', title: 'Zone A footing take-off (120 m³)' },
  { id: 'm-2', zone: 'Zone A', title: 'Zone A kicker take-off (45 m³)' },
  { id: 'm-4', zone: 'Zone B', title: 'Zone B pier take-off (82 m³)' },
];
export const DEMO_ELEMENT_POOL = [
  { id: 'IFC-2O3xLk9r', boqItemId: 'BOQ-03.10.020', label: 'Pad footing F-C4' },
  { id: 'IFC-8Yt2Qw1a', boqItemId: 'BOQ-03.10.031', label: 'Kicker K-C1' },
  { id: 'IFC-5Rr8Nn2c', boqItemId: 'BOQ-05.05.140', label: 'Parapet unit P-12' },
];

/**
 * Synthetic extraction for ST-101 P02 ("Foundation Layout — Zone A"),
 * shaped EXACTLY like a valid doc-intel response (it passes
 * validateExtraction — the demo path exercises the same contract).
 */
export const DEMO_EXTRACTION = {
  drawing_number: 'ST-101',
  revision: 'P02',
  title: 'Foundation Layout — Zone A',
  discipline: 'Structural',
  issue_status: 'Issued for Construction',
  issue_date: '2026-07-14',
  levels: ['L00'],
  zones: ['Zone A'],
  grid_ranges: ['C1–C6'],
  chainage_ranges: [],
  element_types: ['pad footing', 'strip footing', 'kicker'],
  material_notes: ['C30/37 concrete', 'bituminous waterproofing membrane'],
  specification_references: ['Spec 03 30 00', 'Spec 07 11 13'],
  dimensions: ['footing depth 600mm', 'kicker height 150mm'],
  referenced_drawings: ['ST-102', 'ST-501'],
  referenced_details: ['Detail 5/ST-501'],
  quantity_relevant_annotations: ['schedule row: 120 m³ C30/37 Zone A', 'kickers to all foundation walls'],
  detected_regions: [
    { id: 'rg-1', page: 1, bbox: [0.08, 0.18, 0.36, 0.07], text: 'Foundation schedule: C30/37 foundation concrete, Zone A grids C4–C6 — 120 m³', region_type: 'schedule_row', confidence: 0.93, commercial_relevance: 'high' },
    { id: 'rg-2', page: 1, bbox: [0.55, 0.62, 0.3, 0.06], text: 'Bituminous waterproofing membrane below all Zone A footings — see Spec 07 11 13', region_type: 'note', confidence: 0.84, commercial_relevance: 'medium' },
    { id: 'rg-3', page: 2, bbox: [0.12, 0.4, 0.28, 0.08], text: 'Concrete kickers 150mm to all foundation walls, C30/37', region_type: 'detail_callout', confidence: 0.88, commercial_relevance: 'high' },
    { id: 'rg-4', page: 1, bbox: [0.7, 0.9, 0.28, 0.08], text: 'ST-101 · Foundation Layout — Zone A · Rev P02 · Issued for Construction · 14 Jul 2026', region_type: 'title_block', confidence: 0.97, commercial_relevance: 'none' },
    { id: 'rg-5', page: 2, bbox: [0.6, 0.2, 0.3, 0.07], text: 'Ornamental GRC screen to grid C6 — NIC, by others', region_type: 'note', confidence: 0.71, commercial_relevance: 'medium' },
  ],
  warnings: ['Chainage not shown on this drawing (building grid only)'],
};
