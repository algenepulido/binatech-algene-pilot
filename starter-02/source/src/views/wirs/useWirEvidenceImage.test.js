// ============================================================
// EVIDENCE-IMG-1B — WIR Evidence tab image flow (hook state machine).
//
// Contract (owner's nine-section authorization, internal acceptance record):
//   one image preparation → review → EXPLICIT confirm → upload flow on the
//   opened WIR; 3,000,000-byte inclusive cap via the 1A primitive; a failed
//   preparation never falls back to uploading the original; the exact
//   reviewed candidate object is what the existing upload caller receives
//   (a Blob result becomes a byte-identical named File BEFORE preview, and is
//   never recreated after confirmation); original/prepared bytes and a
//   non-cropped preview are exposed; selection / WIR / project / session /
//   close invalidate pending results and release object URLs; a synchronous
//   in-flight guard prevents duplicate submits; reviewed context is frozen
//   and stale work is rejected; a confirmed upload followed by a failed list
//   refresh never offers the upload again (retry refresh ≠ retry upload).
// ============================================================
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';

const doubles = vi.hoisted(() => ({ prepare: vi.fn(), upload: vi.fn() }));
vi.mock('../../lib/evidenceImagePreparation.js', () => ({
  prepareEvidenceImage: (...a) => doubles.prepare(...a),
  MAX_EVIDENCE_IMAGE_BYTES: 3_000_000,
}));
vi.mock('../../lib/attachments.js', () => ({ uploadAttachment: (...a) => doubles.upload(...a) }));

import { useWirEvidenceImage, isEvidenceImageFile } from './useWirEvidenceImage.js';

const deferred = () => { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };
const jpeg = (name = 'pour.jpg', bytes = 'jpeg-bytes') => new File([bytes], name, { type: 'image/jpeg', lastModified: 1_700_000_000_000 });
const meta = (file, extra = {}) => ({ originalBytes: file.size, resultBytes: file.size, originalMime: 'image/jpeg', actualMime: 'image/jpeg', originalWidth: 800, originalHeight: 600, width: 800, height: 600, hasAlpha: false, transformed: false, operations: [], attempts: 0, ...extra });
const okUnchanged = (file) => ({ ok: true, candidate: file, metadata: meta(file) });
const bytesOf = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result)); r.onerror = rej; r.readAsArrayBuffer(blob); });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
// The reviewer must actually SEE the candidate: the view reports the exact preview's load.
const seen = (result, width = 800) => act(() => { result.current.previewLoaded(result.current.previewUrl, width); });
const confirmSeen = async (result) => { seen(result); await act(async () => { await result.current.confirm(); }); };

const CTX = { active: true, wirId: 'wir-1', projectId: 'p-1', userId: 'u-1', docType: 'photo_evidence' };
let urls;
beforeEach(() => {
  urls = { created: [], revoked: [] };
  URL.createObjectURL = vi.fn((obj) => { const u = `blob:mock/${urls.created.length + 1}`; urls.created.push({ obj, u }); return u; });
  URL.revokeObjectURL = vi.fn((u) => urls.revoked.push(u));
  doubles.prepare.mockReset(); doubles.upload.mockReset();
  doubles.upload.mockImplementation(async () => ({ id: 'att-1' }));
});
afterEach(() => { delete URL.createObjectURL; delete URL.revokeObjectURL; });

function mount(overrides = {}) {
  const onUploaded = vi.fn(async () => {});
  const hook = renderHook((props) => useWirEvidenceImage(props), { initialProps: { ...CTX, onUploaded, ...overrides } });
  return { ...hook, onUploaded, props: { ...CTX, onUploaded, ...overrides } };
}

