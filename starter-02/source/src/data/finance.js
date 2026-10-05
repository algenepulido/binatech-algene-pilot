import { Receipt } from 'lucide-react';
import { COL } from '../lib/theme.js';

export const IPCS = [
  { id: 'IPC-01', period: 'Jan 2026', status: 'Paid',      grossAmount: 1240000, retention: 124000, vat: 167400, netPayable: 1283400, certifiedBy: 'Eng. Synthetic QS', certDate: '2026-02-12', paidDate: '2026-03-08', items: 12 },
  { id: 'IPC-02', period: 'Feb 2026', status: 'Paid',      grossAmount: 2185000, retention: 218500, vat: 294975, netPayable: 2261475, certifiedBy: 'Eng. Synthetic QS', certDate: '2026-03-10', paidDate: '2026-04-05', items: 18 },
  { id: 'IPC-03', period: 'Mar 2026', status: 'Paid',      grossAmount: 3120000, retention: 312000, vat: 421200, netPayable: 3229200, certifiedBy: 'Eng. Synthetic QS', certDate: '2026-04-10', paidDate: '2026-05-08', items: 24 },
  { id: 'IPC-04', period: 'Apr 2026', status: 'Certified', grossAmount: 4680000, retention: 468000, vat: 631800, netPayable: 4843800, certifiedBy: 'Eng. Synthetic QS', certDate: '2026-05-05', paidDate: null, items: 32 },
  { id: 'IPC-05', period: 'May 2026', status: 'Draft',     grossAmount: 0, retention: 0, vat: 0, netPayable: 0, certifiedBy: null, certDate: null, paidDate: null, items: 0 }
];

export const INVOICES = [
  { id: 'INV-2026-014', ipcRef: 'IPC-01', issueDate: '2026-02-14', dueDate: '2026-03-15', amount: 1283400, zatcaStatus: 'Cleared',         paymentStatus: 'Paid',    paidDate: '2026-03-08' },
  { id: 'INV-2026-027', ipcRef: 'IPC-02', issueDate: '2026-03-12', dueDate: '2026-04-11', amount: 2261475, zatcaStatus: 'Cleared',         paymentStatus: 'Paid',    paidDate: '2026-04-05' },
  { id: 'INV-2026-038', ipcRef: 'IPC-03', issueDate: '2026-04-12', dueDate: '2026-05-12', amount: 3229200, zatcaStatus: 'Cleared',         paymentStatus: 'Paid',    paidDate: '2026-05-08' },
  { id: 'INV-2026-049', ipcRef: 'IPC-04', issueDate: '2026-05-06', dueDate: '2026-06-05', amount: 4843800, zatcaStatus: 'Cleared',         paymentStatus: 'Pending', paidDate: null },
  { id: 'INV-2026-051', ipcRef: 'IPC-05', issueDate: null,         dueDate: null,         amount: 0,       zatcaStatus: 'Awaiting IPC',    paymentStatus: 'Not Issued', paidDate: null }
];

