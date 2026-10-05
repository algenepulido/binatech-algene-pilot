// ============================================================
// CertificationQueueView — THE line-level commercial certification workspace.
//
// ARCHITECTURE NOTE (docs/ux/UI-UX-OVERHAUL.md, "certification architecture")
// This file previously held a demo-data screen that was never routed. It has
// been rebuilt on the SAME real-data derivation the Control Room uses
// (`deriveControlRoom` via `useCommercialData`), so the two screens can never
// disagree about the legacy inspection-backed figures. Division of labour:
//   * Certification Queue (here) — the line-level working surface: every BoQ
//     line, its inspection-backed position, what is blocked and why.
//   * Control Room — executive overview + exception navigation INTO this queue.
//
// WHAT THIS SCREEN DELIBERATELY DOES NOT SHOW
// The brief asks for Previously Certified / Current Period / Cumulative per
// line. The database has no line-level certification ledger: `ipcs` is a
// header-only table (gross_amount, retention, vat, net_payable) and there is no
// `ipc_lines`, no certification history and no variations table. Those columns
// therefore cannot be computed from real records, and inventing them would be
// fabricating commercial figures. They are absent here and recorded as backend
// debt. The certified position IS shown at PROJECT level, where it is real:
// summed from certified/paid IPC headers, and labelled as such.
//
// CERTIFIES NOTHING. Same trust boundary as the Control Room: real enforcement
// is backend Gate 1, which is not connected.
// ============================================================
import { useMemo, useState } from 'react';
import { RotateCcw, ShieldAlert, AlertOctagon, FileText, Search, X } from 'lucide-react';
import { PageHeader, Btn } from '../../components/primitives.jsx';
import { Drawer } from '../../components/Drawer.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { useCommercialData } from '../../lib/useCommercialData.js';
import {
  BLOCKER_META, READINESS_META, blockerLabel, blockerAction, readinessLabel, ownerLabel,
  CONTROL_ROOM_BOUNDARY,
} from '../../lib/controlRoom.js';
import { fmtQty, fmtAmount, fmtRate } from '../../lib/format.js';
import { SC } from '../../styles/ledgerTokens.js';

