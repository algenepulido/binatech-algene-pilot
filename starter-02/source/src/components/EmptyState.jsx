// ============================================================
// EmptyState — a reusable, professional empty-state for module pages.
// Two modes:
//   onboarding — the page has no data yet: explain what it's for + the first
//                steps to populate it, with real action button(s).
//   all-clear  — the page is an action queue that's been cleared: a calm
//                success message (NO beginner steps / nagging).
// Brand-token styled, RTL-safe (logical props), centered, mobile-friendly.
// ============================================================
import { CheckCircle2 } from 'lucide-react';
import { Btn } from './primitives.jsx';
import { COL } from '../lib/theme.js';

export function EmptyState({ icon: Icon, title, description, steps = [], actions = [], note, mode = 'onboarding' }) {
  const allClear = mode === 'all-clear';
  const TileIcon = Icon || (allClear ? CheckCircle2 : null);
  return (
    <div className="w-full px-6 py-14 text-center">
      <div className="mx-auto" style={{ maxWidth: 460 }}>
        {TileIcon && (
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: allClear ? COL.certifiedSoft : COL.accentBg }}>
            <TileIcon size={26} style={{ color: allClear ? COL.certified : COL.accent }} />
          </div>
        )}
        <div className="display text-base font-bold mb-1.5" style={{ color: COL.text }}>{title}</div>
        {description && <div className="text-[13px] leading-relaxed" style={{ color: COL.textDim }}>{description}</div>}

        {!allClear && steps.length > 0 && (
          <ol className="text-start inline-block mt-4 space-y-1.5">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-[12.5px]" style={{ color: COL.textDim }}>
                <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-0.5" style={{ background: COL.accentBg, color: COL.accent }}>{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        )}

        {note && <div className="text-[11.5px] mt-3" style={{ color: COL.textMute }}>{note}</div>}

        {actions.length > 0 && (
          <div className="flex items-center justify-center gap-2 flex-wrap mt-5">
            {actions.map((a, i) => (
              <Btn key={i} icon={a.icon} variant={a.variant || (i === 0 ? 'primary' : 'secondary')} onClick={a.onClick}>{a.label}</Btn>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
