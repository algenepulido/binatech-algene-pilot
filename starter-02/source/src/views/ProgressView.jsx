import { useState, useEffect, useMemo, useCallback } from 'react';
import { Grid3x3, RotateCcw, Download } from 'lucide-react';
import { Btn, KpiCard, PageHeader } from '../components/primitives.jsx';
import { listBoqItems, isBoqLineItem } from '../api/boqItems.js';
import { listWorkItems } from '../api/workItems.js';
import { listWirs } from '../api/wirs.js';
import { usePackages, PackageBar, PackageManagerModal } from '../components/PackageControls.jsx';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { exportSheet } from '../lib/excelExport.js';
import { fmt } from '../lib/format.js';
import { COL } from '../lib/theme.js';

// ============================================================
// PROGRESS (Location × BoQ) — the no-model replacement for visual progress.
// A plain table of contract vs approved vs certified value, by BoQ line and by
// location. Reads the SAME engine output (boq_items.approved_qty) so the totals
// reconcile with IPC / certification regardless of whether work was selected
// via model elements or work items. % complete is by VALUE (unit-safe).
// ============================================================
export function ProgressView({ t }) {
  const [boq, setBoq] = useState([]);
  const [items, setItems] = useState([]);
  const [wirs, setWirs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('boq'); // 'boq' | 'location'
  // Package filter (organizational only — same selector as the QS/BoQ page).
  const { packages, reload: reloadPackages } = usePackages();
  const [pkg, setPkg] = useState('all');
  const [pkgMgr, setPkgMgr] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    try {
      const [b, wi, w] = await Promise.all([listBoqItems().catch(() => []), listWorkItems().catch(() => []), listWirs().catch(() => [])]);
      setBoq(b); setItems(wi); setWirs(w);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Filter the line set by the selected package (display only — no math change).
  const lines = useMemo(() => boq.filter(isBoqLineItem).filter((b) => pkg === 'all' || (pkg === 'unassigned' ? !b.package_id : b.package_id === pkg)), [boq, pkg]);
  const boqById = useMemo(() => Object.fromEntries(lines.map((b) => [b.id, b])), [lines]);

  // Authoritative per-line numbers from the engine output (approved_qty).
  const byBoq = useMemo(() => lines.map((b) => {
    const qty = Number(b.qty || 0), approved = Number(b.approved_qty || 0), rate = Number(b.rate || 0);
    return { id: b.id, code: b.code, description: b.description, unit: b.unit, qty, approved, rate, certified: approved * rate, pct: qty ? Math.min(100, (approved / qty) * 100) : 0 };
  }), [lines]);

  // Per-location rollup from work items + their approved WIRs. % complete by VALUE.
  const byLocation = useMemo(() => {
    const approvedByWi = {};
    wirs.forEach((w) => { if (w.work_item_id && /approv/i.test(String(w.result || ''))) approvedByWi[w.work_item_id] = (approvedByWi[w.work_item_id] || 0) + (Number(w.approved_qty) || 0); });
    const groups = {};
    items.forEach((wi) => {
      const line = boqById[wi.boq_item_id];
      if (pkg !== 'all' && !line) return; // work item's line is outside the selected package
      const key = (wi.location || 'Unspecified').trim() || 'Unspecified';
      const g = groups[key] || (groups[key] = { location: key, count: 0, lineIds: new Set(), certified: 0 });
      g.count++;
      if (wi.boq_item_id) g.lineIds.add(wi.boq_item_id);
      if (line) g.certified += (approvedByWi[wi.id] || 0) * Number(line.rate || 0);
    });
    return Object.values(groups).map((g) => {
      const contractValue = [...g.lineIds].reduce((s, id) => { const l = boqById[id]; return s + (l ? Number(l.qty || 0) * Number(l.rate || 0) : 0); }, 0);
      return { ...g, lines: g.lineIds.size, contractValue, pct: contractValue ? Math.min(100, (g.certified / contractValue) * 100) : 0 };
    }).sort((a, b) => b.certified - a.certified);
  }, [items, wirs, boqById, pkg]);

  const totals = useMemo(() => ({
    contractValue: byBoq.reduce((s, r) => s + r.qty * r.rate, 0),
    certified: byBoq.reduce((s, r) => s + r.certified, 0),
    lines: byBoq.length,
    locations: byLocation.length,
  }), [byBoq, byLocation]);
  const overallPct = totals.contractValue ? Math.min(100, (totals.certified / totals.contractValue) * 100) : 0;

  function exportXlsx() {
    if (mode === 'boq') exportSheet({ fileName: 'Progress-by-BoQ', title: 'PROGRESS BY BOQ LINE', rows: byBoq, columns: [
      { label: 'Code', key: 'code', width: 16 }, { label: 'Description', key: 'description', width: 36, wrap: true }, { label: 'Unit', key: 'unit', width: 8 },
      { label: 'Contract Qty', key: 'qty', type: 'num', width: 14 }, { label: 'Eligible Qty', key: 'approved', type: 'num', width: 14 },
      { label: '% Complete', key: 'pct', type: 'num', width: 12 }, { label: 'Eligible value (SAR)', key: 'certified', type: 'money', width: 16, total: true },
    ] });
    else exportSheet({ fileName: 'Progress-by-location', title: 'PROGRESS BY LOCATION', rows: byLocation, columns: [
      { label: 'Location', key: 'location', width: 24 }, { label: 'Work Items', key: 'count', type: 'num', width: 12 }, { label: 'BoQ Lines', key: 'lines', type: 'num', width: 12 },
      { label: 'Contract Value (SAR)', key: 'contractValue', type: 'money', width: 18, total: true }, { label: 'Eligible value (SAR)', key: 'certified', type: 'money', width: 16, total: true }, { label: '% Complete', key: 'pct', type: 'num', width: 12 },
    ] });
  }

  const Bar = ({ pct, color }) => <div className="flex items-center gap-2"><div className="h-1.5 rounded-full overflow-hidden w-20" style={{ background: COL.surfaceAlt }}><div className="h-full" style={{ width: `${pct}%`, background: pct >= 100 ? '#16a34a' : (color || COL.accent) }} /></div><span className="mono text-[10px]" style={{ color: COL.textDim }}>{Math.round(pct)}%</span></div>;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Vocabulary note: everything here reads approved_qty × rate, which in
          the product's language is ELIGIBLE value — supported by approved WIRs,
          capped at contract. It is NOT the certified position (that lives in
          IPC headers). This screen used to say "Certified", which showed
          "Certified SAR 0" on a project whose real certified position was
          SAR 12.7M — exactly the previous/current/cumulative confusion the
          terminology pass exists to prevent. */}
      <PageHeader title="Progress — by BoQ & Location" subtitle="Contract vs eligible value by BoQ line and by location. Eligible = approved-WIR quantity × rate, capped at contract — certification happens in IPCs."
        actions={<><Btn icon={RotateCcw} onClick={load}>Refresh</Btn><Btn icon={Download} onClick={exportXlsx}>Export</Btn></>} />

      <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b" style={{ borderColor: COL.border, background: COL.surface }}>
        <KpiCard label="Contract Value" value={fmt(Math.round(totals.contractValue))} />
        <KpiCard label="Eligible value" value={fmt(Math.round(totals.certified))} accent="#15803d" progress={overallPct} hint={`${Math.round(overallPct)}% eligible`} />
        <KpiCard label="BoQ Lines" value={totals.lines} icon={Grid3x3} />
        <KpiCard label="Locations" value={totals.locations} />
      </div>

      <div className="px-6 py-3 border-b flex flex-wrap items-center gap-2" style={{ borderColor: COL.border, background: COL.surface }}>
        {[['boq', 'By BoQ line'], ['location', 'By location']].map(([m, l]) => (
          <button key={m} onClick={() => setMode(m)} className="px-3 py-1 text-xs rounded border" style={{ background: mode === m ? COL.accent : COL.surface, color: mode === m ? '#fff' : COL.text, borderColor: mode === m ? COL.accent : COL.border }}>{l}</button>
        ))}
        <div className="ms-2"><PackageBar packages={packages} value={pkg} onChange={setPkg} onManage={() => setPkgMgr(true)} /></div>
        <div className="mono text-[10px] ml-auto" style={{ color: COL.textDim }}>{mode === 'boq' ? `${byBoq.length} lines` : `${byLocation.length} locations`}{pkg !== 'all' ? ' · filtered' : ''}</div>
      </div>

      {!isSupabaseConfigured && <div className="mx-6 mt-3 text-xs px-3 py-2 rounded border" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>Supabase isn't configured.</div>}

      <div className="flex-1 overflow-y-auto overflow-x-auto scrollbar">
        {loading ? <div className="text-center text-xs py-10" style={{ color: COL.textMute }}>Loading…</div>
          : mode === 'boq' ? (
            byBoq.length === 0 ? <div className="text-center text-xs py-10" style={{ color: COL.textMute }}>No BoQ lines yet.</div> : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 mono" style={{ background: COL.surface, color: COL.textDim }}><tr style={{ borderBottom: `1px solid ${COL.border}` }}>{['Code', 'Description', 'Unit', 'Contract', 'Eligible', '% Complete', 'Eligible value (SAR)'].map((h) => <th key={h} className="px-4 py-2.5 text-left">{h}</th>)}</tr></thead>
                <tbody>
                  {byBoq.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-stone-50" style={{ borderColor: COL.border }}>
                      <td className="px-4 py-2.5 mono font-semibold" style={{ color: COL.accent }}>{r.code}</td>
                      <td className="px-4 py-2.5" style={{ color: COL.text }}>{r.description}</td>
                      <td className="px-4 py-2.5 mono text-[10px]" style={{ color: COL.textDim }}>{r.unit}</td>
                      <td className="px-4 py-2.5 mono text-right">{fmt(r.qty)}</td>
                      <td className="px-4 py-2.5 mono text-right font-semibold">{fmt(r.approved)}</td>
                      <td className="px-4 py-2.5"><Bar pct={r.pct} /></td>
                      <td className="px-4 py-2.5 mono text-right font-bold" style={{ color: '#15803d' }}>{fmt(Math.round(r.certified))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            byLocation.length === 0 ? <div className="text-center text-xs py-10" style={{ color: COL.textMute }}>No work items with locations yet. Create work items to see progress by location.</div> : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 mono" style={{ background: COL.surface, color: COL.textDim }}><tr style={{ borderBottom: `1px solid ${COL.border}` }}>{['Location', 'Work Items', 'BoQ Lines', 'Contract Value', '% Complete', 'Eligible value (SAR)'].map((h) => <th key={h} className="px-4 py-2.5 text-left">{h}</th>)}</tr></thead>
                <tbody>
                  {byLocation.map((r) => (
                    <tr key={r.location} className="border-b hover:bg-stone-50" style={{ borderColor: COL.border }}>
                      <td className="px-4 py-2.5 font-medium">{r.location}</td>
                      <td className="px-4 py-2.5 mono text-right">{r.count}</td>
                      <td className="px-4 py-2.5 mono text-right">{r.lines}</td>
                      <td className="px-4 py-2.5 mono text-right">{fmt(Math.round(r.contractValue))}</td>
                      <td className="px-4 py-2.5"><Bar pct={r.pct} /></td>
                      <td className="px-4 py-2.5 mono text-right font-bold" style={{ color: '#15803d' }}>{fmt(Math.round(r.certified))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
      </div>

      <PackageManagerModal open={pkgMgr} onClose={() => setPkgMgr(false)} packages={packages} onChanged={reloadPackages} />
    </div>
  );
}
