// ============================================================
// Select — a lightweight, accessible custom listbox that replaces the browser
// default <select> (which renders an ugly dark native menu). Enterprise styling:
// white surface, thin border, subtle shadow, rounded, checkmark on the selected
// item, hover state, keyboard support (↑/↓/Enter/Esc/Home/End), click-outside close.
// Menu width matches the trigger and scrolls instead of growing oversized.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { COL } from '../../lib/theme.js';

// options: [{ value, label }]
export function Select({ value, onChange, options = [], ariaLabel, placeholder = 'Select…', dir = 'ltr' }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const listRef = useRef(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  useEffect(() => { if (open) setActive(Math.max(0, options.findIndex((o) => o.value === value))); }, [open]); // eslint-disable-line

  function choose(i) { const o = options[i]; if (o) { onChange(o.value); setOpen(false); } }
  function onKey(e) {
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) { e.preventDefault(); setOpen(true); return; }
    if (!open) return;
    if (e.key === 'Escape') { setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); }
  }

  return (
    <div ref={wrapRef} className="relative" dir={dir}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)} onKeyDown={onKey}
        className="w-full inline-flex items-center justify-between gap-2 text-[12.5px] rounded-lg border px-2.5 py-2 outline-none focus-visible:ring-2 transition-colors"
        style={{ background: COL.surface, borderColor: COL.borderStrong, color: selected ? COL.text : COL.textMute, '--tw-ring-color': COL.accent }}>
        <span className="truncate text-start">{selected ? selected.label : placeholder}</span>
        <ChevronDown size={14} style={{ color: COL.textMute, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <ul ref={listRef} role="listbox" aria-label={ariaLabel} tabIndex={-1}
          className="absolute z-50 mt-1 w-full rounded-xl border overflow-y-auto scrollbar py-1"
          style={{ background: COL.surface, borderColor: COL.border, boxShadow: '0 8px 28px rgba(15,18,30,0.14)', maxHeight: 224 }}>
          {options.map((o, i) => {
            const isSel = o.value === value, isAct = i === active;
            return (
              <li key={o.value} role="option" aria-selected={isSel}
                onMouseEnter={() => setActive(i)} onClick={() => choose(i)}
                className="flex items-center gap-2 px-2.5 py-1.5 text-[12.5px] cursor-pointer"
                style={{ background: isAct ? COL.accentBg : 'transparent', color: COL.text }}>
                <span className="w-3.5 flex-shrink-0">{isSel && <Check size={13} style={{ color: COL.accent }} />}</span>
                <span className="truncate">{o.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
