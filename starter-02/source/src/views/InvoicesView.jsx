import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { confirmDialog } from '../components/ConfirmDialog.jsx';
import { toast } from '../components/Toast.jsx';
import { Download, FileCheck, Pencil, Plus, RotateCcw, Trash2, ShieldAlert, ArrowRight, Check, X as XIcon, AlertTriangle } from 'lucide-react';
import { Btn, KpiCard, PageHeader, StatusPill } from '../components/primitives.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { Modal } from '../components/Modal.jsx';
import { Drawer } from '../components/Drawer.jsx';
import { Attachments } from '../components/Attachments.jsx';
import { InvoiceWirLinks } from '../components/InvoiceWirLinks.jsx';
import { InvoiceFormModal } from './invoices/InvoiceForm.jsx';
import { listInvoices, deleteInvoice } from '../api/invoices.js';
import { listIpcs } from '../api/ipcs.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';
import { fmt, fmtSAR } from '../lib/format.js';
import { COL } from '../lib/theme.js';
import { exportSheet } from '../lib/excelExport.js';

// The approved frames show invoice amounts to 2 decimals and dates as "14 Feb 2026".
// The 2 decimals are not decoration: SYN-INV-A-0001 stores 48,250.5 and the register
// was rounding it to 48,251, so half a riyal disappeared between the row and the form.
const money2 = (n) => (n == null || n === '' || Number.isNaN(Number(n))
  ? '\u2014'
  : new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n)));
const dmy = (iso) => {
  if (!iso) return '\u2014';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en-US', { month: 'short' })} ${d.getFullYear()}`;
};

function ComplianceRow({ ok, warn, label }) {
  const c = ok ? '#15803d' : warn ? '#b45309' : '#991b1b';
  const Icon = ok ? Check : warn ? AlertTriangle : XIcon;
  return <div className="flex items-center gap-2 text-[12px]" style={{ color: COL.text }}><Icon size={13} style={{ color: c, flexShrink: 0 }} /> {label}</div>;
}

