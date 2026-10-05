import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { webcrypto } from 'node:crypto';
import { CaptureSheet } from './CaptureSheet.jsx';
import { LocalDraftCapture } from './LocalDraftCapture.jsx';
import { setCurrentProjectId } from '../../lib/currentProject.js';
import { buildLocalDraft, readLocalDraft, writeLocalDraft, discardLocalDraft, validateLocalDraft } from '../../lib/localFieldDrafts.js';
import { buildOfflineReferencePack, writeOfflineReferencePack, readOfflineReferencePack } from '../../lib/offlineReferencePack.js';

const fixture = vi.hoisted(() => ({ user: { id: 'user-a' }, authenticated: true, list: vi.fn(), upload: vi.fn() }));
vi.mock('../../lib/auth.jsx', () => ({ useAuth: () => ({ user: fixture.user, isAuthenticated: fixture.authenticated && !!fixture.user }) }));
vi.mock('../../lib/project.jsx', () => ({ useProject: () => ({ project: { name: 'Project A' } }) }));
vi.mock('../../api/wirs.js', () => ({ listWirs: (...args) => fixture.list(...args) }));
vi.mock('../../lib/attachments.js', () => ({ uploadAttachment: (...args) => fixture.upload(...args) }));

beforeEach(() => {
  fixture.user = { id: 'user-a' };
  fixture.authenticated = true;
  fixture.list.mockReset().mockResolvedValue([{ id: 'w1', project_id: 'p1', wir_number: 'WIR-ONE' }]);
  fixture.upload.mockReset();
  setCurrentProjectId('p1');
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('indexedDB', transactionModel());
});
afterEach(() => { expect(fixture.upload).not.toHaveBeenCalled(); cleanup(); vi.unstubAllGlobals(); });

const scope = { ownerUserScope: 'user-a', projectId: 'p1', targetWirId: 'w1' };
const key = (s = scope) => JSON.stringify([s.ownerUserScope, s.projectId, s.targetWirId]);
const rows = () => indexedDB.databases.get('bimqc-local-field-drafts').get('drafts');
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { resolve, promise }; }
// Transaction model for unit failure injection only. Browser acceptance uses
// native IndexedDB and independent byte hashes, not this model as durability proof.
function transactionModel() {
  const api = { databases: new Map(), failWrite: false, failCommit: false, failRead: false, throwPut: false, corruptReadback: false, nextReadGate: null, beforeCommit: null };
  const clone = (v) => v instanceof Blob ? v.slice(0, v.size, v.type) : Array.isArray(v) ? v.map(clone) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v;
  api.open = (name) => {
    const request = {};
    queueMicrotask(() => {
      if (!api.databases.has(name)) api.databases.set(name, new Map());
      const stores = api.databases.get(name);
      request.result = {
        objectStoreNames: { contains: (store) => stores.has(store) },
        createObjectStore: (store) => stores.set(store, new Map()), close() {},
        transaction(storeName, mode) {
          const stored = stores.get(storeName);
          const staged = new Map();
          let aborted = false; let pending = 0; let settled = false;
          const tx = { abort() { if (settled) throw new Error('settled'); aborted = true; queueMicrotask(() => tx.onabort?.()); } };
          function commit() {
            if (aborted || settled || pending) return;
            if (mode === 'readwrite') {
              api.beforeCommit?.(tx); api.beforeCommit = null;
              if (aborted) return;
              if (api.failCommit) { api.failCommit = false; tx.abort(); return; }
              for (const [k, value] of staged) if (value === undefined) stored.delete(k); else stored.set(k, clone(value));
            }
            settled = true; tx.oncomplete?.();
          }
          function op(kind, k, value) {
            const req = {}; pending++;
            const gate = kind === 'get' && mode === 'readonly' ? api.nextReadGate : null;
            if (gate) api.nextReadGate = null;
            const perform = () => {
              if (aborted) return;
              if ((kind === 'put' && api.failWrite) || (kind === 'get' && api.failRead)) {
                api.failWrite = false; api.failRead = false; req.onerror?.(); tx.abort(); return;
              }
              if (kind === 'put') staged.set(k, clone(value));
              else if (kind === 'delete') staged.set(k, undefined);
              else {
                req.result = clone(staged.has(k) ? staged.get(k) : stored.get(k));
                if (api.corruptReadback && mode === 'readwrite') { api.corruptReadback = false; req.result.noteText = 'CORRUPTED'; }
              }
              pending--; req.onsuccess?.(); queueMicrotask(commit);
            };
            if (gate) gate.promise.then(perform); else queueMicrotask(perform);
            return req;
          }
          tx.objectStore = () => ({
            get: (k) => op('get', k), delete: (k) => op('delete', k),
            put(v) { if (api.throwPut) { api.throwPut = false; throw new Error('clone error'); } return op('put', v.key, v); },
          });
          return tx;
        },
      };
      request.onupgradeneeded?.(); request.onsuccess?.();
    });
    return request;
  };
  return api;
}

