import { useState, useEffect, useMemo, useCallback } from 'react';
import { RotateCcw, Radar, ExternalLink, AlertOctagon, FileCheck2, Users, CalendarClock, ShieldAlert, Camera, FileText, ClipboardList } from 'lucide-react';
import { Btn, PageHeader, KpiCard } from '../../components/primitives.jsx';
import { Drawer } from '../../components/Drawer.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { listBoqItems } from '../../api/boqItems.js';
import { listAllLinks } from '../../api/elementBoqLinks.js';
import { listWirs } from '../../api/wirs.js';
import { listNcrs } from '../../api/ncrs.js';
import { listIpcs } from '../../api/ipcs.js';
import { loadElementStatusMap } from '../../lib/elementStatus.js';
import { buildLinksByBoq } from '../../lib/boqReadiness.js';
import { countAttachmentsByRecord } from '../../lib/attachments.js';
import {
  deriveControlRoom, demoControlRoomInputs, BLOCKER_META, READINESS_META, RECOVERY_META, OWNER_GROUPS,
  blockerLabel, blockerAction, readinessLabel, recoveryLabel, ownerLabel,
  CONTROL_ROOM_BOUNDARY,
} from '../../lib/controlRoom.js';
import { fmtMoney } from '../../lib/format.js';
import { isSupabaseConfigured } from '../../lib/supabase.js';
import { SC } from '../../styles/ledgerTokens.js';

// ============================================================
// CertificationControlRoomView — the central operating room for the commercial
// certification workflow. READ-ONLY: presents inspection-backed signals, what is
// blocked, why, who owns the blocker, and what can be recovered before the next
// IPC. It certifies NOTHING — the visible boundary banner states that real
// enforcement is backend Gate 1 (not yet connected). Owner / next action /
// target IPC are DERIVED suggestions (no data model yet) and are labelled so.
// ============================================================

