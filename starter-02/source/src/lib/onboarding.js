// ============================================================
// onboarding — derives the "Getting started" path for a project from its
// REAL state (no stored wizard state to drift): which steps are done, which
// is next, and where each one lives. BIM-OPTIONAL: the anchor step accepts
// either work items (BoQ line × location) or element links. Pure + tested.
// ============================================================

export const ONBOARDING_STEPS = [
  {
    key: 'boq', route: 'qs',
    label: { en: 'Import the bill of quantities', ar: 'استورد جدول الكميات' },
    desc: { en: 'Drop in the Excel BoQ — columns are detected automatically and you confirm the preview.', ar: 'أدرج ملف Excel — تُكتشف الأعمدة تلقائيًا وتؤكد المعاينة.' },
  },
  {
    key: 'anchor', route: 'workitems', routeWithModel: 'qs',
    label: { en: 'Anchor the work', ar: 'اربط العمل' },
    desc: { en: 'Create work items (BoQ line × location) — or link model elements to BoQ lines if you uploaded an IFC.', ar: 'أنشئ بنود عمل (بند كميات × موقع) — أو اربط عناصر النموذج ببنود الكميات إن رفعت ملف IFC.' },
  },
  {
    key: 'wir', route: 'wirs',
    label: { en: 'Raise your first WIR', ar: 'أصدر أول طلب فحص' },
    desc: { en: 'Inspect real work at a real location. Pick the work item — the BoQ line comes with it.', ar: 'افحص عملًا حقيقيًا في موقع حقيقي. اختر بند العمل — يأتي بند الكميات معه.' },
  },
  {
    key: 'approve', route: 'wirs',
    label: { en: 'Approve it — quantity becomes claimable', ar: 'اعتمده — تصبح الكمية قابلة للمطالبة' },
    desc: { en: 'On approval, the quantity accrues to the BoQ line (capped at contract) and becomes claimable. Certifying it into an IPC is a separate, later step.', ar: 'عند الاعتماد تتراكم الكمية على بند الكميات (بسقف العقد) وتصبح قابلة للمطالبة. أما اعتمادها في شهادة الدفع فخطوة منفصلة لاحقة.' },
  },
  {
    key: 'ipc', route: 'ipcs',
    label: { en: 'Draft your first IPC', ar: 'أنشئ أول شهادة دفع' },
    desc: { en: 'Approved quantities build the certificate — retention and 15% VAT are computed, never typed.', ar: 'الكميات المعتمدة تبني الشهادة — المحتجزات وضريبة 15٪ محسوبة لا مُدخلة.' },
  },
];

/**
 * Derive step completion from live project signals.
 * All counts default to 0 so a partially-loaded dashboard never crashes this.
 */
export function deriveGettingStarted({ boqCount = 0, hasModel = false, linkedCount = 0, workItemCount = 0, totalWirs = 0, certifiable = 0, approvedValue = 0, certifiedIpc = 0 } = {}) {
  const doneByKey = {
    boq: boqCount > 0,
    anchor: workItemCount > 0 || linkedCount > 0,
    wir: totalWirs > 0,
    approve: certifiable > 0 || approvedValue > 0,
    ipc: certifiedIpc > 0,
  };
  const steps = ONBOARDING_STEPS.map((s) => ({
    ...s,
    route: s.routeWithModel && hasModel ? s.routeWithModel : s.route,
    done: !!doneByKey[s.key],
  }));
  const doneCount = steps.filter((s) => s.done).length;
  const nextIdx = steps.findIndex((s) => !s.done);
  return {
    steps,
    doneCount,
    total: steps.length,
    nextIdx: nextIdx === -1 ? null : nextIdx,
    completed: nextIdx === -1,
    pct: Math.round((doneCount / steps.length) * 100),
  };
}
