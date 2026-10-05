// ============================================================
// IpcFormModal — create or edit an Interim Payment Certificate.
// Gross is entered; retention (10%) / VAT (15%) / net payable are derived
// live and stored alongside.
// ============================================================
import { useState } from 'react';
import { StyledSelect } from '../../components/StyledSelect.jsx';
import { Modal } from '../../components/Modal.jsx';
import { Btn, MoneyInput } from '../../components/primitives.jsx';
import { createIpc, updateIpc } from '../../api/ipcs.js';
import { listBoqItems } from '../../api/boqItems.js';
import { IPC_STATUSES, ipcStatusLabel, computeIpc } from '../../lib/ipcStatus.js';
import { fmt } from '../../lib/format.js';
import { COL } from '../../lib/theme.js';

const fieldStyle = {
  width: '100%', padding: '7px 10px', fontSize: 12, borderRadius: 6,
  border: `1px solid ${COL.border}`, background: COL.bg, color: COL.text, outline: 'none',
};

function Field({ label, children }) {
  return (
    <label className="text-xs block" style={{ color: COL.textDim }}>
      {label}<div className="mt-1">{children}</div>
    </label>
  );
}

const empty = { ipc_number: '', period: '', status: 'draft', gross_amount: '', cert_date: '', paid_date: '', notes: '' };

export function IpcFormModal({ open, initial, onClose, onSaved }) {
  const editing = Boolean(initial?.id);
  const [form, setForm] = useState({ ...empty, ...stripNulls(initial) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [billed, setBilled] = useState(null); // { value, count } pulled from certified BoQ
  const [pulling, setPulling] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const { retention, vat, net } = computeIpc(form.gross_amount);

  // Pull this period's billable value from the certified BoQ lines (approved qty × rate).
  async function pullBilled() {
    setPulling(true); setError(null);
    try {
      const items = await listBoqItems();
      let value = 0, count = 0;
      items.forEach((b) => { const a = Number(b.approved_qty || 0) * Number(b.rate || 0); if (a > 0) { value += a; count++; } });
      setBilled({ value, count });
      set('gross_amount', String(Math.round(value * 100) / 100));
    } catch (e) { setError(e?.message ?? String(e)); }
    finally { setPulling(false); }
  }

  async function submit(e) {
    e?.preventDefault();
    setError(null); setBusy(true);
    try {
      const gross = Number(form.gross_amount) || 0;
      const payload = {
        ipc_number: form.ipc_number.trim(),
        period: orNull(form.period),
        status: form.status,
        gross_amount: gross,
        retention, vat, net_payable: net,
        cert_date: orNull(form.cert_date),
        paid_date: orNull(form.paid_date),
        notes: orNull(form.notes),
      };
      const saved = editing ? await updateIpc(initial.id, payload) : await createIpc(payload);
      onSaved?.(saved);
      onClose?.();
    } catch (err) { setError(err?.message ?? String(err)); }
    finally { setBusy(false); }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${initial.ipc_number}` : 'Draft New IPC'}
      subtitle="Interim Payment Certificate"
      width={520}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : (editing ? 'Save changes' : 'Create IPC')}</Btn></>}
    >
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="IPC Number *"><input required value={form.ipc_number} onChange={(e) => set('ipc_number', e.target.value)} style={fieldStyle} className="mono" placeholder="IPC-07" /></Field>
        <Field label="Period"><input value={form.period} onChange={(e) => set('period', e.target.value)} style={fieldStyle} placeholder="May 2026" /></Field>
        <Field label="Gross Value (SAR)"><MoneyInput value={form.gross_amount} onChange={(v) => set('gross_amount', v)} style={fieldStyle} className="mono" placeholder="0.00" /></Field>
        <div className="col-span-2 flex items-center gap-2 flex-wrap">
          <Btn variant="secondary" onClick={pullBilled}>{pulling ? 'Loading…' : 'Pull billable value from BoQ'}</Btn>
          <span className="text-[11px]" style={{ color: COL.textDim }}>
            {billed ? `${billed.count} certified BoQ line${billed.count === 1 ? '' : 's'} · SAR ${fmt(billed.value)}` : 'Bills the certified scope (approved qty × rate) into this IPC'}
          </span>
        </div>
        <Field label="Status">
          {/* certified/paid are gated transitions — not directly selectable here unless the IPC is already there. */}
          <StyledSelect ariaLabel="Status" value={form.status} onChange={(v) => set('status', v)} options={IPC_STATUSES.filter((s) => !['certified', 'paid'].includes(s) || s === form.status).map((s) => ({ value: s, label: ipcStatusLabel(s) }))} />
          {!['certified', 'paid'].includes(form.status) && <p className="text-[10.5px] mt-1" style={{ color: COL.textMute }}>Certification runs through the IPC certification gate, not this form.</p>}
        </Field>
        <Field label="Certified Date"><input type="date" value={form.cert_date ?? ''} onChange={(e) => set('cert_date', e.target.value)} style={fieldStyle} className="mono" /></Field>
        <Field label="Paid Date"><input type="date" value={form.paid_date ?? ''} onChange={(e) => set('paid_date', e.target.value)} style={fieldStyle} className="mono" /></Field>
        <div className="col-span-2"><Field label="Notes"><textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} style={{ ...fieldStyle, resize: 'vertical' }} /></Field></div>

        {/* Live breakdown */}
        <div className="col-span-2 rounded border p-3 text-xs space-y-1" style={{ borderColor: COL.border, background: COL.surfaceAlt }}>
          {[['Gross', Number(form.gross_amount) || 0], ['Less: Retention (10%)', -retention], ['VAT (15%)', vat], ['Net Payable', net, true]].map(([l, a, big], i) => (
            <div key={i} className="flex justify-between" style={{ borderTop: big ? `1px solid ${COL.border}` : 'none', paddingTop: big ? 6 : 0 }}>
              <span className={big ? 'font-semibold' : ''} style={{ color: COL.textDim }}>{l}</span>
              <span className={`mono ${big ? 'font-bold' : ''}`} style={{ color: big ? COL.accent : COL.text }}>SAR {fmt(a)}</span>
            </div>
          ))}
        </div>
        {error && <div className="col-span-2 text-xs px-2 py-1.5 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function stripNulls(obj) { if (!obj) return {}; const o = {}; for (const [k, v] of Object.entries(obj)) o[k] = v ?? ''; return o; }
const orNull = (v) => (v && String(v).trim() ? String(v).trim() : null);