const TR = {
  en: {
    title: 'Certification Control Room', subtitle: 'Review inspection evidence and commercial blockers. Inspection approval is not commercial eligibility or certification. Signals reflect loaded records only.',
    boundary: CONTROL_ROOM_BOUNDARY,
    demoBanner: 'Synthetic demo data — no project BoQ loaded. All figures below are invented for illustration.',
    derivedNote: 'Owner, next action and target IPC are derived suggestions from the blocker type — no owner field exists in the record yet.',
    refresh: 'Refresh', loadError: "Couldn't load the certification data. Nothing is shown rather than risk wrong figures.", retry: 'Retry',
    kReady: 'Indicative balance after IPCs', kBlocked: 'Blocked value', kMissingWir: 'Missing WIR value',
    kMissingEv: 'Missing evidence value', kNcr: 'NCR hold value', kOverclaim: 'Above-contract claim signal',
    kRecover: 'Recoverable next IPC',
    hReady: 'Inspection-backed total less certified/paid IPC headers; not payment approval.', hBlocked: 'Derived WIR / NCR blocker signals', hMissingEv: 'Within inspection-backed value — evidence gap',
    hOverclaim: 'claims above contract qty', hRecover: 'derived forecast',
    blockedQueue: 'Blocked Value Queue', readinessQueue: 'Commercial Review Signals',
    evidencePanel: 'Evidence Gap Panel', evidenceSub: 'Use inspection evidence for measurement and commercial review.',
    ownerBoard: 'Owner Action Board', recovery: 'Next IPC Recovery Forecast',
    colCode: 'BoQ', colDesc: 'Description', colClaimed: 'Claimed', colCert: 'Inspection-backed value', colBlockedV: 'Blocked', colSignalV: 'Primary signal value',
    colReason: 'Blocker reason', colOwner: 'Owner', colAction: 'Next action', colTarget: 'Target IPC', colStatus: 'Status',
    noBlocked: 'No lines meet this queue’s blocker threshold. Commercial review is still required.',
    noLines: 'No lines in this readiness state.',
    empty: 'No BoQ lines yet. Import a bill of quantities and link work to operate the control room.',
    lines: 'lines', items: 'items', noActions: 'No open actions', demo: 'Demo', derived: 'Derived',
    drawerBoq: 'BoQ line', drawerWirs: 'Linked WIRs', drawerEvidence: 'Evidence pack', drawerNcrs: 'NCR holds',
    drawerWhy: 'Quantity and evidence basis', drawerNext: 'Next action', drawerNote: 'Draft note',
    notePlaceholder: 'Draft a note for this line… (display-only)',
    noteCaption: 'Draft only — notes are not saved; the record has no note field yet.',
    drawerWarn: 'Display-only figures derived in the frontend from WIR / NCR / link records. Nothing on this panel certifies value.',
    drawerWarnDemo: 'Synthetic demo values — this line is not real project data.',
    noWirs: 'No WIRs reach this line.', noNcrs: 'No open NCR on this line.',
    evFiles: 'files', evNone: 'no files attached', close: 'Close',
    contract: 'Contract', unit: 'Unit', qty: 'Qty', rate: 'Rate', certified: 'Inspection-backed value', inspectionQty: 'Inspection-approved qty', claimed: 'Claimed',
    ready: 'No blocker signal', partial: 'Commercial review required',
    measurementAction: 'Re-measure; reconcile inspection-approved vs claimed quantity',
    ofContract: 'of contract', mirDemo: 'MIR approvals — module not live', drawingDemo: 'Drawing linkage — not live',
  },
  ar: {
    title: 'غرفة تحكم الاعتماد', subtitle: 'راجع أدلة الفحص والعوائق التجارية. اعتماد الفحص ليس أهلية تجارية أو اعتماداً للقيمة. تعكس المؤشرات السجلات المحمّلة فقط.',
    boundary: 'غرفة تحكم الاعتماد للعرض والجاهزية فقط إلى أن يُربط تطبيق البوابة الأولى في الخادم.',
    demoBanner: 'بيانات تجريبية اصطناعية — لا يوجد جدول كميات محمّل. جميع الأرقام أدناه للتوضيح فقط.',
    derivedNote: 'المالك والإجراء التالي والمستخلص المستهدف اقتراحات مشتقة من نوع العائق — لا يوجد حقل مالك في السجل بعد.',
    refresh: 'تحديث',
    kReady: 'رصيد استرشادي بعد المستخلصات', kBlocked: 'القيمة الموقوفة', kMissingWir: 'قيمة بدون طلب فحص',
    kMissingEv: 'قيمة بدون أدلة', kNcr: 'قيمة معلّقة بمخالفة', kOverclaim: 'إشارة مطالبة تتجاوز العقد',
    kRecover: 'قابل للاسترداد بالمستخلص القادم',
    hReady: 'إجمالي مستند إلى الفحص ناقص المستخلصات المعتمدة أو المدفوعة؛ ليس اعتماداً للدفع.', hBlocked: 'إشارات عوائق مشتقة من الفحص والمخالفات', hMissingEv: 'ضمن القيمة المستندة إلى الفحص — فجوة أدلة',
    hOverclaim: 'مطالبات فوق كمية العقد', hRecover: 'توقع مشتق',
    blockedQueue: 'قائمة القيمة الموقوفة', readinessQueue: 'مؤشرات المراجعة التجارية',
    evidencePanel: 'لوحة فجوات الأدلة', evidenceSub: 'استخدم أدلة الفحص للقياس والمراجعة التجارية.',
    ownerBoard: 'لوحة إجراءات الملّاك', recovery: 'توقع الاسترداد للمستخلص القادم',
    colCode: 'البند', colDesc: 'الوصف', colClaimed: 'المُطالب به', colCert: 'القيمة المستندة إلى الفحص', colBlockedV: 'موقوف', colSignalV: 'قيمة الإشارة الرئيسية',
    colReason: 'سبب الإيقاف', colOwner: 'المالك', colAction: 'الإجراء التالي', colTarget: 'المستخلص المستهدف', colStatus: 'الحالة',
    noBlocked: 'لا توجد بنود تبلغ حد العوائق في هذه القائمة. تظل المراجعة التجارية مطلوبة.',
    noLines: 'لا بنود في حالة الجاهزية هذه.',
    empty: 'لا توجد بنود كميات بعد. استورد جدول الكميات واربط الأعمال لتشغيل غرفة التحكم.',
    lines: 'بنود', items: 'عناصر', noActions: 'لا إجراءات مفتوحة', demo: 'تجريبي', derived: 'مشتق',
    drawerBoq: 'بند الكميات', drawerWirs: 'طلبات الفحص المرتبطة', drawerEvidence: 'حزمة الأدلة', drawerNcrs: 'المخالفات المعلّقة',
    drawerWhy: 'أساس الكمية والأدلة', drawerNext: 'الإجراء التالي', drawerNote: 'مسودة ملاحظة',
    notePlaceholder: 'اكتب مسودة ملاحظة لهذا البند… (عرض فقط)',
    noteCaption: 'مسودة فقط — الملاحظات لا تُحفظ؛ لا يوجد حقل ملاحظات في السجل بعد.',
    drawerWarn: 'أرقام للعرض فقط مشتقة في الواجهة من سجلات الفحص والمخالفات والروابط. لا شيء في هذه اللوحة يعتمد قيمة.',
    drawerWarnDemo: 'قيم تجريبية اصطناعية — هذا البند ليس بيانات مشروع حقيقية.',
    noWirs: 'لا تصل طلبات فحص إلى هذا البند.', noNcrs: 'لا مخالفة مفتوحة على هذا البند.',
    evFiles: 'ملفات', evNone: 'لا ملفات مرفقة', close: 'إغلاق',
    contract: 'العقد', unit: 'الوحدة', qty: 'الكمية', rate: 'السعر', certified: 'القيمة المستندة إلى الفحص', inspectionQty: 'الكمية المعتمدة بالفحص', claimed: 'المُطالب به',
    ready: 'لا إشارة عائق', partial: 'يتطلب مراجعة تجارية',
    measurementAction: 'أعد القياس وطابق الكمية المعتمدة بالفحص مع الكمية المطالب بها',
    ofContract: 'من العقد', mirDemo: 'اعتمادات المواد — الوحدة غير مفعّلة', drawingDemo: 'ربط المخططات — غير مفعّل',
  },
};

