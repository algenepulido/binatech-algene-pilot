// ============================================================
// SettingsView — Project Settings per the Claude Design mockup
// ("BinaTech Project Settings" bundle), rebuilt HONEST-STATE:
//
//  WIRED (existing schema/UI only): project identity (code, names, parties,
//  revision) + the approval escalation threshold (best-effort additive
//  column) — saved via the existing project_settings upsert. Model/IFC
//  upload embeds the existing ModelUpload widget.
//
//  EVERYTHING ELSE from the mockup renders DISABLED or DISPLAY-ONLY with
//  truthful status chips ("Backend required" / "Planned" / "Specified — not
//  enforced"). Nothing on this page asserts enforcement that isn't built:
//  Gate 1 / audit events / upload authorization are specs, and this page
//  says so. The Danger Zone is visually complete but fully disabled — no
//  destructive handlers exist in this file.
//
//  Styling: Certification Ledger tokens exclusively (var(--sc-*) via SC +
//  sc-* recipe classes). Green = certified status only; primary buttons are
//  ink. Uppercase mono labels; mono numerics stay LTR; logical properties
//  for EN/AR.
// ============================================================
import { useState, useEffect, useMemo } from 'react';
import { Save, RotateCcw, ShieldAlert, Landmark, FileCheck2, Database, Users, AlertOctagon } from 'lucide-react';
import { PageHeader } from '../components/primitives.jsx';
import { useProject } from '../lib/project.jsx';
import { saveProjectSettings, getProjectSettings } from '../api/projectSettings.js';
import { listBoqItems, isBoqLineItem } from '../api/boqItems.js';
import { ModelUpload } from './settings/ModelUpload.jsx';
import { fmtMoney } from '../lib/format.js';
import { SC } from '../styles/ledgerTokens.js';

