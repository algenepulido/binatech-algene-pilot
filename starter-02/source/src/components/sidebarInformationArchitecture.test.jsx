// ============================================================
// UX-D1 — desktop Sidebar information architecture (SIMPLIFY-UX, dev only).
//
// Six human-facing primary areas, three secondary groups, and an explicit Demo
// boundary for the six synthetic destinations. Grouping is PRESENTATION only:
// every legacy route id stays reachable with its exact id (deep links), the
// permission filter and the badges are preserved, and no page content changes.
// Contract source: internal acceptance record "UX-D1" + "Resolved before GO".
//
// ACC-R0 (composition with ACC-CC1, nav amendment 03abe001): Commercial Control —
// the existing `commercialhub` route — is the FIRST Commercial destination and is
// labelled "Commercial Control" / "التحكم التجاري"; Control Room is retained right
// after it. Ids, ownership, the secondary groups and the Demo boundary are
// unchanged, and the tablet/phone field navigation (Home · Work · Capture · Find ·
// More) is not replaced by the desktop sidebar.
// ============================================================
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';

vi.mock('../lib/project.jsx', () => ({ useProject: () => ({ project: { id: 'project-1', contractor: 'Fictional Contractor', consultant: 'Resident Engineer' } }) }));

import { Sidebar } from './Sidebar.jsx';
import { FieldRail } from './FieldRail.jsx';
import { MobileNav } from './MobileNav.jsx';
import { PROTECTED_ROUTE_IDS } from '../lib/routes.js';
import { T } from '../i18n/translations.js';
import { canView } from '../lib/permissions.js';
import { COL } from '../lib/theme.js';

// [area id, translation key, route ids in display order]
const PRIMARY = [
  ['overview', 'navOverview', ['home', 'dashboard', 'approvals']],
  ['sitework', 'navSiteWork', ['wirs', 'ncrs', 'snagging', 'workitems']],
  ['boq', 'navBoqProgress', ['qs', 'progress', 'model', 'registry']],
  ['commercial', 'grpCommercial', ['commercialhub', 'certification-control-room', 'certqueue', 'ipcs', 'invoices']],
  ['documents', 'navDocuments', ['drawings', 'dms']],
  ['reports', 'navReports', ['reports', 'cashflow']],
];
const SECONDARY = [
  ['procurement', 'grpProcurement', ['pos', 'receiving', 'readiness', 'portal']],
  ['admin', 'navAdmin', ['matrix', 'team', 'settings', 'guide']],
  ['demo', 'navDemo', ['evidence-packs', 'payment-applications', 'ipa-reconciliation', 'recovery-queue', 'ap', 'delays']],
];
const AREAS = [...PRIMARY, ...SECONDARY];
const DEMO = SECONDARY[2][2];
// The 34 destinations the Sidebar exposed at base 5bde9a1e — the legacy contract.
const LEGACY = ['home', 'dashboard', 'approvals', 'wirs', 'evidence-packs', 'ncrs', 'snagging', 'drawings', 'dms', 'workitems', 'model', 'registry',
  'certification-control-room', 'certqueue', 'payment-applications', 'recovery-queue', 'qs', 'progress', 'commercialhub', 'ipcs', 'ipa-reconciliation', 'cashflow', 'invoices',
  'pos', 'receiving', 'readiness', 'ap', 'portal', 'reports', 'delays', 'matrix', 'team', 'settings', 'guide'];
const COUNTS = { pendingApprovals: 0, openWirs: 0, openNcrs: 0, openSnags: 0, drawingsPending: 0, docsPending: 0, pendingSdn: 0, readyForAp: 0 };

afterEach(() => cleanup());

function mount({ route = 'more', lang = 'en', role, counts = COUNTS, overlay = false, open = true } = {}) {
  const setRoute = vi.fn(); const onClose = vi.fn();
  const utils = render(<Sidebar route={route} setRoute={setRoute} t={T[lang]} counts={counts} role={role} open={open} overlay={overlay} onClose={onClose} />);
  return { ...utils, setRoute, onClose, aside: utils.container.querySelector('aside') };
}
const headings = (aside, tier) => [...aside.querySelectorAll(`button[data-nav-area]${tier ? `[data-nav-tier="${tier}"]` : ''}`)];
const heading = (aside, gid) => aside.querySelector(`button[data-nav-area="${gid}"]`);
const routeButtons = (aside) => [...aside.querySelectorAll('button[data-route]')];
const routeIds = (aside) => routeButtons(aside).map((b) => b.getAttribute('data-route'));
const expandAll = (aside) => { for (const h of headings(aside)) if (h.getAttribute('aria-expanded') !== 'true') fireEvent.click(h); };
const itemsOf = (aside, gid) => { const h = heading(aside, gid); const panel = aside.querySelector(`#${h.getAttribute('aria-controls')}`); return panel ? [...panel.querySelectorAll('button[data-route]')].map((b) => b.getAttribute('data-route')) : []; };

