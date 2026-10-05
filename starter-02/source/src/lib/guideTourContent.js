// ============================================================
// Guided Tour — structured, bilingual (EN/AR) content for the workflow console.
// Kept as data (not JSX) so EN↔AR structure parity is enforced by tests and
// the view stays a clean renderer. BIM-OPTIONAL: the universal anchor is the
// BoQ line × location (work item); a 3D model adds precision, never a gate.
// Thesis, preserved everywhere: "Nothing is certified until the work is proven."
// ============================================================

const b = (en, ar) => ({ en, ar });

export const TOUR_HEADER = {
  title: b('Guided Tour', 'الجولة الإرشادية'),
  subtitle: b('How approved site progress becomes certified payment value.',
    'كيف يتحوّل التقدّم الميداني المعتمد إلى قيمة دفع معتمدة.'),
  rule: b('A claimed quantity is only certifiable when approved work, supporting evidence, and commercial limits align.',
    'الكمية المُطالب بها لا تصبح قابلة للاعتماد إلا عندما يتوافق العمل المعتمد والأدلة الداعمة والحدود التعاقدية.'),
  thesis: b('Nothing is certified until the work is proven.', 'لا يُعتمد شيء قبل إثبات العمل.'),
  boundaryNote: b('The frontend guides only. Gate 1 server enforcement is required and is not live yet.',
    'الواجهة للإرشاد فقط. تنفيذ البوابة 1 في الخادم مطلوب لكنه غير مُفعّل بعد.'),
};

// Illustrative "sample project state" chips shown in the header. state drives colour.
export const TOUR_CHIPS = [
  { key: 'boq', label: b('BoQ imported', 'الكميات مستوردة'), state: 'ready' },
  { key: 'evidence', label: b('Evidence linked', 'الأدلة مربوطة'), state: 'ready' },
  { key: 'wir', label: b('WIR approved', 'الفحص معتمد'), state: 'ready' },
  { key: 'ipc', label: b('IPC ready', 'المستخلص جاهز'), state: 'review' },
  { key: 'payment', label: b('Payment tracked', 'الدفع متتبَّع'), state: 'idle' },
];