describe('routing — images take the review flow, documents keep the ordinary path', () => {
  it('isEvidenceImageFile: image/* MIME or .jpg/.jpeg/.png name → true; PDF and unknown → false', () => {
    expect(isEvidenceImageFile(new File(['x'], 'a.jpg', { type: 'image/jpeg' }))).toBe(true);
    expect(isEvidenceImageFile(new File(['x'], 'a.PNG', { type: '' }))).toBe(true);
    expect(isEvidenceImageFile(new File(['x'], 'a.heic', { type: 'image/heic' }))).toBe(true);   // still an image: 1A decides (UNSUPPORTED_TYPE), never the raw-upload path
    for (const name of ['a.gif', 'a.webp', 'IMG.HEIC', 'a.heif', 'a.bmp', 'a.tif', 'a.tiff', 'a.avif', 'a.svg', 'a.jfif']) expect(isEvidenceImageFile(new File(['x'], name, { type: '' }))).toBe(true);   // blank MIME, known image extension
    expect(isEvidenceImageFile(new File(['x'], 'a.pdf', { type: 'application/pdf' }))).toBe(false);
    expect(isEvidenceImageFile(new File(['x'], 'a.bin', { type: '' }))).toBe(false);
    expect(isEvidenceImageFile(null)).toBe(false);
  });
  it('select(pdf) returns false and touches neither the primitive nor the upload API', () => {
    const { result } = mount();
    let taken;
    act(() => { taken = result.current.select(new File(['%PDF'], 'report.pdf', { type: 'application/pdf' })); });
    expect(taken).toBe(false);
    expect(doubles.prepare).not.toHaveBeenCalled();
    expect(doubles.upload).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('idle');
  });
});

describe('prepare → review → explicit confirm → upload (exact candidate identity)', () => {
  it('an in-cap JPEG is reviewed as the SAME File object, uploads only on confirm, with the frozen WIR/docType', async () => {
    const file = jpeg();
    doubles.prepare.mockImplementation(async (f) => okUnchanged(f));
    const { result, onUploaded } = mount();
    let taken;
    act(() => { taken = result.current.select(file); });
    expect(taken).toBe(true);
    expect(result.current.phase).toBe('preparing');
    expect(result.current.fileName).toBe('pour.jpg');
    await flush();
    expect(result.current.phase).toBe('review');
    expect(result.current.candidate).toBe(file);                                   // exact object
    expect(result.current.previewUrl).toBe('blob:mock/1');
    expect(urls.created[0].obj).toBe(file);                                        // preview built from the candidate itself
    expect(result.current.metadata).toMatchObject({ originalBytes: file.size, resultBytes: file.size, width: 800, height: 600, transformed: false });
    expect(doubles.upload).not.toHaveBeenCalled();                                 // nothing uploads on selection
    await confirmSeen(result);
    expect(doubles.upload).toHaveBeenCalledTimes(1);
    const arg = doubles.upload.mock.calls[0][0];
    expect(arg).toMatchObject({ recordType: 'wir', recordId: 'wir-1', documentType: 'photo_evidence' });
    expect(arg.file).toBe(file);                                                   // identity at upload
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('done');
    expect(result.current.candidate).toBeNull();
    expect(urls.revoked).toEqual(['blob:mock/1']);                                 // object URL released after upload
  });
  it('a transformed Blob becomes a byte-identical named File BEFORE preview, and that same object is uploaded (never re-created)', async () => {
    const original = jpeg('IMG_0042.jpeg', 'x'.repeat(5000));
    const prepared = new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], { type: 'image/jpeg' });
    doubles.prepare.mockImplementation(async (f) => ({ ok: true, candidate: prepared, metadata: meta(f, { originalBytes: 5000, resultBytes: 8, width: 680, height: 510, transformed: true, operations: ['reencode', 'metadata-stripped', 'resize'], attempts: 2 }) }));
    const { result } = mount();
    act(() => { result.current.select(original); });
    await flush();
    const c = result.current.candidate;
    expect(c).toBeInstanceOf(File);
    expect(c).not.toBe(original);
    expect(c.name).toBe('IMG_0042.jpeg');
    expect(c.type).toBe('image/jpeg');
    expect(c.size).toBe(8);
    expect(c.lastModified).toBe(original.lastModified);
    expect(await bytesOf(c)).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));   // byte-identical to the primitive's result
    expect(urls.created[0].obj).toBe(c);                                           // preview is of the named candidate
    expect(result.current.metadata).toMatchObject({ originalBytes: 5000, resultBytes: 8, transformed: true });
    await confirmSeen(result);
    expect(doubles.upload.mock.calls[0][0].file).toBe(c);                          // identity: the reviewed object, not a re-wrap
    expect(doubles.prepare).toHaveBeenCalledTimes(1);
  });
  it('a failed preparation is reported by code and NEVER falls back to uploading the original', async () => {
    doubles.prepare.mockImplementation(async () => ({ ok: false, error: { code: 'CANNOT_MEET_SIZE_LIMIT' }, metadata: { originalBytes: 9 } }));
    const { result } = mount();
    act(() => { result.current.select(jpeg()); });
    await flush();
    expect(result.current.phase).toBe('failed');
    expect(result.current.code).toBe('CANNOT_MEET_SIZE_LIMIT');
    expect(result.current.candidate).toBeNull();
    await confirmSeen(result);
    await act(async () => { await result.current.retryUpload(); });
    expect(doubles.upload).not.toHaveBeenCalled();
    expect(urls.created).toHaveLength(0);
  });
  it('a primitive that throws is a failure too (no upload)', async () => {
    doubles.prepare.mockImplementation(async () => { throw new Error('boom'); });
    const { result } = mount();
    act(() => { result.current.select(jpeg()); });
    await flush();
    expect(result.current.phase).toBe('failed');
    expect(result.current.code).toBe('DECODE_FAILED');
    expect(doubles.upload).not.toHaveBeenCalled();
  });
});

