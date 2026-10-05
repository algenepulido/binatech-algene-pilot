import { COL } from '../lib/theme.js';

export const DRAWINGS = [
  { id: 'SD-STR-101', rev: 'C', title: 'Raft Foundation - Layout & Reinforcement',     discipline: 'Structural',    status: 'Approved',               date: '2026-01-18', size: '3.2 MB', linkedElements: ['FND-01'], submittedBy: 'Fictional Main Contractor', reviewedBy: 'Fictional Design Consultant' },
  { id: 'SD-STR-201', rev: 'C', title: 'Ground Floor Column Layout & Schedule',         discipline: 'Structural',    status: 'Approved',               date: '2026-01-26', size: '2.8 MB', linkedElements: ['COL-G01','COL-G02','COL-G03','COL-G04','COL-G05','COL-G06'], submittedBy: 'Fictional Main Contractor', reviewedBy: 'Fictional Design Consultant' },
  { id: 'SD-STR-210', rev: 'B', title: 'Ground Beam Layout & Details',                  discipline: 'Structural',    status: 'Approved',               date: '2026-02-08', size: '3.0 MB', linkedElements: ['BM-G01','BM-G02','BM-G03','BM-G04'], submittedBy: 'Fictional Main Contractor', reviewedBy: 'Fictional Design Consultant' },
  { id: 'SD-STR-301', rev: 'C', title: 'Level 1 Slab - Reinforcement Layout',           discipline: 'Structural',    status: 'Approved',               date: '2026-02-20', size: '4.1 MB', linkedElements: ['SLB-L01'], submittedBy: 'Fictional Main Contractor', reviewedBy: 'Fictional Design Consultant' },
  { id: 'SD-STR-410', rev: 'B', title: 'Stair / Lift Core - Shear Wall Reinforcement',  discipline: 'Structural',    status: 'Approved',               date: '2026-03-02', size: '3.4 MB', linkedElements: ['CORE-01'], submittedBy: 'Fictional Main Contractor', reviewedBy: 'Fictional Design Consultant' },
  { id: 'SD-STR-320', rev: 'A', title: 'Level 1 Columns & Beam - Layout',               discipline: 'Structural',    status: 'Under Review',           date: '2026-05-09', size: '2.9 MB', linkedElements: ['COL-L101','COL-L102','COL-L103','COL-L104','BM-L101'], submittedBy: 'Fictional Main Contractor', reviewedBy: 'Fictional Design Consultant' },
  { id: 'SD-ARC-101', rev: 'C', title: 'Ground Floor External Wall Elevations',         discipline: 'Architectural', status: 'Approved',               date: '2026-03-15', size: '5.1 MB', linkedElements: ['WALL-GN','WALL-GS','WALL-GW'], submittedBy: 'Fictional Main Contractor', reviewedBy: 'Fictional Design Consultant' },
  { id: 'SD-ARC-120', rev: 'B', title: 'Window Schedule & Details',                     discipline: 'Architectural', status: 'Approved with Comments', date: '2026-04-02', size: '4.3 MB', linkedElements: ['WIN-G01','WIN-G02','WIN-G03','WIN-L101','WIN-L102','WIN-L201'], submittedBy: 'Fictional Main Contractor', reviewedBy: 'Fictional Design Consultant' },
  { id: 'SD-ARC-130', rev: 'A', title: 'Door Schedule & Details',                       discipline: 'Architectural', status: 'Rejected',               date: '2026-05-09', size: '2.2 MB', linkedElements: ['DOOR-G01','DOOR-G02','DOOR-L101'], submittedBy: 'Fictional Main Contractor', reviewedBy: 'Fictional Design Consultant' },
  { id: 'SD-ARC-140', rev: 'B', title: 'Internal Partition Layout - Ground',            discipline: 'Architectural', status: 'Approved',               date: '2026-04-12', size: '3.0 MB', linkedElements: ['PART-G01'], submittedBy: 'Fictional Main Contractor', reviewedBy: 'Fictional Design Consultant' },
  { id: 'SD-ARC-201', rev: 'A', title: 'Level 1 External Wall Elevations',              discipline: 'Architectural', status: 'Under Review',           date: '2026-05-11', size: '4.0 MB', linkedElements: ['WALL-L1N'], submittedBy: 'Fictional Main Contractor', reviewedBy: 'Fictional Design Consultant' }
];

export const REQUIRED_DOCS = {
  permanent:     ['po', 'supplierInvoice', 'signedDn', 'sdn', 'qcMir'],
  'non-permanent': ['po', 'supplierInvoice', 'signedDn', 'sdn'],
  subcontract:   ['paymentCert', 'invoice', 'subcontractRef'],
  service:       ['invoice', 'paymentCertOrServiceApproval', 'agreementRef'],
  equipment:     ['invoice', 'timesheet', 'agreementRef'],
  vehicle:       ['invoice', 'agreementRef'] // timesheet optional; later debit/credit
};

