import { describe, it, expect } from 'vitest';
import { COL } from './theme.js';

// WCAG relative-luminance contrast. The chrome is PORCELAIN (light) — these
// tests guarantee its text/accents stay readable, and that the single
// saturated surface (the feat* gradient) keeps readable on-gradient accents.
function lum(hex) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

describe('porcelain chrome tokens', () => {
  it('defines the full chrome set including the feature gradient', () => {
    for (const k of ['ink', 'inkAlt', 'inkBorder', 'inkBorderHi', 'inkText', 'inkDim', 'inkMute', 'blueHi', 'blueSoft', 'gold', 'goldSoft', 'featA', 'featB', 'featGold']) {
      expect(COL[k], `COL.${k} missing`).toBeTruthy();
    }
  });

  it('chrome text meets WCAG AA on both chrome surfaces (≥ 4.5:1)', () => {
    expect(contrast(COL.inkText, COL.ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(COL.inkText, COL.inkAlt)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(COL.inkDim, COL.ink)).toBeGreaterThanOrEqual(4.5);
  });

  it('accents are readable on the light chrome (≥ 3:1)', () => {
    expect(contrast(COL.blueHi, COL.ink)).toBeGreaterThanOrEqual(3);
    expect(contrast(COL.gold, COL.ink)).toBeGreaterThanOrEqual(3);
  });

  it('gold badges carry white text legibly (≥ 3:1 on deep gold)', () => {
    expect(contrast('#ffffff', COL.gold)).toBeGreaterThanOrEqual(3);
  });

  it('the feature gradient keeps white text and gold accent readable (≥ 4.5 / ≥ 3)', () => {
    expect(contrast('#ffffff', COL.featA)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', COL.featB)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(COL.featGold, COL.featB)).toBeGreaterThanOrEqual(3);
  });

  it('light content tokens are untouched (data surfaces contract)', () => {
    expect(COL.bg).toBe('#f5f5f7');
    expect(COL.surface).toBe('#ffffff');
    expect(COL.text).toBe('#1d1d1f');
    expect(COL.accent).toBe('#1d4ed8');
  });
});
