// ============================================================
// NoModelUi — small, restrained presentational atoms shared by the Model page
// and the Elements Registry empty state. Product-grade, not decorative: every
// piece explains utility (what unlocks, how data flows, what data will look
// like) using the app's existing tokens. No marketing illustration.
// ============================================================
import { Check, ChevronRight } from 'lucide-react';
import { COL } from '../lib/theme.js';

// "What this unlocks" — a calm checklist of chips. Explanatory, not actionable.
export function UnlocksRow({ title = 'What this unlocks', items }) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: COL.textDim }}>{title}</div>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <span key={it} className="inline-flex items-center gap-1.5 ps-2 pe-2.5 py-1 rounded-full text-[11.5px]"
            style={{ background: COL.surface, border: `1px solid ${COL.border}`, color: COL.textDim }}>
            <Check size={12} className="flex-shrink-0" style={{ color: '#15803d' }} />{it}
          </span>
        ))}
      </div>
    </div>
  );
}

// The downstream chain (IFC import → Elements Registry → BoQ links → WIR/QC).
// Chevrons mirror in RTL so the flow reads in the right direction.
export function FlowStrip({ steps, lang }) {
  const flip = lang === 'ar';
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
      {steps.map((s, i) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className="mono text-[11px] px-2 py-1 rounded-md" style={{ background: COL.surfaceAlt, color: COL.textDim }}>{s}</span>
          {i < steps.length - 1 && <ChevronRight size={13} className="flex-shrink-0" style={{ color: COL.textMute, transform: flip ? 'scaleX(-1)' : undefined }} />}
        </span>
      ))}
    </div>
  );
}

// A faded, non-interactive preview of the registry grid so the empty area reads
// as "future data area," not a broken screen. Purely illustrative (aria-hidden).
const PREVIEW_ROWS = [
  ['Wall — exterior', 'L01', '— m³'],
  ['Slab — ground', 'L00', '— m²'],
  ['Beam — primary', 'L02', '— m'],
];
export function ElementsPreview({ caption = 'Elements will appear here after IFC import' }) {
  return (
    <div className="rounded-xl border overflow-hidden select-none" style={{ borderColor: COL.border, background: COL.surface }} aria-hidden="true">
      <div className="mono grid text-[9.5px] uppercase tracking-wider px-3 py-1.5" style={{ gridTemplateColumns: '1fr 64px 64px', background: COL.surfaceAlt, color: COL.textMute }}>
        <span>Element</span><span>Level</span><span>Qty</span>
      </div>
      {PREVIEW_ROWS.map((r, i) => (
        <div key={r[0]} className="grid items-center px-3 py-2 text-[11.5px]" style={{ gridTemplateColumns: '1fr 64px 64px', borderTop: `1px solid ${COL.border}`, color: COL.textMute, opacity: 0.5 }}>
          <span className="truncate" style={{ color: COL.textDim }}>{r[0]}</span>
          <span className="mono">{r[1]}</span>
          <span className="mono">{r[2]}</span>
        </div>
      ))}
      <div className="px-3 py-2 text-[10.5px] text-center" style={{ color: COL.textMute, borderTop: `1px dashed ${COL.borderStrong}`, background: COL.bg }}>{caption}</div>
    </div>
  );
}
