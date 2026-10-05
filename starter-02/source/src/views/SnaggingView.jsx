import { useState, useEffect, useMemo, useCallback } from 'react';
import { AlertCircle, AlertOctagon, AlertTriangle, Box, CheckCircle2, FileDown, Flag, LayoutDashboard, ListChecks, Plus, RotateCcw, ShieldCheck, Wallet } from 'lucide-react';
import { Btn, KpiCard, PageHeader } from '../components/primitives.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { exportSheet } from '../lib/excelExport.js';
import { elementByGuid } from '../components/ElementPicker.jsx';
import { SnagFormModal } from './snagging/SnagForm.jsx';
import { SnagDetailModal } from './snagging/SnagDetail.jsx';
import { listSnags } from '../api/snags.js';
import { SNAG_PRIORITY, SNAG_STATUS } from '../data/quality.js';
import { SNAG_STATUSES, SNAG_PRIORITIES } from '../lib/snagMeta.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';
import { COL } from '../lib/theme.js';

const OPEN_STATES = ['open', 'assigned', 'inProgress', 'reopened', 'blocked'];
const DONE_STATES = ['closed', 'verified'];
const PRI_ORDER = { critical: 0, major: 1, minor: 2, observation: 3 };

// Aggregate handover-readiness by zone, computed from the live snags.
function computeZones(snags) {
  const byZone = new Map();
  for (const s of snags) {
    const zone = s.zone || 'Unzoned';
    if (!byZone.has(zone)) byZone.set(zone, { zone, level: s.level || '—', subcontractor: s.assignee_co || '—', total: 0, open: 0, blocking: 0, done: 0 });
    const z = byZone.get(zone);
    z.total++;
    if (OPEN_STATES.includes(s.status)) z.open++;
    if (DONE_STATES.includes(s.status)) z.done++;
    if ((s.blocks_handover || s.blocks_payment) && !DONE_STATES.includes(s.status)) z.blocking++;
  }
  return [...byZone.values()].map((z) => ({
    ...z,
    readinessScore: z.total === 0 ? 100 : Math.max(0, Math.round((z.done / z.total) * 100) - z.blocking * 10),
  })).sort((a, b) => a.readinessScore - b.readinessScore);
}