describe('invalidation — selection, cancel, WIR/project/session/close', () => {
  it('A → B: A is aborted, its late success is ignored, only B is reviewed and uploaded', async () => {
    const a = jpeg('a.jpg'); const b = jpeg('b.jpg');
    const da = deferred(); const db = deferred(); const signals = [];
    doubles.prepare.mockImplementation((f, opts) => { signals.push(opts.signal); return f === a ? da.promise : db.promise; });
    const { result } = mount();
    act(() => { result.current.select(a); });
    act(() => { result.current.select(b); });
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    expect(result.current.fileName).toBe('b.jpg');
    await act(async () => { db.resolve(okUnchanged(b)); await db.promise; });
    expect(result.current.candidate).toBe(b);
    await act(async () => { da.resolve(okUnchanged(a)); await da.promise; });   // late A
    expect(result.current.candidate).toBe(b);                                   // still B
    expect(urls.created.map((x) => x.obj)).toEqual([b]);                        // no URL was ever made for A
    await confirmSeen(result);
    expect(doubles.upload).toHaveBeenCalledTimes(1);
    expect(doubles.upload.mock.calls[0][0].file).toBe(b);
  });
  it('cancel during preparation aborts the signal, ignores the late result and creates no URL', async () => {
    const d = deferred(); let signal;
    doubles.prepare.mockImplementation((f, opts) => { signal = opts.signal; return d.promise; });
    const { result } = mount();
    act(() => { result.current.select(jpeg()); });
    act(() => { result.current.cancel(); });
    expect(signal.aborted).toBe(true);
    expect(result.current.phase).toBe('idle');
    await act(async () => { d.resolve(okUnchanged(jpeg())); await d.promise; });
    expect(result.current.phase).toBe('idle');
    expect(urls.created).toHaveLength(0);
  });
  it.each([['wirId', 'wir-2'], ['projectId', 'p-2'], ['userId', 'u-2'], ['active', false]])('%s change during review discards the candidate, revokes the URL and makes confirm a no-op', async (key, value) => {
    doubles.prepare.mockImplementation(async (f) => okUnchanged(f));
    const { result, rerender, props } = mount();
    act(() => { result.current.select(jpeg()); });
    await flush();
    expect(result.current.phase).toBe('review');
    rerender({ ...props, [key]: value });
    expect(result.current.phase).toBe('idle');
    expect(result.current.candidate).toBeNull();
    expect(urls.revoked).toEqual(['blob:mock/1']);
    await confirmSeen(result);
    expect(doubles.upload).not.toHaveBeenCalled();
  });
  it('WIR change during preparation aborts it and ignores the late result', async () => {
    const d = deferred(); let signal;
    doubles.prepare.mockImplementation((f, opts) => { signal = opts.signal; return d.promise; });
    const { result, rerender, props } = mount();
    act(() => { result.current.select(jpeg()); });
    rerender({ ...props, wirId: 'wir-2' });
    expect(signal.aborted).toBe(true);
    await act(async () => { d.resolve(okUnchanged(jpeg())); await d.promise; });
    expect(result.current.phase).toBe('idle');
    expect(urls.created).toHaveLength(0);
  });
  it('a document type changed after review is stale work: confirm rejects it, releases the URL and uploads nothing', async () => {
    doubles.prepare.mockImplementation(async (f) => okUnchanged(f));
    const { result, rerender, props } = mount();
    act(() => { result.current.select(jpeg()); });
    await flush();
    rerender({ ...props, docType: 'test_report' });
    expect(result.current.phase).toBe('review');                                // docType alone does not cancel the review …
    await confirmSeen(result);
    expect(result.current.phase).toBe('stale');                                 // … but confirming against a changed context is refused
    expect(doubles.upload).not.toHaveBeenCalled();
    expect(result.current.candidate).toBeNull();
    expect(urls.revoked).toEqual(['blob:mock/1']);
  });
  it('unmount during review revokes the object URL', async () => {
    doubles.prepare.mockImplementation(async (f) => okUnchanged(f));
    const { result, unmount } = mount();
    act(() => { result.current.select(jpeg()); });
    await flush();
    unmount();
    expect(urls.revoked).toEqual(['blob:mock/1']);
  });
});

