// ============================================================
// Guided-tour content — bilingual (EN/AR), BIM-OPTIONAL by design.
// The universal anchor is the BoQ line + location (work item); a 3D model
// adds precision when one exists but is never a prerequisite. Kept as data
// (not JSX) so structure parity EN↔AR is enforced by tests.
// ============================================================

export const GUIDE_INTRO_SHOT = '/guide/model.jpg';

export const GUIDE_INTRO = {
  en: {
    title: 'How BIM QC works',
    lead: 'A reference for the full flow — from the bill of quantities to a certified, invoiceable payment. The rule that shapes everything: nothing is certified until the work is proven.',
  },
  ar: {
    title: 'كيف يعمل BIM QC',
    lead: 'مرجع لسير العمل الكامل — من جدول الكميات إلى دفعة معتمدة قابلة للفوترة. القاعدة التي تشكّل كل شيء: لا يُعتمد شيء قبل إثبات العمل.',
  },
};

export const GUIDE_STEPS = [
  {
    id: 'project-boq', shot: '/guide/project-boq.jpg', modules: ['Projects', 'QS / BoQ'],
    title: { en: 'Set up the project & import the BoQ', ar: 'أنشئ المشروع واستورد جدول الكميات' },
    what: { en: 'Every project starts from its bill of quantities — a 3D model is optional.', ar: 'كل مشروع يبدأ من جدول كمياته — والنموذج ثلاثي الأبعاد اختياري.' },
    how: {
      en: 'Create the project (name, client, consultant) and import the BoQ from Excel — the importer detects columns and sections automatically and you confirm the preview before anything is saved. If the project has an IFC model you can upload it now or later; everything below works the same either way.',
      ar: 'أنشئ المشروع (الاسم، العميل، الاستشاري) واستورد جدول الكميات من Excel — يكتشف المستورد الأعمدة والأقسام تلقائيًا وتؤكد المعاينة قبل أي حفظ. إن كان للمشروع نموذج IFC يمكنك رفعه الآن أو لاحقًا؛ وكل ما يلي يعمل بالطريقة نفسها في الحالتين.',
    },
  },
  {
    id: 'work-items', shot: '/guide/work-items.jpg', modules: ['Work Items', 'Model (optional)'],
    title: { en: 'Anchor the work: work items or model elements', ar: 'اربط العمل: بنود عمل أو عناصر نموذج' },
    what: { en: 'A work item = a BoQ line × a location. That is the universal anchor.', ar: 'بند العمل = بند كميات × موقع. هذا هو المرساة الأساسية.' },
    how: {
      en: 'Define work items per location — zone, level or chainage — in bulk from any BoQ line. On projects with a model, you can additionally link BoQ lines to real IFC elements (with AI suggestions) for element-level precision. Both anchors feed the same certification engine.',
      ar: 'عرّف بنود العمل لكل موقع — منطقة أو منسوب أو محطة كيلومترية — دفعةً واحدة من أي بند كميات. وفي المشاريع ذات النموذج يمكنك إضافةً ربط بنود الكميات بعناصر IFC حقيقية (مع اقتراحات الذكاء الاصطناعي) لدقة على مستوى العنصر. كلا المرساتين يغذيان محرك الاعتماد نفسه.',
    },
  },
  {
    id: 'wirs', shot: '/guide/wirs.jpg', modules: ['WIRs', 'QC tests'],
    title: { en: 'Inspect: raise & approve WIRs', ar: 'افحص: أصدر طلبات الفحص واعتمدها' },
    what: { en: 'An approved WIR writes an approved quantity onto its BoQ line.', ar: 'طلب الفحص المعتمد يكتب كمية معتمدة على بند الكميات.' },
    how: {
      en: 'Raise a WIR against a work item or element; the consultant signs it off. On approval, the approved quantity accrues to the BoQ line — capped at the contract quantity, never exceeding it. This is the first and permanent link in the money chain; only human approval moves it.',
      ar: 'أصدر طلب فحص مقابل بند عمل أو عنصر؛ ويعتمده الاستشاري. عند الاعتماد تتراكم الكمية المعتمدة على بند الكميات — بسقف كمية العقد ولا تتجاوزه أبدًا. هذه أول حلقة دائمة في سلسلة المال؛ ولا يحركها إلا اعتماد بشري.',
    },
  },
  {
    id: 'quality', shot: '/guide/quality.jpg', modules: ['NCRs', 'Snagging'],
    title: { en: 'Catch and close problems', ar: 'التقط المشكلات وأغلقها' },
    what: { en: 'Open NCRs block certification until they are resolved.', ar: 'حالات عدم المطابقة المفتوحة توقف الاعتماد حتى تُحل.' },
    how: {
      en: 'Non-conformances and snags are logged against the work they affect and tracked to closure. An element with an open NCR cannot contribute certified value, and a zone is only “ready” when its open items are closed — readiness reflects reality, not optimism.',
      ar: 'تُسجَّل حالات عدم المطابقة والملاحظات مقابل العمل الذي تخصه وتُتابع حتى الإغلاق. العنصر ذو حالة عدم مطابقة مفتوحة لا يضيف قيمة معتمدة، ولا تُعتبر المنطقة «جاهزة» إلا بإغلاق بنودها — فتعكس الجاهزية الواقع لا التفاؤل.',
    },
  },
  {
    id: 'documents', shot: '/guide/documents.jpg', modules: ['Documents (DMS)', 'Drawings'],
    title: { en: 'Control documents & drawings', ar: 'اضبط المستندات والمخططات' },
    what: { en: 'The paperwork behind every payment stays retrievable.', ar: 'تبقى مستندات كل دفعة قابلة للاسترجاع.' },
    how: {
      en: 'Submittals, RFIs, MIRs and drawing revisions live in one controlled register, linkable to the records and work they relate to. WIR attachments carry a document type (test report, survey record, photo evidence…) so evidence is classified, not just stored.',
      ar: 'تعيش التقديمات والاستفسارات والتقارير ومراجعات المخططات في سجل مضبوط واحد، قابلة للربط بالسجلات والعمل المرتبط. وتحمل مرفقات طلبات الفحص نوع مستند (تقرير اختبار، سجل مساحي، صور إثبات…) فتُصنَّف الأدلة لا تُخزَّن فقط.',
    },
  },
  {
    id: 'procurement', shot: '/guide/procurement.jpg', modules: ['POs', 'Receiving / SDN', 'Vendors'],
    title: { en: 'Procure to delivery', ar: 'من الشراء إلى التسليم' },
    what: { en: 'What arrives on site is matched to what was ordered.', ar: 'يُطابَق ما يصل الموقع بما طُلب.' },
    how: {
      en: 'Purchase orders and subcontracts go to vendors; deliveries are received and signed (SDN). The signed delivery note becomes evidence in the procurement chain — the basis for validating a supplier’s invoice later.',
      ar: 'تُصدر أوامر الشراء والعقود الفرعية للموردين؛ وتُستلم التسليمات وتُوقّع (سند الاستلام). يصبح سند التسليم الموقّع دليلًا في سلسلة المشتريات — أساس التحقق من فاتورة المورد لاحقًا.',
    },
  },
  {
    id: 'supplier-invoices', shot: '/guide/supplier-invoices.jpg', modules: ['Supplier Portal', 'Invoice Readiness'],
    title: { en: 'Supplier invoices, auto-checked', ar: 'فواتير الموردين مفحوصة آليًا' },
    what: { en: 'Every supplier invoice is checked for the evidence that justifies paying it.', ar: 'تُفحص كل فاتورة مورد بحثًا عن الأدلة التي تبرر دفعها.' },
    how: {
      en: 'Suppliers submit invoices with their documents through the portal. The readiness engine checks the three pillars automatically — commitment (PO/contract), proof of completion (signed DN, IPC, timesheet…), and the tax invoice. Incomplete packages are blocked or returned with comments; complete ones route to accounting.',
      ar: 'يقدّم الموردون فواتيرهم مع مستنداتها عبر البوابة. يفحص محرك الجاهزية الركائز الثلاث آليًا — الالتزام (أمر شراء/عقد)، وإثبات الإنجاز (سند تسليم موقّع، شهادة دفع، كشف ساعات…)، والفاتورة الضريبية. تُوقف الحزم الناقصة أو تُعاد بملاحظات؛ وتُوجَّه المكتملة للمحاسبة.',
    },
  },
  {
    id: 'ipc', shot: '/guide/ipc.jpg', modules: ['IPCs', 'Client Invoices'],
    title: { en: 'Certify & invoice the client', ar: 'اعتمد وافوتر العميل' },
    what: { en: 'The IPC totals human-approved quantities — retention and VAT computed, never typed.', ar: 'تجمع شهادة الدفع الكميات المعتمدة بشريًا — والمحتجزات والضريبة محسوبة لا مُدخلة.' },
    how: {
      en: 'Approved BoQ quantities build into an Interim Payment Certificate with automatic retention and 15% VAT; authority tiers route it for approval. Once certified, a ZATCA-ready client invoice is issued — backed by every inspection, document and delivery behind it. Export it as a branded Excel workbook or a bilingual PDF certificate.',
      ar: 'تُبنى كميات جدول الكميات المعتمدة في شهادة دفع مرحلية مع المحتجزات وضريبة 15٪ تلقائيًا؛ وتوجّهها مستويات الصلاحية للاعتماد. وبعد الاعتماد تُصدر فاتورة عميل متوافقة مع زاتكا — مدعومة بكل فحص ومستند وتسليم خلفها. وتُصدَّر كملف Excel أو شهادة PDF ثنائية اللغة.',
    },
  },
];

export const GUIDE_RULE = {
  en: {
    kicker: 'THE RULE',
    title: 'Nothing is certified until the work is proven',
    body: 'Every certified line traces back to the inspection that signed it off, the document that supports it, and the delivery that matched it. Certified value is always Σ(human-approved quantity × contract rate), capped at the contract — AI can suggest, extract and flag, but only a person can approve.',
  },
  ar: {
    kicker: 'القاعدة',
    title: 'لا يُعتمد شيء قبل إثبات العمل',
    body: 'كل بند معتمد يعود إلى الفحص الذي وافق عليه، والمستند الذي يدعمه، والتسليم الذي طابقه. القيمة المعتمدة دائمًا = مجموع (الكمية المعتمدة بشريًا × سعر العقد) بسقف العقد — يقترح الذكاء الاصطناعي ويستخرج وينبّه، لكن الاعتماد للإنسان وحده.',
  },
};
