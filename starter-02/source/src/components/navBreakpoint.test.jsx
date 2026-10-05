// ============================================================
// Issue #208 — phone-only bottom navigation must end where the phone does,
// and the tablet FieldRail must end where the desktop shell begins.
//
// Locked device contract (owner, 2026-09-10):
//   0–767px    phone   — MobileNav present; FieldRail absent
//   768–1023px tablet  — FieldRail present (Capture reachable); MobileNav absent;
//                        desktop sidebar/status bar/analyst absent
//   1024px+    desktop — desktop sidebar + status bar + analyst present;
//                        FieldRail and MobileNav absent
//
// The app's phone boundary is useIsMobile() = (max-width:767px). The bottom
// bar (MobileNav) must be PRESENT below 768px and ABSENT at 768px and above —
// in the DOM, not merely CSS-hidden — because a mounted-but-hidden second nav
// is duplicated navigation for anything that does not apply the stylesheet
// (tests, harness pages, assistive tooling) and its own CSS boundary must
// agree with the JS boundary rather than sit 256px away from it. The tablet
// boundary must agree with Tailwind's `lg:` (>=1024) so JS and CSS never
// disagree at exactly 1024px.
//
// Widths are driven through a numeric matchMedia stub, so each cell of the
// matrix is a stable DOM invariant rather than a screenshot.
// ============================================================
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const state = vi.hoisted(() => ({
  width: 390,
  user: { email: 'fahad@example.com', user_metadata: { full_name: 'Fahad Al-Mutairi' } },
}));

vi.mock('../lib/auth.jsx', () => ({ useAuth: () => ({ user: state.user, openAuth: vi.fn(), signOut: vi.fn() }) }));
vi.mock('../lib/project.jsx', () => ({
  useProject: () => ({ project: { id: 'project-1', code: 'CLP-001', name: 'Coastal Logistics Park', nameAr: 'مجمع الخدمات اللوجستية الساحلي' } }),
}));
vi.mock('../lib/stats.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    loadCounts: vi.fn().mockResolvedValue(original.EMPTY_COUNTS),
    loadFinance: vi.fn().mockResolvedValue({ total: 0, approvedValue: 0, pendingValue: 0, blockedValue: 0, certifiedIpc: 0 }),
  };
});
vi.mock('../api/access.js', () => ({ getMyRole: vi.fn().mockResolvedValue('site_eng') }));

import AppShell from '../AppShell.jsx';
import { T } from '../i18n/translations.js';

/** A width-aware matchMedia: evaluates (max-width:N) / (min-width:N) against state.width. */
const mediaAt = (query) => {
  const max = /max-width:\s*(\d+)px/.exec(query);
  const min = /min-width:\s*(\d+)px/.exec(query);
  const matches = (max ? state.width <= Number(max[1]) : true) && (min ? state.width >= Number(min[1]) : true) && Boolean(max || min);
  return { matches, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() };
};

beforeEach(() => {
  window.matchMedia = vi.fn(mediaAt);
  window.location.hash = '#/app/more';   // MoreView renders at every width: a stable wait target
});
afterEach(() => cleanup());

const phoneNav = () => [...document.querySelectorAll('nav')].filter((n) => !n.hasAttribute('data-field-rail'));
const fieldRail = () => document.querySelector('nav[data-field-rail]');
// Desktop-only surfaces: the sidebar <aside>, the <footer> status bar and the analyst launcher.
const desktopSidebars = () => document.querySelectorAll('aside');
const statusBar = () => document.querySelector('footer');
const analyst = () => screen.queryByRole('button', { name: /Open Analyst|فتح المحلّل/ });
const px = (v) => Number.parseFloat(v) || 0;

async function mountAt(width, lang = 'en') {
  state.width = width;
  const utils = render(<AppShell />);
  await waitFor(() => expect(screen.getByRole('heading', { name: T.en.fmAllTasks || 'All tasks' })).toBeTruthy());
  if (lang === 'ar') {
    fireEvent.click(screen.getByRole('button', { name: /Switch language to Arabic|العربية/ }));
    await waitFor(() => expect(utils.container.firstElementChild.getAttribute('dir')).toBe('rtl'));
  }
  return utils;
}

