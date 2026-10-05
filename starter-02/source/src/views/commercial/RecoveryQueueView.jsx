import { useMemo, useState } from 'react';
import { HandCoins, X, AlertOctagon, Search, FileText, PenLine, BarChart3 } from 'lucide-react';
import { PageHeader, KpiCard } from '../../components/primitives.jsx';
import { StyledSelect } from '../../components/StyledSelect.jsx';
import {
  RECOVERY_ROWS, RECOVERY_BADGE, REASON_CODES, DISPOSITION_META, PRIORITY_META, EVIDENCE_META,
  computeKpis, valueBy, filterRows, sortRows,
  dispositionLabel, reasonLabel, priorityLabel, evidenceLabel, ownerLabel, reasonAction,
} from '../../lib/recoveryQueue.js';
import { fmtMoney } from '../../lib/format.js';
import { COL } from '../../lib/theme.js';

// ============================================================
// RecoveryQueueView — Blocked Value / Recovery Queue. Exposes all value that
// is NOT becoming certified payment value, why, who must act, and when it can
// be recovered. DISPLAY-ONLY on badged synthetic rows: the reason-code /
// owner / disposition workflow has no backend source yet, so every surface
// carries RECOVERY_BADGE. No certify / approve / paid / write actions exist
// anywhere on this view.
// ============================================================

const TR = {
  en: {
    title: 'Blocked Value / Recovery Queue',
    subtitle: 'Every riyal not yet becoming certified payment value — reason, owner, recovery path',
    badge: RECOVERY_BADGE,
    kTotal: 'Total blocked value', kNext: 'Recoverable next IPC', kExt: 'Recoverable after external approval',
    kBlocked: 'Blocked', kWriteOff: 'Write-off', kReview: 'Review',
    lines: 'lines', all: 'All', search: 'Search code / description / location…',
    fReason: 'Reason', fDisposition: 'Disposition', fOwner: 'Owner', fPriority: 'Priority',
    byReason: 'Blocked value by reason', byOwner: 'Blocked value by owner',
    colCode: 'BoQ', colDesc: 'Description', colLoc: 'Location / WBS', colClaimed: 'Claimed qty',
    colWir: 'WIR-approved qty', colCert: 'Certifiable qty', colBlockedQ: 'Blocked qty', colBlockedV: 'Blocked value',
    colReason: 'Reason code', colDisp: 'Disposition', colOwner: 'Owner', colAction: 'Required action',
    colTarget: 'Target IPC', colEvidence: 'Evidence', colNcr: 'NCR', colPriority: 'Priority',
    empty: 'No rows match the current filters.',
    drawerTitle: 'Recovery line', drawerQty: 'Quantities', drawerWorkflow: 'Recovery workflow',
    drawerNote: 'Draft action note', draftBtn: 'Draft action note',
    notePlaceholder: 'Draft the recovery action for this line… (display-only)',
    noteCaption: 'Draft only — notes are not saved; the queue has no backend fields yet.',
    drawerWarn: RECOVERY_BADGE + ' Owner, disposition and actions are derived workflow defaults.',
    close: 'Close', unit: 'Unit', rate: 'Rate',
  },
  ar: {
    title: 'قائمة القيمة الموقوفة / الاسترداد',
    subtitle: 'كل ريال لم يتحول بعد إلى قيمة دفع معتمدة — السبب والمالك ومسار الاسترداد',
    badge: 'بيانات تجريبية/جاهزية. غير معتمدة من الخادم.',
    kTotal: 'إجمالي القيمة الموقوفة', kNext: 'قابل للاسترداد بالمستخلص القادم', kExt: 'قابل للاسترداد بعد موافقة خارجية',
    kBlocked: 'موقوف', kWriteOff: 'شطب', kReview: 'مراجعة',
    lines: 'بنود', all: 'الكل', search: 'ابحث بالبند / الوصف / الموقع…',
    fReason: 'السبب', fDisposition: 'التصنيف', fOwner: 'المالك', fPriority: 'الأولوية',
    byReason: 'القيمة الموقوفة حسب السبب', byOwner: 'القيمة الموقوفة حسب المالك',
    colCode: 'البند', colDesc: 'الوصف', colLoc: 'الموقع / WBS', colClaimed: 'الكمية المطالب بها',
    colWir: 'كمية الفحص المعتمد', colCert: 'الكمية القابلة للاعتماد', colBlockedQ: 'الكمية الموقوفة', colBlockedV: 'القيمة الموقوفة',
    colReason: 'رمز السبب', colDisp: 'التصنيف', colOwner: 'المالك', colAction: 'الإجراء المطلوب',
    colTarget: 'المستخلص المستهدف', colEvidence: 'الأدلة', colNcr: 'المخالفة', colPriority: 'الأولوية',
    empty: 'لا بنود تطابق عوامل التصفية الحالية.',
    drawerTitle: 'بند الاسترداد', drawerQty: 'الكميات', drawerWorkflow: 'مسار الاسترداد',
    drawerNote: 'مسودة إجراء', draftBtn: 'مسودة إجراء',
    notePlaceholder: 'اكتب مسودة إجراء الاسترداد لهذا البند… (عرض فقط)',
    noteCaption: 'مسودة فقط — لا تُحفظ؛ لا حقول خلفية للقائمة بعد.',
    drawerWarn: 'بيانات تجريبية/جاهزية غير معتمدة من الخادم. المالك والتصنيف والإجراءات افتراضات مشتقة.',
    close: 'إغلاق', unit: 'الوحدة', rate: 'السعر',
  },
};