export function SnaggingView({ t, onSelectElement, setRoute }) {
  const { requireAuth } = useAuth();
  const [snags, setSnags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('list');
  const [filter, setFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setSnags([]); setLoading(false); return; }
    setLoading(true); setError(null);
    try { setSnags(await listSnags()); }
    catch (err) { setError(err?.message ?? String(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => ({
    total: snags.length,
    open: snags.filter((s) => OPEN_STATES.includes(s.status)).length,
    critical: snags.filter((s) => s.priority === 'critical' && !DONE_STATES.includes(s.status)).length,
    blocking: snags.filter((s) => (s.blocks_handover || s.blocks_payment) && !DONE_STATES.includes(s.status)).length,
    closed: snags.filter((s) => DONE_STATES.includes(s.status)).length,
  }), [snags]);

  const list = useMemo(() => snags.filter((s) =>
    (filter === 'all' || s.status === filter) && (priorityFilter === 'all' || s.priority === priorityFilter)
  ).sort((a, b) => PRI_ORDER[a.priority] - PRI_ORDER[b.priority]), [snags, filter, priorityFilter]);

  const zones = useMemo(() => computeZones(snags), [snags]);
  const avgReadiness = zones.length ? Math.round(zones.reduce((s, z) => s + z.readinessScore, 0) / zones.length) : 100;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <main className="flex-1 overflow-y-auto" style={{ background: COL.bg }}>
        <PageHeader title="Snagging & Punch List" subtitle="Field-first defect tracking · handover readiness · payment blockers"
          actions={<><Btn variant="ghost" icon={RotateCcw} onClick={load}>Refresh</Btn><Btn variant="ghost" icon={FileDown} onClick={() => exportSheet({ fileName: 'Snags', title: 'SNAGGING / PUNCH LIST', rows: snags, columns: [
          { label: 'Snag No', key: 'snag_number', width: 12 },
          { label: 'Title', key: 'title', width: 28, wrap: true },
          { label: 'Element', key: 'element_guid', width: 20 },
          { label: 'Priority', key: 'priority', width: 12 },
          { label: 'Status', key: 'status', width: 14 },
          { label: 'Assignee', key: 'assignee', width: 18 },
          { label: 'Target Date', key: 'target_date', width: 12 },
          { label: 'Blocks Handover', key: 'blocks_handover', width: 14 },
          { label: 'Description', key: 'description', width: 36, wrap: true },
        ] })}>Export</Btn><Btn variant="primary" icon={Plus} onClick={() => requireAuth(() => setAddOpen(true))}>Raise Snag</Btn></>} />

        <div className="px-7 pb-4">
          {!isSupabaseConfigured && (
            <div className="my-3 text-xs px-3 py-2 rounded border" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>
              Supabase isn't configured. Add your keys to <span className="mono">.env</span> and restart the dev server.
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
            <KpiCard label="Total Snags" value={stats.total} icon={Flag} accent={COL.accent} />
            <KpiCard label="Open" value={stats.open} icon={AlertCircle} accent="#d97706" />
            <KpiCard label="Critical Open" value={stats.critical} icon={AlertOctagon} accent="#dc2626" hint="Halt work risk" />
            <KpiCard label="Blocking Payment" value={stats.blocking} icon={Wallet} accent="#991b1b" hint="Cannot certify" />
            <KpiCard label="Closed / Verified" value={stats.closed} icon={CheckCircle2} accent="#16a34a" />
          </div>

          <div className="flex gap-1 mb-4 border-b" style={{ borderColor: COL.border }}>
            {[{ v: 'list', label: 'Snag List', icon: ListChecks }, { v: 'dashboard', label: 'Zone Readiness', icon: LayoutDashboard }, { v: 'handover', label: 'Handover Pack', icon: ShieldCheck }].map((tb) => {
              const Icon = tb.icon; const active = tab === tb.v;
              return <button key={tb.v} onClick={() => setTab(tb.v)} className="px-3 py-2 text-[11px] font-semibold flex items-center gap-1.5" style={{ color: active ? COL.accent : COL.textDim, borderBottom: active ? `2px solid ${COL.accent}` : '2px solid transparent' }}><Icon size={13} />{tb.label}</button>;
            })}
          </div>

          {loading ? (
            <div className="text-center text-xs py-10" style={{ color: COL.textMute }}>Loading snags…</div>
          ) : error ? (
            <div className="text-xs px-3 py-2 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>
          ) : (
            <>
              {tab === 'list' && (
                <>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className="mono text-[10px] tracking-widest self-center mr-2" style={{ color: COL.textDim }}>STATUS:</span>
                    {['all', ...SNAG_STATUSES].map((f) => (
                      <button key={f} onClick={() => setFilter(f)} className="px-2 py-0.5 rounded text-[10px] font-semibold mono" style={{ background: filter === f ? COL.text : 'transparent', color: filter === f ? '#fff' : COL.textDim, border: `1px solid ${filter === f ? COL.text : COL.border}` }}>{f === 'all' ? 'All' : SNAG_STATUS[f]?.label}</button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className="mono text-[10px] tracking-widest self-center mr-2" style={{ color: COL.textDim }}>PRIORITY:</span>
                    {['all', ...SNAG_PRIORITIES].map((f) => (
                      <button key={f} onClick={() => setPriorityFilter(f)} className="px-2 py-0.5 rounded text-[10px] font-semibold mono uppercase" style={{ background: priorityFilter === f ? (SNAG_PRIORITY[f]?.color || COL.text) : 'transparent', color: priorityFilter === f ? '#fff' : COL.textDim, border: `1px solid ${priorityFilter === f ? (SNAG_PRIORITY[f]?.color || COL.text) : COL.border}` }}>{f === 'all' ? 'All' : f}</button>
                    ))}
                  </div>

                  {list.length === 0 ? (
                    snags.length === 0 ? <EmptyState icon={Flag} title="No snags logged"
                      description="Track punch-list items to closure before handover. Snags can block handover or payment until they're fixed."
                      actions={[{ label: 'Raise Snag', icon: Plus, onClick: () => requireAuth(() => setAddOpen(true)) }]} />
                    : <div className="text-center text-xs py-10" style={{ color: COL.textMute }}>No snags match these filters.</div>
                  ) : (
                    <div className="space-y-2">
                      {list.map((s) => {
                        const el = elementByGuid(s.element_guid);
                        return (
                          <div key={s.id} onClick={() => setSelected(s)} className="rounded border cursor-pointer hover:shadow-sm" style={{ background: COL.surface, borderColor: COL.border, borderLeftWidth: 4, borderLeftColor: SNAG_PRIORITY[s.priority]?.color }}>
                            <div className="p-3">
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="mono text-[11px] font-bold" style={{ color: SNAG_PRIORITY[s.priority]?.color }}>{s.snag_number}</span>
                                    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold mono uppercase" style={{ color: SNAG_PRIORITY[s.priority]?.color, background: SNAG_PRIORITY[s.priority]?.bg }}>{SNAG_PRIORITY[s.priority]?.label}</span>
                                    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold mono" style={{ color: SNAG_STATUS[s.status]?.color, background: SNAG_STATUS[s.status]?.bg }}>{SNAG_STATUS[s.status]?.label}</span>
                                    {(s.blocks_handover || s.blocks_payment) && <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ color: '#991b1b', background: '#fecaca' }}>BLOCKING</span>}
                                  </div>
                                  <div className="text-[12.5px] font-semibold">{s.title}</div>
                                </div>
                                {s.element_guid && (
                                  <button onClick={(e) => { e.stopPropagation(); if (el) { onSelectElement(el.id); setRoute('model'); } }} disabled={!el} className="mono text-[10px] flex items-center gap-1 hover:underline disabled:no-underline flex-shrink-0 ml-3" style={{ color: el ? COL.accent : COL.textDim }}><Box size={11} /> {el ? el.id : 'GUID'}</button>
                                )}
                              </div>
                              <div className="text-[11px] mb-2" style={{ color: COL.textDim }}>{s.description}</div>
                              <div className="flex items-center justify-between mono text-[10px]" style={{ color: COL.textDim }}>
                                <div className="flex items-center gap-3"><span>{s.zone}</span>{s.assignee_co && <><span>·</span><span>{s.assignee_co}</span></>}{s.assignee && <><span>·</span><span>{s.assignee}</span></>}</div>
                                <div>Target: {s.target_date || '—'}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {tab === 'dashboard' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                    <div className="rounded border p-4" style={{ background: COL.surface, borderColor: COL.border }}>
                      <div className="mono text-[10px] tracking-widest mb-2" style={{ color: COL.textDim }}>OVERALL HANDOVER READINESS</div>
                      <div className="display text-3xl font-bold" style={{ color: avgReadiness >= 75 ? '#16a34a' : avgReadiness >= 50 ? '#d97706' : '#dc2626' }}>{avgReadiness}%</div>
                      <div className="mt-2 h-2 rounded overflow-hidden" style={{ background: COL.bg }}><div className="h-full" style={{ width: avgReadiness + '%', background: avgReadiness >= 75 ? '#16a34a' : avgReadiness >= 50 ? '#d97706' : '#dc2626' }} /></div>
                    </div>
                    <div className="rounded border p-4" style={{ background: COL.surface, borderColor: COL.border }}>
                      <div className="mono text-[10px] tracking-widest mb-2" style={{ color: COL.textDim }}>READY ZONES</div>
                      <div className="display text-3xl font-bold" style={{ color: '#16a34a' }}>{zones.filter((z) => z.readinessScore >= 90).length} / {zones.length}</div>
                      <div className="text-[10px] mt-1" style={{ color: COL.textDim }}>≥90% readiness score</div>
                    </div>
                    <div className="rounded border p-4" style={{ background: COL.surface, borderColor: COL.border }}>
                      <div className="mono text-[10px] tracking-widest mb-2" style={{ color: COL.textDim }}>BLOCKED ZONES</div>
                      <div className="display text-3xl font-bold" style={{ color: '#dc2626' }}>{zones.filter((z) => z.blocking > 0).length}</div>
                      <div className="text-[10px] mt-1" style={{ color: COL.textDim }}>Have payment-blocking snags</div>
                    </div>
                  </div>
                  <div className="rounded border overflow-hidden" style={{ borderColor: COL.border, background: COL.surface }}>
                    <div className="px-4 py-3 border-b" style={{ borderColor: COL.border, background: COL.bg }}><div className="mono text-[10px] tracking-widest" style={{ color: COL.textDim }}>HANDOVER READINESS BY ZONE</div></div>
                    {zones.length === 0 ? <div className="text-center text-xs py-8" style={{ color: COL.textMute }}>No snags yet.</div> : (
                      <table className="w-full text-[11px]">
                        <thead><tr style={{ borderBottom: `1px solid ${COL.border}` }}>{['Zone', 'Level', 'Subcontractor', 'Total', 'Open', 'Blocking', 'Readiness'].map((h) => <th key={h} className="text-left px-4 py-2 mono text-[10px] uppercase tracking-wide" style={{ color: COL.textDim }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {zones.map((z) => (
                            <tr key={z.zone} className="border-t hover:bg-stone-50" style={{ borderColor: '#f0ede0' }}>
                              <td className="px-4 py-2.5 font-semibold">{z.zone}</td>
                              <td className="px-4 py-2.5 mono text-[10px]" style={{ color: COL.textDim }}>{z.level}</td>
                              <td className="px-4 py-2.5 text-[10.5px]">{z.subcontractor}</td>
                              <td className="px-4 py-2.5 mono">{z.total}</td>
                              <td className="px-4 py-2.5 mono font-bold" style={{ color: z.open > 0 ? '#d97706' : COL.textMute }}>{z.open}</td>
                              <td className="px-4 py-2.5 mono font-bold" style={{ color: z.blocking > 0 ? '#dc2626' : COL.textMute }}>{z.blocking}</td>
                              <td className="px-4 py-2.5"><div className="flex items-center gap-2"><div className="flex-1 h-2 rounded overflow-hidden" style={{ background: COL.bg }}><div className="h-full" style={{ width: z.readinessScore + '%', background: z.readinessScore >= 90 ? '#16a34a' : z.readinessScore >= 70 ? '#84cc16' : z.readinessScore >= 50 ? '#d97706' : '#dc2626' }} /></div><span className="mono text-[10px] font-bold w-10 text-right" style={{ color: z.readinessScore >= 90 ? '#16a34a' : z.readinessScore >= 50 ? '#d97706' : '#dc2626' }}>{z.readinessScore}%</span></div></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}

              {tab === 'handover' && (
                <div className="rounded border overflow-hidden" style={{ borderColor: COL.border, background: COL.surface }}>
                  <div className="px-5 py-4 border-b" style={{ borderColor: COL.border, background: COL.bg }}>
                    <div className="display text-base font-bold">Handover Closeout Pack Builder</div>
                    <div className="text-[11px] mt-1" style={{ color: COL.textDim }}>Compiles approved documents + closed snags + signed inspections per zone</div>
                  </div>
                  <div className="p-5 space-y-3">
                    {zones.length === 0 ? <div className="text-center text-xs py-4" style={{ color: COL.textMute }}>No zones yet.</div> : zones.map((z) => (
                      <div key={z.zone} className="rounded border p-3 flex items-center gap-3" style={{ background: COL.bg, borderColor: COL.border }}>
                        <div className="flex-1"><div className="font-semibold text-[12px]">{z.zone}</div><div className="mono text-[10px]" style={{ color: COL.textDim }}>{z.subcontractor} · {z.open} open · {z.blocking} blocking</div></div>
                        <div className="w-24"><div className="h-1.5 rounded overflow-hidden" style={{ background: COL.surface }}><div className="h-full" style={{ width: z.readinessScore + '%', background: z.readinessScore >= 90 ? '#16a34a' : z.readinessScore >= 50 ? '#d97706' : '#dc2626' }} /></div><div className="mono text-[10px] text-right mt-0.5" style={{ color: z.readinessScore >= 90 ? '#16a34a' : COL.textDim }}>{z.readinessScore}%</div></div>
                        <Btn variant={z.readinessScore >= 90 ? 'primary' : 'ghost'} icon={FileDown} onClick={() => {}}>{z.readinessScore >= 90 ? 'Generate' : 'Pre-build'}</Btn>
                      </div>
                    ))}
                    <div className="rounded p-4 mt-4 border-l-4" style={{ background: '#fef9c3', borderColor: '#fde68a', borderLeftColor: '#a16207' }}>
                      <div className="flex items-start gap-2"><AlertTriangle size={14} style={{ color: '#92400e', marginTop: 2 }} /><div><div className="font-semibold text-[11px]" style={{ color: '#92400e' }}>Closeout requires all blocking snags closed</div><div className="text-[10.5px] mt-1" style={{ color: '#92400e' }}>Open or overdue snags carry forward into the closeout pack as outstanding items, with consultant sign-off required before sectional completion.</div></div></div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <SnagFormModal open={addOpen} initial={null} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); }} />
      <SnagDetailModal open={Boolean(selected)} snag={selected} onClose={() => setSelected(null)} onChanged={() => { load(); setSelected(null); }} onSelectElement={onSelectElement} setRoute={setRoute} />
    </div>
  );
}
