// ============================================================
// InvoiceFormModal — create/edit a client (ZATCA) invoice as a construction
// PAYMENT-READINESS workflow. A client invoice is linked to the WORK it claims
// for: a model ELEMENT and the WIR that proves it (NOT an IPC). Linking is via
// dropdowns. Smart AI scan pre-fills fields; nothing is ever auto-saved.
// ============================================================
import { useState, useRef, useEffect, useMemo } from 'react';
import { StyledSelect } from '../../components/StyledSelect.jsx';
import { Upload, Sparkles, FileText, X, ChevronDown, ChevronRight, Check, AlertTriangle, Circle, Boxes, ClipboardCheck, ShieldCheck } from 'lucide-react';
import { Modal } from '../../components/Modal.jsx';
import { Btn, MoneyInput } from '../../components/primitives.jsx';
import { ElementPicker } from '../../components/ElementPicker.jsx';
import { createInvoice, updateInvoice, listInvoices, ZATCA_STATUSES, PAYMENT_STATUSES } from '../../api/invoices.js';
import { listWirs } from '../../api/wirs.js';
import { resultLabel } from '../../lib/wirStatus.js';
import { extractInvoice, ACCEPT_TYPES, MAX_BYTES } from '../../lib/invoiceExtract.js';
import { useProject } from '../../lib/project.jsx';
import { getCurrentProjectId } from '../../lib/currentProject.js';
import { useElements } from '../../lib/elements.jsx';
import { COL } from '../../lib/theme.js';

const fieldStyle = { width: '100%', padding: '7px 10px', fontSize: 12, borderRadius: 6, border: `1px solid ${COL.border}`, background: COL.bg, color: COL.text, outline: 'none' };
const Field = ({ label, children, full, flag, hint }) => (
  <label className={`text-xs block ${full ? 'col-span-2' : ''}`} style={{ color: COL.textDim }}>
    <span className="flex items-center gap-1.5">{label}{flag && <span className="inline-flex items-center gap-0.5 px-1 rounded text-[8.5px] font-semibold" style={{ background: '#eef2ff', color: COL.accent }}><Sparkles size={8} /> from scan · check</span>}</span>
    <div className="mt-1" style={flag ? { outline: `1.5px solid ${COL.accent}`, outlineOffset: 1, borderRadius: 7 } : undefined}>{children}</div>
    {hint && <div className="mt-1 text-[10px]" style={{ color: hint.tone || COL.textMute }}>{hint.text}</div>}
  </label>
);
const Sec = ({ title, children }) => (
  <div>
    <div className="mono text-[9px] tracking-widest mb-1.5" style={{ color: COL.textMute }}>{title}</div>
    <div className="grid grid-cols-2 gap-3">{children}</div>
  </div>
);
const isoDate = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? s.trim() : '');
const norm = (s) => String(s || '').trim().toLowerCase();