function Pill({ color, soft, children }) {
  return (
    <span className="mono text-[10px] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1.5 whitespace-nowrap" style={{ background: soft, color }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color, opacity: 0.85 }} />
      {children}
    </span>
  );
}

function BarList({ title, icon: Icon, data, labelFor }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="rounded-lg border overflow-hidden" style={{ background: COL.surface, borderColor: COL.border }}>
      <div className="px-5 py-3 border-b flex items-center gap-2 display text-sm font-bold" style={{ borderColor: COL.border, color: COL.text }}>
        <Icon size={15} style={{ color: COL.textDim }} /> {title}
      </div>
      <div className="p-4 space-y-2">
        {data.map((d) => (
          <div key={d.key} className="flex items-center gap-3">
            <span className="text-[11.5px] truncate" style={{ color: COL.text, width: 170, flexShrink: 0 }} title={labelFor ? labelFor(d.key) : d.key}>{labelFor ? labelFor(d.key) : d.key}</span>
            <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: COL.surfaceAlt }}>
              <div className="h-full rounded-full" style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: COL.accent, opacity: 0.85 }} />
            </div>
            <span className="mono text-[11px] font-bold whitespace-nowrap text-end" style={{ color: COL.text, width: 92, flexShrink: 0 }}>{fmtMoney(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const selectStyle = { background: COL.surface, borderColor: COL.borderStrong, color: COL.text };

export function RecoveryQueueView({ lang = 'en' }) {
  const ar = lang === 'ar';
  const L = TR[lang] || TR.en;
  const [f, setF] = useState({ reason: 'all', disposition: 'all', owner: 'all', priority: 'all', q: '' });
  const [open, setOpen] = useState(null);      // drawer row
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');        // draft-only, never saved

  const rows = RECOVERY_ROWS;
  const kpis = useMemo(() => computeKpis(rows), [rows]);
  const filtered = useMemo(() => sortRows(filterRows(rows, f)), [rows, f]);
  const owners = useMemo(() => [...new Set(rows.map((x) => x.owner))].sort(), [rows]);
  const byReason = useMemo(() => valueBy(rows, 'reasonCode'), [rows]);
  const byOwner = useMemo(() => valueBy(rows, 'owner'), [rows]);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const openDrawer = (x) => { setOpen(x); setNoteOpen(false); setNote(''); };

  return (
    <div className="flex-1 flex flex-col overflow-hidden" dir={ar ? 'rtl' : 'ltr'}>
      <PageHeader title={L.title} subtitle={L.subtitle} />

      <div className="flex-1 overflow-y-auto scrollbar p-4 sm:p-6 space-y-5" style={{ background: COL.bg }}>
        {/* Mandatory badge — this queue is demo/readiness data, not backend truth. */}
        <div className="flex items-start gap-2.5 text-[12.5px] px-4 py-2.5 rounded-lg border" style={{ background: '#fef3c7', borderColor: '#fde68a', color: '#92400e' }}>
          <AlertOctagon size={15} className="flex-shrink-0 mt-0.5" />
          <span className="font-medium">{L.badge}</span>
        </div>

        {/* KPI summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard label={L.kTotal} value={fmtMoney(kpis.total)} accent="#b91c1c" hint={`${kpis.lines} ${L.lines}`} icon={HandCoins} />
          <KpiCard label={L.kNext} value={fmtMoney(kpis.recoverableNextIpc)} accent="#15803d" />
          <KpiCard label={L.kExt} value={fmtMoney(kpis.recoverableExternal)} accent="#b45309" />
          <KpiCard label={L.kBlocked} value={fmtMoney(kpis.blocked)} accent="#dc2626" />
          <KpiCard label={L.kWriteOff} value={fmtMoney(kpis.writeOff)} accent="#64748b" />
          <KpiCard label={L.kReview} value={fmtMoney(kpis.review)} accent="#7c3aed" />
        </div>

        {/* Filters */}
        <div className="rounded-lg border p-3 flex items-center gap-2 flex-wrap" style={{ background: COL.surface, borderColor: COL.border }}>
          <div className="relative flex-1 min-w-[220px]">
            <Search size={13} className="absolute start-3 top-1/2 -translate-y-1/2" style={{ color: COL.textMute }} />
            <input value={f.q} onChange={set('q')} placeholder={L.search}
              className="w-full ps-8 pe-3 py-1.5 text-[12.5px] rounded-lg border outline-none" style={selectStyle} />
          </div>
          {[
            ['reason', L.fReason, REASON_CODES.map((x) => ({ value: x.code, label: reasonLabel(x.code, lang) }))],
            ['disposition', L.fDisposition, Object.keys(DISPOSITION_META).map((k) => ({ value: k, label: dispositionLabel(k, lang) }))],
            ['owner', L.fOwner, owners.map((o) => ({ value: o, label: ownerLabel(o, lang) }))],
            ['priority', L.fPriority, Object.keys(PRIORITY_META).map((k) => ({ value: k, label: priorityLabel(k, lang) }))],
          ].map(([key, label, opts]) => (
            <label key={key} className="flex items-center gap-1.5 text-[11px]" style={{ color: COL.textDim }}>
              {label}
              <div className="min-w-[130px]">
                <StyledSelect value={f[key]} onChange={(v) => setF((s) => ({ ...s, [key]: v }))} ariaLabel={label}
                  options={[{ value: 'all', label: L.all }, ...opts]} />
              </div>
            </label>
          ))}
          <span className="mono text-[10px] ms-auto" style={{ color: COL.textMute }}>{filtered.length}/{rows.length} {L.lines}</span>
        </div>

        {/* Queue table — the 16 workflow fields */}
        <div className="rounded-lg border overflow-hidden" style={{ background: COL.surface, borderColor: COL.border }}>
          {filtered.length === 0 ? (
            <div className="px-5 py-8 text-center text-[13px]" style={{ color: COL.textMute }}>{L.empty}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: 1500 }}>
                <thead className="mono" style={{ color: COL.textDim }}>
                  <tr style={{ borderBottom: `1px solid ${COL.border}` }}>
                    {[L.colCode, L.colDesc, L.colLoc, L.colClaimed, L.colWir, L.colCert, L.colBlockedQ, L.colBlockedV, L.colReason, L.colDisp, L.colOwner, L.colAction, L.colTarget, L.colEvidence, L.colNcr, L.colPriority]
                      .map((h, i) => <th key={h} className={`px-3 py-2 whitespace-nowrap ${i >= 3 && i <= 7 ? 'text-end' : 'text-start'}`}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((x) => {
                    const dm = DISPOSITION_META[x.disposition];
                    const pm = PRIORITY_META[x.priority];
                    const em = EVIDENCE_META[x.evidence];
                    return (
                      <tr key={x.id} className="border-t hover:bg-stone-50 cursor-pointer" style={{ borderColor: '#f0f0f3' }} onClick={() => openDrawer(x)}>
                        <td className="px-3 py-2.5 mono font-semibold whitespace-nowrap" style={{ color: COL.accent }}>{x.boqCode}</td>
                        <td className="px-3 py-2.5 max-w-[210px] truncate" title={x.description} style={{ color: COL.text }}>{x.description}</td>
                        <td className="px-3 py-2.5 mono text-[10.5px] max-w-[160px] truncate" title={x.location} style={{ color: COL.textDim }}>{x.location}</td>
                        <td className="px-3 py-2.5 mono text-end whitespace-nowrap" style={{ color: COL.textDim }}>{x.claimedQty} {x.unit}</td>
                        <td className="px-3 py-2.5 mono text-end whitespace-nowrap" style={{ color: COL.textDim }}>{x.wirApprovedQty}</td>
                        <td className="px-3 py-2.5 mono text-end whitespace-nowrap" style={{ color: '#15803d' }}>{x.certifiableQty}</td>
                        <td className="px-3 py-2.5 mono text-end whitespace-nowrap" style={{ color: '#b91c1c' }}>{x.blockedQty}</td>
                        <td className="px-3 py-2.5 mono text-end font-bold whitespace-nowrap" style={{ color: '#b91c1c' }}>{fmtMoney(x.blockedValue)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: COL.text }}>{reasonLabel(x.reasonCode, lang)}</td>
                        <td className="px-3 py-2.5"><Pill color={dm.color} soft={dm.soft}>{dispositionLabel(x.disposition, lang)}</Pill></td>
                        <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: COL.text }}>{ownerLabel(x.owner, lang)}</td>
                        <td className="px-3 py-2.5 max-w-[190px] truncate" title={reasonAction(x.reasonCode, lang)} style={{ color: COL.textDim }}>{reasonAction(x.reasonCode, lang)}</td>
                        <td className="px-3 py-2.5 mono whitespace-nowrap" style={{ color: COL.textDim }}>{x.targetIpc}</td>
                        <td className="px-3 py-2.5"><span className="mono text-[10px] font-semibold" style={{ color: em?.color || COL.textMute }}>{em ? evidenceLabel(x.evidence, lang) : '—'}</span></td>
                        <td className="px-3 py-2.5 mono text-[10.5px] whitespace-nowrap" style={{ color: x.ncrStatus === 'open' ? '#b91c1c' : COL.textMute }}>{x.ncrStatus}</td>
                        <td className="px-3 py-2.5"><Pill color={pm.color} soft={pm.soft}>{priorityLabel(x.priority, lang)}</Pill></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Charts */}
        <div className="grid lg:grid-cols-2 gap-5">
          <BarList title={L.byReason} icon={BarChart3} data={byReason} />
          <BarList title={L.byOwner} icon={BarChart3} data={byOwner} />
        </div>
      </div>

      {/* Detail drawer */}
      {open && (() => {
        const x = open;
        const dm = DISPOSITION_META[x.disposition];
        const pm = PRIORITY_META[x.priority];
        const em = EVIDENCE_META[x.evidence];
        return (
          <>
            <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setOpen(null)} />
            <div dir={ar ? 'rtl' : 'ltr'} className="fixed inset-y-0 z-50 w-full sm:w-[460px] flex flex-col shadow-2xl" style={{ insetInlineEnd: 0, background: COL.surface }} role="dialog" aria-modal="true" aria-label={`${x.boqCode} — ${ar ? 'استرداد' : 'recovery'}`}>
              <div className="px-5 py-4 border-b flex items-start gap-3" style={{ borderColor: COL.border }}>
                <div className="flex-1 min-w-0">
                  <div className="mono text-[11px] font-bold" style={{ color: COL.accent }}>{x.boqCode} · {x.id}</div>
                  <div className="display text-[15px] font-bold leading-tight mt-0.5" style={{ color: COL.text }}>{x.description}</div>
                  <div className="mono text-[10.5px] mt-1" style={{ color: COL.textMute }}>{x.location}</div>
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    <Pill color={dm.color} soft={dm.soft}>{dispositionLabel(x.disposition, lang)}</Pill>
                    <Pill color={pm.color} soft={pm.soft}>{priorityLabel(x.priority, lang)}</Pill>
                  </div>
                </div>
                <button onClick={() => setOpen(null)} aria-label={L.close} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-stone-100 flex-shrink-0" style={{ color: COL.textDim }}><X size={16} /></button>
              </div>

              <div className="flex-1 overflow-y-auto scrollbar p-5 space-y-5" style={{ background: COL.bg }}>
                <div className="text-[11.5px] px-3 py-2 rounded-lg border" style={{ background: '#fef3c7', borderColor: '#fde68a', color: '#92400e' }}>{L.drawerWarn}</div>

                {/* Quantities */}
                <div>
                  <div className="mono text-[10px] tracking-widest mb-1.5" style={{ color: COL.textMute }}>{L.drawerQty.toUpperCase()}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[[L.colClaimed, `${x.claimedQty} ${x.unit}`], [L.colWir, `${x.wirApprovedQty} ${x.unit}`], [L.colCert, `${x.certifiableQty} ${x.unit}`], [L.colBlockedQ, `${x.blockedQty} ${x.unit}`]].map(([lab, val]) => (
                      <div key={lab} className="rounded-lg border p-2.5" style={{ borderColor: COL.border, background: COL.surface }}>
                        <div className="mono text-[9px] tracking-wide" style={{ color: COL.textMute }}>{String(lab).toUpperCase()}</div>
                        <div className="mono text-[13px] font-bold mt-1" style={{ color: COL.text }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mono text-[10.5px] mt-2 flex flex-wrap gap-x-4 gap-y-1" style={{ color: COL.textDim }}>
                    <span>{L.rate}: {fmtMoney(x.rate)} / {x.unit}</span>
                    <span className="font-bold" style={{ color: '#b91c1c' }}>{L.colBlockedV}: {fmtMoney(x.blockedValue)}</span>
                  </div>
                </div>

                {/* Recovery workflow */}
                <div>
                  <div className="mono text-[10px] tracking-widest mb-1.5" style={{ color: COL.textMute }}>{L.drawerWorkflow.toUpperCase()}</div>
                  <div className="rounded-lg border divide-y overflow-hidden" style={{ borderColor: COL.border, background: COL.surface }}>
                    {[[L.colReason, reasonLabel(x.reasonCode, lang)], [L.colDisp, dispositionLabel(x.disposition, lang)], [L.colOwner, ownerLabel(x.owner, lang)], [L.colAction, reasonAction(x.reasonCode, lang)], [L.colTarget, x.targetIpc], [L.colEvidence, em ? evidenceLabel(x.evidence, lang) : '—'], [L.colNcr, x.ncrStatus]].map(([lab, val]) => (
                      <div key={lab} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="text-[11px]" style={{ color: COL.textDim }}>{lab}</span>
                        <span className="text-[12px] font-medium text-end" style={{ color: COL.text }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Draft action note — button reveals a draft-only textarea; nothing is saved. */}
                <div>
                  <div className="mono text-[10px] tracking-widest mb-1.5" style={{ color: COL.textMute }}>{L.drawerNote.toUpperCase()}</div>
                  {!noteOpen ? (
                    <button onClick={() => setNoteOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-full font-semibold border transition hover:-translate-y-px"
                      style={{ background: COL.surface, borderColor: COL.borderStrong, color: COL.text }}>
                      <PenLine size={13} /> {L.draftBtn}
                    </button>
                  ) : (
                    <>
                      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={L.notePlaceholder} autoFocus
                        className="w-full px-3 py-2 text-[12.5px] rounded-lg border outline-none resize-none"
                        style={{ background: COL.surface, borderColor: COL.borderStrong, color: COL.text }} />
                      <div className="text-[10.5px] mt-1 flex items-center gap-1.5" style={{ color: COL.textMute }}><FileText size={11} /> {L.noteCaption}</div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
