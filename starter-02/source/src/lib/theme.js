// Refined, Apple-grade neutral palette: clean cool greys, near-black text,
// one restrained blue accent. (Token-only change — propagates everywhere.)
// The `ink*` block is the app CHROME (header/sidebar/status bar) — matching
// the marketing site's ledger-noir brand: blue = evidence, gold = certified
// money. Content surfaces stay light for data legibility.
//
// The signed-in app deliberately keeps this porcelain/blue/gold direction (an
// owner-reviewed decision — the frame reads as a fintech data surface). The
// `brand*` slots below expose the central brand palette (src/lib/brand.js) so
// certification-semantic surfaces can carry the true Certified Green and Ink
// WITHOUT recolouring existing chrome. A full converge-to-brand app re-skin is
// a separate, owner-approved pass (see docs/brand-assets-integration-report.md).
import { BRAND } from './brand.js';

export const COL = {
  bg: '#f5f5f7', surface: '#ffffff', surfaceAlt: '#f0f0f3', border: '#e4e4ea', borderStrong: '#d2d2d7',
  text: '#1d1d1f', textDim: '#6e6e73', textMute: '#a1a1a6', accent: '#1d4ed8', accentBg: '#e7edff',
  // Porcelain chrome (Revolut direction, per review): the frame is LIGHT —
  // white sidebar/header on soft gray content. Saturation is rationed: blue =
  // evidence, deep gold = certified money, and exactly ONE saturated surface
  // exists (the feat* gradient) for the money heroes.
  ink: '#ffffff', inkAlt: '#f6f7f9',
  inkBorder: '#e7e8ee', inkBorderHi: '#d3d5de',
  inkText: '#16181d', inkDim: '#5d6470', inkMute: '#9aa0ab',
  blueHi: '#2563eb', blueSoft: 'rgba(37,99,235,0.10)',
  gold: '#b45309', goldSoft: 'rgba(180,83,9,0.10)',
  // the single saturated surface — feature gradient + its on-gradient accents
  featA: '#1e40af', featB: '#312e81', featGold: '#fbbf24',
  // ── Brand tokens (central source of truth) — additive; opt-in per surface.
  certified: BRAND.certified, certifiedSoft: 'rgba(28,107,82,0.10)',
  brandInk: BRAND.ink, brandPaper: BRAND.paper, brandSteel: BRAND.steel,
  brandLine: BRAND.line, brandDanger: BRAND.danger,
};

