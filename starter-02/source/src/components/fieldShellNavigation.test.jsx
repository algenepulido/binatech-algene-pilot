// ============================================================
// MOB-UI1 — the field shell below 1024px has no desktop module-tree drawer.
//
//   <768      phone: five-tab bottom nav (Home · Work · Capture · Find · More)
//   768–1023  tablet: the field rail with the same five items
//   >=1024    desktop: the static six-area Sidebar, unchanged
//
// Below 1024 the Sidebar is not mounted at all, and none of its former entry
// paths remain: no Header "Open menu", no More "All modules & tools" row. Route
// FAMILIES own the active tab (Documents lives under More, so More is current
// on `dms`); Capture is an action, not a route, and never carries aria-current.
// Route ids, permission gates and the desktop shell are untouched.
// ============================================================
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const state = vi.hoisted(() => ({ width: 390, listeners: new Set(), role: 'admin', user: { id: 'u1', email: 'fahad@example.com', user_metadata: { full_name: 'Fahad Al-Mutairi' } } }));
vi.mock('../lib/auth.jsx', () => ({ useAuth: () => ({ user: state.user, isAuthenticated: true, openAuth: vi.fn(), signOut: vi.fn(), requireAuth: (fn) => fn?.() }) }));
vi.mock('../lib/project.jsx', () => ({ useProject: () => ({ project: { id: 'project-1', code: 'CLP-001', name: 'Coastal Logistics Park', nameAr: 'مجمع الخدمات اللوجستية الساحلي' } }) }));
vi.mock('../lib/stats.js', async (orig) => { const o = await orig(); return { ...o, loadCounts: vi.fn().mockResolvedValue(o.EMPTY_COUNTS), loadFinance: vi.fn().mockResolvedValue({ total: 0, approvedValue: 0, pendingValue: 0, blockedValue: 0, certifiedIpc: 0 }) }; });
vi.mock('../api/access.js', () => ({ getMyRole: () => Promise.resolve(state.role) }));
vi.mock('../api/documents.js', async (orig) => ({ ...(await orig()), listDocuments: async () => [] }));
vi.mock('../api/wirs.js', async (orig) => ({ ...(await orig()), listWirs: async () => [] }));

import AppShell from '../AppShell.jsx';
import { T } from '../i18n/translations.js';
import { MobileNav, PHONE_TAB_ROUTES, phoneTabFor } from './MobileNav.jsx';
import { FieldRail } from './FieldRail.jsx';
import { WorkView } from '../views/field/WorkView.jsx';
import { fieldTaskCatalog } from '../views/field/fieldTaskCatalog.js';
import { canView } from '../lib/permissions.js';
import { PROTECTED_ROUTE_IDS } from '../lib/routes.js';

const evaluate = (query) => { const max = /max-width:\s*(\d+)px/.exec(query); const min = /min-width:\s*(\d+)px/.exec(query); return (max ? state.width <= Number(max[1]) : true) && (min ? state.width >= Number(min[1]) : true) && Boolean(max || min); };
const mediaAt = (query) => { const mql = { matches: evaluate(query), media: query, onchange: null, dispatchEvent: vi.fn(), removeEventListener: vi.fn(), removeListener: vi.fn() }; const add = (_t, fn) => state.listeners.add(() => { mql.matches = evaluate(query); fn({ matches: mql.matches, media: query }); }); mql.addEventListener = add; mql.addListener = (fn) => add('change', fn); return mql; };
const resizeTo = async (width) => { state.width = width; await act(async () => { for (const fn of state.listeners) fn(); }); };
const mountAt = async (width, lang = 'en', hash = '#/app/quick') => {
  state.width = width; state.listeners.clear(); window.matchMedia = vi.fn(mediaAt); window.location.hash = hash;
  const utils = render(<AppShell />);
  await waitFor(() => expect(document.querySelector('[data-app-content]')).toBeTruthy());
  await act(async () => {});
  if (lang === 'ar') { fireEvent.click(screen.getByRole('button', { name: /Switch language to Arabic|^العربية$/ })); await act(async () => {}); }
  return utils;
};
const aside = () => document.querySelector('aside');
const fieldRail = () => document.querySelector('nav[data-field-rail]');
const phoneNav = () => [...document.querySelectorAll('nav')].filter((n) => !n.hasAttribute('data-field-rail') && !n.closest('aside') && !n.closest('main'));
const currentTabs = (root) => [...root.querySelectorAll('button[aria-current="page"]')].map((b) => b.getAttribute('aria-label') || b.textContent.trim());

