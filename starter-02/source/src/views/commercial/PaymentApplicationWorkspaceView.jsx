// ============================================================
// PaymentApplicationWorkspaceView (route 'payment-applications') — the
// flagship IPA workspace: assemble, prove and track ONE period's payment
// application, and read its linked IPC certification outcome.
//
//   IPA = the contractor's period-scoped payment APPLICATION (parent object).
//   IPC = the client/consultant's CERTIFICATION OUTCOME linked to it.
//   Never interchangeable. Reconciliation reads the IPA↔IPC delta.
//
// STATE: built client-side · read-only · demo-badged · unwired.
// Synthetic fixture data only (src/lib/paymentApplication/fixtures.js). No
// Supabase, no money mutation, no certification. The document/model viewer and
// the AI intake are honestly labelled as not wired (they land in PR B/C).
// AI never auto-confirms: every link transition is reviewSuggestion() — an
// explicit human action (see model.test.js).
// ============================================================
import { useMemo, useState } from 'react';
import {
  FileStack, Layers, ScrollText, Timer, CircleDot, CheckCircle2, XCircle,
  AlertTriangle, FileWarning, FileCheck2, FileX2, Box, FileImage, ClipboardCheck,
  Ruler, Camera, Link2, Sparkles, Eye, ShieldCheck, GitCommitHorizontal, ScanSearch,
} from 'lucide-react';
import { DrawingIntelligenceReview } from './DrawingIntelligenceReview.jsx';
import { PageHeader, Btn } from '../../components/primitives.jsx';
import { COL } from '../../lib/theme.js';
import { fmt } from '../../lib/format.js';
import {
  complianceState, computeSubmissionReadiness, computeCertificationReadiness,
  effectiveIpcOutcome, ipcOutcomeHistory, currentRevision, supersededLinkWarnings,
  revisionArtifacts, proofChain, takeoffRollup, reviewSuggestion,
  deterministicSubmissionName,
} from '../../lib/paymentApplication/model.js';
import { DEMO_IPA, DEMO_DRAWINGS, DEMO_SUGGESTIONS, PAW_BADGE, PAW_TODAY } from '../../lib/paymentApplication/fixtures.js';

const money = (n) => `SAR ${fmt(Math.round(Number(n) || 0))}`;

