// ============================================================
// ACC-CC1 — Commercial Control, first working local slice (Overview).
//
// Source-verified contract this file pins:
//   * The route id stays `commercialhub`; AppShell still renders the named
//     export CommercialHubView with onNavigate={goCommercial}.
//   * useCommercialData() substitutes the SYNTHETIC demo room whenever it has no
//     real rows — which includes the in-flight load and a failed critical fetch.
//     So the view must gate on loadError and loading BEFORE it reads the room:
//     no invented money may appear while loading or after a load failure.
//   * kpis.certifiableTotal is the stored BoQ approved_qty x rate, written by the
//     legacy recertify path from APPROVED WIRs. No verified measurement takes
//     part. It is inspection / QA approval — never "Eligible", never "Certified".
//   * Only source-backed states render. Executed, Measured, Eligible, Claimed,
//     Invoiced and Paid have no defensible source here and are omitted, as is the
//     zero-clamped "Ready to certify" header subtraction.
//   * Review correction: qty x rate is a DERIVED BoQ value, not the authoritative
//     revised contract sum. The hook maps a REJECTED optional IPC fetch to ipcs=[]
//     with no flag, so "no certificate rows" can mean missing data: the view never
//     prints a certified zero. Blocker results are limited derived signals, never an
//     all-clear. useProject() can fall back to a built-in identity and can change
//     without this hook reloading, so no project identity is bound to these rows.
//
// The real hook runs; only the loader modules it calls are mocked (same shape as
// commercial/controlRoomViews.test.jsx), so its error behaviour is exercised.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CommercialHubView } from './CommercialHubView.jsx';
import { PROTECTED_ROUTE_IDS, protectedHash, parseRoute } from '../lib/routes.js';
import { canView } from '../lib/permissions.js';
import { Sidebar } from '../components/Sidebar.jsx';
import { T } from '../i18n/translations.js';

const listBoqItems = vi.fn();
const listWirs = vi.fn();
const listIpcs = vi.fn();
const listAllLinks = vi.fn();
const loadElementStatusMap = vi.fn();
const countAttachmentsByRecord = vi.fn();
vi.mock('../api/boqItems.js', async (orig) => ({ ...(await orig()), listBoqItems: (...a) => listBoqItems(...a) }));
vi.mock('../api/elementBoqLinks.js', () => ({ listAllLinks: (...a) => listAllLinks(...a) }));
vi.mock('../api/wirs.js', () => ({ listWirs: (...a) => listWirs(...a) }));
vi.mock('../api/ncrs.js', () => ({ listNcrs: async () => [] }));
vi.mock('../api/ipcs.js', () => ({ listIpcs: (...a) => listIpcs(...a) }));
vi.mock('../lib/elementStatus.js', () => ({ loadElementStatusMap: (...a) => loadElementStatusMap(...a) }));
vi.mock('../lib/attachments.js', () => ({ countAttachmentsByRecord: (...a) => countAttachmentsByRecord(...a) }));

