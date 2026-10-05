// ============================================================
// ACC-R0.1 — tablet header collision (768–1023).
//
// Defect, measured in a real browser at 768px on ACC-R0 aa49fb1: the header's
// right-hand group never shrinks (537px, 288px of it the fixed-width search box),
// so the left group is squeezed to 191px while the brand wordmark alone is 209px.
// The project slot collapsed to 0px, but its button — fit-content inside a block
// wrapper, with a no-wrap label — still painted 224px wide and overflowed across
// the search box and 48px of the language button. The project switcher's wrapper
// is positioned and the language button is not, so the project button won the
// pointer: clicking "العربية" opened the project menu.
//
// jsdom performs no layout, so this file pins the layout CONTRACT that removes
// the collision; the geometry and real-pointer proof live in the browser evidence.
//   * the project slot takes the space that is left and CAPS its button to it
//     (so the label truncates instead of overflowing);
//   * below lg the brand is the compact mark, the search box is narrower and
//     "Sign out" is icon-only — every action stays present and named;
//   * the phone header (<768) is a different branch and is untouched.
// ============================================================
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';

const state = vi.hoisted(() => ({ width: 900, signOut: vi.fn() }));
vi.mock('../lib/auth.jsx', () => ({ useAuth: () => ({ user: { email: 'reviewer@example.test' }, openAuth: vi.fn(), signOut: state.signOut }) }));
vi.mock('../lib/project.jsx', () => ({
  useProject: () => ({ project: { id: 'project-1', code: 'CLP-001-LONG', name: 'Coastal Logistics Park and Regional Distribution Centre — Northern Infrastructure Package', nameAr: 'مجمع الخدمات اللوجستية الساحلي ومركز التوزيع الإقليمي — حزمة البنية التحتية الشمالية' } }),
}));
vi.mock('../api/projects.js', async (orig) => ({ ...(await orig()), listProjects: async () => [] }));

import { Header } from './Header.jsx';

