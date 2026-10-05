// ============================================================
// Package controls — a selector + manager used in the Model view and QS/BoQ.
// A package is an optional grouping under the project (Project > Package, one
// level). "All" = the whole project (the master view); selecting a package
// shows a subset. Project-level totals/IPC always reflect the whole project.
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { StyledSelect } from './StyledSelect.jsx';
import { confirmDialog } from './ConfirmDialog.jsx';
import { toast } from './Toast.jsx';
import { Check, Layers, Pencil, Plus, Trash2, Settings2, X } from 'lucide-react';
import { Modal } from './Modal.jsx';
import { Btn } from './primitives.jsx';
import { listPackages, createPackage, updatePackage, deletePackage } from '../api/packages.js';
import { COL } from '../lib/theme.js';

export function usePackages() {
  const [packages, setPackages] = useState([]);
  const reload = useCallback(() => { listPackages().then(setPackages).catch(() => setPackages([])); }, []);
  useEffect(() => { reload(); }, [reload]);
  return { packages, reload };
}

const selStyle = { padding: '6px 9px', fontSize: 12, borderRadius: 8, border: `1px solid ${COL.borderStrong}`, background: COL.surface, color: COL.text, outline: 'none' };

export function PackageSelect({ value, onChange, packages, includeUnassigned = true, allLabel = 'Whole project', style }) {
  return (
    <div style={style}><StyledSelect ariaLabel="Filter by package" value={value} onChange={onChange} options={[
      { value: 'all', label: allLabel },
      ...(includeUnassigned ? [{ value: 'unassigned', label: 'Unassigned' }] : []),
      ...packages.map((p) => ({ value: p.id, label: `${p.code ? `${p.code} · ` : ''}${p.name}` })),
    ]} /></div>
  );
}

// A compact bar: [Layers] Package: <select>  [Manage]
export function PackageBar({ packages, value, onChange, onManage }) {
  return (
    <div className="flex items-center gap-2">
      <Layers size={14} style={{ color: COL.textDim }} />
      <span className="text-[11px]" style={{ color: COL.textDim }}>Package:</span>
      <PackageSelect value={value} onChange={onChange} packages={packages} />
      <button onClick={onManage} className="px-2 py-1.5 text-[11px] rounded-lg border font-medium flex items-center gap-1.5" style={{ borderColor: COL.borderStrong, color: COL.text }}><Settings2 size={12} /> Manage</button>
    </div>
  );
}

const fStyle = { width: '100%', padding: '9px 11px', fontSize: 13.5, borderRadius: 9, border: `1px solid ${COL.borderStrong}`, background: COL.surface, color: COL.text, outline: 'none' };

export function PackageManagerModal({ open, onClose, packages, onChanged }) {
  const [form, setForm] = useState({ name: '', code: '', type: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const upd = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function add() {
    if (!form.name.trim()) { setError('Give the package a name.'); return; }
    setBusy(true); setError('');
    try { await createPackage(form); setForm({ name: '', code: '', type: '' }); onChanged?.(); }
    catch (e) { setError(/relation|does not exist|packages/i.test(e?.message || '') ? 'Packages table isn’t set up yet — run supabase/packages_additive.sql.' : (e?.message || 'Could not create package.')); }
    finally { setBusy(false); }
  }
  function startRename(p) { setEditId(p.id); setEditName(p.name || ''); }
  async function saveRename(p) {
    const name = editName.trim();
    setEditId(null);
    if (!name || name === p.name) return;
    try { await updatePackage(p.id, { name }); onChanged?.(); } catch (e) { toast.error(e.message); }
  }
  async function remove(p) {
    if (!await confirmDialog(`Delete package "${p.name}"? Elements/BOQ lines in it become Unassigned (not deleted).`)) return;
    try { await deletePackage(p.id); onChanged?.(); } catch (e) { toast.error(e.message); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Packages" subtitle="Optional groupings under this project (e.g. Bridge A, Substructure)" width={520}
      footer={<Btn variant="secondary" onClick={onClose}>Close</Btn>}>
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_90px_110px_auto] gap-2 items-end">
          <div><label className="block text-[11px] font-semibold mb-1" style={{ color: COL.textDim }}>Name *</label><input value={form.name} onChange={upd('name')} style={fStyle} placeholder="Bridge A" /></div>
          <div><label className="block text-[11px] font-semibold mb-1" style={{ color: COL.textDim }}>Code</label><input value={form.code} onChange={upd('code')} style={fStyle} placeholder="PKG-A" /></div>
          <div><label className="block text-[11px] font-semibold mb-1" style={{ color: COL.textDim }}>Type</label><input value={form.type} onChange={upd('type')} style={fStyle} placeholder="Zone" /></div>
          <Btn variant="primary" icon={Plus} onClick={add}>{busy ? '…' : 'Add'}</Btn>
        </div>
        {error && <div className="text-[12px] px-3 py-2 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}

        <div className="border rounded-lg overflow-hidden" style={{ borderColor: COL.border }}>
          {packages.length === 0 && <div className="px-3 py-6 text-center text-xs" style={{ color: COL.textMute }}>No packages yet. The whole project is one implicit package.</div>}
          {packages.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2 border-b last:border-0" style={{ borderColor: COL.border }}>
              <Layers size={13} style={{ color: COL.accent }} />
              {editId === p.id ? (
                <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveRename(p); if (e.key === 'Escape') setEditId(null); }}
                  className="flex-1 px-2 py-1 text-[13px] rounded border outline-none" style={{ borderColor: COL.borderStrong, background: COL.surface, color: COL.text }} />
              ) : (
                <span className="text-[13px] font-medium flex-1">{p.code ? <span className="mono text-[11px]" style={{ color: COL.textDim }}>{p.code} · </span> : null}{p.name}</span>
              )}
              {p.type && editId !== p.id && <span className="mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: COL.surfaceAlt, color: COL.textDim }}>{p.type}</span>}
              {editId === p.id
                ? <button onClick={() => saveRename(p)} className="p-1 rounded hover:bg-stone-100" style={{ color: '#15803d' }} title="Save"><Check size={13} /></button>
                : <button onClick={() => startRename(p)} className="p-1 rounded hover:bg-stone-100" style={{ color: COL.accent }} title="Rename"><Pencil size={13} /></button>}
              <button onClick={() => remove(p)} className="p-1 rounded hover:bg-stone-100" style={{ color: '#b91c1c' }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
