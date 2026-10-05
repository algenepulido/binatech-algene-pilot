// ============================================================
// PILOT STARTER ONLY — wholly synthetic fixtures (no real project, company,
// person, bank, tax or contact data). Shapes follow the application's schema at
// the upstream commit; values use its CHECK vocabularies. Every row is
// visibly synthetic ("SYN-", "Fictional …", "(synthetic)").
//
//   Project P — the pilot project: Invoices A, B and a zero/optional Z,
//               a small BoQ with WIRs, an NCR, evidence counts and IPCs.
//   Project Q — a decoy for identity/scoping checks (its own invoice/WIR).
//   Project E — a genuine successful-empty case: no invoices, and BoQ rows
//               that are section headings only (Commercial Control shows
//               its "no lines" project state, not the built-in demo).
//
// Fixture changes made while the starter runs are in memory only and reset
// on reload.
// ============================================================

export const SYNTHETIC_USER = Object.freeze({
  id: 'a1a1a1a1-0000-4000-8000-000000000001',
  email: 'pilot.reviewer@example.invalid',
  aud: 'authenticated',
  role: 'authenticated',
  user_metadata: Object.freeze({ full_name: 'Pilot Reviewer (synthetic)' }),
  app_metadata: Object.freeze({ provider: 'synthetic' }),
});

export const PROJECT_P = '11111111-1111-4111-8111-111111111111';
export const PROJECT_Q = '22222222-2222-4222-8222-222222222222';
export const PROJECT_E = '33333333-3333-4333-8333-333333333333';

const T0 = '2026-08-01T07:00:00.000Z';
const uid = SYNTHETIC_USER.id;

const project = (id, code, name, nameAr, updatedAt) => ({
  row: {
    id, name, name_ar: nameAr, client: 'Fictional Client One Ltd (synthetic)', consultant: 'Fictional Consultant Two Ltd (synthetic)',
    contractor: 'Fictional Contractor Three Ltd (synthetic)', status: 'active', thumbnail_url: null, owner: uid,
    created_at: T0, updated_at: updatedAt, is_demo: false, company_id: null, deleted_at: null,
  },
  settings: {
    project_id: id, code, name, name_ar: nameAr, client: 'Fictional Client One Ltd (synthetic)',
    contractor: 'Fictional Contractor Three Ltd (synthetic)', consultant: 'Fictional Consultant Two Ltd (synthetic)',
    revision: 'SYN-R1', updated_by: uid, updated_at: updatedAt,
  },
  meta: { name, nameAr, client: 'Fictional Client One Ltd (synthetic)', contractor: 'Fictional Contractor Three Ltd (synthetic)', consultant: 'Fictional Consultant Two Ltd (synthetic)', code },
});

const P = project(PROJECT_P, 'SYN-P', 'Synthetic Project P — Pilot Warehouse', 'مشروع تجريبي P — مستودع (بيانات وهمية)', '2026-09-28T09:00:00.000Z');
const Q = project(PROJECT_Q, 'SYN-Q', 'Synthetic Project Q — Decoy', 'مشروع تجريبي Q — للتحقق (بيانات وهمية)', '2026-09-27T09:00:00.000Z');
const E = project(PROJECT_E, 'SYN-E', 'Synthetic Project E — Empty', 'مشروع تجريبي E — فارغ (بيانات وهمية)', '2026-09-26T09:00:00.000Z');

/** localStorage meta written before the app loads (see src/pilot/browserState.js). */
export const PROJECT_META = Object.freeze({ [PROJECT_P]: P.meta, [PROJECT_Q]: Q.meta, [PROJECT_E]: E.meta });
export const PILOT_PROJECT_IDS = Object.freeze([PROJECT_P, PROJECT_Q, PROJECT_E]);

const boq = (id, project_id, position, code, description, unit, qty, rate, approved_qty, element_id = null, section = null) => ({
  id, project_id, element_id, code, description, unit, qty, rate, approved_qty, created_by: uid, created_at: T0,
  section, package_id: null, position, mapped_qty: null,
});
const wir = (id, project_id, wir_number, fields) => ({
  id, project_id, wir_number, inspection_type: null, element_guid: null, drawing_ref: null, inspector_name: null,
  inspection_date: null, result: 'pending', remarks: null, created_by: uid, created_at: T0, boq_item_id: null,
  scope_type: null, scope_package: null, scope_zone: null, scope_qty: null, scope_unit: null, scope_group_id: null,
  approved_qty: null, approved_unit: null, work_item_id: null, claimable: true, claim_status: 'unclaimed', ...fields,
});
const invoice = (id, project_id, fields) => ({
  id, project_id, invoice_number: null, ipc_ref: null, issue_date: null, due_date: null, paid_date: null, amount: 0,
  zatca_status: 'Awaiting IPC', payment_status: 'Not Issued', created_by: uid, created_at: T0, element_guid: null, wir_number: null, ...fields,
});

