// ============================================================
// Payment Application fixtures — SYNTHETIC demo data for the workspace.
//
// Entirely invented: no real client names, project codes, telephone numbers,
// expiry dates or financial values (confidentiality rule in
// docs/binatech-payment-application-product-model.md §11). The template is
// deliberately IRREGULAR — a part with no part number, optional sections,
// bilingual requirements, nullable expiry, multiple volumes, an
// additional-items section — because real client templates are irregular and
// the renderer must treat the template as data, never as a hardcoded layout.
//
// STATE: demo-badged · read-only · unwired (no Supabase, no persistence).
// ============================================================

/** Mandatory badge — rendered wherever this data appears. */
export const PAW_BADGE = 'SYNTHETIC DEMO — is_backend_derived = false';

/** "Today" for the fixture, pinned so readiness/expiry states are stable. */
export const PAW_TODAY = '2026-08-10';

// ── Versioned submission template (data, not code) ──────────
// Template v2 for the demo contract. NOTE the irregularities on purpose:
//   • Volume 1 / part "General" has NO part number (partNo: null)
//   • "Method Statements" section is OPTIONAL
//   • every label is bilingual {en, ar}
//   • an "Additional & Substituted Items" section exists (extra work intake)
export const DEMO_TEMPLATE = {
  id: 'tpl-demo-v2',
  version: 'v2 (2026-06)',
  supersedes: 'tpl-demo-v1',
  volumes: [
    {
      id: 'vol-1',
      no: 1,
      label: { en: 'Volume 1 — Commercial Submission', ar: 'المجلد ١ — الملف التجاري' },
      parts: [
        {
          id: 'p-general', partNo: null, // irregular: the client's own index has no number here
          label: { en: 'General', ar: 'عام' },
          sections: [
            {
              id: 's-cover', code: 'A', label: { en: 'Cover Letter & Summary', ar: 'خطاب الإحالة والملخص' },
              requirements: [
                { id: 'r-cover-en', required: true, label: { en: 'Cover letter (English)', ar: 'خطاب الإحالة (إنجليزي)' } },
                { id: 'r-cover-ar', required: true, label: { en: 'Cover letter (Arabic)', ar: 'خطاب الإحالة (عربي)' } },
                { id: 'r-summary', required: true, label: { en: 'Application summary sheet', ar: 'ملخص طلب الدفعة' } },
              ],
            },
            {
              id: 's-compliance', code: 'B', label: { en: 'Contractual Compliance', ar: 'الامتثال التعاقدي' },
              requirements: [
                { id: 'r-insurance', required: true, complianceDocId: 'cd-insurance', label: { en: 'Insurance certificate', ar: 'شهادة التأمين' } },
                { id: 'r-bond', required: true, complianceDocId: 'cd-bond', label: { en: 'Performance bond', ar: 'ضمان حسن التنفيذ' } },
                { id: 'r-classification', required: true, complianceDocId: 'cd-classification', label: { en: 'Contractor classification', ar: 'تصنيف المقاول' } },
              ],
            },
            {
              id: 's-method', code: 'C', optional: true, label: { en: 'Method Statements (if requested)', ar: 'بيانات المنهجية (عند الطلب)' },
              requirements: [
                { id: 'r-method', required: false, label: { en: 'Updated method statement', ar: 'بيان المنهجية المحدّث' } },
              ],
            },
          ],
        },
        {
          id: 'p-measure', partNo: '2',
          label: { en: 'Measurement & Valuation', ar: 'الحصر والتقييم' },
          sections: [
            {
              id: 's-boq', code: 'D', label: { en: 'BOQ Progress Statement', ar: 'بيان تقدم جداول الكميات' },
              requirements: [
                { id: 'r-boq-stmt', required: true, label: { en: 'Priced progress statement', ar: 'بيان التقدم المسعّر' } },
                { id: 'r-takeoff', required: true, label: { en: 'Measurement / take-off sheets', ar: 'أوراق الحصر والقياس' } },
              ],
            },
            {
              id: 's-wir', code: 'E', label: { en: 'Inspection & Evidence', ar: 'التفتيش والإثبات' },
              requirements: [
                { id: 'r-wir-index', required: true, label: { en: 'Approved WIR index', ar: 'فهرس طلبات التفتيش المعتمدة' } },
                { id: 'r-photos', required: true, label: { en: 'Progress photographs', ar: 'صور التقدم' } },
              ],
            },
            {
              id: 's-additional', code: 'F', label: { en: 'Additional & Substituted Items', ar: 'البنود الإضافية والمستبدلة' },
              requirements: [
                { id: 'r-additional', required: false, label: { en: 'Additional-items schedule', ar: 'جدول البنود الإضافية' } },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'vol-2',
      no: 2,
      label: { en: 'Volume 2 — Drawings & Records', ar: 'المجلد ٢ — المخططات والسجلات' },
      parts: [
        {
          id: 'p-drawings', partNo: '1',
          label: { en: 'Shop Drawings', ar: 'المخططات التنفيذية' },
          sections: [
            {
              id: 's-drawings', code: 'G', label: { en: 'Issued-for-Construction Drawings', ar: 'مخططات معتمدة للتنفيذ' },
              requirements: [
                { id: 'r-dwg-register', required: true, label: { en: 'Drawing register (current revisions)', ar: 'سجل المخططات (المراجعات الحالية)' } },
                { id: 'r-dwg-pdfs', required: true, label: { en: 'Issued PDF set', ar: 'مجموعة PDF الصادرة' } },
              ],
            },
          ],
        },
      ],
    },
  ],
};

// ── Compliance documents (nullable expiry is first-class) ───
export const DEMO_COMPLIANCE = [
  // valid, expires beyond horizon
  { id: 'cd-insurance', title: 'Insurance certificate', expires_on: '2027-03-01' },
  // expiring INSIDE the validity horizon — must surface as a warning
  { id: 'cd-bond', title: 'Performance bond', expires_on: '2026-08-30' },
  // no expiry defined — legitimate, never treated as expired
  { id: 'cd-classification', title: 'Contractor classification', expires_on: null },
];

// ── Drawings: revisioned records, native DWG ≠ issued PDF ───
export const DEMO_DRAWINGS = [
  {
    id: 'dwg-101', number: 'ST-101', title: 'Foundation Layout — Zone A',
    revisions: [
      {
        id: 'rev-101-p01', rev: 'P01', issuedOn: '2026-05-02',
        artifacts: [
          { id: 'a-101-p01-dwg', kind: 'native_dwg', originalFilename: 'st101_found_zoneA_r1 FINAL(2).dwg' },
          { id: 'a-101-p01-pdf', kind: 'issued_pdf', originalFilename: 'ST-101_P01_signed.pdf', renditionOf: 'a-101-p01-dwg' },
        ],
      },
      {
        id: 'rev-101-p02', rev: 'P02', issuedOn: '2026-07-14',
        artifacts: [
          { id: 'a-101-p02-dwg', kind: 'native_dwg', originalFilename: 'st101_found_zoneA_r2.dwg' },
          { id: 'a-101-p02-pdf', kind: 'issued_pdf', originalFilename: 'ST-101_P02_signed.pdf', renditionOf: 'a-101-p02-dwg' },
        ],
      },
    ],
  },
  {
    id: 'dwg-205', number: 'ST-205', title: 'Pier Reinforcement — Zone B',
    revisions: [
      {
        id: 'rev-205-p01', rev: 'P01', issuedOn: '2026-06-20',
        artifacts: [
          { id: 'a-205-p01-dwg', kind: 'native_dwg', originalFilename: 'pier_reinf_B.dwg' },
          { id: 'a-205-p01-pdf', kind: 'issued_pdf', originalFilename: 'ST-205_P01_signed.pdf', renditionOf: 'a-205-p01-dwg' },
        ],
      },
    ],
  },
];

// ── Measurement details (take-off hierarchy source) ─────────
export const DEMO_MEASUREMENTS = [
  { id: 'm-1', zone: 'Zone A', workType: 'Concrete', bill: 'Bill 03', qty: 120, unit: 'm³' },
  { id: 'm-2', zone: 'Zone A', workType: 'Concrete', bill: 'Bill 03', qty: 45, unit: 'm³' },
  { id: 'm-3', zone: 'Zone A', workType: 'Rebar', bill: 'Bill 04', qty: 18.2, unit: 't' },
  { id: 'm-4', zone: 'Zone B', workType: 'Concrete', bill: 'Bill 03', qty: 82, unit: 'm³' },
  { id: 'm-5', zone: 'Zone B', workType: 'Formwork', bill: 'Bill 05', qty: 640, unit: 'm²' },
];

// ── The demo IPA cycle (application = parent object) ────────
export const DEMO_IPA = {
  id: 'ipa-07',
  no: 7,
  projectCode: 'DEMO',
  period: { label: 'Jul 2026', start: '2026-07-01', end: '2026-07-31' },
  periodEnd: '2026-07-31',
  status: 'returned_for_correction',
  validityHorizonDays: 30,
  template: DEMO_TEMPLATE,
  complianceDocs: DEMO_COMPLIANCE,

  // Document instances against template requirements. r-cover-ar and
  // r-dwg-register are intentionally missing → submission blockers.
  documents: [
    { id: 'doc-cover-en', requirementId: 'r-cover-en', originalFilename: 'covering letter jul FINAL v3.docx', expires_on: null },
    { id: 'doc-summary', requirementId: 'r-summary', originalFilename: 'summary_sheet.xlsx', expires_on: null },
    { id: 'doc-insurance', requirementId: 'r-insurance', originalFilename: 'insurance-2026.pdf', expires_on: '2027-03-01' },
    { id: 'doc-bond', requirementId: 'r-bond', originalFilename: 'bond_scan.pdf', expires_on: '2026-08-30' },
    { id: 'doc-class', requirementId: 'r-classification', originalFilename: 'classification cert.pdf', expires_on: null },
    { id: 'doc-boq-stmt', requirementId: 'r-boq-stmt', originalFilename: 'progress statement.xlsx', expires_on: null },
    { id: 'doc-takeoff', requirementId: 'r-takeoff', originalFilename: 'takeoff_sheets_jul.xlsx', expires_on: null },
    { id: 'doc-wir-index', requirementId: 'r-wir-index', originalFilename: 'wir index.pdf', expires_on: null },
    { id: 'doc-photos', requirementId: 'r-photos', originalFilename: 'photos_jul.zip', expires_on: null },
    // superseded-revision case: PDF set assembled off ST-101 P01 while P02 is current
    { id: 'doc-dwg-pdfs', requirementId: 'r-dwg-pdfs', originalFilename: 'drawing_set_jul.pdf', expires_on: null, revisionSuperseded: true },
  ],

  // Application lines — the proof-chain hub. Values are SYNTHETIC display data.
  lines: [
    {
      id: 'L-1', boqLineId: 'BOQ-03.10.020', elementId: 'IFC-2O3xLk9r', drawingId: 'dwg-101',
      revisionId: 'rev-101-p02', drawingRegion: 'grid C4–C6 / L00', wirId: 'WIR-001013', wirStatus: 'approved',
      measurementId: 'm-1', evidenceIds: ['EV-201', 'EV-202'], requirementId: 'r-boq-stmt',
      desc: 'Zone A foundations — concrete', claimedValue: 412000,
    },
    {
      id: 'L-2', boqLineId: 'BOQ-03.10.031', elementId: 'IFC-8Yt2Qw1a', drawingId: 'dwg-101',
      revisionId: 'rev-101-p01', // ← points at the SUPERSEDED revision on purpose
      drawingRegion: 'grid C1–C3 / L00', wirId: 'WIR-001009', wirStatus: 'approved',
      measurementId: 'm-2', evidenceIds: ['EV-205'], requirementId: 'r-boq-stmt',
      desc: 'Zone A foundations — kickers', claimedValue: 88000,
    },
    {
      id: 'L-3', boqLineId: 'BOQ-04.20.010', elementId: null, drawingId: 'dwg-205',
      revisionId: 'rev-205-p01', drawingRegion: 'grid F2 / L01', wirId: 'WIR-001021', wirStatus: 'pending',
      measurementId: 'm-4', evidenceIds: [], requirementId: 'r-boq-stmt',
      desc: 'Zone B pier stems — concrete', claimedValue: 264000,
    },
    {
      id: 'L-4', boqLineId: 'BOQ-05.05.140', elementId: 'IFC-5Rr8Nn2c', drawingId: null,
      revisionId: null, drawingRegion: null, wirId: 'WIR-001018', wirStatus: 'approved',
      measurementId: null, evidenceIds: ['EV-210'], requirementId: 'r-additional',
      desc: 'Additional item — revised parapet detail', claimedValue: 51000,
    },
  ],

  measurements: DEMO_MEASUREMENTS,

  // Submission snapshots (ordered, immutable once issued) + client returns.
  snapshots: [
    { id: 'snap-r0', rev: 0, submittedOn: '2026-08-03', sections: 9, note: { en: 'Initial submission', ar: 'التقديم الأولي' } },
    { id: 'snap-r1', rev: 1, submittedOn: null, sections: 9, note: { en: 'Correction in progress (this workspace)', ar: 'التصحيح قيد الإعداد (هذه المساحة)' } },
  ],
  returnComments: [
    { id: 'ret-1', on: '2026-08-07', section: 's-drawings', text: { en: 'Drawing set references ST-101 P01; P02 was issued 14 Jul. Resubmit against current revisions.', ar: 'مجموعة المخططات تشير إلى ST-101 P01 بينما صدرت P02 في ١٤ يوليو. يُعاد التقديم وفق المراجعات الحالية.' } },
    { id: 'ret-2', on: '2026-08-07', section: 's-cover', text: { en: 'Arabic cover letter missing.', ar: 'خطاب الإحالة بالعربية غير مرفق.' } },
  ],

  // IPC events — outcomes LINKED to this IPA. The first was superseded by a
  // corrective partial certification: exactly one is currently effective.
  ipcEvents: [
    { id: 'ipc-07a', ref: 'IPC-07', issuedOn: '2026-08-05', status: 'superseded', certifiedValue: 0, note: { en: 'Returned — superseded drawing set', ar: 'أُعيد — مجموعة مخططات ملغاة' } },
    { id: 'ipc-07b', ref: 'IPC-07R1', issuedOn: '2026-08-09', status: 'partially_certified', certifiedValue: 412000, note: { en: 'Zone A concrete certified; balance held pending resubmission', ar: 'تم اعتماد خرسانة المنطقة أ؛ والباقي معلّق حتى إعادة التقديم' } },
  ],

  // Forecast — cycle-scoped, display only.
  forecast: [
    { period: 'Aug 2026', value: 610000 },
    { period: 'Sep 2026', value: 540000 },
  ],
};

// ── AI suggestion previews (PR B reads the ISSUED PDF; here: static) ──
// These are what the intake review queue will hold. In PR A they are synthetic
// previews driving the right-side link panel — the AI runtime is NOT wired.
export const DEMO_SUGGESTIONS = [
  {
    id: 'sug-1', status: 'suggested', boqLineId: 'BOQ-03.10.020', confidence: 0.92,
    reason: 'Drawing title block + schedule row match BOQ description and unit',
    matchedText: 'C30/37 foundation concrete, Zone A grids C4–C6',
    location: 'grid C4–C6 / L00', unitCompatible: true,
    sourceRegion: { drawingId: 'dwg-101', revisionId: 'rev-101-p02', page: 1 },
    warnings: [],
  },
  {
    id: 'sug-2', status: 'suggested', boqLineId: 'BOQ-04.20.010', confidence: 0.61,
    reason: 'Partial description match; quantity column ambiguous between two bills',
    matchedText: 'pier stem C40 — see schedule 2',
    location: 'grid F2 / L01', unitCompatible: true,
    sourceRegion: { drawingId: 'dwg-205', revisionId: 'rev-205-p01', page: 2 },
    warnings: ['Two candidate BOQ lines share this description'],
  },
  {
    id: 'sug-3', status: 'needs_review', boqLineId: null, confidence: null,
    reason: 'Extraction returned an unrecognised unit; human triage required',
    matchedText: 'misc. steel items — LS',
    location: null, unitCompatible: false,
    sourceRegion: { drawingId: 'dwg-205', revisionId: 'rev-205-p01', page: 3 },
    warnings: ['Unit "LS" could not be reconciled with any linked BOQ line'],
  },
];
