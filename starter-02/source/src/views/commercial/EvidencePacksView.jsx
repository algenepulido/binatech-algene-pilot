import { useMemo, useState } from 'react';
import { FolderCheck, X, AlertOctagon, Search, CheckCircle2, Circle, FileText, PenLine, ArrowUpRight, Boxes } from 'lucide-react';
import { PageHeader, KpiCard } from '../../components/primitives.jsx';
import {
  demoEvidencePacks, EVIDENCE_STATUS, EVIDENCE_SLOTS, EVIDENCE_BOUNDARY, EVIDENCE_BADGE,
  statusLabel, slotLabel, evidenceKpis, filterPacks,
} from '../../lib/evidencePacks.js';
import { COL } from '../../lib/theme.js';

// ============================================================
// EvidencePacksView — evidence as certification-readiness packs, not a file
// list. DISPLAY-ONLY on badged synthetic packs (no unified evidence-pack
// backend + upload path not RLS-verified). No uploads, no certify/approve/pay.
// Actions are draft-only or navigation. Boundary: evidence supports
// certification; it does not certify payment by itself.
// ============================================================

const TR = {
  en: {
    title: 'Evidence Packs', subtitle: 'Evidence organised as certification-readiness bundles — not a file list',
    boundary: EVIDENCE_BOUNDARY, badge: EVIDENCE_BADGE,
    kTotal: 'Evidence packs', kComplete: 'Complete', kNeeds: 'Needs action', kAvg: 'Avg completeness',
    search: 'Search BOQ / description / location / WIR…', all: 'All', packs: 'packs',
    colCode: 'BOQ', colDesc: 'Description', colLoc: 'Location / WBS', colWir: 'WIR', colStatus: 'Status', colComplete: 'Complete', colMissing: 'Missing',
    empty: 'No packs match this filter.',
    overview: 'Overview', linked: 'Linked records', certUse: 'Certification use', missing: 'Missing items',
    source: 'Source / version', audit: 'Planned audit trail',
    reqEvidence: 'Request missing evidence', openWir: 'Open linked WIR', openBoq: 'Open linked BOQ',
    openQueue: 'Open certification queue line', linkElement: 'Link to model element',
    draftReq: 'Draft request', draftCaption: 'Draft only — no message is sent; the request has no backend yet.',
    notePlaceholder: 'Draft an evidence request for the pack owner… (display-only)',
    auditNote: 'Audit trail is illustrative — the append-only evidence audit log activates with backend Gate 1.',
    warn: EVIDENCE_BADGE + ' Slot contents are illustrative, not real files.',
    present: 'Present', absent: 'Missing', none: 'None', close: 'Close', discipline: 'Discipline', ofReq: 'of required slots',
  },
  ar: {
    title: 'حزم الأدلة', subtitle: 'الأدلة منظّمة كحزم جاهزية للاعتماد — وليست قائمة ملفات',
    boundary: 'الأدلة تدعم الاعتماد. لا تعتمد الدفع بحد ذاتها.', badge: 'بيانات تجريبية/جاهزية. غير معتمدة من الخادم.',
    kTotal: 'حزم الأدلة', kComplete: 'مكتملة', kNeeds: 'تحتاج إجراء', kAvg: 'متوسط الاكتمال',
    search: 'ابحث بالبند / الوصف / الموقع / الفحص…', all: 'الكل', packs: 'حزم',
    colCode: 'البند', colDesc: 'الوصف', colLoc: 'الموقع / WBS', colWir: 'الفحص', colStatus: 'الحالة', colComplete: 'الاكتمال', colMissing: 'الناقص',
    empty: 'لا حزم تطابق هذا المرشّح.',
    overview: 'نظرة عامة', linked: 'السجلات المرتبطة', certUse: 'استخدام الاعتماد', missing: 'العناصر الناقصة',
    source: 'المصدر / الإصدار', audit: 'سجل التدقيق المخطط',
    reqEvidence: 'اطلب الأدلة الناقصة', openWir: 'افتح طلب الفحص', openBoq: 'افتح بند الكميات',
    openQueue: 'افتح بند قائمة الاعتماد', linkElement: 'اربط بعنصر النموذج',
    draftReq: 'مسودة طلب', draftCaption: 'مسودة فقط — لا تُرسل رسالة؛ لا يوجد خادم للطلب بعد.',
    notePlaceholder: 'اكتب مسودة طلب أدلة لمالك الحزمة… (عرض فقط)',
    auditNote: 'سجل التدقيق توضيحي — يُفعَّل السجل غير القابل للتعديل مع بوابة الخادم.',
    warn: 'بيانات تجريبية/جاهزية غير معتمدة من الخادم. محتويات الخانات توضيحية وليست ملفات حقيقية.',
    present: 'موجود', absent: 'ناقص', none: 'لا شيء', close: 'إغلاق', discipline: 'التخصص', ofReq: 'من الخانات المطلوبة',
  },
};

