// ============================================================
// WorkView — frame B: "Grouped by WIR state · no separate inspection object".
// The design merges assigned inspections into the WIR lifecycle, so the screen
// is three state groups on one surface each, not a row of filter pills.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const WIRS = [
  { id: '1', project_id: 'project-a', wir_number: 'WIR-2451-A', inspection_type: 'Blinding pour', location: 'Zone C', result: 'rejected', inspection_date: '2026-08-20' },
  { id: '2', project_id: 'project-a', wir_number: 'WIR-2437-A', inspection_type: 'Kerb line levels', location: 'Zone D', result: 'rejected', inspection_date: '2026-08-21' },
  { id: '3', project_id: 'project-a', wir_number: 'WIR-2448-C', inspection_type: 'Duct hanger spacing', location: 'L1 plantroom', result: 'pending', inspection_date: '2026-08-22' },
  { id: '4', project_id: 'project-a', wir_number: 'WIR-2450-B', inspection_type: 'Rebar cover check', location: 'Zone C', result: 'in_progress', inspection_date: '2026-08-23' },
  { id: '5', project_id: 'project-a', wir_number: 'WIR-2440-B', inspection_type: 'Blockwork set-out', location: 'Zone A', result: 'approved', inspection_date: '2026-08-21' },
];
let rows = WIRS;
let readImpl = null;
vi.mock('../../api/wirs.js', () => ({ listWirs: vi.fn((...args) => readImpl ? readImpl(...args) : Promise.resolve(rows)) }));
vi.mock('../../api/projects.js', () => ({ getProject: vi.fn(async (id) => ({ id, name: 'Coastal Logistics Park' })) }));
vi.mock('../../lib/project.jsx', () => ({ useProject: () => ({ project: { name: 'Coastal Logistics Park', code: 'P2' } }) }));

let WorkView;
import { listWirs } from '../../api/wirs.js';
import { T } from '../../i18n/translations.js';
import { setCurrentProjectId } from '../../lib/currentProject.js';
import { OfflineReferencePack } from './OfflineReferencePack.jsx';

beforeEach(async () => {
  rows = WIRS;
  readImpl = null;
  vi.mocked(listWirs).mockClear();
  setCurrentProjectId('project-a');
  globalThis.indexedDB = fakeIndexedDb();
  ({ WorkView } = await import('./WorkView.jsx'));
});
afterEach(() => cleanup());

