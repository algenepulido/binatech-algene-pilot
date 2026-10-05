// ============================================================
// Functional-role permissions — the single source of truth for "who can see
// and do what", encoding the owner-approved matrix in ROLE_PERMISSION_MATRIX.md.
//
// Two layers:
//   • canView(role, navId)   — module visibility (sidebar + jump search).
//   • can(role, action) / canApprove(role, action) — action capability.
//
// This is the UI layer. The database (RLS) is the real enforcement boundary
// (supabase/access_roles_invites_additive.sql + the per-module policies that
// follow); this keeps the interface honest and uncluttered per role.
// ============================================================

// The eight functional roles (+ owner, normalized to admin).
export const ROLES = [
  { id: 'admin', label: 'Admin', labelAr: 'مدير', desc: 'All modules + manages people & access' },
  { id: 'qs', label: 'QS / Commercial', labelAr: 'حصر كميات / تجاري', desc: 'BoQ, approved quantities, IPCs' },
  { id: 'commercial', label: 'Procurement', labelAr: 'مشتريات', desc: 'POs, supplier invoices, receiving' },
  { id: 'qc_officer', label: 'QC Officer', labelAr: 'ضابط جودة', desc: 'QC tests, NCRs, WIRs' },
  { id: 'site_eng', label: 'Site Engineer / Inspector', labelAr: 'مهندس موقع / مفتش', desc: 'WIRs, QC tests, receiving' },
  { id: 'consultant', label: 'Consultant', labelAr: 'استشاري', desc: 'Review & approve; no contractor cost data' },
  { id: 'client', label: 'Client', labelAr: 'العميل', desc: 'Review & approve; read-only commercial' },
  { id: 'viewer', label: 'Viewer', labelAr: 'مشاهد', desc: 'Read-only + export' },
];

// Map legacy / synonym role values onto the canonical eight.
export function normRole(r) {
  const x = String(r || '').toLowerCase().trim();
  if (x === 'owner') return 'admin';
  if (x === 'inspector' || x === 'field') return 'site_eng';
  if (x === 'qa/qc inspector' || x === 'qa qc inspector') return 'qc_officer';
  if (x === 'site engineer / inspector' || x === 'site engineer') return 'site_eng';
  if (x === 'accountant' || x === 'ap') return 'commercial';
  if (x === 'editor') return 'qs';   // generic editor → broad commercial/QS capability
  return x;
}

export function roleLabel(id, lang = 'en') {
  const m = ROLES.find((r) => r.id === normRole(id));
  return m ? (lang === 'ar' ? m.labelAr : m.label) : (id || '—');
}

// ── Module visibility (ROLE_PERMISSION_MATRIX.md §2), keyed by SIDEBAR nav id.
// A nav id absent here is visible to everyone (general / insight surfaces).
// 🔒 contractor-internal modules are never shown to consultant/client.
const VISIBLE = {
  qc:        ['admin', 'qs', 'qc_officer', 'site_eng', 'consultant', 'client', 'viewer'], // not commercial
  'evidence-packs': ['admin', 'qs', 'commercial', 'qc_officer', 'site_eng', 'consultant'],
  ncrs:      ['admin', 'qs', 'qc_officer', 'consultant', 'client'],
  qs:        ['admin', 'qs', 'commercial', 'consultant'],
  progress:  ['admin', 'qs', 'commercial', 'consultant'],
  commercialhub: ['admin', 'qs', 'commercial', 'consultant'],
  'certification-control-room': ['admin', 'qs', 'commercial', 'consultant'],
  // Same commercial audience as the Control Room it drills into.
  certqueue: ['admin', 'qs', 'commercial', 'consultant'],
  // Field destinations follow the WIR/QC audience — the people on site.
  scan: ['admin', 'qs', 'qc_officer', 'site_eng', 'consultant', 'client', 'viewer'],
  work: ['admin', 'qs', 'qc_officer', 'site_eng', 'consultant', 'client', 'viewer'],
  'payment-applications': ['admin', 'qs', 'commercial', 'consultant'],
  'recovery-queue': ['admin', 'qs', 'commercial', 'consultant'],
  ipcs:      ['admin', 'qs', 'commercial', 'consultant', 'client'],
  invoices:  ['admin', 'qs', 'commercial', 'consultant', 'client'],
  cashflow:  ['admin', 'qs', 'commercial', 'consultant', 'client'],
  pos:       ['admin', 'qs', 'commercial'],          // 🔒
  portal:    ['admin', 'qs', 'commercial'],          // 🔒
  ap:        ['admin', 'qs', 'commercial'],          // 🔒
  readiness: ['admin', 'qs', 'commercial'],          // 🔒
  receiving: ['admin', 'qs', 'commercial', 'qc_officer', 'site_eng'], // 🔒 (not consultant/client)
  team:      ['admin'],                               // user mgmt / invites
};

/** Can this role SEE this sidebar module? Unknown/loading role → show all. */
export function canView(role, navId) {
  if (role == null || role === '') return true;
  const allowed = VISIBLE[navId];
  return allowed ? allowed.includes(normRole(role)) : true;
}

// ── Action capability (ROLE_PERMISSION_MATRIX.md §3). edit = create/edit (E),
// approve = transition-to-approved (A). Absent action → nobody (fail closed).
const CAP = {
  'boq.link':               { edit: ['admin', 'qs', 'commercial'] },
  'wir.edit':               { edit: ['admin', 'qs', 'commercial', 'qc_officer', 'site_eng'] },
  'wir.approve':            { approve: ['admin', 'consultant', 'client'] },
  'qc.record':              { edit: ['admin', 'qc_officer', 'site_eng'] },
  'ncr.edit':               { edit: ['admin', 'qc_officer'] },
  'ncr.close':              { approve: ['admin', 'consultant', 'client'] },
  'boq.edit':               { edit: ['admin', 'qs'] },
  'qty.modify':             { edit: ['admin', 'qs'] },
  'ipc.compose':            { edit: ['admin', 'qs'] },
  'ipc.certify':            { approve: ['admin', 'qs', 'consultant', 'client'] },
  'po.manage':              { edit: ['admin', 'commercial'] },
  'supplierInvoice.manage': { edit: ['admin', 'commercial'] },
  'receiving.log':          { edit: ['admin', 'commercial', 'site_eng'] },
  'user.manage':            { edit: ['admin'] },
};

/** Can this role CREATE/EDIT for this action? Unknown/loading role → DENY (fail
 *  closed). Capabilities must not be enabled before the role is known; module
 *  VISIBILITY (canView) stays permissive so the shell doesn't flicker. */
export function can(role, action) {
  if (role == null || role === '') return false;
  return !!CAP[action]?.edit?.includes(normRole(role));
}

/** Can this role APPROVE/certify for this action? Unknown/loading role → DENY
 *  (fail closed — value-moving actions must never be enabled before role load). */
export function canApprove(role, action) {
  if (role == null || role === '') return false;
  return !!CAP[action]?.approve?.includes(normRole(role));
}

/** True only for admins — convenience for user-management surfaces. */
export const isAdmin = (role) => normRole(role) === 'admin';
