// ============================================================
// DocFormModal — create or edit a controlled document (DMS).
// tags + linked_* entered as comma-separated, stored as text[].
// ============================================================
import { useState, useEffect } from 'react';
import { Modal } from '../../components/Modal.jsx';
import { Btn } from '../../components/primitives.jsx';
import { StyledSelect } from '../../components/StyledSelect.jsx';
import { createDocument, updateDocument, csvToArr, arrToCsv } from '../../api/documents.js';
import { DOC_TYPES, DOC_STATUS } from '../../data/documents.js';
import { COL } from '../../lib/theme.js';

const fieldStyle = {
  width: '100%', padding: '7px 10px', fontSize: 12, borderRadius: 6,
  border: `1px solid ${COL.border}`, background: COL.bg, color: COL.text, outline: 'none',
};
const Field = ({ label, children, full }) => (
  <label className={`text-xs block ${full ? 'col-span-2' : ''}`} style={{ color: COL.textDim }}>{label}<div className="mt-1">{children}</div></label>
);

// Group the EXISTING DOC_TYPES keys logically (no renames / no new types). Any
// key not placed in a group falls into "Other" so nothing becomes unselectable
// if DOC_TYPES grows later.
const TYPE_LAYOUT = [
  { label: 'Design & Drawings', keys: ['drawing', 'asBuilt', 'submittal'] },
  { label: 'Quality', keys: ['testReport', 'mir', 'method'] },
  { label: 'Commercial', keys: ['contract', 'ipcBackup'] },
  { label: 'Correspondence', keys: ['rfi', 'transmittal'] },
  { label: 'Operations', keys: ['oem'] },
];
const opt = (k) => ({ value: k, label: DOC_TYPES[k]?.label ?? k, color: DOC_TYPES[k]?.color });
const TYPE_GROUPS = (() => {
  const placed = new Set(TYPE_LAYOUT.flatMap((g) => g.keys));
  const groups = TYPE_LAYOUT
    .map((g) => ({ label: g.label, options: g.keys.filter((k) => DOC_TYPES[k]).map(opt) }))
    .filter((g) => g.options.length);
  const leftover = Object.keys(DOC_TYPES).filter((k) => !placed.has(k));
  if (leftover.length) groups.push({ label: 'Other', options: leftover.map(opt) });
  return groups;
})();
const STATUS_OPTIONS = Object.keys(DOC_STATUS).map((k) => ({ value: k, label: DOC_STATUS[k].label, color: DOC_STATUS[k].color }));

// Build the editable form from a document (or blank for a new one). Reused by the
// initial state AND the open-resync effect so every field — including status —
// reflects the SPECIFIC document being edited, never a stale shared value.
const formFrom = (initial) => ({
  doc_no: initial?.doc_no ?? '', rev: initial?.rev ?? '00', type: initial?.type ?? 'submittal',
  title: initial?.title ?? '', discipline: initial?.discipline ?? '', status: initial?.status ?? 'submitted',
  doc_date: initial?.doc_date ?? '', package: initial?.package ?? '', size_text: initial?.size_text ?? '',
  submitted_by: initial?.submitted_by ?? '', reviewed_by: initial?.reviewed_by ?? '',
  tags: arrToCsv(initial?.tags), linked_elements: arrToCsv(initial?.linked_elements),
  linked_drawings: arrToCsv(initial?.linked_drawings), linked_wirs: arrToCsv(initial?.linked_wirs),
  linked_snags: arrToCsv(initial?.linked_snags), linked_ipcs: arrToCsv(initial?.linked_ipcs),
});

