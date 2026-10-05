// ============================================================
// The two structural primitives of the Field Mode Target design.
//
// The board's rule, stated in "Before and after": three fill-only surfaces and
// one hairline replace every border, and there are no cards inside cards
// anywhere in the design. Keeping both in one place is what makes that
// checkable — every field screen composes from these rather than restyling a
// div and drifting.
// ============================================================
import { FIELD } from '../../lib/fieldTokens.js';

/** One raised fill. Never render a Surface inside another Surface. */
export function Surface({ children, style, ...rest }) {
  return (
    <div data-field-surface {...rest}
      style={{ background: FIELD.surface, borderRadius: FIELD.rSurface, border: 0, overflow: 'hidden', flex: 'none', ...style }}>
      {children}
    </div>
  );
}

/** The in-surface divider — inset hairline, never a full-width border. */
export function Rule({ inset = 17 }) {
  return <div style={{ height: 1, background: FIELD.rule, marginInlineStart: inset }} />;
}

/** Mono eyebrow: the group label above a surface. */
export function Eyebrow({ children, tone, style }) {
  return (
    <div style={{
      fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 10.5, fontWeight: 600, letterSpacing: '.11em', textTransform: 'uppercase',
      color: tone || FIELD.mute, marginBottom: 10, ...style,
    }}>{children}</div>
  );
}