async function makeDraft(noteText = 'A PRIVATE NOTE', owner = scope) {
  const file = new File(['exact fixture bytes'], 'fixture.png', { type: 'image/png' });
  return buildLocalDraft(owner, { noteText, attachments: [{ localAttachmentId: 'attachment-1', filename: file.name, mimeType: file.type, size: file.size, fileAddedAtDevice: '2026-09-22T08:00:00.000Z', blob: file }] });
}
async function seed(note = 'A PRIVATE NOTE', owner = scope) { const draft = await makeDraft(note, owner); await writeLocalDraft(draft); return readLocalDraft(owner); }
async function openLocal() {
  const view = render(<CaptureSheet open onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Local draft' }));
  await screen.findByLabelText('Local note');
  return view;
}
function note(value) { fireEvent.change(screen.getByLabelText('Local note'), { target: { value } }); }
async function save() { fireEvent.click(screen.getByRole('button', { name: 'Save locally' })); await screen.findByText('Local draft saved in this browser.'); }

describe('MOB-O2 actual Capture local path', () => {
  it('opens an explicit local editor with a note and actual file input', async () => {
    render(<CaptureSheet open onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Local draft' }));
    await screen.findByLabelText('Local note');
    expect(document.querySelector('[data-local-library-input]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save locally' })).toBeTruthy();
  });

  it('R1/R2 saves text and two files, closes/reopens and remounts with exact persisted hashes', async () => {
    const view = await openLocal();
    note('A PRIVATE NOTE');
    fireEvent.change(document.querySelector('[data-local-library-input]'), { target: { files: [new File(['exact fixture bytes'], 'fixture.png', { type: 'image/png' }), new File(['second'], 'second.jpg', { type: 'image/jpeg' })] } });
    await save();
    const original = await readLocalDraft(scope);
    expect(original.attachments).toHaveLength(2);
    expect(original.attachments[0].sha256).toBe((await makeDraft()).attachments[0].sha256);
    expect(original.attachments[0]).toMatchObject({ filename: 'fixture.png', mimeType: 'image/png', size: 19 });
    view.rerender(<CaptureSheet open={false} onClose={() => {}} />);
    view.rerender(<CaptureSheet open onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Local draft' }));
    expect(await screen.findByDisplayValue('A PRIVATE NOTE')).toBeTruthy();
    expect(screen.getByText('fixture.png')).toBeTruthy();
    view.unmount();
    await openLocal();
    expect(screen.getByLabelText('Local note').value).toBe('A PRIVATE NOTE');
    expect((await readLocalDraft(scope)).attachments.map((a) => a.sha256)).toEqual(original.attachments.map((a) => a.sha256));
  });

  it('R3/sign-out/retained-user unresolved auth gate the first committed frame without deleting persisted bytes', async () => {
    await seed();
    const snapshots = [];
    function Probe({ tick }) { useLayoutEffect(() => { snapshots.push(document.querySelector('[data-local-note]')?.value || ''); }, [tick]); return <LocalDraftCapture />; }
    const view = render(<Probe tick={0} />);
    await screen.findByDisplayValue('A PRIVATE NOTE');
    fixture.authenticated = false;
    view.rerender(<Probe tick={0.5} />);
    expect(snapshots.at(-1)).toBe('');
    await act(async () => {});
    expect(screen.queryByLabelText('Local note')).toBeNull();
    fixture.authenticated = true;
    view.rerender(<Probe tick={0.75} />);
    await screen.findByDisplayValue('A PRIVATE NOTE');
    fixture.user = { id: 'user-b' };
    view.rerender(<Probe tick={1} />);
    expect(snapshots.at(-1)).toBe('');
    expect(screen.queryByDisplayValue('A PRIVATE NOTE')).toBeNull();
    await screen.findByLabelText('Local note');
    fixture.user = { id: 'user-a' }; fixture.authenticated = false;
    view.rerender(<Probe tick={2} />);
    expect(snapshots.at(-1)).toBe('');
    expect(screen.queryByLabelText('Local note')).toBeNull();
    fixture.user = null; view.rerender(<Probe tick={3} />);
    expect(screen.queryByLabelText('Local note')).toBeNull();
    expect((await readLocalDraft(scope)).noteText).toBe('A PRIVATE NOTE');
    fixture.user = { id: 'user-a' }; fixture.authenticated = true;
    view.rerender(<Probe tick={4} />);
    expect(snapshots.at(-1)).toBe('');
    await screen.findByDisplayValue('A PRIVATE NOTE');
  });

  it('R4 switches project without showing prior draft and leaves stored A intact', async () => {
    await seed(); await openLocal();
    fixture.list.mockResolvedValue([{ id: 'w1', project_id: 'p2', wir_number: 'WIR-P2' }]);
    act(() => setCurrentProjectId('p2'));
    expect(screen.queryByDisplayValue('A PRIVATE NOTE')).toBeNull();
    await screen.findByLabelText('Local note');
    expect(screen.getByLabelText('Local note').value).toBe('');
    expect((await readLocalDraft(scope)).noteText).toBe('A PRIVATE NOTE');
  });

  it('R5 target switch uses only exact IDs and reopens distinct records', async () => {
    await seed(); await seed('W2 PRIVATE NOTE', { ...scope, targetWirId: 'w2' });
    fixture.list.mockResolvedValue([{ id: 'w1', project_id: 'p1', wir_number: 'SAME LABEL' }, { id: 'w2', project_id: 'p1', wir_number: 'SAME LABEL' }]);
    await openLocal();
    fireEvent.change(screen.getByLabelText('Existing inspection'), { target: { value: 'w2' } });
    expect(screen.queryByDisplayValue('A PRIVATE NOTE')).toBeNull();
    await screen.findByDisplayValue('W2 PRIVATE NOTE');
    fireEvent.change(screen.getByLabelText('Existing inspection'), { target: { value: 'w1' } });
    expect(screen.queryByDisplayValue('W2 PRIVATE NOTE')).toBeNull();
    await screen.findByDisplayValue('A PRIVATE NOTE');
    // Editor state never crosses a target boundary: a discard confirmation opened for W1 must not survive into W2's scope,
    // and W1's unsaved edit must not appear under W2.
    note('W1 UNSAVED EDIT');
    fireEvent.click(screen.getByRole('button', { name: 'Discard local draft' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Existing inspection'), { target: { value: 'w2' } });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByDisplayValue('W1 UNSAVED EDIT')).toBeNull();
    await screen.findByDisplayValue('W2 PRIVATE NOTE');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect((await readLocalDraft(scope)).noteText).toBe('A PRIVATE NOTE');
  });

  it('R6 failed save after removing an attachment preserves old-good note and bytes', async () => {
    const original = await seed(); await openLocal();
    note('REPLACEMENT');
    fireEvent.click(screen.getByRole('button', { name: 'Remove: fixture.png' }));
    indexedDB.failCommit = true;
    fireEvent.click(screen.getByRole('button', { name: 'Save locally' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Local note').value).toBe('REPLACEMENT');
    expect(screen.getByText('Unsaved changes. Save locally before closing.')).toBeTruthy();       // the UI does not adopt the failed replacement as known-good
    expect(document.body.textContent).toContain(original.updatedAtDevice);                        // known-good metadata still shown
    expect(await readLocalDraft(scope)).toEqual(original);
  });

  it('R7 discard requires confirmation, deletes only this target and leaves O1 pack unchanged', async () => {
    await seed(); await seed('W2', { ...scope, targetWirId: 'w2' });
    const pack = buildOfflineReferencePack({ userScope: 'user-a', project: { id: 'p1', name: 'Project' }, wir: { id: 'w1', project_id: 'p1' } });
    await writeOfflineReferencePack(pack);
    await openLocal();
    fireEvent.click(screen.getByRole('button', { name: 'Discard local draft' }));
    expect(await readLocalDraft(scope)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Keep draft' }));
    expect(await readLocalDraft(scope)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Discard local draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard from this browser' }));
    await waitFor(() => expect(screen.getByLabelText('Local note').value).toBe(''));
    expect(await readLocalDraft(scope)).toBeNull();
    expect((await readLocalDraft({ ...scope, targetWirId: 'w2' })).noteText).toBe('W2');
    expect(await readOfflineReferencePack({ userScope: 'user-a', projectId: 'p1' })).toEqual(pack);
  });

  it('late A read cannot populate B or a later A lifetime', async () => {
    await seed(); const gate = deferred(); indexedDB.nextReadGate = gate;
    const view = render(<LocalDraftCapture />);
    await waitFor(() => expect(indexedDB.nextReadGate).toBeNull());
    fixture.user = { id: 'user-b' }; view.rerender(<LocalDraftCapture />);
    await screen.findByLabelText('Local note');
    expect(screen.getByLabelText('Local note').value).toBe('');
    fixture.user = { id: 'user-a' }; view.rerender(<LocalDraftCapture />);
    await screen.findByDisplayValue('A PRIVATE NOTE');
    note('NEW A EDIT');
    await act(async () => gate.resolve());
    expect(screen.getByLabelText('Local note').value).toBe('NEW A EDIT');
  });

  it('does not reuse stale target inventory after identity changes', async () => {
    const gate = deferred(); fixture.list.mockReturnValueOnce(gate.promise);
    const view = render(<LocalDraftCapture />);
    fixture.user = { id: 'user-b' }; fixture.list.mockResolvedValue([]);
    view.rerender(<LocalDraftCapture />);
    await screen.findByText('No known inspections for this project.');
    await act(async () => gate.resolve([{ id: 'w1', project_id: 'p1', wir_number: 'A MARKER' }]));
    expect(screen.queryByText('A MARKER')).toBeNull();
    expect(screen.queryByLabelText('Local note')).toBeNull();
  });

  it('double Save keeps one stable draft and editing retains creation time', async () => {
    const original = await seed(); await openLocal(); note('EDITED');
    fireEvent.click(screen.getByRole('button', { name: 'Save locally' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save locally' }));
    await screen.findByText('Local draft saved in this browser.');
    const saved = await readLocalDraft(scope);
    expect(rows().size).toBe(1); expect(saved.localDraftId).toBe(original.localDraftId);
    expect(saved.createdAtDevice).toBe(original.createdAtDevice); expect(saved.noteText).toBe('EDITED');
  });

  it('fails closed for mismatched target project and surfaces genuine read failure', async () => {
    fixture.list.mockResolvedValue([{ id: 'w1', project_id: 'wrong' }]);
    const view = render(<LocalDraftCapture />);
    await screen.findByText('No known inspections for this project.');
    expect(screen.queryByLabelText('Local note')).toBeNull();
    view.unmount(); fixture.list.mockRejectedValue(new Error('offline'));
    render(<LocalDraftCapture />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn’t check/);
    expect(screen.queryByLabelText('Local note')).toBeNull();
  });

  it('copy truth: persistence is claimed for this browser only — never device-wide, submitted, synced or uploaded', async () => {
    await seed(); const view = render(<CaptureSheet open onClose={() => {}} />);
    expect(screen.getByText('Notes and photos saved in this browser only.')).toBeTruthy();          // entry-step hint, before opening
    fireEvent.click(screen.getByRole('button', { name: 'Local draft' }));
    expect(await screen.findByText('Local draft saved in this browser.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Discard local draft' }));
    expect(screen.getByRole('button', { name: 'Discard from this browser' })).toBeTruthy();
    const panel = document.querySelector('[data-local-draft-panel]').textContent;
    expect(panel).not.toMatch(/this device|on the device|Submit|Sync|Upload|Server accepted|encrypted|securely|locked/i);   // positive claims only; the limits text truthfully says no encryption is provided
    expect(panel).toMatch(/Server evidence and downloaded reference packs are unchanged/);
    expect(document.querySelector('[data-local-draft-panel] details').textContent).toMatch(/Safari\/iOS.*unproven/);
    view.unmount(); render(<LocalDraftCapture lang="ar" />);
    await screen.findByLabelText('ملاحظة محلية');
    const ar = document.querySelector('[data-local-draft-panel]').textContent;
    expect(ar).toMatch(/هذا المتصفح/); expect(ar).not.toMatch(/هذا الجهاز|مزامنة|إرسال|رفع/);
  });

  it('Arabic local copy uses RTL, 48px actions, device-time labels and no submission state', async () => {
    await seed(); render(<LocalDraftCapture lang="ar" />);
    await screen.findByLabelText('ملاحظة محلية');
    expect(document.querySelector('[data-local-draft-panel]').getAttribute('dir')).toBe('rtl');
    for (const button of screen.getAllByRole('button')) expect(parseFloat(button.style.minHeight)).toBeGreaterThanOrEqual(48);
    expect(document.body.textContent).toContain('إضافة الملف (وقت الجهاز)');
    expect(document.body.textContent).not.toMatch(/SYNCING|SUBMITTED|UPLOADING|captured at/i);
  });

  it('changing language preserves unsaved text and selected files', async () => {
    const view = render(<LocalDraftCapture />);
    await screen.findByLabelText('Local note'); note('UNSAVED LANGUAGE EDIT');
    fireEvent.change(document.querySelector('[data-local-library-input]'), { target: { files: [new File(['new'], 'new.png', { type: 'image/png' })] } });
    view.rerender(<LocalDraftCapture lang="ar" />);
    await act(async () => {});
    expect(screen.getByLabelText('ملاحظة محلية').value).toBe('UNSAVED LANGUAGE EDIT');
    expect(screen.getByText('new.png')).toBeTruthy();
  });

  it('identity change while preparing a save cannot commit or render that replacement', async () => {
    const original = await seed();
    const view = render(<LocalDraftCapture />);
    await screen.findByDisplayValue('A PRIVATE NOTE'); note('LATE REPLACEMENT');
    const gate = deferred();
    const digest = webcrypto.subtle.digest.bind(webcrypto.subtle);
    vi.stubGlobal('crypto', { randomUUID: webcrypto.randomUUID.bind(webcrypto), subtle: { digest: async (...args) => { await gate.promise; return digest(...args); } } });
    fireEvent.click(screen.getByRole('button', { name: 'Save locally' }));
    fixture.user = { id: 'user-b' }; view.rerender(<LocalDraftCapture />);
    expect(screen.queryByDisplayValue('LATE REPLACEMENT')).toBeNull();
    await act(async () => gate.resolve());
    await screen.findByLabelText('Local note');
    expect(screen.getByLabelText('Local note').value).toBe('');
    expect(await readLocalDraft(scope)).toEqual(original);
  });

  it('note-only save works and closing unsaved edits keeps the prior saved version', async () => {
    const view = await openLocal(); note('NOTE ONLY'); await save();
    expect((await readLocalDraft(scope)).attachments).toEqual([]);
    note('UNSAVED'); view.unmount(); await openLocal();
    expect(screen.getByLabelText('Local note').value).toBe('NOTE ONLY');
  });

  it('rejects invalid file selection truthfully without removing existing attachments', async () => {
    await seed(); await openLocal();
    fireEvent.change(document.querySelector('[data-local-library-input]'), { target: { files: [new File(['x'], 'not-photo.txt', { type: 'text/plain' })] } });
    expect((await screen.findByRole('alert')).textContent).toMatch(/25 MB/);
    expect(screen.getByText('fixture.png')).toBeTruthy();
    const large = new File(['x'], 'large.png', { type: 'image/png' });
    Object.defineProperty(large, 'size', { value: 25 * 1024 * 1024 + 1 });
    fireEvent.change(document.querySelector('[data-local-library-input]'), { target: { files: [large] } });
    expect(screen.getByText('fixture.png')).toBeTruthy();
    expect(screen.getByLabelText('Local note').maxLength).toBe(10000);
  });

  it('failed confirmed discard leaves prior content and permits retry', async () => {
    const original = await seed(); await openLocal(); indexedDB.failCommit = true;
    fireEvent.click(screen.getByRole('button', { name: 'Discard local draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard from this browser' }));
    await screen.findByRole('alert');
    expect(await readLocalDraft(scope)).toEqual(original);
    fireEvent.click(screen.getByRole('button', { name: 'Discard from this browser' }));
    await waitFor(() => expect(screen.getByLabelText('Local note').value).toBe(''));
    expect(await readLocalDraft(scope)).toBeNull();
  });
});

describe('MOB-O2 local transaction and schema boundaries', () => {
  it.each(['failWrite', 'failCommit', 'throwPut', 'corruptReadback'])('%s replacement leaves previous complete draft intact', async (failure) => {
    const original = await seed(); const replacement = await makeDraft('REPLACEMENT');
    indexedDB[failure] = true;
    await expect(writeLocalDraft(replacement)).rejects.toThrow();
    expect(await readLocalDraft(scope)).toEqual(original);
  });
  it('aborting at commit boundary preserves prior note and files', async () => {
    const original = await seed(); const controller = new AbortController();
    indexedDB.beforeCommit = () => controller.abort();
    await expect(writeLocalDraft(await makeDraft('REPLACEMENT'), indexedDB, { signal: controller.signal })).rejects.toMatchObject({ code: 'stale' });
    expect(await readLocalDraft(scope)).toEqual(original);
  });
  it('preaborted save and discard preserve previous persisted record', async () => {
    const original = await seed(); const controller = new AbortController(); controller.abort();
    await expect(writeLocalDraft(original, indexedDB, { signal: controller.signal })).rejects.toThrow();
    await expect(discardLocalDraft(scope, indexedDB, { signal: controller.signal })).rejects.toThrow();
    expect(await readLocalDraft(scope)).toEqual(original);
  });
  it.each(['schema', 'missing-bytes', 'same-size-corrupt'])('%s persisted record fails closed with explicit local error', async (kind) => {
    await seed(); const record = rows().get(key());
    if (kind === 'schema') record.schemaVersion = 9;
    if (kind === 'missing-bytes') delete record.attachments[0].blob;
    if (kind === 'same-size-corrupt') record.attachments[0].blob = new Blob(['x'.repeat(record.attachments[0].size)], { type: 'image/png' });
    await expect(readLocalDraft(scope)).rejects.toMatchObject({ code: 'schema' });
    render(<LocalDraftCapture />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/Local storage error/);
    expect(screen.queryByLabelText('Local note')).toBeNull();
  });
  it('rejects undeclared fields, duplicate attachments, mismatched scope and missing IDs', async () => {
    const draft = await makeDraft();
    expect(() => validateLocalDraft({ ...draft, token: 'forbidden' }, scope)).toThrow();
    expect(() => validateLocalDraft({ ...draft, attachments: [draft.attachments[0], draft.attachments[0]] }, scope)).toThrow();
    for (const field of ['ownerUserScope', 'projectId', 'targetWirId']) {
      expect(() => validateLocalDraft(draft, { ...scope, [field]: 'other' })).toThrow();
      expect(() => validateLocalDraft(draft, { ...scope, [field]: '' })).toThrow();
    }
  });
  it('review P3: a selected image whose name has leading or trailing spaces saves and round-trips with its exact name', async () => {
    for (const filename of [' photo.png', 'photo.png ', '  two spaces.jpg  ']) {
      const file = new File(['bytes'], filename, { type: 'image/png' });
      const draft = await buildLocalDraft(scope, { noteText: '', attachments: [{ localAttachmentId: `id-${filename.length}`, filename: file.name, mimeType: file.type, size: file.size, fileAddedAtDevice: '2026-09-22T08:00:00.000Z', blob: file }] });
      expect(draft.attachments[0].filename).toBe(filename);
      await writeLocalDraft(draft);
      expect((await readLocalDraft(scope)).attachments[0].filename).toBe(filename);            // preserved exactly, never trimmed
    }
  });
  it('review P3: empty and oversized filenames still fail closed, and scope fields are still strictly validated', async () => {
    const attachment = (filename) => ({ localAttachmentId: 'id-1', filename, mimeType: 'image/png', size: 5, fileAddedAtDevice: '2026-09-22T08:00:00.000Z', blob: new File(['bytes'], 'x.png', { type: 'image/png' }) });
    for (const filename of ['', 'x'.repeat(1001), 42, null]) {
      await expect(buildLocalDraft(scope, { noteText: '', attachments: [attachment(filename)] }), String(filename).slice(0, 12)).rejects.toMatchObject({ code: 'schema' });
    }
    const ok = await buildLocalDraft(scope, { noteText: '', attachments: [attachment('x'.repeat(1000))] });
    expect(ok.attachments[0].filename).toHaveLength(1000);
    const draft = await makeDraft();
    for (const field of ['ownerUserScope', 'projectId', 'targetWirId']) {
      expect(() => validateLocalDraft(draft, { ...scope, [field]: ` ${scope[field]}` }), field).toThrow();      // scope identity is never trimmed into a match
      expect(() => validateLocalDraft(draft, { ...scope, [field]: `${scope[field]} ` }), field).toThrow();
    }
    expect(() => validateLocalDraft({ ...draft, attachments: [{ ...draft.attachments[0], localAttachmentId: ' attachment-1' }] }, scope)).toThrow();
  });
  it('review P3: saving from the actual local editor with a leading-space filename succeeds and shows the exact name', async () => {
    await openLocal();
    fireEvent.change(document.querySelector('[data-local-library-input]'), { target: { files: [new File(['exact fixture bytes'], ' photo.png', { type: 'image/png' })] } });
    expect(screen.queryByRole('alert')).toBeNull();
    await save();
    const saved = await readLocalDraft(scope);
    expect(saved.attachments).toHaveLength(1);
    expect(saved.attachments[0].filename).toBe(' photo.png');
    expect(document.querySelector('[data-local-draft-panel] li').textContent.startsWith(' photo.png')).toBe(true);
  });

  it('absent record is empty, unavailable IndexedDB is an explicit failure', async () => {
    expect(await readLocalDraft(scope)).toBeNull();
    await expect(readLocalDraft(scope, {})).rejects.toMatchObject({ code: 'storage' });
  });
});
