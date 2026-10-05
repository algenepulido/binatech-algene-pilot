// ============================================================
// WIR attachment document types — QUALITY EVIDENCE only.
//
// Single source of truth for the upload dropdown, the list badge, and the
// allowed-values contract. The `value`s mirror the CHECK constraint in
// supabase/attachment_document_type_additive.sql — keep the two in sync.
//
// There is deliberately NO 'invoice' type: WIR attachments are quality
// evidence; invoices live on the commercial/IPC side. Do not add it here.
// ============================================================

export const WIR_DOC_TYPES = [
  { value: 'shop_drawing',         en: 'Shop Drawing',         ar: 'مخطط تنفيذي' },
  { value: 'material_submittal',   en: 'Material Submittal',   ar: 'اعتماد مواد' },
  { value: 'test_report',          en: 'Test Report',          ar: 'تقرير اختبار' },
  { value: 'survey_record',        en: 'Survey Record',        ar: 'سجل مساحي' },
  { value: 'photo_evidence',       en: 'Photo Evidence',       ar: 'إثبات بالصور' },
  { value: 'method_statement',     en: 'Method Statement',     ar: 'بيان طريقة عمل' },
  { value: 'inspection_checklist', en: 'Inspection Checklist', ar: 'قائمة فحص' },
  { value: 'delivery_note',        en: 'Delivery Note',        ar: 'إشعار تسليم' },
  { value: 'other',                en: 'Other',                ar: 'أخرى' },
];

// Default selection for the required upload dropdown.
export const DEFAULT_WIR_DOC_TYPE = 'other';

const BY_VALUE = new Map(WIR_DOC_TYPES.map((d) => [d.value, d]));

/** Human label for a stored document_type, in the given language ('en' | 'ar').
 *  Returns null for null/blank so legacy attachments render no badge.
 *  Returns the raw value for an unrecognised code (visible, not hidden). */
export function docTypeLabel(value, lang = 'en') {
  if (!value) return null;
  const d = BY_VALUE.get(value);
  if (!d) return value;
  return lang === 'ar' ? d.ar : d.en;
}