describe('submission — duplicate guard, upload failure, refresh failure', () => {
  it('two synchronous confirms produce exactly one upload', async () => {
    doubles.prepare.mockImplementation(async (f) => okUnchanged(f));
    const d = deferred(); doubles.upload.mockImplementation(() => d.promise);
    const { result } = mount();
    act(() => { result.current.select(jpeg()); });
    await flush();
    seen(result);
    let p1, p2;
    act(() => { p1 = result.current.confirm(); p2 = result.current.confirm(); });
    expect(doubles.upload).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('uploading');
    await act(async () => { d.resolve({ id: 'att-1' }); await p1; await p2; });
    expect(doubles.upload).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('done');
  });
  it('discard/cancel during an in-flight upload is ignored: the upload settles and is reported truthfully', async () => {
    doubles.prepare.mockImplementation(async (f) => okUnchanged(f));
    const d = deferred(); doubles.upload.mockImplementation(() => d.promise);
    const { result, onUploaded } = mount();
    act(() => { result.current.select(jpeg()); });
    await flush();
    seen(result);
    let p; act(() => { p = result.current.confirm(); });
    act(() => { result.current.discard(); result.current.cancel(); });
    expect(result.current.phase).toBe('uploading');                             // a submit in flight cannot be discarded
    expect(urls.revoked).toEqual([]);
    await act(async () => { d.resolve({ id: 'att-1' }); await p; });
    expect(result.current.phase).toBe('done');
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(urls.revoked).toEqual(['blob:mock/1']);
  });
  it('upload failure keeps the SAME candidate for retryUpload; nothing is re-prepared or re-encoded', async () => {
    const file = jpeg();
    doubles.prepare.mockImplementation(async (f) => okUnchanged(f));
    doubles.upload.mockImplementationOnce(async () => { throw new Error('storage: 503'); });
    const { result, onUploaded } = mount();
    act(() => { result.current.select(file); });
    await flush();
    await confirmSeen(result);
    expect(result.current.phase).toBe('upload-failed');
    expect(result.current.error).toBe('storage: 503');
    expect(result.current.candidate).toBe(file);
    expect(result.current.previewUrl).toBe('blob:mock/1');                      // still reviewable
    expect(onUploaded).not.toHaveBeenCalled();
    await act(async () => { await result.current.retryUpload(); });
    expect(doubles.upload).toHaveBeenCalledTimes(2);
    expect(doubles.upload.mock.calls[1][0].file).toBe(file);
    expect(doubles.prepare).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('done');
    expect(onUploaded).toHaveBeenCalledTimes(1);
  });
  it('confirmed upload + failed list refresh never offers the upload again: only retryRefresh is live', async () => {
    doubles.prepare.mockImplementation(async (f) => okUnchanged(f));
    const onUploaded = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(undefined);
    const { result } = mount({ onUploaded });
    act(() => { result.current.select(jpeg()); });
    await flush();
    await confirmSeen(result);
    expect(doubles.upload).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('refresh-failed');
    expect(result.current.error).toBe('network');
    expect(result.current.candidate).toBeNull();                                // nothing left to upload
    expect(urls.revoked).toEqual(['blob:mock/1']);
    await confirmSeen(result);
    await act(async () => { await result.current.retryUpload(); });
    expect(doubles.upload).toHaveBeenCalledTimes(1);                            // retrying the upload is impossible by construction
    await act(async () => { await result.current.retryRefresh(); });
    expect(onUploaded).toHaveBeenCalledTimes(2);
    expect(result.current.phase).toBe('done');
  });
  it('an upload that settles after the WIR changed is not reported as done for the new WIR and refreshes nothing', async () => {
    doubles.prepare.mockImplementation(async (f) => okUnchanged(f));
    const d = deferred(); doubles.upload.mockImplementation(() => d.promise);
    const { result, rerender, props, onUploaded } = mount();
    act(() => { result.current.select(jpeg()); });
    await flush();
    seen(result);
    let p; act(() => { p = result.current.confirm(); });
    rerender({ ...props, wirId: 'wir-2' });
    await act(async () => { d.resolve({ id: 'att-1' }); await p; });
    expect(result.current.phase).toBe('idle');
    expect(result.current.candidate).toBeNull();
    expect(onUploaded).not.toHaveBeenCalled();
  });
  it('discard from review releases the URL and uploads nothing; the next selection starts clean', async () => {
    doubles.prepare.mockImplementation(async (f) => okUnchanged(f));
    const { result } = mount();
    act(() => { result.current.select(jpeg()); });
    await flush();
    act(() => { result.current.discard(); });
    expect(result.current.phase).toBe('idle');
    expect(urls.revoked).toEqual(['blob:mock/1']);
    act(() => { result.current.select(jpeg('second.jpg')); });
    await flush();
    expect(result.current.fileName).toBe('second.jpg');
    expect(result.current.previewUrl).toBe('blob:mock/2');
    expect(doubles.upload).not.toHaveBeenCalled();
  });
});

