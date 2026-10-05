import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, useLayoutEffect, useRef } from 'react';

const fixture = vi.hoisted(() => ({
  width: 390,
  user: { id: 'user-a', email: 'field@example.test', user_metadata: { full_name: 'Fahad' } },
  wirs: [
    {
      id: 'wir-a',
      project_id: 'project-a',
      wir_number: 'WIR-A-001',
      inspection_type: 'Rebar inspection',
      location: 'Zone A',
      zone: 'North',
      level: 'L1',
      result: 'pending',
      work_item_id: 'work-a',
      rate: 1250,
      approved_qty: 12,
    },
  ],
  projectResult: null,
  listImpl: null,
}));

vi.mock('../../lib/auth.jsx', () => ({
  useAuth: () => ({ user: fixture.user, isAuthenticated: Boolean(fixture.user) }),
}));
vi.mock('../../lib/project.jsx', () => ({
  useProject: () => ({ project: { code: 'A', name: 'Project A' } }),
}));
vi.mock('../../lib/stats.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    loadCounts: vi.fn().mockResolvedValue(original.EMPTY_COUNTS),
    loadFinance: vi.fn().mockResolvedValue({ total: 0, approvedValue: 0, pendingValue: 0, blockedValue: 0, certifiedIpc: 0 }),
  };
});
vi.mock('../../api/access.js', () => ({ getMyRole: vi.fn().mockResolvedValue('site_eng') }));
vi.mock('../../api/wirs.js', () => ({ listWirs: vi.fn((projectId) => fixture.listImpl ? fixture.listImpl(projectId) : Promise.resolve(fixture.wirs)) }));
vi.mock('../../api/projects.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getProject: vi.fn(async (id) => fixture.projectResult || ({ id, name: id === 'project-a' ? 'Project A' : 'Project B' })),
}));

import AppShell from '../../AppShell.jsx';
import { T } from '../../i18n/translations.js';
import { setCurrentProjectId } from '../../lib/currentProject.js';
import { OfflineReferencePack } from './OfflineReferencePack.jsx';
import { getProject } from '../../api/projects.js';
import { listWirs } from '../../api/wirs.js';
import {
  buildOfflineReferencePack,
  readOfflineReferencePack,
  validateOfflineReferencePack,
  writeOfflineReferencePack,
} from '../../lib/offlineReferencePack.js';

function fakeIndexedDb() {
  const rows = new Map();
  const stores = new Set();
  const api = {
    rows,
    failNextWrite: false,
    throwNextWrite: false,
    throwNextTransaction: false,
    failNextRead: false,
    nextReadValue: undefined,
    beforeNextWriteCommit: null,
    abortCount: 0,
    nextOpenGate: null,
    open() {
      const request = {};
      const finish = () => {
        const db = {
          objectStoreNames: { contains: (name) => stores.has(name) },
          createObjectStore(name) { stores.add(name); },
          close() {},
          transaction(name, mode) {
            if (api.throwNextTransaction) {
              api.throwNextTransaction = false;
              throw new Error('Synchronous transaction failure');
            }
            let aborted = false;
            let settled = false;
            let readRequested = false;
            const pendingWrites = new Map();
            const tx = {
              error: null,
              abort() {
                if (aborted || settled) return;
                aborted = true;
                api.abortCount += 1;
                queueMicrotask(() => tx.onabort?.());
              },
            };
            const commit = () => {
              if (aborted || settled) return;
              api.beforeNextWriteCommit?.();
              api.beforeNextWriteCommit = null;
              if (aborted) return;
              for (const [key, value] of pendingWrites) rows.set(key, structuredClone(value));
              settled = true;
              tx.oncomplete?.();
            };
            tx.objectStore = () => ({
              put(value) {
                if (api.throwNextWrite) {
                  api.throwNextWrite = false;
                  throw new Error('Synchronous storage failure');
                }
                const op = {};
                queueMicrotask(() => {
                  if (aborted) return;
                  if (api.failNextWrite) {
                    api.failNextWrite = false;
                    tx.error = new Error('Quota exceeded');
                    op.error = tx.error;
                    op.onerror?.();
                    tx.onerror?.();
                    return;
                  }
                  pendingWrites.set(value.key, structuredClone(value));
                  op.onsuccess?.();
                  queueMicrotask(() => { if (!readRequested) commit(); });
                });
                return op;
              },
              get(key) {
                readRequested = true;
                const op = {};
                queueMicrotask(() => {
                  if (aborted) return;
                  if (api.failNextRead) {
                    api.failNextRead = false;
                    op.error = new Error('Readback failed');
                    op.onerror?.();
                    return;
                  }
                  const override = api.nextReadValue;
                  api.nextReadValue = undefined;
                  const value = override !== undefined
                    ? override
                    : pendingWrites.has(key) ? pendingWrites.get(key) : rows.get(key);
                  op.result = value === undefined ? undefined : structuredClone(value);
                  op.onsuccess?.();
                  queueMicrotask(commit);
                });
                return op;
              },
            });
            return tx;
          },
        };
        request.result = db;
        if (!stores.size) request.onupgradeneeded?.();
        request.onsuccess?.();
      };
      const gate = api.nextOpenGate;
      api.nextOpenGate = null;
      if (gate) gate.promise.then(finish);
      else queueMicrotask(finish);
      return request;
    },
  };
  return api;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  fixture.width = 390;
  fixture.user = { id: 'user-a', email: 'field@example.test', user_metadata: { full_name: 'Fahad' } };
  fixture.projectResult = null;
  fixture.listImpl = null;
  fixture.wirs = [{
    id: 'wir-a', project_id: 'project-a', wir_number: 'WIR-A-001', inspection_type: 'Rebar inspection',
    location: 'Zone A', zone: 'North', level: 'L1', result: 'pending', work_item_id: 'work-a', rate: 1250, approved_qty: 12,
  }];
  vi.mocked(listWirs).mockClear();
  vi.mocked(getProject).mockClear();
  globalThis.indexedDB = fakeIndexedDb();
  setCurrentProjectId('project-a');
  window.location.hash = '#/app/work';
  window.matchMedia = vi.fn((query) => {
    const max = /max-width:\s*(\d+)px/.exec(query)?.[1];
    const min = /min-width:\s*(\d+)px/.exec(query)?.[1];
    const matches = (max == null || fixture.width <= Number(max)) && (min == null || fixture.width >= Number(min));
    return { matches, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  });
});