// ── THE PIPELINE — one canonical BoQ→payment sequence. Each stage carries what
// it does, the risk if it is skipped, a concrete worked example (the "03.02
// Concrete Works" line, proven end to end), and its home module (route). This
// single spine replaces the old workflow-map / step-cards / record-chain trio.
export const TOUR_PIPELINE = [
  { num: '01', icon: 'boq', route: 'qs', state: 'ready', module: b('BoQ / Quantities', 'جدول الكميات'),
    name: b('BoQ', 'جدول الكميات'),
    does: b('Import the bill of quantities — lines, quantities and rates. The contract everything is measured and capped against; a 3D model is optional.',
      'استورد جدول الكميات — البنود والكميات والأسعار. العقد الذي يُقاس عليه كل شيء ويُحدَّد سقفه؛ والنموذج ثلاثي الأبعاد اختياري.'),
    risk: b('No baseline — nothing can be valued or capped', 'بلا أساس — لا يمكن تقييم أو تحديد سقف'),
    example: b('03.02 · Concrete Works', '03.02 · أعمال خرسانة') },
  { num: '02', icon: 'workitem', route: 'workitems', state: 'ready', module: b('Work Items', 'بنود العمل'),
    name: b('Work Item', 'بند العمل'),
    does: b('Anchor progress to a BoQ line × location — or to a real IFC element where a model exists. This is where inspected quantity lives.',
      'اربط التقدّم ببند كميات × موقع — أو بعنصر IFC حقيقي حيث يوجد نموذج. هنا تعيش الكمية المفحوصة.'),
    risk: b('Unanchored progress can’t be measured per zone', 'تقدّم غير مربوط يتعذّر قياسه لكل منطقة'),
    example: b('Sample Link · Pier Stem', 'الوصلة النموذجية · جذع الركيزة') },
  { num: '03', icon: 'wir', route: 'wirs', state: 'ready', module: b('WIRs / QC', 'طلبات الفحص'),
    name: b('WIR', 'طلب الفحص'),
    does: b('Raise a Work Inspection Request; approval makes the quantity claimable and writes an approved quantity onto the BoQ line — capped at contract.',
      'ارفع طلب فحص للعمل؛ يجعل الاعتماد الكمية قابلة للمطالبة ويكتب كمية معتمدة على بند الكميات — بسقف العقد.'),
    risk: b('No approved WIR → the quantity is not certifiable', 'بلا فحص معتمد ← الكمية غير قابلة للاعتماد'),
    example: b('Approved · WIR-2610', 'معتمد · WIR-2610') },
  { num: '04', icon: 'evidence', route: 'evidence-packs', state: 'ready', module: b('Evidence Packs', 'حزم الأدلة'),
    name: b('Evidence', 'الأدلة'),
    does: b('Attach the proof a reviewer will demand — photos, MIR, drawings, measurement — behind the claimed quantity.',
      'أرفق الإثبات الذي سيطلبه المراجع — الصور واعتماد المواد والمخططات والقياس — خلف الكمية المُطالب بها.'),
    risk: b('Missing evidence → a reviewer will bounce the claim', 'أدلة ناقصة ← يرفض المراجع المطالبة'),
    example: b('4 files · Photos + DMS', '4 ملفات · صور + مستندات') },
  { num: '05', icon: 'queue', route: 'certification-control-room', state: 'review', module: b('Control Room', 'غرفة التحكم'),
    name: b('Certification', 'الاعتماد'),
    does: b('Triage what’s ready, blocked and why — per line. Blockers like open NCRs or overclaims are held out, not silently certified.',
      'افرز ما هو جاهز وموقوف ولماذا — لكل بند. تُحجب العوائق كالمخالفات المفتوحة أو المطالبات الزائدة بدل اعتمادها صامتة.'),
    risk: b('Blockers (NCR, overclaim) slip into the certificate', 'تتسرّب العوائق (مخالفة، مطالبة زائدة) إلى الشهادة'),
    example: b('42.5 m³ · Ready', '42.5 م³ · جاهز') },
  { num: '06', icon: 'ipc', route: 'ipcs', state: 'idle', module: b('IPCs', 'المستخلصات'),
    name: b('IPC', 'المستخلص'),
    does: b('Compose the interim payment certificate from human-approved quantities × contract rate. Retention and VAT are computed, never typed.',
      'جهّز شهادة الدفع المرحلية من الكميات المعتمدة بشريًا × سعر العقد. المحتجزات والضريبة محسوبة لا مُدخلة.'),
    risk: b('Typed totals diverge from proven value', 'إجماليات مُدخلة تختلف عن القيمة المُثبتة'),
    example: b('Line included', 'البند مُدرَج') },
  { num: '07', icon: 'invoice', route: 'invoices', state: 'idle', module: b('Client Invoices', 'فواتير العميل'),
    name: b('Invoice / Etimad', 'الفاتورة / اعتماد'),
    does: b('Issue the client invoice from the certified IPC and track its Etimad/ZATCA submission — a manual tracker unless a real integration exists.',
      'أصدر فاتورة العميل من المستخلص المعتمد وتتبّع تقديمها في اعتماد/زاتكا — متتبّع يدوي ما لم يوجد تكامل حقيقي.'),
    risk: b('Billing decoupled from certified proof', 'فوترة منفصلة عن الإثبات المعتمد'),
    example: b('Submission tracked', 'التقديم متتبَّع') },
  { num: '08', icon: 'payment', route: null, state: 'idle', module: b('Cashflow', 'التدفق النقدي'),
    name: b('Payment', 'الدفع'),
    does: b('Record receipt against the certified claim — proof-to-payment, closed and reconciled.',
      'سجّل التحصيل مقابل المطالبة المعتمدة — من الإثبات إلى الدفع، مغلق ومُطابَق.'),
    risk: b('Payment untied from the proof that justified it', 'دفع غير مرتبط بالإثبات الذي برّره'),
    example: b('Recorded · closed', 'مُسجّل · مغلق') },
];

// ── The 6 certification gates. state: pass | warning | blocked.
export const TOUR_GATES = [
  { gate: b('Approved WIR exists', 'وجود فحص معتمد'), state: 'pass', reason: b('WIR-2610 approved', 'الفحص WIR-2610 معتمد'), module: 'WIRs / QC' },
  { gate: b('Claimed ≤ approved quantity', 'المُطالب ≤ الكمية المعتمدة'), state: 'pass', reason: b('42.5 ≤ 42.5 m³', '42.5 ≤ 42.5 م³'), module: 'BoQ / Quantities' },
  { gate: b('Evidence attached', 'إرفاق الأدلة'), state: 'pass', reason: b('4 files on record', '4 ملفات مسجّلة'), module: 'Evidence Packs' },
  { gate: b('NCR hold cleared', 'إغلاق تعليق المخالفة'), state: 'warning', reason: b('1 NCR pending verification', 'مخالفة واحدة بانتظار التحقق'), module: 'NCRs' },
  { gate: b('Commercial package complete', 'اكتمال الحزمة التجارية'), state: 'warning', reason: b('CO/VO pending on 1 line', 'أمر تغيير معلّق على بند'), module: 'Control Room' },
  { gate: b('User has authority', 'امتلاك المستخدم للصلاحية'), state: 'blocked', reason: b('Gate 1 server enforcement is not live', 'تنفيذ البوابة 1 في الخادم غير مُفعّل'), module: 'Team & Access' },
];

