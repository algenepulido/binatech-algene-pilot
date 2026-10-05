// ============================================================
// assistantHelp — deterministic, advisory-only safety + fallback for the
// BinaTech Analyst. TWO jobs, both independent of whether the ai-assist Edge
// Function is deployed:
//
//  1. refuseIfUnsafe(text) — a CLIENT-SIDE guard. Any request to DO a
//     value-moving / mutating / cross-project action is refused HERE, before
//     any LLM call. The Analyst is advisory only; it never certifies,
//     approves, marks paid, moves money, mutates records, or crosses projects.
//
//  2. localAnswer(text, ctx) — a curated, bilingual advisory knowledge base of
//     BinaTech product facts (WIR ≠ certification, evidence supports, NCR
//     blocks, BIM optional, how a BoQ line becomes certifiable, IPC readiness
//     vs certification, Etimad/ZATCA are manual trackers…). Used as a FALLBACK
//     when the LLM is unavailable, so the Analyst still answers the core
//     how-to / boundary questions instead of a dead "unavailable".
//
// This module NEVER reads project data — every answer is a generic product
// fact, so it cannot hallucinate figures or leak another project's data. It is
// NOT the (unmerged) commercial advisory engine; it is a safe static helper.
// ============================================================

export const BOUNDARY = {
  en: 'Advisory only — I explain and draft. I never certify, approve, or move money.',
  ar: 'استشاري فقط — أشرح وأصيغ المسودات. لا أعتمد ولا أوافق ولا أحرّك أي مبالغ.',
};

// ── 1. Unsafe-request guard ────────────────────────────────
// Imperative "do X" or "can you do X" requests to act, and cross-project asks.
const IMPERATIVE = /^\s*(certify|approve|reject|mark|pay|post|close|delete|remove|upload|change|set|update|edit|move|transfer|ignore|override|bypass|skip)\b/i;
const CAPABILITY = /\b(can|could|would|will|please)\s+(you\s+)?(certify|approve|reject|mark\b[\w\s]*paid|pay\b|post\b[\w\s]*erp|post it|close\s+(the\s+)?ncr|delete|upload|change|set|update|move\s+money|override|bypass)\b/i;
const CROSS_PROJECT = /\b(another|other|a\s+different|someone\s+else'?s?)\s+(project|company|tenant|account)('?s)?\s*(data|records|boq|ipc)?|cross[-\s]?project|other\s+tenant/i;

/** Returns a bilingual refusal object if the message asks the Analyst to ACT
 *  (or to cross projects); otherwise null. Explanatory questions ("does…",
 *  "how…", "why…", "explain…") are NOT refused — they get answered. */
export function refuseIfUnsafe(text) {
  const t = String(text || '');
  if (CROSS_PROJECT.test(t)) {
    return {
      en: `I can only work within your open project — I can't show or compare another project's data. ${BOUNDARY.en}`,
      ar: `أعمل ضمن مشروعك المفتوح فقط — لا يمكنني عرض أو مقارنة بيانات مشروع آخر. ${BOUNDARY.ar}`,
    };
  }
  if (IMPERATIVE.test(t) || CAPABILITY.test(t)) {
    return {
      en: `I can't do that — I'm advisory only, and this app enforces certification and payment server-side (Gate 1). ${BOUNDARY.en} I can instead explain the blockers, summarise readiness, or draft a note or evidence request for you.`,
      ar: `لا يمكنني ذلك — أنا استشاري فقط، والاعتماد والدفع يُنفَّذان في الخادم (البوابة 1). ${BOUNDARY.ar} أستطيع بدلاً من ذلك شرح العوائق أو تلخيص الجاهزية أو صياغة ملاحظة أو طلب أدلة لك.`,
    };
  }
  return null;
}