export function InvoiceFormModal({ open, initial, onClose, onSaved }) {
  const editing = Boolean(initial?.id);
  const { project } = useProject();
  const { elements } = useElements();
  const [form, setForm] = useState({
    invoice_number: initial?.invoice_number ?? '', element_guid: initial?.element_guid ?? '', wir_number: initial?.wir_number ?? '',
    issue_date: initial?.issue_date ?? '', due_date: initial?.due_date ?? '', amount: initial?.amount ?? '',
    zatca_status: initial?.zatca_status ?? 'Awaiting IPC', payment_status: initial?.payment_status ?? 'Not Issued',
    paid_date: initial?.paid_date ?? '',
  });
  const [busy, setBusy] = useState(false);
  // `busy` drives the button's disabled state, which is a UI courtesy, not a control:
  // the form also submits on Enter through the hidden submit button, and that path
  // never looks at it. The ref is the control, and it is read synchronously so two
  // events in the same tick cannot both pass it.
  const busyRef = useRef(false);
  // A save outlives the form that started it. When the record changes the form is
  // replaced, and the answer to the old one must not reach the new one.
  const aliveRef = useRef(true);
  // Set on every run, not only cleared on teardown: StrictMode mounts, tears down
  // and mounts again, so a ref that is only ever cleared stays cleared for the life
  // of the form and every save silently stops reporting its own result.
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);
  const [error, setError] = useState(null);
  const [wirs, setWirs] = useState([]);
  const [invoices, setInvoices] = useState([]);
  useEffect(() => {
    if (!open) return;
    listWirs().then(setWirs).catch(() => setWirs([]));
    listInvoices().then(setInvoices).catch(() => setInvoices([]));
  }, [open]);

  // AI-extraction state
  const fileRef = useRef(null);
  const [scan, setScan] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [exMsg, setExMsg] = useState('');
  const [exErr, setExErr] = useState('');
  const [extracted, setExtracted] = useState(() => new Set());
  const [lineItems, setLineItems] = useState([]);
  const [liOpen, setLiOpen] = useState(false);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setExtracted((s) => { if (!s.has(k)) return s; const n = new Set(s); n.delete(k); return n; }); };

  // --- linked work intelligence ---
  const wirsForElement = useMemo(() => (form.element_guid ? wirs.filter((w) => w.element_guid === form.element_guid) : wirs), [wirs, form.element_guid]);
  const linkedWir = useMemo(() => wirs.find((w) => w.wir_number === form.wir_number), [wirs, form.wir_number]);
  const wirApproved = !!linkedWir && /approv/i.test(linkedWir.result || '');
  const elName = useMemo(() => elements.find((e) => e.guid === form.element_guid)?.name, [elements, form.element_guid]);
  const amountNum = Number(form.amount) || 0;
  const duplicate = useMemo(() => (form.invoice_number.trim() ? invoices.find((i) => i.id !== initial?.id && norm(i.invoice_number) === norm(form.invoice_number)) : null), [invoices, form.invoice_number, initial?.id]);

  const pickElement = (guid) => setForm((f) => {
    const keepWir = wirs.find((w) => w.wir_number === f.wir_number)?.element_guid === guid;
    return { ...f, element_guid: guid || '', wir_number: keepWir ? f.wir_number : '' };
  });
  const pickWir = (num) => setForm((f) => { const w = wirs.find((x) => x.wir_number === num); return { ...f, wir_number: num, element_guid: f.element_guid || w?.element_guid || '' }; });

  // readiness steps
  const steps = [
    { label: 'PDF attached', state: scan ? 'done' : (editing ? 'done' : 'pending') },
    { label: 'Element linked', state: form.element_guid ? 'done' : 'pending' },
    { label: 'Work inspected', state: linkedWir ? (wirApproved ? 'done' : 'warn') : 'pending' },
    { label: 'ZATCA cleared', state: form.zatca_status === 'Cleared' ? 'done' : (form.zatca_status === 'Rejected' ? 'warn' : 'pending') },
    { label: 'Ready for payment', state: (form.element_guid && wirApproved && form.zatca_status === 'Cleared' && form.payment_status !== 'Not Issued') ? 'done' : 'pending' },
  ];

  // semantic alerts
  const alerts = [];
  if (duplicate) alerts.push({ tone: 'red', text: `Duplicate invoice number — “${duplicate.invoice_number}” already exists.` });
  if (!form.element_guid && !form.wir_number) alerts.push({ tone: 'amber', text: 'Link this invoice to the element and WIR it claims for.' });
  if (form.wir_number && !linkedWir) alerts.push({ tone: 'amber', text: `WIR “${form.wir_number}” isn’t in this project.` });
  if (linkedWir && !wirApproved) alerts.push({ tone: 'amber', text: `Linked ${linkedWir.wir_number} isn’t approved yet — work not yet proven.` });
  if (form.zatca_status !== 'Cleared') alerts.push({ tone: 'amber', text: 'Missing ZATCA clearance.' });
  if (!alerts.length && amountNum > 0 && form.element_guid && wirApproved && form.zatca_status === 'Cleared') alerts.push({ tone: 'green', text: 'Ready for commercial review.' });

  async function onPick(file) {
    if (!file) return;
    setExErr(''); setExMsg('');
    if (!ACCEPT_TYPES.includes(file.type)) { setExErr('Unsupported file. Upload a PDF, PNG, JPG or WEBP.'); return; }
    if (file.size > MAX_BYTES) { setExErr('File is too large (max 12 MB).'); return; }
    if (scan?.url) URL.revokeObjectURL(scan.url);
    const isImage = file.type.startsWith('image/');
    setScan({ name: file.name, isImage, url: isImage ? URL.createObjectURL(file) : null });
    setExtracting(true);
    try { applyExtracted(await extractInvoice(file)); }
    catch (e) { setExErr(e?.message || 'Could not extract this invoice.'); }
    finally { setExtracting(false); }
  }

  function applyExtracted(fields) {
    const updates = {}; const got = new Set();
    if (fields.invoice_number) { updates.invoice_number = String(fields.invoice_number); got.add('invoice_number'); }
    const amt = fields.total_incl_vat != null ? fields.total_incl_vat : fields.amount;
    if (amt != null && !Number.isNaN(Number(amt))) { updates.amount = String(Number(amt)); got.add('amount'); }
    const id = isoDate(fields.issue_date); if (id) { updates.issue_date = id; got.add('issue_date'); }
    const dd = isoDate(fields.due_date); if (dd) { updates.due_date = dd; got.add('due_date'); }
    setForm((f) => ({ ...f, ...updates }));
    setExtracted(got);
    setLineItems(Array.isArray(fields.line_items) ? fields.line_items : []);
    const need = [];
    if (!got.has('invoice_number')) need.push('Invoice No.');
    if (!got.has('amount')) need.push('Amount');
    const sup = fields.supplier_name ? ` · From: ${fields.supplier_name}` : '';
    setExMsg(got.size ? `Pre-filled ${got.size} field${got.size === 1 ? '' : 's'} — review the highlighted ones${sup}. Now link the element / WIR.${need.length ? ` Enter manually: ${need.join(', ')}.` : ''}`
      : `Couldn’t read fields from this scan — enter them manually${sup}.`);
  }

  function clearScan() {
    if (scan?.url) URL.revokeObjectURL(scan.url);
    setScan(null); setExMsg(''); setExErr(''); setExtracted(new Set()); setLineItems([]); setLiOpen(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function submit(e) {
    e?.preventDefault();
    if (busyRef.current) return;
    if (!form.invoice_number.trim()) { setError('Invoice No. is required.'); return; }
    busyRef.current = true;
    // The answer belongs to the project the save was sent from. The form being
    // locked stops the record changing underneath it; this stops the project doing so.
    const sentProject = getCurrentProjectId();
    setError(null); setBusy(true);
    try {
      const payload = {
        invoice_number: form.invoice_number.trim(), element_guid: orNull(form.element_guid), wir_number: orNull(form.wir_number),
        issue_date: orNull(form.issue_date), due_date: orNull(form.due_date), amount: amountNum,
        zatca_status: form.zatca_status, payment_status: form.payment_status, paid_date: orNull(form.paid_date),
      };
      const saved = editing ? await updateInvoice(initial.id, payload) : await createInvoice(payload);
      if (scan?.url) URL.revokeObjectURL(scan.url);
      if (!aliveRef.current || sentProject !== getCurrentProjectId()) return;
      onSaved?.(saved); onClose?.();
    } catch (err) {
      if (!aliveRef.current || sentProject !== getCurrentProjectId()) return;
      setError(err?.message ?? String(err));
    } finally {
      busyRef.current = false;
      if (aliveRef.current) setBusy(false);
    }
  }

  // The frames show the form's footer disabled while a save is pending. The close
  // control lives in the shared Modal, which is not ours to change, so the guard goes
  // on the request instead: while a save is in flight nothing closes the form, and the
  // reporter sees the outcome rather than a form that vanished mid-write.
  const closeIfIdle = () => { if (!busyRef.current) onClose?.(); };

  const mark = (k) => extracted.has(k);
  const fmtNum = (n) => (n == null || n === '' || Number.isNaN(Number(n)) ? '—' : new Intl.NumberFormat().format(Number(n)));
  const ready = steps[4].state === 'done';
  const blocking = !!duplicate;
  const cta = busy ? 'Saving…' : (editing ? 'Save changes' : (ready ? 'Create — ready for payment' : 'Create invoice'));
  const chip = (form.element_guid && wirApproved && form.zatca_status === 'Cleared') ? { t: 'Ready for review', c: '#16a34a', bg: '#dcfce7' }
    : (form.element_guid || form.wir_number) ? { t: 'Awaiting clearance', c: '#b45309', bg: '#fef3c7' }
    : { t: 'Draft · link work', c: COL.accent, bg: '#eef2ff' };

  const StepDot = ({ s }) => {
    const map = { done: { c: '#16a34a', bg: '#dcfce7', Icon: Check }, warn: { c: '#d97706', bg: '#fef3c7', Icon: AlertTriangle }, pending: { c: COL.textMute, bg: COL.surfaceAlt, Icon: Circle } };
    const { c, bg, Icon } = map[s.state];
    return (
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: bg, color: c }}><Icon size={9} /></span>
        <span className="text-[10px] whitespace-nowrap" style={{ color: s.state === 'pending' ? COL.textMute : COL.text }}>{s.label}</span>
      </div>
    );
  };
  const alertStyle = { red: { bg: '#fef2f2', c: '#b91c1c' }, amber: { bg: '#fffbeb', c: '#92400e' }, green: { bg: '#f0fdf4', c: '#15803d' } };

  return (
    <Modal open={open} onClose={closeIfIdle} title={editing ? `Invoice ${initial.invoice_number}` : 'New client invoice'}
      subtitle={`${project?.name || 'Project'}${project?.contractor ? ` · ${project.contractor}` : ''} · ZATCA invoice register`} width={600}
      footer={
        <div className="flex items-center gap-2 w-full">
          <span className="text-[11px] me-auto" style={{ color: blocking ? '#b91c1c' : COL.textDim }}>
            {blocking ? 'Duplicate number — review before saving' : (ready ? 'All checks passed' : 'Fill required fields, then create')}
          </span>
          <Btn variant="secondary" onClick={closeIfIdle} disabled={busy}>Cancel</Btn>
          <Btn variant="primary" onClick={submit} disabled={busy}>{cta}</Btn>
        </div>
      }>
      <form onSubmit={submit} className="space-y-3">
        {!editing && <div className="flex items-center"><span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: chip.bg, color: chip.c }}>{chip.t}</span></div>}

        {/* smart AI upload */}
        {!editing && (
          <div className="rounded-lg border border-dashed p-3" style={{ borderColor: COL.borderStrong, background: COL.surfaceAlt }}>
            <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
            {!scan ? (
              /* Scan and pre-fill reads the invoice with a service this pilot does not
                 have, so the control says so instead of inviting a click that cannot
                 work. Everything behind it is untouched and comes back with the service. */
              <div className="w-full flex items-center justify-center gap-2 py-1.5 text-[12px]" style={{ color: COL.textMute }}>
                <Upload size={14} /> <span>Scan and pre-fill is not available in this pilot. Enter the invoice below.</span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                {scan.isImage ? <img src={scan.url} alt="" className="w-12 h-12 rounded object-cover border" style={{ borderColor: COL.border }} /> : <span className="w-12 h-12 rounded border flex items-center justify-center" style={{ borderColor: COL.border, background: COL.bg }}><FileText size={20} style={{ color: COL.accent }} /></span>}
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] truncate" style={{ color: COL.text }}>{scan.name}</div>
                  <div className="text-[11px]" style={{ color: extracting ? COL.accent : COL.textDim }}>{extracting ? 'Reading with AI…' : (extracted.size ? `${extracted.size} field${extracted.size === 1 ? '' : 's'} extracted` : 'Scan attached')}</div>
                </div>
                <button type="button" onClick={clearScan} className="p-1 rounded hover:bg-stone-100" style={{ color: COL.textDim }} aria-label="Remove scan"><X size={14} /></button>
              </div>
            )}
            {exErr && <div className="mt-2 text-[11px] px-2 py-1.5 rounded" style={{ background: '#fffbeb', color: '#92400e' }}>{exErr}</div>}
            {exMsg && !exErr && <div className="mt-2 text-[11px] px-2 py-1.5 rounded flex items-start gap-1.5" style={{ background: '#eef2ff', color: COL.accent }}><Sparkles size={12} className="mt-0.5 flex-shrink-0" /><span>{exMsg}</span></div>}
          </div>
        )}

        {/* readiness strip */}
        <div className="rounded-lg border p-2.5 flex items-center gap-2 overflow-x-auto" style={{ borderColor: COL.border, background: COL.surface }}>
          {steps.map((s, i) => (
            <div key={s.label} className="flex items-center gap-2">
              <StepDot s={s} />
              {i < steps.length - 1 && <span style={{ color: COL.borderStrong }}>›</span>}
            </div>
          ))}
        </div>

        {/* semantic alerts */}
        {alerts.length > 0 && (
          <div className="space-y-1.5">
            {alerts.slice(0, 4).map((a, i) => { const st = alertStyle[a.tone]; return (
              <div key={i} className="flex items-start gap-1.5 text-[11px] px-2 py-1.5 rounded" style={{ background: st.bg, color: st.c }}>
                {a.tone === 'green' ? <Check size={12} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />}<span>{a.text}</span>
              </div>
            ); })}
          </div>
        )}

        <Sec title="INVOICE DETAILS">
          <Field label="Invoice No. *" flag={mark('invoice_number')} hint={duplicate ? { text: 'Already exists in this project', tone: '#b91c1c' } : null}><input required value={form.invoice_number} onChange={(e) => set('invoice_number', e.target.value)} style={fieldStyle} className="mono" placeholder="INV-2026-052" /></Field>
          <Field label="Contractor"><input value={project?.contractor || ''} readOnly style={{ ...fieldStyle, background: COL.surfaceAlt, color: COL.textDim }} className="mono" title="From project context" /></Field>
        </Sec>

        <Sec title="LINKED WORK">
          <Field label="Element" hint={form.element_guid ? { text: `Linked${elName ? `: ${elName}` : ''}`, tone: '#15803d' } : { text: 'The model element this invoice claims for', tone: COL.textMute }}>
            <ElementPicker value={form.element_guid} onChange={pickElement} id="inv-element" />
          </Field>
          <Field label="WIR (proof of work)" hint={linkedWir ? { text: wirApproved ? `${linkedWir.wir_number} approved` : `${linkedWir.wir_number} not approved yet`, tone: wirApproved ? '#15803d' : '#b45309' } : { text: form.element_guid ? `${wirsForElement.length} WIR(s) on this element` : 'Inspection that proves the work', tone: COL.textMute }}>
            <StyledSelect ariaLabel="Linked WIR" value={form.wir_number || ''} onChange={pickWir}
              options={[{ value: '', label: '— No WIR linked —' }, ...wirsForElement.map((w) => ({ value: w.wir_number, label: `${w.wir_number} · ${w.inspection_type || 'WIR'} · ${resultLabel(w.result)}` }))]} />
          </Field>
        </Sec>

        <Sec title="COMMERCIALS">
          <Field label="Amount (SAR)" full flag={mark('amount')}><MoneyInput value={form.amount} onChange={(v) => set('amount', v)} style={fieldStyle} className="mono" /></Field>
        </Sec>

        {/* scanned line items preview */}
        {lineItems.length > 0 && (
          <div className="rounded-lg border" style={{ borderColor: COL.border }}>
            <button type="button" onClick={() => setLiOpen((o) => !o)} className="w-full flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold" style={{ color: COL.text }}>
              {liOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<Sparkles size={12} style={{ color: COL.accent }} /> Scanned line items ({lineItems.length})
              <span className="ms-auto text-[10px] font-normal" style={{ color: COL.textMute }}>reference only</span>
            </button>
            {liOpen && (
              <div className="px-3 pb-2 overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead><tr className="mono" style={{ color: COL.textMute }}><th className="text-start py-1 pe-2">Description</th><th className="text-end py-1 px-2">Qty</th><th className="text-end py-1 px-2">Unit</th><th className="text-end py-1 ps-2">Amount</th></tr></thead>
                  <tbody>{lineItems.map((li, i) => (<tr key={i} style={{ borderTop: `1px solid ${COL.border}` }}><td className="py-1 pe-2" style={{ color: COL.text }}>{li.description || '—'}</td><td className="py-1 px-2 mono text-end" style={{ color: COL.textDim }}>{fmtNum(li.qty)}</td><td className="py-1 px-2 mono text-end" style={{ color: COL.textDim }}>{fmtNum(li.unit_price)}</td><td className="py-1 ps-2 mono text-end" style={{ color: COL.text }}>{fmtNum(li.amount)}</td></tr>))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <Sec title="DATES">
          <Field label="Issue Date" flag={mark('issue_date')}><input type="date" value={form.issue_date ?? ''} onChange={(e) => set('issue_date', e.target.value)} style={fieldStyle} className="mono" /></Field>
          <Field label="Due Date" flag={mark('due_date')}><input type="date" value={form.due_date ?? ''} onChange={(e) => set('due_date', e.target.value)} style={fieldStyle} className="mono" /></Field>
          <Field label="Paid Date"><input type="date" value={form.paid_date ?? ''} onChange={(e) => set('paid_date', e.target.value)} style={fieldStyle} className="mono" /></Field>
        </Sec>

        <Sec title="COMPLIANCE">
          <Field label="ZATCA Status"><StyledSelect ariaLabel="ZATCA Status" value={form.zatca_status} onChange={(v) => set('zatca_status', v)} options={ZATCA_STATUSES.map((s) => ({ value: s, label: s }))} /></Field>
          <Field label="Payment Status"><StyledSelect ariaLabel="Payment Status" value={form.payment_status} onChange={(v) => set('payment_status', v)} options={PAYMENT_STATUSES.map((s) => ({ value: s, label: s }))} /></Field>
        </Sec>

        {error && <div className="text-xs px-2 py-1.5 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
const orNull = (v) => (v && String(v).trim() ? String(v).trim() : null);