describe('test contract sanity', () => {
  it('the nine groups partition exactly the 34 legacy destinations — nothing dropped, nothing duplicated', () => {
    const grouped = AREAS.flatMap(([, , ids]) => ids);
    expect(grouped).toHaveLength(34);
    expect(new Set(grouped).size).toBe(34);
    expect([...grouped].sort()).toEqual([...LEGACY].sort());
  });
});

describe.each(['en', 'ar'])('six primary areas and three secondary groups — %s', (lang) => {
  it('renders exactly six primary area headings, in order, with simple localized labels', () => {
    const { aside } = mount({ lang });
    expect(headings(aside, 'primary').map((h) => h.getAttribute('data-nav-area'))).toEqual(PRIMARY.map(([gid]) => gid));
    expect(headings(aside, 'primary').map((h) => h.textContent.trim())).toEqual(PRIMARY.map(([, key]) => T[lang][key]));
    for (const [, key] of PRIMARY) expect(T[lang][key], `${lang}.${key}`).toBeTruthy();
  });
  it('renders Procurement, Settings & Admin and Demo as secondary groups after the primary areas', () => {
    const { aside } = mount({ lang });
    expect(headings(aside, 'secondary').map((h) => h.getAttribute('data-nav-area'))).toEqual(SECONDARY.map(([gid]) => gid));
    expect(headings(aside, 'secondary').map((h) => h.textContent.trim())).toEqual(SECONDARY.map(([, key]) => T[lang][key]));
    const all = headings(aside).map((h) => h.getAttribute('data-nav-area'));
    expect(all).toEqual(AREAS.map(([gid]) => gid));                              // primary first, then secondary
  });
  it('every area lists exactly its destinations, in order', () => {
    const { aside } = mount({ lang });
    expandAll(aside);
    for (const [gid, , ids] of AREAS) expect(itemsOf(aside, gid), gid).toEqual(ids);
  });
  it('the Dashboard button keeps its existing label and is visible by default (Overview is open when no area owns the route)', () => {
    const { aside } = mount({ lang, route: 'more' });
    expect(within(aside).getByRole('button', { name: T[lang].dashboard })).toBeTruthy();
    expect(heading(aside, 'overview').getAttribute('aria-expanded')).toBe('true');
  });
});