describe('repair pass — StrictMode, blank-MIME images, unseen candidates, document after image', () => {
  it('works under React.StrictMode effect replay (src/main.jsx wraps the app): prepare → review → confirm → done', async () => {
    doubles.prepare.mockImplementation(async (f) => okUnchanged(f));
    const onUploaded = vi.fn(async () => {});
    const { result } = renderHook((props) => useWirEvidenceImage(props), { initialProps: { ...CTX, onUploaded }, wrapper: StrictMode });
    act(() => { result.current.select(jpeg()); });
    expect(result.current.phase).toBe('preparing');
    await flush();
    expect(result.current.phase).toBe('review');
    await confirmSeen(result);
    expect(doubles.upload).toHaveBeenCalledTimes(1);
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('done');
  });
  it.each(['photo.gif', 'photo.webp', 'IMG_0001.HEIC', 'scan.tiff', 'shot.bmp', 'pic.avif'])('blank-MIME %s is an image: it enters preparation and fails closed, never the document path', async (name) => {
    doubles.prepare.mockImplementation(async () => ({ ok: false, error: { code: 'UNSUPPORTED_TYPE' } }));
    const { result } = mount();
    let taken;
    act(() => { taken = result.current.select(new File(['x'], name, { type: '' })); });
    expect(taken).toBe(true);
    await flush();
    expect(result.current.phase).toBe('failed');
    expect(result.current.code).toBe('UNSUPPORTED_TYPE');
    expect(doubles.prepare).toHaveBeenCalledTimes(1);
    expect(doubles.upload).not.toHaveBeenCalled();
  });
  it('blank-MIME .pdf / .docx / unknown extensions stay on the document path', () => {
    const { result } = mount();
    for (const name of ['report.pdf', 'note.docx', 'data.bin', 'README']) {
      let taken; act(() => { taken = result.current.select(new File(['x'], name, { type: '' })); });
      expect(taken).toBe(false);
    }
    expect(doubles.prepare).not.toHaveBeenCalled();
  });
  it('a candidate that cannot be previewed (no object-URL support) is never confirmable', async () => {
    delete URL.createObjectURL;
    doubles.prepare.mockImplementation(async (f) => okUnchanged(f));
    const { result } = mount();
    act(() => { result.current.select(jpeg()); });
    await flush();
    expect(result.current.phase).toBe('failed');
    expect(result.current.code).toBe('PREVIEW_UNAVAILABLE');
    expect(result.current.candidate).toBeNull();
    await confirmSeen(result);
    expect(doubles.upload).not.toHaveBeenCalled();
  });
  it('a preview that fails to render (previewFailed) drops the candidate and releases the URL: confirm uploads nothing', async () => {
    doubles.prepare.mockImplementation(async (f) => okUnchanged(f));
    const { result } = mount();
    act(() => { result.current.select(jpeg()); });
    await flush();
    act(() => { result.current.previewFailed(); });
    expect(result.current.phase).toBe('failed');
    expect(result.current.code).toBe('PREVIEW_UNAVAILABLE');
    expect(result.current.candidate).toBeNull();
    expect(urls.revoked).toEqual(['blob:mock/1']);
    await confirmSeen(result);
    expect(doubles.upload).not.toHaveBeenCalled();
  });
  it('selecting a document while image A is under review invalidates A: A can no longer be confirmed', async () => {
    doubles.prepare.mockImplementation(async (f) => okUnchanged(f));
    const { result } = mount();
    act(() => { result.current.select(jpeg('a.jpg')); });
    await flush();
    expect(result.current.phase).toBe('review');
    let taken;
    act(() => { taken = result.current.select(new File(['%PDF'], 'b.pdf', { type: 'application/pdf' })); });
    expect(taken).toBe(false);                                                  // the caller keeps B's ordinary document upload …
    expect(result.current.phase).toBe('idle');                                  // … but A is gone
    expect(result.current.candidate).toBeNull();
    expect(urls.revoked).toEqual(['blob:mock/1']);
    await confirmSeen(result);
    expect(doubles.upload).not.toHaveBeenCalled();
  });
  it('selecting a document while image A is still preparing aborts A and ignores its late result', async () => {
    const d = deferred(); let signal;
    doubles.prepare.mockImplementation((f, opts) => { signal = opts.signal; return d.promise; });
    const { result } = mount();
    act(() => { result.current.select(jpeg('a.jpg')); });
    act(() => { result.current.select(new File(['%PDF'], 'b.pdf', { type: 'application/pdf' })); });
    expect(signal.aborted).toBe(true);
    await act(async () => { d.resolve(okUnchanged(jpeg('a.jpg'))); await d.promise; });
    expect(result.current.phase).toBe('idle');
    expect(urls.created).toHaveLength(0);
  });
});

