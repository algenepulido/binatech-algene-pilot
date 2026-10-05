// ============================================================
// DeliveryFormModal — create or edit a delivery / SDN record.
// ============================================================
import { useState } from 'react';
import { StyledSelect } from '../../components/StyledSelect.jsx';
import { Modal } from '../../components/Modal.jsx';
import { Btn } from '../../components/primitives.jsx';
import { createDelivery, updateDelivery, SDN_STATUSES } from '../../api/deliveries.js';
import { COL } from '../../lib/theme.js';

const fieldStyle = { width: '100%', padding: '7px 10px', fontSize: 12, borderRadius: 6, border: `1px solid ${COL.border}`, background: COL.bg, color: COL.text, outline: 'none' };
const Field = ({ label, children, full }) => (<label className={`text-xs block ${full ? 'col-span-2' : ''}`} style={{ color: COL.textDim }}>{label}<div className="mt-1">{children}</div></label>);

export function DeliveryFormModal({ open, initial, onClose, onSaved }) {
  const editing = Boolean(initial?.id);
  const [form, setForm] = useState({
    dn_number: initial?.dn_number ?? '', po_ref: initial?.po_ref ?? '', vendor: initial?.vendor ?? '',
    delivery_date: initial?.delivery_date ?? '', items: initial?.items ?? '', qty: initial?.qty ?? '',
    signed_dn: initial?.signed_dn ?? false, sdn_status: initial?.sdn_status ?? 'Pending SDN',
    sdn_id: initial?.sdn_id ?? '', sdn_approver: initial?.sdn_approver ?? '', sdn_date: initial?.sdn_date ?? '',
    priority: initial?.priority ?? false, qc_ref: initial?.qc_ref ?? '', rejection_reason: initial?.rejection_reason ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e?.preventDefault(); setError(null); setBusy(true);
    try {
      const payload = {
        dn_number: form.dn_number.trim(), po_ref: orNull(form.po_ref), vendor: orNull(form.vendor),
        delivery_date: orNull(form.delivery_date), items: orNull(form.items), qty: orNull(form.qty),
        signed_dn: !!form.signed_dn, sdn_status: form.sdn_status, sdn_id: orNull(form.sdn_id),
        sdn_approver: orNull(form.sdn_approver), sdn_date: orNull(form.sdn_date),
        priority: !!form.priority, qc_ref: orNull(form.qc_ref), rejection_reason: orNull(form.rejection_reason),
      };
      const saved = editing ? await updateDelivery(initial.id, payload) : await createDelivery(payload);
      onSaved?.(saved); onClose?.();
    } catch (err) { setError(err?.message ?? String(err)); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit ${initial.dn_number}` : 'Record Delivery'} subtitle="Delivery note / SDN" width={560}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : (editing ? 'Save changes' : 'Create')}</Btn></>}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="DN No. *"><input required value={form.dn_number} onChange={(e) => set('dn_number', e.target.value)} style={fieldStyle} className="mono" placeholder="DN-2026-072" /></Field>
        <Field label="PO Ref"><input value={form.po_ref} onChange={(e) => set('po_ref', e.target.value)} style={fieldStyle} className="mono" placeholder="PO-2026-021" /></Field>
        <Field label="Vendor" full><input value={form.vendor} onChange={(e) => set('vendor', e.target.value)} style={fieldStyle} /></Field>
        <Field label="Items"><input value={form.items} onChange={(e) => set('items', e.target.value)} style={fieldStyle} placeholder="C40 Concrete" /></Field>
        <Field label="Quantity"><input value={form.qty} onChange={(e) => set('qty', e.target.value)} style={fieldStyle} className="mono" placeholder="120 m³" /></Field>
        <Field label="Delivery Date"><input type="date" value={form.delivery_date ?? ''} onChange={(e) => set('delivery_date', e.target.value)} style={fieldStyle} className="mono" /></Field>
        <Field label="SDN Status"><StyledSelect ariaLabel="SDN Status" value={form.sdn_status} onChange={(v) => set('sdn_status', v)} options={SDN_STATUSES.map((s) => ({ value: s, label: s }))} /></Field>
        <Field label="SDN #"><input value={form.sdn_id} onChange={(e) => set('sdn_id', e.target.value)} style={fieldStyle} className="mono" placeholder="SDN-0119" /></Field>
        <Field label="SDN Approver"><input value={form.sdn_approver} onChange={(e) => set('sdn_approver', e.target.value)} style={fieldStyle} /></Field>
        <Field label="SDN Date"><input type="date" value={form.sdn_date ?? ''} onChange={(e) => set('sdn_date', e.target.value)} style={fieldStyle} className="mono" /></Field>
        <Field label="QC Ref"><input value={form.qc_ref} onChange={(e) => set('qc_ref', e.target.value)} style={fieldStyle} className="mono" placeholder="QC-0054" /></Field>
        <div className="col-span-2 flex items-center gap-6 pt-1">
          <label className="text-xs flex items-center gap-2" style={{ color: COL.text }}><input type="checkbox" checked={!!form.signed_dn} onChange={(e) => set('signed_dn', e.target.checked)} /> Signed DN uploaded</label>
          <label className="text-xs flex items-center gap-2" style={{ color: COL.text }}><input type="checkbox" checked={!!form.priority} onChange={(e) => set('priority', e.target.checked)} /> Same-day priority</label>
        </div>
        <Field label="Rejection Reason (if any)" full><textarea rows={2} value={form.rejection_reason} onChange={(e) => set('rejection_reason', e.target.value)} style={{ ...fieldStyle, resize: 'vertical' }} /></Field>
        {error && <div className="col-span-2 text-xs px-2 py-1.5 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
const orNull = (v) => (v && String(v).trim() ? String(v).trim() : null);
