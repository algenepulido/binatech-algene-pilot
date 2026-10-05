import { useState, useEffect } from 'react';
import { BarChart3, RotateCcw } from 'lucide-react';
import { Btn, KpiCard, PageHeader } from '../components/primitives.jsx';
import { loadCounts, loadFinance, EMPTY_COUNTS } from '../lib/stats.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { fmtSAR, fmtMoney } from '../lib/format.js';
import { COL } from '../lib/theme.js';

// ============================================================
// REPORTS — live rollup of the whole project from real records.
// ============================================================
export function ReportsView({ t }) {
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [finance, setFinance] = useState({ total: 0, approvedValue: 0, pendingValue: 0, blockedValue: 0, certifiedIpc: 0, draftIpc: 0, paidInvoices: 0 });
  const [loading, setLoading] = useState(true);

  function load() {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    Promise.all([loadCounts(), loadFinance()]).then(([c, f]) => { setCounts(c); setFinance(f); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  const modules = [
    ['Work Inspection Requests', counts.totalWirs, `${counts.openWirs} open`],
    ['QC Tests', counts.totalQc, '—'],
    ['NCRs', counts.totalNcrs, `${counts.openNcrs} open`],
    ['Snags', counts.totalSnags, `${counts.openSnags} open`],
    ['Drawings', counts.totalDrawings, `${counts.drawingsPending} under review`],
    ['Documents (DMS)', counts.totalDocs, `${counts.docsPending} pending`],
    ['Bill of Quantities', counts.totalBoq, fmtSAR(finance.total)],
    ['IPCs', counts.totalIpcs, `${fmtSAR(finance.certifiedIpc)} certified (IPC)`],
    ['Invoices', counts.totalInvoices, `${fmtSAR(finance.paidInvoices)} paid`],
    ['Purchase Orders', counts.totalPos, '—'],
    ['Vendors', counts.totalVendors, '—'],
    ['Deliveries / SDN', counts.totalDeliveries, `${counts.pendingSdn} pending`],
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title={t.reports} subtitle="Live project rollup, generated from your real records"
        actions={<Btn icon={RotateCcw} onClick={load}>Refresh</Btn>} />
      <div className="flex-1 overflow-y-auto scrollbar p-6 space-y-5" style={{ background: COL.bg }}>
        {!isSupabaseConfigured && <div className="text-xs px-3 py-2 rounded border" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>Supabase isn't configured.</div>}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="BoQ value" value={fmtMoney(finance.total)} icon={BarChart3} hint="contract value (BoQ)" />
          <KpiCard label="Certified work value" value={fmtMoney(finance.approvedValue)} accent="#16a34a" hint="approved WIR value (BoQ-proven)" progress={finance.total ? (finance.approvedValue / finance.total) * 100 : 0} />
          <KpiCard label="Blocked (open NCRs)" value={fmtMoney(finance.blockedValue)} accent={finance.blockedValue > 0 ? '#dc2626' : undefined} hint="held by open NCRs" />
          <KpiCard label="Paid invoices" value={fmtMoney(finance.paidInvoices)} accent="#1d4ed8" hint="cleared client invoices" />
        </div>

        <div className="rounded-lg border overflow-hidden" style={{ background: COL.surface, borderColor: COL.border }}>
          <div className="px-5 py-3 border-b display text-sm font-bold" style={{ borderColor: COL.border }}>Records by module</div>
          {loading ? <div className="text-center text-xs py-10" style={{ color: COL.textMute }}>Loading…</div> : (
            <table className="w-full text-xs">
              <thead className="mono" style={{ color: COL.textDim }}>
                <tr style={{ borderBottom: `1px solid ${COL.border}` }}>
                  <th className="px-5 py-2 text-left">Module</th>
                  <th className="px-5 py-2 text-right">Total records</th>
                  <th className="px-5 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {modules.map(([name, total, note]) => (
                  <tr key={name} className="border-t hover:bg-stone-50" style={{ borderColor: '#f0ede0' }}>
                    <td className="px-5 py-2.5 font-medium">{name}</td>
                    <td className="px-5 py-2.5 mono text-right font-bold" style={{ color: COL.accent }}>{total}</td>
                    <td className="px-5 py-2.5 mono text-[11px]" style={{ color: COL.textDim }}>{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="text-[11px] leading-relaxed" style={{ color: COL.textMute }}>
          <span className="font-semibold" style={{ color: COL.textDim }}>What “certified” means here:</span> <b>Certified work value</b> is approved WIR value proven against the BoQ; <b>IPC certified</b> (IPCs row) is the value on issued Interim Payment Certificates. The two differ until certified work is composed into an IPC. <b>Paid invoices</b> is cleared client invoices.
        </div>
        <div className="text-[11px]" style={{ color: COL.textMute }}>Detailed PDF/CSV exports are added in a later step. These figures update live as records are added.</div>
      </div>
    </div>
  );
}