// A small REAL-project fixture, deliberately disjoint from the synthetic demo set
// (demo codes are 03.10.055 …; demo totals are 1,661,400 contract / 924,200 WIR-approved / 476,200 blocked / 1,240,000 IPC).
//   A-100  qty 100 x 100 = 10,000 · approved 60 -> WIR-approved 6,000 · pending WIR 20 -> 2,000 · no WIR coverage 2,000
//   A-200  qty  50 x 200 = 10,000 · nothing approved, no WIRs, element in progress -> no WIR coverage 10,000
//   A-300  qty  10 x 500 =  5,000 · fully approved with evidence -> no open blockers
const REAL = {
  boq: [
    { id: 'r1', code: 'A-100', description: 'Pile caps — zone A', unit: 'm3', qty: 100, rate: 100, approved_qty: 60 },
    { id: 'r2', code: 'A-200', description: 'Blinding concrete — zone A', unit: 'm2', qty: 50, rate: 200, approved_qty: 0 },
    { id: 'r3', code: 'A-300', description: 'Waterproofing membrane', unit: 'm2', qty: 10, rate: 500, approved_qty: 10 },
  ],
  links: [
    { boq_item_id: 'r1', element_guid: 'e1' }, { boq_item_id: 'r2', element_guid: 'e2' }, { boq_item_id: 'r3', element_guid: 'e3' },
  ],
  statusMap: { e1: { key: 'approved', clear: true }, e2: { key: 'in_progress', clear: false }, e3: { key: 'approved', clear: true } },
  wirs: [
    { id: 'rw1', wir_number: 'WIR-0001', boq_item_id: 'r1', result: 'Approved', approved_qty: 60, element_guid: 'e1' },
    { id: 'rw2', wir_number: 'WIR-0002', boq_item_id: 'r1', result: 'Pending', approved_qty: 20, element_guid: 'e1' },
    { id: 'rw3', wir_number: 'WIR-0003', boq_item_id: 'r3', result: 'Approved', approved_qty: 10, element_guid: 'e3' },
  ],
  ipcs: [{ id: 'ri1', ipc_number: 'IPC-01', status: 'certified', gross_amount: 4000 }],
  attach: { rw1: 2, rw3: 1 },
};
const DEMO_CODE = '03.10.055';
const DEMO_MONEY = /1,661,400|1\.66M|1,240,000|1\.24M|924,200|476,200/;   // every synthetic total, in either number format

const useDemo = () => { listBoqItems.mockResolvedValue([]); };
const useReal = () => {
  listBoqItems.mockResolvedValue(REAL.boq); listAllLinks.mockResolvedValue(REAL.links);
  loadElementStatusMap.mockResolvedValue(REAL.statusMap); listWirs.mockResolvedValue(REAL.wirs);
  listIpcs.mockResolvedValue(REAL.ipcs); countAttachmentsByRecord.mockResolvedValue(REAL.attach);
};
const mediaAt = (width) => (query) => {
  const max = /max-width:\s*(\d+)px/.exec(query); const min = /min-width:\s*(\d+)px/.exec(query);
  const matches = (!max || width <= Number(max[1])) && (!min || width >= Number(min[1]));
  return { matches, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
};
const root = () => document.querySelector('[data-commercial-state]');
const settled = (state) => waitFor(() => expect(root().getAttribute('data-commercial-state')).toBe(state));

beforeEach(() => {
  for (const f of [listBoqItems, listWirs, listIpcs, listAllLinks, loadElementStatusMap, countAttachmentsByRecord]) f.mockReset();
  listBoqItems.mockResolvedValue([]); listWirs.mockResolvedValue([]); listIpcs.mockResolvedValue([]);
  listAllLinks.mockResolvedValue([]); loadElementStatusMap.mockResolvedValue({}); countAttachmentsByRecord.mockResolvedValue({});
  window.matchMedia = vi.fn(mediaAt(1280));
});
afterEach(() => cleanup());

describe('ACC-CC1 · route, navigation and permission contracts are unchanged', () => {
  it('T1 · the existing route id, its URL and the AppShell render line are untouched', () => {
    expect(PROTECTED_ROUTE_IDS).toContain('commercialhub');
    expect(protectedHash('commercialhub')).toBe('#/app/commercialhub');
    expect(parseRoute('#/app/commercialhub').routeId).toBe('commercialhub');
    const shell = readFileSync(resolve(process.cwd(), 'src/AppShell.jsx'), 'utf8');
    expect(shell).toContain("import { CommercialHubView } from './views/CommercialHubView.jsx';");
    expect(shell).toContain("{route === 'commercialhub' && <CommercialHubView t={t} lang={lang} onNavigate={goCommercial} />}");
  });
  it('T10 · no auth / permission behaviour changed, and the view imports neither', () => {
    for (const role of ['admin', 'qs', 'commercial', 'consultant']) expect(canView(role, 'commercialhub'), role).toBe(true);
    for (const role of ['site_eng', 'qc_officer']) expect(canView(role, 'commercialhub'), role).toBe(false);
    const src = readFileSync(resolve(process.cwd(), 'src/views/CommercialHubView.jsx'), 'utf8');
    expect(src).not.toMatch(/from '\.\.\/lib\/(auth|permissions)[.'/]/);
  });
  it('T9 · no API contract changed: the view reads only through the shared hook and performs no write or fetch of its own', async () => {
    const src = readFileSync(resolve(process.cwd(), 'src/views/CommercialHubView.jsx'), 'utf8');
    expect(src).toMatch(/from '\.\.\/lib\/useCommercialData\.js'/);
    expect(src).not.toMatch(/from '\.\.\/api\//);
    expect(src).not.toMatch(/\bsupabase\s*\.\s*(from|rpc|storage)\b|\bfetch\(/);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('no network expected')));
    useReal(); render(<CommercialHubView lang="en" onNavigate={() => {}} />); await settled('project');
    expect(fetchSpy).not.toHaveBeenCalled(); fetchSpy.mockRestore();
    expect(listBoqItems).toHaveBeenCalledTimes(1);                                   // one load, no extra reads
  });
});

