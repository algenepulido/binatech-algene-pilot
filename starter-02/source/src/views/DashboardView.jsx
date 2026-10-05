import { useMemo, useState, useEffect, useRef } from 'react';
import { AlertOctagon, ArrowRight, ClipboardCheck, Download, Plus, Receipt, ChevronDown, FolderPlus, FlaskConical, Flag, FileImage, FileText, Box, Building2, Link2, X, ShieldAlert } from 'lucide-react';
import { Btn, KpiCard, PageHeader } from '../components/primitives.jsx';
import { AiAdvisory } from '../components/AiAdvisory.jsx';
import { runAdvisories, advisorySummary } from '../lib/commercialAdvisoryEngine.js';
import { fmt, fmtMoney } from '../lib/format.js';
import { COL } from '../lib/theme.js';
import { useProject } from '../lib/project.jsx';
import { useElements } from '../lib/elements.jsx';
import { isSampleProject } from '../lib/currentProject.js';
import { loadDashboardLists } from '../lib/stats.js';
import { loadElementStatusMap, ESTATUS } from '../lib/elementStatus.js';
import { listAllLinks } from '../api/elementBoqLinks.js';
import { listBoqItems } from '../api/boqItems.js';
import { listWirs } from '../api/wirs.js';
import { ProjectModelCard } from './ProjectModelCard.jsx';
import { GettingStarted } from '../components/GettingStarted.jsx';
import { useIsMobile } from '../lib/useIsMobile.js';
import { normalizeStorey } from '../lib/storey.js';
import { cleanLabel } from '../lib/labels.js';

// Certification-queue status pill + next-action routing (reskin slice 2).
const QGRID = '70px minmax(0,1.6fr) 80px 80px 80px 104px 86px';
const QST = {
  gap: { c: '#6e6e73', label: 'Not linked' },
  missing: { c: COL.gold, label: 'Missing WIR' },
  ncr: { c: COL.blocked, label: 'NCR hold' },
  review: { c: COL.accent, label: 'In review' },
};
const QACTION = {
  gap: { route: 'qs', label: 'Link' },
  missing: { route: 'wirs', label: 'Raise WIR' },
  ncr: { route: 'ncrs', label: 'Resolve' },
  review: { route: 'wirs', label: 'Review' },
};
function QStatus({ status }) {
  const s = QST[status] || QST.review;
  return <span className="mono text-[9px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap" style={{ color: s.c, background: `${s.c}14` }}>{s.label}</span>;
}

const wirTone = (s) => /approv|pass|closed|certif/i.test(s || '') ? COL.certified : /reject|fail|ncr/i.test(s || '') ? COL.blocked : COL.accent;