export const VENDORS = [
  { id: 'V-002', name: 'Fictional Readymix Supplier',  category: 'Material Supplier',    type: 'permanent',     vatNo: 'SYN-VAT-0002', country: 'KSA',  rating: 4.7, paymentTerms: 'Net 45' },
  { id: 'V-003', name: 'Fictional Doors & Windows Supplier',  category: 'Doors & Windows'   ,  type: 'permanent',     vatNo: 'SYN-VAT-0003', country: 'KSA',  rating: 4.9, paymentTerms: 'Net 60' },
  { id: 'V-004', name: 'Fictional Formwork Hire',        category: 'Equipment / Formwork', type: 'non-permanent', vatNo: 'SYN-VAT-0004', country: 'KSA',  rating: 4.5, paymentTerms: 'Net 30' },
  { id: 'V-005', name: 'Fictional Piling Subcontractor',       category: 'Earthworks / Piling',    type: 'non-permanent', vatNo: 'SYN-VAT-0005', country: 'KSA',  rating: 4.6, paymentTerms: 'Net 45' },
  { id: 'V-006', name: 'Fictional Glazing Subcontractor',         category: 'Facade Subcontractor'   , type: 'subcontract', vatNo: 'SYN-VAT-0006', country: 'KSA',  rating: 4.8, paymentTerms: 'IPC-linked' },
  { id: 'V-007', name: 'Fictional Waterproofing Subcontractor',               category: 'Waterproofing Sub',    type: 'subcontract',   vatNo: 'SYN-VAT-0007', country: 'KSA',  rating: 4.7, paymentTerms: 'IPC-linked' },
  { id: 'V-008', name: 'Fictional Survey Services',        category: 'Survey Services'    , type: 'service',      vatNo: 'SYN-VAT-0008', country: 'KSA',  rating: 4.4, paymentTerms: 'Net 30' },
  { id: 'V-009', name: 'Fictional Crane Rental',             category: 'Crane Rental'        ,  type: 'equipment',     vatNo: 'SYN-VAT-0009', country: 'KSA',  rating: 4.6, paymentTerms: 'Net 45' },
  { id: 'V-010', name: 'Fictional Vehicle Rental',    category: 'Vehicle Rental',       type: 'vehicle',       vatNo: 'SYN-VAT-0010', country: 'KSA',  rating: 4.1, paymentTerms: 'Net 30' }
];

export const POS = [
  { id: 'PO-2026-021', type: 'permanent',     vendor: 'V-002', vendorName: 'Fictional Readymix Supplier', desc: 'C40 Concrete - 620 m3        ',    linkedBoq: 'A.01.01, A.01.02, B.01.01, B.01.02, C.01.01', linkedElements: ['FND-01','CORE-01','COL-G03','COL-G01','SLB-L01','COL-G03','SLB-L01','BM-G01','WIN-G02','WALL-GN'], value: 8470000, delivered: 1820, deliveredPct: 65, issued: '2026-01-08', status: 'Open', billTo: 'Fictional Main Contractor / SYN-SAMPLE' },
  { id: 'PO-2026-033', type: 'permanent',     vendor: 'V-003', vendorName: 'Fictional Doors & Windows Supplier', desc: 'Aluminium windows & doors    ',     linkedBoq: 'B.01.02, C.01.01, C.01.02',                   linkedElements: ['SLB-L01','SLB-L01','BM-G01','WIN-G02','WALL-GN','COL-G05'],                                value: 3220000,  delivered: 1450, deliveredPct: 45, issued: '2026-02-15', status: 'Open', billTo: 'Fictional Main Contractor / SYN-SAMPLE' },
  { id: 'PO-2026-041', type: 'non-permanent', vendor: 'V-004', vendorName: 'Fictional Formwork Hire',       desc: 'Wall & slab formwork hire     ', linkedBoq: 'Preliminaries',                              linkedElements: [],                                                                              value: 1840000,  delivered: 100, deliveredPct: 100, issued: '2025-11-30', status: 'Open', billTo: 'Fictional Main Contractor / SYN-SAMPLE' },
  { id: 'PO-2026-048', type: 'non-permanent', vendor: 'V-005', vendorName: 'Fictional Piling Subcontractor',      desc: 'Raft excavation, blinding & WP',     linkedBoq: 'A.01.01, A.01.02',                            linkedElements: ['FND-01','CORE-01','COL-G03'],                                                     value: 6580000,  delivered: 100, deliveredPct: 100, issued: '2025-10-12', status: 'Open', billTo: 'Fictional Main Contractor / SYN-SAMPLE' },
  { id: 'SC-2026-006', type: 'subcontract',   vendor: 'V-006', vendorName: 'Fictional Glazing Subcontractor',        desc: 'Facade glazing package        ',   desc2: 'Curtain wall + windows incl install & test', linkedBoq: 'D.01.01',                                  linkedElements: ['WIN-G01','WIN-G03','WIN-L101','WIN-L102','WIN-L201','DOOR-G01'], value: 12800000, delivered: 24,  deliveredPct: 24, issued: '2026-01-15', status: 'Open', billTo: 'Fictional Main Contractor / SYN-SAMPLE' },
  { id: 'SC-2026-009', type: 'subcontract',   vendor: 'V-007', vendorName: 'Fictional Waterproofing Subcontractor',              desc: 'Roof & wet-area waterproofing',          linkedBoq: 'C.02.01',                                     linkedElements: ['SLB-L01','BM-G01','WIN-G02','WALL-GN'],                                                value: 1840000, delivered: 28, deliveredPct: 28, issued: '2026-03-02', status: 'Open', billTo: 'Fictional Main Contractor / SYN-SAMPLE' },
  { id: 'SA-2026-002', type: 'service',       vendor: 'V-008', vendorName: 'Fictional Survey Services',       desc: 'Setting out & survey services',  linkedBoq: 'Preliminaries',                              linkedElements: [],                                                                              value: 380000,  delivered: 6,   deliveredPct: 75, issued: '2025-12-20', status: 'Open', billTo: 'Fictional Main Contractor / SYN-SAMPLE' },
  { id: 'EQ-2026-003', type: 'equipment',     vendor: 'V-009', vendorName: 'Fictional Crane Rental',            desc: 'Tower crane 280 EC-B - 14 months',   linkedBoq: 'Preliminaries',                              linkedElements: [],                                                                              value: 2480000, delivered: 7,   deliveredPct: 50, issued: '2025-12-01', status: 'Open', billTo: 'Fictional Main Contractor / SYN-SAMPLE' },
  { id: 'VR-2026-001', type: 'vehicle',       vendor: 'V-010', vendorName: 'Fictional Vehicle Rental',   desc: '8× light vehicles - 18 months',      linkedBoq: 'Preliminaries',                              linkedElements: [],                                                                              value: 678000,  delivered: 9,   deliveredPct: 50, issued: '2025-11-20', status: 'Open', billTo: 'Fictional Main Contractor / SYN-SAMPLE' }
];