beforeEach(() => { state.role = 'admin'; });
afterEach(() => cleanup());

describe('MOB-UI1 · no desktop module-tree drawer below 1024', () => {
  it.each([[390, 'en'], [390, 'ar'], [767, 'en'], [768, 'en'], [768, 'ar'], [1023, 'en']])('%ipx %s: the Sidebar is not mounted and no drawer opener exists anywhere', async (width, lang) => {
    await mountAt(width, lang);
    expect(aside(), 'no <aside> below 1024').toBeNull();
    expect(screen.queryByRole('button', { name: /Open menu|فتح القائمة/ })).toBeNull();
    expect(document.querySelector('[data-nav-area]')).toBeNull();                      // no six-area headings leak into field chrome
    expect(document.body.textContent).not.toMatch(/All modules & tools|كل الوحدات والأدوات/);
  });
  it('More (phone) offers no "All modules & tools" row, and Documents is reachable from it', async () => {
    await mountAt(390, 'en', '#/app/more');
    expect(screen.queryByRole('button', { name: /All modules/i })).toBeNull();
    expect(screen.getByRole('button', { name: /View Project Documents/i })).toBeTruthy();
    expect(aside()).toBeNull();
  });
  it('1024px: the static desktop Sidebar is mounted, not inert, with no rail or phone bar', async () => {
    await mountAt(1024, 'en');
    const a = aside();
    expect(a).toBeTruthy(); expect(a.hasAttribute('inert')).toBe(false); expect(a.getAttribute('aria-hidden')).toBeNull();
    expect(within(a).getAllByRole('button').length).toBeGreaterThan(0);
    expect(fieldRail()).toBeNull(); expect(phoneNav()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull();          // desktop never needed an opener
  });
  it('live 1024 -> 767 -> 1024: the Sidebar unmounts entering the field width and remounts static on return', async () => {
    await mountAt(1024, 'en');
    expect(aside()).toBeTruthy();
    await resizeTo(767);
    await waitFor(() => expect(aside()).toBeNull());
    expect(phoneNav()).toHaveLength(1);
    await resizeTo(1024);
    await waitFor(() => expect(aside()).toBeTruthy());
    expect(aside().hasAttribute('inert')).toBe(false);
  });
});

describe('MOB-UI1 · field rail and phone bar boundaries', () => {
  it.each([768, 1023])('%ipx: the field rail carries Home · Work · Capture · Find · More and the phone bar is absent', async (width) => {
    await mountAt(width, 'en');
    expect(fieldRail()).toBeTruthy(); expect(phoneNav()).toHaveLength(0);
    expect([...fieldRail().querySelectorAll('button')].map((b) => b.textContent.trim())).toEqual(['Home', 'Work', 'Capture', 'Find', 'More']);
  });
  it.each([390, 767])('%ipx: the phone bar carries the same five and the rail is absent', async (width) => {
    await mountAt(width, 'en');
    expect(fieldRail()).toBeNull(); expect(phoneNav()).toHaveLength(1);
    expect([...phoneNav()[0].querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Home', 'Work', 'Capture', 'Find', 'More']);
  });
});

describe('MOB-UI1 · route-family ownership of the active tab', () => {
  it('the ownership map is total over its own tabs, disjoint, and names only existing route ids', () => {
    const all = Object.values(PHONE_TAB_ROUTES).flat();
    expect(new Set(all).size).toBe(all.length);
    for (const id of all) expect(PROTECTED_ROUTE_IDS, id).toContain(id);
    expect(PHONE_TAB_ROUTES.more).toEqual(expect.arrayContaining(['dms', 'drawings']));
    expect(PHONE_TAB_ROUTES.work).toEqual(expect.arrayContaining(['ncrs', 'snagging']));
    expect(phoneTabFor('dms')).toBe('more'); expect(phoneTabFor('quick')).toBe('quick'); expect(phoneTabFor('ncrs')).toBe('work'); expect(phoneTabFor('drawings')).toBe('more'); expect(phoneTabFor('cashflow')).toBeNull();
  });
  it.each([['quick', 'Home'], ['work', 'Work'], ['scan', 'Find'], ['more', 'More'], ['dms', 'More'], ['settings', 'More']])('phone: route %s → exactly one current tab, %s; Capture never current', (route, tab) => {
    render(<MobileNav t={T.en} route={route} onNavigate={() => {}} onCapture={() => {}} />);
    expect(currentTabs(document.body)).toEqual([tab]);
    const capture = screen.getByRole('button', { name: 'Capture' });
    expect(capture.getAttribute('aria-current')).toBeNull();
    expect(capture.querySelector('[data-capture-mark]'), 'Capture keeps its distinct action affordance').toBeTruthy();
  });
  it.each([['dms', 'More'], ['work', 'Work'], ['ncrs', 'Work'], ['drawings', 'More'], ['cashflow', null]])('tablet rail: route %s → current %s; Capture never current', (route, tab) => {
    render(<FieldRail t={T.en} route={route} onNavigate={() => {}} onCapture={() => {}} />);
    expect(currentTabs(document.body)).toEqual(tab ? [tab] : []);
    expect(screen.getByRole('button', { name: 'Capture' }).getAttribute('aria-current')).toBeNull();
  });
  it('phone: on the Documents route the More tab is current in the real shell, EN and AR', async () => {
    await mountAt(390, 'en', '#/app/dms');
    expect(currentTabs(phoneNav()[0])).toEqual(['More']);
    cleanup();
    await mountAt(390, 'ar', '#/app/dms');
    expect(currentTabs(phoneNav()[0])).toEqual([T.ar.mNavMore]);
  });
  it('Capture stays an action with its permission gate: a role without wir.edit gets a disabled Capture, no route change', async () => {
    state.role = 'viewer';
    await mountAt(390, 'en');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Capture' }).disabled).toBe(true));
  });
});

describe('MOB-UI1.1 · quality records under Work and Drawings under More, permission-aware, no drawer', () => {
  it.each([['qc_officer', true], ['site_eng', false], ['viewer', false]])('Work (%s): NCRs entry shown = %s, Snagging shown, both navigate; gates come from canView', async (role, ncrs) => {
    const onNavigate = vi.fn();
    render(<WorkView t={T.en} role={role} onNavigate={onNavigate} onOpenWir={() => {}} />);
    await waitFor(() => expect(document.querySelector('[data-work-read-state]').getAttribute('data-work-read-state')).not.toBe('loading'));
    const records = document.querySelector('[data-quality-records]');
    expect(records).toBeTruthy();
    expect(!!within(records).queryByRole('button', { name: 'NCRs' })).toBe(ncrs);
    expect(canView(role, 'ncrs')).toBe(ncrs);
    fireEvent.click(within(records).getByRole('button', { name: 'Snagging' })); expect(onNavigate).toHaveBeenCalledWith('snagging');
    if (ncrs) { fireEvent.click(within(records).getByRole('button', { name: 'NCRs' })); expect(onNavigate).toHaveBeenCalledWith('ncrs'); }
    for (const b of records.querySelectorAll('button')) expect(parseFloat(getComputedStyle(b).minHeight)).toBeGreaterThanOrEqual(44);
  });
  it('More catalogue offers Drawings (canView) and Documents; still no "All modules" row', () => {
    const onNavigate = vi.fn();
    const keys = fieldTaskCatalog({ t: T.en, role: 'admin', onNavigate }).map((x) => x.key);
    expect(keys).toEqual(expect.arrayContaining(['docs', 'drawings']));
    fieldTaskCatalog({ t: T.en, role: 'admin', onNavigate }).find((x) => x.key === 'drawings').go();
    expect(onNavigate).toHaveBeenCalledWith('drawings');
    expect(keys).not.toContain('all-modules');
  });
  it('phone at 390 on Documents: while the Filters sheet is open the bottom nav is inert, Home is unreachable; after Escape it is interactive again', async () => {
    await mountAt(390, 'en', '#/app/dms');
    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    const sheet = screen.getByRole('dialog', { name: /Filters/ });
    expect(phoneNav()[0].closest('[inert]'), 'bottom nav inert behind the modal').toBeTruthy();
    expect(sheet.closest('[inert]')).toBeNull();
    fireEvent.keyDown(sheet, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Filters/ })).toBeNull());
    expect(phoneNav()[0].closest('[inert]')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Filters/ }));
  });
});