describe('ACC-R0 · the Commercial area lands on this workspace', () => {
  it.each([['en', 'Commercial Control'], ['ar', 'التحكم التجاري']])('T4 · the first Commercial destination in the sidebar carries the same name as the page it opens — %s', async (lang, name) => {
    const setRoute = vi.fn();
    const nav = render(<Sidebar route="commercialhub" setRoute={setRoute} t={T[lang]} counts={{}} open />);
    const area = nav.container.querySelector('button[data-nav-area="commercial"]');
    const first = nav.container.querySelector(`#${area.getAttribute('aria-controls')} button[data-route]`);
    expect(first.getAttribute('data-route')).toBe('commercialhub');
    expect(first.getAttribute('aria-current')).toBe('page');
    expect(first.textContent).toContain(name);
    nav.unmount();
    useReal(); render(<CommercialHubView lang={lang} onNavigate={() => {}} />); await settled('project');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(name);        // nav label === page title
    expect(root().textContent).not.toMatch(/eligib|مؤهل/i);                           // T6/T7 hold on the landing the nav opens
  });
});

describe('ACC-CC1 · honest loading and load-failure states (no synthetic fallback)', () => {
  it('R3a · while the project data is still loading, no invented figure, line or table is on screen', async () => {
    let release; listBoqItems.mockImplementation(() => new Promise((r) => { release = r; }));
    render(<CommercialHubView lang="en" onNavigate={() => {}} />);
    expect(root().getAttribute('data-commercial-state')).toBe('loading');
    expect(screen.getByRole('status').textContent).toMatch(/Loading commercial data/);
    expect(document.body.textContent).not.toMatch(DEMO_MONEY);
    expect(screen.queryByText(DEMO_CODE)).toBeNull();
    expect(document.querySelector('table')).toBeNull();
    expect(document.querySelector('[data-state-cell]')).toBeNull();
    release([]); await settled('demo');
  });
  it('R3b · after a critical load failure it shows an error with a retry — never the synthetic room, not even labelled as demo', async () => {
    listBoqItems.mockRejectedValue(new Error('network'));
    render(<CommercialHubView lang="en" onNavigate={() => {}} />);
    await settled('error');
    expect(screen.getByRole('alert').textContent).toMatch(/could not be loaded/i);
    expect(screen.getByRole('alert').textContent).toMatch(/no figures are shown/i);
    expect(document.body.textContent).not.toMatch(DEMO_MONEY);
    expect(screen.queryByText(DEMO_CODE)).toBeNull();
    expect(document.querySelector('table')).toBeNull();
    expect(document.querySelector('[data-state-cell]')).toBeNull();
    expect(document.querySelector('[data-demo-banner]')).toBeNull();                 // a failure is not "demo mode"
    expect(document.body.textContent).not.toMatch(/SAR\s?\d/);
    useReal(); fireEvent.click(screen.getByRole('button', { name: /^Retry$/ }));
    await settled('project');
    expect(screen.getByText('A-100')).toBeTruthy();
  });
});