describe('preview gate — confirmation waits for the exact candidate preview to load', () => {
  it('confirm before the preview has loaded is a no-op: nothing uploads', async () => {
    doubles.prepare.mockImplementation(async (f) => okUnchanged(f));
    const { result } = mount();
    act(() => { result.current.select(jpeg()); });
    await flush();
    expect(result.current.phase).toBe('review');
    expect(result.current.previewSeen).toBe(false);
    await act(async () => { await result.current.confirm(); });
    expect(doubles.upload).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('review');
  });
  it('the matching preview load (naturalWidth > 0) enables confirm; retry after an upload failure keeps it', async () => {
    doubles.prepare.mockImplementation(async (f) => okUnchanged(f));
    doubles.upload.mockImplementationOnce(async () => { throw new Error('storage: 503'); });
    const { result } = mount();
    act(() => { result.current.select(jpeg()); });
    await flush();
    seen(result, 1200);
    expect(result.current.previewSeen).toBe(true);
    await act(async () => { await result.current.confirm(); });
    expect(doubles.upload).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('upload-failed');
    expect(result.current.previewSeen).toBe(true);
    await act(async () => { await result.current.retryUpload(); });
    expect(doubles.upload).toHaveBeenCalledTimes(2);
    expect(result.current.phase).toBe('done');
  });
  it('a load event that reports naturalWidth 0 is a failed preview: the candidate is dropped', async () => {
    doubles.prepare.mockImplementation(async (f) => okUnchanged(f));
    const { result } = mount();
    act(() => { result.current.select(jpeg()); });
    await flush();
    act(() => { result.current.previewLoaded(result.current.previewUrl, 0); });
    expect(result.current.phase).toBe('failed');
    expect(result.current.code).toBe('PREVIEW_UNAVAILABLE');
    expect(urls.revoked).toEqual(['blob:mock/1']);
  });
  it('stale A load/error events after B replaced it neither enable nor invalidate B', async () => {
    doubles.prepare.mockImplementation(async (f) => okUnchanged(f));
    const { result } = mount();
    act(() => { result.current.select(jpeg('a.jpg')); });
    await flush();
    const urlA = result.current.previewUrl;
    seen(result);                                                               // A was seen …
    const b = jpeg('b.jpg');
    act(() => { result.current.select(b); });
    await flush();
    expect(result.current.candidate).toBe(b);
    expect(result.current.previewSeen).toBe(false);                           // … but B has not been
    act(() => { result.current.previewLoaded(urlA, 800); });                     // stale A load
    expect(result.current.previewSeen).toBe(false);
    await act(async () => { await result.current.confirm(); });
    expect(doubles.upload).not.toHaveBeenCalled();
    act(() => { result.current.previewFailed(urlA); });                          // stale A error
    expect(result.current.phase).toBe('review');
    expect(result.current.candidate).toBe(b);
    seen(result);
    await act(async () => { await result.current.confirm(); });
    expect(doubles.upload).toHaveBeenCalledTimes(1);
    expect(doubles.upload.mock.calls[0][0].file).toBe(b);
  });
});

