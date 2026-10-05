// ============================================================
// Field Mode Target — conformance to the approved design
// (claude.ai/design project c65646ff · "Field Mode Target.dc.html").
//
// The design classifies its own capabilities in §13. Anything marked Planned
// is NOT asserted here as a shipped surface: the design's own rule is that a
// production build omits Drafts, the sync foot line, readiness verdicts and
// project switching until the services behind them return real data. These
// tests encode the shippable target, not the whole board.
// ============================================================
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { MobileNav } from '../../components/MobileNav.jsx';
import { T } from '../../i18n/translations.js';

afterEach(() => cleanup());

const navButtons = () => [...document.querySelectorAll('nav button')];
const labels = () => navButtons().map((b) => b.textContent.trim());
const radiusOf = (el) => parseFloat(getComputedStyle(el).borderRadius) || 0;

describe('MobileNav — Variant A recommendation, Find in the fifth slot', () => {
  const mount = (t = T.en, extra = {}) => render(
    <MobileNav t={t} route="quick" onNavigate={() => {}} onMenu={() => {}} onCapture={() => {}} counts={{}} {...extra} />,
  );

  it('(N1) the five destinations are Home · Work · Capture · Find · More, in that order', () => {
    mount();
    expect(labels()).toEqual(['Home', 'Work', 'Capture', 'Find', 'More']);
  });

  it('(N2) Work is promoted above Capture; Find holds the slot Drafts will take', () => {
    mount();
    const l = labels();
    expect(l.indexOf('Work')).toBeLessThan(l.indexOf('Capture'));
    expect(l.indexOf('Find')).toBeGreaterThan(l.indexOf('Capture'));
    // Drafts depends on local draft measurements + sync, both Planned in §13.
    expect(screen.queryByText('Drafts')).toBeNull();
  });

  it('(N3) Find reaches the existing find-a-record surface', () => {
    const onNavigate = vi.fn();
    mount(T.en, { onNavigate });
    fireEvent.click(screen.getByText('Find'));
    expect(onNavigate).toHaveBeenCalledWith('scan');
  });

  it('(N4) Capture stays an inline filled mark: rectangular, >=48px, never raised', () => {
    mount();
    const cap = screen.getByRole('button', { name: /capture/i });
    const s = getComputedStyle(cap);
    expect(parseFloat(s.minHeight || s.height || '0')).toBeGreaterThanOrEqual(48);
    expect(parseFloat(s.minWidth || s.width || '0')).toBeGreaterThanOrEqual(48);
    expect(parseFloat(s.marginTop || '0')).toBeGreaterThanOrEqual(0);   // no orb
    const mark = cap.querySelector('[data-capture-mark]');
    expect(mark, 'the filled mark exists').toBeTruthy();
    expect(radiusOf(mark)).toBeLessThanOrEqual(8);                       // 6-8px control rule
  });

  it('(N4b) More is a destination now — frame L is a screen, not a drawer', () => {
    const onNavigate = vi.fn(); const onMenu = vi.fn();
    mount(T.en, { onNavigate, onMenu });
    fireEvent.click(screen.getByText('More'));
    expect(onNavigate).toHaveBeenCalledWith('more');
    expect(onMenu, 'the drawer is reached from inside frame L, not from the bar').not.toHaveBeenCalled();
  });

  it('(N5) every destination is a >=44px target and none is a pill', () => {
    mount();
    for (const b of navButtons()) {
      const s = getComputedStyle(b);
      expect(parseFloat(s.minHeight || s.height || '0'), b.textContent).toBeGreaterThanOrEqual(44);
      expect(radiusOf(b), b.textContent).toBeLessThanOrEqual(8);
    }
  });

  it('(N6) the bar translates, including the new Find destination', () => {
    mount(T.ar);
    expect(screen.getByText('الرئيسية')).toBeTruthy();
    expect(screen.getByText('الأعمال')).toBeTruthy();
    expect(screen.getByText('المزيد')).toBeTruthy();
    expect(screen.getByText(T.ar.mNavFind)).toBeTruthy();
    expect(T.ar.mNavFind, 'Arabic Find is dictionary-backed, not English').not.toMatch(/[A-Za-z]/);
  });
});
