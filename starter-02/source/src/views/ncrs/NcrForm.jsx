// ============================================================
// NcrFormModal — create or edit a Non-Conformance Report.
// ============================================================
import { useState } from 'react';
import { Modal } from '../../components/Modal.jsx';
import { Btn, MoneyInput } from '../../components/primitives.jsx';
import { ElementPickerPro } from '../../components/ElementPickerPro.jsx';
import { createNcr, updateNcr } from '../../api/ncrs.js';
import { recertifyForElement } from '../../lib/recertify.js';
import { NCR_SEVERITIES, NCR_STATUSES, ncrSeverityLabel, ncrStatusLabel } from '../../lib/ncrStatus.js';
import { StyledSelect } from '../../components/StyledSelect.jsx';
import { COL } from '../../lib/theme.js';

const fieldStyle = {
  width: '100%', padding: '7px 10px', fontSize: 12, borderRadius: 6,
  border: `1px solid ${COL.border}`, background: COL.bg, color: COL.text, outline: 'none',
};
const Field = ({ label, children }) => (
  <label className="text-xs block" style={{ color: COL.textDim }}>{label}<div className="mt-1">{children}</div></label>
);

const empty = {
  ncr_number: '', severity: 'major', status: 'open', element_guid: '', drawing_ref: '',
  ncr_date: '', raised_by: '', linked_wir: '', cost_impact: '', description: '',
};

export function NcrFormModal({ open, initial, onClose, onSaved }) {
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
        ncr_number: form.ncr_number.trim(),
        severity: form.severity,
        status: form.status,
        element_guid: orNull(form.element_guid),
        drawing_ref: orNull(form.drawing_ref),
        ncr_date: orNull(form.ncr_date),
        raised_by: orNull(form.raised_by),
        linked_wir: orNull(form.linked_wir),
        cost_impact: Number(form.cost_impact) || 0,
        description: orNull(form.description),
      };
      const saved = editing ? await updateNcr(initial.id, payload) : await createNcr(payload);
      // Auto-flow: any NCR change re-certifies the project's linked BOQ lines
      // (open NCR blocks; closing/clearing one must be able to un-block — so we
      // always recompute, even when element_guid was just removed).
      await recertifyForElement();
      onSaved?.(saved); onClose?.();
    } catch (err) { setError(err?.message ?? String(err)); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit ${initial.ncr_number}` : 'Raise NCR'} subtitle="Non-Conformance Report" width={560}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : (editing ? 'Save changes' : 'Create NCR')}</Btn></>}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="NCR Number *"><input required value={form.ncr_number} onChange={(e) => set('ncr_number', e.target.value)} style={fieldStyle} className="mono" placeholder="NCR-0024" /></Field>
        <Field label="Cost Impact (SAR)"><MoneyInput value={form.cost_impact} onChange={(v) => set('cost_impact', v)} style={fieldStyle} className="mono" placeholder="0" /></Field>
        <Field label="Severity"><StyledSelect ariaLabel="Severity" value={form.severity} onChange={(v) => set('severity', v)} options={NCR_SEVERITIES.map((s) => ({ value: s, label: ncrSeverityLabel(s) }))} /></Field>
        <Field label="Status"><StyledSelect ariaLabel="Status" value={form.status} onChange={(v) => set('status', v)} options={NCR_STATUSES.map((s) => ({ value: s, label: ncrStatusLabel(s) }))} /></Field>
        <div className="col-span-2"><Field label="Linked Element (IFC GUID)"><ElementPickerPro value={form.element_guid} onChange={(v) => set('element_guid', v)} /></Field></div>
        <Field label="Drawing Ref"><input value={form.drawing_ref} onChange={(e) => set('drawing_ref', e.target.value)} style={fieldStyle} className="mono" placeholder="SD-ARC-120 Rev B" /></Field>
        <Field label="Date"><input type="date" value={form.ncr_date ?? ''} onChange={(e) => set('ncr_date', e.target.value)} style={fieldStyle} className="mono" /></Field>
        <Field label="Raised By"><input value={form.raised_by} onChange={(e) => set('raised_by', e.target.value)} style={fieldStyle} placeholder="Fictional Design Consultant" /></Field>
        <Field label="Linked WIR"><input value={form.linked_wir} onChange={(e) => set('linked_wir', e.target.value)} style={fieldStyle} className="mono" placeholder="WIR-0152" /></Field>
        <div className="col-span-2"><Field label="Description"><textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} style={{ ...fieldStyle, resize: 'vertical' }} /></Field></div>
        {error && <div className="col-span-2 text-xs px-2 py-1.5 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function stripNulls(obj) { if (!obj) return {}; const o = {}; for (const [k, v] of Object.entries(obj)) o[k] = v ?? ''; return o; }
const orNull = (v) => (v && String(v).trim() ? String(v).trim() : null);