export const DELIVERIES = [
  { id: 'DN-2026-031', poRef: 'PO-2026-021', vendor: 'Fictional Readymix Supplier', date: '2026-04-04', items: 'C40 Concrete',             qty: '120 m³', signedDn: true,  sdnStatus: 'Approved',     sdnId: 'SDN-0078', sdnApprover: 'M. Hussein (Warehouse)', sdnDate: '2026-04-04', priority: true,  qcRef: 'QC-0054' },
  { id: 'DN-2026-038', poRef: 'PO-2026-014', vendor: 'Fictional Steel Supplier',             date: '2026-04-08', items: 'Rebar 25mm B500B',         qty: '85 t',   signedDn: true,  sdnStatus: 'Approved',     sdnId: 'SDN-0089', sdnApprover: 'M. Hussein (Warehouse)', sdnDate: '2026-04-08', priority: false, qcRef: 'QC-0061' },
  { id: 'DN-2026-042', poRef: 'PO-2026-021', vendor: 'Fictional Readymix Supplier', date: '2026-04-21', items: 'C40 Concrete',             qty: '95 m³',  signedDn: true,  sdnStatus: 'Approved',     sdnId: 'SDN-0093', sdnApprover: 'M. Hussein (Warehouse)', sdnDate: '2026-04-21', priority: true,  qcRef: null },
  { id: 'DN-2026-051', poRef: 'PO-2026-033', vendor: 'Fictional Doors & Windows Supplier', date: '2026-05-02', items: 'Window units (set)',         qty: '12 t',   signedDn: true,  sdnStatus: 'Approved',     sdnId: 'SDN-0102', sdnApprover: 'M. Hussein (Warehouse)', sdnDate: '2026-05-02', priority: true,  qcRef: 'QC-0052' },
  { id: 'DN-2026-058', poRef: 'PO-2026-021', vendor: 'Fictional Readymix Supplier', date: '2026-05-01', items: 'C40 Concrete',             qty: '67 m³',  signedDn: true,  sdnStatus: 'Approved',     sdnId: 'SDN-0107', sdnApprover: 'M. Hussein (Warehouse)', sdnDate: '2026-05-01', priority: true,  qcRef: null },
  { id: 'DN-2026-064', poRef: 'PO-2026-033', vendor: 'Fictional Doors & Windows Supplier', date: '2026-05-08', items: 'Door frames + ironmongery',    qty: '48 set', signedDn: true,  sdnStatus: 'Pending QC',   sdnId: 'SDN-0114', sdnApprover: 'M. Hussein (Warehouse)', sdnDate: '2026-05-08', priority: false, qcRef: null },
  { id: 'DN-2026-067', poRef: 'PO-2026-014', vendor: 'Fictional Steel Supplier',             date: '2026-05-11', items: 'Rebar 25mm B500B',         qty: '42 t',   signedDn: true,  sdnStatus: 'Pending SDN',  sdnId: null,       sdnApprover: 'M. Hussein (Warehouse)', sdnDate: null,         priority: true,  qcRef: null },
  { id: 'DN-2026-069', poRef: 'PO-2026-033', vendor: 'Fictional Doors & Windows Supplier', date: '2026-05-12', items: 'Window restrictor stays',          qty: '180 pcs',signedDn: false, sdnStatus: 'Pending DN',  sdnId: null,       sdnApprover: null,                      sdnDate: null,         priority: false, qcRef: null },
  { id: 'DN-2026-070', poRef: 'PO-2026-021', vendor: 'Fictional Readymix Supplier', date: '2026-05-13', items: 'C40 Concrete',             qty: '45 m³',  signedDn: true,  sdnStatus: 'Pending SDN',  sdnId: null,       sdnApprover: 'M. Hussein (Warehouse)', sdnDate: null,         priority: true,  qcRef: null },
  { id: 'DN-2026-071', poRef: 'PO-2026-014', vendor: 'Fictional Steel Supplier',             date: '2026-05-13', items: 'Rebar 20mm B500B',         qty: '28 t',   signedDn: true,  sdnStatus: 'Rejected',     sdnId: 'SDN-0118', sdnApprover: 'M. Hussein (Warehouse)', sdnDate: '2026-05-13', priority: false, qcRef: null, rejectionReason: 'Mill cert mismatch - Heat # not matching DN' }
];