// Presentation adapters only: retain shared classes, colors, values and actions.
// "ready" can include unknown evidence; "partial" can include full approval.
const displayReadiness = (key, lang) => ['ready', 'partial'].includes(key)
  ? (TR[lang] || TR.en)[key] : readinessLabel(key, lang);
const displayBlockerAction = (key, lang) => key === 'REVIEW_ANOMALY'
  ? (TR[lang] || TR.en).measurementAction : blockerAction(key, lang);

const NCR_CLOSED = ['closed', 'cleared', 'resolved', 'void', 'cancelled', 'verified'];

// Arabic labels for the evidence-gap panel rows (keyed by the derived key).
const EV_LABEL_AR = {
  missing_wir: 'بدون طلب فحص', missing_photo: 'أدلة مصورة ناقصة',
  missing_mir: 'بدون اعتماد مواد', missing_drawing: 'بدون مخطط', ncr_clearance: 'بدون إغلاق مخالفة',
};

function Chip({ children, color, soft }) {
  return (
    <span className="sc-mono text-[10px] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1.5 whitespace-nowrap" style={{ background: soft, color }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color, opacity: 0.85 }} />
      {children}
    </span>
  );
}

function TagChip({ children, tone = 'amber' }) {
  const c = tone === 'amber' ? { bg: SC.warningBg, fg: SC.warning } : { bg: SC.actionBg, fg: SC.action };
  return <span className="sc-mono text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide" style={{ background: c.bg, color: c.fg }}>{children}</span>;
}

function SectionCard({ icon: Icon, title, subtitle, aside, children }) {
  return (
    <div className="rounded-lg border overflow-hidden" style={{ background: SC.surface, borderColor: SC.line }}>
      <div className="px-5 py-3 border-b flex items-center gap-2 flex-wrap" style={{ borderColor: SC.line }}>
        {Icon && <Icon size={15} style={{ color: SC.ink2 }} />}
        <span className="sc-display text-sm font-bold" style={{ color: SC.ink }}>{title}</span>
        {subtitle && <span className="text-[11px]" style={{ color: SC.faint }}>· {subtitle}</span>}
        {aside && <span className="ms-auto">{aside}</span>}
      </div>
      {children}
    </div>
  );
}