// ============================================================
// Invoice CATEGORY model (three-pillar payment standard): each category needs a
// specific Commitment document + Proof-of-completion document + the Invoice.
// proofSource maps to a signal we can already compute from the evidence chain +
// docs jsonb (see lib/invoiceReadiness.js). Additive — reuses existing linkage.
// ============================================================
export const INVOICE_CATEGORIES = ['Materials', 'Subcontracts', 'General Services', 'Manpower Rental', 'Equipment Rental'];

export const CATEGORY_REQUIREMENTS = {
  Materials:          { commitment: 'Purchase Order',          commitmentDocKey: 'po',             proof: 'Delivery Note',                  proofSource: 'delivery' },
  Subcontracts:       { commitment: 'Subcontract Agreement',   commitmentDocKey: 'subcontractRef', proof: 'Interim Payment Certificate',    proofSource: 'paymentCert' },
  'General Services': { commitment: 'Service Agreement',       commitmentDocKey: 'agreementRef',   proof: 'Certificate of Progress',        proofSource: 'serviceApproval' },
  'Manpower Rental':  { commitment: 'Service Agreement',       commitmentDocKey: 'agreementRef',   proof: 'Approved Timesheet',             proofSource: 'timesheet' },
  'Equipment Rental': { commitment: 'Service Agreement / PO',  commitmentDocKey: 'agreementRef',   proof: 'Approved Timesheet',             proofSource: 'timesheet' },
};

// Fallback: derive a category from the existing inv_type so invoices with no
// category set still get a sensible three-pillar checklist.
const TYPE_TO_CATEGORY = {
  permanent: 'Materials', 'non-permanent': 'Materials',
  subcontract: 'Subcontracts', service: 'General Services',
  equipment: 'Equipment Rental', vehicle: 'Equipment Rental', manpower: 'Manpower Rental',
};
export function categoryForType(invType) { return TYPE_TO_CATEGORY[invType] || 'Materials'; }

export const DOC_LABEL = {
  po: 'PO',
  supplierInvoice: 'Supplier Invoice',
  signedDn: 'Signed DN',
  sdn: 'System DN',
  qcMir: 'QC / MIR',
  paymentCert: 'Payment Certificate',
  invoice: 'Invoice',
  subcontractRef: 'Subcontract Ref',
  paymentCertOrServiceApproval: 'Service Approval',
  agreementRef: 'Agreement Ref',
  timesheet: 'Timesheet'
};

// Supplier-side incoming invoices
export const DOC_TYPES = {
  submittal:   { label: 'Material Submittal',  color: '#2563eb', bg: '#dbeafe' },
  method:      { label: 'Method Statement',    color: '#7c3aed', bg: '#ede9fe' },
  rfi:         { label: 'RFI',                 color: '#d97706', bg: '#fef3c7' },
  mir:         { label: 'MIR',                 color: '#0891b2', bg: '#cffafe' },
  contract:    { label: 'Contract',            color: '#1e3a8a', bg: '#dbeafe' },
  testReport:  { label: 'Test Report',         color: '#16a34a', bg: '#dcfce7' },
  ipcBackup:   { label: 'IPC Backup',          color: '#a16207', bg: '#fef3c7' },
  transmittal: { label: 'Transmittal',         color: '#475569', bg: '#e2e8f0' },
  asBuilt:     { label: 'As-Built',            color: '#16a34a', bg: '#dcfce7' },
  oem:         { label: 'O&M Manual',          color: '#7c3aed', bg: '#ede9fe' },
  drawing:     { label: 'Shop Drawing',        color: '#1d4ed8', bg: '#dbeafe' }
};

export const DOC_STATUS = {
  draft:           { label: 'Draft',                  color: '#78716c', bg: '#f5f5f4' },
  internalReview:  { label: 'Internal Review',        color: '#d97706', bg: '#fef3c7' },
  submitted:       { label: 'Submitted',              color: '#2563eb', bg: '#dbeafe' },
  approved:        { label: 'Approved',               color: '#16a34a', bg: '#dcfce7' },
  approvedC:       { label: 'Approved with Comments', color: '#16a34a', bg: '#dcfce7' },
  reviseResubmit:  { label: 'Revise & Resubmit',      color: '#d97706', bg: '#fef3c7' },
  rejected:        { label: 'Rejected',               color: '#dc2626', bg: '#fee2e2' },
  superseded:      { label: 'Superseded',             color: '#78716c', bg: '#e7e5e4' },
  forConstruction: { label: 'For Construction',       color: '#0891b2', bg: '#cffafe' },
  asBuilt:         { label: 'As-Built',               color: '#16a34a', bg: '#dcfce7' },
  closed:          { label: 'Closed',                 color: '#475569', bg: '#e2e8f0' }
};