const TR = {
  en: {
    title: 'Project Settings', subtitle: 'Identity, engine rules and governance — honest about what is configurable today.',
    // summary strip
    sBoqValue: 'BoQ value (derived)', sIpcCycle: 'IPC cycle', sRetAdv: 'Retention · Advance', sBoq: 'Active BoQ', sGates: 'Certification gates',
    notConfigured: 'Not configured', fixed: 'fixed', gatesVal: '0 enforced · specified',
    // groups
    gIdentity: 'Identity', gEngine: 'Certification engine', gSources: 'Sources & records', gGovernance: 'Governance',
    // chips
    chipBackend: 'Backend required', chipPlanned: 'Planned', chipSpec: 'Specified — not enforced', chipFrontend: 'Frontend only', chipManual: 'Manual tracker', chipNotConnected: 'Not connected', chipNotConfigured: 'Not configured', chipNotDeployed: 'Not deployed', chipWired: 'Saved to project',
    // identity card
    cIdentity: 'Overview', cIdentitySub: 'Project identity and contract parties. Read by the header, dashboard and exports.',
    fCode: 'Project code', fRevision: 'Revision', fNameEn: 'Project name (English)', fNameAr: 'Project name (Arabic)', fClient: 'Client', fContractor: 'Contractor', fConsultant: 'Consultant',
    phCode: 'Project code', phRevision: 'Revision', phName: 'Project name', phParty: 'Company name', optional: 'optional',
    // commercial rules
    cCommercial: 'Commercial rules', cCommercialSub: 'How every IPC computes. Retention and VAT are engine constants today — project-level configuration needs backend fields.',
    fRetention: 'Retention', fVat: 'VAT', retentionNote: '10% — fixed in the engine', vatNote: '15% — fixed in the engine',
    fAdvance: 'Advance recovery method', fAging: 'Collection aging thresholds', fVariation: 'Variation policy', fIpcCycle: 'IPC cycle', fPayTerms: 'Payment terms',
    // certification rules
    cCertRules: 'Certification rules', cCertRulesSub: 'A claimed quantity is only certifiable when approved work, evidence and commercial limits align. Server-side enforcement is specified, not built — see docs/backend-hardening.',
    rules: [
      ['R-01', 'WIR required before claimability', 'spec'],
      ['R-02', 'Evidence required before certification', 'spec'],
      ['R-03', 'NCR hold blocks certification', 'spec'],
      ['R-04', 'BOQ cap — cumulative certified ≤ contract', 'spec'],
      ['R-05', 'Overclaim policy — flag, never certify', 'frontend'],
      ['R-06', 'Approved VO required before IPC inclusion', 'planned'],
      ['R-07', 'Certified records locked after issue', 'planned'],
      ['R-08', 'Corrective certificate workflow', 'planned'],
    ],
    rulesRef: 'Spec + definition of done: docs/backend-hardening/02 · negative-test-matrix.md',
    // approvals
    cApprovals: 'Approvals & escalations', cApprovalsSub: 'Who approves what, and what happens when nothing moves.',
    fEscalation: 'Approval escalation threshold (days)', escalationHint: 'pending approvals waiting longer than this are flagged',
    fDelegation: 'Delegation policy', fReminders: 'Reminder cadence',
    // numbering
    cNumbering: 'Numbering & codes', cNumberingSub: 'Reference formats across records. Changing prefixes never renumbers issued records.',
    numberingNote: 'Record numbers are free-text today; enforced prefixes and formats need backend fields.',
    // sources
    cModel: 'Model / BIM', cModelSub: 'Optional anchor for progress. BIM optional — the BoQ remains the commercial source of truth.',
    cEvidence: 'Evidence & documents', cEvidenceSub: 'What a reviewer will demand behind every claimed quantity. Evidence supports certification — it does not certify by itself.',
    fFileTypes: 'Accepted file types', fMaxSize: 'Max file size', fRetentionDocs: 'Document retention policy', fDrawingRule: 'Drawing revision rule',
    evidenceNote: 'Evidence types are defined in the app (photos, test reports, delivery notes…); per-project policy needs backend fields. Upload authorization is a specified backend gate.',
    cIntegrations: 'Integrations', cIntegrationsSub: 'Honest state. Etimad, ZATCA and ERP are manual trackers unless a real integration exists.',
    intRows: [
      ['Etimad', 'manual'], ['ZATCA / Fatoora', 'manual'], ['ERP', 'notConnected'],
      ['Email sending domain', 'notConfigured'], ['AI Analyst backend (ai-assist)', 'notDeployed'],
    ],
    // governance
    cAccess: 'Access & roles', cAccessSub: 'Who is on this project and what they can approve. Roles cannot override certification rules.',
    accessNote: 'Members, invites and roles are managed in Team & Access.', accessCta: 'Open Team & Access',
    cAudit: 'Audit & controls', cAuditSub: 'Enforcement state of the real boundaries. The frontend guides; server-side certification is not built yet.',
    auditRows: [
      ['Row-level security (tenant isolation)', 'Enabled — cross-tenant verification tests pending', 'frontend'],
      ['Storage / upload authorization', 'Backend required', 'backend'],
      ['Gate 1 — certified-value enforcement', 'Specified — not built', 'spec'],
      ['Audit events (append-only log)', 'Specified — not built', 'spec'],
    ],
    cDanger: 'Danger zone', cDangerSub: 'Owner-only actions. Requires backend authorization — not yet available.',
    dangerRows: [
      ['Lock project', 'Freeze all records against edits'],
      ['Transfer ownership', 'Hand the project to another owner'],
      ['Archive project', 'Hide from active lists, keep records'],
      ['Delete project', 'Blocked while certified IPCs exist — archive instead'],
    ],
    dangerDisabled: 'Requires backend authorization — not yet available',
    // sticky bar
    unsaved: 'Unsaved changes', reset: 'Reset section', save: 'Save changes', saving: 'Saving…',
    saved: 'Saved. These details now appear across the app.',
    secIdentity: 'Identity', secApprovals: 'Approvals & escalations',
  },
  ar: {
    title: 'إعدادات المشروع', subtitle: 'الهوية وقواعد المحرك والحوكمة — بصدقٍ حول ما يمكن ضبطه اليوم.',
    sBoqValue: 'قيمة جدول الكميات (مشتقة)', sIpcCycle: 'دورة المستخلص', sRetAdv: 'المحتجزات · الدفعة المقدمة', sBoq: 'جدول الكميات النشط', sGates: 'بوابات الاعتماد',
    notConfigured: 'غير مُهيأ', fixed: 'ثابت', gatesVal: '0 مُنفَّذ · مُوصَّف',
    gIdentity: 'الهوية', gEngine: 'محرك الاعتماد', gSources: 'المصادر والسجلات', gGovernance: 'الحوكمة',
    chipBackend: 'يتطلب الخادم', chipPlanned: 'مُخطط', chipSpec: 'مُوصَّف — غير مُنفَّذ', chipFrontend: 'واجهة فقط', chipManual: 'متتبع يدوي', chipNotConnected: 'غير متصل', chipNotConfigured: 'غير مُهيأ', chipNotDeployed: 'غير منشور', chipWired: 'يُحفظ في المشروع',
    cIdentity: 'نظرة عامة', cIdentitySub: 'هوية المشروع وأطراف العقد. تُقرأ في الترويسة ولوحة المعلومات والتصدير.',
    fCode: 'رمز المشروع', fRevision: 'المراجعة', fNameEn: 'اسم المشروع (إنجليزي)', fNameAr: 'اسم المشروع (عربي)', fClient: 'العميل', fContractor: 'المقاول', fConsultant: 'الاستشاري',
    phCode: 'رمز المشروع', phRevision: 'المراجعة', phName: 'اسم المشروع', phParty: 'اسم الشركة', optional: 'اختياري',
    cCommercial: 'القواعد التجارية', cCommercialSub: 'كيف يُحسب كل مستخلص. المحتجزات والضريبة ثوابت في المحرك اليوم — والضبط على مستوى المشروع يتطلب حقول خادم.',
    fRetention: 'المحتجزات', fVat: 'الضريبة', retentionNote: '10% — ثابتة في المحرك', vatNote: '15% — ثابتة في المحرك',
    fAdvance: 'طريقة استرداد الدفعة المقدمة', fAging: 'حدود تقادم التحصيل', fVariation: 'سياسة أوامر التغيير', fIpcCycle: 'دورة المستخلص', fPayTerms: 'شروط الدفع',
    cCertRules: 'قواعد الاعتماد', cCertRulesSub: 'الكمية المُطالب بها لا تصبح قابلة للاعتماد إلا بتوافق العمل المعتمد والأدلة والحدود التجارية. التنفيذ في الخادم مُوصَّف وغير مبني — راجع docs/backend-hardening.',
    rules: [
      ['R-01', 'طلب فحص معتمد قبل القابلية للمطالبة', 'spec'],
      ['R-02', 'أدلة مطلوبة قبل الاعتماد', 'spec'],
      ['R-03', 'المخالفة المفتوحة توقف الاعتماد', 'spec'],
      ['R-04', 'سقف جدول الكميات — التراكمي ≤ العقد', 'spec'],
      ['R-05', 'سياسة المطالبة الزائدة — إشارة لا اعتماد', 'frontend'],
      ['R-06', 'أمر تغيير معتمد قبل الإدراج في المستخلص', 'planned'],
      ['R-07', 'قفل السجلات المعتمدة بعد الإصدار', 'planned'],
      ['R-08', 'مسار الشهادات التصحيحية', 'planned'],
    ],
    rulesRef: 'المواصفة ومعيار الإنجاز: docs/backend-hardening/02 · negative-test-matrix.md',
    cApprovals: 'الاعتمادات والتصعيد', cApprovalsSub: 'من يعتمد ماذا، وماذا يحدث حين لا يتحرك شيء.',
    fEscalation: 'حد تصعيد الاعتماد (أيام)', escalationHint: 'تُميَّز الاعتمادات المعلقة الأطول من هذا الحد',
    fDelegation: 'سياسة التفويض', fReminders: 'وتيرة التذكير',
    cNumbering: 'الترقيم والرموز', cNumberingSub: 'صيغ المراجع عبر السجلات. تغيير البادئات لا يعيد ترقيم السجلات الصادرة.',
    numberingNote: 'أرقام السجلات نص حر اليوم؛ والبادئات المفروضة تتطلب حقول خادم.',
    cModel: 'النموذج / BIM', cModelSub: 'مرساة اختيارية للتقدم. النموذج اختياري — يبقى جدول الكميات مصدر الحقيقة التجاري.',
    cEvidence: 'الأدلة والمستندات', cEvidenceSub: 'ما سيطلبه المدقق خلف كل كمية مُطالب بها. الأدلة تدعم الاعتماد — ولا تعتمد بذاتها.',
    fFileTypes: 'أنواع الملفات المقبولة', fMaxSize: 'الحد الأقصى لحجم الملف', fRetentionDocs: 'سياسة الاحتفاظ بالمستندات', fDrawingRule: 'قاعدة مراجعة المخططات',
    evidenceNote: 'أنواع الأدلة معرّفة في التطبيق (صور، تقارير فحص، إشعارات تسليم…)؛ والسياسة لكل مشروع تتطلب حقول خادم. وتفويض الرفع بوابة خادم مُوصَّفة.',
    cIntegrations: 'التكاملات', cIntegrationsSub: 'حالة صادقة. اعتماد وزاتكا وأنظمة ERP متتبعات يدوية ما لم يوجد تكامل حقيقي.',
    intRows: [
      ['اعتماد', 'manual'], ['زاتكا / فاتورة', 'manual'], ['ERP', 'notConnected'],
      ['نطاق إرسال البريد', 'notConfigured'], ['خادم المحلّل الذكي (ai-assist)', 'notDeployed'],
    ],
    cAccess: 'الوصول والأدوار', cAccessSub: 'من في هذا المشروع وما الذي يمكنه اعتماده. الأدوار لا تتجاوز قواعد الاعتماد.',
    accessNote: 'يُدار الأعضاء والدعوات والأدوار في «الفريق والوصول».', accessCta: 'افتح الفريق والوصول',
    cAudit: 'التدقيق والضوابط', cAuditSub: 'حالة تنفيذ الحدود الحقيقية. الواجهة تُرشد؛ واعتماد الخادم غير مبني بعد.',
    auditRows: [
      ['أمن مستوى الصفوف (عزل المستأجرين)', 'مفعّل — واختبارات التحقق بين المستأجرين معلقة', 'frontend'],
      ['تفويض التخزين / الرفع', 'يتطلب الخادم', 'backend'],
      ['البوابة 1 — تنفيذ القيمة المعتمدة', 'مُوصَّفة — غير مبنية', 'spec'],
      ['سجل التدقيق (إلحاقي فقط)', 'مُوصَّف — غير مبني', 'spec'],
    ],
    cDanger: 'منطقة الخطر', cDangerSub: 'إجراءات للمالك فقط. تتطلب تفويض الخادم — غير متاحة بعد.',
    dangerRows: [
      ['قفل المشروع', 'تجميد كل السجلات ضد التعديل'],
      ['نقل الملكية', 'تسليم المشروع لمالك آخر'],
      ['أرشفة المشروع', 'إخفاء من القوائم النشطة مع حفظ السجلات'],
      ['حذف المشروع', 'محظور مع وجود مستخلصات معتمدة — الأرشفة بديلاً'],
    ],
    dangerDisabled: 'يتطلب تفويض الخادم — غير متاح بعد',
    unsaved: 'تغييرات غير محفوظة', reset: 'إعادة تعيين القسم', save: 'حفظ التغييرات', saving: 'جارٍ الحفظ…',
    saved: 'تم الحفظ. تظهر هذه التفاصيل الآن عبر التطبيق.',
    secIdentity: 'الهوية', secApprovals: 'الاعتمادات والتصعيد',
  },
};

