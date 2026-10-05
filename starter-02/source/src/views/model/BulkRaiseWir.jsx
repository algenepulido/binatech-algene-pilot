// ============================================================
// BulkRaiseWirModal — raise a WIR for MANY model-selected elements at once
// (the natural large-model workflow: filter/select a level or group in the 3D
// view, then raise inspections for all of them). Creates one WIR per element
// (sharing type/result/date), then recertifies so the chain updates.
// ============================================================
import { useState } from 'react';
import { StyledSelect } from '../../components/StyledSelect.jsx';
import { Modal } from '../../components/Modal.jsx';
import { Btn } from '../../components/primitives.jsx';
import { createWir } from '../../api/wirs.js';
import { recertifyAll } from '../../lib/recertify.js';
import { WIR_RESULTS, resultLabel } from '../../lib/wirStatus.js';
import { COL } from '../../lib/theme.js';

const field = { width: '100%', padding: '7px 10px', fontSize: 12, borderRadius: 6, border: `1px solid ${COL.borderStrong}`, background: COL.surface, color: COL.text, outline: 'none' };

export function BulkRaiseWirModal({ open, guids = [], names = {}, onClose, onDone }) {
  const [prefix, setPrefix] = useState('WIR-');
  const [start, setStart] = useState(1);
  const [type, setType] = useState('');
  const [result, setResult] = useState('pending');
  const [inspector, setInspector] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [progress, setProgress] = useState(0);
  const n = guids.length;

  async function submit() {
    setBusy(true); setErr(''); setProgress(0);
    try {
      // Tag every WIR in this bulk action as one grouped-items scope (shared id),
      // so they can be recognised as a single inspection group. Still one WIR row
      // per element, so recertify is unchanged. Group id is best-effort.
      const groupId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : null;
      const scope = { scope_type: n > 1 ? 'grouped_items' : 'single_item', ...(groupId && n > 1 ? { scope_group_id: groupId } : {}) };
      let i = 0;
      for (const g of guids) {
        await createWir({ wir_number: `${prefix}${String(Number(start) + i).padStart(3, '0')}`, inspection_type: type || null, element_guid: g, result, inspector_name: inspector || null, inspection_date: date || null, ...scope });
        i++; setProgress(i);
      }
      await recertifyAll();
      onDone?.(n);
    } catch (e) { setErr(`Created ${progress} of ${n}, then: ${e?.message || e}`); }
    finally { setBusy(false); }
  }

  if (!open) return null;
  return (
    <Modal open onClose={busy ? undefined : onClose} title={`Raise ${n} WIR${n === 1 ? '' : 's'}`} subtitle="One WIR per selected element" width={520}
      footer={<><Btn variant="secondary" onClick={onClose} disabled={busy}>Cancel</Btn><Btn variant="primary" disabled={busy || n === 0} onClick={submit}>{busy ? `Creating ${progress}/${n}…` : `Create ${n} WIR${n === 1 ? '' : 's'}`}</Btn></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs block" style={{ color: COL.textDim }}>Number prefix<input value={prefix} onChange={(e) => setPrefix(e.target.value)} style={{ ...field, marginTop: 4 }} className="mono" /></label>
          <label className="text-xs block" style={{ color: COL.textDim }}>Start #<input type="number" value={start} onChange={(e) => setStart(e.target.value)} style={{ ...field, marginTop: 4 }} className="mono" /></label>
          <label className="text-xs block" style={{ color: COL.textDim }}>Inspection type<input value={type} onChange={(e) => setType(e.target.value)} placeholder="Rebar inspection" style={{ ...field, marginTop: 4 }} /></label>
          <label className="text-xs block" style={{ color: COL.textDim }}>Result<div style={{ marginTop: 4 }}><StyledSelect ariaLabel="Result" value={result} onChange={setResult} options={WIR_RESULTS.map((r) => ({ value: r, label: resultLabel(r) }))} /></div></label>
          <label className="text-xs block" style={{ color: COL.textDim }}>Inspector<input value={inspector} onChange={(e) => setInspector(e.target.value)} style={{ ...field, marginTop: 4 }} /></label>
          <label className="text-xs block" style={{ color: COL.textDim }}>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...field, marginTop: 4 }} className="mono" /></label>
        </div>
        <div>
          <div className="mono text-[10px] tracking-widest mb-1" style={{ color: COL.textMute }}>ELEMENTS ({n})</div>
          <div className="rounded-lg border max-h-28 overflow-y-auto scrollbar text-[11.5px]" style={{ borderColor: COL.border }}>
            {guids.slice(0, 200).map((g, i) => <div key={g} className="px-3 py-1 border-b last:border-0 truncate" style={{ borderColor: COL.border }}><span className="mono me-2" style={{ color: COL.textMute }}>{prefix}{String(Number(start) + i).padStart(3, '0')}</span>{names[g]?.name || g}</div>)}
            {n > 200 && <div className="px-3 py-1 text-[10px]" style={{ color: COL.textMute }}>…and {n - 200} more</div>}
          </div>
        </div>
        {err && <div className="text-xs px-2 py-1.5 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{err}</div>}
      </div>
    </Modal>
  );
}