// ── bilingual copy (view-local, like the other commercial views) ──
const L = {
  en: {
    title: 'Payment Applications', subtitle: 'Assemble, prove and track the period application (IPA) — and read its certification outcome (IPC)',
    ipaChip: 'IPA — application (submitted by contractor)', ipcChip: 'IPC — certification outcome (returned by client/consultant)',
    period: 'Work period', template: 'Template', status: 'Status',
    statuses: { draft: 'Draft', assembling: 'Assembling', submitted: 'Submitted', returned_for_correction: 'Returned for correction', resubmitted: 'Resubmitted', closed: 'Closed' },
    tabs: { overview: 'Overview', package: 'Package', takeoff: 'Take-off', timeline: 'Timeline' },
    submissionReadiness: 'Submission readiness', submissionSub: 'Is the package complete enough to submit?',
    certReadiness: 'Certification readiness', certSub: 'Is the claimed value provable? (illustrative, client-side)',
    ofRequired: 'required documents present & valid', provable: 'provable of', axisNote: 'Two axes on purpose — a complete package can carry unprovable value, and vice versa.',
    effectiveOutcome: 'Current effective IPC outcome', outcomeHistory: 'Outcome history', noOutcome: 'No IPC outcome yet — the application is with the client/consultant.',
    superseded: 'superseded', certifiedValue: 'Certified value', compliance: 'Compliance validity',
    compStates: { valid: 'Valid', valid_no_expiry: 'Valid — no expiry defined', expiring: 'Expiring within horizon', expired: 'EXPIRED', missing: 'Missing', unknown: 'Unknown' },
    forecast: 'Forecast (next cycles)', forecastNote: 'Display-only cycle forecast — not a commitment.',
    volumes: 'Package structure', requirement: 'Requirement', optional: 'optional', noPartNo: 'No part number in client index',
    reqStates: { present: 'Present', missing: 'Missing', superseded_revision: 'Superseded revision', expiring: 'Expiring', expired: 'Expired' },
    selectReq: 'Select a requirement from the package tree.',
    docInstance: 'Document instance', originalName: 'Original filename (preserved)', submissionName: 'Deterministic submission name',
    viewer: 'Document / model / drawing viewer', viewerUnwired: 'Viewer not wired in this release — PDF, BIM and drawing preview land with the AI intake (PR B/C). Nothing is rendered rather than a fake preview.',
    proof: 'Proof chain', proofNote: 'Same chain from any entry point: BOQ ↔ element ↔ drawing ↔ WIR ↔ measurement ↔ evidence ↔ section.',
    links: 'Commercial links', aiQueue: 'AI-proposed links (preview)',
    aiUnwired: 'AI intake is not wired in this release — these are synthetic previews of the PR B review queue. Nothing here was produced by a live model.',
    confidence: 'confidence', reasonLbl: 'Reason', matched: 'Matched drawing text', locationLbl: 'Location', unit: 'Unit compatible', sourceRegion: 'Source region',
    confirm: 'Confirm', reject: 'Reject', choose: 'Choose another BOQ item', confirmed: 'Confirmed', rejected: 'Rejected', needsReview: 'Needs review',
    aiNever: 'AI never auto-confirms links, writes certified quantities, changes rates, approves WIRs, certifies IPCs or marks a package submitted.',
    takeoffTitle: 'Take-off hierarchy', takeoffSub: 'measurement detail → zone → work type → bill → application summary', totalQty: 'Total measured qty (mixed units, display only)',
    timelineTitle: 'Submission timeline', returns: 'Client return comments', rev: 'Rev',
    submittedOn: 'Submitted', inPreparation: 'In preparation', drawingWarn: 'links a superseded drawing revision',
    native: 'Native DWG', issued: 'Issued PDF', renditionNote: 'Distinct artifacts — the issued PDF is a rendition of the native DWG; AI reads the issued PDF only.',
    wir: 'WIR', measurement: 'Measurement', evidence: 'Evidence', element: 'BIM element', drawing: 'Drawing', boqLine: 'BOQ line', section: 'Section', none: '—',
    claimed: 'Claimed (display)', lines: 'Application lines',
    openIntel: 'Open drawing intelligence review',
  },
  ar: {
    title: 'طلبات الدفعات', subtitle: 'تجهيز وإثبات ومتابعة طلب دفعة الفترة (IPA) — وقراءة نتيجة الاعتماد المرتبطة به (IPC)',
    ipaChip: 'IPA — طلب الدفعة (يقدّمه المقاول)', ipcChip: 'IPC — نتيجة الاعتماد (يعيدها العميل/الاستشاري)',
    period: 'فترة العمل', template: 'النموذج', status: 'الحالة',
    statuses: { draft: 'مسودة', assembling: 'قيد التجهيز', submitted: 'مقدّم', returned_for_correction: 'معاد للتصحيح', resubmitted: 'أعيد تقديمه', closed: 'مغلق' },
    tabs: { overview: 'نظرة عامة', package: 'الملف', takeoff: 'الحصر', timeline: 'الجدول الزمني' },
    submissionReadiness: 'جاهزية التقديم', submissionSub: 'هل الملف مكتمل بما يكفي للتقديم؟',
    certReadiness: 'جاهزية الاعتماد', certSub: 'هل القيمة المطالب بها قابلة للإثبات؟ (استرشادي، على المتصفح)',
    ofRequired: 'مستندًا مطلوبًا موجودًا وصالحًا', provable: 'قابل للإثبات من', axisNote: 'محوران عن قصد — ملف مكتمل قد يحمل قيمة غير مثبتة، والعكس صحيح.',
    effectiveOutcome: 'نتيجة الاعتماد (IPC) السارية حاليًا', outcomeHistory: 'سجل النتائج', noOutcome: 'لا توجد نتيجة اعتماد بعد — الطلب لدى العميل/الاستشاري.',
    superseded: 'ملغاة', certifiedValue: 'القيمة المعتمدة', compliance: 'صلاحية مستندات الامتثال',
    compStates: { valid: 'ساري', valid_no_expiry: 'ساري — بلا تاريخ انتهاء', expiring: 'قارب على الانتهاء', expired: 'منتهي الصلاحية', missing: 'غير مرفق', unknown: 'غير معروف' },
    forecast: 'التوقعات (الدورات القادمة)', forecastNote: 'توقعات للعرض فقط — ليست التزامًا.',
    volumes: 'هيكل الملف', requirement: 'المتطلب', optional: 'اختياري', noPartNo: 'لا يوجد رقم جزء في فهرس العميل',
    reqStates: { present: 'موجود', missing: 'غير مرفق', superseded_revision: 'مراجعة ملغاة', expiring: 'قارب على الانتهاء', expired: 'منتهي' },
    selectReq: 'اختر متطلبًا من شجرة الملف.',
    docInstance: 'المستند المرفق', originalName: 'اسم الملف الأصلي (محفوظ كما هو)', submissionName: 'اسم التقديم المعياري',
    viewer: 'عارض المستندات / النموذج / المخططات', viewerUnwired: 'العارض غير مفعّل في هذا الإصدار — معاينة PDF وBIM والمخططات تصل مع إدخال الذكاء الاصطناعي (PR B/C). لا نعرض معاينة وهمية.',
    proof: 'سلسلة الإثبات', proofNote: 'السلسلة نفسها من أي نقطة دخول: بند الكميات ↔ العنصر ↔ المخطط ↔ طلب التفتيش ↔ الحصر ↔ الإثبات ↔ القسم.',
    links: 'الروابط التجارية', aiQueue: 'روابط مقترحة من الذكاء الاصطناعي (معاينة)',
    aiUnwired: 'إدخال الذكاء الاصطناعي غير مفعّل في هذا الإصدار — هذه معاينات تجريبية لقائمة المراجعة في PR B. لا شيء هنا ناتج عن نموذج حي.',
    confidence: 'الثقة', reasonLbl: 'السبب', matched: 'النص المطابق في المخطط', locationLbl: 'الموقع', unit: 'توافق الوحدة', sourceRegion: 'منطقة المصدر',
    confirm: 'تأكيد', reject: 'رفض', choose: 'اختيار بند كميات آخر', confirmed: 'مؤكَّد', rejected: 'مرفوض', needsReview: 'يحتاج مراجعة',
    aiNever: 'الذكاء الاصطناعي لا يؤكد الروابط تلقائيًا، ولا يكتب كميات معتمدة، ولا يغيّر الأسعار، ولا يعتمد طلبات التفتيش، ولا يصدر شهادات، ولا يعلّم الملف كمقدَّم.',
    takeoffTitle: 'تسلسل الحصر', takeoffSub: 'تفاصيل القياس ← المنطقة ← نوع العمل ← الجدول ← ملخص الطلب', totalQty: 'إجمالي الكميات المقاسة (وحدات مختلطة، للعرض فقط)',
    timelineTitle: 'الجدول الزمني للتقديم', returns: 'ملاحظات إعادة العميل', rev: 'مراجعة',
    submittedOn: 'قُدّم في', inPreparation: 'قيد الإعداد', drawingWarn: 'مرتبط بمراجعة مخطط ملغاة',
    native: 'DWG أصلي', issued: 'PDF صادر', renditionNote: 'ملفان منفصلان — الـPDF الصادر نسخة عرض من الـDWG الأصلي؛ الذكاء الاصطناعي يقرأ الـPDF الصادر فقط.',
    wir: 'طلب تفتيش', measurement: 'الحصر', evidence: 'الإثبات', element: 'عنصر BIM', drawing: 'المخطط', boqLine: 'بند الكميات', section: 'القسم', none: '—',
    claimed: 'المطالب به (للعرض)', lines: 'بنود الطلب',
    openIntel: 'فتح مراجعة ذكاء المخططات',
  },
};

