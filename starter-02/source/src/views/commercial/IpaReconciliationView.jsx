// ============================================================
// IpaReconciliationView (route 'ipa-reconciliation') — "Certified Value Gap".
// A QS/commercial cash-recovery cockpit: classify every reported-vs-certified gap,
// route the recoverable portion to an owner + action + target IPA, and quarantine
// what's genuinely lost. See docs/ipa-reconciliation-module-spec.md.
//
// FRONTEND DISPLAY ONLY — DEMO DATA. No money logic, no backend, no Supabase.
// Certified values are imported/demo, flagged is_backend_derived=false throughout.
// WIR approval ≠ payment certification. Model-optional (lines anchor on activity +
// resource + BOQ). AI is not involved and never moves money.
// ============================================================
import { useMemo, useState } from 'react';
import {
  Scale, FileWarning, Lock, ExternalLink, Upload, X, Filter, ArrowRight,
  Check, ClipboardList, FileSpreadsheet, ShieldAlert,
} from 'lucide-react';
import { PageHeader, Btn } from '../../components/primitives.jsx';
import { StyledSelect } from '../../components/StyledSelect.jsx';
import { fmt } from '../../lib/format.js';
import { COL } from '../../lib/theme.js';
import {
  IPA_LINES, REASON_CODES, DISPOSITION_META, STATUS_META, PERIODS, NEXT_PERIOD,
  computeKpis, reasonBreakdown, actionForReason,
} from '../../lib/ipaReconciliationData.js';

const money = (n) => `SAR ${fmt(Math.round(Number(n) || 0))}`;
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(Math.round(n)));

// ── tiny shared bits ────────────────────────────────────────
function Chip({ label, color, soft }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ background: soft || COL.surfaceAlt, color: color || COL.textDim }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color || COL.textMute }} />{label}
    </span>
  );
}
const DispChip = ({ d }) => <Chip label={DISPOSITION_META[d]?.label || d} color={DISPOSITION_META[d]?.color} soft={DISPOSITION_META[d]?.soft} />;
const StatusChip = ({ s }) => <Chip label={STATUS_META[s]?.label || s} color={STATUS_META[s]?.color} soft={COL.surfaceAlt} />;

function KV({ k, v, mono }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[12.5px] py-0.5">
      <span style={{ color: COL.textDim }}>{k}</span>
      <span className={mono ? 'mono font-medium text-end' : 'font-medium text-end'} style={{ color: COL.text }}>{v ?? '—'}</span>
    </div>
  );
}

function DemoBadge() {
  return <span className="mono text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: COL.pendingSoft, color: COL.pending }}>is_backend_derived = false</span>;
}

// ── KPI strip ───────────────────────────────────────────────
function Kpi({ label, value, tone, sub }) {
  return (
    <div className="rounded-xl border px-3 py-2.5 min-w-0" style={{ borderColor: COL.border, background: COL.surface }}>
      <div className="text-[10.5px] uppercase tracking-wide font-medium truncate" style={{ color: COL.textMute }}>{label}</div>
      <div className="mono text-[15px] font-bold mt-0.5 truncate" style={{ color: tone || COL.text }} dir="ltr">{value}</div>
      {sub && <div className="text-[10px] mt-0.5 truncate" style={{ color: COL.textMute }}>{sub}</div>}
    </div>
  );
}

