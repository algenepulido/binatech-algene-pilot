// ============================================================
// Mobile Field Mode — target control language.
//
// Source of truth: the approved Claude Design project "Field Mode Target"
// (c65646ff-263a-4757-8ebc-e35171476da9). Two of its decisions are load-bearing
// here and are asserted as USER-VISIBLE geometry, never as source strings:
//
//   1. No pill or orb CTAs. The target uses zero 9999px/50% radii anywhere;
//      circles are reserved for semantically circular marks (status dots,
//      avatars, badges). Capture specifically is "an inline filled mark and a
//      wider cell. Neither uses a floating orb."
//   2. Field touch targets: 44px minimum, 48px for primary field actions.
//
// Plus the released sign-in defect: inputs below 16px trigger iOS Safari focus
// zoom, and a submit disabled until valid makes the form's own validation
// message unreachable.
// ============================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Btn } from './primitives.jsx';
import { MobileNav } from './MobileNav.jsx';

afterEach(() => cleanup());

const radiusOf = (el) => {
  const r = getComputedStyle(el).borderRadius || '';
  const first = r.split(' ')[0].trim();
  if (first.endsWith('%')) return Number.POSITIVE_INFINITY;      // 50% == a circle
  const n = parseFloat(first);
  return Number.isFinite(n) ? n : 0;
};
/** A pill/orb by effect: radius at or beyond half the smaller side. */
const isPillOrOrb = (el, w, h) => radiusOf(el) >= Math.min(w, h) / 2;

describe('CTA control language — no pills, no orbs', () => {
  it('(1) a primary Btn is a rectangle with a restrained radius, not a pill', () => {
    render(<Btn variant="primary" onClick={() => {}}>New project</Btn>);
    const btn = screen.getByRole('button', { name: 'New project' });
    const r = radiusOf(btn);
    expect(r).toBeGreaterThan(0);                 // not a hard square either
    expect(r).toBeLessThanOrEqual(16);            // the target's own ceiling
    expect(r).not.toBe(Number.POSITIVE_INFINITY);
  });

  it('(2) every Btn variant keeps the same rectangular language', () => {
    for (const v of ['primary', 'secondary', 'ghost', 'danger']) {
      cleanup();
      render(<Btn variant={v} onClick={() => {}}>Action</Btn>);
      const btn = screen.getByRole('button', { name: 'Action' });
      expect(radiusOf(btn), v).toBeLessThanOrEqual(16);
    }
  });

  it('(3) a Btn meets the 44px minimum touch target, and 48px at md', () => {
    render(<Btn variant="primary" size="md" onClick={() => {}}>Raise a WIR</Btn>);
    const btn = screen.getByRole('button', { name: 'Raise a WIR' });
    expect(parseFloat(getComputedStyle(btn).minHeight)).toBeGreaterThanOrEqual(48);
    cleanup();
    render(<Btn variant="secondary" onClick={() => {}}>Cancel</Btn>);
    const sm = screen.getByRole('button', { name: 'Cancel' });
    expect(parseFloat(getComputedStyle(sm).minHeight)).toBeGreaterThanOrEqual(44);
  });
});

describe('MobileNav Capture — inline mark in a wider cell, not a floating orb', () => {
  const nav = (props = {}) => render(
    <MobileNav route="quick" onNavigate={() => {}} onMenu={() => {}} onCapture={() => {}} {...props} />,
  );

  it('(4) Capture is not a circle', () => {
    nav();
    const cap = screen.getByRole('button', { name: /capture/i });
    const w = parseFloat(getComputedStyle(cap).width) || 0;
    const h = parseFloat(getComputedStyle(cap).height) || 0;
    expect(isPillOrOrb(cap, w || 56, h || 56)).toBe(false);
    expect(radiusOf(cap)).toBeLessThanOrEqual(16);
  });

  it('(5) Capture is at least a 48px primary field target', () => {
    nav();
    const cap = screen.getByRole('button', { name: /capture/i });
    const s = getComputedStyle(cap);
    expect(parseFloat(s.minHeight || s.height)).toBeGreaterThanOrEqual(48);
    expect(parseFloat(s.minWidth || s.width)).toBeGreaterThanOrEqual(48);
  });

  it('(6) Capture does not float above the bar', () => {
    nav();
    const cap = screen.getByRole('button', { name: /capture/i });
    const mt = parseFloat(getComputedStyle(cap).marginTop || '0');
    expect(mt).toBeGreaterThanOrEqual(0);          // negative margin == raised orb
  });

  it('(7) Capture still opens the capture sheet — behaviour is unchanged', () => {
    const onCapture = vi.fn();
    nav({ onCapture });
    fireEvent.click(screen.getByRole('button', { name: /capture/i }));
    expect(onCapture).toHaveBeenCalledTimes(1);
  });

  it('(8) every nav destination meets the 44px minimum', () => {
    nav();
    for (const b of screen.getAllByRole('button')) {
      const s = getComputedStyle(b);
      expect(parseFloat(s.minHeight || s.height || '0'), b.textContent || 'nav').toBeGreaterThanOrEqual(44);
    }
  });
});
