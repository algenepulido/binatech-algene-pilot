// ============================================================
// PILOT STARTER ONLY — the complete list of backend operations the starter
// supports. Anything not listed here is rejected and logged (see
// strictSupabase.js). Column lists are baseline-compatible synthetic
// contracts taken from the application's schema at the upstream commit; no
// field is invented. They are not proof of any live database state.
//
// Why each table is here:
//   • Commercial Control (useCommercialData): boq_items, element_boq_links,
//     wirs, ncrs, ipcs, attachments (WIR evidence counts).
//   • Invoices: invoices (list + Create / Save / Delete through controllers),
//     ipcs, wirs, attachments (drawer list), invoice_wir_links (not supported
//     by this isolated starter: simulated unavailable-table response, 42P01).
//   • The real shell around them: projects, project_settings, project_models,
//     model_elements, plus head-count-only reads for the sidebar badges.
//   • Field shell: wirs (Home / Work / Capture), drawings (Find).
// Not supported (rejected): every other table, storage, Edge Functions, RPC,
// realtime, search (ilike), attachment uploads/deletes, WIR-link writes.
// ============================================================

const COLUMNS = {
  projects: ['id', 'name', 'name_ar', 'client', 'consultant', 'contractor', 'status', 'thumbnail_url', 'owner', 'created_at', 'updated_at', 'is_demo', 'company_id', 'deleted_at'],
  project_settings: ['project_id', 'code', 'name', 'name_ar', 'client', 'contractor', 'consultant', 'revision', 'updated_by', 'updated_at'],
  project_models: ['id', 'project_id', 'file_name', 'storage_path', 'version', 'is_active', 'element_count', 'uploaded_by', 'created_at', 'storage_backend', 'file_size'],
  model_elements: ['id', 'project_id', 'model_id', 'guid', 'name', 'ifc_type', 'created_at', 'level', 'package_id', 'volume', 'area', 'length', 'description', 'imported_at', 'user_display_name', 'user_material', 'user_zone', 'user_notes'],
  boq_items: ['id', 'project_id', 'element_id', 'code', 'description', 'unit', 'qty', 'rate', 'approved_qty', 'created_by', 'created_at', 'section', 'package_id', 'position', 'mapped_qty'],
  element_boq_links: ['id', 'project_id', 'element_guid', 'boq_item_id', 'created_at'],
  wirs: ['id', 'project_id', 'wir_number', 'inspection_type', 'element_guid', 'drawing_ref', 'inspector_name', 'inspection_date', 'result', 'remarks', 'created_by', 'created_at', 'boq_item_id', 'scope_type', 'scope_package', 'scope_zone', 'scope_qty', 'scope_unit', 'scope_group_id', 'approved_qty', 'approved_unit', 'work_item_id', 'claimable', 'claim_status'],
  ncrs: ['id', 'project_id', 'ncr_number', 'severity', 'status', 'element_guid', 'drawing_ref', 'ncr_date', 'raised_by', 'linked_wir', 'cost_impact', 'description', 'created_by', 'created_at'],
  ipcs: ['id', 'project_id', 'ipc_number', 'period', 'status', 'gross_amount', 'retention', 'vat', 'net_payable', 'cert_date', 'paid_date', 'notes', 'created_by', 'created_at'],
  attachments: ['id', 'record_type', 'record_id', 'file_name', 'storage_path', 'content_type', 'size', 'uploaded_by', 'created_at', 'project_id', 'document_type'],
  invoices: ['id', 'project_id', 'invoice_number', 'ipc_ref', 'issue_date', 'due_date', 'paid_date', 'amount', 'zatca_status', 'payment_status', 'created_by', 'created_at', 'element_guid', 'wir_number'],
  invoice_wir_links: ['id', 'created_at', 'project_id', 'invoice_id', 'wir_id'],
  drawings: ['id', 'project_id', 'drawing_number', 'rev', 'title', 'discipline', 'status', 'drawing_date', 'size_text', 'linked_elements', 'submitted_by', 'reviewed_by', 'created_by', 'created_at'],
  documents: ['id', 'project_id', 'status'],
  snags: ['id', 'project_id', 'status'],
  deliveries: ['id', 'project_id', 'sdn_status'],
  purchase_orders: ['id', 'project_id', 'status'],
  vendors: ['id', 'project_id'],
  qc_tests: ['id', 'project_id', 'result'],
};

const read = (filters, modifiers = [], extra = {}) => ({ select: { filters, modifiers, ...extra } });
const countOnly = (filters) => ({ select: { filters, modifiers: [], count: true, headOnly: true } });

export const POLICY = {
  tables: {
    projects: { columns: COLUMNS.projects, ...read(['eq'], ['order', 'maybeSingle']) },
    project_settings: { columns: COLUMNS.project_settings, ...read(['eq'], ['maybeSingle']) },
    project_models: { columns: COLUMNS.project_models, ...read(['eq', 'in'], ['order', 'limit', 'maybeSingle']) },
    model_elements: { columns: COLUMNS.model_elements, ...read(['eq'], ['order'], { count: true }) },
    boq_items: { columns: COLUMNS.boq_items, ...read(['eq'], ['order'], { count: true }) },
    element_boq_links: { columns: COLUMNS.element_boq_links, ...read(['eq']) },
    wirs: { columns: COLUMNS.wirs, ...read(['eq', 'in'], ['order'], { count: true }) },
    ncrs: { columns: COLUMNS.ncrs, ...read(['eq'], ['order'], { count: true }) },
    ipcs: { columns: COLUMNS.ipcs, ...read(['eq'], ['order'], { count: true }) },
    attachments: { columns: COLUMNS.attachments, ...read(['eq'], ['order', 'range']) },
    invoices: {
      columns: COLUMNS.invoices,
      ...read(['eq'], ['order'], { count: true }),
      insert: { filters: [], modifiers: ['single'] },
      update: { filters: ['eq'], modifiers: ['single'] },
      delete: { filters: ['eq'], modifiers: [] },
    },
    // Not supported by this isolated starter: every operation gets a simulated unavailable-table response (42P01).
    invoice_wir_links: { columns: COLUMNS.invoice_wir_links, absent: true },
    drawings: { columns: COLUMNS.drawings, ...read(['eq'], ['order'], { count: true }) },
    // Sidebar / status-bar badges only: head counts, never rows.
    documents: { columns: COLUMNS.documents, ...countOnly(['eq', 'in']) },
    snags: { columns: COLUMNS.snags, ...countOnly(['eq', 'in']) },
    deliveries: { columns: COLUMNS.deliveries, ...countOnly(['eq', 'in']) },
    purchase_orders: { columns: COLUMNS.purchase_orders, ...countOnly(['eq']) },
    vendors: { columns: COLUMNS.vendors, ...countOnly(['eq']) },
    qc_tests: { columns: COLUMNS.qc_tests, ...countOnly(['eq']) },
  },
};

/** The tables whose rows can appear in the starter, for the README and smoke tests. */
export const SUPPORTED_TABLES = Object.freeze(Object.keys(POLICY.tables));

// Baseline-compatible synthetic rules for invoices, mirroring the CHECK / NOT NULL constraints in the
// application's schema at the upstream commit (a simulation, not live enforcement).
export const INVOICE_RULES = Object.freeze({
  zatca_status: Object.freeze(['Awaiting IPC', 'Reported', 'Cleared', 'Rejected']),
  payment_status: Object.freeze(['Not Issued', 'Pending', 'Paid', 'Overdue']),
  notNull: Object.freeze(['project_id', 'invoice_number', 'amount', 'zatca_status', 'payment_status']),
});