// ── Roles: what each enters, approves, and cannot override.
export const TOUR_ROLES = [
  { icon: 'site', role: b('Site Engineer', 'مهندس الموقع'),
    enters: b('WIRs, progress, field captures', 'طلبات الفحص والتقدّم والالتقاط الميداني'),
    approves: b('Nothing — submits for review', 'لا شيء — يقدّم للمراجعة'),
    cannot: b('Cannot certify or set approved quantity', 'لا يعتمد ولا يحدّد الكمية المعتمدة') },
  { icon: 'qaqc', role: b('QA/QC', 'ضبط الجودة'),
    enters: b('Inspection results, NCRs, evidence', 'نتائج الفحص والمخالفات والأدلة'),
    approves: b('WIR results, NCR closure', 'نتائج الفحص وإغلاق المخالفات'),
    cannot: b('Cannot move commercial value', 'لا يحرّك القيمة التجارية') },
  { icon: 'qs', role: b('QS / Commercial', 'حصر الكميات / التجاري'),
    enters: b('BoQ, rates, IPC composition', 'جدول الكميات والأسعار وتكوين المستخلص'),
    approves: b('Certifiable quantities into an IPC', 'الكميات القابلة للاعتماد في المستخلص'),
    cannot: b('Cannot certify past approved evidence', 'لا يعتمد بما يتجاوز الأدلة المعتمدة') },
  { icon: 'pm', role: b('Project Manager', 'مدير المشروع'),
    enters: b('Priorities, sign-off routing', 'الأولويات وتوجيه الاعتماد'),
    approves: b('IPC issuance within authority', 'إصدار المستخلص ضمن الصلاحية'),
    cannot: b('Must follow the certification gates', 'يجب أن يلتزم ببوابات الاعتماد') },
  { icon: 'client', role: b('Client / Consultant', 'العميل / الاستشاري'),
    enters: b('Review comments', 'ملاحظات المراجعة'),
    approves: b('WIR / IPC sign-off (read-only cost)', 'اعتماد الفحص / المستخلص (تكلفة للقراءة فقط)'),
    cannot: b('Cannot see contractor-internal cost', 'لا يرى التكلفة الداخلية للمقاول') },
  { icon: 'admin', role: b('Admin', 'المدير'),
    enters: b('Members, roles, project settings', 'الأعضاء والأدوار وإعدادات المشروع'),
    approves: b('Access grants', 'منح الوصول'),
    cannot: b('Must not treat UI access as certification authority', 'يجب ألّا يعتبر صلاحية الواجهة سلطة اعتماد') },
];

// ── Explicit "do not certify if" list.
export const TOUR_DONT = [
  b('the WIR is missing', 'طلب الفحص مفقود'),
  b('the WIR is rejected or pending', 'طلب الفحص مرفوض أو معلّق'),
  b('the quantity exceeds the approved amount', 'الكمية تتجاوز المقدار المعتمد'),
  b('evidence is missing', 'الأدلة مفقودة'),
  b('an NCR is open', 'توجد مخالفة مفتوحة'),
  b('authority is insufficient', 'الصلاحية غير كافية'),
  b('the invoice package is incomplete', 'الحزمة التجارية غير مكتملة'),
];

// ── Page actions → existing routes (null = no route yet, render disabled).
export const TOUR_ACTIONS = [
  { label: b('Start with BoQ', 'ابدأ بجدول الكميات'), route: 'qs', icon: 'boq' },
  { label: b('Open WIRs', 'افتح طلبات الفحص'), route: 'wirs', icon: 'wir' },
  { label: b('Review Certification Queue', 'راجع قائمة الاعتماد'), route: 'certification-control-room', icon: 'queue' },
  { label: b('Check IPC Readiness', 'تحقّق من جاهزية المستخلص'), route: 'ipcs', icon: 'ipc' },
];
