// ============================================================
// SimilarSelect — "select similar" review UI. Given the active element, it ranks
// other elements by shared attributes (src/lib/similarElements.js) and lets the
// user accept all, accept some (checkboxes, default-checked for high/medium
// confidence), or dismiss. It never auto-links and never overwrites the
// selection — accepting EXTENDS it via onAdd(). Ranking is pure/synchronous and
// wrapped, so a failure degrades to "no suggestions" rather than crashing.
// ============================================================
import { useMemo, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { COL } from '../../lib/theme.js';
import { suggestSimilar } from '../../lib/similarElements.js';

const CONF_COLOR = { high: '#16a34a', medium: '#1d4ed8', low: '#a1a1a6' };

export function SimilarSelect({ target, elements = [], picked = new Set(), onAdd, onClose }) {
  const matches = useMemo(() => {
    try { return suggestSimilar(target, elements, picked).matches; } catch { return []; }
  }, [target, elements, picked]);
  // Default to checking the confident ones (high + medium).
  const [chosen, setChosen] = useState(() => new Set(matches.filter((m) => m.confidence !== 'low').map((m) => m.guid)));
  const toggle = (g) => setChosen((s) => { const n = new Set(s); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const setAll = (on) => setChosen(on ? new Set(matches.map((m) => m.guid)) : new Set());

  return (
    <div className="flex-1 overflow-y-auto scrollbar p-3 text-xs">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={13} style={{ color: COL.accent }} />
        <span className="font-semibold truncate" style={{ color: COL.text }}>Similar to {target?.name || 'selection'}</span>
        <button onClick={onClose} className="ms-auto p-0.5 rounded hover:bg-stone-100" style={{ color: COL.textMute }}><X size={14} /></button>
      </div>

      {matches.length === 0 ? (
        <div className="text-[11px]" style={{ color: COL.textMute }}>No similar elements found — nothing else shares this element's type, level, package, material or zone.</div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px]" style={{ color: COL.textDim }}>{matches.length} candidate{matches.length > 1 ? 's' : ''} · {chosen.size} to add</span>
            <button onClick={() => setAll(true)} className="ms-auto text-[10px] font-semibold" style={{ color: COL.accent }}>All</button>
            <button onClick={() => setAll(false)} className="text-[10px] font-semibold" style={{ color: COL.textDim }}>None</button>
          </div>
          <div className="space-y-1 mb-3">
            {matches.map((m) => (
              <label key={m.guid} className="flex items-start gap-2 rounded border px-2 py-1.5 cursor-pointer" style={{ borderColor: COL.border, background: chosen.has(m.guid) ? COL.accentBg : COL.surface }}>
                <input type="checkbox" checked={chosen.has(m.guid)} onChange={() => toggle(m.guid)} className="mt-0.5 w-3.5 h-3.5 accent-blue-700 flex-shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-medium truncate" style={{ color: COL.text }}>{m.element.name || m.guid}</span>
                  <span className="block text-[9.5px] truncate" style={{ color: COL.textDim }}>{m.reasons.join(' · ')}</span>
                </span>
                <span className="text-[8.5px] uppercase font-semibold flex-shrink-0 mt-0.5" style={{ color: CONF_COLOR[m.confidence] }}>{m.confidence}</span>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { onAdd([...chosen]); onClose(); }} disabled={chosen.size === 0} className="px-2.5 py-1 rounded text-[11px] font-semibold disabled:opacity-40" style={{ background: COL.accent, color: '#fff' }}>Add {chosen.size} to selection</button>
            <button onClick={onClose} className="px-2.5 py-1 rounded border text-[11px] font-medium" style={{ borderColor: COL.borderStrong, color: COL.text }}>Dismiss</button>
          </div>
        </>
      )}
    </div>
  );
}
