// ============================================================
// ipcGate — pure, READ-ONLY evaluator for the IPC Certification Gate.
// Turn approved site progress into certified payment value: certification must clear evidence-based prerequisite
// checks. This evaluates the checks COMPUTABLE from existing data and marks the
// rest as Pending (a backend-lane module is not wired yet) — it NEVER fabricates
// a pass, NEVER recomputes or writes money, and NEVER certifies anything. The UI
// uses `hardBlockers` to disable the final Certify action; the actual certify
// mutation is unchanged and triggered only by an explicit human confirmation.
// ============================================================
import { computeIpc } from './ipcStatus.js';

export const GATE_STATUS = { PASS: 'pass', WARN: 'warn', BLOCK: 'block', NA: 'na' };

const n = (v) => Number(v || 0);
const present = (v) => v != null && String(v).trim() !== '';

// Evaluate from already-derived numbers (the view computes these from the BoQ
// composition + waterfall it already builds — see IPCsView/boqReadiness).
export function evaluateIpcGate({
  ipc = {}, certifiableValue = 0, provenValue = 0, blockedValue = 0, mappedValue = 0,
  provenCount = 0, blockedCount = 0, canCertify = true,
} = {}) {
  const gross = n(ipc.gross_amount);
  const identityOk = present(ipc.ipc_number) && present(ipc.period) && gross > 0 && present(ipc.net_payable);
  const hasEarned = certifiableValue > 0.5;
  const hasBlock = blockedValue > 0.5 || blockedCount > 0;

  // Financial consistency — DISPLAY ONLY. Re-derives retention/VAT/net from gross
  // and compares to the stored values; it never writes them back.
  const recomputed = computeIpc(gross);
  const finOk = Math.abs(recomputed.retention - n(ipc.retention)) <= 1
    && Math.abs(recomputed.vat - n(ipc.vat)) <= 1
    && Math.abs(recomputed.net - n(ipc.net_payable)) <= 1;

  const sections = [
    { id: 'summary', items: [{ key: 'identity', status: identityOk ? 'pass' : 'block' }] },
    { id: 'evidence', items: [
      { key: 'certifiableValue', status: hasEarned ? 'pass' : 'block' },
      { key: 'wirEvidence', status: hasBlock ? 'warn' : 'pass' },
      { key: 'mir', status: 'na' },
    ] },
    { id: 'wir', items: [
      { key: 'coverage', status: provenValue < mappedValue - 0.5 ? 'warn' : 'pass' },
      { key: 'wirMetadata', status: 'na' },
    ] },
    { id: 'boq', items: [
      { key: 'valueAtRisk', status: hasBlock ? 'warn' : 'pass' },
      // HONESTY BOUNDARY — must never be 'pass'. The cumulative contract-cap
      // check is NOT evaluated here: the cap is a server-side invariant and no
      // backend enforcement is connected. Rendering a green "Passed" for a
      // check that is never computed is a fabricated assurance on the exact
      // invariant this product exists to protect. It stays 'na' ("Not
      // evaluated") until a server-side gate computes it. Pinned by
      // ipcGate.test.js — do not "fix" this by computing the cap in the
      // browser; a client-side cap is not enforcement.
      { key: 'overclaim', status: 'na' },
      { key: 'ledger', status: 'na' },
    ] },
    { id: 'ncr', items: [
      { key: 'openNcr', status: hasBlock ? 'block' : 'pass' },
      { key: 'co', status: 'na' },
    ] },
    { id: 'finance', items: [
      { key: 'consistency', status: finOk ? 'pass' : 'warn' },
      { key: 'advance', status: 'na' },
    ] },
    { id: 'audit', items: [{ key: 'permission', status: canCertify ? 'pass' : 'block' }] },
  ];

  const rank = { block: 3, warn: 2, pass: 1, na: 0 };
  for (const s of sections) {
    let roll = 'na';
    for (const it of s.items) if (rank[it.status] > rank[roll]) roll = it.status;
    if (roll === 'na' && s.items.some((i) => i.status === 'pass')) roll = 'pass';
    s.status = roll;
  }

  const hardBlockers = sections.flatMap((s) => s.items.filter((i) => i.status === 'block').map((i) => ({ section: s.id, key: i.key })));
  const warnings = sections.flatMap((s) => s.items.filter((i) => i.status === 'warn').map((i) => ({ section: s.id, key: i.key })));

  return {
    sections, hardBlockers, warnings,
    canCertify: hardBlockers.length === 0,
    metrics: { certifiableValue, provenValue, blockedValue, mappedValue, provenCount, blockedCount, recomputed, gross },
  };
}