// Controlled documents - includes shop drawings (cross-referenced) + submittals/method statements/RFIs/MIRs/contracts/IPC backups
export const CONTROLLED_DOCS = [
  { id: 'DOC-CT-001', no: 'SMP-CT-001',     rev: '00', type: 'contract',    title: 'Main Contract - Sample Residences Block C (fictional)',                discipline: 'Commercial',     status: 'forConstruction', date: '2025-09-01', size: '22.4 MB', linkedElements: [],                          linkedDrawings: [],                       linkedSnags: [], linkedWirs: [], linkedIpcs: [], submittedBy: 'Fictional Developer Co.',        reviewedBy: 'Fictional Main Contractor',          pkg: 'COMM', tags: ['contract','main'] },
  { id: 'DOC-SUB-014', no: 'SMP-SUB-014',   rev: 'B',  type: 'submittal',   title: 'Material Submittal - C40 Concrete Mix Design',            discipline: 'Structural',     status: 'approved',        date: '2026-01-22', size: '4.2 MB',  linkedElements: ['FND-01','COL-G01','SLB-L01'], linkedDrawings: ['SD-STR-101'],      linkedSnags: [], linkedWirs: [], linkedIpcs: [], submittedBy: 'Fictional Readymix Supplier', reviewedBy: 'Fictional Design Consultant', pkg: 'CONC', tags: ['mix-design','concrete'] },
  { id: 'DOC-SUB-018', no: 'SMP-SUB-018',   rev: 'A',  type: 'submittal',   title: 'Material Submittal - Aluminium Window System',            discipline: 'Architectural',  status: 'approvedC',       date: '2026-02-04', size: '8.4 MB',  linkedElements: ['WIN-G01','WIN-G02','WIN-G03'], linkedDrawings: ['SD-ARC-120'],     linkedSnags: [], linkedWirs: [], linkedIpcs: [], submittedBy: 'Fictional Glazing Subcontractor', reviewedBy: 'Fictional Design Consultant', pkg: 'FACADE', tags: ['window','aluminium'] },
  { id: 'DOC-SUB-024', no: 'SMP-SUB-024',   rev: 'B',  type: 'submittal',   title: 'Material Submittal - Blockwork & Render System',          discipline: 'Architectural',  status: 'approved',        date: '2026-03-04', size: '5.6 MB',  linkedElements: ['WALL-GN','WALL-GS','WALL-GW','WALL-L1N'], linkedDrawings: ['SD-ARC-101'], linkedSnags: [], linkedWirs: [], linkedIpcs: [], submittedBy: 'Fictional Main Contractor', reviewedBy: 'Fictional Design Consultant', pkg: 'WALL', tags: ['blockwork','render'] },
  { id: 'DOC-MS-007',  no: 'SMP-MS-007',    rev: 'C',  type: 'method',      title: 'Method Statement - Slab Pour Sequence',                   discipline: 'Structural',     status: 'approved',        date: '2026-02-18', size: '6.8 MB',  linkedElements: ['SLB-L01','SLB-L02'],      linkedDrawings: ['SD-STR-301'],         linkedSnags: [], linkedWirs: [], linkedIpcs: [], submittedBy: 'Fictional Main Contractor',    reviewedBy: 'Fictional Design Consultant', pkg: 'CONC', tags: ['pour','slab'] },
  { id: 'DOC-MS-011',  no: 'SMP-MS-011',    rev: 'B',  type: 'method',      title: 'Method Statement - L1 Column Construction',               discipline: 'Structural',     status: 'reviseResubmit',  date: '2026-05-09', size: '5.1 MB',  linkedElements: ['COL-L101','COL-L102','COL-L103','COL-L104'], linkedDrawings: ['SD-STR-320'], linkedSnags: ['SNG-009'], linkedWirs: ['WIR-0169'], linkedIpcs: [], submittedBy: 'Fictional Main Contractor', reviewedBy: 'Fictional Design Consultant', pkg: 'STR', tags: ['column','sequence'] },
  { id: 'DOC-MS-013',  no: 'SMP-MS-013',    rev: 'A',  type: 'method',      title: 'Method Statement - Door & Window Installation',           discipline: 'Architectural',  status: 'approved',        date: '2026-03-15', size: '7.2 MB',  linkedElements: ['DOOR-G01','DOOR-G02','DOOR-L101','WIN-G01'], linkedDrawings: ['SD-ARC-120','SD-ARC-130'], linkedSnags: [], linkedWirs: [], linkedIpcs: [], submittedBy: 'Fictional Main Contractor', reviewedBy: 'Fictional Design Consultant', pkg: 'FINISH', tags: ['install','openings'] },
  { id: 'DOC-RFI-031', no: 'SMP-RFI-031',   rev: '00', type: 'rfi',         title: 'RFI - Window Head Flashing Detail Clarification',         discipline: 'Architectural',  status: 'approved',        date: '2026-04-12', size: '0.8 MB',  linkedElements: ['WALL-GN'],                linkedDrawings: ['SD-ARC-101'],         linkedSnags: ['SNG-014'], linkedWirs: ['WIR-0153'], linkedIpcs: [], submittedBy: 'Fictional Main Contractor', reviewedBy: 'Fictional Design Consultant', pkg: 'FACADE', tags: ['RFI','flashing'] },
  { id: 'DOC-RFI-038', no: 'SMP-RFI-038',   rev: '00', type: 'rfi',         title: 'RFI - Door Fire-Rating & Fixing Detail',                  discipline: 'Architectural',  status: 'submitted',       date: '2026-05-08', size: '1.2 MB',  linkedElements: ['DOOR-L101'],              linkedDrawings: ['SD-ARC-130'],         linkedSnags: ['SNG-003'], linkedWirs: ['WIR-0162'], linkedIpcs: [], submittedBy: 'Fictional Main Contractor', reviewedBy: 'Fictional Design Consultant', pkg: 'FINISH', tags: ['RFI','door','fire'] },
  { id: 'DOC-MIR-022', no: 'SMP-MIR-022',   rev: '00', type: 'mir',         title: 'MIR - Aluminium Windows Delivery (Batch W-03)',           discipline: 'Architectural',  status: 'approved',        date: '2026-05-04', size: '2.1 MB',  linkedElements: ['WIN-G02','WIN-L101'],     linkedDrawings: [],                     linkedSnags: ['SNG-002'], linkedWirs: ['WIR-0152'], linkedIpcs: [], submittedBy: 'Fictional Glazing Subcontractor', reviewedBy: 'Fictional Design Consultant', pkg: 'FACADE', tags: ['MIR','windows'] },
  { id: 'DOC-TR-014',  no: 'SMP-TR-014',    rev: '00', type: 'testReport',  title: 'Cube Test Report - Foundation & Ground Columns',          discipline: 'Structural',     status: 'approved',        date: '2026-03-01', size: '3.8 MB',  linkedElements: ['FND-01','COL-G01','COL-G02'], linkedDrawings: [],                 linkedSnags: [], linkedWirs: [], linkedIpcs: ['IPC-01'], submittedBy: 'Fictional Test Lab', reviewedBy: 'Fictional Design Consultant', pkg: 'QC', tags: ['cube-test','concrete'] },
  { id: 'DOC-IPC-04A', no: 'SMP-IPC-04-BU', rev: '00', type: 'ipcBackup',   title: 'IPC-04 Backup Pack - Apr 2026',                           discipline: 'Commercial',     status: 'submitted',       date: '2026-05-05', size: '32.6 MB', linkedElements: [],                          linkedDrawings: [],                       linkedSnags: [], linkedWirs: [], linkedIpcs: ['IPC-04'], submittedBy: 'Fictional Main Contractor',    reviewedBy: 'Fictional Design Consultant', pkg: 'COMM', tags: ['IPC','backup'] },
  { id: 'DOC-TX-007',  no: 'SMP-TX-007',    rev: '00', type: 'transmittal', title: 'Transmittal - Window Submittal Package',                  discipline: 'Architectural',  status: 'closed',          date: '2026-02-04', size: '0.4 MB',  linkedElements: [],                          linkedDrawings: ['SD-ARC-120'],         linkedSnags: [], linkedWirs: [], linkedIpcs: [], submittedBy: 'Fictional Main Contractor',    reviewedBy: 'Fictional Design Consultant', pkg: 'FACADE', tags: ['transmittal'] },
  { id: 'DOC-TX-011',  no: 'SMP-TX-011',    rev: '00', type: 'transmittal', title: 'Transmittal - Door Schedule Resubmission',                discipline: 'Architectural',  status: 'submitted',       date: '2026-05-09', size: '0.6 MB',  linkedElements: [],                          linkedDrawings: ['SD-ARC-130'],         linkedSnags: [], linkedWirs: [], linkedIpcs: [], submittedBy: 'Fictional Main Contractor',    reviewedBy: 'Fictional Design Consultant', pkg: 'FINISH', tags: ['transmittal','resubmit'] }
];

// ============================================================
// SNAG / PUNCH LIST ITEMS
// ============================================================