const TR = {
  en: {
    title: 'Certification Queue',
    subtitle: 'Review inspection-approved quantities, indicative values and blockers for each BoQ line.',
    basisNote: 'Inspection-approved quantity × rate is indicative only — not commercial acceptance, certification or approval for payment. Blocker signals are limited to loaded records.',
    refresh: 'Refresh',
    demoBanner: 'Synthetic demo data — no project BoQ loaded. Every figure below is invented for illustration.',
    loadError: "Couldn't load the certification data. Nothing is shown rather than risk wrong figures.",
    empty: 'No BoQ lines yet. Import a bill of quantities and link work for commercial review.',
    search: 'Search code or description…',
    noMatch: 'No lines match this filter.',
    ledgerNote: 'Per-line previous / current-period / cumulative certification is not shown because the database holds no line-level certification ledger (IPCs are header-only). The certified position below is the project-level figure from certified and paid IPC headers.',
    // columns
    cCode: 'BoQ', cDesc: 'Description', cUnit: 'Unit',
    cContractQty: 'Contract qty', cRate: 'Rate', cContractValue: 'Contract value',
    cEligibleQty: 'Inspection-approved qty', cEligibleValue: 'Inspection-backed value',
    cNotEligible: 'Awaiting inspection approval', cWirs: 'WIRs', cStatus: 'Review status', cBlocked: 'Blocked value', cReason: 'Blocker',
    // totals
    totalsAll: 'All lines', totalsFiltered: 'Filtered lines only',
    tContract: 'Contract value', tEligible: 'Inspection-backed value', tBlocked: 'Blocked value', tLines: 'lines',
    ready: 'No blocker signal', partial: 'Commercial review required', lowValue: 'Inspection-backed value < SAR 0.50',
    measurementAction: 'Re-measure; reconcile inspection-approved vs claimed quantity',
    projectCertified: 'Certified to date (project)', projectCertifiedHint: 'from certified + paid IPC headers',
    // drawer
    dSummary: 'Summary', dContract: 'Contract position', dProgress: 'Progress', dCertification: 'Certification',
    dSupport: 'Support', dExceptions: 'Exceptions', dAction: 'Action',
    dRate: 'Rate', dUnit: 'Unit', dContractQty: 'Contract qty', dContractValue: 'Contract value',
    dAdjusted: 'Approved adjustments', dAdjustedNone: 'No variation/adjustment records exist — the contract quantity is the cap.',
    dEligibleQty: 'Inspection-approved qty', dEligibleValue: 'Inspection-backed value',
    dNotEligible: 'Awaiting inspection approval', dMapped: 'Mapped to model',
    dPrev: 'Previously certified', dCurrent: 'Current period', dCumulative: 'Cumulative certified',
    dLedgerGap: 'Not available per line — no line-level certification ledger exists in the database.',
    dNoWirs: 'No WIR is attributed to this line in the loaded records.',
    dNoBlockers: 'No blocker signal in the loaded records — not an all-clear.',
    dOwner: 'Suggested owner', dNext: 'Suggested next action', dDerived: 'DERIVED',
    dActionNote: 'Direct certification is disabled — it requires backend Gate 1 enforcement and an authorized approver. This workspace is review-only.',
    evidence: 'evidence', noEvidence: 'no evidence', unknownEvidence: 'evidence unknown',
  },
  ar: {
    title: 'قائمة الاعتماد',
    subtitle: 'راجع الكميات المعتمدة بالفحص والقيم الاسترشادية والعوائق لكل بند كميات.',
    basisNote: 'الكمية المعتمدة بالفحص × السعر قيمة استرشادية فقط، وليست قبولاً تجارياً أو اعتماد مستخلص أو موافقة على الدفع. إشارات العوائق محدودة بالسجلات المحمّلة.',
    refresh: 'تحديث',
    demoBanner: 'بيانات تجريبية اصطناعية — لا يوجد جدول كميات محمّل. جميع الأرقام أدناه للتوضيح فقط.',
    loadError: 'تعذّر تحميل بيانات الاعتماد. لا يتم عرض شيء بدلاً من عرض أرقام خاطئة.',
    empty: 'لا توجد بنود كميات بعد. استورد جدول الكميات واربط الأعمال للمراجعة التجارية.',
    search: 'ابحث بالرمز أو الوصف…',
    noMatch: 'لا بنود تطابق هذا المرشّح.',
    ledgerNote: 'لا تُعرض قيم الاعتماد السابق/الحالي/التراكمي لكل بند لعدم وجود سجل اعتماد على مستوى البند في قاعدة البيانات. الرقم أدناه على مستوى المشروع من رؤوس المستخلصات المعتمدة والمدفوعة.',
    cCode: 'البند', cDesc: 'الوصف', cUnit: 'الوحدة',
    cContractQty: 'كمية العقد', cRate: 'السعر', cContractValue: 'قيمة العقد',
    cEligibleQty: 'الكمية المعتمدة بالفحص', cEligibleValue: 'القيمة المستندة إلى الفحص',
    cNotEligible: 'بانتظار اعتماد الفحص', cWirs: 'طلبات الفحص', cStatus: 'حالة المراجعة', cBlocked: 'القيمة الموقوفة', cReason: 'العائق',
    totalsAll: 'كل البنود', totalsFiltered: 'البنود المرشّحة فقط',
    tContract: 'قيمة العقد', tEligible: 'القيمة المستندة إلى الفحص', tBlocked: 'القيمة الموقوفة', tLines: 'بنود',
    ready: 'لا إشارة عائق', partial: 'يتطلب مراجعة تجارية', lowValue: 'قيمة مستندة إلى الفحص أقل من ٠٫٥٠ ر.س.',
    measurementAction: 'أعد القياس وطابق الكمية المعتمدة بالفحص مع الكمية المطالب بها',
    projectCertified: 'المعتمد حتى تاريخه (المشروع)', projectCertifiedHint: 'من رؤوس المستخلصات المعتمدة والمدفوعة',
    dSummary: 'الملخص', dContract: 'الموقف التعاقدي', dProgress: 'التقدم', dCertification: 'الاعتماد',
    dSupport: 'الإسناد', dExceptions: 'الاستثناءات', dAction: 'الإجراء',
    dRate: 'السعر', dUnit: 'الوحدة', dContractQty: 'كمية العقد', dContractValue: 'قيمة العقد',
    dAdjusted: 'التعديلات المعتمدة', dAdjustedNone: 'لا توجد سجلات أوامر تغييرية — كمية العقد هي السقف.',
    dEligibleQty: 'الكمية المعتمدة بالفحص', dEligibleValue: 'القيمة المستندة إلى الفحص',
    dNotEligible: 'بانتظار اعتماد الفحص', dMapped: 'المربوط بالنموذج',
    dPrev: 'المعتمد سابقاً', dCurrent: 'الفترة الحالية', dCumulative: 'التراكمي المعتمد',
    dLedgerGap: 'غير متاح لكل بند — لا يوجد سجل اعتماد على مستوى البند.',
    dNoWirs: 'لا يوجد طلب فحص منسوب لهذا البند في السجلات المحمّلة.',
    dNoBlockers: 'لا إشارة عائق في السجلات المحمّلة — وهذا لا يعني خلو البند من العوائق.',
    dOwner: 'المالك المقترح', dNext: 'الإجراء التالي المقترح', dDerived: 'مشتق',
    dActionNote: 'الاعتماد المباشر معطّل — يتطلب تطبيق البوابة الأولى في الخادم واعتماداً من مخوّل. هذه الشاشة للمراجعة فقط.',
    evidence: 'أدلة', noEvidence: 'لا أدلة', unknownEvidence: 'الأدلة غير معروفة',
  },
};

