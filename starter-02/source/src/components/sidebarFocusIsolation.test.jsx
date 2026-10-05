// ============================================================
// MOBILE-A11Y-1 — the closed overlay Sidebar must be unreachable.
//
// MOB-UI1 supersedes the phone/tablet half of this contract: below 1024px the
// Sidebar is no longer an overlay drawer at all — it is not mounted, and no
// opener exists (see fieldShellNavigation.test.jsx). What remains here:
//   below 1024      → no <aside>, nothing to focus, nothing exposed;
//   static desktop  → never inert, even while the overlay-open flag is false;
//   live resize     → the drawer unmounts entering the field width and the
//                     static sidebar returns at 1024, never inert.
//
// jsdom applies no stylesheet and does not implement native `inert`, so these
// tests lock the attribute/state contract, the accessibility-tree exclusion
// (testing-library role queries honour aria-hidden) and the focus-redirect
// guard. Real Tab traversal and native inert behaviour are proven in a browser
// by the independent verifier, not here.
// ============================================================
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const state = vi.hoisted(() => ({
  width: 390,
  listeners: new Set(),
  user: { email: 'fahad@example.com', user_metadata: { full_name: 'Fahad Al-Mutairi' } },
}));

vi.mock('../lib/auth.jsx', () => ({ useAuth: () => ({ user: state.user, openAuth: vi.fn(), signOut: vi.fn() }) }));
vi.mock('../lib/project.jsx', () => ({
  useProject: () => ({ project: { id: 'project-1', code: 'CLP-001', name: 'Coastal Logistics Park', nameAr: 'مجمع الخدمات اللوجستية الساحلي', contractor: 'Fictional Contractor', consultant: 'Dar' } }),
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

/** Width-aware matchMedia whose listeners can be re-evaluated for a live resize. */
const evaluate = (query) => {
  const max = /max-width:\s*(\d+)px/.exec(query);
  const min = /min-width:\s*(\d+)px/.exec(query);
  return (max ? state.width <= Number(max[1]) : true) && (min ? state.width >= Number(min[1]) : true) && Boolean(max || min);
};
const mediaAt = (query) => {
  const mql = { matches: evaluate(query), media: query, onchange: null, dispatchEvent: vi.fn() };
  const add = (_type, fn) => state.listeners.add(() => { mql.matches = evaluate(query); fn({ matches: mql.matches, media: query }); });
  mql.addEventListener = add;
  mql.addListener = (fn) => add('change', fn);
  mql.removeEventListener = vi.fn();
  mql.removeListener = vi.fn();
  return mql;
};
const resizeTo = async (width) => {
  state.width = width;
  await act(async () => { for (const fn of state.listeners) fn(); });
};

beforeEach(() => {
  state.listeners.clear();
  window.matchMedia = vi.fn(mediaAt);
  window.location.hash = '#/app/more';
});
afterEach(() => cleanup());

const aside = () => document.querySelector('aside');
const fieldRail = () => document.querySelector('nav[data-field-rail]');
const phoneNav = () => [...document.querySelectorAll('nav')].filter((n) => !n.hasAttribute('data-field-rail'));
const isHidden = (el) => el.hasAttribute('inert') && el.getAttribute('aria-hidden') === 'true';
const exposedSidebarButtons = () => within(aside()).queryAllByRole('button');   // role queries skip aria-hidden subtrees

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

const PHONE = [390, 767];
const LANGS = ['en', 'ar'];

describe('MOBILE-A11Y-1 — closed overlay Sidebar is unreachable; open overlay and static desktop are untouched', () => {
  describe.each(LANGS)('%s', (lang) => {
    it.each(PHONE)('%ipx: no overlay drawer is mounted and no opener exists (MOB-UI1)', async (width) => {
      await mountAt(width, lang);
      expect(aside(), 'the module-tree drawer is desktop chrome only').toBeNull();
      expect(screen.queryByRole('button', { name: /Open menu|فتح القائمة/ })).toBeNull();
      expect(phoneNav()).toHaveLength(1);
      expect(fieldRail()).toBeNull();
    });
  });

  it('768px: tablet keeps its FieldRail and Capture; no drawer and no opener', async () => {
    await mountAt(768, 'en');
    expect(fieldRail()).toBeTruthy();
    expect(within(fieldRail()).getByRole('button', { name: T.en.mNavCapture }).disabled).toBe(false);
    expect(aside()).toBeNull();
    expect(screen.queryByRole('button', { name: /Open menu/ })).toBeNull();
    expect(phoneNav()).toHaveLength(0);
  });

  it('1024px: the static desktop Sidebar is never inert while the overlay-open flag is false', async () => {
    await mountAt(1024, 'en');
    const a = aside();
    expect(a).toBeTruthy();
    expect(a.hasAttribute('inert')).toBe(false);
    expect(a.getAttribute('aria-hidden')).toBeNull();
    expect(exposedSidebarButtons().length).toBeGreaterThan(0);
    expect(phoneNav()).toHaveLength(0);
    expect(fieldRail()).toBeNull();
  });

  it('live 1024 -> 767 -> 1024: the sidebar unmounts entering the field width (focus cannot stay in it) and returns static', async () => {
    await mountAt(1024, 'en');
    expect(isHidden(aside())).toBe(false);
    const inside = within(aside()).getByRole('button', { name: T.en.dashboard });
    act(() => inside.focus());
    await resizeTo(767);
    await waitFor(() => expect(aside()).toBeNull());
    expect(document.activeElement === document.body || document.activeElement === null, 'focus is released with the unmounted drawer').toBe(true);
    await resizeTo(1024);
    await waitFor(() => expect(aside()).toBeTruthy());
    expect(isHidden(aside())).toBe(false);
    expect(exposedSidebarButtons().length).toBeGreaterThan(0);
  });
});