// ── the module ──────────────────────────────────────────────
export function IpaReconciliationView() {
  const [tab, setTab] = useState('dashboard');
  const [sel, setSel] = useState(null);
  const kpis = useMemo(() => computeKpis(), []);
  const breakdown = useMemo(() => reasonBreakdown(), []);

  const TABS = [
    ['dashboard', 'Certified Value Gap'],
    ['table', 'Reconciliation Table'],
    ['queue', 'Claim Recovery Queue'],
    ['snapshot', 'Monthly Snapshot'],
    ['import', 'Import Mapping'],
  ];

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: COL.bg }}>
      <PageHeader title="IPA Reconciliation" subtitle="Certified Value Gap · see exactly why reported progress has not become certified payment value" />

      <div className="px-6 pt-4">
        {/* non-negotiable trust banner */}
        <div className="rounded-lg px-3 py-2 flex items-start gap-2 text-[11.5px] mb-3" style={{ background: COL.pendingSoft, color: COL.pending }}>
          <ShieldAlert size={15} className="shrink-0 mt-0.5" />
          <span><b>Frontend reconciliation is display-only.</b> Certified values here are imported/demo (<span className="mono">is_backend_derived = false</span>) and must come from backend-enforced certification before this module can be considered production-authoritative. WIR approval justifies claimability — it does not set certified value.</span>
        </div>

        {/* sub-navigation */}
        <div className="flex gap-1 flex-wrap mb-4" role="tablist">
          {TABS.map(([k, lbl]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className="px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border transition-colors"
              style={tab === k ? { background: COL.accent, color: '#fff', borderColor: COL.accent } : { background: COL.surface, color: COL.textDim, borderColor: COL.border }}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 pb-8">
        {tab === 'dashboard' && <Dashboard kpis={kpis} breakdown={breakdown} onOpen={setSel} />}
        {tab === 'table' && <ReconTable onOpen={setSel} />}
        {tab === 'queue' && <RecoveryQueue onOpen={setSel} />}
        {tab === 'snapshot' && <Snapshot kpis={kpis} />}
        {tab === 'import' && <ImportWizard />}
      </div>

      <VarianceDrawer line={sel} onClose={() => setSel(null)} />
    </div>
  );
}

// ── 1 · Certified Value Gap Dashboard ───────────────────────
function Dashboard({ kpis, breakdown, onOpen }) {
  const maxReason = Math.max(...breakdown.map((r) => r.value), 1);
  // waterfall segments of reported value: certified + the positive-variance buckets
  const segs = [
    { label: 'Certified IPA', value: kpis.certified, color: '#15803d', soft: '#dcfce7' },
    { label: 'Recoverable gap', value: kpis.recoverable, color: DISPOSITION_META.recoverable.color },
    { label: 'Blocked gap', value: kpis.blocked, color: DISPOSITION_META.blocked.color },
    { label: 'Written-off gap', value: kpis.writtenOff, color: DISPOSITION_META.write_off.color },
  ];
  const segTotal = segs.reduce((a, s) => a + Math.max(0, s.value), 0) || 1;

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
        <Kpi label="Reported to date" value={money(kpis.reported)} />
        <Kpi label="Certified to date" value={money(kpis.certified)} tone="#15803d" />
        <Kpi label="Total variance" value={money(kpis.totalVariance)} tone={COL.accent} sub="reported − certified (base)" />
        <Kpi label="Recoverable" value={money(kpis.recoverable)} tone={DISPOSITION_META.recoverable.color} />
        <Kpi label="Blocked" value={money(kpis.blocked)} tone={DISPOSITION_META.blocked.color} />
        <Kpi label="Written off" value={money(kpis.writtenOff)} tone={DISPOSITION_META.write_off.color} />
        <Kpi label={`Next IPA forecast · ${NEXT_PERIOD}`} value={money(kpis.nextIpaForecast)} tone={DISPOSITION_META.recoverable.color} sub="recoverable + owned + targeted" />
      </div>

      {/* Variance waterfall */}
      <div className="rounded-xl border p-4" style={{ borderColor: COL.border, background: COL.surface }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-semibold" style={{ color: COL.text }}>Where reported progress went</div>
          <div className="mono text-[11px]" style={{ color: COL.textMute }}>Reported {money(kpis.reported)} → Certified {money(kpis.certified)}</div>
        </div>
        <div className="flex w-full h-6 rounded-md overflow-hidden border" style={{ borderColor: COL.border }}>
          {segs.map((s) => Math.max(0, s.value) > 0 && (
            <div key={s.label} title={`${s.label}: ${money(s.value)}`} className="h-full" style={{ width: `${(Math.max(0, s.value) / segTotal) * 100}%`, background: s.color }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
          {segs.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 text-[11.5px]">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
              <span style={{ color: COL.textDim }}>{s.label}</span>
              <span className="mono font-medium" style={{ color: COL.text }}>{money(s.value)}</span>
            </div>
          ))}
        </div>
        {kpis.overCertified > 0 && (
          <div className="mt-3 rounded-lg px-3 py-1.5 flex items-center gap-2 text-[11.5px]" style={{ background: DISPOSITION_META.review.soft, color: DISPOSITION_META.review.color }}>
            <FileWarning size={14} className="shrink-0" />
            Over-certified (certified &gt; reported): <b className="mono">{money(kpis.overCertified)}</b> — routed to commercial review, <b>not</b> counted as recoverable.
          </div>
        )}
      </div>

      {/* Reason-code breakdown */}
      <div className="rounded-xl border p-4" style={{ borderColor: COL.border, background: COL.surface }}>
        <div className="text-[13px] font-semibold mb-3" style={{ color: COL.text }}>Gap by reason code <span className="font-normal" style={{ color: COL.textMute }}>· by value, colored by disposition</span></div>
        <div className="space-y-2">
          {breakdown.map((r) => (
            <div key={r.code} className="flex items-center gap-3">
              <div className="w-48 shrink-0 text-[12px] truncate" style={{ color: COL.text }}>{r.code} <span style={{ color: COL.textMute }}>·{r.count}</span></div>
              <div className="flex-1 h-4 rounded" style={{ background: COL.surfaceAlt }}>
                <div className="h-full rounded" style={{ width: `${(r.value / maxReason) * 100}%`, background: DISPOSITION_META[r.disposition]?.color }} />
              </div>
              <div className="w-28 text-end mono text-[11.5px]" style={{ color: COL.text }}>{money(r.value)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 2 · IPA Reconciliation Table ────────────────────────────
const cell = 'px-3 py-2 text-[12px] whitespace-nowrap';
function ReconTable({ onOpen }) {
  const [disp, setDisp] = useState('all');
  const [reason, setReason] = useState('all');
  const [owner, setOwner] = useState('all');
  const [status, setStatus] = useState('all');
  const [target, setTarget] = useState('all');
  const [sign, setSign] = useState('all');

  const owners = [...new Set(IPA_LINES.map((l) => l.owner))];
  const targets = [...new Set(IPA_LINES.map((l) => l.targetIpa))];

  const rows = IPA_LINES.filter((l) =>
    (disp === 'all' || l.disposition === disp)
    && (reason === 'all' || l.reasonCode === reason)
    && (owner === 'all' || l.owner === owner)
    && (status === 'all' || l.status === status)
    && (target === 'all' || l.targetIpa === target)
    && (sign === 'all' || l.sign === sign));

  const opt = (arr, allLabel) => [{ value: 'all', label: allLabel }, ...arr.map((v) => ({ value: v, label: v }))];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={14} style={{ color: COL.textMute }} />
        <div className="w-44"><StyledSelect ariaLabel="Disposition" value={disp} onChange={setDisp} options={opt(Object.keys(DISPOSITION_META).map((k) => k), 'All dispositions').map((o) => o.value === 'all' ? o : { value: o.value, label: DISPOSITION_META[o.value].label })} /></div>
        <div className="w-52"><StyledSelect ariaLabel="Reason" value={reason} onChange={setReason} options={opt(REASON_CODES.map((r) => r.code), 'All reason codes')} /></div>
        <div className="w-48"><StyledSelect ariaLabel="Owner" value={owner} onChange={setOwner} options={opt(owners, 'All owners')} /></div>
        <div className="w-44"><StyledSelect ariaLabel="Status" value={status} onChange={setStatus} options={opt(Object.keys(STATUS_META), 'All statuses').map((o) => o.value === 'all' ? o : { value: o.value, label: STATUS_META[o.value].label })} /></div>
        <div className="w-36"><StyledSelect ariaLabel="Target IPA" value={target} onChange={setTarget} options={opt(targets, 'All target IPAs')} /></div>
        <div className="w-40"><StyledSelect ariaLabel="Variance sign" value={sign} onChange={setSign} options={[{ value: 'all', label: 'Positive & negative' }, { value: 'positive', label: 'Positive (gap)' }, { value: 'negative', label: 'Negative (over-cert)' }]} /></div>
        <span className="mono text-[11px] ms-auto" style={{ color: COL.textMute }}>{rows.length} of {IPA_LINES.length} lines</span>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: COL.border, background: COL.surface }}>
        <div className="overflow-x-auto scrollbar">
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: COL.bg }}>
                {['Activity', 'Resource line', 'BOQ / CO', 'Reported', 'Certified', 'Variance', 'Reason', 'Disposition', 'Owner', 'Action', 'Target', 'Status', 'Derived'].map((h) => (
                  <th key={h} className="px-3 py-2 text-[11px] font-semibold text-start whitespace-nowrap" style={{ color: COL.textMute, borderBottom: `1px solid ${COL.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} onClick={() => onOpen(l)} className="cursor-pointer transition-colors hover:bg-black/[0.02]" style={{ borderBottom: `1px solid ${COL.border}` }}>
                  <td className={cell}><span className="mono text-[10.5px]" style={{ color: COL.textMute }}>{l.activityId}</span><div className="truncate max-w-[150px]" style={{ color: COL.text }}>{l.activityName}</div></td>
                  <td className={`${cell} truncate max-w-[180px]`} style={{ color: COL.text }}>{l.resourceLine}</td>
                  <td className={`${cell} mono text-[11px]`} style={{ color: COL.textDim }}>{l.boqRef}{l.coRef ? ` · ${l.coRef}` : ''}</td>
                  <td className={`${cell} mono text-end`} style={{ color: COL.text }} dir="ltr">{money(l.reported)}</td>
                  <td className={`${cell} mono text-end`} dir="ltr" style={{ color: '#15803d' }}>{money(l.certified)}</td>
                  <td className={`${cell} mono text-end font-semibold`} dir="ltr" style={{ color: l.variance < 0 ? DISPOSITION_META.review.color : COL.text }}>{signed(l.variance)}</td>
                  <td className={`${cell} truncate max-w-[150px]`} style={{ color: COL.textDim }}>{l.reasonCode}</td>
                  <td className={cell}><DispChip d={l.disposition} /></td>
                  <td className={`${cell} truncate max-w-[130px]`} style={{ color: COL.textDim }}>{l.owner}</td>
                  <td className={`${cell} truncate max-w-[160px]`} style={{ color: COL.textDim }}>{actionForReason(l.reasonCode)}</td>
                  <td className={`${cell} mono text-[11px]`} style={{ color: COL.textDim }}>{l.targetIpa}</td>
                  <td className={cell}><StatusChip s={l.status} /></td>
                  <td className={cell}><span className="mono text-[9.5px] px-1 py-0.5 rounded" style={{ background: COL.pendingSoft, color: COL.pending }}>false</span></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={13} className="px-3 py-8 text-center text-[12px]" style={{ color: COL.textMute }}>No lines match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── 3 · Claim Recovery Queue ────────────────────────────────
function RecoveryQueue({ onOpen }) {
  const recoverable = IPA_LINES
    .filter((l) => DISPOSITION_META[l.disposition]?.kind === 'recover' && l.variance > 0)
    .sort((a, b) => b.variance - a.variance);
  // group by required action
  const groups = {};
  for (const l of recoverable) {
    const g = actionForReason(l.reasonCode);
    (groups[g] ||= []).push(l);
  }
  const total = recoverable.reduce((a, l) => a + l.variance, 0);

  const readiness = (l) => l.status === 'ready_next_ipa' ? { t: 'Ready', c: '#0d9488' } : l.status === 'action_in_progress' ? { t: 'In progress', c: '#b45309' } : { t: 'Not started', c: COL.textMute };

  return (
    <div className="space-y-4">
      <div className="rounded-lg px-3 py-2 flex items-center justify-between text-[12px]" style={{ background: COL.surface, border: `1px solid ${COL.border}` }}>
        <span style={{ color: COL.textDim }}>Recoverable lines to chase before the next IPA, grouped by required action, ordered by value.</span>
        <span className="mono font-semibold" style={{ color: DISPOSITION_META.recoverable.color }}>{money(total)} · {recoverable.length} lines</span>
      </div>
      {Object.entries(groups).map(([action, lines]) => (
        <div key={action}>
          <div className="flex items-center gap-2 mb-2">
            <ClipboardList size={14} style={{ color: COL.accent }} />
            <span className="text-[12.5px] font-semibold" style={{ color: COL.text }}>{action}</span>
            <span className="mono text-[11px]" style={{ color: COL.textMute }}>{money(lines.reduce((a, l) => a + l.variance, 0))} · {lines.length}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lines.map((l) => {
              const r = readiness(l);
              return (
                <button key={l.id} onClick={() => onOpen(l)} className="text-start rounded-xl border p-3 transition-colors hover:bg-black/[0.02]" style={{ borderColor: COL.border, background: COL.surface }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-[12.5px] font-semibold truncate" style={{ color: COL.text }}>{l.resourceLine}</div>
                    <div className="mono text-[13px] font-bold shrink-0" style={{ color: DISPOSITION_META.recoverable.color }}>{money(l.variance)}</div>
                  </div>
                  <div className="text-[11px] mt-0.5 truncate" style={{ color: COL.textMute }}>{l.activityName} · {l.reasonCode}</div>
                  <div className="flex items-center justify-between mt-2 text-[11px]">
                    <span style={{ color: COL.textDim }}>{l.owner}</span>
                    <span className="flex items-center gap-2">
                      <span className="mono" style={{ color: COL.textMute }}>{l.targetIpa}</span>
                      <span className="inline-flex items-center gap-1 font-medium" style={{ color: r.c }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: r.c }} />{r.t}</span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 4 · Monthly Snapshot ────────────────────────────────────
function Snapshot({ kpis }) {
  const periods = PERIODS.map((p) => p.current
    ? { ...p, reported: kpis.reported, certified: kpis.certified, recoverable: kpis.recoverable, blocked: kpis.blocked, writtenOff: kpis.writtenOff, overCertified: kpis.overCertified, carriedForward: kpis.recoverable + kpis.blocked, recoveredFromPrev: 0 }
    : p);
  return (
    <div className="space-y-3">
      <div className="rounded-lg px-3 py-2 flex items-center gap-2 text-[11.5px]" style={{ background: COL.surfaceAlt, color: COL.textDim }}>
        <Lock size={13} className="shrink-0" /> Closed periods are shown as immutable snapshots. (Visual only — backend immutability/locking is the backend owner's lane, not implemented here.)
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {periods.map((p) => (
          <div key={p.id} className="rounded-xl border p-3" style={{ borderColor: p.current ? COL.accent : COL.border, background: COL.surface }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[13px] font-semibold" style={{ color: COL.text }}>{p.label}</div>
              {p.status === 'closed'
                ? <Chip label="Closed · snapshot" color="#64748b" soft="#f1f5f9" />
                : <Chip label="Open · current" color={COL.accent} soft={COL.accentBg} />}
            </div>
            <KV k="Reported" v={money(p.reported)} mono />
            <KV k="Certified" v={money(p.certified)} mono />
            <KV k="Recoverable" v={money(p.recoverable)} mono />
            <KV k="Blocked" v={money(p.blocked)} mono />
            <KV k="Written off" v={money(p.writtenOff)} mono />
            <KV k="Over-certified" v={money(p.overCertified || 0)} mono />
            <div className="my-1.5 h-px" style={{ background: COL.border }} />
            <KV k="Carried forward" v={money(p.carriedForward || 0)} mono />
            <KV k="Recovered from prev." v={p.current ? '—' : money(p.recoveredFromPrev || 0)} mono />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 5 · Import Mapping Wizard (frontend-only mock) ──────────
const IMPORT_STEPS = ['Select file', 'Map columns', 'Map reason codes', 'Validate', 'Review'];
const COLUMN_MAP = [
  ['Activity ID / Name', 'activity_id / activity_name', 'direct'],
  ['Resource ID Name', 'resource_line + boq_item_ref', 'parse code prefix'],
  ['CO-x BOQ', 'boq_mapping.co_vo_ref', 'direct'],
  ['Actual Cost (incl VAT)', 'progress_value', 'split base / VAT'],
  ['IPA / Invoice No.N (incl VAT)', 'certified_ipa_value', 'split base / VAT · is_backend_derived=false'],
  ['Variance (incl VAT)', '(ignored — recomputed)', 'never trusted from import'],
  ['Notes', 'reason_code + free_text_note', 'free-text → canonical, confirmed'],
];
const REASON_SUGGESTIONS = [
  ['"NO WIR Yet, should be invoiced next IPA"', 'No WIR'],
  ['"Missing WIR"', 'Missing WIR'],
  ['"Material Not yet approved"', 'Material not approved'],
  ['"CO#2 & CO#3 Items"', 'CO/variation pending'],
  ['"Qty\'s Cannot Be Claimed"', 'Unclaimable quantity'],
  ['"Installation in progress"', 'In progress, not certifiable'],
];
function ImportWizard() {
  const [step, setStep] = useState(0);
  return (
    <div className="rounded-xl border" style={{ borderColor: COL.border, background: COL.surface }}>
      {/* stepper */}
      <div className="flex items-center gap-2 px-4 py-3 border-b overflow-x-auto scrollbar" style={{ borderColor: COL.border }}>
        {IMPORT_STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2 shrink-0">
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: i <= step ? COL.accent : COL.surfaceAlt, color: i <= step ? '#fff' : COL.textMute }}>{i < step ? <Check size={12} /> : i + 1}</span>
            <span className="text-[12px] font-medium" style={{ color: i === step ? COL.text : COL.textMute }}>{s}</span>
            {i < IMPORT_STEPS.length - 1 && <ArrowRight size={12} style={{ color: COL.border }} />}
          </div>
        ))}
      </div>

      <div className="p-4 min-h-[220px]">
        <div className="rounded-lg px-3 py-1.5 mb-3 text-[11px] flex items-center gap-2" style={{ background: COL.pendingSoft, color: COL.pending }}>
          <FileWarning size={13} /> Frontend mock — no real file is parsed. Rows shown are synthetic. No live connection to any cost system.
        </div>

        {step === 0 && (
          <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed rounded-xl" style={{ borderColor: COL.border }}>
            <Upload size={26} style={{ color: COL.textMute }} />
            <div className="text-[13px] font-medium mt-2" style={{ color: COL.text }}>Drop the "Progress Cost vs IPA" workbook (.xlsx / .csv)</div>
            <div className="text-[11px] mt-1" style={{ color: COL.textMute }}>or select a file — demo uses a synthetic sample sheet</div>
            <div className="mt-3"><Btn variant="secondary" icon={FileSpreadsheet}>Use synthetic sample</Btn></div>
          </div>
        )}
        {step === 1 && (
          <table className="w-full text-[12px]"><thead><tr style={{ color: COL.textMute }}><th className="text-start py-1.5">Workbook column</th><th className="text-start">Module field</th><th className="text-start">Transform</th></tr></thead>
            <tbody>{COLUMN_MAP.map(([a, b, c]) => (<tr key={a} style={{ borderTop: `1px solid ${COL.border}` }}><td className="py-1.5" style={{ color: COL.text }}>{a}</td><td className="mono text-[11px]" style={{ color: COL.accent }}>{b}</td><td style={{ color: COL.textDim }}>{c}</td></tr>))}</tbody></table>
        )}
        {step === 2 && (
          <div className="space-y-2">{REASON_SUGGESTIONS.map(([free, code]) => (
            <div key={free} className="flex items-center gap-3 text-[12px] rounded-lg border px-3 py-2" style={{ borderColor: COL.border }}>
              <span className="flex-1 truncate" style={{ color: COL.textDim }}>{free}</span>
              <ArrowRight size={13} style={{ color: COL.textMute }} />
              <Chip label={code} color={DISPOSITION_META[REASON_CODES.find((r) => r.code === code)?.disposition]?.color} soft={DISPOSITION_META[REASON_CODES.find((r) => r.code === code)?.disposition]?.soft} />
              <span className="mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: COL.certifiedSoft, color: COL.certified }}>suggested · confirm</span>
            </div>
          ))}</div>
        )}
        {step === 3 && (
          <div className="space-y-2 text-[12.5px]">
            {[['14 lines parsed', true], ['Variance recomputed on all lines (imported variance ignored)', true], ['2 lines flagged: certified value has no linked WIR/evidence — "unverified import"', false], ['0 disposition entered by hand (all derived from reason code)', true]].map(([t, ok]) => (
              <div key={t} className="flex items-center gap-2"><span className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: ok ? COL.certifiedSoft : COL.pendingSoft }}>{ok ? <Check size={11} style={{ color: COL.certified }} /> : <FileWarning size={10} style={{ color: COL.pending }} />}</span><span style={{ color: COL.text }}>{t}</span></div>
            ))}
          </div>
        )}
        {step === 4 && (
          <div className="space-y-2">
            <div className="text-[12px] mb-2" style={{ color: COL.textDim }}>Review — synthetic mapped rows (nothing is written; certified stays <span className="mono">is_backend_derived=false</span>):</div>
            {IPA_LINES.slice(0, 5).map((l) => (
              <div key={l.id} className="flex items-center gap-3 text-[12px] rounded-lg border px-3 py-1.5" style={{ borderColor: COL.border }}>
                <span className="flex-1 truncate" style={{ color: COL.text }}>{l.resourceLine}</span>
                <span className="mono" dir="ltr" style={{ color: COL.textDim }}>{money(l.reported)} → {money(l.certified)}</span>
                <span className="mono font-semibold" dir="ltr" style={{ color: l.variance < 0 ? DISPOSITION_META.review.color : COL.text }}>{signed(l.variance)}</span>
                <DispChip d={l.disposition} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: COL.border }}>
        <Btn variant="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</Btn>
        {step < IMPORT_STEPS.length - 1
          ? <Btn variant="primary" onClick={() => setStep((s) => s + 1)}>Next</Btn>
          : <span className="text-[11.5px] mono" style={{ color: COL.textMute }}>Demo — import not persisted</span>}
      </div>
    </div>
  );
}

// ── Variance Detail Drawer ──────────────────────────────────
function LinkRow({ label, items, empty }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[12px] py-1">
      <span style={{ color: COL.textDim }}>{label}</span>
      <span className="flex flex-wrap gap-1 justify-end">
        {items?.length ? items.map((x) => (
          <span key={x} className="inline-flex items-center gap-1 mono text-[10.5px] px-1.5 py-0.5 rounded" style={{ background: COL.surfaceAlt, color: COL.accent }}><ExternalLink size={9} />{x}</span>
        )) : <span style={{ color: COL.textMute }}>{empty}</span>}
      </span>
    </div>
  );
}
function VarianceDrawer({ line, onClose }) {
  if (!line) return null;
  const d = DISPOSITION_META[line.disposition];
  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.18)' }} onClick={onClose} aria-hidden />
      <div role="dialog" aria-label={`Variance ${line.resourceLine}`} className="fixed top-0 bottom-0 z-50 flex flex-col shadow-2xl" style={{ insetInlineEnd: 0, width: 'min(440px, 100vw)', background: COL.surface, borderInlineStart: `1px solid ${COL.border}` }}>
        <div className="flex items-start gap-2 px-4 py-3 border-b" style={{ borderColor: COL.border }}>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold truncate" style={{ color: COL.text }}>{line.resourceLine}</div>
            <div className="text-[11.5px] mt-0.5 truncate" style={{ color: COL.textMute }}><span className="mono">{line.activityId}</span> · {line.activityName}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-stone-100" style={{ color: COL.textDim }}><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar p-4 space-y-3" style={{ background: COL.bg }}>
          <div className="flex items-center gap-2 flex-wrap"><DispChip d={line.disposition} /><StatusChip s={line.status} /><DemoBadge /></div>

          {/* the numbers */}
          <div className="rounded-xl border p-3" style={{ borderColor: COL.border, background: COL.surface }}>
            <KV k="Reported progress (base)" v={money(line.reported)} mono />
            <KV k="Certified IPA (base)" v={<span style={{ color: '#15803d' }}>{money(line.certified)}</span>} mono />
            <div className="my-1.5 h-px" style={{ background: COL.border }} />
            <KV k="Variance (base)" v={<span style={{ color: line.variance < 0 ? d.color : COL.text }}>{signed(line.variance)}{line.variance < 0 ? ' · over-certified' : ''}</span>} mono />
            <KV k="VAT on variance (15%)" v={money(line.vat)} mono />
          </div>

          {/* classification */}
          <div className="rounded-xl border p-3" style={{ borderColor: COL.border, background: COL.surface }}>
            <KV k="Reason code" v={line.reasonCode} />
            <KV k="Original note" v={<span className="italic" style={{ color: COL.textDim }}>"{line.note}"</span>} />
            <KV k="Disposition (derived)" v={d.label} />
            <KV k="Owner" v={line.owner} />
            <KV k="Required action" v={actionForReason(line.reasonCode)} />
            <KV k="Target IPA" v={line.targetIpa} mono />
            <KV k="BOQ / CO ref" v={`${line.boqRef}${line.coRef ? ' · ' + line.coRef : ''}`} mono />
          </div>

          {/* read-only links */}
          <div className="rounded-xl border p-3" style={{ borderColor: COL.border, background: COL.surface }}>
            <div className="text-[11px] uppercase tracking-wide font-medium mb-1.5" style={{ color: COL.textMute }}>Read-only references</div>
            <LinkRow label="WIR links" items={line.wir} empty="none — claimability unproven" />
            <LinkRow label="Evidence links" items={line.evidence} empty="none" />
            <LinkRow label="CO / VO links" items={line.covo} empty="none" />
          </div>

          <div className="rounded-lg px-3 py-2 flex items-start gap-2 text-[11px]" style={{ background: COL.pendingSoft, color: COL.pending }}>
            <ShieldAlert size={14} className="shrink-0 mt-0.5" />
            Certified value is imported/demo in this view (<span className="mono">is_backend_derived = false</span>) until backend-certified reconciliation is connected. WIR links justify claimability — they do not set certified value.
          </div>
        </div>
      </div>
    </>
  );
}