describe('ACC-CC1 · Commercial Control workspace (Overview)', () => {
  it('T2/T3/R1 · renders the Commercial Control workspace with Overview as the default working section', async () => {
    useReal(); render(<CommercialHubView lang="en" onNavigate={() => {}} />); await settled('project');
    expect(screen.getByRole('heading', { level: 1, name: 'Commercial Control' })).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Commercial sections' });
    const current = within(nav).getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'page');
    expect(current.map((b) => b.textContent.trim())).toEqual(['Overview']);
    for (const fake of [/Commercial Position/, /^Changes$/, /Forecast/, /Snapshots/]) expect(within(nav).queryByText(fake), String(fake)).toBeNull();
    const work = document.querySelector('[data-overview]');
    expect(work.querySelector('[data-state-strip]')).toBeTruthy();
    expect(work.querySelector('[data-attention]')).toBeTruthy();
    expect(work.querySelector('table')).toBeTruthy();
  });
  it('R2 · one working table replaces the card dashboard: no KPI tiles, and every BoQ line is a row', async () => {
    useReal(); render(<CommercialHubView lang="en" onNavigate={() => {}} />); await settled('project');
    const table = screen.getByRole('table');
    const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent.trim());
    expect(heads).toEqual(['BoQ', 'Description', 'Unit', 'BoQ value', 'Inspection-approved (WIR)', 'Blocked', 'Status', 'Main blocker', 'WIRs']);
    expect(within(table).getAllByRole('row')).toHaveLength(1 + REAL.boq.length);
    expect(document.querySelectorAll('[data-state-cell]').length).toBeLessThanOrEqual(4);  // a compact strip, not a tile wall
    expect(document.querySelector('[data-state-strip]').className).not.toMatch(/rounded-2xl|shadow-/);
  });
  it('T4 · only source-backed states render, with figures that trace to the loaded records', async () => {
    useReal(); render(<CommercialHubView lang="en" onNavigate={() => {}} />); await settled('project');
    const cells = Object.fromEntries([...document.querySelectorAll('[data-state-cell]')].map((c) => [c.getAttribute('data-state-cell'), c.textContent]));
    expect(Object.keys(cells)).toEqual(['boq-value', 'wir-approved', 'blocked', 'certified-ipc']);
    expect(cells['boq-value']).toMatch(/BoQ value/); expect(cells['boq-value']).toMatch(/25,000/);
    expect(cells['boq-value']).toMatch(/not the revised contract sum/i);            // derived from BoQ rows, not the authoritative contract
    expect(root().textContent).not.toMatch(/Contract value/);
    expect(cells['wir-approved']).toMatch(/Inspection-approved \(WIR\)/); expect(cells['wir-approved']).toMatch(/11,000/);
    expect(cells.blocked).toMatch(/Blocked/); expect(cells.blocked).toMatch(/14,000/);
    expect(cells['certified-ipc']).toMatch(/Certified in IPC/); expect(cells['certified-ipc']).toMatch(/4,000/);
    expect(cells['certified-ipc']).toMatch(/counts 1 of 1 certificate record loaded/);  // coverage is stated, not assumed
    expect(document.body.textContent).not.toMatch(DEMO_MONEY);
    expect(screen.queryByText(DEMO_CODE)).toBeNull();
    expect(document.querySelector('[data-demo-banner]')).toBeNull();
    expect(document.querySelector('[data-sample-tag]')).toBeNull();
  });
  it('T5/T7 · Eligible is never fabricated, and WIR approval is labelled as inspection approval — not eligibility, certification or a payable figure', async () => {
    useReal(); render(<CommercialHubView lang="en" onNavigate={() => {}} />); await settled('project');
    expect(root().textContent).not.toMatch(/eligib/i);
    for (const unsupported of [/\bExecuted\b/, /\bMeasured\b/, /\bClaimed\b/, /\bInvoiced\b/, /\bPaid\b/, /Ready to certify/i, /\bForecast\b/i, /At risk/i, /invoiceable/i]) expect(root().textContent, String(unsupported)).not.toMatch(unsupported);
    const wir = document.querySelector('[data-state-cell="wir-approved"]');
    expect(wir.textContent).toMatch(/Inspection-approved \(WIR\)/);
    expect(wir.textContent).toMatch(/not commercial acceptance or certification/i);
    expect(wir.textContent).not.toMatch(/certified|certifiable|payable/i);           // the WIR cell never claims certification
    const certified = [...root().querySelectorAll('[data-state-cell]')].filter((c) => /\bCertified\b/.test(c.textContent)).map((c) => c.getAttribute('data-state-cell'));
    expect(certified).toEqual(['certified-ipc']);                                    // "Certified" belongs to IPC records only
    const src = readFileSync(resolve(process.cwd(), 'src/views/CommercialHubView.jsx'), 'utf8');
    expect(src, 'the zero-clamped header subtraction must not be surfaced').not.toMatch(/readyToCertify/);
    expect(src).not.toMatch(/\.(owner|nextAction|targetIpc|recoverableNextIpc)\b/);  // synthetic suggestions stay out
  });
  it('attention lists only source-backed conditions and hands each to the existing Certification Queue filter', async () => {
    const nav = vi.fn(); useReal(); render(<CommercialHubView lang="en" onNavigate={nav} />); await settled('project');
    const att = document.querySelector('[data-attention]');
    const keys = [...att.querySelectorAll('[data-attention-item]')].map((i) => i.getAttribute('data-attention-item'));
    expect(keys).toEqual(['MISSING_WIR', 'WIR_PENDING']);                           // 12,000 then 2,000 — nothing else exists in this project
    expect(att.textContent).toMatch(/No WIR coverage/); expect(att.textContent).toMatch(/12,000/);
    expect(att.textContent).not.toMatch(/Pending change|Missing MIR|Missing drawing|Finished but Blocked/i);
    fireEvent.click(within(att).getByRole('button', { name: /No WIR coverage/ }));
    expect(nav).toHaveBeenCalledWith('certqueue', 'missing_wir');
  });
  it('an unavailable evidence index is reported as unknown, never as "no gap"', async () => {
    useReal(); countAttachmentsByRecord.mockRejectedValue(new Error('index down'));
    render(<CommercialHubView lang="en" onNavigate={() => {}} />); await settled('project');
    expect(document.querySelector('[data-evidence-unknown]').textContent).toMatch(/Evidence status unavailable/);
  });
  it('a REJECTED certificate fetch never reads as "nothing certified": the figure is withheld and the gap is stated', async () => {
    useReal(); listIpcs.mockRejectedValue(new Error('ipcs unavailable'));              // the hook maps this to ipcs=[] with no flag
    render(<CommercialHubView lang="en" onNavigate={() => {}} />); await settled('project');
    const cell = document.querySelector('[data-state-cell="certified-ipc"]');
    expect(cell.querySelector('[data-ipc-unavailable]')).toBeTruthy();
    expect(cell.textContent).toMatch(/Not available/);
    expect(cell.textContent).toMatch(/No certificate records were returned/);
    expect(cell.textContent).toMatch(/none exist or they could not be read/i);
    expect(cell.textContent).not.toMatch(/SAR|\b0\b/);                                 // no certified zero is printed
    expect(document.querySelector('[data-state-cell="boq-value"]').textContent).toMatch(/25,000/);   // the rest of the project still loads
  });
  it('an EMPTY certificate list is indistinguishable from a failed read, so it is withheld the same way', async () => {
    useReal(); listIpcs.mockResolvedValue([]);
    render(<CommercialHubView lang="en" onNavigate={() => {}} />); await settled('project');
    const cell = document.querySelector('[data-state-cell="certified-ipc"]');
    expect(cell.querySelector('[data-ipc-unavailable]')).toBeTruthy();
    expect(cell.textContent).not.toMatch(/SAR|\b0\b/);
  });
  it('blocker results are limited derived signals — an empty list is never an all-clear', async () => {
    useReal(); render(<CommercialHubView lang="en" onNavigate={() => {}} />); await settled('project');
    const scope = document.querySelector('[data-attention] [data-signal-scope]');
    expect(scope.textContent).toMatch(/Derived signals/); expect(scope.textContent).toMatch(/limited to the WIR, element-link and element-status records loaded/i);
    cleanup();
    listBoqItems.mockResolvedValue([REAL.boq[2]]); listAllLinks.mockResolvedValue([REAL.links[2]]); listWirs.mockResolvedValue([REAL.wirs[2]]);
    render(<CommercialHubView lang="en" onNavigate={() => {}} />); await settled('project');
    const att = document.querySelector('[data-attention]');
    expect(att.querySelectorAll('[data-attention-item]')).toHaveLength(0);
    expect(att.textContent).toMatch(/No blocker signal/); expect(att.textContent).toMatch(/not an all-clear/i);
    expect(root().textContent).not.toMatch(/no commercial blockers|all clear|Ready for review|\bReady\b/i);
    expect(within(screen.getByRole('table')).getByText('No blocker signal')).toBeTruthy();   // the line status says what is known, not "ready"
  });
  it('T8 · existing commercial destinations stay reachable from the workspace, with an explicit queue filter', async () => {
    const nav = vi.fn(); useReal(); render(<CommercialHubView lang="en" onNavigate={nav} />); await settled('project');
    const bar = screen.getByRole('navigation', { name: 'Commercial sections' });
    const want = [['Certification Queue', ['certqueue', 'all']], ['Control Room', ['certification-control-room']], ['IPCs', ['ipcs']], ['Cash flow', ['cashflow']]];
    for (const [label, args] of want) { fireEvent.click(within(bar).getByRole('button', { name: label })); expect(nav).toHaveBeenLastCalledWith(...args); expect(PROTECTED_ROUTE_IDS).toContain(args[0]); }
    fireEvent.click(within(bar).getByRole('button', { name: 'Overview' }));
    expect(nav).toHaveBeenCalledTimes(want.length);                                 // Overview is this page, it navigates nowhere
  });
  it('a row opens a read-only line context with its source breakdown, linked WIRs and no commercial action', async () => {
    const nav = vi.fn(); useReal(); render(<CommercialHubView lang="en" onNavigate={nav} />); await settled('project');
    fireEvent.click(screen.getByText('A-100'));
    const dlg = await screen.findByRole('dialog');
    for (const label of ['BoQ value', 'Submitted on WIRs', 'Inspection-approved (WIR)', 'WIR awaiting approval', 'No WIR coverage']) expect(within(dlg).getAllByText(label).length, label).toBeGreaterThan(0);
    expect(within(dlg).getByText('WIR-0001')).toBeTruthy(); expect(within(dlg).getByText('WIR-0002')).toBeTruthy();
    expect(dlg.textContent).not.toMatch(/eligib/i);
    for (const banned of [/certify/i, /approve/i, /mark paid/i, /^pay/i]) expect(within(dlg).queryByRole('button', { name: banned }), String(banned)).toBeNull();
    fireEvent.click(within(dlg).getByRole('button', { name: /Open in Certification Queue/ }));
    expect(nav).toHaveBeenCalledWith('certqueue', 'all');
  });
  it('status filter and search narrow the existing rows only', async () => {
    useReal(); render(<CommercialHubView lang="en" onNavigate={() => {}} />); await settled('project');
    const table = screen.getByRole('table');
    fireEvent.click(screen.getByRole('button', { name: /^Blocked · 1$/ }));
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('A-200')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^All · 3$/ }));
    fireEvent.change(screen.getByPlaceholderText(/Search BoQ code or description/), { target: { value: 'membrane' } });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('A-300')).toBeTruthy();
  });
});

