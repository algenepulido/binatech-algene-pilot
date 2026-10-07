import { useMemo, useRef, useState } from 'react';
import { RotateCcw, AlertOctagon, ChevronRight, Search } from 'lucide-react';
import { Btn } from '../components/primitives.jsx';
import { Drawer } from '../components/Drawer.jsx';
import { useCommercialData } from '../lib/useCommercialData.js';
import { BLOCKER_META, blockerLabel } from '../lib/controlRoom.js';
import { useIsMobile } from '../lib/useIsMobile.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { fmt } from '../lib/format.js';
import { COL } from '../lib/theme.js';

// ============================================================
// CommercialHubView — COMMERCIAL CONTROL · Overview (ACC-CC1, first working slice).
// Route id stays `commercialhub`. Read-only: no writes, no schema, no new money
// math — every figure is one the shared deriveControlRoom() already produces.
//
// DATA TRUTH (verified against src/lib/controlRoom.js + useCommercialData.js):
//   * BoQ value           — qty x rate DERIVED from the loaded BoQ rows. It is not
//     the authoritative revised contract sum and is never labelled as one.
//   * Inspection-approved — kpis.certifiableTotal = stored BoQ approved_qty x rate,
//     written by the legacy recertify path from APPROVED WIRs. No verified
//     measurement takes part, so it is inspection / QA approval. It is NOT
//     commercial eligibility and NOT certification, and is never labelled so.
//   * Blocked             — NCR/rejected hold (element-share estimate) + WIR
//     awaiting approval + contract value with no WIR coverage.
//   * Certified in IPC    — gross of IPC rows whose status is certified or paid,
//     shown with the number of certificate rows it came from. The hook maps a
//     REJECTED optional IPC fetch to ipcs=[] with no flag, so an empty list may be
//     missing data: the figure is then WITHHELD ("Not available"), never printed as 0.
//   Blocker results are limited derived signals (WIR, element-link and
//   element-status rows; a failed optional read produces no signal) — never an
//   all-clear. No project identity is shown: the project context can fall back to
//   a built-in identity and can change without this hook reloading, so it cannot
//   be bound to the displayed rows.
//   OMITTED, because no defensible source exists here: Executed, Measured,
//   Eligible, Claimed, Invoiced, Paid, forecasts — and the hook's zero-clamped
//   "ready to certify" header subtraction, whose IPC basis is unknown. The
//   owner / next-action / target-IPC fields are hard-coded suggestions and stay out.
//
// HONEST STATES: the hook substitutes the SYNTHETIC demo room whenever it holds no
// real rows — including while loading and after a failed critical fetch. So this
// view gates on loadError and loading BEFORE it reads the room: a failure shows
// an error and a retry, never invented money, not even under a demo label.
// ============================================================
const TR = {
  en: {
    title: 'Commercial Control', readOnly: 'Read-only overview. It does not certify, approve or pay anything.',
    sections: 'Commercial sections', overview: 'Overview', queue: 'Certification Queue', controlRoom: 'Control Room', ipcs: 'IPCs', cash: 'Cash flow',
    refresh: 'Refresh', refreshing: 'Refreshing…', retry: 'Retry',
    loading: 'Loading commercial data…',
    errorTitle: 'Commercial data could not be loaded.', errorBody: 'No figures are shown, because nothing on this page could be confirmed against the project records. Check the connection and try again.',
    demoTitle: 'Demo — sample data', demoEmpty: 'No project BoQ is loaded, so every figure on this page is invented for illustration. Not this project’s records.',
    demoOffline: 'No data connection is configured here, so every figure on this page is invented for illustration. Not this project’s records.',
    sample: 'Sample',
    sBoq: 'BoQ value', nBoq: 'BoQ quantity × rate from the loaded BoQ. Not the revised contract sum.',
    sWir: 'Inspection-approved (WIR)', nWir: 'WIR-approved quantity × rate. Not commercial acceptance or certification.',
    sBlocked: 'Blocked', nBlocked: 'NCR or rejected hold, WIR awaiting approval, no WIR coverage',
    sCertified: 'Certified in IPC', nCertified: 'Gross of certificates with status certified or paid', fromRecords: (n, of) => `counts ${n} of ${of} certificate ${of === 1 ? 'record' : 'records'} loaded`,
    notAvailable: 'Not available', nIpcNone: 'No certificate records were returned — none exist or they could not be read.',
    attention: 'Needs attention', signalScope: 'Derived signals, limited to the WIR, element-link and element-status records loaded.',
    attentionNone: 'No blocker signal in the loaded records. That is not an all-clear: a record that is missing or could not be read produces no signal.', lines: 'lines', line: 'line',
    estimate: 'estimate from linked-element share', insideApproved: 'inside the inspection-approved value',
    evidenceUnknown: 'Evidence status unavailable — the attachment index could not be read, so no evidence gap is derived.',
    tableTitle: 'BoQ lines', sampleLines: 'Sample lines', valuesIn: 'Values in SAR', search: 'Search BoQ code or description', all: 'All',
    cCode: 'BoQ', cDesc: 'Description', cUnit: 'Unit', cBoq: 'BoQ value', cWir: 'Inspection-approved (WIR)', cBlocked: 'Blocked', cStatus: 'Status', cBlocker: 'Main blocker', cWirs: 'WIRs',
    noLines: 'No BoQ lines match this filter.', none: '—',
    status: { ready: 'No blocker signal', partial: 'Partly blocked', blocked: 'Blocked', review: 'Review needed', idle: 'No recorded activity' },
    dBreakdown: 'Value breakdown', dSubmitted: 'Submitted on WIRs', dNcr: 'NCR or rejected hold (estimate)', dPending: 'WIR awaiting approval', dMissing: 'No WIR coverage', dOver: 'WIR quantity above contract', dEvidence: 'Approved WIRs with no file attached',
    dBlockers: 'Open blockers', dNoBlockers: 'No blockers derived for this line.', dWirs: 'Linked WIRs', dNoWirs: 'No WIR is attributed to this line.', dOpenQueue: 'Open in Certification Queue', pickLine: 'Select a BoQ line to see its breakdown.', close: 'Close', dQty: 'Contract qty',
  },
  ar: {
    title: 'التحكم التجاري', readOnly: 'عرض للقراءة فقط. لا يعتمد ولا يوافق ولا يدفع أي شيء.',
    sections: 'أقسام التحكم التجاري', overview: 'نظرة عامة', queue: 'قائمة الاعتماد', controlRoom: 'غرفة التحكم', ipcs: 'الشهادات', cash: 'التدفق النقدي',
    refresh: 'تحديث', refreshing: 'جارٍ التحديث…', retry: 'إعادة المحاولة',
    loading: 'جارٍ تحميل البيانات التجارية…',
    errorTitle: 'تعذّر تحميل البيانات التجارية.', errorBody: 'لا تُعرض أي أرقام، لأنه لم يمكن التحقق من أي شيء في هذه الصفحة مقابل سجلات المشروع. تحقق من الاتصال ثم أعد المحاولة.',
    demoTitle: 'عرض تجريبي — بيانات تجريبية', demoEmpty: 'لم يُحمَّل جدول كميات للمشروع، لذا فكل رقم في هذه الصفحة مُختلَق للتوضيح. ليست سجلات هذا المشروع.',
    demoOffline: 'لا يوجد اتصال بيانات مُهيأ هنا، لذا فكل رقم في هذه الصفحة مُختلَق للتوضيح. ليست سجلات هذا المشروع.',
    sample: 'تجريبي',
    sBoq: 'قيمة جدول الكميات', nBoq: 'كمية جدول الكميات × السعر من الجدول المحمّل. ليست قيمة العقد المعدّلة.',
    sWir: 'معتمد بالفحص (طلبات الفحص)', nWir: 'كمية طلبات الفحص المعتمدة × السعر. ليست قبولاً تجارياً ولا اعتماداً للدفع.',
    sBlocked: 'موقوف', nBlocked: 'إيقاف بمخالفة أو رفض، فحص بانتظار الاعتماد، بدون تغطية فحص',
    sCertified: 'معتمد في المستخلصات', nCertified: 'إجمالي المستخلصات التي حالتها معتمد أو مدفوع', fromRecords: (n, of) => `يشمل ${n} من ${of} سجل مستخلص محمّل`,
    notAvailable: 'غير متاح', nIpcNone: 'لم تُرجَع أي سجلات مستخلصات — إما أنها غير موجودة أو تعذّرت قراءتها.',
    attention: 'يتطلب الانتباه', signalScope: 'إشارات مستنتجة، تقتصر على سجلات طلبات الفحص وروابط العناصر وحالاتها المحمّلة.',
    attentionNone: 'لا توجد إشارة عائق في السجلات المحمّلة. هذا لا يعني خلوّ البنود من العوائق: السجل المفقود أو الذي تعذّرت قراءته لا يُنتج إشارة.', lines: 'بنود', line: 'بند',
    estimate: 'تقدير من حصة العناصر المرتبطة', insideApproved: 'ضمن القيمة المعتمدة بالفحص',
    evidenceUnknown: 'حالة الأدلة غير متاحة — تعذّرت قراءة فهرس المرفقات، لذا لا تُستنتج أي فجوة أدلة.',
    tableTitle: 'بنود جدول الكميات', sampleLines: 'بنود تجريبية', valuesIn: 'القيم بالريال السعودي', search: 'ابحث برمز البند أو الوصف', all: 'الكل',
    cCode: 'البند', cDesc: 'الوصف', cUnit: 'الوحدة', cBoq: 'قيمة الجدول', cWir: 'معتمد بالفحص', cBlocked: 'موقوف', cStatus: 'الحالة', cBlocker: 'العائق الرئيسي', cWirs: 'طلبات الفحص',
    noLines: 'لا توجد بنود تطابق هذا المرشّح.', none: '—',
    status: { ready: 'لا إشارة عائق', partial: 'موقوف جزئياً', blocked: 'موقوف', review: 'يتطلب مراجعة', idle: 'لا نشاط مسجّل' },
    dBreakdown: 'تفصيل القيمة', dSubmitted: 'مُقدَّم في طلبات الفحص', dNcr: 'إيقاف بمخالفة أو رفض (تقدير)', dPending: 'فحص بانتظار الاعتماد', dMissing: 'بدون تغطية فحص', dOver: 'كمية طلبات الفحص فوق العقد', dEvidence: 'طلبات فحص معتمدة بلا ملف مرفق',
    dBlockers: 'العوائق المفتوحة', dNoBlockers: 'لا توجد عوائق مستنتجة لهذا البند.', dWirs: 'طلبات الفحص المرتبطة', dNoWirs: 'لا يوجد طلب فحص منسوب لهذا البند.', dOpenQueue: 'افتح في قائمة الاعتماد', pickLine: 'اختر بند جدول الكميات لعرض تفصيله.', close: 'إغلاق', dQty: 'كمية العقد',
  },
};