export function InvoicesView({ t }) {
  const { requireAuth } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  // Every open mounts a fresh form. The form seeds its fields from `initial` on its
  // first render only, so a form kept alive across records shows whatever it was
  // seeded with the first time — empty, because nothing was selected then. Keying
  // the modal on this counter ends that: Edit, New and New from IPC each get their
  // own instance seeded from their own record. It changes only on open, so an
  // ordinary rerender while someone is typing never remounts the form.
  const [formSeq, setFormSeq] = useState(0);
  const openForm = useCallback((record) => { setEditing(record); setFormSeq((n) => n + 1); setFormOpen(true); }, []);
  const [ipcs, setIpcs] = useState([]);
  const [fromIpc, setFromIpc] = useState(false);
  const listRef = useRef(null);
  const openerRef = useRef(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setInvoices([]); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      setInvoices(await listInvoices());
      listIpcs().then(setIpcs).catch(() => setIpcs([]));
    }
    catch (err) { setError(err?.message ?? String(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Certified IPCs are the only valid basis for a client invoice. "Invoiceable
  // now" = their net value minus what's already been invoiced.
  const certifiedIpcs = useMemo(() => ipcs.filter((p) => p.status === 'certified' || p.status === 'paid'), [ipcs]);

  const k = useMemo(() => {
    const sum = (f) => invoices.filter(f).reduce((s, i) => s + Number(i.amount || 0), 0);
    const cleared = invoices.filter((i) => i.zatca_status === 'Cleared').length;
    return {
      total: sum(() => true),
      paid: sum((i) => i.payment_status === 'Paid'),
      outstanding: sum((i) => i.payment_status === 'Pending' || i.payment_status === 'Overdue'),
      cleared, count: invoices.length,
    };
  }, [invoices]);

  const invoiceableNow = useMemo(() => {
    const certified = certifiedIpcs.reduce((s, p) => s + Number(p.net_payable || 0), 0);
    return Math.max(0, certified - k.total);
  }, [certifiedIpcs, k.total]);

  // One way into an invoice for keyboard and pointer alike: its reference
  // button (Tab, then Enter or Space) or a click anywhere on its row. The
  // button has no handler of its own — its click bubbles to the row — and it
  // takes focus before the drawer opens, so the drawer hands focus back to it.
  function openDetail(inv, row) {
    openerRef.current = row.querySelector('[data-invoice-open]');
    openerRef.current?.focus({ preventScroll: true });
    setDetail(inv);
  }

  // A reload (saving an edit) swaps the list for its loading state, replacing
  // every invoice button — including the one the open drawer would return to.
  // Closing then hands focus to the same invoice's current button, found by its
  // id, and scrolls it into view (the reload reset the list's scroll). With no
  // such button yet, the drawer's own page fallback applies.
  function closeDetail() {
    const opener = openerRef.current;
    if (opener && !opener.isConnected) [...(listRef.current?.querySelectorAll('[data-invoice-open]') ?? [])].find((b) => b.dataset.invoiceOpen === opener.dataset.invoiceOpen)?.focus();
    setDetail(null);
  }

  // Deleting reloads the list too, and the drawer may already have closed onto
  // the deleted invoice while the request was pending: focus still inside the
  // list moves to the page's content landmark before the reload replaces it,
  // instead of dropping to the page body. Focus anywhere else stays put.
  function onDelete(inv) { requireAuth(async () => { if (!await confirmDialog(`Delete ${inv.invoice_number}?`)) return; try { await deleteInvoice(inv.id); if (listRef.current?.contains(document.activeElement)) document.getElementById('main-content')?.focus({ preventScroll: true }); setDetail(null); load(); } catch (e) { toast.error(e.message); } }); }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title={t.invoices} subtitle="Invoice register with ZATCA Phase 2 compliance"
        actions={<><Btn icon={RotateCcw} onClick={load}>Refresh</Btn><Btn icon={Download} onClick={() => exportSheet({ fileName: 'Client-invoices', title: 'CLIENT INVOICE REGISTER', rows: invoices, columns: [
          { label: 'Invoice #', key: 'invoice_number', width: 16 },
          { label: 'Linked WIR', key: 'wir_number', width: 14 },
          { label: 'Element', key: 'element_guid', width: 20 },
          { label: 'Issue Date', key: 'issue_date', width: 12 },
          { label: 'Due Date', key: 'due_date', width: 12 },
          { label: 'Amount (SAR)', key: 'amount', type: 'money', width: 15, total: true },
          { label: 'ZATCA Status', key: 'zatca_status', width: 14 },
          { label: 'Payment Status', key: 'payment_status', width: 14 },
          { label: 'Paid Date', key: 'paid_date', width: 12 },
        ] })}>Export</Btn>{certifiedIpcs.length > 0 && <Btn icon={FileCheck} onClick={() => requireAuth(() => setFromIpc(true))}>New from IPC</Btn>}<Btn icon={Plus} variant="primary" onClick={() => requireAuth(() => openForm(null))}>New Invoice</Btn></>} />

      {invoiceableNow > 0 && (
        <div className="mx-6 mt-3 rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center gap-2.5" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
          <FileCheck size={16} className="flex-shrink-0" style={{ color: '#15803d' }} />
          <div className="flex-1 text-[13px]" style={{ color: '#15803d' }}><b>SAR {fmt(invoiceableNow)}</b> invoiceable now from {certifiedIpcs.length} certified IPC{certifiedIpcs.length === 1 ? '' : 's'} — certified value not yet invoiced.</div>
          <Btn icon={ArrowRight} variant="primary" onClick={() => requireAuth(() => setFromIpc(true))}>New from IPC</Btn>
        </div>
      )}
      {invoices.length > 0 && (
        <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b" style={{ borderColor: COL.border, background: COL.surface }}>
          <KpiCard label="Total Invoiced" value={fmtSAR(k.total)} accent={COL.text} />
          <KpiCard label="Paid" value={fmtSAR(k.paid)} accent="#16a34a" />
          <KpiCard label="Outstanding" value={fmtSAR(k.outstanding)} accent="#d97706" />
          <KpiCard label="ZATCA Cleared" value={`${k.cleared} / ${k.count}`} accent={COL.accent} />
        </div>
      )}

      {!isSupabaseConfigured && <div className="mx-6 mt-3 text-xs px-3 py-2 rounded border" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>Supabase isn't configured. Add your keys to <span className="mono">.env</span> and restart the dev server.</div>}

      <div ref={listRef} className="flex-1 overflow-y-auto overflow-x-auto scrollbar">
        {loading ? <div className="text-center text-xs py-10" style={{ color: COL.textMute }}>Loading invoices…</div>
          : error ? (
            /* The frames specify a read-error state with Try again, and the rule is that a
               failed read never reads as an empty register. Says what is not shown and why,
               announces itself, and offers the one action that can help. Modelled on the
               Commercial Control error block so the two screens behave the same way. */
            <div role="alert" className="mx-6 my-4 rounded-md border px-4 py-5 flex flex-col sm:flex-row sm:items-center gap-3" style={{ background: '#fef3f2', borderColor: '#fecdca', color: '#7a271a' }}>
              <AlertTriangle size={18} className="flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold">Invoices could not be loaded.</div>
                <div className="text-[12.5px] mt-0.5">No invoices are listed, because none could be read from the project records. This is not an empty register.</div>
              </div>
              <Btn icon={RotateCcw} variant="primary" onClick={load}>Try again</Btn>
            </div>
          )
          : invoices.length === 0 ? <EmptyState icon={FileCheck} title="No client invoices yet"
              description={invoiceableNow > 0 ? `SAR ${fmt(invoiceableNow)} is invoiceable now from your certified IPCs. Invoices are issued from certified work only — each traces back to its IPC, BoQ and proven WIRs.` : 'Issue invoices backed by certified work only. Certify an IPC first, then invoice from it — each invoice traces back to its proof.'}
              steps={['Certify an IPC from approved work', 'Create the invoice from that IPC', 'Clear it in Fatoora, then track payment']}
              actions={[
                ...(certifiedIpcs.length > 0 ? [{ label: 'New from IPC', icon: FileCheck, onClick: () => requireAuth(() => setFromIpc(true)) }] : []),
                { label: 'New Invoice', icon: Plus, variant: certifiedIpcs.length > 0 ? 'secondary' : 'primary', onClick: () => requireAuth(() => openForm(null)) },
              ]} />
          : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 mono" style={{ background: COL.surface, color: COL.textMute }}><tr style={{ borderBottom: `1px solid ${COL.border}` }}>{['Invoice #', 'Linked WIR', 'Issue Date', 'Due Date', 'Amount (SAR)', 'ZATCA Status', 'Payment Status', 'Paid Date'].map((h) => <th key={h} className={`px-4 py-2 text-[10px] uppercase tracking-wider font-semibold ${h === 'Amount (SAR)' ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} onClick={(e) => openDetail(inv, e.currentTarget)} className="border-b hover:bg-stone-50 cursor-pointer" style={{ borderColor: COL.border }}>
                    <td className="px-4 py-2.5 mono font-semibold" style={{ color: COL.accent }}><button type="button" data-invoice-open={inv.id} aria-label={`Open invoice ${inv.invoice_number}`} className="text-start">{inv.invoice_number}</button></td>
                    <td className="px-4 py-2.5 mono text-[11px]">{inv.wir_number || inv.element_guid || '—'}</td>
                    <td className="px-4 py-2.5 mono text-[10.5px] whitespace-nowrap" style={{ color: COL.textDim }}>{dmy(inv.issue_date)}</td>
                    <td className="px-4 py-2.5 mono text-[10.5px] whitespace-nowrap" style={{ color: COL.textDim }}>{dmy(inv.due_date)}</td>
                    <td className="px-4 py-2.5 mono text-right font-bold whitespace-nowrap">{money2(inv.amount)}</td>
                    <td className="px-4 py-2.5"><div className="flex items-center gap-1.5"><StatusPill status={inv.zatca_status} />{inv.zatca_status === 'Cleared' && <FileCheck size={11} style={{ color: '#15803d' }} />}</div></td>
                    <td className="px-4 py-2.5"><StatusPill status={inv.payment_status} /></td>
                    <td className="px-4 py-2.5 mono text-[10.5px] whitespace-nowrap" style={{ color: inv.paid_date ? '#16a34a' : COL.textDim }}>{dmy(inv.paid_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        {invoices.length > 0 && (
          <div className="px-4 py-2.5 border-t text-[11.5px]" style={{ borderColor: COL.border, color: COL.textMute }}>
            Status columns show recorded data. Nothing here certifies an invoice, clears it, or makes it eligible for payment.
          </div>
        )}
        <div className="p-6 border-t" style={{ borderColor: COL.border }}>
          <div className="rounded-lg border p-4" style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
            <div className="flex items-start gap-3">
              <ShieldAlert size={18} style={{ color: '#b45309', marginTop: 2 }} />
              <div>
                <div className="text-sm font-bold" style={{ color: '#92400e' }}>ZATCA / Fatoora not connected yet</div>
                <div className="text-xs mt-1" style={{ color: '#92400e' }}>Invoices created here are <b>internal drafts — not legally cleared e-invoices.</b> Connecting Fatoora (server-side) enables cleared invoices with a cryptographic stamp, QR and PDF/A-3 at VAT 15% per KSA rules. Only set an invoice's ZATCA status to “Cleared” after it has actually cleared in Fatoora.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Inspection of an existing invoice -> Drawer (list stays behind it).
          "New invoice from a certified IPC" below stays a Modal: it is a form. */}
      <Drawer open={Boolean(detail)} onClose={closeDetail} title={detail?.invoice_number} subtitle={detail?.wir_number ? `Linked to ${detail.wir_number}` : 'Invoice'} width={520}
        footer={detail && <><Btn icon={Trash2} onClick={() => onDelete(detail)}>Delete</Btn><Btn icon={Pencil} variant="primary" onClick={() => requireAuth(() => openForm(detail))}>Edit</Btn></>}>
        {detail && (
          <div>
            <div className="flex items-center gap-2 mb-3"><StatusPill status={detail.zatca_status} size="lg" /><StatusPill status={detail.payment_status} size="lg" /></div>
            {[['Amount', 'SAR ' + fmt(detail.amount)], ['Issue Date', detail.issue_date], ['Due Date', detail.due_date], ['Paid Date', detail.paid_date], ['Linked WIR', detail.wir_number], ['Element', detail.element_guid]].map(([kk, v]) => (
              <div key={kk} className="flex justify-between py-1.5 border-b text-xs" style={{ borderColor: COL.border }}><span style={{ color: COL.textDim }}>{kk}</span><span style={{ color: COL.text }}>{v || '—'}</span></div>
            ))}
            {detail.notes && <div className="text-[11.5px] mt-2 px-2.5 py-1.5 rounded" style={{ background: COL.accentBg, color: COL.text }}>{detail.notes}</div>}

            <div className="mt-4 border-t pt-4" style={{ borderColor: COL.border }}>
              <div className="mono text-[10px] tracking-widest mb-2" style={{ color: COL.textMute }}>ZATCA COMPLIANCE</div>
              <div className="space-y-1.5">
                <ComplianceRow ok={!!detail.wir_number} warn={!detail.wir_number} label={detail.wir_number ? 'Backed by proven work (WIR linked)' : 'No WIR linked — back it with proven work'} />
                <ComplianceRow ok={detail.zatca_status === 'Cleared'} warn={detail.zatca_status !== 'Cleared'} label={detail.zatca_status === 'Cleared' ? 'Cleared by ZATCA (Fatoora)' : 'Not cleared — Fatoora not connected (draft only)'} />
                <ComplianceRow ok={false} warn label="VAT 15% — verify breakdown before issue" />
              </div>
              <div className="text-[10px] mt-2" style={{ color: '#b45309' }}>Not a legal e-invoice until cleared in Fatoora.</div>
            </div>

            <div className="mt-4 border-t pt-4" style={{ borderColor: COL.border }}><InvoiceWirLinks invoiceId={detail.id} /></div>
            <div className="mt-4 border-t pt-4" style={{ borderColor: COL.border }}><Attachments recordType="invoice" recordId={detail.id} /></div>
          </div>
        )}
      </Drawer>

      <Modal open={fromIpc} onClose={() => setFromIpc(false)} title="New invoice from a certified IPC" subtitle="Only certified IPCs can be invoiced — the amount pre-fills from the IPC's net payable" width={520}
        footer={<Btn variant="secondary" onClick={() => setFromIpc(false)}>Cancel</Btn>}>
        {certifiedIpcs.length === 0 ? <div className="text-[13px]" style={{ color: COL.textMute }}>No certified IPCs yet — certify an IPC first.</div> : (
          <div className="rounded-lg border divide-y" style={{ borderColor: COL.border }}>
            {certifiedIpcs.map((p) => (
              <button key={p.id} type="button" onClick={() => { setFromIpc(false); openForm({ amount: Number(p.net_payable || 0), notes: `Based on ${p.ipc_number}${p.period ? ' · ' + p.period : ''}`, zatca_status: 'Awaiting IPC', payment_status: 'Not Issued' }); }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-start hover:bg-stone-50">
                <span><span className="mono font-semibold" style={{ color: COL.accent }}>{p.ipc_number}</span>{p.period && <span className="text-[12px]" style={{ color: COL.textDim }}> · {p.period}</span>}</span>
                <span className="mono font-bold whitespace-nowrap" style={{ color: COL.text }}>SAR {fmt(p.net_payable)}</span>
              </button>
            ))}
          </div>
        )}
        <div className="text-[10.5px] mt-2" style={{ color: COL.textMute }}>The new invoice opens pre-filled; review and add buyer/VAT details before issuing.</div>
      </Modal>

      <InvoiceFormModal key={formSeq} open={formOpen} initial={editing} onClose={() => setFormOpen(false)} onSaved={(saved) => { setFormOpen(false); load(); if (detail && saved?.id === detail.id) setDetail(saved); }} />
    </div>
  );
}