// ── tiny shared bits ────────────────────────────────────────
function Badge() {
  return <span className="mono text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: COL.goldSoft, color: COL.gold }}>{PAW_BADGE}</span>;
}
function Chip({ label, color, soft, icon: Icon }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={{ background: soft || COL.surfaceAlt, color: color || COL.textDim }}>
      {Icon ? <Icon size={11} /> : <span className="w-1.5 h-1.5 rounded-full" style={{ background: color || COL.textMute }} />}
      {label}
    </span>
  );
}
function KV({ k, v, mono, dirLtr }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[12px] py-0.5">
      <span style={{ color: COL.textDim }}>{k}</span>
      <span className={`${mono ? 'mono ' : ''}font-medium text-end break-all`} style={{ color: COL.text }} dir={dirLtr ? 'ltr' : undefined}>{v ?? '—'}</span>
    </div>
  );
}
function Card({ title, sub, right, children }) {
  return (
    <div className="rounded-2xl border" style={{ background: COL.surface, borderColor: COL.border }}>
      <div className="flex items-start justify-between gap-2 px-4 pt-3.5 pb-2">
        <div>
          <div className="text-[13px] font-semibold" style={{ color: COL.text }}>{title}</div>
          {sub && <div className="text-[11px] mt-0.5" style={{ color: COL.textMute }}>{sub}</div>}
        </div>
        {right}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </div>
  );
}

// One readiness meter. `tone` separates the two axes visually: submission =
// blueprint blue (system), certification = Certified Green (semantic only here
// because the axis IS certification provability).
function ReadinessMeter({ label, sub, pct, detail, tone }) {
  return (
    <div className="rounded-2xl border p-4" style={{ background: COL.surface, borderColor: COL.border }}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[12px] font-semibold" style={{ color: COL.text }}>{label}</div>
        <div className="mono text-[18px] font-bold" style={{ color: tone }} dir="ltr">{pct}%</div>
      </div>
      <div className="text-[10.5px] mt-0.5" style={{ color: COL.textMute }}>{sub}</div>
      <div className="h-1.5 rounded-full mt-2.5 overflow-hidden" style={{ background: COL.surfaceAlt }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tone }} />
      </div>
      <div className="text-[10.5px] mt-1.5" style={{ color: COL.textDim }}>{detail}</div>
    </div>
  );
}

const OUTCOME_TONE = {
  certified: { color: COL.certified, soft: COL.certifiedSoft },
  partially_certified: { color: COL.certified, soft: COL.certifiedSoft },
  pending: { color: '#57534e', soft: '#f5f5f4' },
  rejected: { color: '#b91c1c', soft: '#fee2e2' },
  superseded: { color: '#9aa0ab', soft: '#f5f5f4' },
};
const OUTCOME_LABEL = {
  en: { certified: 'Certified', partially_certified: 'Partially certified', pending: 'Pending', rejected: 'Rejected', superseded: 'Superseded' },
  ar: { certified: 'معتمد', partially_certified: 'معتمد جزئيًا', pending: 'قيد الانتظار', rejected: 'مرفوض', superseded: 'ملغاة' },
};

