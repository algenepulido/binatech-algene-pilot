// ============================================================
// DrawingIntelligenceReview — the AI-assisted shop-drawing → BOQ review
// workspace, opened INSIDE the Payment Application Workspace (never a
// disconnected AI page). Three panels:
//   left   — drawing identity, artifacts (native DWG ≠ issued PDF), revision
//            history + supersession, IPA section placement, pages
//   center — issued-PDF viewer (local preview only) + selectable AI-detected
//            region overlays; no drawing content is ever fabricated
//   right  — IPA context + explainable BOQ candidates with human-only actions
//
// STATE: built client-side · read-only · not persisted. The live AI path runs
// through the doc-intel contract and fails honestly (unavailable / invalid);
// the demo path is a separate, always-badged branch — fixture output is never
// rendered as a live extraction result.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, ScanSearch, FileCheck2, FileImage, FileX2, AlertTriangle, CheckCircle2,
  XCircle, Sparkles, Loader2, CircleSlash, Box, ClipboardCheck, Ruler,
  ZoomIn, ZoomOut, ChevronLeft, ChevronRight, FlaskConical, GitCommitHorizontal, Link2,
} from 'lucide-react';
import { Btn } from '../../components/primitives.jsx';
import { COL } from '../../lib/theme.js';
import { DEMO_IPA, DEMO_DRAWINGS, PAW_BADGE } from '../../lib/paymentApplication/fixtures.js';
import { revisionArtifacts } from '../../lib/paymentApplication/model.js';
import {
  resolveReviewEntry, createReviewSession, focusRegion, confirmCandidate,
  rejectCandidate, reassignCandidate, markOutsideScope, leaveUnresolved,
  linkRelated, NOT_PERSISTED,
} from '../../lib/drawingIntel/reviewState.js';
import { buildCandidates } from '../../lib/drawingIntel/matching.js';
import { runExtraction } from '../../lib/drawingIntel/client.js';
import {
  DEMO_EXTRACTION, DEMO_BOQ_CATALOG, DEMO_WIR_POOL, DEMO_MEASUREMENT_POOL,
  DEMO_ELEMENT_POOL, DRAWING_INTEL_BADGE,
} from '../../lib/drawingIntel/fixtures.js';