function Chip({ children, color, soft }) {
  return (
    <span className="sc-mono text-[10px] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1.5 whitespace-nowrap" style={{ background: soft, color }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color, opacity: 0.85 }} />
      {children}
    </span>
  );
}

/** Numeric cell — every commercial figure is end-aligned and monospaced. */
const Num = ({ children, color, bold }) => (
  <td className="px-3 py-2 sc-mono text-end whitespace-nowrap" style={{ color: color || SC.ink, fontWeight: bold ? 600 : undefined }}>{children}</td>
);

/** Drawer key/value row. */
function KV({ k, v, color, mono = true, hint }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b last:border-b-0" style={{ borderColor: SC.line }}>
      <span className="text-[12px] shrink-0" style={{ color: SC.ink2 }}>{k}</span>
      <span className="text-end">
        <span className={`text-[12.5px] font-semibold ${mono ? 'sc-mono' : ''}`} style={{ color: color || SC.ink }}>{v}</span>
        {hint && <span className="block text-[10.5px] mt-0.5" style={{ color: SC.faint }}>{hint}</span>}
      </span>
    </div>
  );
}

function Section({ title, aside, children }) {
  return (
    <div>
      <div className="sc-mono text-[10px] tracking-widest mb-1.5 flex items-center gap-2" style={{ color: SC.faint }}>
        {title}{aside}
      </div>
      {children}
    </div>
  );
}

