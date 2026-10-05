import { useState, useEffect, useMemo, useCallback } from 'react';
import { confirmDialog } from '../components/ConfirmDialog.jsx';
import { toast } from '../components/Toast.jsx';
import { AlertCircle, Briefcase, Download, FileText, Pencil, Plus, RotateCcw, ShoppingCart, Trash2, Wallet, X } from 'lucide-react';
import { Btn, KpiCard, PageHeader, StatusPill } from '../components/primitives.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { Attachments } from '../components/Attachments.jsx';
import { PoFormModal } from './pos/PoForm.jsx';
import { VendorFormModal } from './pos/VendorForm.jsx';
import { listPurchaseOrders, deletePurchaseOrder } from '../api/purchaseOrders.js';
import { listVendors, deleteVendor } from '../api/vendors.js';
import { listSupplierInvoices, toCard } from '../api/supplierInvoices.js';
import { evaluatePackage } from '../lib/readinessEngine.js';
import { supabase } from '../lib/supabase.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { getCurrentProjectId } from '../lib/currentProject.js';
import { useAuth } from '../lib/auth.jsx';
import { fmt, fmtSAR, fmtMoney } from '../lib/format.js';
import { COL } from '../lib/theme.js';
import { exportSheet } from '../lib/excelExport.js';

const typeLabels = {
  permanent: { label: 'Permanent', color: '#1d4ed8', bg: '#dbeafe' },
  'non-permanent': { label: 'Non-Perm', color: '#7c3aed', bg: '#ede9fe' },
  subcontract: { label: 'Subcontract', color: '#0891b2', bg: '#cffafe' },
  service: { label: 'Service', color: '#059669', bg: '#d1fae5' },
  equipment: { label: 'Equipment', color: '#d97706', bg: '#fef3c7' },
  vehicle: { label: 'Vehicle', color: '#dc2626', bg: '#fee2e2' },
};
const FILTERS = {
  pos: (p) => p.type === 'permanent' || p.type === 'non-permanent',
  subs: (p) => p.type === 'subcontract',
  services: (p) => ['service', 'equipment', 'vehicle'].includes(p.type),
};