const L = {
  en: {
    title: 'Drawing intelligence review', subtitle: 'AI proposes — a human confirms every link',
    close: 'Close', drawing: 'Drawing', revisionHist: 'Revision history', latest: 'latest approved',
    supersededWarn: 'This review is anchored to a SUPERSEDED revision', ipaPlacement: 'IPA section placement',
    fields: { number: 'Drawing number', title: 'Title', revision: 'Revision', status: 'Issue status', date: 'Issue date', discipline: 'Discipline', native: 'Native DWG', issued: 'Issued PDF' },
    present: 'present', missing: 'missing', pages: 'Pages', page: 'Page',
    viewerNote: 'Issued PDF viewer — load the PDF locally to preview it. Local preview only: nothing is uploaded or persisted.',
    loadPdf: 'Load issued PDF (local preview)', noPdf: 'No PDF loaded — regions below come from extraction data. No drawing content is fabricated.',
    runAi: 'Run AI extraction', runDemo: 'Load synthetic extraction (demo)',
    aiIdle: 'No extraction yet. Run the AI on the issued PDF, or load the badged synthetic demo.',
    aiPending: 'Extraction pending…', aiUnavailable: 'AI extraction service unavailable', aiNotConfigured: 'AI extraction service unavailable — the doc-intel function is not deployed. The review workflow still works: load the badged demo, or link records manually.',
    aiInvalid: 'Extraction failed — the AI response did not match the contract and was rejected. Nothing was rendered from it.',
    aiLiveNeedsPdf: 'Load the issued PDF first — the live extraction reads the PDF itself.',
    regions: 'Detected regions', focusHint: 'Click a suggestion to focus its source region.',
    ipaCtx: 'Current IPA context', inApp: 'Included in current application', support: 'Support status', missingRecs: 'Missing records', supRisk: 'Superseded-document risk',
    suggestions: 'Proposed BOQ links', confidence: 'confidence', explanation: 'Why',
    confirm: 'Confirm link', reject: 'Reject', choose: 'Choose another BOQ item', vo: 'Mark possible VO / outside BOQ', unresolved: 'Leave unresolved',
    linkWir: 'Link WIR', linkMeas: 'Link measurement', linkEl: 'Link IFC element',
    openModel: 'Open in model', showBasis: 'Show drawing basis', showChain: 'Show commercial proof chain',
    confirmed: 'Confirmed', rejected: 'Rejected', voMarked: 'VO review', unresolvedS: 'Unresolved', needsReview: 'Needs review',
    outside: 'Possible outside-BOQ scope', unit: 'Unit', location: 'Location', inIpaYes: 'Yes', inIpaNo: 'No — not in the current application',
    statusMap: { supported: 'Supported', gaps: 'Gaps', not_in_application: 'Not in application' },
    aiNever: 'AI never auto-confirms links, writes certified quantities, changes rates, approves WIRs, submits an IPA or certifies an IPC.',
    notPersisted: NOT_PERSISTED,
    demoTag: 'DEMO', liveTag: 'LIVE', period: 'Work period', volume: 'Volume', section: 'Section', requirement: 'Requirement', boqItem: 'BOQ item', effIpc: 'Effective IPC',
  },
  ar: {
    title: 'مراجعة ذكاء المخططات', subtitle: 'الذكاء الاصطناعي يقترح — والإنسان يؤكد كل رابط',
    close: 'إغلاق', drawing: 'المخطط', revisionHist: 'سجل المراجعات', latest: 'أحدث مراجعة معتمدة',
    supersededWarn: 'هذه المراجعة مرتبطة بمراجعة مخطط ملغاة', ipaPlacement: 'موضع القسم في طلب الدفعة',
    fields: { number: 'رقم المخطط', title: 'العنوان', revision: 'المراجعة', status: 'حالة الإصدار', date: 'تاريخ الإصدار', discipline: 'التخصص', native: 'DWG أصلي', issued: 'PDF صادر' },
    present: 'موجود', missing: 'غير موجود', pages: 'الصفحات', page: 'صفحة',
    viewerNote: 'عارض الـPDF الصادر — حمّل الملف محليًا للمعاينة. معاينة محلية فقط: لا رفع ولا حفظ.',
    loadPdf: 'تحميل الـPDF الصادر (معاينة محلية)', noPdf: 'لا يوجد PDF محمّل — المناطق أدناه من بيانات الاستخراج. لا يُصطنع أي محتوى للمخطط.',
    runAi: 'تشغيل الاستخراج بالذكاء الاصطناعي', runDemo: 'تحميل استخراج تجريبي (معاينة)',
    aiIdle: 'لا يوجد استخراج بعد. شغّل الذكاء الاصطناعي على الـPDF الصادر، أو حمّل النسخة التجريبية الموسومة.',
    aiPending: 'الاستخراج قيد التنفيذ…', aiUnavailable: 'خدمة الاستخراج غير متوفرة', aiNotConfigured: 'خدمة الاستخراج غير متوفرة — دالة doc-intel غير منشورة. تظل المراجعة تعمل: حمّل النسخة التجريبية أو اربط السجلات يدويًا.',
    aiInvalid: 'فشل الاستخراج — استجابة الذكاء الاصطناعي لم تطابق العقد ورُفضت. لم يُعرض منها شيء.',
    aiLiveNeedsPdf: 'حمّل الـPDF الصادر أولًا — الاستخراج الحي يقرأ الملف نفسه.',
    regions: 'المناطق المكتشفة', focusHint: 'انقر اقتراحًا لإبراز منطقته المصدر.',
    ipaCtx: 'سياق طلب الدفعة الحالي', inApp: 'مدرج في الطلب الحالي', support: 'حالة الإسناد', missingRecs: 'سجلات ناقصة', supRisk: 'خطر مستند ملغى',
    suggestions: 'روابط بنود الكميات المقترحة', confidence: 'الثقة', explanation: 'السبب',
    confirm: 'تأكيد الربط', reject: 'رفض', choose: 'اختيار بند كميات آخر', vo: 'وسم كأمر تغييري محتمل / خارج الجداول', unresolved: 'ترك بلا حسم',
    linkWir: 'ربط طلب تفتيش', linkMeas: 'ربط حصر', linkEl: 'ربط عنصر IFC',
    openModel: 'فتح في النموذج', showBasis: 'إظهار أساس المخطط', showChain: 'إظهار سلسلة الإثبات التجارية',
    confirmed: 'مؤكَّد', rejected: 'مرفوض', voMarked: 'مراجعة أمر تغييري', unresolvedS: 'بلا حسم', needsReview: 'يحتاج مراجعة',
    outside: 'محتمل خارج نطاق الجداول', unit: 'الوحدة', location: 'الموقع', inIpaYes: 'نعم', inIpaNo: 'لا — ليس في الطلب الحالي',
    statusMap: { supported: 'مدعوم', gaps: 'فجوات', not_in_application: 'ليس في الطلب' },
    aiNever: 'الذكاء الاصطناعي لا يؤكد الروابط تلقائيًا، ولا يكتب كميات معتمدة، ولا يغيّر الأسعار، ولا يعتمد طلبات التفتيش، ولا يقدّم طلب دفعة، ولا يصدر شهادة اعتماد.',
    notPersisted: 'قرارات المراجعة غير محفوظة — سجلات مراجعة على الواجهة فقط في هذا الإصدار.',
    demoTag: 'تجريبي', liveTag: 'حي', period: 'فترة العمل', volume: 'المجلد', section: 'القسم', requirement: 'المتطلب', boqItem: 'بند الكميات', effIpc: 'الاعتماد الساري',
  },
};

