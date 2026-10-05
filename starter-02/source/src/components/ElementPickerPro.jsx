// ============================================================
// ElementPickerPro — finds & links a model element at SCALE. Combinable filters
// (storey/level, IFC type, package, free-text by name/GUID) cut thousands of
// elements down to the relevant few, and the result list is VIRTUALIZED so it
// stays fast with very large models. Single-select (stores the element GUID).
// Drop-in replacement for ElementPicker (same value/onChange props).
// ============================================================
import { useMemo, useState } from 'react';
import { StyledSelect } from './StyledSelect.jsx';
import { Search, X, Check, SlidersHorizontal } from 'lucide-react';
import { useElements } from '../lib/elements.jsx';
import { usePackages } from './PackageControls.jsx';
import { normalizeStorey } from '../lib/storey.js';
import { COL } from '../lib/theme.js';

const byNum = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
const selStyle = { padding: '6px 8px', fontSize: 11.5, borderRadius: 7, border: `1px solid ${COL.borderStrong}`, background: COL.surface, color: COL.text, outline: 'none' };
const ROW_H = 44;

export function ElementPickerPro({ value, onChange, id = 'element' }) {
  const { elements, usingModel } = useElements();
  const { packages } = usePackages();
  const [q, setQ] = useState('');
  const [level, setLevel] = useState('');
  const [type, setType] = useState('');
  const [pkg, setPkg] = useState('');

  const selected = useMemo(() => elements.find((e) => e.guid === value) || null, [elements, value]);
  const levels = useMemo(() => [...new Set(elements.map((e) => e.level).filter(Boolean))].sort(byNum), [elements]);
  const types = useMemo(() => [...new Set(elements.map((e) => e.type).filter(Boolean))].sort(byNum), [elements]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return elements.filter((e) => {
      if (level && (e.level || '') !== level) return false;
      if (type && (e.type || '') !== type) return false;
      if (pkg === 'none' ? e.package_id : pkg && e.package_id !== pkg) return false;
      if (s && !`${e.name} ${e.type} ${e.guid} ${e.level || ''}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [elements, q, level, type, pkg]);

  const hasFilter = q || level || type || pkg;
  // Lightweight virtualization without importing VirtualList (keeps row markup
  // local + styled). Window the filtered list to the visible slice.
  const [scrollTop, setScrollTop] = useState(0);
  const listH = 232, over = 6;
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - over);
  const end = Math.min(filtered.length, start + Math.ceil(listH / ROW_H) + over * 2);
  const slice = filtered.slice(start, end);

  return (
    <div className="rounded-lg border" style={{ borderColor: COL.border, background: COL.bg }}>
      {/* Selected element pinned at top */}
      {selected && (
        <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: COL.border, background: COL.accentBg }}>
          <Check size={13} style={{ color: COL.accent, flexShrink: 0 }} />
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold truncate" style={{ color: COL.accent }}>{selected.name}</div>
            <div className="mono text-[9px] truncate" style={{ color: COL.textMute }}>{selected.type}{selected.level ? ` · ${normalizeStorey(selected.level)}` : ''}</div>
          </div>
          <button type="button" onClick={() => onChange('')} className="flex-shrink-0" style={{ color: COL.textMute }} aria-label="Clear"><X size={14} /></button>
        </div>
      )}

      {/* Filters */}
      <div className="p-2 space-y-2 border-b" style={{ borderColor: COL.border }}>
        <div className="relative">
          <Search size={13} className="absolute start-2 top-1/2 -translate-y-1/2" style={{ color: COL.textMute }} />
          <input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or GUID…" autoComplete="off"
            className="w-full ps-7 pe-2 py-1.5 text-[12px] rounded-lg border outline-none focus:border-blue-500" style={{ background: COL.surface, borderColor: COL.borderStrong, color: COL.text }} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <div className="min-w-[110px]"><StyledSelect ariaLabel="Filter by level" value={level} onChange={setLevel} options={[{ value: '', label: 'All levels' }, ...levels.map((l) => ({ value: l, label: normalizeStorey(l) }))]} /></div>
          <div className="min-w-[110px]"><StyledSelect ariaLabel="Filter by type" value={type} onChange={setType} options={[{ value: '', label: 'All types' }, ...types.map((tp) => ({ value: tp, label: (tp || '').replace(/^Ifc/, '') }))]} /></div>
          {packages.length > 0 && <div className="min-w-[110px]"><StyledSelect ariaLabel="Filter by package" value={pkg} onChange={setPkg} options={[{ value: '', label: 'All packages' }, { value: 'none', label: 'Unassigned' }, ...packages.map((p) => ({ value: p.id, label: p.name }))]} /></div>}
          {hasFilter && <button type="button" onClick={() => { setQ(''); setLevel(''); setType(''); setPkg(''); }} className="text-[11px] px-2 py-1 rounded-lg" style={{ color: COL.textDim }}><SlidersHorizontal size={11} className="inline me-1" />Clear</button>}
        </div>
        <div className="mono text-[10px]" style={{ color: COL.textMute }}>{filtered.length.toLocaleString()} of {elements.length.toLocaleString()} elements{!usingModel ? ' (sample model)' : ''}</div>
      </div>

      {/* Virtualized result list */}
      <div onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} className="overflow-y-auto scrollbar" style={{ height: listH }}>
        {filtered.length === 0 ? (
          <div className="px-3 py-8 text-center text-[12px]" style={{ color: COL.textMute }}>No elements match these filters.</div>
        ) : (
          <div style={{ height: filtered.length * ROW_H, position: 'relative' }}>
            <div style={{ position: 'absolute', insetInlineStart: 0, insetInlineEnd: 0, transform: `translateY(${start * ROW_H}px)` }}>
              {slice.map((e) => {
                const on = e.guid === value;
                return (
                  <button key={e.guid} type="button" onClick={() => onChange(e.guid)} title={e.name} style={{ height: ROW_H }}
                    className="w-full flex items-center gap-2 px-3 text-start border-b last:border-0 hover:bg-stone-50" >
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: on ? COL.accent : 'transparent', border: on ? 'none' : `1px solid ${COL.borderStrong}` }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-medium truncate" style={{ color: on ? COL.accent : COL.text }}>{e.name}</span>
                      <span className="block mono text-[9px] truncate" style={{ color: COL.textMute }}>{(e.type || '').replace(/^Ifc/, '')}{e.level ? ` · ${normalizeStorey(e.level)}` : ''}</span>
                    </span>
                    {on && <Check size={13} style={{ color: COL.accent, flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
