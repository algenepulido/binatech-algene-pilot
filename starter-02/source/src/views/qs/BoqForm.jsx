// ============================================================
// BoqFormModal — create or edit a BoQ line item (tied to an element).
// ============================================================
import { useState } from 'react';
import { StyledSelect } from '../../components/StyledSelect.jsx';
import { Modal } from '../../components/Modal.jsx';
import { Btn, MoneyInput } from '../../components/primitives.jsx';
import { createBoqItem, updateBoqItem } from '../../api/boqItems.js';
import { useElements } from '../../lib/elements.jsx';
import { COL } from '../../lib/theme.js';

const fieldStyle = { width: '100%', padding: '7px 10px', fontSize: 12, borderRadius: 6, border: `1px solid ${COL.border}`, background: COL.bg, color: COL.text, outline: 'none' };
const Field = ({ label, children, full }) => (<label className={`text-xs block ${full ? 'col-span-2' : ''}`} style={{ color: COL.textDim }}>{label}<div className="mt-1">{children}</div></label>);

export function BoqFormModal({ open, initial, packages = [], onClose, onSaved }) {
  const editing = Boolean(initial?.id);
  const { elements } = useElements();
  const [form, setForm] = useState({
    element_id: initial?.element_id ?? '', code: initial?.code ?? '', description: initial?.description ?? '',
    unit: initial?.unit ?? 'm³', qty: initial?.qty ?? '', rate: initial?.rate ?? '', approved_qty: initial?.approved_qty ?? 0,
    package_id: initial?.package_id ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e?.preventDefault(); setError(null); setBusy(true);
    try {
      const payload = {
        element_id: orNull(form.element_id), code: form.code.trim(), description: orNull(form.description),
        unit: orNull(form.unit), qty: Number(form.qty) || 0, rate: Number(form.rate) || 0, approved_qty: Number(form.approved_qty) || 0,
        package_id: form.package_id || null,
      };
      const saved = editing ? await updateBoqItem(initial.id, payload) : await createBoqItem(payload);
      onSaved?.(saved); onClose?.();
    } catch (err) { setError(err?.message ?? String(err)); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit ${initial.code}` : 'Add BoQ Item'} subtitle="Bill of Quantities line" width={560}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : (editing ? 'Save changes' : 'Create')}</Btn></>}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="BoQ Code *"><input required value={form.code} onChange={(e) => set('code', e.target.value)} style={fieldStyle} className="mono" placeholder="B.01.01" /></Field>
        <Field label="Element">
          <input list="boq-elements" value={form.element_id} onChange={(e) => set('element_id', e.target.value)} style={fieldStyle} className="mono" placeholder="COL-G01" />
          <datalist id="boq-elements">{elements.map((el) => <option key={el.guid} value={el.id}>{el.name}</option>)}</datalist>
        </Field>
        <Field label="Description" full><input value={form.description} onChange={(e) => set('description', e.target.value)} style={fieldStyle} /></Field>
        <Field label="Unit"><input value={form.unit} onChange={(e) => set('unit', e.target.value)} style={fieldStyle} className="mono" placeholder="m³" /></Field>
        <Field label="Rate (SAR)"><MoneyInput value={form.rate} onChange={(v) => set('rate', v)} style={fieldStyle} className="mono" /></Field>
        <Field label="Total Qty"><input type="number" min="0" step="0.01" value={form.qty} onChange={(e) => set('qty', e.target.value)} style={fieldStyle} className="mono" /></Field>
        <Field label="Approved Qty"><input type="number" min="0" step="0.01" value={form.approved_qty} onChange={(e) => set('approved_qty', e.target.value)} style={fieldStyle} className="mono" /></Field>
        <Field label="Package" full>
          <StyledSelect ariaLabel="Package" value={form.package_id || ''} onChange={(v) => set('package_id', v)}
            options={[{ value: '', label: 'Unassigned (whole project)' }, ...packages.map((p) => ({ value: p.id, label: `${p.code ? `${p.code} · ` : ''}${p.name}` }))]} />
        </Field>
        {error && <div className="col-span-2 text-xs px-2 py-1.5 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
const orNull = (v) => (v && String(v).trim() ? String(v).trim() : null);