export function CertificationQueueView({ lang = 'en', onNavigate, initialFilter = 'all' }) {
  const ar = lang === 'ar';
  const L = TR[lang] || TR.en;
  // Presentation only: keep the shared classification and numeric contract.
  // `partial` includes fully inspected lines with evidence gaps; it does not
  // describe a quantity fraction. Even `ready` is not commercial entitlement.
  const reviewLabel = (cls) => cls === 'ready' ? L.ready : cls === 'partial' ? L.partial : readinessLabel(cls, lang);
  const actionLabel = (reason) => reason === 'REVIEW_ANOMALY' ? L.measurementAction : blockerAction(reason, lang);
  const { room, inputs, isDemo, loading, loadError, reload } = useCommercialData();
  const { lines, kpis } = room;

  const [filter, setFilter] = useState(initialFilter);
  const [q, setQ] = useState('');
  const [openLine, setOpenLine] = useState(null);

  // Exception-first filters. Each one answers a commercial question, and each
  // is derived from values that genuinely exist in the records.
  const FILTERS = useMemo(() => [
    { key: 'all', label: ar ? 'الكل' : 'All', match: () => true },
    { key: 'ready', label: L.ready, match: (l) => l.cls === 'ready' },
    { key: 'partial', label: L.partial, match: (l) => l.cls === 'partial' },
    { key: 'blocked', label: ar ? 'موقوف' : 'Blocked', match: (l) => l.blockedValue > 0.5 },
    { key: 'missing_wir', label: ar ? 'بدون طلب فحص' : 'Missing WIR', match: (l) => l.values.missingWir > 0.5 },
    { key: 'pending_wir', label: ar ? 'فحص معلّق' : 'Pending WIR', match: (l) => l.values.pending > 0.5 },
    { key: 'evidence', label: ar ? 'بدون أدلة' : 'Missing evidence', match: (l) => l.values.evidenceGap > 0.5 },
    { key: 'ncr', label: ar ? 'إيقاف مخالفة' : 'NCR hold', match: (l) => l.values.ncr > 0.5 },
    { key: 'cap', label: ar ? 'تجاوز السقف' : 'Cap issue', match: (l) => l.values.overclaim > 0.5 },
    { key: 'unlinked', label: ar ? 'بلا ربط' : 'No BoQ link', match: (l) => l.linkedCount === 0 },
    { key: 'none_eligible', label: L.lowValue, match: (l) => l.values.certifiable < 0.5 },
  ], [ar, L]);

  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return lines
      .filter(active.match)
      .filter((l) => !needle || `${l.code} ${l.description}`.toLowerCase().includes(needle));
  }, [lines, active, q]);

  // Totals are ALWAYS scoped explicitly — a filtered subtotal must never read
  // as the project position.
  const isScoped = filter !== 'all' || q.trim() !== '';
  const totals = useMemo(() => shown.reduce((t, l) => ({
    contract: t.contract + l.values.contract,
    eligible: t.eligible + l.values.certifiable,
    blocked: t.blocked + l.blockedValue,
  }), { contract: 0, eligible: 0, blocked: 0 }), [shown]);

  const hasData = loading || lines.length > 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden" dir={ar ? 'rtl' : 'ltr'}>
      <PageHeader title={L.title} subtitle={L.subtitle}
        actions={<Btn icon={RotateCcw} onClick={reload}>{L.refresh}</Btn>} />

      <div className="flex-1 overflow-y-auto scrollbar p-4 sm:p-6 space-y-4" style={{ background: SC.bg }}>
        <div className="flex items-start gap-2.5 text-[12.5px] px-4 py-2.5 rounded-lg border" style={{ background: SC.actionBg, borderColor: SC.actionBd, color: SC.action }}>
          <ShieldAlert size={15} className="flex-shrink-0 mt-0.5" />
          <span className="font-medium">{CONTROL_ROOM_BOUNDARY}</span>
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
          <div className="rounded-lg border p-6 text-center" style={{ background: SC.dangerBg, borderColor: SC.dangerBd }}>
            <div className="text-[13px] font-medium mb-3" style={{ color: SC.danger }}>{L.loadError}</div>
            <Btn icon={RotateCcw} variant="primary" onClick={reload}>{L.refresh}</Btn>
          </div>
        ) : !hasData ? (
          <EmptyState icon={FileText} title={L.title} description={L.empty} />
        ) : (
          <>
            <p className="text-[12px]" style={{ color: SC.ink2 }}>{L.basisNote}</p>
            {/* Project position. Three figures that are genuinely derivable,
                plus the certified-to-date figure which is project-level only. */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                [L.tContract, fmtAmount(lines.reduce((s, l) => s + l.values.contract, 0)), SC.ink, `${lines.length} ${L.tLines}`],
                [L.tEligible, fmtAmount(kpis.certifiableTotal), '#15803d', null],
                [L.tBlocked, fmtAmount(kpis.blockedValue), kpis.blockedValue > 0 ? SC.danger : SC.faint, null],
                [L.projectCertified, fmtAmount(kpis.certifiedInIpc), SC.action, L.projectCertifiedHint],
              ].map(([label, value, color, hint]) => (
                <div key={label} className="rounded-lg border p-3" style={{ background: SC.surface, borderColor: SC.line }}>
                  <div className="sc-mono text-[9.5px] tracking-widest" style={{ color: SC.faint }}>{String(label).toUpperCase()}</div>
                  <div className="sc-mono text-[17px] font-bold mt-1" style={{ color }}>SAR {value}</div>
                  {hint && <div className="text-[10.5px] mt-0.5" style={{ color: SC.faint }}>{hint}</div>}
                </div>
              ))}
            </div>

            <div className="text-[11.5px] px-3 py-2 rounded-lg border" style={{ background: SC.surface, borderColor: SC.line, color: SC.ink2 }}>
              {L.ledgerNote}
            </div>

            {/* Compact filter + search row */}
            <div className="flex items-center gap-2 flex-wrap">
              {FILTERS.map((f) => {
                const count = lines.filter(f.match).length;
                const on = filter === f.key;
                return (
                  <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={on}
                    className="px-2.5 py-1 rounded-lg text-[11.5px] font-semibold border transition-colors"
                    style={on ? { background: SC.action, color: '#fff', borderColor: SC.action } : { background: SC.surface, color: SC.ink2, borderColor: SC.line }}>
                    {f.label} <span className="sc-mono text-[10px] opacity-70">{count}</span>
                  </button>
                );
              })}
              <div className="relative ms-auto">
                <Search size={13} className="absolute top-1/2 -translate-y-1/2 start-2.5" style={{ color: SC.faint }} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L.search}
                  className="ps-8 pe-7 py-1.5 rounded-lg border text-[12px] outline-none w-56"
                  style={{ background: SC.surface, borderColor: SC.line, color: SC.ink }} />
                {q && <button onClick={() => setQ('')} aria-label="Clear" className="absolute top-1/2 -translate-y-1/2 end-2" style={{ color: SC.faint }}><X size={12} /></button>}
              </div>
            </div>

            {/* The workspace table */}
            <div className="rounded-lg border overflow-hidden" style={{ background: SC.surface, borderColor: SC.line }}>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]" style={{ minWidth: 1180 }}>
                  <thead className="sc-mono text-[10px] uppercase tracking-wide" style={{ background: SC.surface2 || SC.bg, color: SC.faint }}>
                    <tr style={{ borderBottom: `1px solid ${SC.line}` }}>
                      <th className="px-3 py-2 text-start font-semibold">{L.cCode}</th>
                      <th className="px-3 py-2 text-start font-semibold">{L.cDesc}</th>
                      <th className="px-3 py-2 text-start font-semibold">{L.cUnit}</th>
                      <th className="px-3 py-2 text-end font-semibold">{L.cContractQty}</th>
                      <th className="px-3 py-2 text-end font-semibold">{L.cRate}</th>
                      <th className="px-3 py-2 text-end font-semibold">{L.cContractValue}</th>
                      <th className="px-3 py-2 text-end font-semibold">{L.cEligibleQty}</th>
                      <th className="px-3 py-2 text-end font-semibold">{L.cEligibleValue}</th>
                      <th className="px-3 py-2 text-end font-semibold">{L.cNotEligible}</th>
                      <th className="px-3 py-2 text-end font-semibold">{L.cWirs}</th>
                      <th className="px-3 py-2 text-start font-semibold">{L.cStatus}</th>
                      <th className="px-3 py-2 text-end font-semibold">{L.cBlocked}</th>
                      <th className="px-3 py-2 text-start font-semibold">{L.cReason}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((l) => {
                      const rm = READINESS_META[l.cls];
                      const bm = l.blockers[0] ? BLOCKER_META[l.blockers[0].reason] : null;
                      const on = openLine?.id === l.id;
                      const notEligibleQty = Math.max(0, l.contractQty - l.approvedQty);
                      return (
                        <tr key={l.id} aria-selected={on} onClick={() => setOpenLine(l)}
                          className={`border-t cursor-pointer ${on ? '' : 'hover:bg-sc-surface-3'}`}
                          style={{ borderColor: SC.line, background: on ? SC.actionBg : undefined, boxShadow: on ? `inset 3px 0 0 ${SC.action}` : undefined }}>
                          <td className="px-3 py-2 sc-mono font-semibold whitespace-nowrap" style={{ color: SC.action }}>{l.code}</td>
                          <td className="px-3 py-2 max-w-[240px] truncate" title={l.description} style={{ color: SC.ink }}>{l.description}</td>
                          <td className="px-3 py-2 sc-mono text-[11px]" style={{ color: SC.faint }}>{l.unit || '—'}</td>
                          <Num>{fmtQty(l.contractQty)}</Num>
                          <Num color={SC.ink2}>{fmtRate(l.values.contract && l.contractQty ? l.values.contract / l.contractQty : null)}</Num>
                          <Num>{fmtAmount(l.values.contract)}</Num>
                          <Num color={l.approvedQty > 0 ? '#15803d' : SC.faint} bold={l.approvedQty > 0}>{fmtQty(l.approvedQty)}</Num>
                          <Num color={l.values.certifiable > 0 ? '#15803d' : SC.faint} bold={l.values.certifiable > 0}>{fmtAmount(l.values.certifiable)}</Num>
                          <Num color={SC.ink2}>{fmtQty(notEligibleQty)}</Num>
                          <Num color={l.wirs.length ? SC.ink2 : SC.faint}>{l.wirs.length || '—'}</Num>
                          <td className="px-3 py-2"><Chip color={rm.color} soft={rm.soft}>{reviewLabel(l.cls)}</Chip></td>
                          <Num color={l.blockedValue > 0 ? SC.danger : SC.faint} bold={l.blockedValue > 0}>{l.blockedValue > 0 ? fmtAmount(l.blockedValue) : '—'}</Num>
                          <td className="px-3 py-2 whitespace-nowrap">{bm ? <Chip color={bm.color} soft={bm.soft}>{blockerLabel(l.blockers[0].reason, lang)}</Chip> : <span style={{ color: SC.faint }}>—</span>}</td>
                        </tr>
                      );
                    })}
                    {shown.length === 0 && (
                      <tr><td colSpan={13} className="px-3 py-10 text-center text-[12px]" style={{ color: SC.faint }}>{L.noMatch}</td></tr>
                    )}
                  </tbody>
                  {shown.length > 0 && (
                    <tfoot>
                      <tr style={{ borderTop: `2px solid ${SC.lineStrong || SC.line}`, background: SC.bg }}>
                        <td className="px-3 py-2.5 sc-mono text-[10.5px] font-bold uppercase tracking-wide" colSpan={5} style={{ color: isScoped ? SC.warning : SC.ink2 }}>
                          {isScoped ? L.totalsFiltered : L.totalsAll} · {shown.length} {L.tLines}
                        </td>
                        <Num bold>{fmtAmount(totals.contract)}</Num>
                        <td />
                        <Num color="#15803d" bold>{fmtAmount(totals.eligible)}</Num>
                        <td colSpan={3} />
                        <Num color={totals.blocked > 0 ? SC.danger : SC.faint} bold>{totals.blocked > 0 ? fmtAmount(totals.blocked) : '—'}</Num>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Commercial review drawer ─────────────────────────── */}
      {openLine && (() => {
        const l = openLine;
        const rm = READINESS_META[l.cls];
        const bm = l.blockers[0] ? BLOCKER_META[l.blockers[0].reason] : null;
        const rate = l.contractQty ? l.values.contract / l.contractQty : 0;
        const notEligibleQty = Math.max(0, l.contractQty - l.approvedQty);
        const evidenceUnknown = kpis.evidenceUnknown;
        const counts = inputs.wirAttachCounts || {};
        return (
          <Drawer open onClose={() => setOpenLine(null)} title={l.code} subtitle={l.description} width={560}>
            <div dir={ar ? 'rtl' : 'ltr'} className="space-y-5">
              <div className="flex items-center gap-2 flex-wrap">
                <Chip color={rm.color} soft={rm.soft}>{reviewLabel(l.cls)}</Chip>
                {bm && <Chip color={bm.color} soft={bm.soft}>{blockerLabel(l.blockers[0].reason, lang)}</Chip>}
              </div>

              <Section title={L.dSummary.toUpperCase()}>
                <div className="rounded-lg border px-3" style={{ borderColor: SC.line, background: SC.surface }}>
                  <KV k={L.dUnit} v={l.unit || '—'} />
                  <KV k={L.dRate} v={`SAR ${fmtRate(rate)}`} />
                </div>
              </Section>

              <Section title={L.dContract.toUpperCase()}>
                <div className="rounded-lg border px-3" style={{ borderColor: SC.line, background: SC.surface }}>
                  <KV k={L.dContractQty} v={`${fmtQty(l.contractQty)} ${l.unit || ''}`} />
                  <KV k={L.dContractValue} v={`SAR ${fmtAmount(l.values.contract)}`} />
                  <KV k={L.dAdjusted} v="—" hint={L.dAdjustedNone} />
                </div>
              </Section>

              <Section title={L.dProgress.toUpperCase()}>
                <div className="rounded-lg border px-3" style={{ borderColor: SC.line, background: SC.surface }}>
                  <KV k={L.dEligibleQty} v={`${fmtQty(l.approvedQty)} ${l.unit || ''}`} color={l.approvedQty > 0 ? '#15803d' : SC.faint} />
                  <KV k={L.dEligibleValue} v={`SAR ${fmtAmount(l.values.certifiable)}`} color={l.values.certifiable > 0 ? '#15803d' : SC.faint} />
                  <KV k={L.dNotEligible} v={`${fmtQty(notEligibleQty)} ${l.unit || ''}`} />
                  <KV k={L.dMapped} v={l.linkedCount ? `${l.linkedCount}` : '—'} />
                </div>
              </Section>

              <Section title={L.dCertification.toUpperCase()}>
                <div className="rounded-lg border px-3" style={{ borderColor: SC.line, background: SC.surface }}>
                  <KV k={L.dPrev} v="—" />
                  <KV k={L.dCurrent} v="—" />
                  <KV k={L.dCumulative} v="—" hint={L.dLedgerGap} />
                </div>
              </Section>

              <Section title={`${L.dSupport.toUpperCase()} (${l.wirs.length})`}>
                {l.wirs.length === 0 ? (
                  <div className="text-[12px]" style={{ color: SC.faint }}>{L.dNoWirs}</div>
                ) : (
                  <div className="rounded-lg border divide-y overflow-hidden" style={{ borderColor: SC.line, background: SC.surface }}>
                    {l.wirs.map((w) => {
                      const approved = /approv/i.test(String(w.result || ''));
                      const files = evidenceUnknown ? null : (counts[w.id] || 0);
                      const qty = Number(w.approved_qty ?? w.scope_qty);
                      return (
                        <div key={w.id} className="flex items-center gap-2 px-3 py-2">
                          <span className="sc-mono text-[11px] font-semibold flex-shrink-0" style={{ color: SC.action }}>{w.wir_number || String(w.id).slice(0, 8)}</span>
                          <span className="sc-mono text-[9.5px] px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: approved ? '#dcfce7' : SC.warningBg, color: approved ? '#15803d' : SC.warning }}>{w.result || 'pending'}</span>
                          <span className="sc-mono text-[10.5px] flex-1 text-end" style={{ color: SC.ink2 }}>{isNaN(qty) ? '—' : `${fmtQty(qty)} ${l.unit || ''}`}</span>
                          <span className="sc-mono text-[10px] flex-shrink-0" style={{ color: files == null ? SC.faint : files > 0 ? SC.ink2 : SC.warning }}>
                            {files == null ? L.unknownEvidence : files > 0 ? `${files} ${L.evidence}` : L.noEvidence}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>

              <Section title={L.dExceptions.toUpperCase()}>
                {l.blockers.length === 0 ? (
                  <div className="text-[12px]" style={{ color: SC.faint }}>{L.dNoBlockers}</div>
                ) : (
                  <div className="rounded-lg border divide-y overflow-hidden" style={{ borderColor: SC.line, background: SC.surface }}>
                    {l.blockers.map((b) => {
                      const m = BLOCKER_META[b.reason];
                      return (
                        <div key={b.reason} className="px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <Chip color={m.color} soft={m.soft}>{blockerLabel(b.reason, lang)}</Chip>
                            <span className="sc-mono text-[12px] font-semibold" style={{ color: SC.danger }}>SAR {fmtAmount(b.value)}</span>
                          </div>
                          <div className="text-[11.5px] mt-1" style={{ color: SC.ink2 }}>{actionLabel(b.reason)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>

              <Section title={L.dAction.toUpperCase()} aside={<span className="sc-mono text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: SC.warningBg, color: SC.warning }}>{L.dDerived}</span>}>
                <div className="rounded-lg border px-3" style={{ borderColor: SC.line, background: SC.surface }}>
                  <KV k={L.dOwner} v={l.owner ? ownerLabel(l.owner, lang) : '—'} mono={false} />
                  <KV k={L.dNext} v={l.blockers[0]?.reason === 'REVIEW_ANOMALY' ? L.measurementAction : l.nextAction || '—'} mono={false} />
                </div>
                <div className="mt-2 rounded-lg px-3 py-2 text-[11.5px] flex items-start gap-2" style={{ background: SC.warningBg, color: SC.warning }}>
                  <ShieldAlert size={13} className="shrink-0 mt-0.5" />{L.dActionNote}
                </div>
              </Section>

              {onNavigate && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Btn variant="secondary" onClick={() => onNavigate('qs')}>{ar ? 'فتح جدول الكميات' : 'Open BoQ'}</Btn>
                  <Btn variant="secondary" onClick={() => onNavigate('wirs')}>{ar ? 'فتح طلبات الفحص' : 'Open WIRs'}</Btn>
                </div>
              )}
            </div>
          </Drawer>
        );
      })()}
    </div>
  );
}
