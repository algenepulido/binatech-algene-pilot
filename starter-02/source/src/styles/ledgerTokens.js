// ============================================================
// SC — JS handles for the Certification Ledger CSS custom properties
// (src/styles/certification-ledger.css). For React inline styles, which
// can't use Tailwind classes and shouldn't re-hardcode hex.
//
// RULES
// - Values are var(--sc-*) references ONLY. Never add a hex literal here —
//   the CSS file is the single source of truth; this map is ergonomics.
// - SC.certified is the CERTIFIED/PAID semantic only (green rule): never a
//   primary, hover, or decoration.
// - Migrated screens import SC and drop their COL (src/lib/theme.js) usage;
//   unmigrated screens keep COL until their own migration pass.
// ============================================================
export const SC = {
  // surfaces
  bg: 'var(--sc-bg)',
  surface: 'var(--sc-surface)',
  surface2: 'var(--sc-surface-2)',
  surface3: 'var(--sc-surface-3)',
  raised: 'var(--sc-raised)',
  tintGreen: 'var(--sc-tint-green)',
  // ink ramp
  ink: 'var(--sc-ink)',
  ink2: 'var(--sc-ink-2)',
  muted: 'var(--sc-muted)',
  faint: 'var(--sc-faint)',
  onDark: 'var(--sc-on-dark)',
  // hairlines
  line: 'var(--sc-line)',
  line2: 'var(--sc-line-2)',
  lineStrong: 'var(--sc-line-strong)',
  // status semantics
  certified: 'var(--sc-certified)',
  certifiedBg: 'var(--sc-certified-bg)',
  certifiedBd: 'var(--sc-certified-bd)',
  action: 'var(--sc-action)',
  actionHover: 'var(--sc-action-hover)',
  actionBg: 'var(--sc-action-bg)',
  actionBd: 'var(--sc-action-bd)',
  warning: 'var(--sc-warning)',
  warningBg: 'var(--sc-warning-bg)',
  danger: 'var(--sc-danger)',
  dangerBg: 'var(--sc-danger-bg)',
  dangerBd: 'var(--sc-danger-bd)',
};
