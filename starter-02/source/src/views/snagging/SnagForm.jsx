// ============================================================
// SnagFormModal — create or edit a snag / punch-list item.
// ============================================================
import { useState } from 'react';
import { Modal } from '../../components/Modal.jsx';
import { Btn } from '../../components/primitives.jsx';
import { ElementPicker } from '../../components/ElementPicker.jsx';
import { createSnag, updateSnag } from '../../api/snags.js';
import { SNAG_PRIORITIES, SNAG_STATUSES, SNAG_CATEGORIES } from '../../lib/snagMeta.js';
import { SNAG_PRIORITY, SNAG_STATUS } from '../../data/quality.js';
import { StyledSelect } from '../../components/StyledSelect.jsx';
import { COL } from '../../lib/theme.js';

const fieldStyle = {
  width: '100%', padding: '7px 10px', fontSize: 12, borderRadius: 6,
  border: `1px solid ${COL.border}`, background: COL.bg, color: COL.text, outline: 'none',
};
const Field = ({ label, children, full }) => (
  <label className={`text-xs block ${full ? 'col-span-2' : ''}`} style={{ color: COL.textDim }}>{label}<div className="mt-1">{children}</div></label>
);

const empty = {
  snag_number: '', title: '', description: '', element_guid: '', drawing_ref: '',
  zone: '', level: '', category: 'defect', priority: 'minor', status: 'open',
  assignee_co: '', assignee: '', raised_by: '', raised_date: '', target_date: '',
  verifier: '', closed_date: '', blocks_handover: false, blocks_payment: false,
  related_ncr: '', related_wir: '', related_doc: '',
};

export function SnagFormModal({ open, initial, onClose, onSaved }) {
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
        snag_number: form.snag_number.trim(),
        title: orNull(form.title), description: orNull(form.description),
        element_guid: orNull(form.element_guid), drawing_ref: orNull(form.drawing_ref),
        zone: orNull(form.zone), level: orNull(form.level), category: orNull(form.category),
        priority: form.priority, status: form.status,
        assignee_co: orNull(form.assignee_co), assignee: orNull(form.assignee),
        raised_by: orNull(form.raised_by), raised_date: orNull(form.raised_date), target_date: orNull(form.target_date),
        verifier: orNull(form.verifier), closed_date: orNull(form.closed_date),
        blocks_handover: !!form.blocks_handover, blocks_payment: !!form.blocks_payment,
        related_ncr: orNull(form.related_ncr), related_wir: orNull(form.related_wir), related_doc: orNull(form.related_doc),
      };
      const saved = editing ? await updateSnag(initial.id, payload) : await createSnag(payload);
      onSaved?.(saved); onClose?.();
    } catch (err) { setError(err?.message ?? String(err)); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit ${initial.snag_number}` : 'Raise Snag'} subtitle="Punch-list item" width={640}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : (editing ? 'Save changes' : 'Create snag')}</Btn></>}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Snag Number *"><input required value={form.snag_number} onChange={(e) => set('snag_number', e.target.value)} style={fieldStyle} className="mono" placeholder="SNG-017" /></Field>
        <Field label="Category"><StyledSelect ariaLabel="Category" value={form.category} onChange={(v) => set('category', v)} options={SNAG_CATEGORIES.map((c) => ({ value: c, label: c }))} /></Field>
        <Field label="Title" full><input value={form.title} onChange={(e) => set('title', e.target.value)} style={fieldStyle} placeholder="Short title" /></Field>
        <Field label="Description" full><textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} style={{ ...fieldStyle, resize: 'vertical' }} /></Field>
        <Field label="Linked Element (IFC GUID)" full><ElementPicker value={form.element_guid} onChange={(v) => set('element_guid', v)} /></Field>
        <Field label="Priority"><StyledSelect ariaLabel="Priority" value={form.priority} onChange={(v) => set('priority', v)} options={SNAG_PRIORITIES.map((p) => ({ value: p, label: SNAG_PRIORITY[p].label }))} /></Field>
        <Field label="Status"><StyledSelect ariaLabel="Status" value={form.status} onChange={(v) => set('status', v)} options={SNAG_STATUSES.map((s) => ({ value: s, label: SNAG_STATUS[s].label }))} /></Field>
        <Field label="Zone"><input value={form.zone} onChange={(e) => set('zone', e.target.value)} style={fieldStyle} placeholder="Ground Facade" /></Field>
        <Field label="Level"><input value={form.level} onChange={(e) => set('level', e.target.value)} style={fieldStyle} placeholder="Ground" /></Field>
        <Field label="Assignee Company"><input value={form.assignee_co} onChange={(e) => set('assignee_co', e.target.value)} style={fieldStyle} placeholder="Fictional Main Contractor" /></Field>
        <Field label="Assignee"><input value={form.assignee} onChange={(e) => set('assignee', e.target.value)} style={fieldStyle} placeholder="Eng. Synthetic M" /></Field>
        <Field label="Drawing Ref"><input value={form.drawing_ref} onChange={(e) => set('drawing_ref', e.target.value)} style={fieldStyle} className="mono" /></Field>
        <Field label="Raised By"><input value={form.raised_by} onChange={(e) => set('raised_by', e.target.value)} style={fieldStyle} /></Field>
        <Field label="Raised Date"><input type="date" value={form.raised_date ?? ''} onChange={(e) => set('raised_date', e.target.value)} style={fieldStyle} className="mono" /></Field>
        <Field label="Target Date"><input type="date" value={form.target_date ?? ''} onChange={(e) => set('target_date', e.target.value)} style={fieldStyle} className="mono" /></Field>
        <Field label="Related WIR"><input value={form.related_wir} onChange={(e) => set('related_wir', e.target.value)} style={fieldStyle} className="mono" placeholder="WIR-0152" /></Field>
        <Field label="Related NCR"><input value={form.related_ncr} onChange={(e) => set('related_ncr', e.target.value)} style={fieldStyle} className="mono" placeholder="NCR-0019" /></Field>
        <div className="col-span-2 flex items-center gap-6 pt-1">
          <label className="text-xs flex items-center gap-2" style={{ color: COL.text }}><input type="checkbox" checked={!!form.blocks_handover} onChange={(e) => set('blocks_handover', e.target.checked)} /> Blocks handover</label>
          <label className="text-xs flex items-center gap-2" style={{ color: COL.text }}><input type="checkbox" checked={!!form.blocks_payment} onChange={(e) => set('blocks_payment', e.target.checked)} /> Blocks payment</label>
        </div>
        {error && <div className="col-span-2 text-xs px-2 py-1.5 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function stripNulls(obj) { if (!obj) return {}; const o = {}; for (const [k, v] of Object.entries(obj)) o[k] = (v === null || v === undefined) ? (typeof v === 'boolean' ? v : '') : v; return o; }
const orNull = (v) => (v && String(v).trim() ? String(v).trim() : null);