describe('route coverage — every legacy destination is still reachable with its exact id', () => {
  it('after expanding every group the Sidebar exposes exactly the 34 legacy route ids, each once', () => {
    const { aside } = mount();
    expandAll(aside);
    const ids = routeIds(aside);
    expect([...ids].sort()).toEqual([...LEGACY].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });
  it.each(LEGACY)('clicking "%s" navigates to that exact route id and closes the drawer', (id) => {
    const { aside, setRoute, onClose } = mount();
    expandAll(aside);
    fireEvent.click(aside.querySelector(`button[data-route="${id}"]`));
    expect(setRoute).toHaveBeenCalledTimes(1);
    expect(setRoute).toHaveBeenCalledWith(id);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('the QC search alias still jumps to the qc route', () => {
    const { aside, setRoute } = mount();
    fireEvent.change(aside.querySelector('input'), { target: { value: 'QC tests' } });
    fireEvent.click(aside.querySelector('button[data-route="qc"]'));
    expect(setRoute).toHaveBeenCalledWith('qc');
  });
});

describe('active-route ownership and progressive expansion', () => {
  it.each(AREAS.flatMap(([gid, , ids]) => ids.map((id) => [id, gid])))('route "%s" is owned by exactly one item, inside area "%s", which is expanded', (id, gid) => {
    const { aside } = mount({ route: id });
    const current = [...aside.querySelectorAll('button[aria-current="page"]')];
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute('data-route')).toBe(id);
    expect(heading(aside, gid).getAttribute('aria-expanded')).toBe('true');
    expect(heading(aside, gid).getAttribute('data-active-area')).toBe('true');
    expect(headings(aside).filter((h) => h.getAttribute('data-active-area') === 'true')).toHaveLength(1);
    expect(itemsOf(aside, gid)).toContain(id);
  });
  it('only Overview and the active area are expanded by default; everything else starts collapsed', () => {
    const { aside } = mount({ route: 'ipcs' });
    const open = headings(aside).filter((h) => h.getAttribute('aria-expanded') === 'true').map((h) => h.getAttribute('data-nav-area'));
    expect(open).toEqual(['overview', 'commercial']);
    const idle = mount({ route: 'more' });
    expect(headings(idle.aside).filter((h) => h.getAttribute('aria-expanded') === 'true').map((h) => h.getAttribute('data-nav-area'))).toEqual(['overview']);
  });
  it('the consolidated qc route keeps the WIRs / QC item active inside Site Work', () => {
    const { aside } = mount({ route: 'qc' });
    const current = [...aside.querySelectorAll('button[aria-current="page"]')];
    expect(current.map((b) => b.getAttribute('data-route'))).toEqual(['wirs']);
    expect(heading(aside, 'sitework').getAttribute('data-active-area')).toBe('true');
  });
  it('a heading toggles its own panel (aria-expanded + aria-controls) and the first click on a collapsed area opens it', () => {
    const { aside } = mount({ route: 'more' });
    const h = heading(aside, 'documents');
    expect(h.getAttribute('aria-expanded')).toBe('false');
    expect(itemsOf(aside, 'documents')).toEqual([]);
    fireEvent.click(h);
    expect(heading(aside, 'documents').getAttribute('aria-expanded')).toBe('true');
    expect(itemsOf(aside, 'documents')).toEqual(['drawings', 'dms']);
    fireEvent.click(heading(aside, 'documents'));
    expect(heading(aside, 'documents').getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(heading(aside, 'overview'));                                // a default-open area collapses on its first click too
    expect(heading(aside, 'overview').getAttribute('aria-expanded')).toBe('false');
  });
});

describe('Demo boundary — synthetic destinations are never operational-by-default', () => {
  it('the Demo group holds exactly the six confirmed synthetic destinations and none of them appears in a primary area', () => {
    const { aside } = mount();
    expect(heading(aside, 'demo').getAttribute('data-nav-tier')).toBe('secondary');
    expect(heading(aside, 'demo').getAttribute('aria-expanded')).toBe('false');  // collapsed by default: never operational-by-default
    expect(routeIds(aside).filter((id) => DEMO.includes(id))).toEqual([]);        // no Demo destination is visible until the group is opened
    expandAll(aside);
    expect(itemsOf(aside, 'demo')).toEqual(DEMO);
    for (const [gid] of PRIMARY) for (const id of DEMO) expect(itemsOf(aside, gid), `${id} in ${gid}`).not.toContain(id);
  });
  it('Approval Matrix stays in Settings & Admin, not Demo', () => {
    const { aside } = mount();
    expandAll(aside);
    expect(itemsOf(aside, 'admin')).toContain('matrix');
    expect(itemsOf(aside, 'demo')).not.toContain('matrix');
  });
  it.each(['en', 'ar'])('each Demo destination carries a visible localized Demo label; operational destinations carry none (%s)', (lang) => {
    const { aside } = mount({ lang });
    expandAll(aside);
    for (const b of routeButtons(aside)) {
      const tag = b.querySelector('[data-demo-tag]');
      if (DEMO.includes(b.getAttribute('data-route'))) { expect(tag, b.getAttribute('data-route')).toBeTruthy(); expect(tag.textContent.trim()).toBe(T[lang].demoTag); }
      else expect(tag, b.getAttribute('data-route')).toBeNull();
    }
    expect(T.en.demoTag).toBe('Demo');
    expect(T.ar.demoTag).not.toBe('Demo');
  });
  it.each(['en', 'ar'])('search cannot bypass the distinction: a Demo result keeps its label, an operational result has none (%s)', (lang) => {
    const { aside } = mount({ lang });
    const input = aside.querySelector('input');
    fireEvent.change(input, { target: { value: T[lang].evidencePacks.slice(0, 5) } });
    const hit = aside.querySelector('button[data-route="evidence-packs"]');
    expect(hit).toBeTruthy();
    expect(hit.querySelector('[data-demo-tag]').textContent.trim()).toBe(T[lang].demoTag);
    fireEvent.change(input, { target: { value: T[lang].dashboard } });
    expect(aside.querySelector('button[data-route="dashboard"]').querySelector('[data-demo-tag]')).toBeNull();
    expect(headings(aside)).toHaveLength(0);                                    // search shows a flat result list, no groups
  });
});

describe('permission filter and badges are preserved', () => {
  it.each(['site_eng', 'qs', 'consultant', 'admin'])('role %s sees exactly the destinations canView allows; empty groups drop out', (role) => {
    const { aside } = mount({ role });
    expandAll(aside);
    const expected = LEGACY.filter((id) => canView(role, id));
    expect([...routeIds(aside)].sort()).toEqual([...expected].sort());
    for (const [gid, , ids] of AREAS) {
      const visible = ids.filter((id) => canView(role, id));
      if (visible.length === 0) expect(heading(aside, gid), gid).toBeNull(); else expect(itemsOf(aside, gid), gid).toEqual(visible);
    }
  });
  it('item badges keep their counts, including on Demo and Procurement items', () => {
    const counts = { ...COUNTS, pendingApprovals: 4, openWirs: 3, openNcrs: 2, openSnags: 5, drawingsPending: 1, docsPending: 6, pendingSdn: 7, readyForAp: 8 };
    const { aside } = mount({ counts });
    expandAll(aside);
    const badge = (id) => aside.querySelector(`button[data-route="${id}"] [data-badge]`)?.textContent.trim();
    expect({ approvals: badge('approvals'), wirs: badge('wirs'), ncrs: badge('ncrs'), snagging: badge('snagging'), drawings: badge('drawings'), dms: badge('dms'), receiving: badge('receiving'), readiness: badge('readiness'), ap: badge('ap') })
      .toEqual({ approvals: '4', wirs: '3', ncrs: '2', snagging: '5', drawings: '1', dms: '6', receiving: '7', readiness: '8', ap: '8' });
    expect(aside.querySelector('button[data-route="dashboard"] [data-badge]')).toBeNull();
  });
  it('a collapsed area still signals attention: its heading shows the sum of its item badges, and hides it once expanded', () => {
    const counts = { ...COUNTS, openWirs: 3, openNcrs: 2, openSnags: 5 };
    const { aside } = mount({ counts, route: 'more' });
    expect(heading(aside, 'sitework').querySelector('[data-area-badge]').textContent.trim()).toBe('10');
    expect(heading(aside, 'documents').querySelector('[data-area-badge]')).toBeNull();
    fireEvent.click(heading(aside, 'sitework'));
    expect(heading(aside, 'sitework').querySelector('[data-area-badge]')).toBeNull();
  });
});

describe('structure guards', () => {
  it('adds no <nav> landmark inside the aside (one navigation owner per breakpoint stays countable) and keeps the hidden-overlay contract', () => {
    const { aside } = mount();
    expect(aside.querySelector('nav')).toBeNull();
    const hidden = mount({ overlay: true, open: false });
    expect(hidden.aside.hasAttribute('inert')).toBe(true);
    expect(hidden.aside.getAttribute('aria-hidden')).toBe('true');
  });
  it('overlay (phone/tablet drawer) controls meet the 44px touch target; the static desktop rail stays compact', () => {
    const drawer = mount({ overlay: true, open: true });
    for (const b of [...headings(drawer.aside), ...routeButtons(drawer.aside)]) expect(parseInt(b.style.minHeight, 10), b.textContent).toBeGreaterThanOrEqual(44);
    const desktop = mount({ overlay: false });
    expect(parseInt(routeButtons(desktop.aside)[0].style.minHeight, 10)).toBeLessThan(44);
  });
});

describe('review findings — defined colour tokens, contrast, truthful attention signal, search permissions', () => {
  const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };
  it('every colour token the rail uses exists in the theme: inactive rows and non-active headings get the defined secondary ink, never an undefined style', () => {
    expect(COL.inkDim, 'theme token').toBeTruthy();
    const { aside } = mount({ route: 'dashboard' });
    expandAll(aside);
    const inactive = routeButtons(aside).filter((b) => b.getAttribute('aria-current') !== 'page');
    for (const b of inactive) expect(b.style.color, b.getAttribute('data-route')).toBe(rgb(COL.inkDim));
    for (const h of headings(aside).filter((x) => x.getAttribute('data-active-area') !== 'true')) expect(h.style.color, h.getAttribute('data-nav-area')).toBe(rgb(COL.inkDim));
    expect(aside.querySelector('button[aria-current="page"]').style.color).toBe(rgb(COL.inkText));
  });
  it('secondary headings, the More divider and the search context label use the AA-passing secondary ink, not the 2.6:1 muted ink', () => {
    const { aside } = mount({ route: 'more' });
    for (const h of headings(aside, 'secondary')) expect(h.style.color).toBe(rgb(COL.inkDim));
    expect(aside.querySelector('[data-nav-more]').style.color).toBe(rgb(COL.inkDim));
    fireEvent.change(aside.querySelector('input'), { target: { value: T.en.dashboard } });
    expect(aside.querySelector('button[data-route="dashboard"] [data-area-context]').style.color).toBe(rgb(COL.inkDim));
  });
  it('the Demo group never shows an operational-looking attention count, and a real count is announced with context', () => {
    const counts = { ...COUNTS, readyForAp: 8, openWirs: 3 };
    const { aside } = mount({ counts, route: 'more' });
    expect(heading(aside, 'demo').querySelector('[data-area-badge]')).toBeNull();            // ap (Demo) carries a badge, the group heading must not
    expect(heading(aside, 'procurement').querySelector('[data-area-badge]').textContent.trim()).toBe('8');
    const badge = heading(aside, 'sitework').querySelector('[data-area-badge]');
    expect(badge.textContent.trim()).toBe('3');
    expect(badge.getAttribute('aria-label')).toBe(T.en.navAttention.replace('{n}', '3'));
    expect(T.ar.navAttention).toContain('{n}');
  });
  it('the Demo hint explains the boundary in both languages once the group is open', () => {
    for (const lang of ['en', 'ar']) {
      const { aside } = mount({ lang });
      fireEvent.click(heading(aside, 'demo'));
      expect(aside.querySelector(`#${heading(aside, 'demo').getAttribute('aria-controls')}`).textContent).toContain(T[lang].navDemoHint);
      expect(aside.querySelector('[data-nav-more]').textContent.trim()).toBe(T[lang].navMore);
      cleanup();
    }
    expect(T.ar.demoTag).toBe('تجريبي');
  });
  it('search respects the permission filter: a destination the role cannot view is not offered as a result', () => {
    const role = 'site_eng';
    const hiddenId = LEGACY.find((id) => !canView(role, id));
    expect(hiddenId, 'fixture: site_eng must have at least one hidden destination').toBeTruthy();
    const all = mount({});                                                                      // no role: everything is searchable
    expandAll(all.aside);
    const label = all.aside.querySelector(`button[data-route="${hiddenId}"] > span.flex-1`).textContent.trim();
    fireEvent.change(all.aside.querySelector('input'), { target: { value: label } });
    expect(all.aside.querySelector(`button[data-route="${hiddenId}"]`)).toBeTruthy();
    cleanup();
    const limited = mount({ role });
    fireEvent.change(limited.aside.querySelector('input'), { target: { value: label } });
    expect(limited.aside.querySelector(`button[data-route="${hiddenId}"]`)).toBeNull();
  });
});

// ============================================================
// ACC-R0 — composed shell: six-area navigation + Commercial Control landing.
// ============================================================
const labelsOf = (aside, gid) => { const h = heading(aside, gid); const panel = aside.querySelector(`#${h.getAttribute('aria-controls')}`); return [...panel.querySelectorAll('button[data-route]')].map((b) => b.querySelector('span.flex-1')?.textContent.trim() ?? b.textContent.trim()); };
const FIELD_NAV = { en: ['Home', 'Work', 'Capture', 'Find', 'More'], ar: ['الرئيسية', 'الأعمال', 'التقاط', 'بحث', 'المزيد'] };

describe.each([['en', 'Commercial Control', 'Control Room'], ['ar', 'التحكم التجاري', 'غرفة التحكم']])('ACC-R0 · Commercial Control is the first Commercial destination — %s', (lang, control, room) => {
  it('T3/T10/T11 · the Commercial area owns the existing route family, led by Commercial Control with Control Room retained', () => {
    const { aside } = mount({ lang, route: 'commercialhub' });
    expect(itemsOf(aside, 'commercial')).toEqual(['commercialhub', 'certification-control-room', 'certqueue', 'ipcs', 'invoices']);
    expect(labelsOf(aside, 'commercial').slice(0, 2)).toEqual([control, room]);
    expect(aside.textContent).not.toMatch(/Commercial Readiness|الجاهزية التجارية/);   // the old landing name is gone from the navigation
    expect(T[lang].commercialHub).toBe(control);
  });
  it('T4 · it opens the existing `commercialhub` route, which then owns the Commercial area as the current page', () => {
    const { aside, setRoute } = mount({ lang, route: 'dashboard' });
    expandAll(aside);
    fireEvent.click(aside.querySelector('button[data-route="commercialhub"]'));
    expect(setRoute).toHaveBeenCalledWith('commercialhub');
    cleanup();
    const again = mount({ lang, route: 'commercialhub' });
    expect([...again.aside.querySelectorAll('button[aria-current="page"]')].map((b) => b.getAttribute('data-route'))).toEqual(['commercialhub']);
    expect([...again.aside.querySelectorAll('button[data-active-area="true"]')].map((h) => h.getAttribute('data-nav-area'))).toEqual(['commercial']);
    expect(heading(again.aside, 'commercial').getAttribute('aria-expanded')).toBe('true');
  });
  it('search finds the landing by its new name and keeps every Demo destination qualified', () => {
    const { aside } = mount({ lang });
    const input = aside.querySelector('input');
    fireEvent.change(input, { target: { value: control } });
    expect(routeIds(aside)).toContain('commercialhub');
    expect(aside.querySelector('button[data-route="commercialhub"] [data-demo-tag]')).toBeNull();       // the landing is operational, not Demo
    fireEvent.change(input, { target: { value: '' } });
    expandAll(aside);
    for (const id of DEMO) expect(aside.querySelector(`button[data-route="${id}"] [data-demo-tag]`)?.textContent.trim(), id).toBe(T[lang].demoTag);
  });
});

describe('ACC-R0 · the composition changes presentation only', () => {
  it('T2/T12 · all 34 legacy ids stay registered and reachable; exactly one area owns each; no id was renamed', () => {
    const { aside } = mount({ route: 'more' });
    expandAll(aside);
    const ids = routeIds(aside);
    expect([...ids].sort()).toEqual([...LEGACY].sort());
    expect(new Set(ids).size).toBe(ids.length);                                    // one owner per destination
    for (const id of LEGACY) expect(PROTECTED_ROUTE_IDS, id).toContain(id);
    expect(PROTECTED_ROUTE_IDS).toContain('qc');                                   // the alias survives
  });
  it('T12 · role visibility of the Commercial family is untouched', () => {
    for (const id of ['commercialhub', 'certification-control-room', 'certqueue']) {
      for (const role of ['admin', 'qs', 'commercial', 'consultant']) expect(canView(role, id), `${role}:${id}`).toBe(true);
      for (const role of ['site_eng', 'qc_officer']) expect(canView(role, id), `${role}:${id}`).toBe(false);
    }
    const { aside } = mount({ role: 'site_eng' });
    expect(heading(aside, 'commercial')).toBeNull();                               // an area with no visible destination is not drawn
  });
});

describe.each(['en', 'ar'])('ACC-R0 · field and phone navigation are not replaced by the desktop sidebar — %s', (lang) => {
  it('T8 · 768–1023: the field rail keeps Home · Work · Capture · Find · More, and Capture acts', () => {
    const onCapture = vi.fn(); const onNavigate = vi.fn();
    const { container } = render(<FieldRail t={T[lang]} route="quick" onNavigate={onNavigate} onCapture={onCapture} canCapture />);
    const rail = container.querySelector('nav[data-field-rail]');
    expect([...rail.querySelectorAll('button')].map((b) => b.textContent.trim())).toEqual(FIELD_NAV[lang]);
    expect(rail.querySelector('[data-nav-area]')).toBeNull();                       // no desktop area headings leak into the rail
    const capture = within(rail).getByRole('button', { name: FIELD_NAV[lang][2] });
    expect(capture.disabled).toBe(false);
    fireEvent.click(capture);
    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(rail.textContent).not.toMatch(/Commercial Control|التحكم التجاري/);
  });
  it('T9 · <768: the phone bar keeps the same five task destinations', () => {
    const { container } = render(<MobileNav t={T[lang]} route="quick" onNavigate={() => {}} onMenu={() => {}} onCapture={() => {}} counts={COUNTS} canCapture />);
    const labels = [...container.querySelectorAll('button')].map((b) => (b.getAttribute('aria-label') || b.textContent).trim());
    for (const want of FIELD_NAV[lang]) expect(labels.some((l) => l.includes(want)), want).toBe(true);
    expect(container.querySelectorAll('button')).toHaveLength(5);
    expect(container.querySelector('[data-nav-area]')).toBeNull();
  });
});
