// ============================================================
// VendorFormModal — create or edit a vendor-master record.
// ============================================================
import { useState } from 'react';
import { StyledSelect } from '../../components/StyledSelect.jsx';
import { Modal } from '../../components/Modal.jsx';
import { Btn } from '../../components/primitives.jsx';
import { createVendor, updateVendor, VENDOR_TYPES } from '../../api/vendors.js';
import { COL } from '../../lib/theme.js';

const fieldStyle = { width: '100%', padding: '7px 10px', fontSize: 12, borderRadius: 6, border: `1px solid ${COL.border}`, background: COL.bg, color: COL.text, outline: 'none' };
const Field = ({ label, children, full }) => (<label className={`text-xs block ${full ? 'col-span-2' : ''}`} style={{ color: COL.textDim }}>{label}<div className="mt-1">{children}</div></label>);

export function VendorFormModal({ open, initial, onClose, onSaved }) {
  const editing = Boolean(initial?.id);
  const [form, setForm] = useState({
    vendor_code: initial?.vendor_code ?? '', name: initial?.name ?? '', category: initial?.category ?? '',
    type: initial?.type ?? 'permanent', vat_no: initial?.vat_no ?? '', country: initial?.country ?? 'KSA',
    rating: initial?.rating ?? '', payment_terms: initial?.payment_terms ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e?.preventDefault(); setError(null); setBusy(true);
    try {
      const payload = {
        vendor_code: form.vendor_code.trim(), name: orNull(form.name), category: orNull(form.category), type: form.type,
        vat_no: orNull(form.vat_no), country: orNull(form.country), rating: form.rating === '' ? null : Number(form.rating), payment_terms: orNull(form.payment_terms),
      };
      const saved = editing ? await updateVendor(initial.id, payload) : await createVendor(payload);
      onSaved?.(saved); onClose?.();
    } catch (err) { setError(err?.message ?? String(err)); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit ${initial.vendor_code}` : 'Add Vendor'} subtitle="Vendor master" width={520}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : (editing ? 'Save changes' : 'Create')}</Btn></>}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Vendor Code *"><input required value={form.vendor_code} onChange={(e) => set('vendor_code', e.target.value)} style={fieldStyle} className="mono" placeholder="V-011" /></Field>
        <Field label="Type"><StyledSelect ariaLabel="Type" value={form.type} onChange={(v) => set('type', v)} options={VENDOR_TYPES.map((tp) => ({ value: tp, label: tp }))} /></Field>
        <Field label="Name" full><input value={form.name} onChange={(e) => set('name', e.target.value)} style={fieldStyle} /></Field>
        <Field label="Category"><input value={form.category} onChange={(e) => set('category', e.target.value)} style={fieldStyle} /></Field>
        <Field label="VAT Reg #"><input value={form.vat_no} onChange={(e) => set('vat_no', e.target.value)} style={fieldStyle} className="mono" /></Field>
        <Field label="Country"><input value={form.country} onChange={(e) => set('country', e.target.value)} style={fieldStyle} /></Field>
        <Field label="Rating"><input type="number" min="0" max="5" step="0.1" value={form.rating} onChange={(e) => set('rating', e.target.value)} style={fieldStyle} className="mono" /></Field>
        <Field label="Payment Terms" full><input value={form.payment_terms} onChange={(e) => set('payment_terms', e.target.value)} style={fieldStyle} placeholder="Net 60" /></Field>
        {error && <div className="col-span-2 text-xs px-2 py-1.5 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
const orNull = (v) => (v && String(v).trim() ? String(v).trim() : null);