const CHIP_TONE = {
  backend: { color: 'var(--sc-warning)', bg: 'var(--sc-warning-bg)' },
  planned: { color: 'var(--sc-muted)', bg: 'var(--sc-surface-2)' },
  spec: { color: 'var(--sc-action)', bg: 'var(--sc-action-bg)' },
  frontend: { color: 'var(--sc-ink-2)', bg: 'var(--sc-surface-2)' },
  manual: { color: 'var(--sc-warning)', bg: 'var(--sc-warning-bg)' },
  notConnected: { color: 'var(--sc-muted)', bg: 'var(--sc-surface-2)' },
  notConfigured: { color: 'var(--sc-warning)', bg: 'var(--sc-warning-bg)' },
  notDeployed: { color: 'var(--sc-danger)', bg: 'var(--sc-danger-bg)' },
  wired: { color: 'var(--sc-ink-2)', bg: 'var(--sc-surface-2)' },
};

function Chip({ tone, children }) {
  const c = CHIP_TONE[tone] || CHIP_TONE.planned;
  return <span className="sc-mono text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap" style={{ color: c.color, background: c.bg }}>{children}</span>;
}

function Card({ icon: Icon, title, sub, aside, children }) {
  return (
    <section className="rounded-lg border overflow-hidden" style={{ background: SC.surface, borderColor: SC.line, boxShadow: 'var(--shadow-1)' }}>
      <div className="px-5 py-3 border-b flex items-start gap-2.5 flex-wrap" style={{ borderColor: SC.line }}>
        {Icon && <Icon size={15} className="mt-0.5 flex-shrink-0" style={{ color: SC.ink2 }} />}
        <div className="flex-1 min-w-0">
          <div className="sc-display text-sm font-bold" style={{ color: SC.ink }}>{title}</div>
          {sub && <div className="text-[11.5px] mt-0.5" style={{ color: SC.muted }}>{sub}</div>}
        </div>
        {aside && <div className="flex-shrink-0">{aside}</div>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

const inputStyle = { background: SC.raised, borderColor: SC.lineStrong, color: SC.ink };
function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="sc-label">{label}</span>
      {hint && <span className="text-[10.5px] ms-2" style={{ color: SC.faint }}>{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}
function DisabledField({ label, chipLabel }) {
  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="sc-label">{label}</span>
        <Chip tone="backend">{chipLabel}</Chip>
      </div>
      <input disabled className="w-full px-3 py-2 text-[13px] rounded-lg border mt-1 cursor-not-allowed"
        style={{ background: SC.surface2, borderColor: SC.line, color: SC.faint }} placeholder="—" />
    </div>
  );
}

function GroupHeader({ label }) {
  return <h2 className="sc-label !text-[11.5px] mt-8 mb-3 first:mt-0" style={{ color: SC.muted, letterSpacing: '0.08em' }}>{label}</h2>;
}

export function SettingsView({ lang = 'en', onNavigate }) {
  const ar = lang === 'ar';
  const L = TR[lang] || TR.en;
  const { project, reload } = useProject();
  const initial = useMemo(() => ({
    code: project.code ?? '', name: project.name ?? '', name_ar: project.nameAr ?? '',
    client: project.client ?? '', contractor: project.contractor ?? '',
    consultant: project.consultant ?? '', revision: project.revision ?? '',
    escalation_days_threshold: 3,
  }), [project]);
  const [form, setForm] = useState(initial);
  const [snapshot, setSnapshot] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [boq, setBoq] = useState(null); // { lines, value } — real, read-only, derived
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const dirty = JSON.stringify(form) !== JSON.stringify(snapshot);
  const dirtySection = form.escalation_days_threshold !== snapshot.escalation_days_threshold && Object.keys(form).every((k) => k === 'escalation_days_threshold' || form[k] === snapshot[k])
    ? L.secApprovals : L.secIdentity;

  // Load saved escalation threshold (best-effort additive column, as before).
  useEffect(() => {
    getProjectSettings().then((s) => {
      if (s && s.escalation_days_threshold != null) {
        setForm((f) => ({ ...f, escalation_days_threshold: s.escalation_days_threshold }));
        setSnapshot((f) => ({ ...f, escalation_days_threshold: s.escalation_days_threshold }));
      }
    }).catch(() => {});
  }, []);

  // Summary strip: REAL derived BoQ figures (read-only; '—' until loaded).
  useEffect(() => {
    listBoqItems().then((items) => {
      const lines = (items || []).filter(isBoqLineItem);
      const value = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);
      setBoq({ lines: lines.length, value });
    }).catch(() => setBoq(null));
  }, []);

  // Unsaved-changes guard (browser navigation; the app's state routing has no
  // route blocker — the sticky bar is the in-app guard).
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save(e) {
    e?.preventDefault();
    setBusy(true); setMsg(null); setError(null);
    try {
      try { await saveProjectSettings(form); }
      catch (err) {
        // Graceful: if the additive escalation column isn't migrated yet, save
        // the rest so existing settings-save never breaks (unchanged behavior).
        if (/escalation_days_threshold|column/i.test(err?.message || '')) {
          const { escalation_days_threshold, ...rest } = form; // eslint-disable-line no-unused-vars
          await saveProjectSettings(rest);
        } else throw err;
      }
      await reload();
      setSnapshot(form);
      setMsg(L.saved);
    } catch (err) {
      setError(err?.message ?? String(err));
    } finally { setBusy(false); }
  }
  const resetSection = () => { setForm(snapshot); setMsg(null); setError(null); };

  const textInput = (k, ph, extra = {}) => (
    <input value={form[k]} onChange={(e) => set(k, e.target.value)} placeholder={ph}
      className="w-full px-3 py-2 text-[13px] rounded-lg border outline-none" style={inputStyle} {...extra} />
  );

  const stat = (label, value, note) => (
    <div className="rounded-lg border px-3 py-2.5 min-w-0" style={{ background: SC.surface, borderColor: SC.line }}>
      <div className="sc-label !text-[9.5px] truncate">{label}</div>
      <div className="sc-mono text-[13px] font-bold mt-1 truncate" dir="ltr" style={{ color: SC.ink }}>{value}</div>
      {note && <div className="text-[10px] mt-0.5 truncate" style={{ color: SC.faint }}>{note}</div>}
    </div>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden" dir={ar ? 'rtl' : 'ltr'}>
      <PageHeader title={L.title} subtitle={L.subtitle} />
      <div className="flex-1 overflow-y-auto scrollbar p-4 sm:p-6 pb-24" style={{ background: SC.bg }}>
        <div className="max-w-4xl mx-auto space-y-4">

          {/* Header summary strip — real derived figures or honest "not configured" */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {stat(L.sBoqValue, boq ? fmtMoney(boq.value) : '—')}
            {stat(L.sIpcCycle, '—', L.notConfigured)}
            {stat(L.sRetAdv, '10% · —', `${L.fixed} · ${L.notConfigured}`)}
            {stat(L.sBoq, boq ? String(boq.lines) : '—')}
            {stat(L.sGates, L.gatesVal)}
          </div>

          {/* ── Identity ─────────────────────────────────────── */}
          <GroupHeader label={L.gIdentity} />
          <Card icon={Landmark} title={L.cIdentity} sub={L.cIdentitySub} aside={<Chip tone="wired">{L.chipWired}</Chip>}>
            <form onSubmit={save} className="grid sm:grid-cols-2 gap-4">
              <Field label={L.fCode}>{textInput('code', L.phCode, { className: 'w-full px-3 py-2 text-[13px] rounded-lg border outline-none sc-mono' })}</Field>
              <Field label={L.fRevision}>{textInput('revision', L.phRevision, { className: 'w-full px-3 py-2 text-[13px] rounded-lg border outline-none sc-mono' })}</Field>
              <Field label={L.fNameEn}>{textInput('name', L.phName)}</Field>
              <Field label={L.fNameAr} hint={L.optional}>{textInput('name_ar', '', { dir: 'rtl' })}</Field>
              <Field label={L.fClient}>{textInput('client', L.phParty)}</Field>
              <Field label={L.fContractor}>{textInput('contractor', L.phParty)}</Field>
              <Field label={L.fConsultant}>{textInput('consultant', L.phParty)}</Field>
              <button type="submit" hidden />
            </form>
          </Card>

          {/* ── Certification engine ─────────────────────────── */}
          <GroupHeader label={L.gEngine} />
          <Card icon={Landmark} title={L.cCommercial} sub={L.cCommercialSub}>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-2"><span className="sc-label">{L.fRetention}</span><Chip tone="frontend">{L.chipFrontend}</Chip></div>
                <div className="sc-mono text-[13px] mt-1 px-3 py-2 rounded-lg border" dir="ltr" style={{ background: SC.surface2, borderColor: SC.line, color: SC.ink2 }}>{L.retentionNote}</div>
              </div>
              <div>
                <div className="flex items-center gap-2"><span className="sc-label">{L.fVat}</span><Chip tone="frontend">{L.chipFrontend}</Chip></div>
                <div className="sc-mono text-[13px] mt-1 px-3 py-2 rounded-lg border" dir="ltr" style={{ background: SC.surface2, borderColor: SC.line, color: SC.ink2 }}>{L.vatNote}</div>
              </div>
              <DisabledField label={L.fIpcCycle} chipLabel={L.chipBackend} />
              <DisabledField label={L.fPayTerms} chipLabel={L.chipBackend} />
              <DisabledField label={L.fAdvance} chipLabel={L.chipBackend} />
              <DisabledField label={L.fAging} chipLabel={L.chipBackend} />
              <DisabledField label={L.fVariation} chipLabel={L.chipBackend} />
            </div>
          </Card>

          <Card icon={FileCheck2} title={L.cCertRules} sub={L.cCertRulesSub}>
            <div className="rounded-lg border divide-y overflow-hidden" style={{ borderColor: SC.line }}>
              {L.rules.map(([code, title, tone]) => (
                <div key={code} className="flex items-center gap-3 px-3 py-2" style={{ background: SC.surface }}>
                  <span className="sc-mono text-[10.5px] font-semibold flex-shrink-0" dir="ltr" style={{ color: SC.action }}>{code}</span>
                  <span className="text-[12.5px] flex-1 min-w-0" style={{ color: SC.ink2 }}>{title}</span>
                  <Chip tone={tone}>{tone === 'spec' ? L.chipSpec : tone === 'frontend' ? L.chipFrontend : L.chipPlanned}</Chip>
                </div>
              ))}
            </div>
            <div className="sc-mono text-[10px] mt-2" dir="ltr" style={{ color: SC.faint }}>{L.rulesRef}</div>
          </Card>

          <Card icon={Users} title={L.cApprovals} sub={L.cApprovalsSub}>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label={L.fEscalation} hint={L.escalationHint}>
                <input type="number" min={1} max={60} value={form.escalation_days_threshold}
                  onChange={(e) => set('escalation_days_threshold', Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-3 py-2 text-[13px] rounded-lg border outline-none sc-mono" dir="ltr" style={inputStyle} />
              </Field>
              <div className="grid gap-4">
                <DisabledField label={L.fDelegation} chipLabel={L.chipBackend} />
                <DisabledField label={L.fReminders} chipLabel={L.chipBackend} />
              </div>
            </div>
          </Card>

          <Card icon={Database} title={L.cNumbering} sub={L.cNumberingSub} aside={<Chip tone="planned">{L.chipPlanned}</Chip>}>
            <div className="text-[12px]" style={{ color: SC.muted }}>{L.numberingNote}</div>
          </Card>

          {/* ── Sources & records ────────────────────────────── */}
          <GroupHeader label={L.gSources} />
          <Card icon={Database} title={L.cModel} sub={L.cModelSub}>
            <ModelUpload />
          </Card>

          <Card icon={FileCheck2} title={L.cEvidence} sub={L.cEvidenceSub}>
            <div className="grid sm:grid-cols-2 gap-4">
              <DisabledField label={L.fFileTypes} chipLabel={L.chipBackend} />
              <DisabledField label={L.fMaxSize} chipLabel={L.chipBackend} />
              <DisabledField label={L.fDrawingRule} chipLabel={L.chipBackend} />
              <DisabledField label={L.fRetentionDocs} chipLabel={L.chipBackend} />
            </div>
            <div className="text-[11px] mt-3" style={{ color: SC.muted }}>{L.evidenceNote}</div>
          </Card>

          <Card icon={Database} title={L.cIntegrations} sub={L.cIntegrationsSub}>
            <div className="rounded-lg border divide-y overflow-hidden" style={{ borderColor: SC.line }}>
              {L.intRows.map(([name, tone]) => (
                <div key={name} className="flex items-center justify-between gap-3 px-3 py-2" style={{ background: SC.surface }}>
                  <span className="text-[12.5px]" style={{ color: SC.ink2 }}>{name}</span>
                  <Chip tone={tone}>{{ manual: L.chipManual, notConnected: L.chipNotConnected, notConfigured: L.chipNotConfigured, notDeployed: L.chipNotDeployed }[tone]}</Chip>
                </div>
              ))}
            </div>
          </Card>

          {/* ── Governance ───────────────────────────────────── */}
          <GroupHeader label={L.gGovernance} />
          <Card icon={Users} title={L.cAccess} sub={L.cAccessSub}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-[12.5px]" style={{ color: SC.muted }}>{L.accessNote}</span>
              {onNavigate && (
                <button onClick={() => onNavigate('team')} className="sc-btn">{L.accessCta}</button>
              )}
            </div>
          </Card>

          <Card icon={ShieldAlert} title={L.cAudit} sub={L.cAuditSub}>
            <div className="rounded-lg border divide-y overflow-hidden" style={{ borderColor: SC.line }}>
              {L.auditRows.map(([name, status, tone]) => (
                <div key={name} className="flex items-center justify-between gap-3 px-3 py-2 flex-wrap" style={{ background: SC.surface }}>
                  <span className="text-[12.5px]" style={{ color: SC.ink2 }}>{name}</span>
                  <Chip tone={tone}>{status}</Chip>
                </div>
              ))}
            </div>
          </Card>

          <section className="rounded-lg border overflow-hidden" style={{ background: SC.surface, borderColor: SC.dangerBd }}>
            <div className="px-5 py-3 border-b flex items-start gap-2.5" style={{ borderColor: SC.dangerBd, background: SC.dangerBg }}>
              <AlertOctagon size={15} className="mt-0.5 flex-shrink-0" style={{ color: SC.danger }} />
              <div>
                <div className="sc-display text-sm font-bold" style={{ color: SC.danger }}>{L.cDanger}</div>
                <div className="text-[11.5px] mt-0.5" style={{ color: SC.muted }}>{L.cDangerSub}</div>
              </div>
            </div>
            <div className="p-5 grid sm:grid-cols-2 gap-3">
              {L.dangerRows.map(([action, desc]) => (
                <div key={action} className="rounded-lg border p-3 flex flex-col gap-2" style={{ borderColor: SC.line, background: SC.surface2 }}>
                  <div>
                    <div className="text-[12.5px] font-semibold" style={{ color: SC.ink2 }}>{action}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: SC.faint }}>{desc}</div>
                  </div>
                  {/* Deliberately disabled: NO handler exists for any destructive action. */}
                  <button disabled title={L.dangerDisabled}
                    className="self-start px-3 py-1.5 text-[11.5px] font-semibold rounded-lg border cursor-not-allowed"
                    style={{ color: SC.faint, borderColor: SC.line, background: SC.surface }}>
                    {action}
                  </button>
                </div>
              ))}
            </div>
            <div className="px-5 pb-4 text-[11px]" style={{ color: SC.muted }}>{L.dangerDisabled}</div>
          </section>
        </div>
      </div>

      {/* Sticky save bar — appears only when dirty (the in-app unsaved guard) */}
      {(dirty || busy || msg || error) && (
        <div className="border-t px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap" style={{ background: SC.raised, borderColor: SC.line, boxShadow: 'var(--shadow-2)' }}>
          {dirty && <span className="text-[12px] font-medium" style={{ color: SC.warning }}>{L.unsaved} — {dirtySection}</span>}
          {msg && !dirty && <span className="text-[12px]" style={{ color: SC.ink2 }}>{msg}</span>}
          {error && <span className="text-[12px]" style={{ color: SC.danger }}>{error}</span>}
          {/* lg:me clears the desktop-only Assistant pill (Assistant.jsx: fixed,
              insetInlineEnd 20, ~212px wide) so Save/Reset are never occluded.
              Logical margin → correct on both LTR and RTL; only lg+ shows the Assistant. */}
          <span className="ms-auto flex items-center gap-2 lg:me-[240px]">
            <button onClick={resetSection} disabled={!dirty || busy} className="sc-btn inline-flex items-center gap-1.5 disabled:opacity-40">
              <RotateCcw size={13} /> {L.reset}
            </button>
            <button onClick={save} disabled={!dirty || busy} className="sc-btn sc-btn--primary inline-flex items-center gap-1.5 disabled:opacity-40">
              <Save size={13} /> {busy ? L.saving : L.save}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
