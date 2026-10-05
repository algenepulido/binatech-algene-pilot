// ============================================================
// PoFormModal — create or edit a purchase order / subcontract / service.
// ============================================================
import { useState } from 'react';
import { StyledSelect } from '../../components/StyledSelect.jsx';
import { Modal } from '../../components/Modal.jsx';
import { Btn, MoneyInput } from '../../components/primitives.jsx';
import { createPurchaseOrder, updatePurchaseOrder, PO_TYPES } from '../../api/purchaseOrders.js';
import { csvToArr, arrToCsv } from '../../api/documents.js';
import { COL } from '../../lib/theme.js';

const fieldStyle = { width: '100%', padding: '7px 10px', fontSize: 12, borderRadius: 6, border: `1px solid ${COL.border}`, background: COL.bg, color: COL.text, outline: 'none' };
const Field = ({ label, children, full }) => (<label className={`text-xs block ${full ? 'col-span-2' : ''}`} style={{ color: COL.textDim }}>{label}<div className="mt-1">{children}</div></label>);

export function PoFormModal({ open, initial, onClose, onSaved }) {
  const editing = Boolean(initial?.id);
  const [form, setForm] = useState({
    po_number: initial?.po_number ?? '', type: initial?.type ?? 'permanent', vendor_name: initial?.vendor_name ?? '',
    vendor_code: initial?.vendor_code ?? '', description: initial?.description ?? '', linked_boq: initial?.linked_boq ?? '',
    linked_elements: arrToCsv(initial?.linked_elements), value: initial?.value ?? '', delivered_pct: initial?.delivered_pct ?? 0,
    issued_date: initial?.issued_date ?? '', status: initial?.status ?? 'Open', bill_to: initial?.bill_to ?? 'Fictional Main Contractor / SYN-SAMPLE',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e?.preventDefault(); setError(null); setBusy(true);
    try {
      const payload = {
        po_number: form.po_number.trim(), type: form.type, vendor_name: orNull(form.vendor_name), vendor_code: orNull(form.vendor_code),
        description: orNull(form.description), linked_boq: orNull(form.linked_boq), linked_elements: csvToArr(form.linked_elements),
        value: Number(form.value) || 0, delivered_pct: Math.max(0, Math.min(100, Number(form.delivered_pct) || 0)),
        issued_date: orNull(form.issued_date), status: orNull(form.status) ?? 'Open', bill_to: orNull(form.bill_to),
      };
      const saved = editing ? await updatePurchaseOrder(initial.id, payload) : await createPurchaseOrder(payload);
      onSaved?.(saved); onClose?.();
    } catch (err) { setError(err?.message ?? String(err)); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit ${initial.po_number}` : 'New PO'} subtitle="Purchase order / subcontract / service" width={600}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : (editing ? 'Save changes' : 'Create')}</Btn></>}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="PO / SC No. *"><input required value={form.po_number} onChange={(e) => set('po_number', e.target.value)} style={fieldStyle} className="mono" placeholder="PO-2026-060" /></Field>
        <Field label="Type"><StyledSelect ariaLabel="Type" value={form.type} onChange={(v) => set('type', v)} options={PO_TYPES.map((tp) => ({ value: tp, label: tp }))} /></Field>
        <Field label="Vendor Name"><input value={form.vendor_name} onChange={(e) => set('vendor_name', e.target.value)} style={fieldStyle} placeholder="Fictional Steel Supplier" /></Field>
        <Field label="Vendor Code"><input value={form.vendor_code} onChange={(e) => set('vendor_code', e.target.value)} style={fieldStyle} className="mono" placeholder="V-001" /></Field>
        <Field label="Description" full><input value={form.description} onChange={(e) => set('description', e.target.value)} style={fieldStyle} /></Field>
        <Field label="Linked BoQ" full><input value={form.linked_boq} onChange={(e) => set('linked_boq', e.target.value)} style={fieldStyle} className="mono" placeholder="A.01.01, A.02.01" /></Field>
        <Field label="Linked Elements" full><input value={form.linked_elements} onChange={(e) => set('linked_elements', e.target.value)} style={fieldStyle} className="mono" placeholder="FND-01, COL-G01" /></Field>
        <Field label="Value (SAR)"><MoneyInput value={form.value} onChange={(v) => set('value', v)} style={fieldStyle} className="mono" /></Field>
        <Field label="Delivered %"><input type="number" min="0" max="100" value={form.delivered_pct} onChange={(e) => set('delivered_pct', e.target.value)} style={fieldStyle} className="mono" /></Field>
        <Field label="Issued Date"><input type="date" value={form.issued_date ?? ''} onChange={(e) => set('issued_date', e.target.value)} style={fieldStyle} className="mono" /></Field>
        <Field label="Status"><input value={form.status} onChange={(e) => set('status', e.target.value)} style={fieldStyle} placeholder="Open" /></Field>
        <Field label="Bill To" full><input value={form.bill_to} onChange={(e) => set('bill_to', e.target.value)} style={fieldStyle} /></Field>
        {error && <div className="col-span-2 text-xs px-2 py-1.5 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
const orNull = (v) => (v && String(v).trim() ? String(v).trim() : null);
