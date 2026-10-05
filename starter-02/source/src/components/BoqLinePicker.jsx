// ============================================================
// BoqLinePicker — a clean, branded, searchable dropdown for choosing a BoQ
// LINE item (code leading in mono, description truncated to one line, full text
// on hover). Searchable by code or description, keyboard navigable (↑/↓/Enter),
// ESC + outside-click to close, "— none —" pinned at top, high z-index so it
// sits above modal content, RTL-correct via logical properties. Stores the
// boq_item_id. Pass an ALREADY-FILTERED `items` list (real line items only).
// ============================================================
import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';
import { COL } from '../lib/theme.js';

const inputStyle = {
  width: '100%', padding: '8px 30px', fontSize: 13, borderRadius: 8,
  border: `1px solid ${COL.borderStrong}`, background: COL.surface, color: COL.text, outline: 'none',
};

export function BoqLinePicker({ value, items = [], onChange, id = 'boq-line', placeholder = 'Search a BoQ line by code or description…', noneLabel = '— none —' }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const ref = useRef(null);
  const listRef = useRef(null);
  const selected = items.find((b) => b.id === value) || null;

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const s = q.trim().toLowerCase();
  const filtered = useMemo(
    () => items.filter((b) => !s || `${b.code || ''} ${b.description || ''}`.toLowerCase().includes(s)),
    [items, s],
  );
  const options = useMemo(() => [{ id: '', none: true }, ...filtered], [filtered]);
  useEffect(() => { setHi(0); }, [s, open]);
  // Keep the highlighted option visible during keyboard navigation.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[hi];
    if (el?.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [hi, open]);

  const choose = (oid) => { onChange?.(oid); setOpen(false); setQ(''); };

  const onKey = (e) => {
    // Swallow Escape only while open, so it doesn't also close a parent Modal.
    if (e.key === 'Escape') { if (open) { e.stopPropagation(); setOpen(false); } return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && open) { e.preventDefault(); const o = options[hi]; if (o) choose(o.none ? '' : o.id); }
  };

  const display = open ? q : (selected ? `${selected.code ? selected.code + ' · ' : ''}${selected.description || ''}` : '');

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search size={14} className="absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: COL.textMute }} />
        <input
          id={id} value={display} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} autoComplete="off"
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => { setQ(''); setOpen(true); }}
          onKeyDown={onKey}
          placeholder={placeholder} style={inputStyle}
        />
        {value && !open ? (
          <button type="button" onClick={() => choose('')} className="absolute end-2 top-1/2 -translate-y-1/2" style={{ color: COL.textMute }} aria-label="Clear" title="Clear"><X size={14} /></button>
        ) : (
          <ChevronDown size={14} className="absolute end-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: COL.textMute }} />
        )}
      </div>

      {open && (
        <div id={`${id}-list`} ref={listRef} role="listbox" className="absolute z-[60] mt-1 w-full rounded-lg border shadow-lg max-h-72 overflow-y-auto scrollbar" style={{ background: COL.surface, borderColor: COL.border }}>
          {options.map((o, idx) => {
            const active = idx === hi;
            if (o.none) {
              return (
                <button key="none" type="button" role="option" aria-selected={!value} onMouseEnter={() => setHi(idx)} onClick={() => choose('')}
                  className="w-full text-start px-3 py-2 border-b" style={{ borderColor: COL.border, background: active ? COL.surfaceAlt : 'transparent', color: COL.textDim }}>
                  {noneLabel}
                </button>
              );
            }
            const sel = o.id === value;
            return (
              <button key={o.id} type="button" role="option" aria-selected={sel} onMouseEnter={() => setHi(idx)} onClick={() => choose(o.id)}
                title={`${o.code || ''} ${o.description || ''}`.trim()}
                className="w-full text-start px-3 py-2 border-b last:border-0 flex items-center gap-2.5" style={{ borderColor: COL.border, background: sel ? COL.accentBg : active ? COL.surfaceAlt : 'transparent' }}>
                <span className="mono text-[11px] font-semibold flex-shrink-0" style={{ color: COL.accent, minWidth: 46 }}>{o.code || '—'}</span>
                <span className="text-[12.5px] truncate" style={{ color: sel ? COL.accent : COL.text }}>{o.description || ''}</span>
                {o.unit && <span className="mono text-[10px] flex-shrink-0 ms-auto ps-2" style={{ color: COL.textMute }}>{o.unit}</span>}
              </button>
            );
          })}
          {filtered.length === 0 && <div className="px-3 py-3 text-xs text-center" style={{ color: COL.textMute }}>No BoQ lines match.</div>}
        </div>
      )}
    </div>
  );
}