export function CertificationControlRoomView({ lang = 'en', onNavigate }) {
  const ar = lang === 'ar';
  const L = TR[lang] || TR.en;
  const [raw, setRaw] = useState(null);        // { boqItems, allLinks, statusMap, wirs, ncrs, ipcs, wirAttachCounts }
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [loadError, setLoadError] = useState(false); // a critical fetch failed
  const [openLine, setOpenLine] = useState(null); // detail drawer
  const [note, setNote] = useState('');        // draft-note placeholder (display-only, never saved)

  const load = useCallback(async () => {
    setLoading(true); setLoadError(false);
    try {
      if (!isSupabaseConfigured) { setRaw(null); setDemoMode(true); return; }
      // allSettled, not per-fetch swallow: a failed critical fetch must surface
      // an error (never fabricate demo money or render confidently-wrong totals).
      const [boq, links, sm, w, n, ipc, att] = await Promise.allSettled([
        listBoqItems(), listAllLinks(), loadElementStatusMap(),
        listWirs(), listNcrs(), listIpcs(), countAttachmentsByRecord('wir'),
      ]);
      // Critical = the inputs the money math depends on. If any failed, stop.
      if ([boq, w, sm].some((r) => r.status === 'rejected')) { setRaw(null); setLoadError(true); return; }
      setRaw({
        boqItems: boq.value || [],
        allLinks: links.status === 'fulfilled' ? (links.value || []) : [],
        statusMap: sm.value || {},
        wirs: w.value || [],
        ncrs: n.status === 'fulfilled' ? (n.value || []) : [],
        ipcs: ipc.status === 'fulfilled' ? (ipc.value || []) : [],
        // null = UNKNOWN evidence index (fetch failed) → derive no gaps, never {}
        wirAttachCounts: att.status === 'fulfilled' ? att.value : null,
        boqOk: true,
      });
      setDemoMode(false);
    } catch { setRaw(null); setLoadError(true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Real inputs only when the BoQ fetch genuinely SUCCEEDED with rows; synthetic
  // demo (clearly-bannered) only for a real empty project — never on a fetch error.
  const inputs = useMemo(() => {
    if (raw && raw.boqOk && raw.boqItems.length > 0) {
      return {
        boqItems: raw.boqItems,
        linksByBoq: buildLinksByBoq(raw.allLinks, raw.boqItems),
        statusMap: raw.statusMap, wirs: raw.wirs, ncrs: raw.ncrs, ipcs: raw.ipcs,
        wirAttachCounts: raw.wirAttachCounts, demo: false,
      };
    }
    return { ...demoControlRoomInputs(), demo: true };
  }, [raw]);
  const isDemo = demoMode || inputs.demo;

  const room = useMemo(() => deriveControlRoom(inputs), [inputs]);
  const { lines, kpis, recovery, board, evidencePanel, counts, nextIpc } = room;

  const blockedLines = useMemo(() => lines.filter((l) => l.blockedValue > 0.5 || l.values.overclaim > 0.5), [lines]);

  const openDrawer = (l) => { setOpenLine(l); setNote(''); };
  const lineNcrs = (l) => {
    const guids = inputs.linksByBoq[l.id];
    if (!guids) return [];
    return (inputs.ncrs || []).filter((n) => n.element_guid && guids.has(n.element_guid) && !NCR_CLOSED.includes(String(n.status || '').toLowerCase()));
  };

  const hasData = loading || lines.length > 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden" dir={ar ? 'rtl' : 'ltr'}>
      <PageHeader title={L.title} subtitle={L.subtitle}
        actions={<Btn icon={RotateCcw} onClick={load}>{L.refresh}</Btn>} />

      <div className="flex-1 overflow-y-auto scrollbar p-4 sm:p-6 space-y-5" style={{ background: SC.bg }}>
        {/* Visible trust boundary — this room displays readiness; it never certifies. */}
        <div className="flex items-start gap-2.5 text-[12.5px] px-4 py-2.5 rounded-lg border" style={{ background: SC.actionBg, borderColor: SC.actionBd, color: SC.action }}>
          <ShieldAlert size={15} className="flex-shrink-0 mt-0.5" />
          <span className="font-medium">{L.boundary}</span>
        </div>
        {isDemo && !loadError && !loading && (
          <div className="flex items-start gap-2.5 text-[12.5px] px-4 py-2.5 rounded-lg border" style={{ background: SC.warningBg, borderColor: '#fde68a', color: SC.warning }}>
            <AlertOctagon size={15} className="flex-shrink-0 mt-0.5" />
            <span className="font-medium">{L.demoBanner}</span>
          </div>
        )}

        {loading ? (
          <div className="text-center text-xs py-16" style={{ color: SC.faint }}>Loading…</div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <AlertOctagon size={22} style={{ color: SC.danger }} />
            <div className="text-[13px]" style={{ color: SC.ink }}>{L.loadError}</div>
            <Btn icon={RotateCcw} variant="primary" onClick={load}>{L.retry}</Btn>
          </div>
        ) : !hasData ? (
          <EmptyState icon={Radar} title={L.title} description={L.empty} />
        ) : (
          <>
            {/* 1 · KPI strip. Every figure that represents a set of lines is a
                   BUTTON that opens the Certification Queue already filtered to
                   those lines — an overview whose numbers lead somewhere, per
                   docs/ux/UI-UX-OVERHAUL.md. "Recoverable next IPC" is a
                   forecast across buckets, so it stays non-navigating. */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-3">
              {[
                { label: L.kReady, value: kpis.readyToCertify, accent: '#15803d', hint: L.hReady, icon: FileCheck2, filter: 'ready' },
                { label: L.kBlocked, value: kpis.blockedValue, accent: kpis.blockedValue > 0 ? SC.danger : undefined, hint: L.hBlocked, filter: 'blocked' },
                { label: L.kMissingWir, value: kpis.missingWir, accent: SC.warning, filter: 'missing_wir' },
                { label: L.kMissingEv, value: kpis.missingEvidence, accent: '#7c3aed', hint: L.hMissingEv, filter: 'evidence' },
                { label: L.kNcr, value: kpis.ncrHold, accent: SC.danger, filter: 'ncr' },
                { label: L.kOverclaim, value: kpis.overclaim, accent: SC.ink2, hint: L.hOverclaim, filter: 'cap' },
                { label: L.kRecover, value: kpis.recoverableNextIpc, accent: '#0d9488', hint: `${L.hRecover} · ${nextIpc}`, filter: null },
              ].map((k) => {
                const card = <KpiCard label={k.label} value={fmtMoney(k.value)} accent={k.accent} hint={k.hint} icon={k.icon} />;
                if (!k.filter || !onNavigate) return <div key={k.label}>{card}</div>;
                return (
                  <button key={k.label} type="button" onClick={() => onNavigate('certqueue', k.filter)}
                    title={ar ? 'افتح قائمة الاعتماد بمرشح هذه الإشارة' : 'Open the Certification Queue with this signal filter'}
                    className="text-start rounded-lg transition hover:-translate-y-px focus:outline-none focus-visible:ring-2"
                    style={{ outlineColor: SC.action }}>
                    {card}
                  </button>
                );
              })}
            </div>

            {/* 2 · Blocked Value Queue */}
            <SectionCard icon={AlertOctagon} title={L.blockedQueue}
              aside={
                <span className="flex items-center gap-3">
                  <span className="sc-mono text-[10px]" style={{ color: SC.faint }}>{blockedLines.length} {L.lines}</span>
                  {onNavigate && (
                    <button onClick={() => onNavigate('recovery-queue')}
                      title={ar ? 'قائمة الاسترداد عرض توضيحي ببيانات تجريبية' : 'The Recovery Queue is an illustrative workflow on demo data'}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-full border transition hover:-translate-y-px inline-flex items-center gap-1.5"
                      style={{ background: SC.surface, borderColor: SC.lineStrong, color: SC.action }}>
                      <ExternalLink size={11} />{ar ? 'افتح قائمة الاسترداد' : 'Open Recovery Queue'}
                    </button>
                  )}
                </span>
              }>
              <div className="px-5 pt-2 text-[11px]" style={{ color: SC.faint }}>{L.derivedNote}</div>
              {blockedLines.length === 0 ? (
                <div className="px-5 py-6 text-[13px]" style={{ color: SC.faint }}>{L.noBlocked}</div>
              ) : (
                <div className="overflow-x-auto mt-1">
                  <table className="w-full text-xs">
                    <thead className="sc-mono" style={{ color: SC.ink2 }}>
                      <tr style={{ borderBottom: `1px solid ${SC.line}` }}>
                        <th className="px-4 py-2 text-start">{L.colCode}</th>
                        <th className="px-4 py-2 text-start">{L.colDesc}</th>
                        <th className="px-4 py-2 text-end">{L.colClaimed}</th>
                        <th className="px-4 py-2 text-end">{L.colCert}</th>
                        <th className="px-4 py-2 text-end">{L.colSignalV}</th>
                        <th className="px-4 py-2 text-start">{L.colReason}</th>
                        <th className="px-4 py-2 text-start">{L.colOwner}</th>
                        <th className="px-4 py-2 text-start">{L.colAction}</th>
                        <th className="px-4 py-2 text-start">{L.colTarget}</th>
                        <th className="px-4 py-2 text-start">{L.colStatus}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blockedLines.map((l) => {
                        const bm = l.blockers[0] ? BLOCKER_META[l.blockers[0].reason] : null;
                        const rm = READINESS_META[l.cls];
                        return (
                          <tr key={l.id} aria-selected={openLine?.id === l.id}
                            className={`border-t cursor-pointer ${openLine?.id === l.id ? 'bg-sc-surface-3' : 'hover:bg-sc-surface-3'}`}
                            style={{ borderColor: SC.line, boxShadow: openLine?.id === l.id ? `inset 3px 0 0 ${SC.action}` : undefined }}
                            onClick={() => openDrawer(l)}>
                            <td className="px-4 py-2.5 sc-mono font-semibold" style={{ color: SC.action }}>{l.code}</td>
                            <td className="px-4 py-2.5 max-w-[220px] truncate" title={l.description} style={{ color: SC.ink }}>{l.description}</td>
                            <td className="px-4 py-2.5 sc-mono text-end" style={{ color: SC.ink2 }}>{fmtMoney(l.values.claimed)}</td>
                            <td className="px-4 py-2.5 sc-mono text-end" style={{ color: l.values.certifiable > 0 ? '#15803d' : SC.faint }}>{fmtMoney(l.values.certifiable)}</td>
                            <td className="px-4 py-2.5 sc-mono text-end font-semibold" style={{ color: SC.danger }}>{fmtMoney(l.blockers[0]?.value ?? l.blockedValue)}</td>
                            <td className="px-4 py-2.5">{bm && <Chip color={bm.color} soft={bm.soft}>{blockerLabel(l.blockers[0].reason, lang)}</Chip>}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: SC.ink }}>{l.owner ? ownerLabel(l.owner, lang) : '—'} <TagChip>{L.derived}</TagChip></td>
                            <td className="px-4 py-2.5 max-w-[200px] truncate" title={l.blockers[0] ? displayBlockerAction(l.blockers[0].reason, lang) : ''} style={{ color: SC.ink2 }}>{l.blockers[0] ? displayBlockerAction(l.blockers[0].reason, lang) : '—'}</td>
                            <td className="px-4 py-2.5 sc-mono whitespace-nowrap" style={{ color: SC.ink2 }}>{l.targetIpc || '—'}</td>
                            <td className="px-4 py-2.5">{rm && <Chip color={rm.color} soft={rm.soft}>{displayReadiness(l.cls, lang)}</Chip>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            {/* 3 · Certification readiness — SUMMARY ONLY.
                   The line-by-line readiness table used to live here, which made
                   the Control Room a second copy of the Certification Queue.
                   Per docs/ux/UI-UX-OVERHAUL.md the overview now states the
                   position and hands off: each tile opens the queue already
                   filtered to those lines, where the full table and the review
                   drawer live. */}
            <SectionCard icon={ClipboardList} title={L.readinessQueue}
              aside={onNavigate && (
                <button onClick={() => onNavigate('certqueue', 'all')}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full border transition hover:-translate-y-px inline-flex items-center gap-1.5"
                  style={{ background: SC.surface, borderColor: SC.lineStrong, color: SC.action }}>
                  <ExternalLink size={11} />{ar ? 'افتح قائمة الاعتماد' : 'Open Certification Queue'}
                </button>
              )}>
              <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
                {['ready', 'partial', 'blocked', 'review'].map((k) => {
                  const m = READINESS_META[k];
                  const value = lines.filter((l) => l.cls === k)
                    .reduce((sum, l) => sum + (k === 'blocked' ? l.blockedValue : l.values.certifiable), 0);
                  const filterFor = { ready: 'ready', partial: 'partial', blocked: 'blocked', review: 'cap' }[k];
                  const body = (
                    <div className="rounded-lg border p-3 h-full" style={{ borderColor: SC.line, background: SC.surface }}>
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />
                        <span className="text-[12px] font-semibold" style={{ color: SC.ink }}>{displayReadiness(k, lang)}</span>
                        <span className="sc-mono text-[11px] ms-auto" style={{ color: SC.faint }}>{counts[k]} {L.lines}</span>
                      </div>
                      <div className="sc-mono text-[15px] font-bold mt-1.5" style={{ color: k === 'blocked' ? SC.danger : k === 'ready' ? '#15803d' : SC.ink }}>
                        {fmtMoney(value)}
                      </div>
                    </div>
                  );
                  if (!onNavigate) return <div key={k}>{body}</div>;
                  return (
                    <button key={k} type="button" onClick={() => onNavigate('certqueue', filterFor)}
                      title={ar ? 'افتح قائمة الاعتماد بمرشح هذه الإشارة' : 'Open the Certification Queue with this signal filter'}
                      className="text-start transition hover:-translate-y-px focus:outline-none focus-visible:ring-2" style={{ outlineColor: SC.action }}>
                      {body}
                    </button>
                  );
                })}
              </div>
            </SectionCard>

            <div className="grid lg:grid-cols-2 gap-5">
              {/* 4 · Evidence Gap Panel */}
              <SectionCard icon={Camera} title={L.evidencePanel} subtitle={L.evidenceSub}>
                <div className="p-4 space-y-2">
                  {evidencePanel.map((g) => (
                    <div key={g.key} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2" style={{ borderColor: SC.line, background: g.demo ? SC.surface2 : SC.bg }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[13px] font-medium" style={{ color: g.demo ? SC.faint : SC.ink }}>{ar ? EV_LABEL_AR[g.key] || g.label : g.label}</span>
                        {g.demo && <TagChip>{L.demo}</TagChip>}
                        {g.hint && <span className="text-[10.5px] truncate" style={{ color: SC.faint }}>· {g.hint}</span>}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="sc-mono text-[10px]" style={{ color: SC.faint }}>{g.count} {L.lines}</span>
                        <span className="sc-mono text-[12px] font-bold" style={{ color: g.demo ? SC.faint : g.value > 0 ? SC.warning : SC.faint }}>{g.demo ? '—' : fmtMoney(g.value)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>

              {/* 6 · Next IPC Recovery Forecast */}
              <SectionCard icon={CalendarClock} title={L.recovery} subtitle={nextIpc} aside={<TagChip>{L.derived}</TagChip>}>
                <div className="p-4 grid grid-cols-2 gap-3">
                  {Object.entries(RECOVERY_META).map(([k, m]) => (
                    <div key={k} className="rounded-xl border p-3" style={{ borderColor: SC.line, background: SC.bg }}>
                      <div className="text-[11px] font-medium" style={{ color: SC.ink2 }}>{recoveryLabel(k, lang)}</div>
                      <div className="sc-display text-lg font-bold mt-1" style={{ color: recovery[k] > 0 ? m.color : SC.faint }}>{fmtMoney(recovery[k])}</div>
                    </div>
                  ))}
                </div>
                <div className="px-4 pb-3 text-[11px]" style={{ color: SC.faint }}>{L.derivedNote}</div>
              </SectionCard>
            </div>

            {/* 5 · Owner Action Board */}
            <SectionCard icon={Users} title={L.ownerBoard} aside={<TagChip>{L.derived}</TagChip>}>
              <div className="p-4 grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                {OWNER_GROUPS.map((g) => {
                  const lane = board[g];
                  const demoLane = g === 'Procurement';
                  return (
                    <div key={g} className="rounded-xl border flex flex-col" style={{ borderColor: SC.line, background: SC.bg }}>
                      <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: SC.line }}>
                        <span className="text-[12px] font-bold" style={{ color: SC.ink }}>{ownerLabel(g, lang)}</span>
                        <span className="sc-mono text-[10px] font-bold" style={{ color: lane.value > 0 ? SC.warning : SC.faint }}>{lane.value > 0 ? fmtMoney(lane.value) : '—'}</span>
                      </div>
                      <div className="p-2 space-y-1.5 flex-1">
                        {lane.items.length === 0 && !demoLane && (
                          <div className="text-[11px] px-1 py-2" style={{ color: SC.faint }}>{L.noActions}</div>
                        )}
                        {demoLane && lane.items.length === 0 && (
                          <div className="text-[11px] px-1 py-2 flex items-center gap-1.5 flex-wrap" style={{ color: SC.faint }}>{L.mirDemo} <TagChip>{L.demo}</TagChip></div>
                        )}
                        {lane.items.slice(0, 4).map((it, i) => {
                          // A line-backed item opens its drawer; the Client "IPC" row
                          // is a descriptive status with no line → render it inert (no
                          // no-op button that implies a payment action).
                          const actionText = it.reason ? displayBlockerAction(it.reason, lang) : (ar ? (it.actionAr || it.action) : it.action);
                          const clickable = !!it.lineId;
                          const Inner = (
                            <>
                              <div className="flex items-center justify-between gap-2">
                                <span className="sc-mono text-[10px] font-semibold" style={{ color: SC.action }}>{it.code}</span>
                                <span className="sc-mono text-[10px] font-bold" style={{ color: SC.warning }}>{fmtMoney(it.value)}</span>
                              </div>
                              <div className="text-[10.5px] mt-0.5 truncate" title={actionText} style={{ color: SC.ink2 }}>{actionText}</div>
                            </>
                          );
                          return clickable ? (
                            <button key={i} onClick={() => { const l = lines.find((x) => x.id === it.lineId); if (l) openDrawer(l); }}
                              className="w-full text-start rounded-lg border px-2 py-1.5 hover:shadow-sm transition" style={{ borderColor: SC.line, background: SC.surface }}>{Inner}</button>
                          ) : (
                            <div key={i} className="w-full rounded-lg border px-2 py-1.5" style={{ borderColor: SC.line, background: SC.surface }}>{Inner}</div>
                          );
                        })}
                        {lane.items.length > 4 && <div className="sc-mono text-[10px] px-1" style={{ color: SC.faint }}>+{lane.items.length - 4} {L.items}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          </>
        )}
      </div>

      {/* 7 · Detail drawer — read-only line dossier */}
      {openLine && (() => {
        const l = openLine;
        const bm = l.blockers[0] ? BLOCKER_META[l.blockers[0].reason] : null;
        const rm = READINESS_META[l.cls];
        const nl = lineNcrs(l);
        const pct = l.values.contract > 0 ? Math.round((l.values.certifiable / l.values.contract) * 100) : 0;
        return (
          <Drawer
            open
            onClose={() => setOpenLine(null)}
            title={l.code}
            subtitle={l.description || L.drawerBoq}
            width={520}
          >
            <div dir={ar ? 'rtl' : 'ltr'}>
              <div className="mb-4 flex items-center gap-2 flex-wrap">
                <Chip color={rm.color} soft={rm.soft}>{displayReadiness(l.cls, lang)}</Chip>
                {bm && <Chip color={bm.color} soft={bm.soft}>{blockerLabel(l.blockers[0].reason, lang)}</Chip>}
              </div>

              <div className="space-y-5">
                {/* Clear warning — demo/derived values */}
                <div className="text-[11.5px] px-3 py-2 rounded-lg border" style={{ background: SC.warningBg, borderColor: '#fde68a', color: SC.warning }}>
                  {isDemo ? L.drawerWarnDemo : L.drawerWarn}
                </div>

                {/* BoQ info */}
                <div>
                  <div className="sc-mono text-[10px] tracking-widest mb-1.5" style={{ color: SC.faint }}>{L.drawerBoq.toUpperCase()}</div>
                  <div className="grid grid-cols-3 gap-2">
                    {[[L.contract, fmtMoney(l.values.contract), SC.ink], [L.certified, fmtMoney(l.values.certifiable), '#15803d'], [L.colBlockedV, fmtMoney(l.blockedValue), l.blockedValue > 0 ? SC.danger : SC.faint]].map(([lab, val, c]) => (
                      <div key={lab} className="rounded-lg border p-2.5" style={{ borderColor: SC.line, background: SC.surface }}>
                        <div className="sc-mono text-[9px] tracking-widest" style={{ color: SC.faint }}>{String(lab).toUpperCase()}</div>
                        <div className="sc-mono text-[13px] font-bold mt-1" style={{ color: c }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  <div className="sc-mono text-[10.5px] mt-2 flex flex-wrap gap-x-4 gap-y-1" style={{ color: SC.ink2 }}>
                    <span>{L.qty}: {l.contractQty} {l.unit}</span>
                    <span>{L.inspectionQty}: {l.approvedQty} {l.unit} ({pct}%)</span>
                    <span>{L.claimed}: {fmtMoney(l.values.claimed)}</span>
                  </div>
                </div>

                {/* Certifiability explanation */}
                <div>
                  <div className="sc-mono text-[10px] tracking-widest mb-1.5" style={{ color: SC.faint }}>{L.drawerWhy.toUpperCase()}</div>
                  <div className="text-[12.5px] px-3 py-2.5 rounded-lg leading-relaxed" style={{ background: SC.actionBg, color: SC.ink }}>
                    {l.linkedCount === 0 && l.wirs.length === 0
                      ? (ar ? 'اربط العمل وأدلة فحصه للمراجعة؛ الربط لا يعتمد قيمة.' : 'Link the work and its inspection evidence for review; linking does not certify value.')
                      : (ar
                        ? `الكمية المخزنة المعتمدة بالفحص: ${l.approvedQty} من ${l.contractQty} ${l.unit}، بسقف العقد. يظل القياس والمراجعة التجارية خطوتين منفصلتين.`
                        : `Stored inspection-approved quantity: ${l.approvedQty} of ${l.contractQty} ${l.unit}, capped at contract. Measurement and commercial review remain separate.`)}
                    {l.blockers.length > 0 && (
                      <span> {ar ? 'العوائق:' : 'Held back by:'} {l.blockers.map((b) => `${blockerLabel(b.reason, lang)} (${fmtMoney(b.value)})`).join(' · ')}.</span>
                    )}
                  </div>
                </div>

                {/* Linked WIRs + evidence pack */}
                <div>
                  <div className="sc-mono text-[10px] tracking-widest mb-1.5" style={{ color: SC.faint }}>{L.drawerWirs.toUpperCase()} ({l.wirs.length})</div>
                  {l.wirs.length === 0 ? <div className="text-[12px]" style={{ color: SC.faint }}>{L.noWirs}</div> : (
                    <div className="rounded-lg border divide-y overflow-hidden" style={{ borderColor: SC.line, background: SC.surface }}>
                      {l.wirs.map((w) => {
                        const attKnown = inputs.wirAttachCounts != null; // null = evidence index unavailable
                        const files = attKnown ? (inputs.wirAttachCounts[w.id] || 0) : 0;
                        const approved = /approv/i.test(String(w.result || ''));
                        return (
                          <div key={w.id} className="flex items-center gap-2.5 px-3 py-2">
                            <span className="sc-mono text-[11px] font-semibold flex-shrink-0" style={{ color: SC.action }}>{w.wir_number || w.id}</span>
                            <span className="sc-mono text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: approved ? '#dcfce7' : SC.warningBg, color: approved ? '#15803d' : SC.warning }}>{w.result || 'Pending'}</span>
                            <span className="sc-mono text-[10.5px] flex-1 text-end" style={{ color: SC.ink2 }}>{(() => { const q = Number(w.approved_qty ?? w.scope_qty); return isNaN(q) ? '—' : `${q} ${l.unit}`; })()}</span>
                            <span className="sc-mono text-[10px] flex-shrink-0 inline-flex items-center gap-1" style={{ color: !attKnown ? SC.faint : files > 0 ? SC.ink2 : SC.warning }}>
                              <FileText size={11} /> {!attKnown ? '—' : files > 0 ? `${files} ${L.evFiles}` : L.evNone}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* NCR holds */}
                <div>
                  <div className="sc-mono text-[10px] tracking-widest mb-1.5" style={{ color: SC.faint }}>{L.drawerNcrs.toUpperCase()} ({nl.length})</div>
                  {nl.length === 0 ? <div className="text-[12px]" style={{ color: SC.faint }}>{L.noNcrs}</div> : (
                    <div className="rounded-lg border divide-y overflow-hidden" style={{ borderColor: SC.dangerBd, background: SC.dangerBg }}>
                      {nl.map((n) => (
                        <div key={n.id} className="flex items-center gap-2.5 px-3 py-2">
                          <AlertOctagon size={13} style={{ color: SC.danger }} className="flex-shrink-0" />
                          <span className="sc-mono text-[11px] font-semibold flex-shrink-0" style={{ color: SC.danger }}>{n.ncr_number || n.id}</span>
                          <span className="text-[11.5px] truncate flex-1" style={{ color: SC.ink }}>{n.title || n.description || ''}</span>
                          <span className="sc-mono text-[10px] flex-shrink-0" style={{ color: SC.danger }}>{n.status || 'open'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Next action (derived) */}
                <div>
                  <div className="sc-mono text-[10px] tracking-widest mb-1.5 flex items-center gap-2" style={{ color: SC.faint }}>{L.drawerNext.toUpperCase()} <TagChip>{L.derived}</TagChip></div>
                  <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: SC.line, background: SC.surface }}>
                    {l.nextAction ? (
                      <>
                        <div className="text-[12.5px] font-medium" style={{ color: SC.ink }}>{l.blockers[0] ? displayBlockerAction(l.blockers[0].reason, lang) : l.nextAction}</div>
                        <div className="sc-mono text-[10.5px] mt-1" style={{ color: SC.faint }}>{L.colOwner}: {l.owner ? ownerLabel(l.owner, lang) : '—'} · {L.colTarget}: {l.targetIpc}</div>
                      </>
                    ) : <div className="text-[12px]" style={{ color: SC.faint }}>{L.noActions}</div>}
                  </div>
                </div>

                {/* Draft note placeholder — display-only, never saved */}
                <div>
                  <div className="sc-mono text-[10px] tracking-widest mb-1.5" style={{ color: SC.faint }}>{L.drawerNote.toUpperCase()}</div>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={L.notePlaceholder}
                    className="w-full px-3 py-2 text-[12.5px] rounded-lg border outline-none resize-none"
                    style={{ background: SC.surface, borderColor: SC.lineStrong, color: SC.ink }} />
                  <div className="text-[10.5px] mt-1" style={{ color: SC.faint }}>{L.noteCaption}</div>
                </div>
              </div>
            </div>
          </Drawer>
        );
      })()}
    </div>
  );
}
