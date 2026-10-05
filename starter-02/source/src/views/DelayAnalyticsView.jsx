import { AlertOctagon, ArrowUpRight, Building2, Calendar, Download, Timer, Truck } from 'lucide-react';
import { Btn, KpiCard, PageHeader } from '../components/primitives.jsx';
import { DELAY_METRICS } from '../data/finance.js';
import { COL } from '../lib/theme.js';

// ============================================================
// DELAY ANALYTICS VIEW
// ============================================================
export function DelayAnalyticsView({ t }) {
  const m = DELAY_METRICS;
  const maxBar = Math.max(...m.stages.map(s => s.avgDays));
  const supplierShare = (m.supplierAvg / m.totalAvg) * 100;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title="Delay Analytics" subtitle="End-to-end cycle time from delivery to payment, by team" actions={<><Btn icon={Download}>Export</Btn><Btn icon={Calendar} variant="secondary">Date Range</Btn></>} />
      <div className="mx-6 mt-3 text-xs px-3 py-2 rounded border" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>⚠ Sample figures — this screen needs <b>per-stage workflow timestamps</b> the app doesn't record yet. Numbers below are illustrative, not live.</div>

      <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b" style={{ borderColor: COL.border, background: COL.surface }}>
        <KpiCard label="Avg Cycle Time" value={`${m.totalAvg.toFixed(1)} days`} accent={COL.text} hint={`Target ${m.totalTarget}d · -3.4d vs Dec`} trend={-7} icon={Timer} />
        <KpiCard label="Supplier Share" value={`${Math.round(supplierShare)}%`} accent="#d97706" hint={`${m.supplierAvg}d supplier-side`} icon={Truck} />
        <KpiCard label="Internal Share" value={`${Math.round(100 - supplierShare)}%`} accent={COL.accent} hint={`${m.internalAvg}d internal`} icon={Building2} />
        <KpiCard label="Worst Bottleneck" value="14.5d" accent="#dc2626" hint="Accounting → Payment" icon={AlertOctagon} />
      </div>

      <div className="flex-1 overflow-y-auto scrollbar p-6 space-y-5" style={{ background: COL.bg }}>
        {/* Stage waterfall */}
        <div className="rounded-2xl border p-5" style={{ background: COL.surface, borderColor: COL.border, boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
          <div className="display text-base font-bold mb-1">Cycle Time by Stage</div>
          <div className="text-xs mb-5" style={{ color: COL.textDim }}>Average days per stage vs target. Bars in red exceed target.</div>
          <div className="space-y-3">
            {m.stages.map((s, i) => {
              const exceeds = s.avgDays > s.target;
              const pct = (s.avgDays / maxBar) * 100;
              const targetPct = (s.target / maxBar) * 100;
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{s.label}</span>
                      <span className="mono text-[9px] px-2 py-0.5 rounded-full font-medium" style={{ background: s.isInternal ? COL.accentBg : '#fef3c7', color: s.isInternal ? COL.accent : '#b45309' }}>{s.responsible}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="mono text-[10px]" style={{ color: COL.textDim }}>Target {s.target}d</span>
                      <span className="mono text-sm font-bold" style={{ color: exceeds ? '#dc2626' : '#16a34a' }}>{s.avgDays}d</span>
                    </div>
                  </div>
                  <div className="h-3 rounded-full relative overflow-hidden" style={{ background: COL.surfaceAlt }}>
                    <div className="h-full transition-all" style={{ width: `${pct}%`, borderRadius: 999, background: exceeds ? 'linear-gradient(90deg, #ef4444, #f87171)' : 'linear-gradient(90deg, #16a34a, #4ade80)' }} />
                    <div className="absolute top-0 bottom-0 border-l-2 border-dashed" style={{ left: `${targetPct}%`, borderColor: COL.textDim }} title={`Target ${s.target}d`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Bottlenecks by team */}
          <div className="rounded-2xl border p-5" style={{ background: COL.surface, borderColor: COL.border, boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
            <div className="display text-base font-bold mb-3 flex items-center gap-2">Bottleneck Ranking <span className="mono text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide" style={{ background: '#fef3c7', color: '#92400e' }}>Illustrative</span></div>
            <table className="w-full text-xs">
              <thead className="mono" style={{ color: COL.textDim }}>
                <tr style={{ borderBottom: `1px solid ${COL.border}` }}>
                  <th className="py-2 text-left">Rank</th>
                  <th className="py-2 text-left">Responsible</th>
                  <th className="py-2 text-right">Avg Delay</th>
                  <th className="py-2 text-right">vs Target</th>
                </tr>
              </thead>
              <tbody>
                {[...m.stages].sort((a, b) => (b.avgDays - b.target) - (a.avgDays - a.target)).map((s, i) => {
                  const delta = s.avgDays - s.target;
                  return (
                    <tr key={i} className="border-b" style={{ borderColor: COL.border }}>
                      <td className="py-2 mono font-bold" style={{ color: COL.accent }}>#{i + 1}</td>
                      <td className="py-2">{s.responsible}</td>
                      <td className="py-2 mono text-right">{s.avgDays}d</td>
                      <td className="py-2 mono text-right font-bold" style={{ color: delta > 0 ? '#dc2626' : '#16a34a' }}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}d</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Trend */}
          <div className="rounded-2xl border p-5" style={{ background: COL.surface, borderColor: COL.border, boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
            <div className="display text-base font-bold mb-1">Cycle Time Trend</div>
            <div className="text-xs mb-4" style={{ color: COL.textDim }}>6 months · target {m.totalTarget}d</div>
            <div className="flex items-end gap-3 h-32">
              {m.monthlyTrend.map((mt, i) => {
                const max = Math.max(...m.monthlyTrend.map(x => x.d));
                const h = (mt.d / max) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full rounded-t-lg flex items-end justify-center text-[9px] font-bold text-white pb-1" style={{ height: `${h}%`, background: i === m.monthlyTrend.length - 1 ? COL.accent : '#94a3b8', minHeight: 30 }}>{mt.d.toFixed(0)}d</div>
                    <div className="mono text-[10px]" style={{ color: COL.textDim }}>{mt.m}</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-3 border-t flex items-center gap-2 text-[11px]" style={{ borderColor: COL.border }}>
              <ArrowUpRight size={11} style={{ color: '#16a34a' }} />
              <span style={{ color: '#16a34a' }} className="font-semibold">7% improvement vs Dec 2025.</span>
              <span style={{ color: COL.textDim }}>Still 16d above target.</span>
            </div>
          </div>
        </div>

        {/* Supplier vs Internal split */}
        <div className="rounded-2xl border p-5" style={{ background: COL.surface, borderColor: COL.border, boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
          <div className="display text-base font-bold mb-1">Supplier Delay vs Internal Delay</div>
          <div className="text-xs mb-4" style={{ color: COL.textDim }}>Where does the time actually go? Split between supplier-side latency and internal processing.</div>
          <div className="h-10 rounded-xl overflow-hidden flex">
            <div style={{ width: `${supplierShare}%`, background: '#d97706' }} className="flex items-center justify-center text-xs text-white font-bold">Supplier {m.supplierAvg}d</div>
            <div style={{ width: `${100 - supplierShare}%`, background: COL.accent }} className="flex items-center justify-center text-xs text-white font-bold">Internal {m.internalAvg}d</div>
          </div>
          <div className="mt-3 p-3.5 rounded-xl text-[12px] border" style={{ background: COL.accentBg, borderColor: '#bfdbfe', color: COL.text }}>
            <span className="mono text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide me-1.5" style={{ background: '#fef3c7', color: '#92400e' }}>Illustrative</span>
            <span className="font-semibold">Insight:</span> 77% of cycle time is internal. Supplier slowness is a smaller factor than PM/PD approval (7.2d) and Accounting → Payment (14.5d). Focus improvement on internal workflow, not supplier chasing.
          </div>
        </div>
      </div>
    </div>
  );
}

