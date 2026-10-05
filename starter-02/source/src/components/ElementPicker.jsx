// ============================================================
// ElementPicker — search & pick a model element by NAME (the IFC GUID is
// stored under the hood, shown small). Sources the active uploaded BIM
// model's real elements, else the built-in sample. Stores `guid`.
// ============================================================
import { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { ELEMENTS } from '../data/elements.js';
import { useElements } from '../lib/elements.jsx';
import { COL } from '../lib/theme.js';

/** Static resolver over the sample elements (fallback for non-hook callers). */
export const elementByGuid = (guid) => ELEMENTS.find((e) => e.guid === guid) ?? null;

const inputStyle = {
  width: '100%', padding: '7px 32px 7px 28px', fontSize: 12.5, borderRadius: 6,
  border: `1px solid ${COL.border}`, background: COL.bg, color: COL.text, outline: 'none',
};

export function ElementPicker({ value, onChange, id = 'element-guid' }) {
  const { elements, usingModel } = useElements();
  const match = elements.find((e) => e.guid === value) || null;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const display = open ? q : (match ? match.name : value || '');
  const s = (q || '').toLowerCase();
  const filtered = elements.filter((e) => !s || `${e.name} ${e.type} ${e.guid} ${e.level || ''}`.toLowerCase().includes(s)).slice(0, 300);

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search size={13} className="absolute start-2 top-1/2 -translate-y-1/2" style={{ color: COL.textMute }} />
        <input
          value={display}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => { setQ(''); setOpen(true); }}
          placeholder="Search an element by name…"
          style={inputStyle}
        />
        {value && !open && <button type="button" onClick={() => onChange('')} className="absolute end-2 top-1/2 -translate-y-1/2" style={{ color: COL.textMute }} title="Clear"><X size={13} /></button>}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border shadow-lg max-h-64 overflow-y-auto scrollbar" style={{ background: COL.surface, borderColor: COL.border }}>
          {filtered.length === 0 && <div className="px-3 py-3 text-xs text-center" style={{ color: COL.textMute }}>No elements match.</div>}
          {filtered.map((el) => (
            <button key={el.guid} type="button" onClick={() => { onChange(el.guid); setOpen(false); }} className="w-full text-start px-3 py-2 hover:bg-stone-50 border-b last:border-0" style={{ borderColor: COL.border, background: el.guid === value ? COL.accentBg : 'transparent' }}>
              <div className="text-[12.5px] font-medium truncate" style={{ color: el.guid === value ? COL.accent : COL.text }}>{el.name}</div>
              <div className="mono text-[9px] truncate" style={{ color: COL.textMute }}>{el.type}{el.level ? ` · ${el.level}` : ''} · {el.guid}</div>
            </button>
          ))}
        </div>
      )}

      <div className="text-[10px] mt-1" style={{ color: COL.textDim }}>
        {match ? `Linked to ${match.name}` : value ? 'Custom GUID (not in current model)' : usingModel ? 'Optional — choose an element from your uploaded BIM model' : 'Optional — anchors this record to a model element'}
      </div>
    </div>
  );
}