// Required document logic by invoice type
export const SUPPLIER_INVOICES = [
  { id: 'SI-2026-201', vendor: 'V-002', vendorName: 'Fictional Readymix Supplier', type: 'permanent',     poRef: 'PO-2026-021', amount: 712250,  vat: 106838,  submitted: '2026-04-25', docs: { po: true,  supplierInvoice: true,  signedDn: true,  sdn: true,  qcMir: true  }, status: 'Paid',                  approver: null,                ageDays: 18, paidDate: '2026-05-12' },
  { id: 'SI-2026-223', vendor: 'V-002', vendorName: 'Fictional Readymix Supplier', type: 'permanent',     poRef: 'PO-2026-021', amount: 187750,  vat: 28163,   submitted: '2026-05-06', docs: { po: true,  supplierInvoice: true,  signedDn: true,  sdn: true,  qcMir: false }, status: 'Pending QC',            approver: 'Eng. Synthetic M',    ageDays: 7 },
  { id: 'SI-2026-227', vendor: 'V-003', vendorName: 'Fictional Doors & Windows Supplier', type: 'permanent',     poRef: 'PO-2026-033', amount: 432000,  vat: 64800,   submitted: '2026-05-09', docs: { po: true,  supplierInvoice: true,  signedDn: true,  sdn: false, qcMir: false }, status: 'Pending SDN',           approver: 'M. Hussein',        ageDays: 4 },
  { id: 'SI-2026-229', vendor: 'V-004', vendorName: 'Fictional Formwork Hire',       type: 'non-permanent', poRef: 'PO-2026-041', amount: 180000,  vat: 27000,   submitted: '2026-05-09', docs: { po: true,  supplierInvoice: true,  signedDn: true,  sdn: true                  }, status: 'Pending PM Approval',   approver: 'Synthetic Project Manager',    ageDays: 4 },
  { id: 'SI-2026-231', vendor: 'V-005', vendorName: 'Fictional Piling Subcontractor',      type: 'non-permanent', poRef: 'PO-2026-048', amount: 854500,  vat: 128175,  submitted: '2026-05-10', docs: { po: true,  supplierInvoice: true,  signedDn: true,  sdn: true                  }, status: 'Ready for Accounting',  approver: null,                ageDays: 3 },
  { id: 'SI-2026-234', vendor: 'V-006', vendorName: 'Fictional Glazing Subcontractor',        type: 'subcontract',   poRef: 'SC-2026-006', amount: 2920000, vat: 438000,  submitted: '2026-05-10', docs: { paymentCert: true,  invoice: true,  subcontractRef: true }, status: 'Pending PD Approval',  approver: 'PD: Synthetic PD',  ageDays: 3 },
  { id: 'SI-2026-236', vendor: 'V-007', vendorName: 'Fictional Waterproofing Subcontractor',              type: 'subcontract',   poRef: 'SC-2026-009', amount: 526000,  vat: 78900,   submitted: '2026-05-11', docs: { paymentCert: false, invoice: true,  subcontractRef: true }, status: 'Pending Site Validation', approver: 'Eng. Synthetic M',  ageDays: 2 },
  { id: 'SI-2026-238', vendor: 'V-008', vendorName: 'Fictional Survey Services',       type: 'service',       poRef: 'SA-2026-002', amount: 95000,   vat: 14250,   submitted: '2026-05-11', docs: { invoice: true, paymentCertOrServiceApproval: true,  agreementRef: true }, status: 'Ready for Accounting', approver: null, ageDays: 2 },
  { id: 'SI-2026-240', vendor: 'V-009', vendorName: 'Fictional Crane Rental',            type: 'equipment',     poRef: 'EQ-2026-003', amount: 195000,  vat: 29250,   submitted: '2026-05-12', docs: { invoice: true, timesheet: true,  agreementRef: true }, status: 'In Accounting Review',  approver: 'AP: Synthetic AP Clerk',    ageDays: 1 },
  { id: 'SI-2026-242', vendor: 'V-010', vendorName: 'Fictional Vehicle Rental',   type: 'vehicle',       poRef: 'VR-2026-001', amount: 52000,   vat: 7800,    submitted: '2026-05-12', docs: { invoice: true, agreementRef: true }, status: 'Ready for Accounting',  approver: null,           ageDays: 1, exceptionNote: 'Timesheet pending - debit/credit at month end' },
  { id: 'SI-2026-244', vendor: 'V-003', vendorName: 'Fictional Doors & Windows Supplier', type: 'permanent',     poRef: null,          amount: 164800,  vat: 24720,   submitted: '2026-05-13', docs: { po: false, supplierInvoice: true,  signedDn: true,  sdn: false, qcMir: false }, status: 'Blocked',         approver: 'Procurement: Synthetic Buyer', ageDays: 0, exceptionNote: 'Missing PO reference - escalated to Procurement' },
];