// ── Bilingual copy (display only) ───────────────────────────────────────────
export const GATE_COPY = {
  en: {
    title: 'IPC Certification Gate',
    subtitle: 'Clear the evidence prerequisites before a quantity can be certified.',
    statusLabel: { pass: 'Passed', warn: 'Warning', block: 'Blocked', na: 'Not evaluated' },
    section: {
      summary: 'IPC Summary', evidence: 'Required Evidence', wir: 'WIR Readiness',
      boq: 'BoQ / Quantity', ncr: 'NCR / CO Blockers', finance: 'Financial Calculation', audit: 'Audit Confirmation',
    },
    item: {
      identity: 'IPC identity complete (number, period, gross, net)',
      certifiableValue: 'BoQ-backed certifiable value present',
      wirEvidence: 'Approved-WIR evidence on all certified lines',
      mir: 'Material lines have an approved MIR',
      coverage: 'Approved-WIR coverage of mapped scope',
      wirMetadata: 'WIR discipline / issuer / party / dates',
      valueAtRisk: 'No value at risk on certified lines',
      overclaim: 'Certified quantity within contract cap',
      ledger: 'Remaining-payable / duplicate-WIR check',
      openNcr: 'No open NCR on certified lines',
      co: 'No pending Change Order / unapproved variation',
      consistency: 'Retention 10% / VAT 15% / Net consistent',
      advance: 'Advance recovery & consultant deductions',
      permission: 'Certifier holds QS / Commercial-Manager permission',
    },
    pendingHint: {
      mir: 'Illustrative — MIR module not yet wired.',
      wirMetadata: 'Illustrative — discipline/issuer/party fields pending WIR metadata.',
      overclaim: 'Specified — not enforced. The cumulative contract cap is not evaluated here; server-side enforcement is not connected.',
      ledger: 'Pending payment-ledger module.',
      co: 'Pending Change-Order module.',
      advance: 'Pending advance/retention engine.',
    },
    pendingNote: 'Not-evaluated checks are not backed by data and never enable certification.',
    confirm: 'I confirm that this IPC has passed the required commercial readiness checks and that certification is based on approved records, linked BoQ quantities, and required supporting evidence.',
    certify: 'Certify IPC', review: 'Review Gate', cancel: 'Cancel',
    blockedTip: (n) => `Certification blocked. Clear ${n} hard blocker${n === 1 ? '' : 's'} before certifying.`,
    confirmTip: 'Tick the confirmation to certify.',
    permTip: 'Your role cannot certify IPCs.',
    valueAtRiskLabel: 'value at risk', certifiableLabel: 'certifiable', blockedLinesLabel: 'blocked lines',
  },
  ar: {
    title: 'بوابة اعتماد المستخلص',
    subtitle: 'عالِج متطلبات الإثبات قبل أن تُعتمَد الكمية.',
    statusLabel: { pass: 'مجتاز', warn: 'تحذير', block: 'موقوف', na: 'غير مُقيَّم' },
    section: {
      summary: 'ملخص المستخلص', evidence: 'الأدلة المطلوبة', wir: 'جاهزية طلبات الفحص',
      boq: 'الكميات', ncr: 'عوائق عدم المطابقة / أوامر التغيير', finance: 'الحساب المالي', audit: 'تأكيد الاعتماد',
    },
    item: {
      identity: 'بيانات المستخلص مكتملة (الرقم، الفترة، الإجمالي، الصافي)',
      certifiableValue: 'توجد قيمة قابلة للاعتماد مرتبطة بجدول الكميات',
      wirEvidence: 'أدلة طلبات فحص معتمدة على جميع البنود المعتمدة',
      mir: 'بنود المواد لها تقرير فحص مواد معتمد',
      coverage: 'تغطية طلبات الفحص المعتمدة للنطاق المربوط',
      wirMetadata: 'تخصص / مُصدِر / جهة / تواريخ طلب الفحص',
      valueAtRisk: 'لا توجد قيمة معرضة للخطر على البنود المعتمدة',
      overclaim: 'الكمية المعتمدة ضمن حد العقد',
      ledger: 'فحص المتبقي للصرف / تكرار طلب الفحص',
      openNcr: 'لا يوجد عدم مطابقة مفتوح على البنود المعتمدة',
      co: 'لا يوجد أمر تغيير معلّق / تغيير غير معتمد',
      consistency: 'اتساق الاستبقاء 10% / الضريبة 15% / الصافي',
      advance: 'استرداد الدفعة المقدمة وخصومات الاستشاري',
      permission: 'المعتمِد يملك صلاحية المساحة / المدير التجاري',
    },
    pendingHint: {
      mir: 'توضيحي — وحدة تقرير فحص المواد غير مفعّلة بعد.',
      wirMetadata: 'توضيحي — حقول التخصص/المُصدِر/الجهة قيد الإعداد.',
      overclaim: 'مُوصَّف وغير مُنفَّذ. سقف العقد التراكمي لا يُقيَّم هنا؛ التنفيذ في الخادم غير مُوصَّل.',
      ledger: 'بانتظار وحدة سجل المدفوعات.',
      co: 'بانتظار وحدة أوامر التغيير.',
      advance: 'بانتظار محرك الدفعة المقدمة/الاستبقاء.',
    },
    pendingNote: 'الفحوصات غير المُقيَّمة ليست مدعومة ببيانات ولا تتيح الاعتماد إطلاقاً.',
    confirm: 'أؤكد أن هذا المستخلص اجتاز فحوصات الجاهزية التجارية المطلوبة وأن الاعتماد مبني على سجلات معتمدة وكميات مرتبطة بجدول الكميات ومستندات داعمة مطلوبة.',
    certify: 'اعتماد المستخلص', review: 'مراجعة بوابة الاعتماد', cancel: 'إلغاء',
    blockedTip: (n) => `الاعتماد موقوف. يجب معالجة ${n} عائق أساسي قبل الاعتماد.`,
    confirmTip: 'فعّل التأكيد للاعتماد.',
    permTip: 'دورك لا يسمح باعتماد المستخلصات.',
    valueAtRiskLabel: 'قيمة معرضة للخطر', certifiableLabel: 'قابلة للاعتماد', blockedLinesLabel: 'بنود موقوفة',
  },
};