// Existing commercial destinations only — a section with no route is omitted, not faked.
const SECTIONS = [
  { key: 'queue', route: 'certqueue', filter: 'all' },
  { key: 'controlRoom', route: 'certification-control-room' },
  { key: 'ipcs', route: 'ipcs' },
  { key: 'cash', route: 'cashflow' },
];
// Blocker reason -> the Certification Queue filter that already lists those lines.
const QUEUE_FILTER = { NCR_HOLD: 'ncr', OVERCLAIM: 'cap', WIR_PENDING: 'pending_wir', MISSING_WIR: 'missing_wir', MISSING_EVIDENCE: 'evidence', REVIEW_ANOMALY: 'all' };
const STATUS_ORDER = ['ready', 'partial', 'blocked', 'review', 'idle'];
// Sparse status colour: one dot per row, text stays ink. Green is not used — nothing here is certified or paid.
const STATUS_DOT = { ready: '#1d4ed8', partial: '#9A651A', blocked: '#b42318', review: '#6d28d9', idle: '#9ca3af' };
const AMBER = { background: '#fef3c7', borderColor: '#fde68a', color: '#92400e' };
// Secondary ledger columns (unit, main blocker, WIR count) join from 1280px; below that the line drawer carries them.
const WIDE = 'hidden xl:table-cell';