const mediaAt = (query) => {
  const max = /max-width:\s*(\d+)px/.exec(query); const min = /min-width:\s*(\d+)px/.exec(query);
  return { matches: (!max || state.width <= Number(max[1])) && (!min || state.width >= Number(min[1])), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
};
const mount = (props = {}) => {
  const handlers = { setLang: vi.fn(), setRoute: vi.fn() };
  const utils = render(<Header t={{ tagline: 'Quality Control', search: 'Search element / drawing / WIR…' }} lang="en" route="commercialhub" {...handlers} {...props} />);
  return { ...utils, ...handlers, header: utils.container.querySelector('header') };
};
const classes = (el) => new Set(String(el?.className || '').split(/\s+/).filter(Boolean));

beforeEach(() => { state.width = 900; state.signOut.mockClear(); window.matchMedia = vi.fn(mediaAt); });
afterEach(() => cleanup());

describe.each([['en', 'ltr'], ['ar', 'rtl']])('ACC-R0.1 · tablet header (768–1023) cannot let the project switcher cover the language control — %s', (lang) => {
  it('the project slot takes the leftover width and caps its button to it, so a long label truncates instead of overflowing', () => {
    const { header } = mount({ lang });
    const [left, right] = header.children;
    expect(classes(left).has('flex-1') && classes(left).has('min-w-0'), 'left group: grows into the free space and may shrink').toBe(true);
    expect(classes(right).has('flex-shrink-0'), 'right group keeps its controls at full size').toBe(true);
    const slot = header.querySelector('[data-header-project-slot]');
    expect(left.contains(slot)).toBe(true);
    expect(classes(slot).has('flex-1') && classes(slot).has('min-w-0'), 'slot: leftover width, shrinkable').toBe(true);
    expect(classes(slot).has('[&>div>button]:max-w-full'), 'the switcher button is capped to the slot — the overflow that caused the collision').toBe(true);
    const button = slot.querySelector('button');
    expect(button.parentElement.parentElement, 'the cap selector really addresses the switcher button').toBe(slot);
    expect(classes(button).has('min-w-0')).toBe(true);
    expect(classes(button.querySelector('.truncate')).has('truncate')).toBe(true);        // the long label ellipsises inside the capped button
  });
  it('below lg the header is budgeted for 768px: compact brand, narrower search, icon-only sign-out, tighter gaps', () => {
    const { header } = mount({ lang });
    const [left] = header.children;
    expect(classes(left).has('gap-3') && classes(left).has('lg:gap-6') && !classes(left).has('sm:gap-6'), 'wide gaps only from lg').toBe(true);
    const home = within(header).getByTitle('Projects home');
    const wordmark = home.querySelector('[data-brand="wordmark"]'); const mark = home.querySelector('[data-brand="mark"]');
    expect(classes(wordmark).has('hidden') && classes(wordmark).has('lg:inline-flex') && !classes(wordmark).has('sm:inline-flex'), 'wordmark (209px) only from lg').toBe(true);
    expect(classes(mark).has('lg:hidden') && !classes(mark).has('sm:hidden'), 'compact mark below lg').toBe(true);
    const search = header.querySelector('[data-header-search]');
    expect(classes(search).has('max-lg:[&_input]:w-44'), 'search box narrows below lg (it is 288px fixed in its own file)').toBe(true);
    expect(search.querySelector('input'), 'search stays present').toBeTruthy();
    const signOutLabel = [...header.querySelectorAll('span')].find((s) => s.textContent === 'Sign out');
    expect(classes(signOutLabel).has('hidden') && classes(signOutLabel).has('lg:inline') && !classes(signOutLabel).has('sm:inline'), 'text label only from lg').toBe(true);
  });
  it('no essential action is hidden: home, project, search, language, notifications and sign-out are all present, named and wired; no drawer opener (MOB-UI1)', () => {
    const { header, setLang, setRoute } = mount({ lang });
    expect(within(header).queryByRole('button', { name: 'Open menu' }), 'the module-tree drawer no longer exists below 1024').toBeNull();
    fireEvent.click(within(header).getByTitle('Projects home')); expect(setRoute).toHaveBeenCalledWith('home');
    const language = within(header).getByRole('button', { name: lang === 'en' ? /العربية/ : /^EN$/ });                 // the desktop/tablet control is named by its visible label
    fireEvent.click(language); expect(setLang).toHaveBeenCalledWith(lang === 'en' ? 'ar' : 'en');
    fireEvent.click(within(header).getByRole('button', { name: 'Sign out' })); expect(state.signOut).toHaveBeenCalledTimes(1);   // icon-only at tablet, still named
    expect(header.querySelector('[data-header-project-slot] button')).toBeTruthy();
    expect(header.querySelector('[data-header-search] input')).toBeTruthy();
    expect(header.querySelectorAll('button').length).toBeGreaterThanOrEqual(5);
    fireEvent.click(header.querySelector('[data-header-project-slot] button'));
    expect(header.querySelector('[data-project-picker]'), 'project selection semantics unchanged').toBeTruthy();
    expect(setLang).toHaveBeenCalledTimes(1);                                              // opening the project menu is not a language switch
  });
});

describe('ACC-R0.1 · other widths keep their own header', () => {
  it('phone (<768) still renders the separate phone header — no tablet/desktop slot, same 44px controls', () => {
    state.width = 390;
    const { header } = mount();
    expect(header.querySelector('[data-header-project-slot]')).toBeNull();
    expect(header.querySelector('[data-phone-project-slot]')).toBeTruthy();
    expect(header.querySelectorAll('[data-phone-shell-control]').length).toBeGreaterThanOrEqual(2);
    expect(header.querySelector('[data-header-search]')).toBeNull();
  });
  it('desktop (>=1024) uses the same capped slot, so the project label can never run under the search box either', () => {
    state.width = 1280;
    const { header } = mount();
    expect(classes(header.querySelector('[data-header-project-slot]')).has('[&>div>button]:max-w-full')).toBe(true);
    expect(header.querySelector('[data-brand="wordmark"]')).toBeTruthy();
  });
});