export function DocFormModal({ open, initial, onClose, onSaved }) {
  const editing = Boolean(initial?.id);
  const [form, setForm] = useState(() => formFrom(initial));
  // Re-sync the form to the SPECIFIC document each time the modal opens or the
  // edited document changes. The modal is mounted once and reused, so without
  // this the useState initializer would only ever run on first mount — making
  // every field (notably status) show a stale, seemingly-shared value. Keyed on
  // initial?.id so in-flight edits aren't clobbered by an unrelated data refresh.
  useEffect(() => { if (open) setForm(formFrom(initial)); }, [open, initial?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e?.preventDefault(); setError(null); setBusy(true);
    try {
      const payload = {
        doc_no: form.doc_no.trim(), rev: orNull(form.rev), type: form.type, title: orNull(form.title),
        discipline: orNull(form.discipline), status: form.status, doc_date: orNull(form.doc_date),
        package: orNull(form.package), size_text: orNull(form.size_text),
        submitted_by: orNull(form.submitted_by), reviewed_by: orNull(form.reviewed_by),
        tags: csvToArr(form.tags), linked_elements: csvToArr(form.linked_elements),
        linked_drawings: csvToArr(form.linked_drawings), linked_wirs: csvToArr(form.linked_wirs),
        linked_snags: csvToArr(form.linked_snags), linked_ipcs: csvToArr(form.linked_ipcs),
      };
      const saved = editing ? await updateDocument(initial.id, payload) : await createDocument(payload);
      onSaved?.(saved); onClose?.();
    } catch (err) { setError(err?.message ?? String(err)); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit ${initial.doc_no}` : 'Upload Document'} subtitle="Controlled document" width={640}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : (editing ? 'Save changes' : 'Create')}</Btn></>}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Document No. *"><input required value={form.doc_no} onChange={(e) => set('doc_no', e.target.value)} style={fieldStyle} className="mono" placeholder="SMP-SUB-014" /></Field>
        <Field label="Revision"><input value={form.rev} onChange={(e) => set('rev', e.target.value)} style={fieldStyle} className="mono" placeholder="00" /></Field>
        <Field label="Type"><StyledSelect ariaLabel="Document type" value={form.type} onChange={(v) => set('type', v)} groups={TYPE_GROUPS} /></Field>
        <Field label="Status"><StyledSelect ariaLabel="Document status" value={form.status} onChange={(v) => set('status', v)} options={STATUS_OPTIONS} /></Field>
        <Field label="Title" full><input value={form.title} onChange={(e) => set('title', e.target.value)} style={fieldStyle} /></Field>
        <Field label="Discipline"><input value={form.discipline} onChange={(e) => set('discipline', e.target.value)} style={fieldStyle} /></Field>
        <Field label="Package"><input value={form.package} onChange={(e) => set('package', e.target.value)} style={fieldStyle} placeholder="CONC" /></Field>
        <Field label="Date"><input type="date" value={form.doc_date ?? ''} onChange={(e) => set('doc_date', e.target.value)} style={fieldStyle} className="mono" /></Field>
        <Field label="File Size (text)"><input value={form.size_text} onChange={(e) => set('size_text', e.target.value)} style={fieldStyle} placeholder="4.2 MB" /></Field>
        <Field label="Submitted By"><input value={form.submitted_by} onChange={(e) => set('submitted_by', e.target.value)} style={fieldStyle} /></Field>
        <Field label="Reviewed By"><input value={form.reviewed_by} onChange={(e) => set('reviewed_by', e.target.value)} style={fieldStyle} /></Field>
        <Field label="Tags (comma-separated)" full><input value={form.tags} onChange={(e) => set('tags', e.target.value)} style={fieldStyle} className="mono" placeholder="concrete, mix-design" /></Field>
        <Field label="Linked Elements"><input value={form.linked_elements} onChange={(e) => set('linked_elements', e.target.value)} style={fieldStyle} className="mono" placeholder="FND-01, COL-G01" /></Field>
        <Field label="Linked Drawings"><input value={form.linked_drawings} onChange={(e) => set('linked_drawings', e.target.value)} style={fieldStyle} className="mono" placeholder="SD-STR-101" /></Field>
        <Field label="Linked WIRs"><input value={form.linked_wirs} onChange={(e) => set('linked_wirs', e.target.value)} style={fieldStyle} className="mono" placeholder="WIR-0152" /></Field>
        <Field label="Linked IPCs"><input value={form.linked_ipcs} onChange={(e) => set('linked_ipcs', e.target.value)} style={fieldStyle} className="mono" placeholder="IPC-04" /></Field>
        <Field label="Linked Snags" full><input value={form.linked_snags} onChange={(e) => set('linked_snags', e.target.value)} style={fieldStyle} className="mono" placeholder="SNG-009" /></Field>
        {error && <div className="col-span-2 text-xs px-2 py-1.5 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
const orNull = (v) => (v && String(v).trim() ? String(v).trim() : null);
