// ============================================================
// resizableColumns — a tiny, dependency-free helper to give CSS-Grid tables
// drag-to-resize columns that persist per table (localStorage). Presentation
// only: it owns column WIDTHS, nothing about the data or sorting.
//
// Usage:
//   const COLS = [
//     { key: 'check', w: 34, resizable: false },     // fixed, no handle
//     { key: 'name',  w: 220, flex: true },          // absorbs slack (minmax → 1fr)
//     { key: 'type',  w: 140 },                       // plain fixed, resizable
//   ];
//   const { template, startResize, reset } = useResizableColumns('regCols.v1', COLS);
//   <div style={{ gridTemplateColumns: template }}>
//     {COLS.map((c) => <button className="relative">{label}{c.resizable !== false && <ColResizer onResize={(e) => startResize(c.key, e)} />}</button>)}
//   </div>
// ============================================================
import { useState, useCallback, useRef } from 'react';
import { COL } from '../lib/theme.js';

const MIN_W = 48; // px — never let a column collapse to nothing

export function useResizableColumns(storageKey, columns) {
  const defaults = () => { const b = {}; columns.forEach((c) => { b[c.key] = c.w; }); return b; };
  const [widths, setWidths] = useState(() => {
    const base = defaults();
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      for (const k of Object.keys(base)) if (typeof saved[k] === 'number' && saved[k] >= MIN_W) base[k] = saved[k];
    } catch { /* ignore corrupt storage */ }
    return base;
  });

  const persist = useCallback((next) => { try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ } }, [storageKey]);

  // Build the grid-template-columns string in declared column order. A `flex`
  // column uses minmax(width, 1fr) so it absorbs leftover width (no trailing
  // gap); everything else is a fixed px track.
  const template = columns.map((c) => {
    const w = widths[c.key] ?? c.w;
    return c.flex ? `minmax(${w}px, 1fr)` : `${w}px`;
  }).join(' ');

  const startResize = useCallback((key, ev) => {
    ev.preventDefault(); ev.stopPropagation();
    const startX = ev.clientX;
    const startW = widths[key] ?? columns.find((c) => c.key === key)?.w ?? 100;
    // In RTL the trailing edge is on the left, so dragging direction inverts.
    let rtl = false;
    try { rtl = getComputedStyle(ev.currentTarget).direction === 'rtl'; } catch { /* default LTR */ }
    const sign = rtl ? -1 : 1;
    let latest = startW;
    const onMove = (e) => {
      latest = Math.max(MIN_W, Math.round(startW + sign * (e.clientX - startX)));
      setWidths((w) => ({ ...w, [key]: latest }));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setWidths((w) => { const next = { ...w, [key]: latest }; persist(next); return next; });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [widths, columns, persist]);

  const reset = useCallback(() => {
    setWidths(defaults());
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
  }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { template, startResize, reset };
}

// A thin drag handle pinned to a header cell's trailing edge. The parent header
// cell must be `position: relative`. Stops propagation so dragging never fires
// the column's sort click.
export function ColResizer({ onResize }) {
  return (
    <span
      onPointerDown={onResize}
      onClick={(e) => e.stopPropagation()}
      role="separator" aria-orientation="vertical" aria-label="Resize column"
      className="absolute top-0 bottom-0 flex items-center justify-center cursor-col-resize group"
      style={{ insetInlineEnd: -4, width: 9, zIndex: 5, touchAction: 'none' }}
    >
      <span className="h-3.5 w-px transition-colors group-hover:w-0.5" style={{ background: COL.borderStrong }} />
    </span>
  );
}
