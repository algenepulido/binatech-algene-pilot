// ============================================================
// QcFormModal — create or edit a QC test record.
// ============================================================
import { useState } from 'react';
import { Modal } from '../../components/Modal.jsx';
import { Btn } from '../../components/primitives.jsx';
import { ElementPickerPro } from '../../components/ElementPickerPro.jsx';
import { createQcTest, updateQcTest } from '../../api/qcTests.js';
import { QC_RESULTS, qcResultLabel } from '../../lib/qcStatus.js';
import { StyledSelect } from '../../components/StyledSelect.jsx';
import { COL } from '../../lib/theme.js';

const fieldStyle = {
  width: '100%', padding: '7px 10px', fontSize: 12, borderRadius: 6,
  border: `1px solid ${COL.border}`, background: COL.bg, color: COL.text, outline: 'none',
};
const Field = ({ label, children }) => (
  <label className="text-xs block" style={{ color: COL.textDim }}>{label}<div className="mt-1">{children}</div></label>
);

const empty = { qc_number: '', element_guid: '', test_date: '', test_name: '', specification: '', result_value: '', result: 'pending', lab: '' };

export function QcFormModal({ open, initial, onClose, onSaved }) {
  const editing = Boolean(initial?.id);
  const [form, setForm] = useState({ ...empty, ...stripNulls(initial) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e?.preventDefault();
    setError(null); setBusy(true);
    try {
      const payload = {
        qc_number: form.qc_number.trim(),
        element_guid: orNull(form.element_guid),
        test_date: orNull(form.test_date),
        test_name: orNull(form.test_name),
        specification: orNull(form.specification),
        result_value: orNull(form.result_value),
        result: form.result,
        lab: orNull(form.lab),
      };
      const saved = editing ? await updateQcTest(initial.id, payload) : await createQcTest(payload);
      onSaved?.(saved); onClose?.();
    } catch (err) { setError(err?.message ?? String(err)); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit ${initial.qc_number}` : 'Add QC Test'} subtitle="Quality-control test result" width={560}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : (editing ? 'Save changes' : 'Create test')}</Btn></>}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="QC Number *"><input required value={form.qc_number} onChange={(e) => set('qc_number', e.target.value)} style={fieldStyle} className="mono" placeholder="QC-0062" /></Field>
        <Field label="Test Name"><input value={form.test_name} onChange={(e) => set('test_name', e.target.value)} style={fieldStyle} placeholder="Cube Test 28-Day" /></Field>
        <div className="col-span-2"><Field label="Linked Element (IFC GUID)"><ElementPickerPro value={form.element_guid} onChange={(v) => set('element_guid', v)} /></Field></div>
        <Field label="Specification"><input value={form.specification} onChange={(e) => set('specification', e.target.value)} style={fieldStyle} className="mono" placeholder=">= 40 MPa" /></Field>
        <Field label="Result Value"><input value={form.result_value} onChange={(e) => set('result_value', e.target.value)} style={fieldStyle} className="mono" placeholder="44.2 MPa" /></Field>
        <Field label="Result"><StyledSelect ariaLabel="Result" value={form.result} onChange={(v) => set('result', v)} options={QC_RESULTS.map((r) => ({ value: r, label: qcResultLabel(r) }))} /></Field>
        <Field label="Lab"><input value={form.lab} onChange={(e) => set('lab', e.target.value)} style={fieldStyle} placeholder="Fictional Test Lab" /></Field>
        <Field label="Test Date"><input type="date" value={form.test_date ?? ''} onChange={(e) => set('test_date', e.target.value)} style={fieldStyle} className="mono" /></Field>
        {error && <div className="col-span-2 text-xs px-2 py-1.5 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function stripNulls(obj) { if (!obj) return {}; const o = {}; for (const [k, v] of Object.entries(obj)) o[k] = v ?? ''; return o; }
const orNull = (v) => (v && String(v).trim() ? String(v).trim() : null);
