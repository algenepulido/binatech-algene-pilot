// ============================================================
// brand — the single authoritative BinaTech brand-token layer.
//
// SOURCE OF TRUTH: the Claude-designed brand assets in /assets
// ("BinaTech Brand Guidelines.html", "BinaTech Logo System.pdf"). The core
// palette below is lifted verbatim from the guidelines' most-used colours.
//
// This module centralizes the brand so marketing (src/site/ui.jsx) and the
// signed-in app (src/lib/theme.js) can reference ONE set of constants instead
// of each re-declaring hexes. It is additive: importing these tokens changes
// nothing on its own — surfaces opt in.
//
// TYPOGRAPHY NOTE: the brand display face is Söhne (Klim Type Foundry). Those
// are TEST fonts — their licence (§1b) forbids customer-facing/commercial use
// and (§1c) forbids distribution — so the font files are NEVER committed here.
// Production uses the guidelines' own fallback stack: Familjen Grotesk
// (display) + IBM Plex Sans / Mono / Sans Arabic (body/mono/RTL).
// ============================================================

// ── Core palette (Brand Guidelines v1.0, 07/2026) ──
export const BRAND = {
  paper: '#FAFAF7',       // Paper — the ground / page background
  white: '#FFFFFF',       // card surface
  mist: '#EFF2F0',        // Mist — panel / raised neutral surface
  line: '#DCE2E0',        // Line — hairline border / divider
  lineStrong: '#B9C1BF',  // stronger divider
  ink: '#16211F',         // Ink — primary text / dark ground
  inkAlt: '#1D2A27',      // ink alt (dark section)
  slate: '#43544F',       // deep steel (secondary-strong text)
  steel: '#7C8C89',       // Steel — metadata / tertiary text
  certified: '#1C6B52',   // Certified Green — CERTIFIED STATUS ONLY (never chrome)
  certifiedHi: '#247A5F', // certified hover/emphasis
  danger: '#B3261E',      // rejected / destructive
};

// ── Semantic status tokens ──
// The workflow states the app talks about, each with a foreground (fg), a soft
// background (soft), and a role note. Green is reserved for CERTIFIED only —
// generic "success/approved" uses ink/steel neutrals so the certified moment
// stays special (brand rule: green = certified-semantic only).
export const STATUS = {
  certified: { fg: '#1C6B52', soft: 'rgba(28,107,82,0.10)', label: 'Certified / proof' },
  warning:   { fg: '#B45309', soft: 'rgba(180,83,9,0.10)',  label: 'Warning / blocked' },
  danger:    { fg: '#B3261E', soft: 'rgba(179,38,30,0.10)', label: 'Danger / rejected' },
  info:      { fg: '#1D4ED8', soft: 'rgba(29,78,216,0.10)', label: 'Info / review' },
  neutral:   { fg: '#7C8C89', soft: 'rgba(124,140,137,0.12)', label: 'Neutral / draft' },
  pending:   { fg: '#B45309', soft: 'rgba(180,83,9,0.10)',  label: 'Pending' },
};

// ── Semantic aliases used across surfaces (border / surface / text) ──
export const SEMANTIC = {
  paper: BRAND.paper,          // background
  surface: BRAND.white,        // card
  surfaceAlt: BRAND.mist,      // raised panel
  border: BRAND.line,          // divider
  borderStrong: BRAND.lineStrong,
  ink: BRAND.ink,              // primary text
  steel: BRAND.steel,          // secondary text
  slate: BRAND.slate,          // secondary-strong text
  certified: BRAND.certified,  // certified/proof green
  danger: BRAND.danger,        // rejected
};

// ── Typography stacks (production stand-ins for Söhne; no test fonts shipped) ──
export const FONTS = {
  display: "'Familjen Grotesk', 'IBM Plex Sans', system-ui, sans-serif",
  body: "'IBM Plex Sans', system-ui, -apple-system, sans-serif",
  mono: "'IBM Plex Mono', 'JetBrains Mono', monospace",
  arabic: "'IBM Plex Sans Arabic', 'Cairo', sans-serif",
};

// ── Logo constants (mark 2C "the chain" — see Logo.jsx / favicon.svg) ──
export const LOGO = {
  tile: BRAND.ink,             // rounded ink tile
  dot: BRAND.paper,            // work dots
  dotCertified: BRAND.certified, // final dot = Certified Green
};