// ---- Ids (visibly synthetic, valid UUID shape) -------------------------------
const ID = {
  boqP: (n) => `b0000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`,
  boqQ: (n) => `b0000000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`,
  boqE: (n) => `b0000000-0000-4000-8000-0000000003${String(n).padStart(2, '0')}`,
  wirP: (n) => `c0000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`,
  wirQ: (n) => `c0000000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`,
  inv: (s) => `d0000000-0000-4000-8000-000000000${s}`,
};

/** Invoice identities the README and tests refer to. */
export const INVOICE_IDS = Object.freeze({ A: ID.inv('0a1'), B: ID.inv('0b2'), Z: ID.inv('0f3'), Q: ID.inv('0c4') });

export function createFixtureStore() {
  const store = {
    projects: [P.row, Q.row, E.row],
    project_settings: [P.settings, Q.settings, E.settings],
    project_models: [],
    model_elements: [],
    boq_items: [
      boq(ID.boqP(0), PROJECT_P, 1, 'SYN-01', 'SECTION 1 — SUBSTRUCTURE (synthetic heading)', null, 0, 0, 0, null, 'Substructure'),
      boq(ID.boqP(1), PROJECT_P, 2, 'SYN-01.010', 'Blinding concrete C15, 75 mm (synthetic)', 'm3', 120, 310, 120, 'syn-el-01'),
      boq(ID.boqP(2), PROJECT_P, 3, 'SYN-01.020', 'Raft concrete C40 (synthetic)', 'm3', 640, 520, 300, 'syn-el-02'),
      boq(ID.boqP(3), PROJECT_P, 4, 'SYN-01.030', 'Reinforcement B500B (synthetic)', 't', 85, 3900, 40, 'syn-el-03'),
      boq(ID.boqP(4), PROJECT_P, 5, 'SYN-02.010', 'Precast columns 500x500 (synthetic)', 'nr', 48, 7200, 12, 'syn-el-04'),
      boq(ID.boqP(5), PROJECT_P, 6, 'SYN-02.020', 'Roof membrane (synthetic)', 'm2', 2400, 95, 0, 'syn-el-05'),
      boq(ID.boqP(6), PROJECT_P, 7, 'SYN-02.030', 'Cladding panels (synthetic)', 'm2', 1800, 240, 600, 'syn-el-06'),
      boq(ID.boqQ(1), PROJECT_Q, 1, 'SYN-Q-01.010', 'Decoy line — Project Q only (synthetic)', 'm3', 10, 1000, 10, 'syn-q-el-01'),
      boq(ID.boqE(1), PROJECT_E, 1, 'SYN-E-01', 'SECTION 1 — PRELIMINARIES (synthetic heading)', null, 0, 0, 0, null, 'Preliminaries'),
      boq(ID.boqE(2), PROJECT_E, 2, 'SYN-E-02', 'SECTION 2 — GENERAL (synthetic heading)', null, 0, 0, 0, null, 'General'),
    ],
    element_boq_links: [
      { id: 'e0000000-0000-4000-8000-000000000101', project_id: PROJECT_P, element_guid: 'syn-el-03', boq_item_id: ID.boqP(3), created_at: T0 },
      { id: 'e0000000-0000-4000-8000-000000000102', project_id: PROJECT_P, element_guid: 'syn-el-04', boq_item_id: ID.boqP(4), created_at: T0 },
      { id: 'e0000000-0000-4000-8000-000000000201', project_id: PROJECT_Q, element_guid: 'syn-q-el-01', boq_item_id: ID.boqQ(1), created_at: T0 },
    ],
    wirs: [
      wir(ID.wirP(1), PROJECT_P, 'SYN-WIR-0001', { inspection_type: 'Blinding pour (synthetic)', inspection_date: '2026-08-12', result: 'approved', boq_item_id: ID.boqP(1), approved_qty: 120, approved_unit: 'm3', scope_zone: 'Zone 1 (synthetic)' }),
      wir(ID.wirP(2), PROJECT_P, 'SYN-WIR-0002', { inspection_type: 'Raft pour stage 1 (synthetic)', inspection_date: '2026-08-20', result: 'approved', boq_item_id: ID.boqP(2), approved_qty: 300, approved_unit: 'm3', scope_zone: 'Zone 2 (synthetic)' }),
      wir(ID.wirP(3), PROJECT_P, 'SYN-WIR-0003', { inspection_type: 'Raft pour stage 2 (synthetic)', inspection_date: '2026-09-02', result: 'pending', boq_item_id: ID.boqP(2), scope_qty: 200, scope_unit: 'm3' }),
      wir(ID.wirP(4), PROJECT_P, 'SYN-WIR-0004', { inspection_type: 'Rebar cover check (synthetic)', inspection_date: '2026-09-05', result: 'rejected', element_guid: 'syn-el-03' }),
      wir(ID.wirP(5), PROJECT_P, 'SYN-WIR-0005', { inspection_type: 'Column erection (synthetic)', inspection_date: '2026-09-10', result: 'approved', element_guid: 'syn-el-04', approved_qty: 12, approved_unit: 'nr' }),
      wir(ID.wirP(6), PROJECT_P, 'SYN-WIR-0006', { inspection_type: 'Cladding panels bay 1 (synthetic)', inspection_date: null, result: 'in_progress', boq_item_id: ID.boqP(6), scope_qty: 600, scope_unit: 'm2' }),
      wir(ID.wirQ(1), PROJECT_Q, 'SYN-WIR-Q-0001', { inspection_type: 'Decoy WIR — Project Q only (synthetic)', inspection_date: '2026-09-01', result: 'approved', boq_item_id: ID.boqQ(1), approved_qty: 10, approved_unit: 'm3' }),
    ],
    ncrs: [
      { id: 'f0000000-0000-4000-8000-000000000101', project_id: PROJECT_P, ncr_number: 'SYN-NCR-0001', severity: 'major', status: 'open', element_guid: 'syn-el-04', drawing_ref: null, ncr_date: '2026-09-11', raised_by: 'Synthetic Inspector', linked_wir: 'SYN-WIR-0005', cost_impact: 0, description: 'Column verticality outside tolerance (synthetic)', created_by: uid, created_at: T0 },
    ],
    ipcs: [
      { id: 'a0000000-0000-4000-8000-000000000101', project_id: PROJECT_P, ipc_number: 'SYN-IPC-01', period: '2026-08', status: 'certified', gross_amount: 180000, retention: 18000, vat: 24300, net_payable: 186300, cert_date: '2026-09-05', paid_date: null, notes: null, created_by: uid, created_at: '2026-09-05T08:00:00.000Z' },
      { id: 'a0000000-0000-4000-8000-000000000102', project_id: PROJECT_P, ipc_number: 'SYN-IPC-02', period: '2026-09', status: 'draft', gross_amount: 96000, retention: 9600, vat: 12960, net_payable: 99360, cert_date: null, paid_date: null, notes: null, created_by: uid, created_at: '2026-09-28T08:00:00.000Z' },
      { id: 'a0000000-0000-4000-8000-000000000201', project_id: PROJECT_Q, ipc_number: 'SYN-IPC-Q-01', period: '2026-08', status: 'paid', gross_amount: 10000, retention: 1000, vat: 1350, net_payable: 10350, cert_date: '2026-09-01', paid_date: '2026-09-15', notes: null, created_by: uid, created_at: '2026-09-01T08:00:00.000Z' },
    ],
    attachments: [
      { id: '90000000-0000-4000-8000-000000000101', record_type: 'wir', record_id: ID.wirP(1), file_name: 'synthetic-wir-0001-photo.jpg', storage_path: 'synthetic/not-stored/wir-0001.jpg', content_type: 'image/jpeg', size: 51200, uploaded_by: uid, created_at: T0, project_id: PROJECT_P, document_type: 'photo_evidence' },
      { id: '90000000-0000-4000-8000-000000000102', record_type: 'wir', record_id: ID.wirP(2), file_name: 'synthetic-wir-0002-photo.jpg', storage_path: 'synthetic/not-stored/wir-0002.jpg', content_type: 'image/jpeg', size: 48900, uploaded_by: uid, created_at: T0, project_id: PROJECT_P, document_type: 'photo_evidence' },
      { id: '90000000-0000-4000-8000-000000000103', record_type: 'invoice', record_id: ID.inv('0a1'), file_name: 'synthetic-invoice-A.pdf', storage_path: 'synthetic/not-stored/invoice-A.pdf', content_type: 'application/pdf', size: 20480, uploaded_by: uid, created_at: T0, project_id: PROJECT_P, document_type: null },
    ],
    invoices: [
      // A: every editable value differs from the form defaults.
      invoice(INVOICE_IDS.A, PROJECT_P, { invoice_number: 'SYN-INV-A-0001', ipc_ref: 'SYN-IPC-01', issue_date: '2026-08-10', due_date: '2026-09-09', amount: 48250.5, zatca_status: 'Reported', payment_status: 'Pending', element_guid: 'syn-el-04', wir_number: 'SYN-WIR-0002', created_at: '2026-08-10T08:00:00.000Z' }),
      // B: clearly different again, including a paid date.
      invoice(INVOICE_IDS.B, PROJECT_P, { invoice_number: 'SYN-INV-B-0002', issue_date: '2026-09-01', due_date: '2026-10-01', paid_date: '2026-09-20', amount: 13700, zatca_status: 'Cleared', payment_status: 'Paid', element_guid: 'syn-el-06', wir_number: null, created_at: '2026-09-01T08:00:00.000Z' }),
      // Z: legitimate zero amount and every optional field null.
      invoice(INVOICE_IDS.Z, PROJECT_P, { invoice_number: 'SYN-INV-Z-0003', amount: 0, created_at: '2026-09-15T08:00:00.000Z' }),
      // Q decoy: must never appear while Project P is open.
      invoice(INVOICE_IDS.Q, PROJECT_Q, { invoice_number: 'SYN-INV-Q-0001', issue_date: '2026-09-03', due_date: '2026-10-03', amount: 99999, zatca_status: 'Rejected', payment_status: 'Overdue', wir_number: 'SYN-WIR-Q-0001', created_at: '2026-09-03T08:00:00.000Z' }),
    ],
    drawings: [],
    documents: [], snags: [], deliveries: [], purchase_orders: [], vendors: [], qc_tests: [],
    invoice_wir_links: [],
  };
  return store;
}