const PHONE = [320, 375, 390, 430, 767];
const TABLET = [768, 1023];
const DESKTOP = [1024, 1280];
const NOT_PHONE = [...TABLET, ...DESKTOP];
const LANGS = ['en', 'ar'];

describe('#208 — phone bottom navigation boundary (present <768, absent >=768)', () => {
  describe.each(LANGS)('%s', (lang) => {
    it.each(PHONE)('%ipx: exactly one phone nav with all five destinations, in the flow, not obscuring content', async (width) => {
      const { container } = await mountAt(width, lang);
      const navs = phoneNav();
      expect(navs).toHaveLength(1);
      expect(fieldRail()).toBeNull();                                     // never both rails at once
      const nav = navs[0];
      const t = T[lang];
      for (const name of [t.mNavHome, t.mNavWork, t.mNavCapture, t.mNavFind, t.mNavMore]) {
        expect(within(nav).getByRole('button', { name }), `${lang} ${name}`).toBeTruthy();
      }
      // in the column flow, never overlaying content (jsdom applies no stylesheet,
      // so the invariant is the class/inline contract, not a computed position)
      expect(nav.className).toMatch(/\brelative\b/);
      expect(nav.className).not.toMatch(/\b(fixed|absolute|sticky)\b/);
      expect(['', 'static', 'relative']).toContain(nav.style.position);
      expect(nav.className).toMatch(/\bflex-shrink-0\b/);
      // the only fixed minimum in the bar is the wider Capture cell; five flex-1 cells fit 320
      const captureCell = nav.querySelector('[data-capture-mark]').closest('div');
      expect(px(getComputedStyle(captureCell).minWidth)).toBeLessThanOrEqual(76);
      // the shell owns overflow, so nothing can widen the document
      const content = container.querySelector('[data-app-content]');
      expect(content.style.overflow).toBe('hidden');
      expect(container.firstElementChild.getAttribute('dir')).toBe(lang === 'ar' ? 'rtl' : 'ltr');
    });

    it.each(NOT_PHONE)('%ipx: no phone nav in the DOM (not merely hidden)', async (width) => {
      await mountAt(width, lang);
      expect(phoneNav()).toHaveLength(0);
    });

    it.each(TABLET)('%ipx: tablet — Capture stays reachable through the single FieldRail; no desktop shell', async (width) => {
      await mountAt(width, lang);
      const rail = fieldRail();
      expect(rail).toBeTruthy();
      expect(document.querySelectorAll('nav[data-field-rail]')).toHaveLength(1);
      const capture = within(rail).getByRole('button', { name: T[lang].mNavCapture });
      expect(capture.disabled).toBe(false);                                // site_eng may edit WIRs
      expect(phoneNav()).toHaveLength(0);                                  // one navigation owner
      expect(desktopSidebars()).toHaveLength(0);                           // desktop sidebar not mounted
      expect(statusBar()).toBeNull();                                      // desktop-only surfaces suppressed
      expect(analyst()).toBeNull();
    });

    it.each(DESKTOP)('%ipx: desktop — single sidebar, status bar and analyst present; no field rail or phone bar', async (width) => {
      await mountAt(width, lang);
      expect(fieldRail()).toBeNull();
      expect(phoneNav()).toHaveLength(0);
      expect(desktopSidebars()).toHaveLength(1);                           // one navigation owner
      expect(statusBar()).toBeTruthy();                                    // desktop-only surfaces not suppressed
      expect(analyst()).toBeTruthy();
    });

    it('1023px -> 1024px: the tablet/desktop boundary is exclusive at 1024 (desktop begins where lg: begins)', async () => {
      await mountAt(1023, lang);
      expect(fieldRail()).toBeTruthy();
      expect(desktopSidebars()).toHaveLength(0);
      cleanup();
      await mountAt(1024, lang);
      expect(fieldRail()).toBeNull();
      expect(desktopSidebars()).toHaveLength(1);
    });
  });

  it('the bar\'s own CSS boundary is the phone boundary: md:hidden (>=768), never lg:hidden (>=1024)', async () => {
    await mountAt(390, 'en');
    const nav = phoneNav()[0];
    expect(nav.className).toMatch(/\bmd:hidden\b/);
    expect(nav.className).not.toMatch(/\blg:hidden\b/);
  });
});