export const APPROVAL_MATRIX = [
  { tier: 'T1', threshold: 'Up to SAR 100K',           types: 'Permanent, Non-perm, Service', primary: 'PM (Synthetic Project Manager)',     backup: 'Snr PE (Synthetic Engineer M)',     delegate: null },
  { tier: 'T2', threshold: 'SAR 100K - 500K',         types: 'Permanent, Non-perm, Service', primary: 'PM + Procurement Mgr',    backup: 'Snr PE + Snr Procurement', delegate: null },
  { tier: 'T3', threshold: 'SAR 500K - 2M',           types: 'All types',                    primary: 'PD (Synthetic PD)',       backup: 'PM (Synthetic Project Manager)',    delegate: 'Active 2026-05-15 → 22 to Snr PM' },
  { tier: 'T4', threshold: 'Above SAR 2M',            types: 'All types',                    primary: 'GM Construction',         backup: 'PD (Synthetic PD)',      delegate: null },
  { tier: 'SC', threshold: 'Any subcontract IPC',     types: 'Subcontract',                  primary: 'QS + PM + Commercial Dir', backup: 'Snr QS',                delegate: null },
  { tier: 'EX', threshold: 'Missing PO / Exception',  types: 'Any',                          primary: 'Procurement Mgr',         backup: 'Commercial Dir',         delegate: null }
];