/**
 * Reference fixtures for the progress-report test service. A report may carry
 * null or { type, id } where id is one of these supplied ids AND belongs to the
 * report's project. WIR references use the WIR number of a fixture WIR above.
 * Display labels are derived at display time from type and id (for example
 * "WIR · SYN-WIR-0003"); they are never part of the payload.
 */
export const PROGRESS_REFERENCE_FIXTURES = Object.freeze({
  area: Object.freeze([
    Object.freeze({ id: 'SYN-AREA-P-BAY-C', projectId: PROJECT_P }),
    Object.freeze({ id: 'SYN-AREA-P-ZONE-2-L1', projectId: PROJECT_P }),
    Object.freeze({ id: 'SYN-AREA-Q-01', projectId: PROJECT_Q }),
  ]),
  work_item: Object.freeze([
    Object.freeze({ id: 'SYN-WI-0101', projectId: PROJECT_P }),
    Object.freeze({ id: 'SYN-WI-0102', projectId: PROJECT_P }),
    Object.freeze({ id: 'SYN-WI-Q-0201', projectId: PROJECT_Q }),
  ]),
  // wir: the wir_number of every fixture WIR (Project P: SYN-WIR-0001 … SYN-WIR-0006; Project Q: SYN-WIR-Q-0001)
});

/**
 * Ready-made test contexts for the composer (none is wired into the app). A general
 * report does not need a WIR, and a reference is never inferred.
 */
export const PROGRESS_CONTEXTS = Object.freeze([
  Object.freeze({ key: 'unassigned', projectId: PROJECT_P, reference: null }),
  Object.freeze({ key: 'area', projectId: PROJECT_P, reference: Object.freeze({ type: 'area', id: 'SYN-AREA-P-BAY-C' }) }),
  Object.freeze({ key: 'work_item', projectId: PROJECT_P, reference: Object.freeze({ type: 'work_item', id: 'SYN-WI-0101' }) }),
  Object.freeze({ key: 'wir', projectId: PROJECT_P, reference: Object.freeze({ type: 'wir', id: 'SYN-WIR-0003' }) }),
]);
