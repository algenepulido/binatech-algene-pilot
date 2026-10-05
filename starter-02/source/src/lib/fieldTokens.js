// ============================================================
// FIELD — the phone-only token set from the approved Field Mode Target design
// (claude.ai/design project c65646ff, "Field Mode Target.dc.html").
//
// Deliberately SEPARATE from COL in theme.js. COL is the desktop/app chrome and
// a full converge-to-brand re-skin is its own owner-approved pass; these tokens
// are consumed only by the phone field surfaces, so desktop cannot regress.
//
// The design's own rules that these encode:
//   · three fill surfaces and one hairline replace every border
//   · no cards inside cards — `surface` never nests inside `surface`
//   · no state depends on hue: `fail` and `blocked` are the only two semantic
//     hues, and both are always paired with shape or text
// ============================================================
export const FIELD = {
  // surfaces — page sits *under* the one raised fill, never the other way round
  page: '#F5F5F7',
  surface: '#FAFAF7',
  camera: '#0E1614',

  // ink
  ink: '#16211F',
  inkSoft: '#2C3A38',
  dim: '#4A555C',
  mute: '#5A6670',
  faint: '#7A848C',
  onDark: '#FAFAF7',

  // the only two semantic hues in the design; §14/08 records that the exact
  // values are proposed, not ratified.
  fail: '#8C2F26',
  blocked: '#7A5410',
  certified: '#1C6B52',

  // one structural hairline, one in-surface divider
  hair: 'rgba(22,33,31,.09)',
  rule: 'rgba(22,33,31,.07)',

  // geometry. The design draws 14px surfaces and a 10-12px control radius;
  // The owner's standing control rule is 6-8px, so CONTROLS clamp to 8 and only
  // non-interactive surfaces keep the design's 14.
  rSurface: 14,
  rControl: 8,

  // touch floor, and the raised floor for primary field actions
  tap: 44,
  tapPrimary: 48,
};

/** Mono is reserved for identifiers — WIR numbers, gridlines, timestamps. */
export const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