export function POsView({ t }) {
  const { requireAuth } = useAuth();
  const [pos, setPos] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('pos');
  const [selected, setSelected] = useState(null);
  const [poForm, setPoForm] = useState(false);
  const [poEditing, setPoEditing] = useState(null);
  const [vendorForm, setVendorForm] = useState(false);
  const [vendorEditing, setVendorEditing] = useState(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const [p, v] = await Promise.all([listPurchaseOrders(), listVendors()]);
      setPos(p); setVendors(v);
      // deliveries table may not exist yet (built in the Receiving step) — tolerate absence.
      // Scope to the current project so DN data can't leak across projects.
      const { data: d } = await supabase.from('deliveries').select('po_ref, qty, sdn_status').eq('project_id', getCurrentProjectId()).limit(1000);
      setDeliveries(d ?? []);
      setInvoices((await listSupplierInvoices().catch(() => [])).map(toCard));
    } catch (err) { setError(err?.message ?? String(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = tab === 'vendors' ? [] : pos.filter(FILTERS[tab]);

  // Link invoices to a PO by po_ref → po_number, and derive the commitment's
  // package readiness (worst state among its invoices). Read-only; reuses the engine.
  const STATE_SEVERITY = { booked: 0, ready_for_accounting: 1, draft: 2, pending_approval: 3, discrepancy: 4, missing_docs: 5, returned: 6 };
  const BLOCKED_STATES = new Set(['missing_docs', 'discrepancy', 'returned']);
  const poInvoices = useCallback((p) => invoices.filter((i) => i.poRef && p.po_number && String(i.poRef).trim() === String(p.po_number).trim()), [invoices]);
  const poReadiness = useCallback((p) => {
    const list = poInvoices(p);
    if (!list.length) return { count: 0, worst: null, invoiced: 0, blocked: 0 };
    let worst = null, worstSev = -1, blocked = 0, invoiced = 0;
    list.forEach((i) => {
      const ev = evaluatePackage(i, null);
      invoiced += Number(i.amount || 0);
      if (BLOCKED_STATES.has(ev.state)) blocked++;
      const sev = STATE_SEVERITY[ev.state] ?? 0;
      if (sev > worstSev) { worstSev = sev; worst = ev.stateMeta; }
    });
    return { count: list.length, worst, invoiced, blocked };
  }, [poInvoices]);

  const totals = useMemo(() => {
    const total = pos.reduce((s, p) => s + Number(p.value || 0), 0);
    const delivered = pos.reduce((s, p) => s + Number(p.value || 0) * (p.delivered_pct || 0) / 100, 0);
    const invoiced = invoices.reduce((s, i) => s + Number(i.amount || 0), 0);
    const blockedPackages = invoices.filter((i) => BLOCKED_STATES.has(evaluatePackage(i, null).state)).length;
    return { total, delivered, open: Math.max(0, total - delivered), invoiced, blockedPackages };
  }, [pos, invoices]);

  function onDeletePo(p) { requireAuth(async () => { if (!await confirmDialog(`Delete ${p.po_number}?`)) return; try { await deletePurchaseOrder(p.id); setSelected(null); load(); } catch (e) { toast.error(e.message); } }); }
  function onDeleteVendor(v) { requireAuth(async () => { if (!await confirmDialog(`Delete ${v.vendor_code}?`)) return; try { await deleteVendor(v.id); load(); } catch (e) { toast.error(e.message); } }); }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title="Procurement / Contracts" subtitle="POs, subcontracts, service agreements, vendor master"
        actions={<><Btn icon={RotateCcw} onClick={load}>Refresh</Btn><Btn icon={Download} onClick={() => exportSheet(tab === 'vendors'
          ? { fileName: 'Vendors', title: 'VENDORS & SUBCONTRACTORS', rows: vendors, columns: [
              { label: 'Code', key: 'vendor_code', width: 14 },
              { label: 'Vendor', key: 'name', width: 26 },
              { label: 'Type', key: 'type', width: 16 },
              { label: 'Category', key: 'category', width: 18 },
              { label: 'VAT No', key: 'vat_no', width: 18 },
              { label: 'Payment Terms', key: 'payment_terms', width: 16 },
              { label: 'Rating', key: 'rating', type: 'num', width: 10 },
            ] }
          : { fileName: 'Purchase-orders', title: 'PURCHASE ORDERS & CONTRACTS', rows: filtered, columns: [
              { label: 'PO No', key: 'po_number', width: 16 },
              { label: 'Vendor', key: 'vendor_name', width: 24 },
              { label: 'Type', key: 'type', width: 14 },
              { label: 'Description', key: 'description', width: 32, wrap: true },
              { label: 'Value (SAR)', key: 'value', type: 'money', width: 16, total: true },
              { label: 'Delivered %', key: 'delivered_pct', type: 'num', width: 12 },
              { label: 'Issued', key: 'issued_date', width: 12 },
            ] })}>Export</Btn>{tab === 'vendors' ? <Btn icon={Plus} variant="primary" onClick={() => requireAuth(() => { setVendorEditing(null); setVendorForm(true); })}>Add Vendor</Btn> : <Btn icon={Plus} variant="primary" onClick={() => requireAuth(() => { setPoEditing(null); setPoForm(true); })}>New PO</Btn>}</>} />

      <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 border-b" style={{ borderColor: COL.border, background: COL.surface }}>
        <KpiCard label="Total Committed" value={fmtMoney(totals.total)} icon={Wallet} />
        <KpiCard label="Open Commitment" value={fmtMoney(totals.open)} accent="#d97706" hint="Committed not yet delivered" />
        <KpiCard label="Delivered Value" value={fmtMoney(totals.delivered)} accent="#16a34a" progress={totals.total ? (totals.delivered / totals.total) * 100 : 0} hint={`${totals.total ? Math.round((totals.delivered / totals.total) * 100) : 0}% delivered`} />
        <KpiCard label="Invoiced" value={fmtMoney(totals.invoiced)} accent={COL.accent} icon={FileText} hint="Supplier invoices against commitments" />
        <KpiCard label="Blocked Packages" value={totals.blockedPackages} accent="#dc2626" icon={AlertCircle} hint="Invoices missing docs / discrepancy / returned" />
        <KpiCard label="Open POs" value={pos.length} icon={ShoppingCart} />
      </div>

      <div className="flex border-b" style={{ borderColor: COL.border, background: COL.surface }}>
        {[{ id: 'pos', label: 'POs (Materials)' }, { id: 'subs', label: 'Subcontracts' }, { id: 'services', label: 'Services / Equipment / Rental' }, { id: 'vendors', label: 'Vendor Master' }].map((tb) => (
          <button key={tb.id} onClick={() => { setTab(tb.id); setSelected(null); }} className="px-5 py-3 text-sm font-medium" style={{ color: tab === tb.id ? COL.accent : COL.textDim, borderBottom: tab === tb.id ? `2px solid ${COL.accent}` : '2px solid transparent', background: tab === tb.id ? COL.bg : 'transparent' }}>{tb.label}</button>
        ))}
      </div>

      {!isSupabaseConfigured && <div className="mx-6 mt-3 text-xs px-3 py-2 rounded border" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>Supabase isn't configured. Add your keys to <span className="mono">.env</span> and restart the dev server.</div>}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto overflow-x-auto scrollbar">
          {loading ? <div className="text-center text-xs py-10" style={{ color: COL.textMute }}>Loading…</div>
            : error ? <div className="mx-6 my-4 text-xs px-3 py-2 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>
            : tab === 'vendors' ? (
              vendors.length === 0 ? <EmptyState icon={Briefcase} title="No vendors yet"
                description="Your vendor & subcontractor register. Add them here so you can raise POs and they can submit invoices through the portal."
                actions={[{ label: 'Add Vendor', icon: Plus, onClick: () => requireAuth(() => { setVendorEditing(null); setVendorForm(true); }) }]} /> : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 mono" style={{ background: COL.surface, color: COL.textDim }}><tr style={{ borderBottom: `1px solid ${COL.border}` }}>{['Vendor', 'Name', 'Category', 'Type', 'VAT Reg #', 'Rating', 'Payment Terms', ''].map((h) => <th key={h} className="px-4 py-2.5 text-left">{h}</th>)}</tr></thead>
                  <tbody>
                    {vendors.map((v) => (
                      <tr key={v.id} className="border-b hover:bg-stone-50" style={{ borderColor: COL.border }}>
                        <td className="px-4 py-2.5 mono font-semibold" style={{ color: COL.accent }}>{v.vendor_code}</td>
                        <td className="px-4 py-2.5 font-medium">{v.name}</td>
                        <td className="px-4 py-2.5" style={{ color: COL.textDim }}>{v.category}</td>
                        <td className="px-4 py-2.5"><span className="mono text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: typeLabels[v.type]?.bg, color: typeLabels[v.type]?.color }}>{typeLabels[v.type]?.label || v.type}</span></td>
                        <td className="px-4 py-2.5 mono text-[10px]" style={{ color: COL.textDim }}>{v.vat_no}</td>
                        <td className="px-4 py-2.5 mono text-right font-semibold">{v.rating ?? '—'}</td>
                        <td className="px-4 py-2.5 mono text-[10px]" style={{ color: COL.textDim }}>{v.payment_terms}</td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <button onClick={() => requireAuth(() => { setVendorEditing(v); setVendorForm(true); })} className="p-1 rounded hover:bg-stone-100" style={{ color: COL.accent }}><Pencil size={12} /></button>
                          <button onClick={() => onDeleteVendor(v)} className="p-1 rounded hover:bg-stone-100" style={{ color: '#b91c1c' }}><Trash2 size={12} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : filtered.length === 0 ? <EmptyState icon={ShoppingCart} title="No purchase orders yet"
                description="Track purchase orders and subcontracts here, then receive deliveries against them in Receiving / SDN."
                steps={['Raise a PO to a vendor', 'Record deliveries against it', 'Match invoices to the PO']}
                actions={[{ label: 'New PO', icon: Plus, onClick: () => requireAuth(() => { setPoEditing(null); setPoForm(true); }) }]} /> : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 mono" style={{ background: COL.surface, color: COL.textDim }}><tr style={{ borderBottom: `1px solid ${COL.border}` }}>{['PO / SC #', 'Type', 'Vendor', 'Description', 'Value (SAR)', 'Balance', 'Delivered', 'Packages', 'Issued'].map((h) => <th key={h} className="px-4 py-2.5 text-left">{h}</th>)}</tr></thead>
                <tbody>
                  {filtered.map((p) => {
                    const tl = typeLabels[p.type] ?? { label: p.type, color: COL.text, bg: COL.surfaceAlt };
                    const balance = Number(p.value || 0) * (1 - (p.delivered_pct || 0) / 100);
                    const r = poReadiness(p);
                    return (
                      <tr key={p.id} onClick={() => setSelected(p)} className="border-b hover:bg-stone-50 cursor-pointer" style={{ borderColor: COL.border, background: selected?.id === p.id ? COL.accentBg : 'transparent' }}>
                        <td className="px-4 py-2.5 mono font-semibold" style={{ color: COL.accent }}>{p.po_number}</td>
                        <td className="px-4 py-2.5"><span className="mono text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: tl.bg, color: tl.color }}>{tl.label}</span></td>
                        <td className="px-4 py-2.5 font-medium">{p.vendor_name}</td>
                        <td className="px-4 py-2.5" style={{ color: COL.text }}>{p.description}</td>
                        <td className="px-4 py-2.5 mono text-right font-bold">{fmt(p.value)}</td>
                        <td className="px-4 py-2.5 mono text-right" style={{ color: COL.textDim }}>{fmt(balance)}</td>
                        <td className="px-4 py-2.5"><div className="flex items-center gap-2"><div className="h-1.5 rounded-full overflow-hidden w-16" style={{ background: COL.surfaceAlt }}><div className="h-full" style={{ width: `${p.delivered_pct || 0}%`, background: (p.delivered_pct || 0) === 100 ? '#16a34a' : COL.accent }} /></div><span className="mono text-[10px]" style={{ color: COL.textDim }}>{p.delivered_pct || 0}%</span></div></td>
                        <td className="px-4 py-2.5">{r.count === 0 ? <span className="mono text-[10px]" style={{ color: COL.textMute }}>—</span> : <span title={`${r.count} invoice package${r.count === 1 ? '' : 's'}${r.blocked ? ` · ${r.blocked} blocked` : ''}`} className="mono text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: r.worst?.bg || COL.surfaceAlt, color: r.worst?.color || COL.textDim }}>{r.count}× {r.worst?.label || ''}</span>}</td>
                        <td className="px-4 py-2.5 mono text-[10px]" style={{ color: COL.textDim }}>{p.issued_date}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
        </div>

        {selected && (
          <aside className="fixed inset-0 z-30 w-full lg:static lg:z-auto lg:w-96 border-l flex flex-col lg:flex-shrink-0" style={{ borderColor: COL.border, background: COL.surface }}>
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: COL.border }}>
              <div><div className="mono text-[10px]" style={{ color: COL.textDim }}>PO DETAIL</div><div className="display text-base font-bold mt-1">{selected.po_number}</div><div className="text-xs mt-0.5" style={{ color: COL.textDim }}>{selected.vendor_name}</div></div>
              <button onClick={() => setSelected(null)}><X size={14} /></button>
            </div>
            <div className="p-5 space-y-3 text-xs flex-1 overflow-y-auto scrollbar">
              {[['Description', selected.description], ['Type', typeLabels[selected.type]?.label], ['Linked BoQ', selected.linked_boq], ['Linked Elements', selected.linked_elements?.length ? selected.linked_elements.join(', ') : '—'], ['Total Value', 'SAR ' + fmt(selected.value)], ['Delivered', `${selected.delivered_pct || 0}%`], ['Issued Date', selected.issued_date], ['Bill To', selected.bill_to], ['Status', selected.status]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><span style={{ color: COL.textDim, flexShrink: 0 }}>{k}</span><span className={k === 'Linked Elements' || k === 'Linked BoQ' ? 'mono text-[10px]' : ''} style={{ color: COL.text, textAlign: 'right' }}>{v || '—'}</span></div>
              ))}
              <div className="pt-3 border-t mt-3" style={{ borderColor: COL.border }}>
                <div className="mono text-[10px] tracking-widest mb-2" style={{ color: COL.textDim }}>RELATED DELIVERIES</div>
                {deliveries.filter((d) => d.po_ref === selected.po_number).map((d, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b text-[11px]" style={{ borderColor: COL.border }}><span className="mono text-[10px]" style={{ color: COL.textDim }}>{d.qty}</span><StatusPill status={d.sdn_status} /></div>
                ))}
                {deliveries.filter((d) => d.po_ref === selected.po_number).length === 0 && <div className="text-[11px]" style={{ color: COL.textMute }}>No deliveries yet</div>}
              </div>
              <div className="pt-3 border-t mt-3" style={{ borderColor: COL.border }}>
                <div className="mono text-[10px] tracking-widest mb-2" style={{ color: COL.textDim }}>RELATED INVOICES</div>
                {poInvoices(selected).map((i) => { const ev = evaluatePackage(i, null); return (
                  <div key={i.rowId || i.id} className="flex items-center justify-between gap-2 py-1.5 border-b text-[11px]" style={{ borderColor: COL.border }}>
                    <span className="mono text-[10px]" style={{ color: COL.accent }}>{i.id}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="mono text-[10px]" style={{ color: COL.textDim }}>{fmt(i.amount)}</span>
                      <span className="mono text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: ev.stateMeta.bg, color: ev.stateMeta.color }}>{ev.stateMeta.label}</span>
                    </span>
                  </div>
                ); })}
                {poInvoices(selected).length === 0 && <div className="text-[11px]" style={{ color: COL.textMute }}>No invoices yet</div>}
              </div>
              <div className="pt-3 border-t mt-3" style={{ borderColor: COL.border }}><Attachments recordType="po" recordId={selected.id} /></div>
              <div className="flex gap-2 pt-2"><Btn variant="primary" icon={Pencil} onClick={() => requireAuth(() => { setPoEditing(selected); setPoForm(true); })}>Edit</Btn><Btn variant="secondary" icon={Trash2} onClick={() => onDeletePo(selected)}>Delete</Btn></div>
            </div>
          </aside>
        )}
      </div>

      <PoFormModal open={poForm} initial={poEditing} onClose={() => setPoForm(false)} onSaved={(saved) => { setPoForm(false); load(); if (selected && saved?.id === selected.id) setSelected(saved); }} />
      <VendorFormModal open={vendorForm} initial={vendorEditing} onClose={() => setVendorForm(false)} onSaved={() => { setVendorForm(false); load(); }} />
    </div>
  );
}
