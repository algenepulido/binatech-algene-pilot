// ============================================================
// BulkEditModal — apply one field change to many selected BOQ lines at once
// (rate, approved qty, unit, or package). Reuses updateBoqItem per row.
// ============================================================
import { useState } from 'react';
import { StyledSelect } from '../../components/StyledSelect.jsx';
import { Check } from 'lucide-react';
import { Modal } from '../../components/Modal.jsx';
import { Btn, MoneyInput } from '../../components/primitives.jsx';
import { updateBoqItem } from '../../api/boqItems.js';
import { COL } from '../../lib/theme.js';

const fStyle = { width: '100%', padding: '9px 11px', fontSize: 13.5, borderRadius: 9, border: `1px solid ${COL.borderStrong}`, background: COL.surface, color: COL.text, outline: 'none' };

const FIELDS = [
  { key: 'rate', label: 'Rate (SAR)', kind: 'money' },
  { key: 'approved_qty', label: 'Approved Qty', kind: 'num' },
  { key: 'qty', label: 'Total Qty', kind: 'num' },
  { key: 'unit', label: 'Unit', kind: 'text' },
  { key: 'package_id', label: 'Package', kind: 'package' },
];

export function BulkEditModal({ open, ids = [], packages = [], onClose, onDone }) {
  const [field, setField] = useState('rate');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const def = FIELDS.find((f) => f.key === field);

  async function apply() {
    setBusy(true); setError('');
    let val = value;
    if (def.kind === 'num' || def.kind === 'money') val = Number(value) || 0;
    if (def.kind === 'package') val = value || null;
    if (def.kind === 'text') val = value.trim() || null;
    try {
      for (const id of ids) await updateBoqItem(id, { [field]: val });
      onDone?.();
    } catch (e) { setError(e?.message || 'Could not apply.'); setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Edit ${ids.length} selected line${ids.length === 1 ? '' : 's'}`} subtitle="Set one field across all selected BOQ lines" width={460}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="primary" icon={Check} disabled={busy} onClick={apply}>{busy ? 'Applying…' : `Apply to ${ids.length}`}</Btn></>}>
      <div className="space-y-3.5">
        <div>
          <label className="block text-[12px] font-semibold mb-1.5" style={{ color: COL.text }}>Field</label>
          <StyledSelect ariaLabel="Field" value={field} onChange={(v) => { setField(v); setValue(''); }} options={FIELDS.map((f) => ({ value: f.key, label: f.label }))} />
        </div>
        <div>
          <label className="block text-[12px] font-semibold mb-1.5" style={{ color: COL.text }}>New value</label>
          {def.kind === 'money' ? <MoneyInput value={value} onChange={setValue} style={fStyle} className="mono" />
            : def.kind === 'package' ? (
              <StyledSelect ariaLabel="Package" value={value} onChange={setValue} options={[{ value: '', label: 'Unassigned (whole project)' }, ...packages.map((p) => ({ value: p.id, label: `${p.code ? `${p.code} · ` : ''}${p.name}` }))]} />
            ) : <input value={value} onChange={(e) => setValue(e.target.value)} inputMode={def.kind === 'num' ? 'decimal' : undefined} style={fStyle} className={def.kind === 'num' ? 'mono' : ''} placeholder={def.kind === 'num' ? '0' : ''} />}
        </div>
        {error && <div className="text-[12px] px-3 py-2 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}
        <div className="text-[12px]" style={{ color: COL.textMute }}>This updates {ids.length} line{ids.length === 1 ? '' : 's'}. Other fields are untouched.</div>
      </div>
    </Modal>
  );
}
