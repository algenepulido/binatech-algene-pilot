// ============================================================
// DrawingFormModal — create or edit a shop drawing register entry.
// ============================================================
import { useState } from 'react';
import { StyledSelect } from '../../components/StyledSelect.jsx';
import { Modal } from '../../components/Modal.jsx';
import { Btn } from '../../components/primitives.jsx';
import { createDrawing, updateDrawing, DRAWING_STATUSES } from '../../api/drawings.js';
import { csvToArr, arrToCsv } from '../../api/documents.js';
import { COL } from '../../lib/theme.js';

const fieldStyle = {
  width: '100%', padding: '7px 10px', fontSize: 12, borderRadius: 6,
  border: `1px solid ${COL.border}`, background: COL.bg, color: COL.text, outline: 'none',
};
const Field = ({ label, children, full }) => (
  <label className={`text-xs block ${full ? 'col-span-2' : ''}`} style={{ color: COL.textDim }}>{label}<div className="mt-1">{children}</div></label>
);

export function DrawingFormModal({ open, initial, onClose, onSaved }) {
  const editing = Boolean(initial?.id);
  const [form, setForm] = useState({
    drawing_number: initial?.drawing_number ?? '', rev: initial?.rev ?? '', title: initial?.title ?? '',
    discipline: initial?.discipline ?? '', status: initial?.status ?? 'Under Review',
    drawing_date: initial?.drawing_date ?? '', size_text: initial?.size_text ?? '',
    submitted_by: initial?.submitted_by ?? '', reviewed_by: initial?.reviewed_by ?? '',
    linked_elements: arrToCsv(initial?.linked_elements),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e?.preventDefault(); setError(null); setBusy(true);
    try {
      const payload = {
        drawing_number: form.drawing_number.trim(), rev: orNull(form.rev), title: orNull(form.title),
        discipline: orNull(form.discipline), status: form.status, drawing_date: orNull(form.drawing_date),
        size_text: orNull(form.size_text), submitted_by: orNull(form.submitted_by), reviewed_by: orNull(form.reviewed_by),
        linked_elements: csvToArr(form.linked_elements),
      };
      const saved = editing ? await updateDrawing(initial.id, payload) : await createDrawing(payload);
      onSaved?.(saved); onClose?.();
    } catch (err) { setError(err?.message ?? String(err)); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit ${initial.drawing_number}` : 'Upload Drawing'} subtitle="Shop drawing register" width={560}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : (editing ? 'Save changes' : 'Create')}</Btn></>}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Drawing No. *"><input required value={form.drawing_number} onChange={(e) => set('drawing_number', e.target.value)} style={fieldStyle} className="mono" placeholder="SD-STR-201" /></Field>
        <Field label="Revision"><input value={form.rev} onChange={(e) => set('rev', e.target.value)} style={fieldStyle} className="mono" placeholder="C" /></Field>
        <Field label="Title" full><input value={form.title} onChange={(e) => set('title', e.target.value)} style={fieldStyle} /></Field>
        <Field label="Discipline"><input value={form.discipline} onChange={(e) => set('discipline', e.target.value)} style={fieldStyle} placeholder="Structural" /></Field>
        <Field label="Status"><StyledSelect ariaLabel="Status" value={form.status} onChange={(v) => set('status', v)} options={DRAWING_STATUSES.map((s) => ({ value: s, label: s }))} /></Field>
        <Field label="Date"><input type="date" value={form.drawing_date ?? ''} onChange={(e) => set('drawing_date', e.target.value)} style={fieldStyle} className="mono" /></Field>
        <Field label="File Size (text)"><input value={form.size_text} onChange={(e) => set('size_text', e.target.value)} style={fieldStyle} placeholder="3.2 MB" /></Field>
        <Field label="Submitted By"><input value={form.submitted_by} onChange={(e) => set('submitted_by', e.target.value)} style={fieldStyle} /></Field>
        <Field label="Reviewed By"><input value={form.reviewed_by} onChange={(e) => set('reviewed_by', e.target.value)} style={fieldStyle} /></Field>
        <Field label="Linked Elements (comma-separated ids)" full><input value={form.linked_elements} onChange={(e) => set('linked_elements', e.target.value)} style={fieldStyle} className="mono" placeholder="COL-G01, COL-G02" /></Field>
        {error && <div className="col-span-2 text-xs px-2 py-1.5 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
const orNull = (v) => (v && String(v).trim() ? String(v).trim() : null);