// ── 2. Curated advisory knowledge base ─────────────────────
const a = (en, ar) => ({ en, ar });
// Ordered: first matching pattern wins. `re` tested against the lowercased text.
const KB = [
  { re: /where am i|what can you (do|help)|help me (do|with)|what (is|does) this (page|screen)|what should i do here/,
    ans: a('This is the BinaTech Analyst — advisory only. I explain how BinaTech works, summarise readiness blockers, and draft notes or evidence requests. Ask me things like "how does a BoQ line become certifiable?", "why is this line blocked?", or "does WIR approval certify payment?" I never certify, approve, or move money.',
          'هذا محلّل BinaTech — استشاري فقط. أشرح كيف يعمل BinaTech وألخّص عوائق الجاهزية وأصيغ الملاحظات أو طلبات الأدلة. اسألني مثلاً: «كيف يصبح بند الكميات قابلاً للاعتماد؟» أو «لماذا هذا البند موقوف؟» أو «هل يعتمد اعتماد الفحص الدفع؟» لا أعتمد ولا أوافق ولا أحرّك أي مبالغ.') },
  { re: /(wir|inspection).*(certif|payment|pay\b)|does .*(approval|approving).*(certif|pay)/,
    ans: a('No. WIR approval supports claimability — it makes the quantity claimable. It does not certify payment value. Certifying the quantity into an IPC is a separate, gated step (approved WIR + evidence + no NCR hold + within the approved quantity).',
          'لا. اعتماد طلب الفحص يدعم القابلية للمطالبة — يجعل الكمية قابلة للمطالبة. لكنه لا يعتمد قيمة الدفع. واعتماد الكمية في المستخلص خطوة منفصلة ومُقيَّدة (فحص معتمد + أدلة + بلا تعليق مخالفة + ضمن الكمية المعتمدة).') },
  { re: /evidence.*(certif|by itself|alone|prove)/,
    ans: a('No. Evidence supports certification — it is the auditable proof behind a claimed quantity. It does not certify value by itself. Certification still requires an approved WIR, a clear NCR position, and the claim to stay within the approved quantity.',
          'لا. الأدلة تدعم الاعتماد — فهي الإثبات القابل للتدقيق خلف الكمية المُطالب بها. لكنها لا تعتمد القيمة بحد ذاتها. ويظل الاعتماد يتطلب فحصًا معتمدًا وموقفًا خاليًا من المخالفات وبقاء المطالبة ضمن الكمية المعتمدة.') },
  { re: /ncr.*(affect|certif|block|hold|payment)|non[-\s]?conformance/,
    ans: a('An open NCR places a hold: the affected quantity is not certifiable until the NCR is cleared and the rework verified. Clearing the NCR releases that quantity back toward certification.',
          'المخالفة المفتوحة تضع تعليقًا: الكمية المتأثرة غير قابلة للاعتماد حتى تُغلق المخالفة ويُتحقَّق من الإصلاح. وإغلاق المخالفة يعيد تلك الكمية نحو الاعتماد.') },
  { re: /(bim|model|ifc|3d).*(require|need|mandatory|must|certif)|is bim (needed|required)/,
    ans: a('No — BIM/model is optional. The universal anchor is the BoQ line × location (a work item). A 3D model adds element-level precision and richer linking when one exists, but it is never a prerequisite for certification.',
          'لا — النموذج/BIM اختياري. المرساة الأساسية هي بند الكميات × الموقع (بند عمل). ويضيف النموذج ثلاثي الأبعاد دقة على مستوى العنصر وربطًا أغنى عند وجوده، لكنه ليس شرطًا للاعتماد.') },
  { re: /how.*(boq|bill of quantities|line).*(certif)|become(s)? certifiable|make(s)? .*certifiable/,
    ans: a('A BoQ line becomes certifiable when four things align: (1) an approved WIR proves the executed quantity, (2) supporting evidence is attached, (3) no NCR hold is open on it, and (4) the claim stays within the approved/contract quantity. A model is optional throughout.',
          'يصبح بند الكميات قابلاً للاعتماد عند توافق أربعة أمور: (1) فحص معتمد يُثبت الكمية المنفذة، (2) وأدلة داعمة مرفقة، (3) وبلا تعليق مخالفة عليه، (4) وبقاء المطالبة ضمن الكمية المعتمدة/التعاقدية. والنموذج اختياري في كل ذلك.') },
  { re: /(what makes|is this|why).*(ipc).*(ready|not ready)|ipc readiness/,
    ans: a('IPC readiness is about whether the certifiable lines are clean — approved WIRs, evidence attached, NCR holds cleared, claims within the approved quantity. Readiness is not certification: the IPC still totals only human-approved quantities × contract rate, with retention and VAT computed, and certification is enforced server-side.',
          'جاهزية المستخلص تتعلق بنظافة البنود القابلة للاعتماد — فحوص معتمدة وأدلة مرفقة وتعليقات مخالفات مُغلقة ومطالبات ضمن الكمية المعتمدة. والجاهزية ليست اعتمادًا: يجمع المستخلص الكميات المعتمدة بشريًا × سعر العقد فقط مع حساب المحتجزات والضريبة، والاعتماد مُنفَّذ في الخادم.') },
  { re: /(etimad|zatca).*(live|connected|integrat|real)|is .*(connected|integrated) to etimad/,
    ans: a('No live integration. Etimad/ZATCA are tracked manually in BinaTech — it is a submission tracker you update by hand, not a live connection, unless a real integration has been configured for your project.',
          'لا يوجد تكامل مباشر. يُتابَع اعتماد/زاتكا يدويًا في BinaTech — فهو متتبّع تقديم تُحدّثه يدويًا، وليس اتصالًا مباشرًا، ما لم يُهيَّأ تكامل حقيقي لمشروعك.') },
  { re: /(delivery note|sdn|receiving).*(invoice|readiness|payment|support)/,
    ans: a('Delivery notes / SDNs are procurement evidence that support invoice readiness — they help prove a delivery happened. They do not auto-pay anything: readiness still checks the commitment (PO/contract), the proof of completion, and the tax invoice before accounting.',
          'إشعارات التسليم/SDN أدلة مشتريات تدعم جاهزية الفاتورة — تساعد على إثبات حدوث التسليم. لكنها لا تدفع تلقائيًا: تظل الجاهزية تفحص الالتزام (أمر شراء/عقد) وإثبات الإنجاز والفاتورة الضريبية قبل المحاسبة.') },
  { re: /(controlled document|dms|drawing).*(certif|payment|support|proof)/,
    ans: a('Controlled documents and drawings support the evidence and proof behind a claim — they strengthen the audit trail. They do not certify value directly; certification still runs through the approved-WIR + evidence + NCR-clear gates.',
          'المستندات المضبوطة والمخططات تدعم الأدلة والإثبات خلف المطالبة — وتقوّي سجل التدقيق. لكنها لا تعتمد القيمة مباشرة؛ ويظل الاعتماد يمر عبر بوابات الفحص المعتمد والأدلة وخلوّ المخالفات.') },
  { re: /(chase|before the next ipc|summar).*(blocker|ipc|certif)|what should (i|we) chase/,
    ans: a('Before the next IPC, chase the highest-value blockers: missing WIRs, missing evidence on approved work, open NCR holds, and pending CO/VO items. The Control Room ranks blocked value by reason and owner. I explain what is on the page — I do not invent project figures.',
          'قبل المستخلص القادم، تابِع أعلى العوائق قيمةً: طلبات الفحص المفقودة، والأدلة الناقصة على الأعمال المعتمدة، وتعليقات المخالفات المفتوحة، وأوامر التغيير المعلّقة. وتُرتّب غرفة التحكم القيمة الموقوفة حسب السبب والمالك. أشرح ما هو معروض على الصفحة — ولا أختلق أرقام المشروع.') },
];