describe('ACC-CC1 · synthetic values stay conspicuously Demo', () => {
  it('T6 · with no project BoQ every figure sits under a pinned Demo banner and each state is tagged Sample', async () => {
    useDemo(); render(<CommercialHubView lang="en" onNavigate={() => {}} />); await settled('demo');
    const banner = document.querySelector('[data-demo-banner]');
    expect(banner.textContent).toMatch(/Demo — sample data/);
    expect(banner.textContent).toMatch(/invented for illustration/i);
    expect(banner.textContent).toMatch(/not this project.s records/i);
    expect(banner.className).toMatch(/\bsticky\b/);
    const cells = [...document.querySelectorAll('[data-state-cell]')];
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) expect(c.querySelector('[data-sample-tag]')?.textContent, c.getAttribute('data-state-cell')).toMatch(/^Sample$/);
    expect(document.querySelector('[data-table-caption]').textContent).toMatch(/Sample lines/);
    expect(screen.getAllByText(DEMO_CODE).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/\bLIVE\b|live data/i);
    expect(root().textContent).not.toMatch(/eligib/i);                              // demo mode does not earn the word either
  });
});

describe('ACC-CC1 · copy and layout', () => {
  it('T11 · EN copy is coherent: read-only statement and basis notes — and no project identity it cannot bind to these rows', async () => {
    useReal(); render(<CommercialHubView lang="en" onNavigate={() => {}} />); await settled('project');
    expect(document.querySelector('[data-workspace-header]').textContent).toMatch(/Read-only/);
    expect(document.querySelector('[data-workspace-header]').textContent).toMatch(/does not certify, approve or pay/i);
    expect(document.querySelector('[data-project-context]')).toBeNull();
    expect(readFileSync(resolve(process.cwd(), 'src/views/CommercialHubView.jsx'), 'utf8')).not.toMatch(/lib\/project\.jsx|useProject/);
    expect(document.querySelector('[data-workspace-header]').textContent).not.toMatch(/Sample Residences|SYN-SAMPLE/);   // the built-in fallback identity never leaks in
    expect(document.querySelector('[data-state-cell="certified-ipc"]').textContent).toMatch(/certificates with status certified or paid/i);
    expect(document.querySelector('[data-state-cell="blocked"]').textContent).toMatch(/NCR or rejected hold, WIR awaiting approval, no WIR coverage/i);
  });
  it('T12 · AR renders the same hierarchy right-to-left with no English workspace chrome', async () => {
    useReal(); const { container } = render(<CommercialHubView lang="ar" onNavigate={() => {}} />); await settled('project');
    expect(container.querySelector('[dir="rtl"]')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'التحكم التجاري' })).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'أقسام التحكم التجاري' });
    expect(within(nav).getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'page').map((b) => b.textContent.trim())).toEqual(['نظرة عامة']);
    expect([...document.querySelectorAll('[data-state-cell]')].map((c) => c.getAttribute('data-state-cell'))).toEqual(['boq-value', 'wir-approved', 'blocked', 'certified-ipc']);
    expect(document.querySelector('[data-state-cell="wir-approved"]').textContent).toMatch(/معتمد بالفحص/);
    expect(within(screen.getByRole('table')).getAllByRole('columnheader')).toHaveLength(9);
    expect(root().textContent).not.toMatch(/Commercial Control|Overview|BoQ value|Inspection-approved|Main blocker|Read-only|Derived signals|Not available/);
    expect(root().textContent).not.toMatch(/مؤهل/);                                  // Arabic "eligible" is not fabricated either
  });
  it('phone keeps the route usable without the desktop ledger: compact line list, no wide table, same truth', async () => {
    window.matchMedia = vi.fn(mediaAt(390));
    useReal(); render(<CommercialHubView lang="en" onNavigate={() => {}} />); await settled('project');
    expect(document.querySelector('table')).toBeNull();
    const list = document.querySelector('[data-line-list]');
    expect(list.querySelectorAll('[data-line-row]')).toHaveLength(REAL.boq.length);
    expect(list.textContent).toMatch(/A-100/);
    expect(document.querySelectorAll('[data-state-cell]')).toHaveLength(4);
    fireEvent.click(list.querySelector('[data-line-row]'));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });
});
