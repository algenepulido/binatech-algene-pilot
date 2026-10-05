import { useState, useEffect, useCallback } from 'react';
import { Download, Plus, RotateCcw, AlertOctagon } from 'lucide-react';
import { Btn, PageHeader, StatusPill } from '../components/primitives.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { elementByGuid } from '../components/ElementPicker.jsx';
import { NcrFormModal } from './ncrs/NcrForm.jsx';
import { NcrDetailModal } from './ncrs/NcrDetail.jsx';
import { listNcrs } from '../api/ncrs.js';
import { ncrSeverityLabel, ncrStatusLabel } from '../lib/ncrStatus.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';
import { usePermissions } from '../lib/usePermissions.jsx';
import { fmt } from '../lib/format.js';
import { COL } from '../lib/theme.js';
import { exportSheet } from '../lib/excelExport.js';

// ============================================================
// NCRs VIEW — real CRUD backed by Supabase.
// ============================================================
export function NCRsView({ t, onSelectElement, setRoute }) {
  const { requireAuth } = useAuth();
  const { can } = usePermissions();
  const canRaiseNcr = can('ncr.edit');
  const [ncrs, setNcrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  // An NCR log is worked by state, not read end-to-end: open items first, then
  // the critical ones. Filter state survives the detail drawer opening.
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setNcrs([]); setLoading(false); return; }
    setLoading(true); setError(null);
    try { setNcrs(await listNcrs()); }
    catch (err) { setError(err?.message ?? String(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const isClosed = (n) => /clos|clear|resolv|verif|void|cancel/i.test(String(n.status || ''));
  const FILTERS = [
    { key: 'all', label: 'All', match: () => true },
    { key: 'open', label: 'Open', match: (n) => !isClosed(n) },
    { key: 'critical', label: 'Critical', match: (n) => /critical|major/i.test(String(n.severity || '')) && !isClosed(n) },
    { key: 'cost', label: 'Cost impact', match: (n) => Number(n.cost_impact) > 0 },
    { key: 'closed', label: 'Closed', match: (n) => isClosed(n) },
  ];
  const shown = ncrs.filter(FILTERS.find((f) => f.key === filter)?.match ?? (() => true));

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title={t.ncrs} subtitle="Non-Conformance Reports"
        actions={<><Btn icon={RotateCcw} onClick={load}>Refresh</Btn><Btn icon={Download} onClick={() => exportSheet({ fileName: 'NCRs', title: 'NON-CONFORMANCE REPORTS', rows: ncrs, columns: [
          { label: 'NCR No', key: 'ncr_number', width: 12 },
          { label: 'Severity', key: 'severity', width: 12 },
          { label: 'Status', key: 'status', width: 12 },
          { label: 'Element', key: 'element_guid', width: 22 },
          { label: 'Drawing', key: 'drawing_ref', width: 16 },
          { label: 'Date', key: 'ncr_date', width: 12 },
          { label: 'Raised By', key: 'raised_by', width: 18 },
          { label: 'Linked WIR', key: 'linked_wir', width: 14 },
          { label: 'Cost Impact', key: 'cost_impact', type: 'money', width: 14, total: true },
          { label: 'Description', key: 'description', width: 40, wrap: true },
        ] })}>Export</Btn>{canRaiseNcr && <Btn icon={Plus} variant="primary" onClick={() => requireAuth(() => setAddOpen(true))}>{t.raiseNcr}</Btn>}</>} />

      {!isSupabaseConfigured && (
        <div className="mx-6 mt-3 text-xs px-3 py-2 rounded border" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>
          Supabase isn't configured. Add your keys to <span className="mono">.env</span> and restart the dev server.
        </div>
      )}

      {!loading && !error && ncrs.length > 0 && (
        <div className="px-6 pt-4 flex items-center gap-1.5 flex-wrap">
          {FILTERS.map((f) => {
            const count = ncrs.filter(f.match).length;
            const active = filter === f.key;
            return (
              <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={active}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors"
                style={active
                  ? { background: COL.accent, color: '#fff', borderColor: COL.accent }
                  : { background: COL.surface, color: COL.textDim, borderColor: COL.border }}>
                {f.label} <span className="mono text-[10.5px] opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar p-6 space-y-3">
        {loading ? (
          <div className="text-center text-xs py-10" style={{ color: COL.textMute }}>Loading NCRs…</div>
        ) : error ? (
          <div className="text-xs px-3 py-2 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>
        ) : ncrs.length === 0 ? (
          <EmptyState icon={AlertOctagon} title="No non-conformances"
            description="Log non-conformances here. An open NCR stops its element being certified until it's closed — so payment can't run on unproven work."
            steps={['Raise an NCR against an element', 'Track it to closure', 'Closing it unblocks certification']}
            actions={canRaiseNcr ? [{ label: t.raiseNcr, icon: Plus, onClick: () => requireAuth(() => setAddOpen(true)) }] : []} />
        ) : (
          // Register, not a card stack: an NCR log is scanned — which are open,
          // how severe, what do they cost — and colour is reserved for the
          // severity/status columns instead of flooding every row.
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: COL.border, background: COL.surface }}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: 860 }}>
                <thead className="mono text-[11px] uppercase tracking-wide" style={{ background: COL.surfaceAlt, color: COL.textDim }}>
                  <tr style={{ borderBottom: `1px solid ${COL.border}` }}>
                    <th className="px-4 py-2.5 text-start font-semibold">NCR No.</th>
                    <th className="px-4 py-2.5 text-start font-semibold">Severity</th>
                    <th className="px-4 py-2.5 text-start font-semibold">Status</th>
                    <th className="px-4 py-2.5 text-start font-semibold">Element</th>
                    <th className="px-4 py-2.5 text-start font-semibold">Linked WIR</th>
                    <th className="px-4 py-2.5 text-start font-semibold">Drawing</th>
                    <th className="px-4 py-2.5 text-start font-semibold">Raised by</th>
                    <th className="px-4 py-2.5 text-start font-semibold">Date</th>
                    <th className="px-4 py-2.5 text-end font-semibold">Cost impact</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((n) => {
                    const el = elementByGuid(n.element_guid);
                    const open = detail?.id === n.id;
                    return (
                      <tr key={n.id} onClick={() => setDetail(n)} aria-selected={open}
                        className={`border-b cursor-pointer ${open ? '' : 'hover:bg-stone-50'}`}
                        style={{ borderColor: COL.border, background: open ? COL.accentBg : undefined, boxShadow: open ? `inset 3px 0 0 ${COL.accent}` : undefined }}>
                        <td className="px-4 py-2.5 mono font-semibold whitespace-nowrap" style={{ color: COL.accent }}>{n.ncr_number}</td>
                        <td className="px-4 py-2.5"><StatusPill status={ncrSeverityLabel(n.severity)} /></td>
                        <td className="px-4 py-2.5"><StatusPill status={ncrStatusLabel(n.status)} /></td>
                        <td className="px-4 py-2.5 max-w-[220px] truncate" title={el ? `${el.id} · ${el.name}` : n.element_guid || ''} style={{ color: COL.text }}>{el ? `${el.id} · ${el.name}` : (n.element_guid || '—')}</td>
                        <td className="px-4 py-2.5 mono text-[11px]" style={{ color: n.linked_wir ? COL.text : COL.textMute }}>{n.linked_wir || '—'}</td>
                        <td className="px-4 py-2.5 mono text-[11px]" style={{ color: n.drawing_ref ? COL.text : COL.textMute }}>{n.drawing_ref || '—'}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: n.raised_by ? COL.text : COL.textMute }}>{n.raised_by || '—'}</td>
                        <td className="px-4 py-2.5 mono text-[11px] whitespace-nowrap" style={{ color: COL.textDim }}>{n.ncr_date || '—'}</td>
                        <td className="px-4 py-2.5 mono text-end font-semibold whitespace-nowrap" style={{ color: Number(n.cost_impact) > 0 ? '#dc2626' : COL.textMute }}>{Number(n.cost_impact) > 0 ? `SAR ${fmt(n.cost_impact)}` : '—'}</td>
                      </tr>
                    );
                  })}
                  {shown.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-10 text-center text-[12px]" style={{ color: COL.textMute }}>No NCRs in this filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <NcrFormModal open={addOpen} initial={null} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); }} />
      <NcrDetailModal open={Boolean(detail)} ncr={detail} onClose={() => setDetail(null)} onChanged={() => { load(); setDetail(null); }} onSelectElement={onSelectElement} setRoute={setRoute} />
    </div>
  );
}