const STATUS_TONE = {
  confirmed: { c: COL.certified, s: COL.certifiedSoft }, rejected: { c: '#b91c1c', s: '#fee2e2' },
  vo_review: { c: '#b45309', s: '#fef3c7' }, unresolved: { c: '#57534e', s: '#f5f5f4' },
  needs_review: { c: '#d97706', s: '#fef3c7' },
};

function Pill({ label, tone }) {
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold whitespace-nowrap" style={{ background: tone?.s || COL.surfaceAlt, color: tone?.c || COL.textDim }}>{label}</span>;
}
function Row({ k, v, warn }) {
  return (
    <div className="flex items-start justify-between gap-2 text-[11.5px] py-0.5">
      <span style={{ color: COL.textDim }}>{k}</span>
      <span className="font-medium text-end break-words" style={{ color: warn ? '#b45309' : COL.text }}>{v ?? '—'}</span>
    </div>
  );
}

export function DrawingIntelligenceReview({ lang = 'en', entry, onClose, onNavigate }) {
  const t = L[lang] || L.en;
  const rtl = lang === 'ar';
  const env = { ipa: DEMO_IPA, drawings: DEMO_DRAWINGS };

  const anchor = useMemo(() => resolveReviewEntry(entry, env), [entry]);
  const [session, setSession] = useState(() => createReviewSession({ anchor, ...env, extraction: null, candidates: [], source: 'none' }));
  const [aiState, setAiState] = useState('idle'); // idle|pending|ok|unavailable|not_configured|invalid
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [picker, setPicker] = useState(null); // { candId, kind:'boq'|'wir'|'measurement'|'element' }
  const fileRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); if (pdfUrl) URL.revokeObjectURL(pdfUrl); };
  }, [onClose, pdfUrl]);

  const drawing = session.drawing;
  const rev = session.revision;
  const arts = revisionArtifacts(rev);
  const pageCount = Math.max(1, ...(session.extraction?.detected_regions || []).map((r) => r.page));
  const regionsOnPage = (session.extraction?.detected_regions || []).filter((r) => r.page === page);

  const adoptExtraction = (extraction, source) => {
    const candidates = buildCandidates(extraction, DEMO_BOQ_CATALOG, {
      wirs: DEMO_WIR_POOL, measurements: DEMO_MEASUREMENT_POOL, elements: DEMO_ELEMENT_POOL,
    });
    setSession((s) => ({ ...createReviewSession({ anchor, ...env, extraction, candidates, source }), candidates }));
  };

  const onPickPdf = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    // feature-detected: jsdom (tests) has no object URLs — the base64 read
    // below still runs, so the live-extraction path works either way.
    if (typeof URL.createObjectURL === 'function') {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(URL.createObjectURL(f));
    }
    setPdfFile(f);
  };

  // Encode at RUN time (no racy reader state): pick → run always works.
  const encodePdf = (f) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || null);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(f);
  });

  const runLive = async () => {
    if (!pdfFile) { setAiState('needs_pdf'); return; }
    setAiState('pending');
    let pdfB64 = null;
    try { pdfB64 = await encodePdf(pdfFile); } catch { /* handled below */ }
    if (!pdfB64) { setAiState('unavailable'); return; }
    const res = await runExtraction({
      document: { type: 'base64_pdf', data: pdfB64 },
      drawing: { number: drawing?.number, title: drawing?.title, revision: rev?.rev, discipline: 'Structural' },
      boqCandidates: DEMO_BOQ_CATALOG, wirs: DEMO_WIR_POOL, measurements: DEMO_MEASUREMENT_POOL,
      ipaContext: session.ipaContext,
    });
    if (res.state === 'ok') { adoptExtraction(res.extraction, 'live'); setAiState('ok'); }
    else setAiState(res.state);
  };

  const runDemo = () => { adoptExtraction(DEMO_EXTRACTION, 'demo'); setAiState('ok'); };

  const act = (fn, ...args) => setSession((s) => { try { return fn(s, ...args); } catch { return s; } });
  const focus = (regionId) => {
    setSession((s) => focusRegion(s, regionId));
    const r = (session.extraction?.detected_regions || []).find((x) => x.id === regionId);
    if (r) setPage(r.page);
  };

  const boqName = (id) => DEMO_BOQ_CATALOG.find((b) => b.id === id)?.description || id;
  const ctx = session.ipaContext;

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} role="dialog" aria-modal="true" aria-label={t.title}
      className="fixed inset-0 z-50 flex flex-col" style={{ background: COL.bg }}>
      {/* header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b" style={{ background: COL.surface, borderColor: COL.border }}>
        <ScanSearch size={17} style={{ color: COL.accent }} />
        <div className="min-w-0">
          <div className="text-[14px] font-bold truncate" style={{ color: COL.text }}>{t.title}</div>
          <div className="text-[10.5px]" style={{ color: COL.textMute }}>{t.subtitle}</div>
        </div>
        <span className="mono text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: COL.goldSoft, color: COL.gold }}>{PAW_BADGE}</span>
        {session.source === 'demo' && <span className="mono text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: '#fef3c7', color: '#b45309' }}>{DRAWING_INTEL_BADGE}</span>}
        <div className="flex-1" />
        <Btn onClick={onClose} icon={X}>{t.close}</Btn>
      </div>

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-[280px_1fr_360px] gap-0 overflow-hidden">
        {/* ── LEFT: drawing identity / revisions / IPA placement ── */}
        <div className="border-e overflow-y-auto scrollbar p-3 space-y-3" style={{ borderColor: COL.border, background: COL.surface }}>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: COL.textMute }}>{t.drawing}</div>
            <Row k={t.fields.number} v={drawing?.number} />
            <Row k={t.fields.title} v={drawing?.title} />
            <Row k={t.fields.revision} v={rev?.rev} warn={session.superseded} />
            <Row k={t.fields.status} v={session.extraction?.issue_status || 'Issued for Construction'} />
            <Row k={t.fields.date} v={rev?.issuedOn} />
            <Row k={t.fields.discipline} v={session.extraction?.discipline || 'Structural'} />
            <Row k={t.fields.native} v={arts.native ? `${t.present} · ${arts.native.originalFilename}` : t.missing} warn={!arts.native} />
            <Row k={t.fields.issued} v={arts.issued ? `${t.present} · ${arts.issued.originalFilename}` : t.missing} warn={!arts.issued} />
          </div>

          {session.superseded && (
            <div className="flex items-start gap-1.5 text-[11px] px-2 py-1.5 rounded-lg" style={{ background: '#fef3c7', color: '#b45309' }}>
              <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
              {t.supersededWarn} — {rev?.rev} → {session.latestApproved?.rev}
            </div>
          )}

          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: COL.textMute }}>{t.revisionHist}</div>
            {(drawing?.revisions || []).map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-[11.5px] py-0.5">
                <GitCommitHorizontal size={12} style={{ color: r.id === session.latestApproved?.id ? COL.certified : COL.textMute }} />
                <span className={`mono font-semibold ${r.id !== session.latestApproved?.id ? 'line-through' : ''}`} dir="ltr"
                  style={{ color: r.id === session.latestApproved?.id ? COL.text : COL.textMute }}>{r.rev}</span>
                <span className="mono text-[10px]" dir="ltr" style={{ color: COL.textMute }}>{r.issuedOn}</span>
                {r.id === session.latestApproved?.id && <span className="text-[9.5px]" style={{ color: COL.certified }}>{t.latest}</span>}
              </div>
            ))}
          </div>

          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: COL.textMute }}>{t.ipaPlacement}</div>
            <Row k="IPA" v={ctx?.ipaNo != null ? `IPA-${String(ctx.ipaNo).padStart(2, '0')}` : '—'} />
            <Row k={t.period} v={ctx?.period} />
            <Row k={t.volume} v={ctx?.volume?.[lang] || ctx?.volume?.en} />
            <Row k={t.section} v={ctx?.section?.[lang] || ctx?.section?.en} />
            <Row k={t.requirement} v={ctx?.requirementId} />
          </div>

          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: COL.textMute }}>{t.pages}</div>
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                <button key={p} onClick={() => setPage(p)} className="px-2 py-1 rounded text-[11px] mono"
                  style={{ background: page === p ? COL.accentBg : COL.surfaceAlt, color: page === p ? COL.accent : COL.textDim }}>{t.page} {p}</button>
              ))}
            </div>
          </div>
        </div>

        {/* ── CENTER: PDF viewer + region overlays + AI state ── */}
        <div className="overflow-y-auto scrollbar p-3 space-y-3 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={onPickPdf} />
            <Btn icon={FileImage} onClick={() => fileRef.current?.click()}>{t.loadPdf}</Btn>
            <Btn icon={Sparkles} variant="primary" onClick={runLive} disabled={aiState === 'pending'}>{t.runAi}</Btn>
            <Btn icon={FlaskConical} onClick={runDemo}>{t.runDemo}</Btn>
            <div className="flex-1" />
            <button aria-label="zoom out" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} className="p-1.5 rounded" style={{ background: COL.surfaceAlt }}><ZoomOut size={13} /></button>
            <span className="mono text-[10.5px]" dir="ltr" style={{ color: COL.textDim }}>{Math.round(zoom * 100)}%</span>
            <button aria-label="zoom in" onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))} className="p-1.5 rounded" style={{ background: COL.surfaceAlt }}><ZoomIn size={13} /></button>
            <button aria-label="previous page" onClick={() => setPage((p) => Math.max(1, p - 1))} className="p-1.5 rounded" style={{ background: COL.surfaceAlt }}>{rtl ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}</button>
            <span className="mono text-[10.5px]" dir="ltr">{page}/{pageCount}</span>
            <button aria-label="next page" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} className="p-1.5 rounded" style={{ background: COL.surfaceAlt }}>{rtl ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}</button>
          </div>

          {/* honest AI state line */}
          {aiState === 'idle' && <div className="text-[11px] px-2.5 py-2 rounded-lg" style={{ background: COL.surfaceAlt, color: COL.textDim }}>{t.aiIdle}</div>}
          {aiState === 'pending' && <div className="flex items-center gap-2 text-[11px] px-2.5 py-2 rounded-lg" style={{ background: COL.accentBg, color: COL.accent }}><Loader2 size={13} className="animate-spin" />{t.aiPending}</div>}
          {aiState === 'needs_pdf' && <div className="text-[11px] px-2.5 py-2 rounded-lg" style={{ background: '#fef3c7', color: '#b45309' }}>{t.aiLiveNeedsPdf}</div>}
          {(aiState === 'unavailable' || aiState === 'not_configured') && (
            <div className="flex items-start gap-2 text-[11px] px-2.5 py-2 rounded-lg" style={{ background: '#fee2e2', color: '#b91c1c' }}>
              <CircleSlash size={13} className="flex-shrink-0 mt-0.5" />{aiState === 'not_configured' ? t.aiNotConfigured : t.aiUnavailable}
            </div>
          )}
          {aiState === 'invalid' && <div className="flex items-start gap-2 text-[11px] px-2.5 py-2 rounded-lg" style={{ background: '#fee2e2', color: '#b91c1c' }}><FileX2 size={13} className="flex-shrink-0 mt-0.5" />{t.aiInvalid}</div>}

          {/* page surface: real PDF if loaded; overlays from extraction geometry */}
          <div className="overflow-auto rounded-xl border" style={{ borderColor: COL.borderStrong, background: '#eceef2' }}>
            <div className="relative mx-auto my-3" style={{ width: `${Math.round(94 * zoom)}%`, aspectRatio: '1.414 / 1', background: COL.surface, boxShadow: '0 2px 12px rgba(16,24,40,0.12)' }}>
              {pdfUrl ? (
                <object data={`${pdfUrl}#page=${page}&toolbar=0`} type="application/pdf" className="absolute inset-0 w-full h-full" aria-label="issued PDF preview" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                  <FileImage size={20} style={{ color: COL.textMute }} />
                  <div className="text-[11px] mt-2 max-w-sm" style={{ color: COL.textMute }}>{t.noPdf}</div>
                </div>
              )}
              {/* region overlays — normalized bbox → % geometry; LTR canvas always */}
              <div dir="ltr" className="absolute inset-0 pointer-events-none">
                {regionsOnPage.map((r) => {
                  const [x, y, w, h] = r.bbox || [0, 0, 0.1, 0.05];
                  const focused = session.focus?.regionId === r.id;
                  return (
                    <button key={r.id} onClick={() => focus(r.id)} title={r.text}
                      className="absolute pointer-events-auto rounded-sm transition-all"
                      style={{
                        left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%`,
                        border: `2px solid ${focused ? COL.accent : 'rgba(37,99,235,0.45)'}`,
                        background: focused ? 'rgba(37,99,235,0.14)' : 'rgba(37,99,235,0.05)',
                        boxShadow: focused ? '0 0 0 3px rgba(37,99,235,0.25)' : 'none',
                      }}>
                      <span className="mono text-[8px] px-1 rounded-br" style={{ background: focused ? COL.accent : 'rgba(37,99,235,0.45)', color: '#fff', position: 'absolute', top: -1, left: -1 }}>{r.id}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="text-[10px]" style={{ color: COL.textMute }}>{t.viewerNote} · {t.focusHint}</div>

          {/* region list for the current page */}
          {regionsOnPage.length > 0 && (
            <div className="rounded-xl border p-2.5" style={{ borderColor: COL.border, background: COL.surface }}>
              <div className="text-[10.5px] font-bold uppercase tracking-wide mb-1" style={{ color: COL.textMute }}>{t.regions} — {t.page} {page}</div>
              {regionsOnPage.map((r) => (
                <button key={r.id} onClick={() => focus(r.id)} className="w-full text-start flex items-start gap-2 px-2 py-1.5 rounded text-[11px] hover:bg-black/[0.03]"
                  style={{ background: session.focus?.regionId === r.id ? COL.accentBg : 'transparent' }}>
                  <span className="mono text-[9px] px-1 rounded flex-shrink-0 mt-0.5" dir="ltr" style={{ background: COL.surfaceAlt, color: COL.textDim }}>{r.id}</span>
                  <span className="flex-1" style={{ color: COL.text }}>{r.text}</span>
                  <span className="mono text-[9px] flex-shrink-0" dir="ltr" style={{ color: COL.textMute }}>{r.region_type} · {Math.round(r.confidence * 100)}%</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT: IPA context + candidates + human actions ── */}
        <div className="border-s overflow-y-auto scrollbar p-3 space-y-3" style={{ borderColor: COL.border, background: COL.surface }}>
          <div className="rounded-xl border p-2.5" style={{ borderColor: COL.border, background: COL.bg }}>
            <div className="text-[10.5px] font-bold uppercase tracking-wide mb-1" style={{ color: COL.textMute }}>{t.ipaCtx}</div>
            <Row k={t.inApp} v={ctx?.includedInCurrentIpa ? t.inIpaYes : t.inIpaNo} warn={!ctx?.includedInCurrentIpa} />
            <Row k={t.support} v={t.statusMap[ctx?.supportStatus] || ctx?.supportStatus} warn={ctx?.supportStatus === 'gaps'} />
            {ctx?.missingRecords?.length > 0 && <Row k={t.missingRecs} v={ctx.missingRecords.join(', ')} warn />}
            <Row k={t.supRisk} v={ctx?.supersededRisk ? '⚠' : '—'} warn={ctx?.supersededRisk} />
            <Row k={t.boqItem} v={ctx?.boqItemId} />
            <Row k={t.effIpc} v={ctx?.effectiveIpc} />
          </div>

          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: COL.textMute }}>{t.suggestions}</div>
            {session.source === 'demo' && <span className="mono text-[8.5px] px-1.5 py-0.5 rounded-full" style={{ background: '#fef3c7', color: '#b45309' }}>{t.demoTag}</span>}
            {session.source === 'live' && <span className="mono text-[8.5px] px-1.5 py-0.5 rounded-full" style={{ background: COL.certifiedSoft, color: COL.certified }}>{t.liveTag}</span>}
          </div>

          {session.candidates.length === 0 && <div className="text-[11px] py-3" style={{ color: COL.textMute }}>{t.aiIdle}</div>}

          {session.candidates.map((c) => {
            const final = c.status === 'confirmed' || c.status === 'rejected';
            const decided = final || c.status === 'vo_review' || c.status === 'unresolved';
            return (
              <div key={c.id} className="rounded-xl border p-2.5" style={{ borderColor: c.possibleOutsideScope ? '#fcd34d' : COL.border, background: decided ? COL.bg : COL.surface }}>
                <div className="flex items-center justify-between gap-2">
                  <button onClick={() => focus(c.regionId)} className="mono text-[11px] font-bold hover:underline" dir="ltr" style={{ color: c.boqItemId ? COL.text : '#b45309' }}>
                    {c.boqItemId || t.outside}
                  </button>
                  {c.status === 'suggested' && <span className="mono text-[9.5px] px-1.5 py-0.5 rounded-full" dir="ltr" style={{ background: COL.accentBg, color: COL.accent }}>{Math.round(c.confidence * 100)}% {t.confidence}</span>}
                  {c.status === 'confirmed' && <Pill label={t.confirmed} tone={STATUS_TONE.confirmed} />}
                  {c.status === 'rejected' && <Pill label={t.rejected} tone={STATUS_TONE.rejected} />}
                  {c.status === 'vo_review' && <Pill label={t.voMarked} tone={STATUS_TONE.vo_review} />}
                  {c.status === 'unresolved' && <Pill label={t.unresolvedS} tone={STATUS_TONE.unresolved} />}
                </div>
                {c.boqItemId && <div className="text-[10.5px] mt-0.5" style={{ color: COL.textDim }}>{boqName(c.boqItemId)}</div>}
                <div className="text-[10.5px] mt-1.5" style={{ color: COL.textDim }}><span className="font-semibold">{t.explanation}:</span> {c.explanation}</div>
                <button onClick={() => focus(c.regionId)} className="mt-1 w-full text-start text-[10px] px-2 py-1 rounded mono hover:bg-black/[0.04]" dir="ltr" style={{ background: COL.surfaceAlt, color: COL.textDim }}>
                  “{c.matchedDrawingText}” <span style={{ color: COL.accent }}>({c.regionId})</span>
                </button>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[10px]" style={{ color: COL.textMute }}>
                  <span>{t.unit}: {c.unitCompatible === true ? '✓' : c.unitCompatible === false ? '✗' : '—'}</span>
                  <span>{t.location}: {c.locationMatch === true ? '✓' : c.locationMatch === false ? '✗' : '—'}</span>
                  {c.relatedWirs.length > 0 && <span className="mono" dir="ltr"><ClipboardCheck size={9} className="inline" /> {c.relatedWirs.join(', ')}</span>}
                  {c.relatedMeasurements.length > 0 && <span className="mono" dir="ltr"><Ruler size={9} className="inline" /> {c.relatedMeasurements.join(', ')}</span>}
                  {c.relatedElements.length > 0 && <span className="mono" dir="ltr"><Box size={9} className="inline" /> {c.relatedElements.join(', ')}</span>}
                </div>
                {c.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[10px] mt-1" style={{ color: '#b45309' }}><AlertTriangle size={10} className="flex-shrink-0 mt-0.5" />{w}</div>
                ))}

                {!decided && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <Btn size="sm" variant="primary" onClick={() => act(confirmCandidate, c.id)} disabled={!c.boqItemId}>{t.confirm}</Btn>
                    <Btn size="sm" onClick={() => act(rejectCandidate, c.id)}>{t.reject}</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => setPicker(picker?.candId === c.id && picker?.kind === 'boq' ? null : { candId: c.id, kind: 'boq' })}>{t.choose}</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => act(markOutsideScope, c.id)}>{t.vo}</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => act(leaveUnresolved, c.id)}>{t.unresolved}</Btn>
                    <Btn size="sm" variant="ghost" icon={Link2} onClick={() => setPicker(picker?.candId === c.id && picker?.kind === 'wir' ? null : { candId: c.id, kind: 'wir' })}>{t.linkWir}</Btn>
                    <Btn size="sm" variant="ghost" icon={Ruler} onClick={() => setPicker(picker?.candId === c.id && picker?.kind === 'measurement' ? null : { candId: c.id, kind: 'measurement' })}>{t.linkMeas}</Btn>
                    <Btn size="sm" variant="ghost" icon={Box} onClick={() => setPicker(picker?.candId === c.id && picker?.kind === 'element' ? null : { candId: c.id, kind: 'element' })}>{t.linkEl}</Btn>
                  </div>
                )}
                {picker?.candId === c.id && (
                  <div className="mt-2 flex flex-col gap-1">
                    {(picker.kind === 'boq' ? DEMO_BOQ_CATALOG.map((b) => ({ id: b.id, label: `${b.id} — ${b.description}` }))
                      : picker.kind === 'wir' ? DEMO_WIR_POOL.map((w) => ({ id: w.id, label: `${w.id} — ${w.title}` }))
                      : picker.kind === 'measurement' ? DEMO_MEASUREMENT_POOL.map((m) => ({ id: m.id, label: `${m.id} — ${m.title}` }))
                      : DEMO_ELEMENT_POOL.map((el) => ({ id: el.id, label: `${el.id} — ${el.label}` }))
                    ).map((opt) => (
                      <button key={opt.id} onClick={() => { act(picker.kind === 'boq' ? reassignCandidate : (s, id, ref) => linkRelated(s, id, picker.kind, ref), c.id, opt.id); setPicker(null); }}
                        className="text-start text-[10.5px] px-2 py-1 rounded hover:bg-black/[0.04]" style={{ color: COL.accent }}>
                        <span className="mono" dir="ltr">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                )}
                {c.relatedElements.length > 0 && (
                  <div className="flex gap-1.5 mt-1.5">
                    <Btn size="sm" variant="ghost" icon={Box} onClick={() => onNavigate?.('model')}>{t.openModel}</Btn>
                    <Btn size="sm" variant="ghost" icon={FileImage} onClick={() => focus(c.regionId)}>{t.showBasis}</Btn>
                    <Btn size="sm" variant="ghost" icon={CheckCircle2} onClick={onClose}>{t.showChain}</Btn>
                  </div>
                )}
              </div>
            );
          })}

          <div className="text-[9.5px] leading-relaxed pt-1 border-t" style={{ color: COL.textMute, borderColor: COL.border }}>
            {t.notPersisted}<br />{t.aiNever}
          </div>
        </div>
      </div>
    </div>
  );
}