afterEach(() => cleanup());

const renderPack = (props = {}) => render(
  <OfflineReferencePack isAuthenticated userId="user-a" projectId="project-a" t={{}} lang="en" {...props} />,
);

function CommitObserver({ onCommit, children }) {
  const ref = useRef(null);
  useLayoutEffect(() => { onCommit(ref.current?.textContent || ''); });
  return <div ref={ref}>{children}</div>;
}

describe('MOB-O1 warm offline reference pack', () => {
  it('rejects malformed, unknown-schema, and wrong-scope stored records', () => {
    const pack = buildOfflineReferencePack({
      userScope: 'user-a',
      project: { id: 'project-a', name: 'Project A' },
      wir: fixture.wirs[0],
      downloadedAtDevice: '2026-09-20T14:00:00.000Z',
    });
    expect(() => validateOfflineReferencePack({ ...pack, schema: 2 }, { userScope: 'user-a', projectId: 'project-a' })).toThrow();
    expect(() => validateOfflineReferencePack(pack, { userScope: 'user-b', projectId: 'project-a' })).toThrow();
    expect(() => validateOfflineReferencePack(pack, { userScope: 'user-a', projectId: 'project-b' })).toThrow();
    expect(() => validateOfflineReferencePack({ ...pack, downloadedAtDevice: '' }, { userScope: 'user-a', projectId: 'project-a' })).toThrow();
    expect(() => validateOfflineReferencePack({ ...pack, rate: 1250 }, { userScope: 'user-a', projectId: 'project-a' })).toThrow();
  });

  it('mounts a neutral, read-only reference pack beside the real Work route', async () => {
    render(<AppShell />);
    await screen.findByRole('heading', { name: 'Work' });

    const pack = document.querySelector('[data-offline-reference-pack]');
    expect(pack).toBeTruthy();
    expect(pack).toHaveAttribute('data-state', 'not-downloaded');
    expect(pack.textContent).toMatch(/Download for offline/i);
    expect(screen.getByRole('button', { name: 'Download for offline' })).toHaveStyle({ minHeight: '48px' });
    expect(screen.getByLabelText('Reference WIR')).toHaveStyle({ minHeight: '48px' });
    expect(pack.textContent).not.toMatch(/approve|upload|sync/i);
    await waitFor(() => expect(screen.getByRole('option', { name: /WIR-A-001/ })).toBeTruthy());
  });

  it('keeps unverified and true-empty contexts visibly distinct from read failures', async () => {
    const view = render(<OfflineReferencePack isAuthenticated={false} userId={null} projectId="project-a" t={{}} lang="en" />);
    expect(document.querySelector('[data-offline-reference-pack]')).toHaveAttribute('data-state', 'unavailable');
    expect(screen.getByText(/unavailable until your account can be verified/i)).toBeTruthy();

    fixture.wirs = [];
    view.rerender(<OfflineReferencePack isAuthenticated userId="user-a" projectId="project-a" t={{}} lang="en" />);
    await waitFor(() => expect(document.querySelector('[data-offline-reference-pack]')).toHaveAttribute('data-state', 'unavailable'));
    expect(screen.getByText(/no WIR is available to download/i)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('downloads one explicitly selected current-project WIR and excludes commercial fields', async () => {
    const user = userEvent.setup();
    renderPack();
    await user.selectOptions(await screen.findByLabelText('Reference WIR'), 'wir-a');
    await user.click(screen.getByRole('button', { name: 'Download for offline' }));

    expect(await screen.findByText(/available on this screen/i)).toBeTruthy();
    expect(screen.getByText(/downloaded to this browser.*may be stale/i)).toBeTruthy();
    expect(screen.getByText(/downloaded on this device/i)).toBeTruthy();
    expect(screen.getByText(/read-only reference.*no changes are sent/i)).toBeTruthy();
    const record = document.querySelector('[data-offline-reference-record]');
    expect(within(record).getByText(/WIR-A-001/)).toBeTruthy();
    expect(within(record).getByText(/Rebar inspection/)).toBeTruthy();
    expect(within(record).getByText(/Project A/)).toBeTruthy();
    expect(within(record).getByText(/pending.*work-a/i)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/1250|approved quantity|certified|rate|total|invoice/i);
    expect(getProject).toHaveBeenCalledWith('project-a');
    expect(listWirs).toHaveBeenLastCalledWith('project-a');
    expect([...globalThis.indexedDB.rows.values()]).toEqual([
      expect.objectContaining({
        schema: 1,
        userScope: 'user-a',
        projectId: 'project-a',
        project: { id: 'project-a', name: 'Project A' },
        wir: {
          id: 'wir-a', number: 'WIR-A-001', description: 'Rebar inspection', status: 'pending',
          workItemId: 'work-a', location: 'Zone A', zone: 'North', level: 'L1',
        },
      }),
    ]);
  });

  it('never reports a different WIR when transactional readback does not match the selected candidate', async () => {
    const otherWir = {
      ...fixture.wirs[0], id: 'wir-other', wir_number: 'WIR-OTHER', inspection_type: 'Other reference',
    };
    const otherPack = buildOfflineReferencePack({
      userScope: 'user-a', project: { id: 'project-a', name: 'Project A' }, wir: otherWir,
    });
    const user = userEvent.setup();
    renderPack();
    await user.selectOptions(await screen.findByLabelText('Reference WIR'), 'wir-a');
    globalThis.indexedDB.nextReadValue = otherPack;
    await user.click(screen.getByRole('button', { name: 'Download for offline' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid/i);
    expect(document.querySelector('[data-offline-reference-record]')).toBeNull();
    expect(globalThis.indexedDB.rows.size).toBe(0);
  });

  it('preserves the old stored pack when replacement readback fails before commit', async () => {
    const user = userEvent.setup();
    renderPack();
    await user.selectOptions(await screen.findByLabelText('Reference WIR'), 'wir-a');
    await user.click(screen.getByRole('button', { name: 'Download for offline' }));
    expect(await screen.findByText(/available on this screen/i)).toBeTruthy();
    const oldPack = structuredClone([...globalThis.indexedDB.rows.values()][0]);

    fixture.wirs = [{ ...fixture.wirs[0], inspection_type: 'New replacement' }];
    globalThis.indexedDB.failNextRead = true;
    await user.click(screen.getByRole('button', { name: 'Download again' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/device couldn.t store.*previous download is still available/i);
    expect(document.querySelector('[data-offline-reference-record]')).toHaveTextContent('Rebar inspection');
    expect([...globalThis.indexedDB.rows.values()]).toEqual([oldPack]);
  });

  it('discloses limited stale read-only behavior in English and Arabic before download', async () => {
    const en = renderPack({ t: T.en });
    await screen.findByLabelText('Reference WIR');
    const english = document.querySelector('[data-offline-reference-pack]').textContent;
    expect(english).toMatch(/limited/i);
    expect(english).toMatch(/may be stale/i);
    expect(english).toMatch(/read-only/i);
    expect(english).toMatch(/no changes.*sent|no offline submissions/i);
    expect(globalThis.indexedDB.rows.size).toBe(0);

    en.unmount();
    renderPack({ t: T.ar, lang: 'ar' });
    await screen.findByLabelText(T.ar.offlineReferenceChoose);
    const arabic = document.querySelector('[data-offline-reference-pack]').textContent;
    expect(arabic).toContain('محدود');
    expect(arabic).toContain('قديمة');
    expect(arabic).toContain('للقراءة فقط');
    expect(arabic).toContain('لا يتم إرسال');
    expect(globalThis.indexedDB.rows.size).toBe(0);
  });

  it('shows downloading until both required reads and the atomic write finish', async () => {
    const pendingProject = deferred();
    fixture.projectResult = pendingProject.promise;
    const user = userEvent.setup();
    renderPack();
    await user.selectOptions(await screen.findByLabelText('Reference WIR'), 'wir-a');
    await user.click(screen.getByRole('button', { name: 'Download for offline' }));
    expect(document.querySelector('[data-offline-reference-pack]')).toHaveAttribute('data-state', 'downloading');
    expect(screen.getByRole('button', { name: /Downloading/i })).toBeDisabled();

    await act(async () => pendingProject.resolve({ id: 'project-a', name: 'Project A' }));
    expect(await screen.findByText(/available on this screen/i)).toBeTruthy();
  });

  it('does not turn a failed required read into a successful empty pack', async () => {
    let calls = 0;
    fixture.listImpl = () => (++calls === 1 ? Promise.resolve(fixture.wirs) : Promise.reject(new Error('offline')));
    const user = userEvent.setup();
    renderPack();
    await user.selectOptions(await screen.findByLabelText('Reference WIR'), 'wir-a');
    await user.click(screen.getByRole('button', { name: 'Download for offline' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/records couldn.t be read/i);
    expect(globalThis.indexedDB.rows.size).toBe(0);
    expect(document.querySelector('[data-offline-reference-pack]')).toHaveAttribute('data-state', 'error');
  });

  it('keeps the old same-scope pack visible when its replacement fails', async () => {
    const user = userEvent.setup();
    renderPack();
    await user.selectOptions(await screen.findByLabelText('Reference WIR'), 'wir-a');
    await user.click(screen.getByRole('button', { name: 'Download for offline' }));
    expect(await screen.findByText(/available on this screen/i)).toBeTruthy();

    globalThis.indexedDB.failNextWrite = true;
    await user.click(screen.getByRole('button', { name: /Download again/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/previous download is still available/i);
    expect(within(document.querySelector('[data-offline-reference-record]')).getByText(/WIR-A-001/)).toBeTruthy();
    expect(globalThis.indexedDB.rows.size).toBe(1);
  });

  it('classifies a synchronous IndexedDB write exception as a storage failure', async () => {
    const user = userEvent.setup();
    renderPack();
    await user.selectOptions(await screen.findByLabelText('Reference WIR'), 'wir-a');
    globalThis.indexedDB.throwNextWrite = true;
    await user.click(screen.getByRole('button', { name: 'Download for offline' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/device couldn.t store/i);
    expect(globalThis.indexedDB.rows.size).toBe(0);
  });

  it('hides A synchronously on a user or project mismatch and ignores late A', async () => {
    const pending = deferred();
    let calls = 0;
    fixture.listImpl = () => (++calls === 1 ? Promise.resolve(fixture.wirs) : pending.promise);
    const user = userEvent.setup();
    const view = renderPack();
    await user.selectOptions(await screen.findByLabelText('Reference WIR'), 'wir-a');
    await user.click(screen.getByRole('button', { name: 'Download for offline' }));
    expect(document.querySelector('[data-offline-reference-pack]')).toHaveAttribute('data-state', 'downloading');

    await act(async () => setCurrentProjectId('project-b'));
    view.rerender(<OfflineReferencePack isAuthenticated userId="user-a" projectId="project-b" t={{}} lang="en" />);
    expect(document.querySelector('[data-offline-reference-pack]')).toHaveAttribute('data-state', 'loading');
    expect(document.body.textContent).not.toMatch(/WIR-A-001|Rebar inspection/);
    await act(async () => pending.resolve(fixture.wirs));
    expect(document.body.textContent).not.toMatch(/WIR-A-001|Rebar inspection/);

    view.rerender(<OfflineReferencePack isAuthenticated userId="user-b" projectId="project-b" t={{}} lang="en" />);
    expect(document.body.textContent).not.toMatch(/WIR-A-001|Rebar inspection/);
    await waitFor(() => expect(document.querySelector('[data-offline-reference-pack]')).toHaveAttribute('data-state', 'unavailable'));
  });

  it('rejects a late A before any local commit after the scope changes', async () => {
    const pending = deferred();
    let calls = 0;
    fixture.listImpl = () => (++calls === 1 ? Promise.resolve(fixture.wirs) : pending.promise);
    const user = userEvent.setup();
    const view = renderPack();
    await user.selectOptions(await screen.findByLabelText('Reference WIR'), 'wir-a');
    await user.click(screen.getByRole('button', { name: 'Download for offline' }));

    await act(async () => setCurrentProjectId('project-b'));
    view.rerender(<OfflineReferencePack isAuthenticated userId="user-a" projectId="project-b" t={{}} lang="en" />);
    await act(async () => pending.resolve(fixture.wirs));
    expect(globalThis.indexedDB.rows.size).toBe(0);
  });

  it('invalidates a pending download before local commit when Work unmounts', async () => {
    const pending = deferred();
    let calls = 0;
    fixture.listImpl = () => (++calls === 1 ? Promise.resolve(fixture.wirs) : pending.promise);
    const user = userEvent.setup();
    const view = renderPack();
    await user.selectOptions(await screen.findByLabelText('Reference WIR'), 'wir-a');
    await user.click(screen.getByRole('button', { name: 'Download for offline' }));
    expect(document.querySelector('[data-offline-reference-pack]')).toHaveAttribute('data-state', 'downloading');
    view.unmount();

    await act(async () => pending.resolve(fixture.wirs));
    expect(globalThis.indexedDB.rows.size).toBe(0);
  });

  it('cannot overwrite an old good A or a newer B pack when stale A settles last', async () => {
    const lateA = deferred();
    const wirB = { ...fixture.wirs[0], id: 'wir-b', project_id: 'project-b', wir_number: 'WIR-B-001', inspection_type: 'Project B inspection' };
    let aCalls = 0;
    fixture.listImpl = (projectId) => {
      if (projectId === 'project-b') return Promise.resolve([wirB]);
      aCalls += 1;
      if (aCalls <= 2) return Promise.resolve(fixture.wirs);
      return lateA.promise;
    };
    const user = userEvent.setup();
    const view = renderPack();
    await user.selectOptions(await screen.findByLabelText('Reference WIR'), 'wir-a');
    await user.click(screen.getByRole('button', { name: 'Download for offline' }));
    expect(await screen.findByText(/available on this screen/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Download again' }));

    await act(async () => setCurrentProjectId('project-b'));
    view.rerender(<OfflineReferencePack isAuthenticated userId="user-a" projectId="project-b" t={{}} lang="en" />);
    await user.selectOptions(await screen.findByLabelText('Reference WIR'), 'wir-b');
    await user.click(screen.getByRole('button', { name: 'Download for offline' }));
    expect(await screen.findByText(/Project B inspection/)).toBeTruthy();

    await act(async () => lateA.resolve([{ ...fixture.wirs[0], inspection_type: 'STALE A MUST NOT COMMIT' }]));
    const stored = [...globalThis.indexedDB.rows.values()];
    expect(stored).toHaveLength(2);
    expect(stored.find((pack) => pack.projectId === 'project-a').wir.description).toBe('Rebar inspection');
    expect(stored.find((pack) => pack.projectId === 'project-b').wir.description).toBe('Project B inspection');
  });

  it('aborts stale A while IndexedDB is opening so a fresh A2 remains authoritative', async () => {
    const oldA = { ...fixture.wirs[0], inspection_type: 'Old A' };
    const freshA = { ...fixture.wirs[0], inspection_type: 'Fresh A2' };
    const wirB = { ...fixture.wirs[0], id: 'wir-b', project_id: 'project-b', wir_number: 'WIR-B-001' };
    let aCalls = 0;
    fixture.listImpl = (projectId) => {
      if (projectId === 'project-b') return Promise.resolve([wirB]);
      aCalls += 1;
      return Promise.resolve(aCalls <= 2 ? [oldA] : [freshA]);
    };
    const delayedOpen = deferred();
    globalThis.indexedDB.nextOpenGate = delayedOpen;
    const user = userEvent.setup();
    const view = renderPack();
    await user.selectOptions(await screen.findByLabelText('Reference WIR'), 'wir-a');
    await user.click(screen.getByRole('button', { name: 'Download for offline' }));

    await act(async () => {
      setCurrentProjectId('project-b');
      view.rerender(<OfflineReferencePack isAuthenticated userId="user-a" projectId="project-b" t={{}} lang="en" />);
    });
    await waitFor(() => expect(document.querySelector('[data-offline-reference-pack]')).toHaveAttribute('data-state', 'not-downloaded'));
    await act(async () => {
      setCurrentProjectId('project-a');
      view.rerender(<OfflineReferencePack isAuthenticated userId="user-a" projectId="project-a" t={{}} lang="en" />);
    });
    await user.selectOptions(await screen.findByLabelText('Reference WIR'), 'wir-a');
    await user.click(screen.getByRole('button', { name: 'Download for offline' }));
    expect(await screen.findByText(/Fresh A2/)).toBeTruthy();

    await act(async () => delayedOpen.resolve());
    await act(async () => {});
    const storedA = [...globalThis.indexedDB.rows.values()].find((pack) => pack.projectId === 'project-a');
    expect(storedA.wir.description).toBe('Fresh A2');
  });

  it('does not revive an old pack after project or authentication eligibility leaves and returns', async () => {
    const user = userEvent.setup();
    const view = renderPack();
    await user.selectOptions(await screen.findByLabelText('Reference WIR'), 'wir-a');
    await user.click(screen.getByRole('button', { name: 'Download for offline' }));
    expect(await screen.findByText(/available on this screen/i)).toBeTruthy();

    await act(async () => setCurrentProjectId('project-b'));
    view.rerender(<OfflineReferencePack isAuthenticated userId="user-a" projectId="project-b" t={{}} lang="en" />);
    await act(async () => setCurrentProjectId('project-a'));
    view.rerender(<OfflineReferencePack isAuthenticated userId="user-a" projectId="project-a" t={{}} lang="en" />);
    expect(document.body.textContent).not.toMatch(/available on this screen/i);

    view.rerender(<OfflineReferencePack isAuthenticated={false} userId={null} projectId="project-a" t={{}} lang="en" />);
    view.rerender(<OfflineReferencePack isAuthenticated userId="user-a" projectId="project-a" t={{}} lang="en" />);
    expect(document.body.textContent).not.toMatch(/available on this screen/i);
    await screen.findByLabelText('Reference WIR');
  });

  it.each([
    ['user', { userId: 'user-b', projectId: 'project-a' }],
    ['project', { userId: 'user-a', projectId: 'project-b' }],
  ])('removes completed A from the first committed %s-mismatch frame in StrictMode', async (_kind, next) => {
    const commits = [];
    const user = userEvent.setup();
    const renderObserved = (props) => (
      <StrictMode>
        <CommitObserver onCommit={(copy) => commits.push(copy)}>
          <OfflineReferencePack isAuthenticated t={{}} lang="en" {...props} />
        </CommitObserver>
      </StrictMode>
    );
    const view = render(renderObserved({ userId: 'user-a', projectId: 'project-a' }));
    await user.selectOptions(await screen.findByLabelText('Reference WIR'), 'wir-a');
    await user.click(screen.getByRole('button', { name: 'Download for offline' }));
    expect(await screen.findByText(/available on this screen/i)).toBeTruthy();
    commits.length = 0;

    if (next.projectId === 'project-b') {
      await act(async () => {
        setCurrentProjectId('project-b');
        view.rerender(renderObserved(next));
      });
    } else view.rerender(renderObserved(next));
    expect(commits).not.toHaveLength(0);
    expect(commits[0]).not.toMatch(/WIR-A-001|Rebar inspection/);
    await waitFor(() => expect(document.querySelector('[data-offline-reference-pack]')).toHaveAttribute(
      'data-state', next.projectId === 'project-b' ? 'unavailable' : 'not-downloaded',
    ));
  });

  it('round-trips one strict IndexedDB adapter record and rejects missing or corrupt data', async () => {
    const pack = buildOfflineReferencePack({
      userScope: 'user-a', project: { id: 'project-a', name: 'Project A' }, wir: fixture.wirs[0],
      downloadedAtDevice: '2026-09-20T14:00:00.000Z',
    });
    await writeOfflineReferencePack(pack);
    await expect(readOfflineReferencePack({ userScope: 'user-a', projectId: 'project-a' })).resolves.toEqual(pack);
    await expect(readOfflineReferencePack({ userScope: 'user-a', projectId: 'project-b' })).rejects.toThrow(/unavailable/i);
    globalThis.indexedDB.rows.set(pack.key, { ...pack, schema: 99 });
    await expect(readOfflineReferencePack({ userScope: 'user-a', projectId: 'project-a' })).rejects.toThrow(/unavailable/i);
  });

  it('classifies synchronous database-open and read-transaction exceptions as storage failures', async () => {
    const pack = buildOfflineReferencePack({
      userScope: 'user-a', project: { id: 'project-a', name: 'Project A' }, wir: fixture.wirs[0],
      downloadedAtDevice: '2026-09-20T14:00:00.000Z',
    });
    await expect(writeOfflineReferencePack(pack, { open() { throw new Error('open failed'); } })).rejects.toMatchObject({ code: 'storage' });
    await writeOfflineReferencePack(pack);
    globalThis.indexedDB.throwNextTransaction = true;
    await expect(readOfflineReferencePack({ userScope: 'user-a', projectId: 'project-a' })).rejects.toMatchObject({ code: 'storage' });
  });

  it('bounds long source text before persistence', () => {
    const pack = buildOfflineReferencePack({
      userScope: 'user-a', project: { id: 'project-a', name: 'Project A' },
      wir: { ...fixture.wirs[0], inspection_type: 'D'.repeat(900), location: 'L'.repeat(400) },
      downloadedAtDevice: '2026-09-20T14:00:00.000Z',
    });
    expect(pack.wir.description).toHaveLength(500);
    expect(pack.wir.location).toHaveLength(200);
    expect(JSON.stringify(pack).length).toBeLessThanOrEqual(4096);
  });

  it('coalesces duplicate download activation into one required read pair', async () => {
    const pending = deferred();
    let calls = 0;
    fixture.listImpl = () => (++calls === 1 ? Promise.resolve(fixture.wirs) : pending.promise);
    renderPack();
    fireEvent.change(await screen.findByLabelText('Reference WIR'), { target: { value: 'wir-a' } });
    vi.mocked(getProject).mockClear();
    const button = screen.getByRole('button', { name: 'Download for offline' });
    act(() => { button.click(); button.click(); });
    expect(getProject).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(fixture.wirs));
  });

  it('does not unlock a persisted pack after unmount or a cold-style remount', async () => {
    const user = userEvent.setup();
    const first = renderPack();
    await user.selectOptions(await screen.findByLabelText('Reference WIR'), 'wir-a');
    await user.click(screen.getByRole('button', { name: 'Download for offline' }));
    expect(await screen.findByText(/available on this screen/i)).toBeTruthy();
    first.unmount();

    renderPack();
    expect(document.querySelector('[data-offline-reference-pack]')).toHaveAttribute('data-state', 'loading');
    await screen.findByLabelText('Reference WIR');
    expect(document.querySelector('[data-offline-reference-pack]')).toHaveAttribute('data-state', 'not-downloaded');
    expect(document.body.textContent).not.toMatch(/available on this screen/i);
  });

  it('fails closed when project or selected WIR identity does not match the captured scope', async () => {
    fixture.projectResult = { id: 'project-b', name: 'Project B' };
    const user = userEvent.setup();
    renderPack();
    await user.selectOptions(await screen.findByLabelText('Reference WIR'), 'wir-a');
    await user.click(screen.getByRole('button', { name: 'Download for offline' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(globalThis.indexedDB.rows.size).toBe(0);
  });

  it('renders concise Arabic states and remains within the viewport at the required widths', async () => {
    const widths = [360, 768, 1023, 1280];
    for (const width of widths) {
      cleanup();
      Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: width });
      const view = render(<OfflineReferencePack isAuthenticated userId="user-a" projectId="project-a"
        t={{ offlineReferenceTitle: 'مرجع دون اتصال', offlineReferenceDownload: 'تنزيل للاستخدام دون اتصال', offlineReferenceChoose: 'طلب الفحص المرجعي' }} lang="ar" />);
      expect(view.container.querySelector('[dir="rtl"]')).toBeTruthy();
      expect(screen.getByText('مرجع دون اتصال')).toBeTruthy();
      expect(view.container.querySelector('[data-offline-reference-pack]').scrollWidth).toBeLessThanOrEqual(width);
      await act(async () => {});
    }
  });
});

describe('MOB-O1.2 live Work user-identity lifetime', () => {
  const liveRow = (user, description, projectId = 'project-a') => ({
    id: `wir-${user}`,
    project_id: projectId,
    wir_number: `WIR-${user.toUpperCase()}`,
    inspection_type: description,
    location: `Zone ${user.toUpperCase()}`,
    zone: user,
    level: 'L1',
    result: 'pending',
    work_item_id: `work-${user}`,
  });
  const setUser = (id) => {
    fixture.user = { id, email: `${id}@example.test`, user_metadata: { full_name: id.toUpperCase() } };
  };
  const observedShell = (onCommit, strict = false) => {
    const shell = <CommitObserver onCommit={onCommit}><AppShell /></CommitObserver>;
    return strict ? <StrictMode>{shell}</StrictMode> : shell;
  };
  const workState = () => document.querySelector('[data-work-read-state]');

  it('removes A rows and A reference on the first same-project B commit, then renders B rows', async () => {
    const rowA = liveRow('a', 'USER A LIVE ROW');
    const rowB = liveRow('b', 'USER B LIVE ROW');
    const pendingB = deferred();
    fixture.wirs = [rowA];
    fixture.listImpl = () => fixture.user.id === 'user-a' ? Promise.resolve([rowA]) : pendingB.promise;
    const commits = [];
    const view = render(observedShell((copy) => commits.push(copy), true));
    expect(await screen.findByText(/USER A LIVE ROW/)).toBeTruthy();

    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText(T.en.offlineReferenceChoose), 'wir-a');
    await user.click(screen.getByRole('button', { name: T.en.offlineReferenceDownload }));
    await waitFor(() => expect(document.querySelector('[data-offline-reference-record]')).toHaveTextContent('USER A LIVE ROW'));
    commits.length = 0;

    setUser('user-b');
    view.rerender(observedShell((copy) => commits.push(copy), true));
    expect(commits).not.toHaveLength(0);
    expect(commits[0]).not.toContain('USER A LIVE ROW');
    expect(workState()).toHaveAttribute('data-work-read-state', 'loading');
    expect(document.querySelector('[data-offline-reference-record]')).toBeNull();

    await act(async () => pendingB.resolve([rowB]));
    expect(await screen.findByText(/USER B LIVE ROW/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('USER A LIVE ROW');
  });

  it('drops a late A result after B becomes current in the same project', async () => {
    const pendingA = deferred();
    const rowA = liveRow('a', 'LATE USER A ROW');
    const rowB = liveRow('b', 'USER B CURRENT ROW');
    fixture.listImpl = () => fixture.user.id === 'user-a' ? pendingA.promise : Promise.resolve([rowB]);
    const commits = [];
    const view = render(observedShell((copy) => commits.push(copy)));
    expect(workState()).toHaveAttribute('data-work-read-state', 'loading');
    commits.length = 0;

    setUser('user-b');
    view.rerender(observedShell((copy) => commits.push(copy)));
    expect(commits[0]).not.toContain('LATE USER A ROW');
    expect(await screen.findByText(/USER B CURRENT ROW/)).toBeTruthy();

    await act(async () => pendingA.resolve([rowA]));
    expect(document.body.textContent).toContain('USER B CURRENT ROW');
    expect(document.body.textContent).not.toContain('LATE USER A ROW');
  });

  it('does not present A error as B state and allows B successful empty', async () => {
    fixture.listImpl = () => fixture.user.id === 'user-a'
      ? Promise.reject(new Error('A source failed'))
      : Promise.resolve([]);
    const commits = [];
    const view = render(observedShell((copy) => commits.push(copy)));
    expect(await within(workState()).findByRole('alert')).toHaveTextContent(T.en.workReadError);
    commits.length = 0;

    setUser('user-b');
    view.rerender(observedShell((copy) => commits.push(copy)));
    expect(commits[0]).not.toContain(T.en.workReadError);
    expect(workState()).toHaveAttribute('data-work-read-state', 'loading');
    await waitFor(() => expect(workState()).toHaveAttribute('data-work-read-state', 'empty'));
    expect(screen.getByText(T.en.fmNoWorkYet)).toBeTruthy();
  });

  it('keeps B error retry read-only and deduplicated after A rows are invalidated', async () => {
    const rowA = liveRow('a', 'USER A BEFORE B ERROR');
    const rowB = liveRow('b', 'USER B AFTER RETRY');
    const retryB = deferred();
    let bMode = 'error';
    let bCalls = 0;
    fixture.listImpl = () => {
      if (fixture.user.id === 'user-a') return Promise.resolve([rowA]);
      bCalls += 1;
      return bMode === 'error' ? Promise.reject(new Error('B source failed')) : retryB.promise;
    };
    const view = render(<AppShell />);
    expect(await screen.findByText(/USER A BEFORE B ERROR/)).toBeTruthy();

    setUser('user-b');
    view.rerender(<AppShell />);
    const work = workState();
    expect(await within(work).findByRole('alert')).toHaveTextContent(T.en.workReadError);
    expect(document.body.textContent).not.toContain('USER A BEFORE B ERROR');
    const callsBeforeRetry = bCalls;
    bMode = 'retry';
    const retry = within(work).getByRole('button', { name: T.en.tryAgain });
    act(() => { retry.click(); retry.click(); });
    expect(bCalls).toBe(callsBeforeRetry + 1);
    expect(within(work).getByRole('alert')).toHaveAttribute('aria-busy', 'true');

    await act(async () => retryB.resolve([rowB]));
    expect(await screen.findByText(/USER B AFTER RETRY/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('USER A BEFORE B ERROR');
    expect(globalThis.indexedDB.rows.size).toBe(0);
  });

  it('A to B to A uses fresh lifecycle reads instead of reviving hidden rows', async () => {
    const oldA = liveRow('a', 'USER A OLD ROW');
    const freshA = liveRow('a-fresh', 'USER A FRESH ROW');
    const rowB = liveRow('b', 'USER B MIDDLE ROW');
    let aVersion = 'old';
    fixture.listImpl = () => fixture.user.id === 'user-b'
      ? Promise.resolve([rowB])
      : Promise.resolve([aVersion === 'old' ? oldA : freshA]);
    const commits = [];
    const view = render(observedShell((copy) => commits.push(copy)));
    expect(await screen.findByText(/USER A OLD ROW/)).toBeTruthy();

    setUser('user-b');
    view.rerender(observedShell((copy) => commits.push(copy)));
    expect(await screen.findByText(/USER B MIDDLE ROW/)).toBeTruthy();
    commits.length = 0;
    aVersion = 'fresh';
    setUser('user-a');
    view.rerender(observedShell((copy) => commits.push(copy)));
    expect(commits[0]).not.toContain('USER B MIDDLE ROW');
    expect(commits[0]).not.toContain('USER A OLD ROW');
    expect(await screen.findByText(/USER A FRESH ROW/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('USER A OLD ROW');
  });

  it('does not restart Work when only metadata on the same authenticated user changes', async () => {
    const rowA = liveRow('a', 'USER A STABLE ROW');
    fixture.listImpl = () => Promise.resolve([rowA]);
    const view = render(<AppShell />);
    expect(await screen.findByText(/USER A STABLE ROW/)).toBeTruthy();
    const readsBeforeMetadataChange = vi.mocked(listWirs).mock.calls.length;

    fixture.user = {
      id: 'user-a',
      email: 'renamed@example.test',
      user_metadata: { full_name: 'Renamed User A' },
    };
    view.rerender(<AppShell />);
    await act(async () => {});

    expect(screen.getByText(/USER A STABLE ROW/)).toBeTruthy();
    expect(vi.mocked(listWirs)).toHaveBeenCalledTimes(readsBeforeMetadataChange);
  });
});