/** A vetted advisory answer for a known product question, or null. Never reads
 *  project data; `ctx.page` is only used to prefix a location hint. */
export function localAnswer(text, ctx = {}) {
  const t = String(text || '').toLowerCase();
  for (const item of KB) if (item.re.test(t)) return item.ans;
  return null;
}

/** Human page label for the read-only context we pass to the LLM. */
export function pageLabel(route) {
  const M = {
    dashboard: 'Dashboard', 'certification-control-room': 'Certification Control Room',
    certqueue: 'Certification Queue', scan: 'Scan', work: 'Work',
    'recovery-queue': 'Recovery Queue', commercialhub: 'Commercial Readiness', qs: 'BoQ / Quantities',
    ipcs: 'IPCs', 'ipa-reconciliation': 'IPA Reconciliation', cashflow: 'Cashflow', invoices: 'Client Invoices',
    wirs: 'WIRs / QC', qc: 'QC tests', 'evidence-packs': 'Evidence Packs', ncrs: 'NCRs', snagging: 'Snagging',
    drawings: 'Drawings', dms: 'Documents (DMS)', model: 'Model (3D)', registry: 'Elements Registry',
    workitems: 'Work Items', progress: 'Progress', pos: 'POs & Contracts', receiving: 'Delivery Notes (SDN)',
    readiness: 'Supplier Invoice Readiness', ap: 'AP Workspace', portal: 'Supplier Portal', reports: 'Reports',
    delays: 'Delay Analytics', matrix: 'Approval Matrix', team: 'Team & Access', settings: 'Project Settings',
    guide: 'Guided Tour', approvals: 'Approvals', home: 'Projects', quick: 'Home',
  };
  return M[route] || null;
}
