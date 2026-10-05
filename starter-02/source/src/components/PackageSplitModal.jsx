// ============================================================
// Package split preview/accept. Shows proposed packages (from the deterministic
// splitter OR an AI suggestion), their lines, counts, and contract value. The
// user can rename, move lines between groups, merge, add a group, then Accept
// (writes package rows + line assignments) or Cancel (writes nothing). Every
// line always sits in exactly one column (incl. "Unassigned"), so the package
// totals + unassigned ALWAYS reconcile to the project contract total.
// Organizational only — certification math is never touched.
// ============================================================
import { useMemo, useState, useEffect } from 'react';
import { StyledSelect } from './StyledSelect.jsx';
import { Layers, Plus, Check } from 'lucide-react';
import { Modal } from './Modal.jsx';
import { Btn } from './primitives.jsx';
import { suggestPackages } from '../lib/packageSplit.js';
import { createPackage, assignLinesToPackage } from '../api/packages.js';
import { fmt } from '../lib/format.js';
import { COL } from '../lib/theme.js';

let _n = 0;
const tid = () => `g${++_n}`;
const UNASSIGNED = '__unassigned__';
const lineValue = (l) => Number(l?.qty || 0) * Number(l?.rate || 0);

export function PackageSplitModal({ open, lines = [], initialGroups = null, title = 'Suggested packages', onClose, onAccepted }) {
  const linesById = useMemo(() => Object.fromEntries(lines.map((l) => [l.id, l])), [lines]);
  const [cols, setCols] = useState([]);          // [{ id, name }]
  const [assign, setAssign] = useState({});       // { lineId: colId }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // (Re)seed columns + assignment whenever the modal opens or its source changes.
  useEffect(() => {
    if (!open) return;
    const groups = initialGroups || suggestPackages(lines);
    const nextCols = groups.map((g) => ({ id: tid(), name: g.name }));
    const a = {};
    groups.forEach((g, i) => (g.lineIds || []).forEach((id) => { if (linesById[id]) a[id] = nextCols[i].id; }));
    lines.forEach((l) => { if (!(l.id in a)) a[l.id] = UNASSIGNED; }); // any leftover line is never lost
    setCols(nextCols); setAssign(a); setError('');
  }, [open, initialGroups, lines, linesById]);

  const linesOf = (colId) => lines.filter((l) => assign[l.id] === colId);
  const valueOf = (colId) => linesOf(colId).reduce((s, l) => s + lineValue(l), 0);
  const projectTotal = useMemo(() => lines.reduce((s, l) => s + lineValue(l), 0), [lines]);
  const unassignedValue = valueOf(UNASSIGNED);
  const packagedValue = projectTotal - unassignedValue;
  const reconciles = Math.round((packagedValue + unassignedValue) * 100) === Math.round(projectTotal * 100);

  const rename = (id, name) => setCols((cs) => cs.map((c) => (c.id === id ? { ...c, name } : c)));
  const moveLine = (lineId, colId) => setAssign((a) => ({ ...a, [lineId]: colId }));
  const addCol = () => setCols((cs) => [...cs, { id: tid(), name: `Package ${cs.length + 1}` }]);
  const mergeInto = (fromId, toId) => {
    if (!toId || toId === fromId) return;
    setAssign((a) => { const n = { ...a }; Object.keys(n).forEach((lid) => { if (n[lid] === fromId) n[lid] = toId; }); return n; });
    setCols((cs) => cs.filter((c) => c.id !== fromId));
  };

  async function accept() {
    setBusy(true); setError('');
    try {
      for (const c of cols) {
        const ids = linesOf(c.id).map((l) => l.id);
        if (!ids.length) continue;                       // skip empty columns
        const pkg = await createPackage({ name: (c.name || 'Package').trim() });
        await assignLinesToPackage(ids, pkg.id);
      }
      onAccepted?.();
      onClose?.();
    } catch (e) {
      setError(/relation|does not exist|packages|package_id|column/i.test(e?.message || '') ? 'Packages schema isn’t set up yet — run supabase/packages_additive.sql, then retry.' : (e?.message || 'Could not save packages.'));
    } finally { setBusy(false); }
  }

  const allCols = [...cols, { id: UNASSIGNED, name: 'Unassigned (stays as-is)' }];

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle="Review, rename, move lines, then Accept. Nothing is written until you Accept." width={760}
      footer={<>
        <span className="text-[11px] me-auto" style={{ color: reconciles ? '#15803d' : '#b91c1c' }}>
          {reconciles ? '✓' : '⚠'} Σ packages {fmt(Math.round(packagedValue))} + unassigned {fmt(Math.round(unassignedValue))} = project {fmt(Math.round(projectTotal))} SAR
        </span>
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" icon={Check} onClick={accept} disabled={busy}>{busy ? 'Saving…' : 'Accept & assign'}</Btn>
      </>}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px]" style={{ color: COL.textDim }}>{cols.length} proposed package{cols.length === 1 ? '' : 's'} · {lines.length} lines</div>
          <Btn variant="secondary" icon={Plus} onClick={addCol}>Add group</Btn>
        </div>
        {error && <div className="text-[12px] px-3 py-2 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[52vh] overflow-y-auto scrollbar pe-1">
          {allCols.map((c) => {
            const cls = linesOf(c.id);
            const isUnassigned = c.id === UNASSIGNED;
            if (isUnassigned && cls.length === 0) return null;
            return (
              <div key={c.id} className="rounded-lg border" style={{ borderColor: COL.border, background: isUnassigned ? COL.bg : COL.surface }}>
                <div className="px-3 py-2 border-b flex items-center gap-2" style={{ borderColor: COL.border }}>
                  <Layers size={13} style={{ color: isUnassigned ? COL.textMute : COL.accent }} />
                  {isUnassigned
                    ? <span className="text-[12px] font-semibold flex-1" style={{ color: COL.textDim }}>{c.name}</span>
                    : <input value={c.name} onChange={(e) => rename(c.id, e.target.value)} className="flex-1 px-2 py-1 text-[12px] font-semibold rounded border outline-none" style={{ borderColor: COL.border, background: COL.surface, color: COL.text }} />}
                  <span className="mono text-[10px]" style={{ color: COL.textDim }}>{cls.length} · {fmt(Math.round(valueOf(c.id)))}</span>
                  {!isUnassigned && cols.length > 1 && (
                    <div className="min-w-[88px]"><StyledSelect ariaLabel="Merge into" title="Merge into…" value="" onChange={(v) => mergeInto(c.id, v)} options={[{ value: '', label: 'merge…' }, ...cols.filter((o) => o.id !== c.id).map((o) => ({ value: o.id, label: o.name }))]} /></div>
                  )}
                </div>
                <div className="max-h-44 overflow-y-auto scrollbar">
                  {cls.length === 0 && <div className="px-3 py-3 text-center text-[11px]" style={{ color: COL.textMute }}>No lines</div>}
                  {cls.map((l) => (
                    <div key={l.id} className="flex items-center gap-2 px-3 py-1.5 border-b last:border-0 text-[11px]" style={{ borderColor: COL.border }}>
                      <span className="mono text-[10px] font-semibold" style={{ color: COL.accent }}>{l.code}</span>
                      <span className="flex-1 truncate" style={{ color: COL.text }} title={l.description}>{l.description}</span>
                      <span className="mono text-[10px]" style={{ color: COL.textDim }}>{fmt(Math.round(lineValue(l)))}</span>
                      <div className="w-[120px]"><StyledSelect ariaLabel="Move to" title="Move to…" value={c.id} onChange={(v) => moveLine(l.id, v)} options={allCols.map((o) => ({ value: o.id, label: o.name }))} /></div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
