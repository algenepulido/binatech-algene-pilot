// ============================================================
// commercialStatus — pure EN/AR vocabulary + color tones for the commercial
// certification / invoice-readiness layer (turn approved site progress into certified payment value).
//
// DISPLAY-ONLY: labels + tone colors for statuses, alerts, and the AI-advisory
// affordance. These NEVER compute, certify, or move anything — the authoritative
// readiness engine + money math live in the senior-review lane.
//
// Color rule (the commercial-meeting convention — NOT generic SaaS "success"):
//   grey   = not started
//   green  = in progress / commercially ready (work moving toward invoice)
//   yellow = executed but missing commercial evidence
//   orange = pending / partial consultant review
//   blue   = invoiced / certified in a payment certificate (the 100% end-state)
//   red    = blocked
//   purple = pending variation / change order (value at risk)
// ============================================================

// tone -> pill colors (kept as data so the mapping is testable)
export const TONE_COLORS = {
  grey:   { bg: '#f5f5f4', fg: '#57534e' },
  green:  { bg: '#dcfce7', fg: '#15803d' },
  yellow: { bg: '#fef9c3', fg: '#a16207' },
  orange: { bg: '#ffedd5', fg: '#c2410c' },
  blue:   { bg: '#dbeafe', fg: '#1d4ed8' },
  red:    { bg: '#fee2e2', fg: '#b91c1c' },
  purple: { bg: '#f3e8ff', fg: '#7c3aed' },
};

// Commercial-readiness statuses (the ~19-state lifecycle + a legacy tag).
// Each: { en, ar, tone }. Order is the natural lifecycle progression.
export const COMMERCIAL_STATUS = {
  NOT_STARTED:                     { en: 'Not Started',                       ar: 'لم يبدأ',                           tone: 'grey' },
  WIR_NOT_SUBMITTED:               { en: 'WIR Not Submitted',                 ar: 'لم يُقدَّم طلب فحص',                tone: 'yellow' },
  // Not-approved states must never wear green (green is reserved for approved/
  // certified/paid outcomes — signed-in design QA P0). Submitted-awaiting-
  // approval is "pending consultant review" → orange per the legend above.
  WIR_SUBMITTED_NOT_APPROVED:      { en: 'WIR Submitted — Not Approved',      ar: 'طلب فحص مُقدَّم وغير معتمد',         tone: 'orange' },
  WIR_APPROVED:                    { en: 'WIR Approved',                      ar: 'طلب فحص معتمد',                     tone: 'green' },
  WIR_DATA_INCOMPLETE:             { en: 'WIR Data Incomplete',               ar: 'بيانات طلب الفحص غير مكتملة',        tone: 'yellow' },
  MIR_REQUIRED:                    { en: 'MIR Required',                      ar: 'تقرير فحص المواد مطلوب',            tone: 'yellow' },
  MIR_SUBMITTED_NOT_APPROVED:      { en: 'MIR Submitted — Not Approved',      ar: 'تقرير فحص مواد مُقدَّم وغير معتمد',   tone: 'orange' },
  BLOCKED_BY_NCR:                  { en: 'Blocked by NCR',                    ar: 'موقوف بسبب عدم مطابقة',             tone: 'red' },
  BLOCKED_PENDING_CO:              { en: 'Blocked — Pending Change Order',    ar: 'موقوف بانتظار أمر تغيير',           tone: 'purple' },
  BLOCKED_DUPLICATE_WIR:           { en: 'Blocked — Duplicate WIR',           ar: 'موقوف لتكرار طلب الفحص',            tone: 'red' },
  COMMERCIAL_READY:                { en: 'Commercial Ready',                  ar: 'جاهز تجارياً',                      tone: 'green' },
  READY_FOR_IPA:                   { en: 'Ready for IPA',                     ar: 'جاهز للإدراج في المستخلص',          tone: 'green' },
  IN_IPA_DRAFT:                    { en: 'In IPA Draft',                      ar: 'ضمن مسودة المستخلص',                tone: 'green' },
  SUBMITTED_TO_CONSULTANT:         { en: 'Submitted to Consultant',           ar: 'مُقدَّم إلى الاستشاري',             tone: 'orange' },
  APPROVED_IN_IPA:                 { en: 'Approved in IPA',                   ar: 'معتمد في المستخلص',                 tone: 'blue' },
  PARTIALLY_APPROVED:              { en: 'Partially Approved',                ar: 'معتمد جزئياً',                      tone: 'orange' },
  DEDUCTED_BY_CONSULTANT:          { en: 'Deducted by Consultant',            ar: 'مخصوم من الاستشاري',                tone: 'orange' },
  PAID:                            { en: 'Paid',                              ar: 'مدفوع',                             tone: 'blue' },
  ASSERTED_VARIATION_NOT_APPROVED: { en: 'Claimed Variation — Not Approved', ar: 'تغيير مطالب به وغير معتمد',          tone: 'purple' },
  LEGACY_REVIEW_REQUIRED:          { en: 'Legacy Review Required',            ar: 'مراجعة السجلات السابقة مطلوبة',      tone: 'grey' },
};

export const COMMERCIAL_STATUS_ORDER = Object.keys(COMMERCIAL_STATUS);

// Commercial alerts surfaced on the dashboard. Same { en, ar, tone } shape.
export const COMMERCIAL_ALERTS = {
  READY_BUT_NOT_INVOICED:   { en: 'Ready but Not Invoiced',      ar: 'جاهز ولم يُدرَج في المستخلص',          tone: 'yellow' },
  FINISHED_BUT_BLOCKED:     { en: 'Finished but Blocked',        ar: 'منفذ ولكن موقوف تجارياً',              tone: 'red' },
  PENDING_CO_VALUE_AT_RISK: { en: 'Pending CO — Value at Risk',  ar: 'قيمة معرضة للخطر بانتظار أمر تغيير',    tone: 'purple' },
  CONSULTANT_DELAY:         { en: 'Consultant Response Delayed', ar: 'تأخر رد الاستشاري',                    tone: 'orange' },
  DUPLICATE_WIR_RISK:       { en: 'Duplicate WIR Risk',          ar: 'خطر صرف مكرر على نفس طلب الفحص',        tone: 'red' },
};

export const COMMERCIAL_ALERT_ORDER = Object.keys(COMMERCIAL_ALERTS);

// Standard AI-advisory boundary copy. AI may suggest / flag / explain; it must
// NEVER approve, certify, or move money — only a human commercial role does that.
export const AI_ADVISORY_COPY = {
  en: { label: 'AI advisory only', note: 'AI advisory only. Human commercial approval is required before certification or payment.' },
  ar: { label: 'إرشاد آلي فقط', note: 'إرشاد آلي فقط. يلزم اعتماد تجاري بشري قبل أي اعتماد أو صرف.' },
};

const pick = (lang) => (lang === 'ar' ? 'ar' : 'en');

export function commercialStatusLabel(key, lang = 'en') {
  return COMMERCIAL_STATUS[key]?.[pick(lang)] ?? key;
}
export function commercialStatusTone(key) {
  return COMMERCIAL_STATUS[key]?.tone ?? 'grey';
}
export function commercialAlertLabel(key, lang = 'en') {
  return COMMERCIAL_ALERTS[key]?.[pick(lang)] ?? key;
}
export function commercialAlertTone(key) {
  return COMMERCIAL_ALERTS[key]?.tone ?? 'grey';
}
export function toneColor(tone) {
  return TONE_COLORS[tone] ?? TONE_COLORS.grey;
}