describe('orphaned in-flight upload — a context change mid-upload must not freeze the next review', () => {
  it('after the WIR changes during an upload, the next review\'s preview load, confirm and refresh all work; the orphan settles silently; every URL is revoked exactly once', async () => {
    doubles.prepare.mockImplementation(async (f) => okUnchanged(f));
    const dA = deferred(); doubles.upload.mockImplementationOnce(() => dA.promise);   // A's upload hangs
    const { result, rerender, props, onUploaded } = mount();
    act(() => { result.current.select(jpeg('a.jpg')); });
    await flush();
    seen(result);
    let pA; act(() => { pA = result.current.confirm(); });
    expect(result.current.phase).toBe('uploading');
    rerender({ ...props, wirId: 'wir-2' });                                     // orphans A's upload
    expect(result.current.phase).toBe('idle');
    const b = jpeg('b.jpg');
    act(() => { result.current.select(b); });
    await flush();
    expect(result.current.phase).toBe('review');
    seen(result);                                                               // B's own <img> load
    expect(result.current.previewSeen).toBe(true);
    await act(async () => { await result.current.confirm(); });
    expect(doubles.upload).toHaveBeenCalledTimes(2);
    expect(doubles.upload.mock.calls[1][0]).toMatchObject({ recordId: 'wir-2' });
    expect(doubles.upload.mock.calls[1][0].file).toBe(b);
    expect(result.current.phase).toBe('done');
    expect(onUploaded).toHaveBeenCalledTimes(1);
    await act(async () => { dA.resolve({ id: 'att-A' }); await pA; });         // the orphan settles late
    expect(result.current.phase).toBe('done');
    expect(onUploaded).toHaveBeenCalledTimes(1);                                // no refresh for the orphan
    expect(urls.revoked).toEqual(['blob:mock/1', 'blob:mock/2']);               // once each, no double revoke
  });
  it('discard during the NEXT review is not blocked by an orphaned upload either', async () => {
    doubles.prepare.mockImplementation(async (f) => okUnchanged(f));
    doubles.upload.mockImplementationOnce(() => new Promise(() => {}));         // never settles
    const { result, rerender, props } = mount();
    act(() => { result.current.select(jpeg('a.jpg')); });
    await flush();
    seen(result);
    act(() => { result.current.confirm(); });
    rerender({ ...props, active: false });                                      // drawer closed, component stays mounted
    rerender({ ...props, active: true });
    act(() => { result.current.select(jpeg('b.jpg')); });
    await flush();
    expect(result.current.phase).toBe('review');
    act(() => { result.current.discard(); });
    expect(result.current.phase).toBe('idle');
    expect(urls.revoked).toEqual(['blob:mock/1', 'blob:mock/2']);
  });
});