export const DELAY_METRICS = {
  stages: [
    { label: 'Delivery → Invoice Receipt',          avgDays: 9.4, target: 5,  responsible: 'Supplier',   isInternal: false },
    { label: 'Invoice Receipt → SDN',                avgDays: 2.1, target: 1,  responsible: 'Warehouse',  isInternal: true  },
    { label: 'SDN → QC Approval',                    avgDays: 3.8, target: 3,  responsible: 'QC',         isInternal: true  },
    { label: 'QC → Site Validation',                 avgDays: 2.6, target: 2,  responsible: 'Site',       isInternal: true  },
    { label: 'Site Validation → PM/PD Approval',     avgDays: 7.2, target: 3,  responsible: 'PM / PD',    isInternal: true  },
    { label: 'PM/PD Approval → Accounting Submit',   avgDays: 1.8, target: 1,  responsible: 'Procurement', isInternal: true },
    { label: 'Accounting Submit → Payment',          avgDays: 14.5, target: 10, responsible: 'Accounting', isInternal: true }
  ],
  totalAvg: 41.4,
  totalTarget: 25,
  supplierAvg: 9.4,
  internalAvg: 32.0,
  monthlyTrend: [{ m: 'Dec', d: 48 }, { m: 'Jan', d: 46 }, { m: 'Feb', d: 44 }, { m: 'Mar', d: 43 }, { m: 'Apr', d: 42 }, { m: 'May', d: 41.4 }]
};

export const AUDIT_LOG = [
  { ts: '2026-05-13 09:31', actor: 'Eng. Synthetic A', action: 'Started inspection', target: 'WIR-0175 / BM-L101' },
  { ts: '2026-05-13 08:42', actor: 'System', action: 'IFC model synced from ACC', target: 'Rev C-04' },
  { ts: '2026-05-13 07:55', actor: 'Eng. Synthetic S', action: 'Started concrete pour', target: 'WIR-0173 / COL-G05' },
  { ts: '2026-05-12 16:02', actor: 'Synthetic Project Director', action: 'Drafted IPC line items', target: 'IPC-05 / 3 items' },
  { ts: '2026-05-12 11:30', actor: 'Eng. Synthetic A', action: 'Scheduled inspection', target: 'WIR-0171 / WALL-GS' },
  { ts: '2026-05-12 10:18', actor: 'Fictional Glazing Subcontractor', action: 'Submitted WIR', target: 'WIR-0169 / COL-L101' },
  { ts: '2026-05-11 14:25', actor: 'Eng. Synthetic A', action: 'Submitted WIR', target: 'WIR-0167 / COL-G03' },
  { ts: '2026-05-09 11:08', actor: 'Eng. Synthetic QS', action: 'Rejected drawing', target: 'SD-ARC-130 Rev A' },
  { ts: '2026-05-08 15:47', actor: 'Eng. Synthetic QS', action: 'Raised Critical NCR', target: 'NCR-0023 / DOOR-L101' },
  { ts: '2026-05-06 09:12', actor: 'Eng. Synthetic QS', action: 'Certified IPC', target: 'IPC-04 / SAR 4,843,800' },
  { ts: '2026-05-05 16:30', actor: 'Synthetic Project Director', action: 'Submitted IPC for certification', target: 'IPC-04' },
  { ts: '2026-05-03 10:22', actor: 'Fictional Test Lab', action: 'Logged test result', target: 'QC-0052 / 45.3 MPa Pass' }
];

// ============================================================
// CONTROLLED DOCUMENTS (DMS) - submittals, method statements, RFIs, MIRs, contracts, IPC backup, transmittals
// ============================================================