const view = (p = {}) => render(<WorkView t={{}} lang="en" onNavigate={() => {}} onOpenWir={() => {}} {...p} />);
const num = (v) => parseFloat(v) || 0;
// MOB-UI1.1: the WIR groups sit beside a permission-aware "Quality records" navigation surface; these count the groups only.
const surfaces = () => [...document.querySelectorAll('[data-group] [data-field-surface]')];

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fakeIndexedDb() {
  const rowsByKey = new Map();
  const stores = new Set();
  const api = {
    rows: rowsByKey,
    putCount: 0,
    open() {
      const request = {};
      queueMicrotask(() => {
        const db = {
          objectStoreNames: { contains: (name) => stores.has(name) },
          createObjectStore(name) { stores.add(name); },
          close() {},
          transaction() {
            let aborted = false;
            let settled = false;
            const staged = new Map();
            const tx = {
              abort() {
                if (aborted || settled) return;
                aborted = true;
                queueMicrotask(() => tx.onabort?.());
              },
            };
            const commit = () => {
              if (aborted || settled) return;
              for (const [key, value] of staged) rowsByKey.set(key, structuredClone(value));
              settled = true;
              tx.oncomplete?.();
            };
            tx.objectStore = () => ({
              put(value) {
                const operation = {};
                queueMicrotask(() => {
                  if (aborted) return;
                  api.putCount += 1;
                  staged.set(value.key, structuredClone(value));
                  operation.onsuccess?.();
                });
                return operation;
              },
              get(key) {
                const operation = {};
                queueMicrotask(() => {
                  if (aborted) return;
                  const value = staged.has(key) ? staged.get(key) : rowsByKey.get(key);
                  operation.result = value === undefined ? undefined : structuredClone(value);
                  operation.onsuccess?.();
                  queueMicrotask(commit);
                });
                return operation;
              },
            });
            return tx;
          },
        };
        request.result = db;
        if (!stores.size) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
  return api;
}

describe('B · Work — grouped by WIR state', () => {
  it('(W1) the filter pills are gone — no control is a pill', async () => {
    view();
    await screen.findByText(/Blinding pour/);
    for (const b of document.querySelectorAll('button')) {
      expect(num(getComputedStyle(b).borderRadius), b.textContent.slice(0, 20)).toBeLessThanOrEqual(8);
    }
  });

  it('(W2) the three state groups are labelled with their counts', async () => {
    view();
    await screen.findByText(/Blinding pour/);
    expect(screen.getByText(/needs your action · 2/i)).toBeTruthy();
    expect(screen.getByText(/awaiting inspection · 2/i)).toBeTruthy();
    expect(screen.getByText(/approved · 1/i)).toBeTruthy();
  });

  it('(W3) each WIR lands in the group its result puts it in', async () => {
    view();
    await screen.findByText(/Blinding pour/);
    const g = (name) => document.querySelector(`[data-group="${name}"]`);
    expect(g('action').textContent).toMatch(/Blinding pour/);
    expect(g('action').textContent).toMatch(/Kerb line levels/);
    expect(g('awaiting').textContent).toMatch(/Duct hanger spacing/);
    expect(g('awaiting').textContent).toMatch(/Rebar cover check/);
    expect(g('approved').textContent).toMatch(/Blockwork set-out/);
    expect(g('approved').textContent).not.toMatch(/Blinding pour/);
  });

  it('(W4) one fill surface per group, zero borders, never nested', async () => {
    view();
    await screen.findByText(/Blinding pour/);
    expect(surfaces().length).toBe(3);
    for (const el of surfaces()) {
      const cs = getComputedStyle(el);
      expect(num(cs.borderTopWidth) + num(cs.borderBottomWidth) + num(cs.borderLeftWidth) + num(cs.borderRightWidth)).toBe(0);
      expect(num(cs.borderRadius)).toBe(14);
      expect(el.parentElement.closest('[data-field-surface]')).toBeNull();
    }
  });

  it('(W5) every row is a >=44px target that opens its WIR', async () => {
    const onOpenWir = vi.fn();
    view({ onOpenWir });
    await screen.findByText(/Blinding pour/);
    const btns = [...document.querySelectorAll('[data-group] [data-field-surface] button')];
    expect(btns.length).toBe(5);
    for (const b of btns) expect(num(getComputedStyle(b).minHeight), b.textContent.slice(0, 20)).toBeGreaterThanOrEqual(44);
    fireEvent.click(btns[0]);
    expect(onOpenWir).toHaveBeenCalledWith(expect.objectContaining({ wir_number: 'WIR-2451-A' }));
  });

  it('(W6) identifiers are set in mono, body copy is not', async () => {
    view();
    await screen.findByText(/Blinding pour/);
    const id = screen.getByText('WIR-2451-A');
    expect(getComputedStyle(id).fontFamily.toLowerCase()).toMatch(/mono/);
    const title = screen.getByText(/Blinding pour/);
    expect(getComputedStyle(title).fontFamily.toLowerCase()).not.toMatch(/plex mono/);
  });

  it('(W7) a group with nothing in it is omitted, not drawn empty', async () => {
    rows = WIRS.filter((w) => w.result === 'approved');
    view();
    await waitFor(() => expect(document.body.textContent).not.toMatch(/Loading/i));
    expect(document.querySelector('[data-group="action"]')).toBeNull();
    expect(document.querySelector('[data-group="awaiting"]')).toBeNull();
    expect(document.querySelector('[data-group="approved"]')).toBeTruthy();
    expect(surfaces().length).toBe(1);
  });

  it('(W8) an entirely empty project says so once, honestly', async () => {
    rows = [];
    view();
    await waitFor(() => expect(document.body.textContent).not.toMatch(/Loading/i));
    expect(surfaces().length).toBe(0);
    expect(screen.getByText(/no work on this project yet/i)).toBeTruthy();
  });

  it('(W9) Arabic renders RTL', async () => {
    view({ lang: 'ar' });
    await screen.findByText(/Blinding pour/);
    expect(document.querySelector('[dir="rtl"]')).toBeTruthy();
  });

  it('(W10) keeps a pending initial read distinct from empty', async () => {
    readImpl = () => deferred().promise;
    view({ t: T.en });
    expect(document.querySelector('[data-work-read-state]')).toHaveAttribute('data-work-read-state', 'loading');
    expect(document.body.textContent).not.toMatch(/No work on this project yet/i);
  });

  it('(W11) renders initial rejection as a retryable error, never successful empty', async () => {
    readImpl = () => Promise.reject(new Error('source unavailable'));
    view({ t: T.en });

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load work.');
    expect(screen.getByText('Check your connection and try again.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(document.querySelector('[data-work-read-state]')).toHaveAttribute('data-work-read-state', 'error');
    expect(document.body.textContent).not.toMatch(/No work on this project yet/i);
  });

  it('(W12) treats an invalid non-array read result as error, not empty', async () => {
    readImpl = () => Promise.resolve({ records: [] });
    view({ t: T.en });
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load work.');
    expect(document.body.textContent).not.toMatch(/No work on this project yet/i);
  });

  it('(W13) keeps the error visible during one deduplicated retry, then renders recovered records', async () => {
    const retry = deferred();
    let attempts = 0;
    readImpl = () => (++attempts === 1 ? Promise.reject(new Error('offline')) : retry.promise);
    view({ t: T.en });
    const button = await screen.findByRole('button', { name: 'Try again' });

    fireEvent.click(button);
    fireEvent.click(button);
    expect(attempts).toBe(2);
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load work.');
    expect(button).toBeDisabled();
    expect(document.querySelector('[data-work-read-state]')).toHaveAttribute('data-work-read-state', 'error');

    await act(async () => retry.resolve(WIRS));
    expect(await screen.findByText(/Blinding pour/)).toBeTruthy();
    expect(document.querySelector('[data-work-read-state]')).toHaveAttribute('data-work-read-state', 'records');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('(W14) replaces retry error with true empty only after a successful empty response', async () => {
    let attempts = 0;
    readImpl = () => (++attempts === 1 ? Promise.reject(new Error('offline')) : Promise.resolve([]));
    view({ t: T.en });
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByText(/No work on this project yet/i)).toBeTruthy();
    expect(document.querySelector('[data-work-read-state]')).toHaveAttribute('data-work-read-state', 'empty');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('(W15) cannot let a late Project A retry overwrite remounted Project B records', async () => {
    const lateA = deferred();
    const projectBRows = [{ ...WIRS[0], id: 'b-1', project_id: 'project-b', wir_number: 'WIR-B-001', inspection_type: 'Project B work' }];
    let attempts = 0;
    readImpl = () => {
      attempts += 1;
      if (attempts === 1) return Promise.reject(new Error('A failed'));
      if (attempts === 2) return lateA.promise;
      return Promise.resolve(projectBRows);
    };
    const rendered = render(<WorkView key="project-a" t={T.en} lang="en" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await act(async () => setCurrentProjectId('project-b'));
    await act(async () => lateA.resolve([{ ...WIRS[0], inspection_type: 'STALE PROJECT A' }]));
    expect(document.body.textContent).not.toContain('STALE PROJECT A');

    rendered.rerender(<WorkView key="project-b" t={T.en} lang="en" />);
    expect(await screen.findByText(/Project B work/)).toBeTruthy();
    expect(listWirs).toHaveBeenLastCalledWith('project-b');
    expect(document.body.textContent).toContain('Project B work');
    expect(document.body.textContent).not.toContain('STALE PROJECT A');
  });

  it('(W16) keeps a valid actual O1 reference distinct and byte-stable while live Work errors and retries', async () => {
    const rendered = render(<>
      <WorkView key="work-1" t={T.en} lang="en" />
      <OfflineReferencePack key="offline" isAuthenticated userId="user-a" projectId="project-a" t={T.en} lang="en" />
    </>);
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText(T.en.offlineReferenceChoose), '1');
    await user.click(screen.getByRole('button', { name: T.en.offlineReferenceDownload }));
    await waitFor(() => expect(document.querySelector('[data-offline-reference-pack]')).toHaveAttribute('data-state', 'downloaded'));
    const stored = structuredClone([...globalThis.indexedDB.rows.values()]);
    const writesBeforeWorkError = globalThis.indexedDB.putCount;

    readImpl = () => Promise.reject(new Error('live Work unavailable'));
    rendered.rerender(<>
      <WorkView key="work-2" t={T.en} lang="en" />
      <OfflineReferencePack key="offline" isAuthenticated userId="user-a" projectId="project-a" t={T.en} lang="en" />
    </>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load work.');
    const offlinePanel = document.querySelector('[data-offline-reference-pack]');
    expect(within(offlinePanel).getByText(/Downloaded to this browser.*may be stale/i)).toBeTruthy();
    expect(within(offlinePanel).getByText(/Read-only reference.*No changes are sent/i)).toBeTruthy();
    expect(offlinePanel.querySelector('[data-offline-reference-record]')).toHaveTextContent('WIR-2451-A');

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).not.toBeDisabled());
    expect(globalThis.indexedDB.putCount).toBe(writesBeforeWorkError);
    expect([...globalThis.indexedDB.rows.values()]).toEqual(stored);
    expect(document.querySelector('[data-offline-reference-record]')).toHaveTextContent('WIR-2451-A');
  });

  it('(W17) renders the read error and retry naturally in Arabic', async () => {
    readImpl = () => Promise.reject(new Error('source unavailable'));
    view({ t: T.ar, lang: 'ar' });
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تحميل الأعمال.');
    expect(screen.getByText('تحقق من اتصالك وحاول مرة أخرى.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'حاول مرة أخرى' })).toBeTruthy();
  });
});