function StatusPill({ k, lang }) {
  const m = EVIDENCE_STATUS[k];
  return (
    <span className="mono text-[10px] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1.5 whitespace-nowrap" style={{ background: m.soft, color: m.color }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: m.color, opacity: 0.85 }} />
      {statusLabel(k, lang)}
    </span>
  );
}

function Bar({ pct, color }) {
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: COL.surfaceAlt, width: 90 }}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

const navBtn = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-full font-semibold border transition hover:-translate-y-px';

export function EvidencePacksView({ lang = 'en', onNavigate }) {
  const ar = lang === 'ar';
  const L = TR[lang] || TR.en;
  const packs = useMemo(() => demoEvidencePacks(), []);
  const kpis = useMemo(() => evidenceKpis(packs), [packs]);
  const [f, setF] = useState({ status: 'all', q: '' });
  const [open, setOpen] = useState(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');

  const filtered = useMemo(() => filterPacks(packs, f), [packs, f]);
  const openDrawer = (p) => { setOpen(p); setNoteOpen(false); setNote(''); };

  return (
    <div className="flex-1 flex flex-col overflow-hidden" dir={ar ? 'rtl' : 'ltr'}>
      <PageHeader title={L.title} subtitle={L.subtitle} />
      <div className="flex-1 overflow-y-auto scrollbar p-4 sm:p-6 space-y-5" style={{ background: COL.bg }}>
        {/* Boundary — evidence supports certification, it does not certify. */}
        <div className="flex items-start gap-2.5 text-[12.5px] px-4 py-2.5 rounded-lg border" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e40af' }}>
          <FolderCheck size={15} className="flex-shrink-0 mt-0.5" />
          <span className="font-medium">{L.boundary}</span>
        </div>
        {/* Mandatory demo badge */}
        <div className="flex items-start gap-2.5 text-[12.5px] px-4 py-2.5 rounded-lg border" style={{ background: '#fef3c7', borderColor: '#fde68a', color: '#92400e' }}>
          <AlertOctagon size={15} className="flex-shrink-0 mt-0.5" />
          <span className="font-medium">{L.badge}</span>
        </div>

        {/* KPI summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label={L.kTotal} value={kpis.total} icon={FolderCheck} />
          <KpiCard label={L.kComplete} value={kpis.complete} accent="#15803d" />
          <KpiCard label={L.kNeeds} value={kpis.needsAction} accent={kpis.needsAction > 0 ? '#b45309' : undefined} />
          <KpiCard label={L.kAvg} value={`${kpis.avgCompleteness}%`} accent="#1d4ed8" />
        </div>

        {/* Filters — status chips + search */}
        <div className="rounded-lg border p-3 flex items-center gap-2 flex-wrap" style={{ background: COL.surface, borderColor: COL.border }}>
          <div className="relative flex-1 min-w-[220px]">
            <Search size={13} className="absolute start-3 top-1/2 -translate-y-1/2" style={{ color: COL.textMute }} />
            <input value={f.q} onChange={(e) => setF((s) => ({ ...s, q: e.target.value }))} placeholder={L.search}
              className="w-full ps-8 pe-3 py-1.5 text-[12.5px] rounded-lg border outline-none" style={{ background: COL.surface, borderColor: COL.borderStrong, color: COL.text }} />
          </div>
          <button onClick={() => setF((s) => ({ ...s, status: 'all' }))} className="px-2.5 py-1 rounded-full text-[11px] font-semibold border" style={{ background: f.status === 'all' ? COL.accentBg : COL.surface, borderColor: f.status === 'all' ? COL.accent : COL.borderStrong, color: f.status === 'all' ? COL.accent : COL.textDim }}>{L.all} · {packs.length}</button>
          {Object.keys(EVIDENCE_STATUS).filter((k) => kpis.byStatus[k] > 0).map((k) => {
            const m = EVIDENCE_STATUS[k]; const active = f.status === k;
            return (
              <button key={k} onClick={() => setF((s) => ({ ...s, status: active ? 'all' : k }))} className="px-2.5 py-1 rounded-full text-[11px] font-semibold border transition"
                style={{ background: active ? m.soft : COL.surface, borderColor: active ? m.color : COL.borderStrong, color: active ? m.color : COL.textDim }}>
                {statusLabel(k, lang)} <span className="mono text-[10px]">· {kpis.byStatus[k]}</span>
              </button>
            );
          })}
        </div>

        {/* Pack list */}
        <div className="rounded-lg border overflow-hidden" style={{ background: COL.surface, borderColor: COL.border }}>
          {filtered.length === 0 ? (
            <div className="px-5 py-8 text-center text-[13px]" style={{ color: COL.textMute }}>{L.empty}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="mono" style={{ color: COL.textDim }}>
                  <tr style={{ borderBottom: `1px solid ${COL.border}` }}>
                    {[L.colCode, L.colDesc, L.colLoc, L.colWir, L.colStatus, L.colComplete, L.colMissing].map((h, i) => (
                      <th key={h} className={`px-3 py-2 whitespace-nowrap ${i === 5 ? 'text-center' : 'text-start'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const m = EVIDENCE_STATUS[p.status];
                    return (
                      <tr key={p.id} className="border-t hover:bg-stone-50 cursor-pointer" style={{ borderColor: '#f0f0f3' }} onClick={() => openDrawer(p)}>
                        <td className="px-3 py-2.5 mono font-semibold whitespace-nowrap" style={{ color: p.boqCode ? COL.accent : COL.textMute }}>{p.boqCode || '—'}</td>
                        <td className="px-3 py-2.5 max-w-[240px] truncate" title={p.description} style={{ color: COL.text }}>{p.description}</td>
                        <td className="px-3 py-2.5 mono text-[10.5px] max-w-[150px] truncate" title={p.location} style={{ color: COL.textDim }}>{p.location}</td>
                        <td className="px-3 py-2.5 mono text-[10.5px] whitespace-nowrap" style={{ color: p.wirNo ? COL.textDim : '#b45309' }}>{p.wirNo || L.none}</td>
                        <td className="px-3 py-2.5"><StatusPill k={p.status} lang={lang} /></td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2 justify-center">
                            <Bar pct={p.completeness} color={m.color} />
                            <span className="mono text-[10px]" style={{ color: COL.textDim }}>{p.completeness}%</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 mono text-[10.5px]" style={{ color: p.missing.length ? '#b45309' : '#15803d' }}>{p.missing.length ? p.missing.map((k) => slotLabel(k, lang)).join(', ') : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Detail drawer */}
      {open && (() => {
        const p = open;
        const m = EVIDENCE_STATUS[p.status];
        return (
          <>
            <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setOpen(null)} />
            <div dir={ar ? 'rtl' : 'ltr'} className="fixed inset-y-0 z-50 w-full sm:w-[480px] flex flex-col shadow-2xl" style={{ insetInlineEnd: 0, background: COL.surface }} role="dialog" aria-modal="true" aria-label={`${p.boqCode || p.id} evidence pack`}>
              <div className="px-5 py-4 border-b flex items-start gap-3" style={{ borderColor: COL.border }}>
                <div className="flex-1 min-w-0">
                  <div className="mono text-[11px] font-bold" style={{ color: COL.accent }}>{p.boqCode || p.id}{p.wirNo ? ` · ${p.wirNo}` : ''}</div>
                  <div className="display text-[15px] font-bold leading-tight mt-0.5" style={{ color: COL.text }}>{p.description}</div>
                  <div className="mono text-[10.5px] mt-1" style={{ color: COL.textMute }}>{p.location}</div>
                  <div className="mt-1.5"><StatusPill k={p.status} lang={lang} /></div>
                </div>
                <button onClick={() => setOpen(null)} aria-label={L.close} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-stone-100 flex-shrink-0" style={{ color: COL.textDim }}><X size={16} /></button>
              </div>

              <div className="flex-1 overflow-y-auto scrollbar p-5 space-y-5" style={{ background: COL.bg }}>
                <div className="text-[11.5px] px-3 py-2 rounded-lg border" style={{ background: '#fef3c7', borderColor: '#fde68a', color: '#92400e' }}>{L.warn}</div>

                {/* Overview */}
                <div>
                  <div className="mono text-[10px] tracking-widest mb-1.5" style={{ color: COL.textMute }}>{L.overview.toUpperCase()}</div>
                  <div className="rounded-lg border p-3 flex items-center gap-3" style={{ borderColor: COL.border, background: COL.surface }}>
                    <Bar pct={p.completeness} color={m.color} />
                    <span className="mono text-[13px] font-bold" style={{ color: m.color }}>{p.completeness}%</span>
                    <span className="text-[11px]" style={{ color: COL.textMute }}>{L.ofReq}</span>
                    {p.discipline && <span className="ms-auto mono text-[10.5px]" style={{ color: COL.textDim }}>{L.discipline}: {p.discipline}</span>}
                  </div>
                </div>

                {/* Linked records — the pack slots */}
                <div>
                  <div className="mono text-[10px] tracking-widest mb-1.5" style={{ color: COL.textMute }}>{L.linked.toUpperCase()}</div>
                  <div className="rounded-lg border divide-y overflow-hidden" style={{ borderColor: COL.border, background: COL.surface }}>
                    {EVIDENCE_SLOTS.map((s) => {
                      const on = p.present[s.key];
                      const vals = (p.slots || {})[s.key] || [];
                      return (
                        <div key={s.key} className="flex items-center gap-2.5 px-3 py-2">
                          {on ? <CheckCircle2 size={14} style={{ color: '#15803d' }} className="flex-shrink-0" /> : <Circle size={14} style={{ color: COL.textMute }} className="flex-shrink-0" />}
                          <span className="text-[12px] flex-shrink-0" style={{ color: COL.text, width: 130 }}>{slotLabel(s.key, lang)}</span>
                          <span className="mono text-[10.5px] flex-1 text-end truncate" style={{ color: on ? COL.textDim : COL.textMute }} title={vals.join(', ')}>{on ? vals.join(', ') : L.absent}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Certification use */}
                <div>
                  <div className="mono text-[10px] tracking-widest mb-1.5" style={{ color: COL.textMute }}>{L.certUse.toUpperCase()}</div>
                  <div className="text-[12.5px] px-3 py-2.5 rounded-lg leading-relaxed" style={{ background: COL.accentBg, color: COL.text }}>{p.certUse}</div>
                </div>

                {/* Missing items */}
                {p.missing.length > 0 && (
                  <div>
                    <div className="mono text-[10px] tracking-widest mb-1.5" style={{ color: COL.textMute }}>{L.missing.toUpperCase()} ({p.missing.length})</div>
                    <div className="flex flex-wrap gap-1.5">
                      {p.missing.map((k) => (
                        <span key={k} className="mono text-[10px] px-2 py-1 rounded-full" style={{ background: '#fef3c7', color: '#92400e' }}>{slotLabel(k, lang)}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Source / version */}
                <div>
                  <div className="mono text-[10px] tracking-widest mb-1.5" style={{ color: COL.textMute }}>{L.source.toUpperCase()}</div>
                  <div className="mono text-[11px] px-3 py-2 rounded-lg border" style={{ borderColor: COL.border, background: COL.surface, color: COL.textDim }}>{p.source}{p.element ? ` · ${p.element}` : ''}</div>
                </div>

                {/* Planned audit trail */}
                <div>
                  <div className="mono text-[10px] tracking-widest mb-1.5" style={{ color: COL.textMute }}>{L.audit.toUpperCase()}</div>
                  <div className="text-[11px] px-3 py-2 rounded-lg border" style={{ borderColor: COL.border, background: COL.surface, color: COL.textMute }}>{L.auditNote}</div>
                </div>

                {/* Actions — draft-only + navigation */}
                <div className="space-y-2 pt-1">
                  {!noteOpen ? (
                    <button onClick={() => setNoteOpen(true)} className={navBtn} style={{ background: COL.surface, borderColor: COL.borderStrong, color: COL.text }}>
                      <PenLine size={13} /> {L.reqEvidence}
                    </button>
                  ) : (
                    <div>
                      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={L.notePlaceholder} autoFocus
                        className="w-full px-3 py-2 text-[12.5px] rounded-lg border outline-none resize-none" style={{ background: COL.surface, borderColor: COL.borderStrong, color: COL.text }} />
                      <div className="text-[10.5px] mt-1 flex items-center gap-1.5" style={{ color: COL.textMute }}><FileText size={11} /> {L.draftCaption}</div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button disabled={!p.wirNo} onClick={() => onNavigate?.('wirs')} className={navBtn} style={{ background: COL.surface, borderColor: COL.borderStrong, color: p.wirNo ? COL.accent : COL.textMute, opacity: p.wirNo ? 1 : 0.5 }}><ArrowUpRight size={13} /> {L.openWir}</button>
                    <button disabled={!p.boqCode} onClick={() => onNavigate?.('qs')} className={navBtn} style={{ background: COL.surface, borderColor: COL.borderStrong, color: p.boqCode ? COL.accent : COL.textMute, opacity: p.boqCode ? 1 : 0.5 }}><ArrowUpRight size={13} /> {L.openBoq}</button>
                    <button onClick={() => onNavigate?.('commercialhub')} className={navBtn} style={{ background: COL.surface, borderColor: COL.borderStrong, color: COL.accent }}><ArrowUpRight size={13} /> {L.openQueue}</button>
                    <button onClick={() => onNavigate?.('registry')} className={navBtn} style={{ background: COL.surface, borderColor: COL.borderStrong, color: COL.textDim }}><Boxes size={13} /> {L.linkElement}</button>
                  </div>
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