// Evidence drawer (reskin slice 3) — the selected line's real evidence: figures,
// the quantity rule, the WIRs actually linked to it (by boq_item_id or element),
// NCR/hold from the status map, and next-action + deep-links. Read-only; defensive.
function EvidenceDrawer({ sel, onClose, allWirs, statusMap, onNavigate }) {
  useEffect(() => {
    if (!sel) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sel, onClose]);
  if (!sel) return null;
  const guidSet = new Set(sel.guids || []);
  const wirs = (allWirs || []).filter((w) => w && (w.boq_item_id === sel.id || (w.element_guid && guidSet.has(w.element_guid))));
  const ncrCount = (sel.guids || []).filter((g) => statusMap?.[g]?.key === 'ncr').length;
  const figs = [['BoQ qty', sel.qty, COL.text], ['Approved WIR', sel.approved, COL.text], ['Certified', sel.certified, COL.certified]];
  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(15,23,42,0.28)' }} onClick={onClose} />
      <aside className="fixed inset-y-0 end-0 z-50 w-full sm:w-[380px] overflow-y-auto" style={{ background: COL.surface, borderInlineStart: `1px solid ${COL.border}`, boxShadow: '-12px 0 40px -16px rgba(16,24,40,0.3)' }}>
        <div className="sticky top-0 px-5 py-3.5 border-b flex items-start justify-between gap-3" style={{ background: COL.surface, borderColor: COL.border }}>
          <div className="min-w-0">
            <div className="mono text-[11px]" style={{ color: COL.accent }}>BoQ {sel.code}</div>
            <div className="text-[14px] font-bold leading-tight mt-0.5 truncate" style={{ color: COL.text }}>{sel.desc}</div>
          </div>
          <button onClick={onClose} className="shrink-0 w-7 h-7 grid place-items-center rounded-lg" style={{ background: COL.bg, border: `1px solid ${COL.border}`, color: COL.textDim }} aria-label="Close">
            <X size={15} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div><QStatus status={sel.status} /></div>
          <div className="grid grid-cols-3 gap-2">
            {figs.map(([l, v, c]) => (
              <div key={l} className="rounded-lg p-2.5" style={{ background: COL.bg, border: `1px solid ${COL.border}` }}>
                <div className="mono text-[8.5px] tracking-[0.1em] uppercase" style={{ color: COL.textMute }}>{l}</div>
                <div className="mono text-[13px] font-bold mt-0.5" dir="ltr" style={{ color: v > 0 ? c : COL.textMute }}>{v > 0 ? fmt(v) : '—'}</div>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2 rounded-lg px-3 py-2.5" style={{ background: 'rgba(180,83,9,0.06)', border: '1px solid rgba(180,83,9,0.2)' }}>
            <ShieldAlert size={14} className="mt-0.5 shrink-0" style={{ color: COL.gold }} />
            <span className="text-[12px] leading-snug" style={{ color: COL.text }}>Certified quantity cannot exceed the approved WIR quantity.</span>
          </div>
          <div>
            <div className="mono text-[9px] tracking-[0.12em] uppercase mb-2" style={{ color: COL.textMute }}>Linked WIRs ({wirs.length})</div>
            {wirs.length === 0 ? (
              <div className="text-[12px]" style={{ color: COL.textMute }}>No WIRs linked to this line yet.</div>
            ) : (
              <div className="space-y-1.5">
                {wirs.slice(0, 6).map((w) => (
                  <button key={w.id} onClick={() => onNavigate('wirs')} className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-start" style={{ background: COL.bg, borderColor: COL.border }}>
                    <div className="min-w-0">
                      <div className="mono text-[11px] font-semibold" style={{ color: COL.accent }}>{w.wir_number || `WIR-${String(w.id).slice(-4)}`}</div>
                      {w.inspection_type && <div className="text-[10px] truncate" style={{ color: COL.textDim }}>{w.inspection_type}</div>}
                    </div>
                    <span className="mono text-[9px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap" style={{ color: wirTone(w.status), background: `${wirTone(w.status)}14` }}>{w.status || '—'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-[12px]" style={{ color: ncrCount > 0 ? COL.blocked : COL.certified }}>
            {ncrCount > 0 ? <AlertOctagon size={13} /> : <ClipboardCheck size={13} />} {ncrCount > 0 ? `${ncrCount} open NCR${ncrCount === 1 ? '' : 's'} on this line` : 'No open NCRs on this line'}
          </div>
          <div className="pt-3 border-t space-y-2" style={{ borderColor: COL.border }}>
            <button onClick={() => onNavigate((QACTION[sel.status] || QACTION.review).route)} className="w-full py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: COL.accent }}>{(QACTION[sel.status] || QACTION.review).label} →</button>
            <div className="flex gap-2">
              <button onClick={() => onNavigate('dms')} className="flex-1 py-1.5 rounded-lg text-[11.5px] font-medium border" style={{ borderColor: COL.border, color: COL.textDim }}>Documents</button>
              <button onClick={() => onNavigate('approvals')} className="flex-1 py-1.5 rounded-lg text-[11.5px] font-medium border" style={{ borderColor: COL.border, color: COL.textDim }}>Approvals</button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

// ============================================================
// DASHBOARD — Project Control view. Real data: model-linked %, certifiable
// value (from element status flowing through BOQ links), blocked-by-NCR,
// open WIRs, BoQ gaps, a certification pipeline, zone readiness by storey,
// and an auto-prioritised "attention today" + next-actions queue.
// ============================================================
export function DashboardView({ t, lang, finance, counts, onNavigate }) {
  const { project } = useProject();
  const { elements } = useElements();
  const sample = isSampleProject();
  const [lists, setLists] = useState({ pending: [], recent: [] });
  const [model, setModel] = useState({ s: {}, l: [], b: [] }); // statusMap, links, boq
  const [allWirs, setAllWirs] = useState([]); // for the certification-queue evidence drawer
  const [sel, setSel] = useState(null);       // selected queue line (opens the drawer)
  const isMobile = useIsMobile();
  const [showAllKpi, setShowAllKpi] = useState(false);
  const [gsVisible, setGsVisible] = useState(false);

  useEffect(() => {
    let active = true;
    loadDashboardLists().then((l) => active && setLists(l)).catch(() => {});
    listWirs().then((w) => active && setAllWirs(Array.isArray(w) ? w : [])).catch(() => {});
    Promise.all([loadElementStatusMap(), listAllLinks(), listBoqItems()])
      .then(([s, l, b]) => active && setModel({ s, l, b }))
      .catch(() => active && setModel({ s: {}, l: [], b: [] }));
    return () => { active = false; };
  }, []);

  // --- derive everything from real data ---
  const derived = useMemo(() => {
    const { s: statusMap, l: links, b: boq } = model;
    const elsTotal = counts.totalElements > 0 ? counts.totalElements : elements.length;
    const linkedSet = new Set(links.map((x) => x.element_guid));
    boq.forEach((x) => { if (x.element_id) linkedSet.add(x.element_id); });
    const linkedCount = linkedSet.size;

    const guidsByBoq = {};
    links.forEach((x) => { (guidsByBoq[x.boq_item_id] = guidsByBoq[x.boq_item_id] || new Set()).add(x.element_guid); });
    boq.forEach((x) => { if (x.element_id) (guidsByBoq[x.id] = guidsByBoq[x.id] || new Set()).add(x.element_id); });

    let certifiable = 0;
    // Certifiable follows the stored approved_qty (approved-WIR quantity, capped
    // at contract) — the same source as QS, finance and the IPC — NOT a count
    // share of the contract (which over-certified on linking).
    boq.forEach((b) => { certifiable += Math.min(Number(b.qty || 0), Math.max(0, Number(b.approved_qty || 0))) * Number(b.rate || 0); });
    const boqValue = boq.reduce((s, b) => s + Number(b.qty || 0) * Number(b.rate || 0), 0);
    const certifiedPct = boqValue ? Math.round((certifiable / boqValue) * 100) : 0;
    const boqGaps = boq.filter((b) => !(guidsByBoq[b.id]?.size)).length;
    const modelLinkedPct = elsTotal ? Math.round((linkedCount / elsTotal) * 100) : 0;

    // zone readiness by storey/level
    const byLevel = {};
    elements.forEach((e) => {
      const lv = e.level || 'Unassigned';
      const z = byLevel[lv] = byLevel[lv] || { total: 0, linked: 0, clear: 0, blocked: 0 };
      z.total++;
      if (linkedSet.has(e.guid)) z.linked++;
      const st = statusMap[e.guid];
      if (st?.clear) z.clear++;
      if (st?.key === 'ncr') z.blocked++;
    });
    const zones = Object.entries(byLevel)
      .sort((a, b) => (a[0] === 'Unassigned' ? 1 : b[0] === 'Unassigned' ? -1 : a[0].localeCompare(b[0], undefined, { numeric: true })))
      .slice(0, 5)
      .map(([name, z]) => ({ name, ...z }));

    // Certification queue — BoQ lines requiring action, from real state only
    // (reskin slice 2). Status maps to what this view's data can honestly prove:
    // not-linked, missing-WIR (no approved qty), NCR-held, or in-review.
    const SEV = { ncr: 0, missing: 1, gap: 2, review: 3 };
    const queue = boq.map((b) => {
      const linked = (guidsByBoq[b.id]?.size || 0) > 0;
      const qty = Number(b.qty || 0);
      const approved = Math.max(0, Number(b.approved_qty || 0));
      const certified = Math.min(qty, approved);
      let hasNcr = false;
      guidsByBoq[b.id]?.forEach((g) => { if (statusMap[g]?.key === 'ncr') hasNcr = true; });
      let status;
      if (!linked) status = 'gap';
      else if (hasNcr) status = 'ncr';
      else if (approved <= 0) status = 'missing';
      else if (certified > 0) status = 'ready';
      else status = 'review';
      return { id: b.id, code: b.code || '—', desc: b.description || b.desc || '—', unit: b.unit || '', qty, approved, certified, status, guids: Array.from(guidsByBoq[b.id] || []) };
    }).filter((r) => r.status !== 'ready').sort((a, c) => SEV[a.status] - SEV[c.status]).slice(0, 8);

    return { elsTotal, linkedCount, modelLinkedPct, certifiable, certifiedPct, boqGaps, zones, queue, hasModel: elsTotal > 0, boqCount: boq.length };
  }, [model, elements, counts.totalElements]);

  // Certification pipeline (real finance figures; bar normalises to segment sum)
  const pipeline = [
    { label: 'Pending BoQ', value: Math.max(0, finance.pendingValue || 0), color: '#94a3b8' },
    { label: 'Certifiable', value: Math.max(0, derived.certifiable || 0), color: '#3b82f6' },
    { label: 'Approved', value: Math.max(0, finance.approvedValue || 0), color: '#22c55e' },
    { label: 'Certified IPC', value: Math.max(0, finance.certifiedIpc || 0), color: '#a855f7' },
    { label: 'Paid', value: Math.max(0, finance.paidInvoices || 0), color: '#0f766e' },
  ];
  const pipeTotal = pipeline.reduce((s, x) => s + x.value, 0) || 1;
  const approvalRate = (finance.total || 0) > 0 ? Math.round(((finance.approvedValue || 0) / finance.total) * 100) : 0;

  // Auto-prioritised "attention today"
  const attention = [];
  if (counts.openNcrs > 0) attention.push({ dot: '#dc2626', title: 'NCRs blocking certification', meta: `${counts.openNcrs} open NCR${counts.openNcrs === 1 ? '' : 's'}${finance.blockedValue > 0 ? ` · SAR ${fmt(finance.blockedValue)} at risk` : ''}`, route: 'ncrs', cta: 'Open NCRs' });
  if (derived.boqGaps > 0) attention.push({ dot: '#d97706', title: 'BoQ lines missing model linkage', meta: `${derived.boqGaps} line${derived.boqGaps === 1 ? '' : 's'} can't be certified until linked`, route: 'qs', cta: 'Fix linkage' });
  if (counts.openWirs > 0) attention.push({ dot: '#d97706', title: 'Open inspections', meta: `${counts.openWirs} WIR${counts.openWirs === 1 ? '' : 's'} awaiting sign-off`, route: 'wirs', cta: 'Review WIRs' });
  if (derived.certifiable > 0) attention.push({ dot: '#2563eb', title: 'Ready to certify', meta: `SAR ${fmt(derived.certifiable)} of inspected scope can move to an IPC`, route: 'ipcs', cta: 'Create IPC' });
  if (attention.length === 0) attention.push({ dot: '#16a34a', title: 'All clear', meta: 'No blocking items right now.', route: null });

  const projName = lang === 'ar' ? (project.nameAr || project.name) : project.name;
  // True when this project has no element↔BoQ links yet — so every readiness
  // figure is legitimately 0. We show guidance instead of a wall of 0% bars.
  const noLinkedData = derived.linkedCount === 0;

  const health = [
    { label: 'Model linked', value: derived.hasModel ? `${derived.modelLinkedPct}%` : '—', sub: derived.hasModel ? `${derived.linkedCount} / ${derived.elsTotal} elements linked` : 'No model uploaded yet', tone: COL.accent, icon: Link2 },
    { label: 'Certifiable', value: fmtMoney(derived.certifiable), sub: 'Inspected & clear scope', tone: '#16a34a', icon: Receipt },
    { label: 'Blocked by NCR', value: fmtMoney(finance.blockedValue), sub: `${counts.openNcrs || 0} open NCRs`, tone: (finance.blockedValue > 0 || counts.openNcrs > 0) ? '#dc2626' : '#16a34a', icon: AlertOctagon },
    { label: 'Open WIRs', value: counts.totalWirs > 0 ? counts.openWirs : '—', sub: counts.totalWirs > 0 ? 'Awaiting consultant' : 'No WIRs yet', tone: '#d97706', icon: ClipboardCheck },
    { label: 'BoQ gaps', value: derived.boqCount > 0 ? derived.boqGaps : '—', sub: derived.boqCount > 0 ? 'Lines with no element' : 'No BoQ yet', tone: '#d97706', icon: FileText },
    { label: 'Certified', value: derived.boqCount > 0 ? `${derived.certifiedPct}%` : '—', sub: derived.boqCount > 0 ? 'of contract value' : 'No BoQ yet', tone: '#7c3aed', icon: Flag },
  ];

  // Deterministic commercial advisory for this page (read-only — flags, never certifies).
  const advCtx = {
    lang,
    project: { name: projName, isGovernmentProject: /gov|etimad|public/i.test(project.client_type || project.clientType || project.client || '') },
    currentPage: { route: 'dashboard', name: 'Dashboard' },
    counts,
    finance: { ...finance, certifiable: derived.certifiable, blockedValue: finance.blockedValue },
  };
  const advSummary = advisorySummary(runAdvisories(advCtx), advCtx);

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: COL.bg }}>
      <PageHeader
        title={`${t.dashboard}`}
        subtitle={`${cleanLabel(project.contractor) ? cleanLabel(project.contractor) + ' · ' : ''}${lang === 'ar' ? project.nameAr || project.name : project.name}`}
        actions={<><Btn icon={Download} variant="secondary" onClick={() => window.print()}>{t.exportPdf}</Btn><Btn icon={Box} variant="secondary" onClick={() => onNavigate('model')}>Open in 3D</Btn><NewMenu onNavigate={onNavigate} t={t} /></>}
      />

      <div className="p-6 space-y-5">
        {/* page-aware commercial advisory — from the deterministic engine */}
        <div className="app-rise"><AiAdvisory variant="panel" lang={lang} pageName="Dashboard" summary={advSummary} /></div>

        {/* Certification status — flat white header (no gradient). Which project,
            how much is certifiable right now, and the money pipeline. Same real
            computed values as the cards below. Reskin slice 1: control-room tone. */}
        <div className="app-rise rounded-2xl border p-5 sm:p-6" style={{ background: COL.surface, borderColor: COL.border }}>
          <div className="flex items-center gap-2 min-w-0">
            <Building2 size={14} className="flex-shrink-0" style={{ color: COL.textMute }} />
            <span className="text-[12px] font-semibold truncate" style={{ color: COL.text }}>{projName}</span>
            {cleanLabel(project.client) && <span className="text-[11.5px] truncate hidden sm:inline" style={{ color: COL.textMute }}>· {cleanLabel(project.client)}</span>}
            <button onClick={() => onNavigate('home')} className="ms-auto text-[11.5px] font-semibold flex-shrink-0 px-2.5 py-1 rounded-full border transition-colors hover:bg-black/[0.03]" style={{ borderColor: COL.borderStrong, color: COL.textDim }}>Switch →</button>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-x-10 gap-y-3">
            <div>
              <div className="mono text-[10px] tracking-[0.1em] uppercase font-medium" style={{ color: COL.textMute }}>Certifiable now</div>
              <div className="display font-bold tracking-tight leading-none mt-1.5" style={{ fontSize: 'clamp(28px,3.4vw,38px)', color: COL.text }}>
                {derived.certifiable > 0 ? fmtMoney(derived.certifiable) : <span style={{ color: COL.textMute }}>SAR 0</span>}
              </div>
            </div>
            <div className="pb-0.5">
              <div className="mono text-[10px] tracking-[0.1em] uppercase font-medium" style={{ color: COL.textMute }}>Certified IPC</div>
              <div className="mono text-[20px] font-bold tracking-tight leading-none mt-1.5" style={{ color: COL.certified }}>{fmtMoney(finance.certifiedIpc)}</div>
            </div>
            <div className="pb-0.5">
              <div className="mono text-[10px] tracking-[0.1em] uppercase font-medium" style={{ color: COL.textMute }}>Approved</div>
              <div className="mono text-[20px] font-bold tracking-tight leading-none mt-1.5" style={{ color: COL.text }}>{fmtMoney(finance.approvedValue)}</div>
            </div>
            <span className="mono text-[10px] px-2.5 py-1 rounded-full font-bold ms-auto self-start" style={{ background: COL.blueSoft, color: COL.blueHi }}>{approvalRate}% approved</span>
          </div>
          <div className="h-2 w-full rounded-full overflow-hidden flex mt-5" style={{ background: COL.surfaceAlt }}>
            {pipeline.map((p) => <div key={p.label} title={`${p.label}: SAR ${fmt(p.value)}`} style={{ width: `${(p.value / pipeTotal) * 100}%`, background: p.color, transition: 'width .5s cubic-bezier(.22,1,.36,1)' }} />)}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
            {pipeline.map((p) => (
              <span key={p.label} className="inline-flex items-center gap-1.5 text-[10.5px]" style={{ color: COL.textDim }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />{p.label}
              </span>
            ))}
          </div>
        </div>

        {/* New-user path — five steps, derived from real project state. */}
        <GettingStarted lang={lang} onNavigate={onNavigate} onVisibilityChange={setGsVisible}
          signals={{ boqCount: derived.boqCount, hasModel: derived.hasModel, linkedCount: derived.linkedCount, totalWirs: counts.totalWirs, certifiable: derived.certifiable, approvedValue: finance.approvedValue, certifiedIpc: finance.certifiedIpc }} />

        {/* No linked data yet → clear guidance, not a silent wall of 0% bars. */}
        {noLinkedData && !gsVisible && (
          <div className="app-rise rounded-2xl border p-4 flex items-start gap-3" style={{ background: COL.surface, borderColor: COL.border }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: COL.accentBg }}><Link2 size={18} style={{ color: COL.accent }} /></div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold" style={{ color: COL.text }}>No linked elements yet</div>
              <div className="text-[12.5px] mt-0.5 leading-relaxed" style={{ color: COL.textDim }}>
                {derived.hasModel
                  ? `This project has ${derived.elsTotal.toLocaleString()} model element${derived.elsTotal === 1 ? '' : 's'}, but none are linked to BoQ yet — so readiness and certifiable value are 0. Link elements to BoQ to populate the dashboard.`
                  : 'Upload a BIM model and add BoQ lines, then link elements to BoQ — readiness and certifiable value will populate automatically.'}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button onClick={() => onNavigate('qs')} className="text-[12px] font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: COL.accent }}>Link elements to BoQ</button>
                {!derived.hasModel && <button onClick={() => onNavigate('model')} className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border" style={{ borderColor: COL.borderStrong, color: COL.text }}>Upload model</button>}
              </div>
            </div>
          </div>
        )}

        <ProjectModelCard onNavigate={onNavigate} />

        {/* Health strip — on mobile show the top 3, the rest behind "View all metrics" */}
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {(isMobile && !showAllKpi ? health.slice(0, 3) : health).map((h, i) => (
              <div key={h.label} className="app-rise" style={{ animationDelay: `${i * 0.05}s` }}>
                <KpiCard label={h.label} value={h.value} accent={h.tone} hint={h.sub} icon={h.icon} />
              </div>
            ))}
          </div>
          {isMobile && (
            <button onClick={() => setShowAllKpi((v) => !v)} className="mt-2 w-full flex items-center justify-center gap-1 py-2 text-[13px] font-medium rounded-lg border" style={{ borderColor: COL.border, color: COL.accent, background: COL.surface }}>
              {showAllKpi ? 'Show fewer' : `View all metrics (${health.length})`}<ChevronDown size={14} style={{ transform: showAllKpi ? 'rotate(180deg)' : 'none' }} />
            </button>
          )}
        </div>

        {/* Certification queue — BoQ lines requiring action (reskin slice 2).
            Real per-line state from loaded BoQ data; the control room's main table. */}
        {derived.boqCount > 0 && !noLinkedData && derived.queue.length > 0 && (
          <div className="app-rise rounded-2xl border overflow-hidden" style={{ background: COL.surface, borderColor: COL.border, animationDelay: '0.24s' }}>
            <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: COL.border }}>
              <div><div className="display text-base font-bold">Certification queue</div><div className="text-xs" style={{ color: COL.textDim }}>BoQ lines requiring action before they can be certified.</div></div>
              <span className="mono text-[10px] px-2 py-1 rounded font-bold" style={{ background: COL.surfaceAlt, color: COL.textDim }}>{derived.queue.length} line{derived.queue.length === 1 ? '' : 's'}</span>
            </div>
            <div className="overflow-x-auto">
              <div className="grid gap-2 px-5 py-2 mono text-[9px] tracking-[0.06em] uppercase" style={{ gridTemplateColumns: QGRID, color: COL.textMute, borderBottom: `1px solid ${COL.border}`, background: COL.bg, minWidth: 660 }}>
                <span>BoQ</span><span>Description</span><span className="text-end">BoQ qty</span><span className="text-end">Appr. WIR</span><span className="text-end">Certified</span><span className="text-end">Status</span><span className="text-end">Action</span>
              </div>
              {derived.queue.map((r) => (
                <div key={r.id} onClick={() => setSel(r)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(r); } }} className="grid gap-2 items-center px-5 py-2.5 transition-colors cursor-pointer hover:bg-black/[0.02] outline-none focus-visible:ring-2 focus-visible:ring-inset" style={{ gridTemplateColumns: QGRID, borderBottom: `1px solid ${COL.border}`, minWidth: 660, background: sel?.id === r.id ? COL.accentBg : undefined, '--tw-ring-color': COL.accent }}>
                  <span className="mono text-[11px]" style={{ color: COL.accent }}>{r.code}</span>
                  <span className="text-[12.5px] font-medium truncate" style={{ color: COL.text }}>{r.desc}</span>
                  <span className="mono text-[11.5px] text-end" dir="ltr" style={{ color: COL.textDim }}>{fmt(r.qty)}{r.unit ? ` ${r.unit}` : ''}</span>
                  <span className="mono text-[11.5px] text-end" dir="ltr" style={{ color: COL.text }}>{r.approved > 0 ? fmt(r.approved) : '—'}</span>
                  <span className="mono text-[11.5px] text-end font-bold" dir="ltr" style={{ color: r.certified > 0 ? COL.certified : COL.textMute }}>{r.certified > 0 ? fmt(r.certified) : '—'}</span>
                  <span className="text-end"><QStatus status={r.status} /></span>
                  <span className="text-end"><button onClick={(e) => { e.stopPropagation(); onNavigate(QACTION[r.status].route); }} className="mono text-[10.5px] font-semibold whitespace-nowrap" style={{ color: COL.accent }}>{QACTION[r.status].label} →</button></span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Attention + pipeline */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="app-rise rounded-2xl border p-5" style={{ background: COL.surface, borderColor: COL.border, animationDelay: '0.30s' }}>
            <div className="flex items-center justify-between mb-3">
              <div><div className="display text-base font-bold">Attention today</div><div className="text-xs" style={{ color: COL.textDim }}>Items blocking progress, payment or compliance.</div></div>
              <span className="mono text-[10px] px-2 py-1 rounded font-bold" style={{ background: attention[0].route ? COL.danger || '#fee2e2' : '#dcfce7', color: attention.some((a) => a.route) ? '#b91c1c' : '#15803d' }}>{attention.filter((a) => a.route).length} items</span>
            </div>
            <div className="space-y-2.5">
              {attention.map((a, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl border" style={{ background: COL.bg, borderColor: COL.border }}>
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: a.dot }} />
                  <div className="flex-1 min-w-0"><div className="text-sm font-semibold">{a.title}</div><div className="text-[12px]" style={{ color: COL.textDim }}>{a.meta}</div></div>
                  {a.route && <button onClick={() => onNavigate(a.route)} className="text-[13px] font-bold flex-shrink-0" style={{ color: COL.accent }}>{a.cta} →</button>}
                </div>
              ))}
            </div>
          </div>

          <div className="app-rise rounded-2xl border p-5" style={{ background: COL.surface, borderColor: COL.border, animationDelay: '0.36s' }}>
            <div className="flex items-center justify-between mb-3">
              <div><div className="display text-base font-bold">Certification pipeline</div><div className="text-xs" style={{ color: COL.textDim }}>Pending → certifiable → approved → certified → paid.</div></div>
              <span className="mono text-[10px] px-2 py-1 rounded font-bold" style={{ background: '#dcfce7', color: '#15803d' }}>{approvalRate}% approved</span>
            </div>
            <div className="h-4 w-full rounded-full overflow-hidden flex mb-3" style={{ background: '#e2e8f0' }}>
              {pipeline.map((p) => <div key={p.label} title={`${p.label}: SAR ${fmt(p.value)}`} style={{ width: `${(p.value / pipeTotal) * 100}%`, background: p.color, transition: 'width .5s cubic-bezier(.22,1,.36,1)' }} />)}
            </div>
            <div className="space-y-2">
              {pipeline.map((p) => (
                <div key={p.label} className="flex items-center gap-2 text-sm">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.color }} />
                  <span className="flex-1" style={{ color: COL.text }}>{p.label}</span>
                  <span className="mono font-semibold" style={{ color: p.value > 0 ? COL.text : COL.textMute }}>{p.value > 0 ? `SAR ${fmt(p.value)}` : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Zone readiness (by storey) + Next actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="app-rise rounded-2xl border p-5" style={{ background: COL.surface, borderColor: COL.border, animationDelay: '0.42s' }}>
            <div className="display text-base font-bold mb-1">Zone readiness</div>
            <div className="text-[10px] mb-3" style={{ color: COL.textMute }}>By storey · linked / clear-to-certify / blocked</div>
            {!derived.hasModel ? (
              <div className="text-xs py-6 text-center" style={{ color: COL.textMute }}>Upload a BIM model to see readiness by storey.</div>
            ) : noLinkedData ? (
              <div className="text-xs py-6 text-center px-4 leading-relaxed" style={{ color: COL.textMute }}>
                No elements linked to BoQ yet, so there’s no readiness to show.{' '}
                <button onClick={() => onNavigate('qs')} className="font-semibold underline" style={{ color: COL.accent }}>Link elements to BoQ</button> to populate this.
              </div>
            ) : (
              <div className="space-y-3">
                {derived.zones.map((z) => (
                  <div key={z.name} className="p-3 rounded-xl border" style={{ background: COL.bg, borderColor: COL.border }}>
                    <div className="flex items-center justify-between mb-2"><strong className="text-sm">{normalizeStorey(z.name)}</strong><span className="mono text-[11px]" style={{ color: COL.textDim }}>{z.total} elements</span></div>
                    {[['Linked', z.linked, COL.accent], ['Clear', z.clear, '#22c55e'], ['Blocked', z.blocked, '#dc2626']].map(([lbl, n, c]) => {
                      const pct = z.total ? Math.round((n / z.total) * 100) : 0;
                      return (
                        <div key={lbl} className="grid items-center gap-2 mb-1.5" style={{ gridTemplateColumns: '64px 1fr 36px' }}>
                          <span className="text-[12px]" style={{ color: COL.textDim }}>{lbl}</span>
                          <div className="h-2 rounded-full overflow-hidden" style={{ background: COL.surfaceAlt }}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: c, transition: 'width .5s cubic-bezier(.22,1,.36,1)' }} /></div>
                          <span className="mono text-[11px] text-end" style={{ color: COL.textDim }}>{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="app-rise rounded-2xl border" style={{ background: COL.surface, borderColor: COL.border, animationDelay: '0.48s' }}>
            <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: COL.border }}>
              <div className="display text-base font-bold">Next actions</div>
              <button onClick={() => onNavigate('approvals')} className="text-[13px] font-bold" style={{ color: COL.accent }}>{counts.pendingApprovals || 0} →</button>
            </div>
            <div className="divide-y" style={{ borderColor: COL.border }}>
              {lists.pending.length === 0 && <div className="px-5 py-8 text-center text-xs" style={{ color: COL.textMute }}>Nothing pending. Add records to see them here.</div>}
              {lists.pending.map((it, i) => (
                <div key={i} className="px-5 py-3 hover:bg-stone-50 cursor-pointer flex items-center gap-3"
                  onClick={() => onNavigate(it.type === 'NCR' ? 'ncrs' : it.type === 'Drawing' ? 'drawings' : it.type === 'IPC' ? 'ipcs' : 'wirs')}>
                  <span className="mono text-[9px] px-1.5 py-0.5 rounded font-bold flex-shrink-0" style={{ background: COL.surfaceAlt, color: COL.textDim }}>{it.type}</span>
                  <div className="flex-1 min-w-0"><div className="mono text-[11px] font-semibold" style={{ color: COL.accent }}>{it.id}</div><div className="text-[11px] mt-0.5 truncate" style={{ color: COL.text }}>{it.desc}</div></div>
                  {it.priority === 'Critical' && <span className="mono text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0" style={{ background: '#fecaca', color: '#991b1b' }}>Critical</span>}
                  {it.priority === 'High' && <span className="mono text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0" style={{ background: '#fef3c7', color: '#b45309' }}>High</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <EvidenceDrawer sel={sel} onClose={() => setSel(null)} allWirs={allWirs} statusMap={model.s} onNavigate={onNavigate} />
    </div>
  );
}

// Context-correct "New" — menu instead of hard-jumping to WIR.
function NewMenu({ onNavigate, t }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const items = [
    { route: 'home', label: 'New project', icon: FolderPlus, primary: true },
    { route: 'wirs', label: 'New WIR', icon: ClipboardCheck },
    { route: 'qc', label: 'New QC test', icon: FlaskConical },
    { route: 'ncrs', label: 'New NCR', icon: AlertOctagon },
    { route: 'snagging', label: 'New snag', icon: Flag },
    { route: 'drawings', label: 'New drawing', icon: FileImage },
    { route: 'dms', label: 'New document', icon: FileText },
    { route: 'ipcs', label: 'New IPC', icon: Receipt },
  ];
  return (
    <div className="relative" ref={ref}>
      <Btn icon={Plus} variant="primary" onClick={() => setOpen((o) => !o)}>{t.new}<ChevronDown size={13} className="ml-0.5" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }} /></Btn>
      {open && (
        <div className="absolute right-0 mt-1.5 w-52 rounded-xl border shadow-lg z-20 py-1.5 overflow-hidden" style={{ background: COL.surface, borderColor: COL.border }}>
          {items.map((it) => { const Icon = it.icon; return (
            <div key={it.route}>
              <button onClick={() => { setOpen(false); onNavigate(it.route); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left hover:bg-stone-50 transition" style={{ color: it.primary ? COL.accent : COL.text, fontWeight: it.primary ? 600 : 400 }}><Icon size={15} style={{ color: it.primary ? COL.accent : COL.textDim }} />{it.label}</button>
              {it.primary && <div className="my-1 border-t" style={{ borderColor: COL.border }} />}
            </div>
          ); })}
        </div>
      )}
    </div>
  );
}
