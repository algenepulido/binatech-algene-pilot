// ============================================================
// StyledSelect — a clean, branded dropdown that replaces the raw OS <select>.
// Custom popover (NOT an OS menu), keyboard-accessible (↑/↓/Home/End/Enter/Esc,
// Space to open), RTL-correct via logical properties, optional colour swatch per
// option, and optgroup-style grouping. Presentation only — it just emits the
// chosen value string.
//
//   <StyledSelect value={v} onChange={setV} options={[{value,label,color}]} />
//   <StyledSelect value={v} onChange={setV} groups={[{label, options:[...]}]} />
// ============================================================
import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { COL } from '../lib/theme.js';

export function StyledSelect({ value, onChange, options, groups, ariaLabel, id, placeholder = 'Select…', disabled = false, title }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef(null);
  const listRef = useRef(null);

  const flat = useMemo(() => (groups ? groups.flatMap((g) => g.options) : (options || [])), [groups, options]);
  const selected = flat.find((o) => o.value === value) || null;

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  // On open, start the keyboard highlight on the current value.
  useEffect(() => { if (open) { const i = flat.findIndex((o) => o.value === value); setActive(i < 0 ? 0 : i); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (v) => { onChange?.(v); setOpen(false); };
  const onKey = (e) => {
    // When the popover is open, Escape closes it AND must not bubble — otherwise
    // a StyledSelect inside a Modal would also trigger the modal's Escape-to-close
    // and discard the form. Closed → let Escape bubble so the modal dismisses.
    if (e.key === 'Escape') { if (open) { e.stopPropagation(); setOpen(false); } return; }
    if (!open) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(flat.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const o = flat[active]; if (o) choose(o.value); }
  };

  let idx = -1;
  const Option = (o) => {
    idx += 1; const i = idx; const isSel = o.value === value; const isActive = i === active;
    return (
      <button type="button" key={o.value} role="option" aria-selected={isSel} data-idx={i}
        onMouseEnter={() => setActive(i)} onClick={() => choose(o.value)}
        className="w-full text-start px-2.5 py-2 sm:py-1.5 min-h-[40px] sm:min-h-0 flex items-center gap-2 text-[12px]"
        style={{ background: isSel ? COL.accentBg : isActive ? COL.surfaceAlt : 'transparent', color: COL.text }}>
        {o.color && <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: o.color }} />}
        <span className="flex-1 truncate">{o.label}</span>
        {isSel && <Check size={13} style={{ color: COL.accent, flexShrink: 0 }} />}
      </button>
    );
  };

  return (
    <div className="relative" ref={ref}>
      <button type="button" id={id} aria-label={ariaLabel} title={title} disabled={disabled} aria-haspopup="listbox" aria-expanded={open}
        onClick={() => { if (!disabled) setOpen((o) => !o); }} onKeyDown={(e) => { if (!disabled) onKey(e); }}
        className="w-full flex items-center gap-2 rounded-md outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[38px] sm:min-h-0"
        style={{ padding: '7px 10px', fontSize: 12, border: `1px solid ${open ? COL.accent : COL.border}`, background: COL.bg, color: COL.text }}>
        {selected?.color && <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: selected.color }} />}
        <span className="flex-1 text-start truncate" style={{ color: selected ? COL.text : COL.textMute }}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={14} style={{ color: COL.textMute, flexShrink: 0 }} />
      </button>
      {open && (
        <div ref={listRef} role="listbox" aria-label={ariaLabel}
          className="absolute z-[70] mt-1 w-full rounded-lg border shadow-lg max-h-72 overflow-y-auto scrollbar py-1"
          style={{ background: COL.surface, borderColor: COL.border }}>
          {groups
            ? groups.map((g) => (
              <div key={g.label}>
                <div className="px-2.5 pt-1.5 pb-0.5 mono text-[9px] uppercase tracking-widest" style={{ color: COL.textMute }}>{g.label}</div>
                {g.options.map(Option)}
              </div>
            ))
            : (options || []).map(Option)}
        </div>
      )}
    </div>
  );
}
