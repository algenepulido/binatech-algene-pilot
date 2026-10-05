// ============================================================
// wirMetadata — pure DISPLAY deriver for a WIR's commercial/inspection metadata
// (spec PART 3). The base wirs table only has a few of these columns; the rest
// require a backend-lane schema migration. Per the "realistic mocked-or-existing
// data" guidance, this surfaces EXISTING fields with real values and the missing
// ones with realistic, clearly-FLAGGED illustrative values (illustrative:true).
// Illustrative values are display-only and never feed certification gating.
// ============================================================

const DISCIPLINE = {
  CIVIL: { en: 'Civil', ar: 'مدني' },
  STRUCTURAL: { en: 'Structural', ar: 'إنشائي' },
  ARCHITECTURAL: { en: 'Architectural', ar: 'معماري' },
  MEP: { en: 'MEP', ar: 'كهروميكانيك' },
  ELECTRICAL: { en: 'Electrical', ar: 'كهربائي' },
  INFRASTRUCTURE: { en: 'Infrastructure', ar: 'بنية تحتية' },
  FIRE_FIGHTING: { en: 'Fire Fighting', ar: 'مكافحة حريق' },
  OTHER: { en: 'Other', ar: 'أخرى' },
};

// Best-effort discipline inference from the free-text inspection type (there is
// no discipline column yet) — illustrative, not authoritative.
export function deriveDiscipline(inspectionType = '') {
  const s = String(inspectionType || '').toLowerCase();
  if (/fire/.test(s)) return 'FIRE_FIGHTING';
  if (/concret|rebar|steel|structur|formwork|foundation|pile|column|beam|slab/.test(s)) return 'STRUCTURAL';
  if (/electric|cable|lighting|\bpower\b/.test(s)) return 'ELECTRICAL';
  if (/mep|hvac|mechanic|duct|\bpipe|plumb/.test(s)) return 'MEP';
  if (/architect|finish|paint|tile|block|partition|door|window|plaster/.test(s)) return 'ARCHITECTURAL';
  if (/road|asphalt|pavement|infra|drainage|utility|earthwork/.test(s)) return 'INFRASTRUCTURE';
  return 'CIVIL';
}

const RESULT = {
  approved: { en: 'Approved', ar: 'معتمد' },
  rejected: { en: 'Rejected', ar: 'مرفوض' },
  in_progress: { en: 'In Progress', ar: 'قيد التنفيذ' },
  pending: { en: 'Pending', ar: 'بانتظار' },
};

// Returns rows [{ label, value, illustrative }] for read-only display.
export function deriveWirMetadata(wir = {}, lang = 'en') {
  const ar = lang === 'ar';
  const lab = (en, arr) => (ar ? arr : en);
  const dash = '—';
  const disc = DISCIPLINE[deriveDiscipline(wir.inspection_type)] || DISCIPLINE.OTHER;
  const approved = /approv/i.test(String(wir.result || ''));
  const res = RESULT[wir.result];

  return [
    { label: lab('WIR number', 'رقم طلب الفحص'), value: wir.wir_number || dash, illustrative: false },
    { label: lab('Discipline', 'التخصص'), value: ar ? disc.ar : disc.en, illustrative: true },
    { label: lab('Inspection type', 'نوع الفحص'), value: wir.inspection_type || dash, illustrative: false },
    { label: lab('Date issued', 'تاريخ الإصدار'), value: wir.inspection_date || dash, illustrative: false },
    { label: lab('Date approved', 'تاريخ الاعتماد'), value: approved ? (wir.inspection_date || dash) : dash, illustrative: true },
    { label: lab('Approval status', 'حالة الاعتماد'), value: res ? (ar ? res.ar : res.en) : (wir.result || dash), illustrative: false },
    { label: lab('Inspected / issued by', 'المُصدِر / المفتش'), value: wir.inspector_name || dash, illustrative: false },
    { label: lab('Issuer company', 'شركة المُصدِر'), value: lab('Contractor', 'المقاول'), illustrative: true },
    { label: lab('Approved by', 'اعتمده'), value: lab('Consultant reviewer', 'مراجع الاستشاري'), illustrative: true },
    { label: lab('Approval authority', 'جهة الاعتماد'), value: lab('Consultant', 'الاستشاري'), illustrative: true },
    { label: lab('Linked BoQ', 'بند الكميات المرتبط'), value: wir.boq_item_id ? lab('Linked', 'مرتبط') : lab('Not linked', 'غير مرتبط'), illustrative: false },
    { label: lab('Approved qty', 'الكمية المعتمدة'), value: wir.approved_qty != null ? `${wir.approved_qty} ${wir.approved_unit || ''}`.trim() : dash, illustrative: false },
    { label: lab('Claim status', 'حالة المطالبة'), value: wir.claim_status || dash, illustrative: false },
  ];
}
