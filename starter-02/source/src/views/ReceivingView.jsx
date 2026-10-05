import { useState, useEffect, useMemo, useCallback } from 'react';
import { confirmDialog } from '../components/ConfirmDialog.jsx';
import { toast } from '../components/Toast.jsx';
import { CheckCircle2, Download, Flag, FlaskConical, Hourglass, Pencil, Plus, RotateCcw, Trash2, Upload, X, XCircle } from 'lucide-react';
import { Btn, KpiCard, PageHeader, StatusPill } from '../components/primitives.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { Attachments } from '../components/Attachments.jsx';
import { DeliveryFormModal } from './receiving/DeliveryForm.jsx';
import { listDeliveries, updateDelivery, deleteDelivery, SDN_STATUSES } from '../api/deliveries.js';
import { listPurchaseOrders } from '../api/purchaseOrders.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';
import { COL } from '../lib/theme.js';
import { exportSheet } from '../lib/excelExport.js';

export function ReceivingView({ t }) {
  const { requireAuth } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const [pos, setPos] = useState([]);
  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setRows([]); setLoading(false); return; }
    setLoading(true); setError(null);
    try { setRows(await listDeliveries()); setPos(await listPurchaseOrders().catch(() => [])); }
    catch (err) { setError(err?.message ?? String(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Match a delivery to its PO (by po_ref → po_number) and flag unmatched
  // submissions + over-delivery qty mismatches. Flags only — never blocks.
  // Skips matching entirely when no PO data is available (can't verify).
  const canMatch = pos.length > 0;
  const num = (v) => { const n = Number(v); return isFinite(n) ? n : null; };
  const matchInfo = useCallback((d) => {
    if (!canMatch) return { matched: true, unmatched: false, mismatch: false, note: '' };
    const po = pos.find((p) => p.po_number && d.po_ref && String(p.po_number).trim() === String(d.po_ref).trim());
    const matched = !!po;
    const poQty = po ? num(po.qty) : null;
    const dQty = num(d.qty);
    let mismatch = false, note = '';
    if (matched && poQty != null && dQty != null && dQty > poQty * 1.001) { mismatch = true; note = `Delivered ${dQty} exceeds PO ${poQty}`; }
    return { matched, unmatched: !matched, mismatch, note, poQty };
  }, [pos, canMatch]);

  const counts = useMemo(() => ({
    pendingDn: rows.filter((d) => d.sdn_status === 'Pending DN').length,
    pendingSdn: rows.filter((d) => d.sdn_status === 'Pending SDN').length,
    pendingQc: rows.filter((d) => d.sdn_status === 'Pending QC').length,
    sameDay: rows.filter((d) => d.priority && d.sdn_status !== 'Approved').length,
    rejected: rows.filter((d) => d.sdn_status === 'Rejected').length,
    unmatched: rows.filter((d) => matchInfo(d).unmatched).length,
    mismatch: rows.filter((d) => matchInfo(d).mismatch).length,
  }), [rows, matchInfo]);

  const filtered = (filter === 'all' ? rows
    : filter === 'unmatched' ? rows.filter((d) => matchInfo(d).unmatched)
    : filter === 'mismatch' ? rows.filter((d) => matchInfo(d).mismatch)
    : rows.filter((d) => d.sdn_status === filter));

  function refreshSel(saved) { if (selected && saved?.id === selected.id) setSelected(saved); }
  function approve(d) { requireAuth(async () => { if (!await confirmDialog({ title: `Approve delivery ${d.dn_number}?`, message: 'Approving the system delivery note lets its quantities flow into supplier payment matching.', confirmLabel: 'Approve' })) return; try { const s = await updateDelivery(d.id, { sdn_status: 'Approved', sdn_date: new Date().toISOString().slice(0, 10) }); load(); refreshSel(s); } catch (e) { toast.error(e.message); } }); }
  function reject(d) { requireAuth(async () => { const reason = window.prompt('Rejection reason:'); if (reason === null) return; try { const s = await updateDelivery(d.id, { sdn_status: 'Rejected', rejection_reason: reason }); load(); refreshSel(s); } catch (e) { toast.error(e.message); } }); }
  function onDelete(d) { requireAuth(async () => { if (!await confirmDialog(`Delete ${d.dn_number}?`)) return; try { await deleteDelivery(d.id); setSelected(null); load(); } catch (e) { toast.error(e.message); } }); }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title="Receiving / SDN Workflow" subtitle="Deliveries, signed DN capture, system delivery note approval"
        actions={<><Btn icon={RotateCcw} onClick={load}>Refresh</Btn><Btn icon={Download} onClick={() => exportSheet({ fileName: 'Deliveries', title: 'RECEIVING / SDN', rows: filtered, columns: [
          { label: 'DN #', key: 'dn_number', width: 14 },
          { label: 'PO Ref', key: 'po_ref', width: 14 },
          { label: 'Vendor', key: 'vendor', width: 22 },
          { label: 'Items', key: 'items', width: 30, wrap: true },
          { label: 'Qty', key: 'qty', type: 'num', width: 10 },
          { label: 'Date', key: 'delivery_date', width: 12 },
          { label: 'SDN Status', key: 'sdn_status', width: 14 },
        ] })}>Export</Btn><Btn icon={Plus} variant="primary" onClick={() => requireAuth(() => { setEditing(null); setFormOpen(true); })}>Record Delivery</Btn></>} />
      <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 border-b" style={{ borderColor: COL.border, background: COL.surface }}>
        <KpiCard label="Pending DN Upload" value={counts.pendingDn} accent="#d97706" icon={Upload} />
        <KpiCard label="Pending SDN Approval" value={counts.pendingSdn} accent="#d97706" icon={Hourglass} />
        <KpiCard label="Pending QC" value={counts.pendingQc} accent={COL.accent} icon={FlaskConical} />
        <KpiCard label="Same-Day Priority" value={counts.sameDay} accent="#dc2626" icon={Flag} hint="Flagged critical" />
        <KpiCard label="Rejected" value={counts.rejected} accent="#dc2626" icon={XCircle} />
      </div>

      <div className="px-6 py-3 border-b flex flex-wrap items-center gap-2" style={{ borderColor: COL.border, background: COL.surface }}>
        {['all', ...SDN_STATUSES].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className="px-3 py-1 text-xs rounded border" style={{ background: filter === f ? COL.accent : COL.surface, color: filter === f ? '#fff' : COL.text, borderColor: filter === f ? COL.accent : COL.border }}>{f === 'all' ? 'All' : f}</button>
        ))}
        {canMatch && [['unmatched', `Unmatched (${counts.unmatched})`], ['mismatch', `Qty mismatch (${counts.mismatch})`]].map(([f, l]) => (
          <button key={f} onClick={() => setFilter(f)} className="px-3 py-1 text-xs rounded border font-medium" style={{ background: filter === f ? '#b91c1c' : '#fef2f2', color: filter === f ? '#fff' : '#b91c1c', borderColor: filter === f ? '#b91c1c' : '#fecaca' }}>{l}</button>
        ))}
        <div className="mono text-[10px] ml-auto" style={{ color: COL.textDim }}>{filtered.length} deliveries</div>
      </div>

      {canMatch && (counts.unmatched > 0 || counts.mismatch > 0) && (
        <div className="mx-6 mt-3 text-xs px-3 py-2 rounded border flex flex-wrap items-center gap-3" style={{ background: '#fef2f2', color: '#991b1b', borderColor: '#fecaca' }}>
          <Flag size={13} />
          {counts.unmatched > 0 && <span><b>{counts.unmatched}</b> unmatched submission{counts.unmatched === 1 ? '' : 's'} (no linked PO)</span>}
          {counts.mismatch > 0 && <span><b>{counts.mismatch}</b> qty mismatch{counts.mismatch === 1 ? '' : 'es'} (delivered &gt; PO) — flagged, not blocked</span>}
        </div>
      )}

      {!isSupabaseConfigured && <div className="mx-6 mt-3 text-xs px-3 py-2 rounded border" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>Supabase isn't configured. Add your keys to <span className="mono">.env</span> and restart the dev server.</div>}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto overflow-x-auto scrollbar">
          {loading ? <div className="text-center text-xs py-10" style={{ color: COL.textMute }}>Loading deliveries…</div>
            : error ? <div className="mx-6 my-4 text-xs px-3 py-2 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>
            : filtered.length === 0 ? (rows.length === 0 ? <EmptyState icon={Upload} title="No deliveries recorded"
                description="Record material deliveries against your purchase orders here, then issue the SDN once received and inspected."
                actions={[{ label: 'Record Delivery', icon: Plus, onClick: () => requireAuth(() => { setEditing(null); setFormOpen(true); }) }]} /> : <div className="text-center text-xs py-10" style={{ color: COL.textMute }}>No deliveries match this filter.</div>)
            : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 mono" style={{ background: COL.surface, color: COL.textDim }}><tr style={{ borderBottom: `1px solid ${COL.border}` }}>{['DN #', 'PO Ref', 'Vendor', 'Items', 'Qty', 'Date', 'Signed DN', 'SDN Status', 'Priority'].map((h) => <th key={h} className="px-4 py-2.5 text-left">{h}</th>)}</tr></thead>
                <tbody>
                  {filtered.map((d) => { const mi = matchInfo(d); return (
                    <tr key={d.id} onClick={() => setSelected(d)} className="border-b hover:bg-stone-50 cursor-pointer" style={{ borderColor: COL.border, background: selected?.id === d.id ? COL.accentBg : 'transparent' }}>
                      <td className="px-4 py-2.5 mono font-semibold" style={{ color: COL.accent }}>{d.dn_number}</td>
                      <td className="px-4 py-2.5 mono text-[11px]" style={{ color: mi.unmatched ? '#b91c1c' : COL.text }}>{d.po_ref || (canMatch ? '— none' : '')}</td>
                      <td className="px-4 py-2.5 font-medium">{d.vendor}</td>
                      <td className="px-4 py-2.5">{d.items}</td>
                      <td className="px-4 py-2.5 mono text-[11px]">{d.qty}</td>
                      <td className="px-4 py-2.5 mono text-[10px]" style={{ color: COL.textDim }}>{d.delivery_date}</td>
                      <td className="px-4 py-2.5 text-center">{d.signed_dn ? <CheckCircle2 size={14} style={{ color: '#16a34a', display: 'inline' }} /> : <XCircle size={14} style={{ color: '#dc2626', display: 'inline' }} />}</td>
                      <td className="px-4 py-2.5"><StatusPill status={d.sdn_status} /></td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col gap-1 items-start">
                          {d.priority && <span className="mono text-[9px] px-1.5 py-0.5 rounded font-bold flex items-center gap-1 w-fit" style={{ background: '#fee2e2', color: '#991b1b' }}><Flag size={9} /> SAME DAY</span>}
                          {mi.unmatched && <span className="mono text-[9px] px-1.5 py-0.5 rounded font-bold flex items-center gap-1 w-fit" style={{ background: '#f3e8ff', color: '#6b21a8' }}><Flag size={9} /> NO PO</span>}
                          {mi.mismatch && <span title={mi.note} className="mono text-[9px] px-1.5 py-0.5 rounded font-bold flex items-center gap-1 w-fit" style={{ background: '#fef3c7', color: '#b45309' }}><Flag size={9} /> QTY ⚠</span>}
                        </div>
                      </td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            )}
        </div>

        {selected && (
          <aside className="fixed inset-0 z-30 w-full lg:static lg:z-auto lg:w-96 border-l flex flex-col lg:flex-shrink-0" style={{ borderColor: COL.border, background: COL.surface }}>
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: COL.border }}>
              <div>
                <div className="mono text-[10px]" style={{ color: COL.textDim }}>DELIVERY DETAIL</div>
                <div className="display text-base font-bold mt-1">{selected.dn_number}</div>
                {selected.priority && <span className="mono text-[9px] mt-2 px-1.5 py-0.5 rounded font-bold flex items-center gap-1 w-fit" style={{ background: '#fee2e2', color: '#991b1b' }}><Flag size={9} /> SAME DAY PRIORITY</span>}
              </div>
              <button onClick={() => setSelected(null)}><X size={14} /></button>
            </div>
            <div className="p-5 space-y-3 text-xs flex-1 overflow-y-auto scrollbar">
              {[['PO Reference', selected.po_ref], ['Vendor', selected.vendor], ['Items', selected.items], ['Quantity', selected.qty], ['Delivery Date', selected.delivery_date], ['Signed DN', selected.signed_dn ? '✓ Uploaded' : '✗ Missing'], ['SDN #', selected.sdn_id || 'Not generated'], ['SDN Status', selected.sdn_status], ['SDN Approver', selected.sdn_approver || '—'], ['SDN Date', selected.sdn_date || '—'], ['QC Reference', selected.qc_ref || 'N/A']].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><span style={{ color: COL.textDim }}>{k}</span><span className={k.includes('#') || k === 'PO Reference' ? 'mono text-[11px]' : ''} style={{ color: COL.text, textAlign: 'right' }}>{v}</span></div>
              ))}
              {(() => { const mi = matchInfo(selected); if (!canMatch || (!mi.unmatched && !mi.mismatch)) return null; return (
                <div className="rounded p-3 border-l-4 border-y border-r mt-2" style={{ background: mi.unmatched ? '#f3e8ff' : '#fffbeb', borderLeftColor: mi.unmatched ? '#9333ea' : '#d97706', borderColor: mi.unmatched ? '#d8b4fe' : '#fcd34d' }}>
                  <div className="mono text-[10px] tracking-widest mb-1" style={{ color: mi.unmatched ? '#6b21a8' : '#b45309' }}>{mi.unmatched ? 'UNMATCHED — NO LINKED PO' : 'PO QTY MISMATCH'}</div>
                  <div className="text-[11px]" style={{ color: mi.unmatched ? '#581c87' : '#7c2d12' }}>{mi.unmatched ? 'This delivery has no matching purchase order. Link it to a PO so its invoice can pass the three-way match.' : `${mi.note} — flagged for review, not blocked.`}</div>
                </div>
              ); })()}
              {selected.rejection_reason && (
                <div className="rounded p-3 border-l-4 border-y border-r mt-2" style={{ background: '#fef2f2', borderLeftColor: '#dc2626', borderColor: '#fecaca' }}>
                  <div className="mono text-[10px] tracking-widest mb-1" style={{ color: '#991b1b' }}>REJECTION REASON</div>
                  <div className="text-[11px]" style={{ color: '#7f1d1d' }}>{selected.rejection_reason}</div>
                </div>
              )}
              {selected.sdn_status === 'Pending SDN' && (
                <div className="flex gap-2 pt-3 border-t mt-3" style={{ borderColor: COL.border }}>
                  <Btn variant="primary" icon={CheckCircle2} onClick={() => approve(selected)}>Approve SDN</Btn>
                  <Btn variant="secondary" icon={XCircle} onClick={() => reject(selected)}>Reject</Btn>
                </div>
              )}
              <div className="pt-3 border-t mt-3" style={{ borderColor: COL.border }}><Attachments recordType="delivery" recordId={selected.id} /></div>
              <div className="flex gap-2 pt-2"><Btn variant="primary" icon={Pencil} onClick={() => requireAuth(() => { setEditing(selected); setFormOpen(true); })}>Edit</Btn><Btn variant="secondary" icon={Trash2} onClick={() => onDelete(selected)}>Delete</Btn></div>
            </div>
          </aside>
        )}
      </div>

      <DeliveryFormModal open={formOpen} initial={editing} onClose={() => setFormOpen(false)} onSaved={(saved) => { setFormOpen(false); load(); refreshSel(saved); }} />
    </div>
  );
}