export function CommercialHubView({ lang = 'en', onNavigate }) {
  const L = TR[lang] || TR.en;
  const ar = lang === 'ar';
  const phone = useIsMobile();
  const { room, isDemo, loading, loadError, reload, ipcs } = useCommercialData();
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  // From 1024px the inspector is a panel beside the register, not a dialog over it.
  // Below that the shared Drawer stays exactly as it is, and keeps managing its own
  // focus. A panel that never closes cannot trap focus, so the panel does not try:
  // it leaves focus on the row that opened it and hands it back on Escape or Close.
  const narrow = useIsMobile(1023);
  const openerRef = useRef(null);
  const openLine = (id, el) => { openerRef.current = el ?? null; setOpenId(id); };
  const clearLine = () => {
    const opener = openerRef.current;
    openerRef.current = null;
    setOpenId(null);
    queueMicrotask(() => {
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
      else document.getElementById('main-content')?.focus?.({ preventScroll: true });
    });
  };

  // Gate BEFORE reading the room: with no real rows the hook hands back synthetic inputs.
  const state = loadError ? 'error' : (loading && isDemo) ? 'loading' : isDemo ? 'demo' : 'project';
  const showData = state === 'demo' || state === 'project';
  const demo = state === 'demo';
  const lines = showData ? room.lines : [];
  const kpis = room.kpis;

  const strip = useMemo(() => !showData ? [] : [
    { key: 'boq-value', label: L.sBoq, note: L.nBoq, value: lines.reduce((s, l) => s + l.values.contract, 0) },
    { key: 'wir-approved', label: L.sWir, note: L.nWir, value: kpis.certifiableTotal },
    { key: 'blocked', label: L.sBlocked, note: L.nBlocked, value: kpis.blockedValue },
    // No certificate rows = unknown coverage (the hook turns a rejected IPC read into []), so no figure — never a certified zero.
    ipcs.length > 0
      ? { key: 'certified-ipc', label: L.sCertified, note: `${L.nCertified} · ${L.fromRecords(ipcs.filter((p) => p.status === 'certified' || p.status === 'paid').length, ipcs.length)}`, value: kpis.certifiedInIpc }
      : { key: 'certified-ipc', label: L.sCertified, note: L.nIpcNone, value: null },
  ], [showData, lines, kpis, ipcs, L]);

  // Attention = the blocker reasons the derivation already attaches to lines, summed per reason.
  const attention = useMemo(() => {
    const by = {};
    for (const l of lines) for (const b of l.blockers) { const a = (by[b.reason] = by[b.reason] || { key: b.reason, value: 0, count: 0 }); a.value += b.value; a.count += 1; }
    return Object.values(by).sort((a, b) => b.value - a.value);
  }, [lines]);

  const counts = useMemo(() => { const c = { all: lines.length }; for (const k of STATUS_ORDER) c[k] = 0; for (const l of lines) c[l.cls] += 1; return c; }, [lines]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return lines.filter((l) => (status === 'all' || l.cls === status) && (!needle || `${l.code} ${l.description}`.toLowerCase().includes(needle)));
  }, [lines, status, q]);
  const open = openId ? lines.find((l) => l.id === openId) || null : null;

  // goCommercial(routeId, filter): only the Certification Queue consumes a filter — pass one only when it means something.
  const go = (route, filter) => (filter ? onNavigate?.(route, filter) : onNavigate?.(route));
  const money = (v) => fmt(v);
  const statusChip = (cls) => (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px]" style={{ color: COL.text }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: STATUS_DOT[cls] }} />{L.status[cls] || cls}
    </span>
  );
  const sampleTag = demo ? <span data-sample-tag className="mono text-[9px] uppercase tracking-wider px-1 py-px rounded border" style={AMBER}>{L.sample}</span> : null;

  // One inspector body, two presentations, so the panel and the Drawer can never
  // drift apart. `line` is always the open line; neither presentation renders it empty.
  const inspectorBody = (line) => (
          <div className="space-y-4 text-[12.5px]" dir={ar ? 'rtl' : 'ltr'}>
            {demo && <div className="rounded-md border px-3 py-1.5 text-[12px]" style={AMBER}><span className="font-semibold">{L.demoTitle}.</span></div>}
            <div className="flex items-center justify-between gap-3">{statusChip(line.cls)}<span className="mono text-[11.5px]" style={{ color: COL.textDim }}>{L.dQty} {fmt(line.contractQty)} {line.unit}</span></div>
            <div>
              <div className="text-[10.5px] uppercase tracking-wider font-semibold mb-1" style={{ color: COL.textMute }}>{L.dBreakdown} · {L.valuesIn}</div>
              <dl className="rounded-md border divide-y" style={{ borderColor: COL.border }}>
                {[[L.sBoq, line.values.contract], [L.dSubmitted, line.values.claimed], [L.sWir, line.values.certifiable], [L.dNcr, line.values.ncr], [L.dPending, line.values.pending], [L.dMissing, line.values.missingWir], [L.dOver, line.values.overclaim], [L.dEvidence, kpis.evidenceUnknown ? null : line.values.evidenceGap]].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 px-3 py-1.5" style={{ borderColor: COL.border }}><dt style={{ color: COL.textDim }}>{k}</dt><dd className="mono font-medium" style={{ color: COL.text }}>{v == null ? L.none : money(v)}</dd></div>
                ))}
              </dl>
              <p className="text-[11px] mt-1" style={{ color: COL.textMute }}>{L.nWir}</p>
            </div>
            <div>
              <div className="text-[10.5px] uppercase tracking-wider font-semibold mb-1" style={{ color: COL.textMute }}>{L.dBlockers}</div>
              {line.blockers.length === 0 ? <div style={{ color: COL.textMute }}>{L.dNoBlockers}</div> : (
                <ul className="rounded-md border divide-y" style={{ borderColor: COL.border }}>
                  {line.blockers.map((b) => <li key={b.reason} className="flex items-center justify-between gap-3 px-3 py-1.5" style={{ borderColor: COL.border }}><span style={{ color: COL.text }}>{blockerLabel(b.reason, lang)}</span><span className="mono">{money(b.value)}</span></li>)}
                </ul>
              )}
            </div>
            <div>
              <div className="text-[10.5px] uppercase tracking-wider font-semibold mb-1" style={{ color: COL.textMute }}>{L.dWirs}</div>
              {line.wirs.length === 0 ? <div style={{ color: COL.textMute }}>{L.dNoWirs}</div> : (
                <ul className="rounded-md border divide-y" style={{ borderColor: COL.border }}>
                  {line.wirs.map((w) => <li key={w.id} className="flex items-center justify-between gap-3 px-3 py-1.5" style={{ borderColor: COL.border }}><span className="mono" style={{ color: COL.text }}>{w.wir_number || w.id}</span><span style={{ color: COL.textDim }}>{w.result || L.none}</span></li>)}
                </ul>
              )}
            </div>
          </div>
  );
  const openQueueBtn = <Btn variant="primary" onClick={clearLine}>{L.dOpenQueue}</Btn>;

  return (
    <div className="flex-1 flex flex-col overflow-hidden" dir={ar ? 'rtl' : 'ltr'} data-commercial-state={state}
      onKeyDown={(e) => { if (!narrow && openId && e.key === 'Escape') { e.stopPropagation(); clearLine(); } }} style={{ background: COL.bg }}>
      {/* Compact workspace header: context, title, read-only statement, section bar. */}
      <header data-workspace-header className="border-b px-4 sm:px-6 pt-3" style={{ background: COL.surface, borderColor: COL.border }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="display text-[19px] sm:text-[21px] font-bold tracking-tight leading-tight" style={{ color: COL.text }}>{L.title}</h1>
            <p className="text-[12px] mt-0.5" style={{ color: COL.textDim }}>{L.readOnly}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {state === 'project' && loading && <span role="status" className="mono text-[10.5px]" style={{ color: COL.textMute }}>{L.refreshing}</span>}
            {/* Compact toolbar: the register filter sits with the page controls, not
                inside the table, so the table header carries only the status chips. */}
            {showData && !phone && (
              <label className="relative flex items-center w-56 lg:w-64">
                <Search size={13} className="absolute start-2.5" style={{ color: COL.textMute }} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L.search} aria-label={L.search} className="w-full rounded-md border ps-8 pe-2.5 text-[12.5px] outline-none" style={{ minHeight: 32, borderColor: COL.border, background: COL.surface, color: COL.text }} />
              </label>
            )}
            <Btn icon={RotateCcw} onClick={reload} disabled={loading}>{L.refresh}</Btn>
          </div>
        </div>
        <nav aria-label={L.sections} className="mt-2 -mb-px flex gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <button type="button" aria-current="page" className="px-3 text-[13px] font-semibold border-b-2 whitespace-nowrap" style={{ minHeight: 44, borderColor: COL.accent, color: COL.accent }}>{L.overview}</button>
          {SECTIONS.map((s) => (
            <button key={s.key} type="button" onClick={() => go(s.route, s.filter)} className="px-3 text-[13px] font-medium border-b-2 border-transparent whitespace-nowrap hover:bg-stone-50" style={{ minHeight: 44, color: COL.textDim }}>{L[s.key]}</button>
          ))}
        </nav>
      </header>

      <div className="flex-1 flex min-h-0 overflow-hidden">
      <div data-overview className="flex-1 min-w-0 overflow-y-auto scrollbar px-4 py-3 sm:px-6 sm:py-4 space-y-3">
        {state === 'loading' && (
          <div role="status" className="rounded-md border px-4 py-10 text-center text-[13px]" style={{ background: COL.surface, borderColor: COL.border, color: COL.textDim }}>{L.loading}</div>
        )}

        {state === 'error' && (
          <div role="alert" className="rounded-md border px-4 py-5 flex flex-col sm:flex-row sm:items-center gap-3" style={{ background: '#fef3f2', borderColor: '#fecdca', color: '#7a271a' }}>
            <AlertOctagon size={18} className="flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold">{L.errorTitle}</div>
              <div className="text-[12.5px] mt-0.5">{L.errorBody}</div>
            </div>
            <Btn icon={RotateCcw} variant="primary" onClick={reload}>{L.retry}</Btn>
          </div>
        )}

        {showData && (
          <>
            {demo && (
              <div data-demo-banner className="sticky top-0 z-10 rounded-md border px-3.5 py-2 flex items-start gap-2 text-[12.5px]" style={AMBER}>
                <AlertOctagon size={15} className="flex-shrink-0 mt-0.5" />
                <div className="min-w-0"><span className="font-semibold">{L.demoTitle}.</span> {isSupabaseConfigured ? L.demoEmpty : L.demoOffline}</div>
              </div>
            )}

            {/* A. Compact commercial state strip — one ruled band, not a tile wall. */}
            <div data-state-strip className="rounded-md border grid grid-cols-2 lg:grid-cols-4 overflow-hidden" style={{ background: COL.surface, borderColor: COL.border }}>
              {strip.map((c, i) => (
                <div key={c.key} data-state-cell={c.key} className={`px-3.5 py-2.5 min-w-0 ${i % 2 ? 'border-s' : ''} ${i > 1 ? 'border-t lg:border-t-0' : ''} ${i ? 'lg:border-s' : ''}`} style={{ borderColor: COL.border }}>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: COL.textDim }}><span className="truncate">{c.label}</span>{sampleTag}</div>
                  {c.value == null
                    ? <div data-ipc-unavailable className="text-[14px] font-semibold leading-tight mt-0.5" style={{ color: COL.textDim }}>{L.notAvailable}</div>
                    : <div className="mono text-[17px] font-semibold leading-tight mt-0.5" style={{ color: COL.text }}><span className="text-[10.5px] font-medium" style={{ color: COL.textMute }}>SAR </span>{money(c.value)}</div>}
                  <div className="text-[10.5px] leading-snug mt-0.5" style={{ color: COL.textMute }}>{c.note}</div>
                </div>
              ))}
            </div>

            {/* B. Attention — only conditions the loaded records already establish. */}
            <section data-attention className="rounded-md border" style={{ background: COL.surface, borderColor: COL.border }}>
              <div className="px-3.5 py-1.5 border-b flex flex-col lg:flex-row lg:items-baseline gap-x-2" style={{ borderColor: COL.border }}>
                <div className="flex items-center gap-2 text-[12px] font-semibold flex-shrink-0" style={{ color: COL.text }}>{L.attention}{sampleTag}</div>
                <div data-signal-scope className="text-[11px]" style={{ color: COL.textMute }}>{L.signalScope}</div>
              </div>
              {attention.length === 0 && <div className="px-3.5 py-2.5 text-[12.5px]" style={{ color: COL.textMute }}>{L.attentionNone}</div>}
              <div className="grid sm:grid-cols-2 xl:grid-cols-3">
              {attention.map((a) => (
                <button key={a.key} type="button" data-attention-item={a.key} onClick={() => go('certqueue', QUEUE_FILTER[a.key] || 'all')}
                  className="w-full px-3.5 py-1 flex items-center gap-3 border-b sm:border-e text-start hover:bg-stone-50" style={{ minHeight: 44, borderColor: COL.border }}>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12.5px] font-medium leading-tight" style={{ color: COL.text }}>{blockerLabel(a.key, lang)}</span>
                    <span className="block text-[10.5px] leading-tight mt-0.5" style={{ color: COL.textMute }}>{a.count} {a.count === 1 ? L.line : L.lines}{a.key === 'NCR_HOLD' ? ` · ${L.estimate}` : ''}{BLOCKER_META[a.key]?.inCertifiable ? ` · ${L.insideApproved}` : ''}</span>
                  </span>
                  <span className="mono text-[12.5px] font-semibold flex-shrink-0" style={{ color: COL.text }}>{money(a.value)}</span>
                  <ChevronRight size={14} className={`flex-shrink-0 ${ar ? 'rotate-180' : ''}`} style={{ color: COL.textMute }} />
                </button>
              ))}
              </div>
              {kpis.evidenceUnknown && <div data-evidence-unknown className="px-3.5 py-2 border-t text-[12px]" style={{ borderColor: COL.border, color: '#92400e', background: '#fffbeb' }}>{L.evidenceUnknown}</div>}
            </section>

            {/* C. The working table — one dense ledger of the existing BoQ lines. */}
            <section className="rounded-md border overflow-hidden" style={{ background: COL.surface, borderColor: COL.border }}>
              <div className="px-3.5 py-2 border-b flex flex-col lg:flex-row lg:items-center gap-2" style={{ borderColor: COL.border }}>
                <div data-table-caption className="flex items-center gap-2 text-[12px] font-semibold flex-shrink-0" style={{ color: COL.text }}>
                  {demo ? L.sampleLines : L.tableTitle}{sampleTag}<span className="font-normal" style={{ color: COL.textMute }}>· {L.valuesIn}</span>
                </div>
                <div className="flex-1 flex flex-wrap items-center gap-1.5 lg:justify-end">
                  {['all', ...STATUS_ORDER].map((k) => (
                    <button key={k} type="button" aria-pressed={status === k} onClick={() => setStatus(k)} className="px-2.5 rounded-md border text-[11.5px] font-medium whitespace-nowrap"
                      style={{ minHeight: 32, background: status === k ? COL.accentBg : COL.surface, borderColor: status === k ? COL.accent : COL.border, color: status === k ? COL.accent : COL.textDim }}>
                      {k === 'all' ? L.all : L.status[k]} · {counts[k]}
                    </button>
                  ))}
                  {phone && (
                    <label className="relative flex items-center w-full">
                      <Search size={13} className="absolute start-2.5" style={{ color: COL.textMute }} />
                      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L.search} aria-label={L.search} className="w-full rounded-md border ps-8 pe-2.5 text-[12.5px] outline-none" style={{ minHeight: 32, borderColor: COL.border, background: COL.surface, color: COL.text }} />
                    </label>
                  )}
                </div>
              </div>

              {rows.length === 0 ? <div className="px-3.5 py-6 text-center text-[12.5px]" style={{ color: COL.textMute }}>{L.noLines}</div> : phone ? (
                /* Phone: a compact line list — the desktop ledger is not squeezed onto a 390px screen. */
                <div data-line-list>
                  {rows.map((l) => (
                    <button key={l.id} type="button" data-line-row onClick={(e) => openLine(l.id, e.currentTarget)} className="w-full px-3.5 py-2.5 border-b last:border-b-0 text-start flex items-start gap-3" style={{ minHeight: 56, borderColor: COL.border }}>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2"><span className="mono text-[12px] font-semibold" style={{ color: COL.accent }}>{l.code}</span>{statusChip(l.cls)}</span>
                        <span className="block text-[12.5px] truncate mt-0.5" style={{ color: COL.text }}>{l.description}</span>
                        <span className="block text-[11px] mt-0.5" style={{ color: COL.textMute }}>{L.cBlocked} <span className="mono">{money(l.blockedValue)}</span> · {L.cBoq} <span className="mono">{money(l.values.contract)}</span></span>
                      </span>
                      <ChevronRight size={15} className={`flex-shrink-0 mt-1 ${ar ? 'rotate-180' : ''}`} style={{ color: COL.textMute }} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto scrollbar">
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr className="text-[10.5px] uppercase tracking-wider" style={{ color: COL.textMute, background: COL.surfaceAlt }}>
                        {[[L.cCode], [L.cDesc], [L.cUnit, 0, 1], [L.cBoq, 1], [L.cWir, 1], [L.cBlocked, 1], [L.cStatus], [L.cBlocker, 0, 1], [L.cWirs, 1, 1]].map(([h, num, wide]) => (
                          <th key={h} scope="col" className={`px-2.5 py-1.5 font-semibold leading-tight align-bottom ${num ? 'text-end' : 'text-start'} ${wide ? WIDE : ''}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((l) => (
                        <tr key={l.id} tabIndex={0} onClick={(e) => openLine(l.id, e.currentTarget)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLine(l.id, e.currentTarget); } }}
                          className="border-t cursor-pointer hover:bg-stone-50" style={{ borderColor: COL.border, background: openId === l.id ? COL.accentBg : undefined }}>
                          <td className="px-2.5 py-1.5 mono font-semibold whitespace-nowrap" style={{ color: COL.accent }}>{l.code}</td>
                          <td className="px-2.5 py-1.5 max-w-[150px] xl:max-w-[210px] 2xl:max-w-[340px] truncate" style={{ color: COL.text }} title={l.description}>{l.description}</td>
                          <td className={`px-2.5 py-1.5 mono ${WIDE}`} style={{ color: COL.textDim }}>{l.unit}</td>
                          <td className="px-2.5 py-1.5 mono text-end">{money(l.values.contract)}</td>
                          <td className="px-2.5 py-1.5 mono text-end">{money(l.values.certifiable)}</td>
                          <td className="px-2.5 py-1.5 mono text-end" style={{ color: l.blockedValue > 0.5 ? '#b42318' : COL.textMute }}>{money(l.blockedValue)}</td>
                          <td className="px-2.5 py-1.5">{statusChip(l.cls)}</td>
                          <td className={`px-2.5 py-1.5 whitespace-nowrap ${WIDE}`} style={{ color: COL.textDim }}>{l.blockers[0] ? blockerLabel(l.blockers[0].reason, lang) : L.none}</td>
                          <td className={`px-2.5 py-1.5 mono text-end ${WIDE}`} style={{ color: COL.textDim }}>{l.wirs.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* D. Right-side context — the shared Drawer, read-only. No commercial action lives here. */}
      {!narrow && showData && (
        <aside data-line-inspector-panel aria-label={open ? open.code : L.dBreakdown}
          className="w-[360px] xl:w-[400px] flex-shrink-0 border-s flex flex-col min-h-0"
          style={{ background: COL.surface, borderColor: COL.border }}>
          {open ? (
            <>
              <div className="px-4 py-3 border-b flex-shrink-0 flex items-start justify-between gap-2" style={{ borderColor: COL.border }}>
                <div className="min-w-0">
                  <div className="mono text-[13px] font-semibold" style={{ color: COL.accent }}>{open.code}</div>
                  <div className="text-[12px] mt-0.5 break-words" style={{ color: COL.textDim }}>{open.description}</div>
                </div>
                <button type="button" onClick={clearLine} aria-label={L.close} className="flex-shrink-0 rounded-md px-2 text-[13px] hover:bg-stone-50" style={{ minHeight: 32, color: COL.textDim }}>{L.close}</button>
              </div>
              <div data-line-inspector className="flex-1 overflow-y-auto scrollbar px-4 py-3">{inspectorBody(open)}</div>
              {/* The app floats an assistant button over the bottom-right corner, which is
                  where a right-hand panel's footer sits. Clear it, or the one action this
                  panel offers is unreachable at the widths this workspace is reviewed at. */}
              <div className="px-4 pt-3 border-t flex-shrink-0" style={{ borderColor: COL.border, paddingBottom: 76 }}>
                <Btn variant="primary" onClick={() => { clearLine(); go('certqueue', 'all'); }}>{L.dOpenQueue}</Btn>
              </div>
            </>
          ) : (
            <div data-inspector-empty className="flex-1 flex items-center justify-center px-6 text-center text-[12.5px]" style={{ color: COL.textMute }}>{L.pickLine}</div>
          )}
        </aside>
      )}
      </div>

      {/* Under 1024px: the shared Drawer, untouched, managing its own focus. */}
      {narrow && (
        <Drawer open={!!open} onClose={clearLine} title={open?.code || ''} subtitle={open?.description} width={480}
          footer={open && <Btn variant="primary" onClick={() => { clearLine(); go('certqueue', 'all'); }}>{L.dOpenQueue}</Btn>}>
          {open && <div data-line-inspector>{inspectorBody(open)}</div>}
        </Drawer>
      )}
    </div>
  );
}