// ── the view ────────────────────────────────────────────────
export function PaymentApplicationWorkspaceView({ lang = 'en', onNavigate }) {
  const t = L[lang] || L.en;
  const rtl = lang === 'ar';
  const ipa = DEMO_IPA;

  const [tab, setTab] = useState('overview');
  const [selReq, setSelReq] = useState('r-dwg-pdfs');
  // Drawing-intelligence review entry — any {kind,id} opens the SAME review
  // state (see resolveReviewEntry): requirement, BOQ item, WIR, measurement,
  // drawing record or IFC element.
  const [reviewEntry, setReviewEntry] = useState(null);
  // AI suggestion review — LOCAL state only; transitions run through the
  // model's reviewSuggestion (the single legal path; nothing auto-confirms).
  const [suggestions, setSuggestions] = useState(DEMO_SUGGESTIONS);
  const [choosing, setChoosing] = useState(null); // suggestion id with the picker open

  const submission = useMemo(() => computeSubmissionReadiness(ipa, PAW_TODAY), [ipa]);
  const certification = useMemo(() => computeCertificationReadiness(ipa), [ipa]);
  const effective = useMemo(() => effectiveIpcOutcome(ipa), [ipa]);
  const history = useMemo(() => ipcOutcomeHistory(ipa), [ipa]);
  const dwgWarnings = useMemo(() => supersededLinkWarnings(ipa.lines, DEMO_DRAWINGS), [ipa]);
  const rollup = useMemo(() => takeoffRollup(ipa.measurements), [ipa]);

  const allReqs = useMemo(() => {
    const rows = [];
    ipa.template.volumes.forEach((v) => v.parts.forEach((p) => p.sections.forEach((s) => s.requirements.forEach((r) => rows.push({ v, p, s, r })))));
    return rows;
  }, [ipa]);
  const reqState = (r) => {
    const doc = ipa.documents.find((d) => d.requirementId === r.id);
    if (!doc) return 'missing';
    if (doc.revisionSuperseded) return 'superseded_revision';
    const cs = complianceState(doc, PAW_TODAY, ipa.validityHorizonDays);
    if (cs === 'expired') return 'expired';
    if (cs === 'expiring') return 'expiring';
    return 'present';
  };
  const REQ_TONE = { present: COL.certified, missing: '#b91c1c', superseded_revision: '#d97706', expiring: '#d97706', expired: '#b91c1c' };

  const review = (id, action, boqLineId) => {
    setSuggestions((cur) => cur.map((s) => {
      if (s.id !== id) return s;
      try { return reviewSuggestion(s, action, { boqLineId }); } catch { return s; }
    }));
    setChoosing(null);
  };
  const boqOptions = [...new Set(ipa.lines.map((l) => l.boqLineId).filter(Boolean))];

  const selected = allReqs.find((x) => x.r.id === selReq) || null;
  const selectedDoc = selected ? ipa.documents.find((d) => d.requirementId === selected.r.id) : null;
  const selectedChain = selected ? proofChain(ipa, 'requirement', selected.r.id) : null;
  const outcomeLbl = OUTCOME_LABEL[lang] || OUTCOME_LABEL.en;

  const TabBtn = ({ id, icon: Icon, label }) => (
    <button onClick={() => setTab(id)} className="px-3 py-1.5 rounded-full text-[12px] font-semibold flex items-center gap-1.5 transition"
      style={{ background: tab === id ? COL.accentBg : 'transparent', color: tab === id ? COL.accent : COL.textDim }}>
      <Icon size={13} />{label}
    </button>
  );

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="flex-1 flex flex-col overflow-hidden" style={{ background: COL.bg }}>
      <PageHeader
        title={t.title}
        subtitle={t.subtitle}
        actions={<div className="flex items-center gap-2 flex-wrap"><Badge /></div>}
      />

      {/* IPA cycle header — the parent object, with the IPA≠IPC legend up front */}
      <div className="px-4 sm:px-6 py-3 border-b flex flex-wrap items-center gap-x-5 gap-y-2" style={{ borderColor: COL.border, background: COL.surface }}>
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: COL.accentBg }}><FileStack size={16} style={{ color: COL.accent }} /></span>
          <div>
            <div className="mono text-[13px] font-bold" style={{ color: COL.text }} dir="ltr">IPA-{String(ipa.no).padStart(2, '0')}</div>
            <div className="text-[10.5px]" style={{ color: COL.textMute }}>{t.period}: {ipa.period.label}</div>
          </div>
        </div>
        <KVMini k={t.template} v={ipa.template.version} />
        <KVMini k={t.status} v={<Chip label={t.statuses[ipa.status] || ipa.status} color="#d97706" soft="#fef3c7" />} />
        <div className="flex-1" />
        <div className="flex flex-col gap-1 items-start">
          <Chip label={t.ipaChip} color={COL.accent} soft={COL.accentBg} icon={FileStack} />
          <Chip label={t.ipcChip} color={COL.certified} soft={COL.certifiedSoft} icon={ShieldCheck} />
        </div>
      </div>

      {/* tabs */}
      <div className="px-4 sm:px-6 py-2 border-b flex items-center gap-1 overflow-x-auto" style={{ borderColor: COL.border, background: COL.surface }}>
        <TabBtn id="overview" icon={CircleDot} label={t.tabs.overview} />
        <TabBtn id="package" icon={Layers} label={t.tabs.package} />
        <TabBtn id="takeoff" icon={Ruler} label={t.tabs.takeoff} />
        <TabBtn id="timeline" icon={Timer} label={t.tabs.timeline} />
      </div>

      <div className="flex-1 overflow-y-auto scrollbar p-4 sm:p-6">
        {tab === 'overview' && (
          <div className="space-y-4 max-w-6xl">
            {/* two-axis readiness — deliberately two meters, never one */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ReadinessMeter label={t.submissionReadiness} sub={t.submissionSub} pct={submission.pct} tone={COL.accent}
                detail={`${submission.satisfied}/${submission.requiredTotal} ${t.ofRequired}`} />
              <ReadinessMeter label={t.certReadiness} sub={t.certSub} pct={certification.pct} tone={COL.certified}
                detail={`${money(certification.provableValue)} ${t.provable} ${money(certification.claimedValue)}`} />
            </div>
            <div className="text-[11px]" style={{ color: COL.textMute }}>{t.axisNote}</div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* linked IPC outcome — the OTHER object, clearly separated */}
              <Card title={t.effectiveOutcome} right={<Badge />}>
                {!effective && <div className="text-[12px] py-2" style={{ color: COL.textMute }}>{t.noOutcome}</div>}
                {effective && (
                  <div className="rounded-xl border p-3" style={{ borderColor: COL.border, background: COL.bg }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="mono text-[12.5px] font-bold" dir="ltr" style={{ color: COL.text }}>{effective.ref}</span>
                      <Chip label={outcomeLbl[effective.status] || effective.status} color={OUTCOME_TONE[effective.status]?.color} soft={OUTCOME_TONE[effective.status]?.soft} icon={ShieldCheck} />
                    </div>
                    <KV k={t.certifiedValue} v={money(effective.certifiedValue)} mono dirLtr />
                    <div className="text-[11px] mt-1" style={{ color: COL.textDim }}>{effective.note?.[lang] || effective.note?.en}</div>
                  </div>
                )}
                <div className="mt-3 text-[10.5px] uppercase tracking-wide font-medium" style={{ color: COL.textMute }}>{t.outcomeHistory}</div>
                <div className="mt-1 space-y-1">
                  {history.map((e) => (
                    <div key={e.id} className="flex items-center justify-between gap-2 text-[11.5px]">
                      <span className={`mono ${e.status === 'superseded' ? 'line-through' : ''}`} dir="ltr" style={{ color: e.status === 'superseded' ? COL.textMute : COL.text }}>{e.ref} · {e.issuedOn}</span>
                      <span style={{ color: OUTCOME_TONE[e.status]?.color }}>{outcomeLbl[e.status] || e.status}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* compliance validity — nullable expiry rendered honestly */}
              <Card title={t.compliance}>
                <div className="space-y-2">
                  {ipa.complianceDocs.map((cd) => {
                    const st = complianceState(cd, PAW_TODAY, ipa.validityHorizonDays);
                    const tone = st === 'expired' ? '#b91c1c' : st === 'expiring' ? '#d97706' : COL.certified;
                    return (
                      <div key={cd.id} className="flex items-center justify-between gap-2 text-[12px]">
                        <span style={{ color: COL.text }}>{cd.title}</span>
                        <span className="flex items-center gap-2">
                          <span className="mono text-[10.5px]" dir="ltr" style={{ color: COL.textMute }}>{cd.expires_on ?? '∅'}</span>
                          <Chip label={t.compStates[st] || st} color={tone} soft={`${tone}18`} />
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 text-[10.5px] uppercase tracking-wide font-medium" style={{ color: COL.textMute }}>{t.forecast}</div>
                <div className="mt-1 flex gap-3">
                  {ipa.forecast.map((f) => (
                    <div key={f.period} className="rounded-lg border px-3 py-2" style={{ borderColor: COL.border }}>
                      <div className="text-[10px]" style={{ color: COL.textMute }}>{f.period}</div>
                      <div className="mono text-[12.5px] font-bold" dir="ltr" style={{ color: COL.text }}>{money(f.value)}</div>
                    </div>
                  ))}
                </div>
                <div className="text-[10px] mt-1.5" style={{ color: COL.textMute }}>{t.forecastNote}</div>
              </Card>
            </div>
          </div>
        )}

        {tab === 'package' && (
          <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr_320px] gap-4 items-start">
            {/* volume/part/section tree — renders WHATEVER the template defines */}
            <Card title={t.volumes} sub={ipa.template.version}>
              <div className="space-y-3">
                {ipa.template.volumes.map((v) => (
                  <div key={v.id}>
                    <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: COL.textDim }}>{v.label[lang] || v.label.en}</div>
                    {v.parts.map((p) => (
                      <div key={p.id} className="mt-1.5 ms-1">
                        <div className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: COL.text }}>
                          {p.partNo != null ? <span className="mono text-[10px]" dir="ltr" style={{ color: COL.textMute }}>{p.partNo}.</span>
                            : <span className="text-[9px] italic px-1 rounded" style={{ background: COL.surfaceAlt, color: COL.textMute }} title={t.noPartNo}>—</span>}
                          {p.label[lang] || p.label.en}
                        </div>
                        {p.sections.map((s) => (
                          <div key={s.id} className="ms-3 mt-1">
                            <div className="text-[11px] flex items-center gap-1.5" style={{ color: COL.textDim }}>
                              <span className="mono text-[9.5px]" dir="ltr">{s.code}</span>
                              {s.label[lang] || s.label.en}
                              {s.optional && <span className="text-[9px] px-1 rounded-full" style={{ background: COL.surfaceAlt, color: COL.textMute }}>{t.optional}</span>}
                            </div>
                            {s.requirements.map((r) => {
                              const st = reqState(r);
                              return (
                                <button key={r.id} onClick={() => setSelReq(r.id)}
                                  className="w-full text-start ms-3 mt-0.5 px-1.5 py-1 rounded flex items-center gap-1.5 text-[11px] transition hover:bg-black/[0.03]"
                                  style={{ background: selReq === r.id ? COL.accentBg : 'transparent', color: selReq === r.id ? COL.accent : COL.text }}>
                                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: REQ_TONE[st] }} />
                                  <span className="flex-1 truncate">{r.label[lang] || r.label.en}</span>
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </Card>

            {/* center: requirement detail + honest viewer + proof chain */}
            <div className="space-y-4 min-w-0">
              {!selected && <Card title={t.requirement}><div className="text-[12px] py-4" style={{ color: COL.textMute }}>{t.selectReq}</div></Card>}
              {selected && (
                <Card title={selected.r.label[lang] || selected.r.label.en}
                  sub={`${selected.v.label[lang] || selected.v.label.en} · ${selected.s.label[lang] || selected.s.label.en}`}
                  right={<Chip label={t.reqStates[reqState(selected.r)]} color={REQ_TONE[reqState(selected.r)]} soft={`${REQ_TONE[reqState(selected.r)]}18`} />}>
                  {selectedDoc ? (
                    <div className="space-y-0.5">
                      <KV k={t.originalName} v={selectedDoc.originalFilename} mono dirLtr />
                      <KV k={t.submissionName} v={deterministicSubmissionName({ projectCode: ipa.projectCode, ipaNo: ipa.no, volumeNo: selected.v.no, sectionCode: selected.s.code, title: selected.r.label.en, revision: 1, ext: (selectedDoc.originalFilename.split('.').pop() || 'pdf') })} mono dirLtr />
                      {selectedDoc.revisionSuperseded && (
                        <div className="flex items-center gap-1.5 text-[11px] mt-1.5 px-2 py-1.5 rounded-lg" style={{ background: '#fef3c7', color: '#b45309' }}>
                          <FileWarning size={12} className="flex-shrink-0" />{t.reqStates.superseded_revision} — ST-101 P01 → P02
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[12px] py-2" style={{ color: '#b91c1c' }}><FileX2 size={13} />{t.reqStates.missing}</div>
                  )}

                  {/* the viewer slot — honestly unwired */}
                  <div className="mt-3 rounded-xl border border-dashed p-5 text-center" style={{ borderColor: COL.borderStrong, background: COL.bg }}>
                    <Eye size={16} className="mx-auto mb-1.5" style={{ color: COL.textMute }} />
                    <div className="text-[11.5px] font-semibold" style={{ color: COL.textDim }}>{t.viewer}</div>
                    <div className="text-[10.5px] mt-1 max-w-md mx-auto" style={{ color: COL.textMute }}>{t.viewerUnwired}</div>
                  </div>
                </Card>
              )}

              {/* proof chain — one relationship, any entry point */}
              <Card title={t.proof} sub={t.proofNote}
                right={<Btn size="sm" icon={ScanSearch} onClick={() => setReviewEntry({ kind: 'requirement', id: selReq })}>{t.openIntel}</Btn>}>
                {selectedChain ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <ProofCell icon={ScrollText} label={t.boqLine} value={selectedChain.boqLineId} />
                    <ProofCell icon={Box} label={t.element} value={selectedChain.elementId} />
                    <ProofCell icon={FileImage} label={t.drawing} value={selectedChain.drawingId ? `${selectedChain.drawingId} · ${selectedChain.drawingRegion || ''}` : null}
                      warn={dwgWarnings.some((w) => w.linkId === selectedChain.lineId) ? t.drawingWarn : null} />
                    <ProofCell icon={ClipboardCheck} label={t.wir} value={selectedChain.wirId} />
                    <ProofCell icon={Ruler} label={t.measurement} value={selectedChain.measurementId} />
                    <ProofCell icon={Camera} label={t.evidence} value={selectedChain.evidenceIds.length ? selectedChain.evidenceIds.join(', ') : null} />
                  </div>
                ) : <div className="text-[11.5px] py-2" style={{ color: COL.textMute }}>{t.none}</div>}
              </Card>

              {/* application lines + native/issued artifact distinction */}
              <Card title={t.lines} right={<Badge />}>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11.5px]">
                    <thead>
                      <tr className="text-start" style={{ color: COL.textMute }}>
                        <th className="text-start font-medium pb-1.5">{t.boqLine}</th>
                        <th className="text-start font-medium pb-1.5">{t.drawing}</th>
                        <th className="text-start font-medium pb-1.5">{t.wir}</th>
                        <th className="text-end font-medium pb-1.5">{t.claimed}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ipa.lines.map((l) => {
                        const warn = dwgWarnings.some((w) => w.linkId === l.id);
                        return (
                          <tr key={l.id} className="border-t" style={{ borderColor: COL.border }}>
                            <td className="py-1.5 pe-2">
                              <button onClick={() => setReviewEntry({ kind: 'boq', id: l.boqLineId })} className="inline-flex items-center gap-1 hover:underline" title={t.openIntel}>
                                <ScanSearch size={11} style={{ color: COL.accent }} />
                                <span className="mono" dir="ltr" style={{ color: COL.text }}>{l.boqLineId}</span>
                              </button>
                              <div className="text-[10px]" style={{ color: COL.textMute }}>{l.desc}</div>
                            </td>
                            <td className="py-1.5 pe-2">
                              {l.drawingId ? (
                                <button onClick={() => setReviewEntry({ kind: 'drawing', id: l.drawingId })} className="inline-flex items-center gap-1 hover:underline" title={t.openIntel}>
                                  <span className="mono text-[10.5px]" dir="ltr" style={{ color: warn ? '#b45309' : COL.textDim }}>{l.drawingId}/{l.revisionId?.split('-').pop()?.toUpperCase()}</span>
                                  {warn && <AlertTriangle size={11} style={{ color: '#b45309' }} title={t.drawingWarn} />}
                                </button>
                              ) : '—'}
                            </td>
                            <td className="py-1.5 pe-2">
                              <span className="inline-flex items-center gap-1 mono text-[10.5px]" dir="ltr" style={{ color: l.wirStatus === 'approved' ? COL.certified : '#d97706' }}>
                                {l.wirStatus === 'approved' ? <CheckCircle2 size={11} /> : <CircleDot size={11} />}{l.wirId}
                              </span>
                            </td>
                            <td className="py-1.5 text-end mono" dir="ltr" style={{ color: COL.text }}>{money(l.claimedValue)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* native vs issued — distinct artifacts, stated */}
                <div className="mt-3 rounded-lg border px-3 py-2 flex flex-wrap items-center gap-2" style={{ borderColor: COL.border, background: COL.bg }}>
                  <Chip label={`${t.native}: st101_found_zoneA_r2.dwg`} color={COL.textDim} soft={COL.surfaceAlt} icon={FileCheck2} />
                  <Chip label={`${t.issued}: ST-101_P02_signed.pdf`} color={COL.accent} soft={COL.accentBg} icon={FileImage} />
                  <span className="text-[10px] basis-full" style={{ color: COL.textMute }}>{t.renditionNote}</span>
                </div>
              </Card>
            </div>

            {/* right: commercial links — AI suggestions in a reviewable queue */}
            <Card title={t.links} sub={t.aiQueue} right={<Sparkles size={14} style={{ color: COL.accent }} />}>
              <div className="rounded-lg px-2.5 py-2 text-[10.5px] mb-3" style={{ background: COL.goldSoft, color: COL.gold }}>{t.aiUnwired}</div>
              <div className="space-y-3">
                {suggestions.map((s) => {
                  const final = s.status === 'confirmed' || s.status === 'rejected';
                  return (
                    <div key={s.id} className="rounded-xl border p-3" style={{ borderColor: COL.border, background: final ? COL.bg : COL.surface }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="mono text-[11.5px] font-bold" dir="ltr" style={{ color: COL.text }}>{s.boqLineId || '—'}</span>
                        {s.status === 'suggested' && s.confidence != null && (
                          <span className="mono text-[10px] px-1.5 py-0.5 rounded-full" dir="ltr" style={{ background: COL.accentBg, color: COL.accent }}>{Math.round(s.confidence * 100)}% {t.confidence}</span>
                        )}
                        {s.status === 'needs_review' && <Chip label={t.needsReview} color="#d97706" soft="#fef3c7" icon={AlertTriangle} />}
                        {s.status === 'confirmed' && <Chip label={t.confirmed} color={COL.certified} soft={COL.certifiedSoft} icon={CheckCircle2} />}
                        {s.status === 'rejected' && <Chip label={t.rejected} color="#b91c1c" soft="#fee2e2" icon={XCircle} />}
                      </div>
                      <div className="text-[11px] mt-1.5" style={{ color: COL.textDim }}><span className="font-semibold">{t.reasonLbl}:</span> {s.reason}</div>
                      {s.matchedText && <div className="text-[10.5px] mt-1 px-2 py-1 rounded mono" dir="ltr" style={{ background: COL.surfaceAlt, color: COL.textDim }}>“{s.matchedText}”</div>}
                      <div className="mt-1.5 space-y-0.5">
                        {s.location && <KV k={t.locationLbl} v={s.location} mono dirLtr />}
                        <KV k={t.unit} v={s.unitCompatible ? '✓' : '✗'} />
                        {s.sourceRegion && <KV k={t.sourceRegion} v={`${s.sourceRegion.drawingId} p.${s.sourceRegion.page}`} mono dirLtr />}
                      </div>
                      {s.warnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[10.5px] mt-1.5" style={{ color: '#b45309' }}><AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />{w}</div>
                      ))}
                      {!final && (
                        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                          <Btn size="sm" variant="primary" onClick={() => review(s.id, 'confirm')} disabled={!s.boqLineId}>{t.confirm}</Btn>
                          <Btn size="sm" onClick={() => review(s.id, 'reject')}>{t.reject}</Btn>
                          <Btn size="sm" variant="ghost" onClick={() => setChoosing(choosing === s.id ? null : s.id)}>{t.choose}</Btn>
                        </div>
                      )}
                      {choosing === s.id && (
                        <div className="mt-2 flex flex-col gap-1">
                          {boqOptions.map((b) => (
                            <button key={b} onClick={() => review(s.id, 'reassign', b)} className="text-start mono text-[11px] px-2 py-1 rounded hover:bg-black/[0.04]" dir="ltr" style={{ color: COL.accent }}>{b}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 text-[10px] leading-relaxed" style={{ color: COL.textMute }}>{t.aiNever}</div>
            </Card>
          </div>
        )}

        {tab === 'takeoff' && (
          <div className="max-w-3xl space-y-4">
            <Card title={t.takeoffTitle} sub={t.takeoffSub} right={<Badge />}>
              <div className="mono text-[12px] mb-2" dir="ltr" style={{ color: COL.textDim }}>{t.totalQty}: {fmt(rollup.total)}</div>
              <div className="space-y-2.5">
                {rollup.zones.map((z) => (
                  <div key={z.zone} className="rounded-xl border p-3" style={{ borderColor: COL.border }}>
                    <div className="flex items-center justify-between text-[12px] font-bold" style={{ color: COL.text }}>
                      <span>{z.zone}</span><span className="mono" dir="ltr">{fmt(z.qty)}</span>
                    </div>
                    {z.workTypes.map((w) => (
                      <div key={w.workType} className="ms-3 mt-1.5">
                        <div className="flex items-center justify-between text-[11.5px] font-semibold" style={{ color: COL.textDim }}>
                          <span>{w.workType}</span><span className="mono" dir="ltr">{fmt(w.qty)}</span>
                        </div>
                        {w.bills.map((b) => (
                          <div key={b.bill} className="ms-3 flex items-center justify-between text-[11px]" style={{ color: COL.textMute }}>
                            <span className="mono" dir="ltr">{b.bill}</span><span className="mono" dir="ltr">{fmt(b.qty)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {tab === 'timeline' && (
          <div className="max-w-3xl space-y-4">
            <Card title={t.timelineTitle} right={<Badge />}>
              <div className="space-y-2">
                {ipa.snapshots.map((s) => (
                  <div key={s.id} className="flex items-center gap-2.5 text-[12px]">
                    <GitCommitHorizontal size={14} style={{ color: s.submittedOn ? COL.accent : COL.textMute }} />
                    <span className="mono font-bold" dir="ltr" style={{ color: COL.text }}>{t.rev} {s.rev}</span>
                    <span style={{ color: COL.textDim }}>{s.note[lang] || s.note.en}</span>
                    <span className="ms-auto mono text-[10.5px]" dir="ltr" style={{ color: COL.textMute }}>{s.submittedOn ? `${t.submittedOn} ${s.submittedOn}` : t.inPreparation}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-[10.5px] uppercase tracking-wide font-medium" style={{ color: COL.textMute }}>{t.returns}</div>
              <div className="mt-1.5 space-y-2">
                {ipa.returnComments.map((r) => (
                  <div key={r.id} className="rounded-xl border p-3 text-[11.5px]" style={{ borderColor: COL.border, background: COL.bg }}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="mono text-[10px]" dir="ltr" style={{ color: COL.textMute }}>{r.on}</span>
                    </div>
                    <div style={{ color: COL.text }}>{r.text[lang] || r.text.en}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>

      {reviewEntry && (
        <DrawingIntelligenceReview lang={lang} entry={reviewEntry} onClose={() => setReviewEntry(null)} onNavigate={onNavigate} />
      )}
    </div>
  );
}

function KVMini({ k, v }) {
  return (
    <div className="text-[11px]">
      <span style={{ color: COL.textMute }}>{k}: </span>
      <span className="font-semibold" style={{ color: COL.text }}>{v}</span>
    </div>
  );
}

function ProofCell({ icon: Icon, label, value, warn }) {
  return (
    <div className="rounded-lg border px-2.5 py-2" style={{ borderColor: warn ? '#fcd34d' : COL.border, background: warn ? '#fffbeb' : COL.bg }}>
      <div className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-wide font-medium" style={{ color: COL.textMute }}><Icon size={11} />{label}</div>
      <div className="mono text-[10.5px] mt-0.5 break-all" dir="ltr" style={{ color: value ? COL.text : COL.textMute }}>{value || '—'}</div>
      {warn && <div className="text-[9.5px] mt-0.5" style={{ color: '#b45309' }}>{warn}</div>}
    </div>
  );
}
