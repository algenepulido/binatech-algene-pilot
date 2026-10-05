// ============================================================
// useWirEvidenceImage — EVIDENCE-IMG-1B: the WIR Evidence tab's image flow.
//
//   select(image) → prepare (1A primitive, 3,000,000-byte inclusive cap)
//     → review (non-cropped preview, original vs prepared bytes)
//     → EXPLICIT confirm → the existing uploadAttachment path
//     → list refresh.
//
// Documents never enter this hook: select() returns false and the caller keeps
// its ordinary immediate upload. Invariants the tests pin:
//   • a failed preparation never falls back to uploading the original;
//   • the upload candidate is named ONCE, before anyone previews it (a Blob
//     result becomes a byte-identical File carrying the original name), and the
//     exact reviewed object is what uploadAttachment receives — never re-made;
//   • a new selection, cancel, WIR/project/session change or closing the drawer
//     invalidates pending work, aborts the primitive and revokes object URLs;
//   • a synchronous in-flight guard blocks duplicate submits;
//   • the reviewed WIR/project/user/document-type context is frozen and a
//     confirm against a changed context is refused as stale;
//   • once the upload is confirmed, only the list refresh can be retried — the
//     candidate is released so the same bytes can never be sent twice from here.
// Not claimed: server-side idempotency across ambiguous network outcomes. The
// existing upload path has none and this hook adds none (no backend change).
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { prepareEvidenceImage } from '../../lib/evidenceImagePreparation.js';
import { uploadAttachment } from '../../lib/attachments.js';

// Known image extensions for a blank MIME: all of them enter preparation, where the 1A
// primitive accepts JPEG/PNG and fails everything else closed (never the document path).
const IMAGE_NAME = /\.(jpe?g|jfif|png|gif|webp|heic|heif|bmp|tiff?|avif|svg)$/i;

/** Images (by declared MIME, or by a known image extension when the MIME is blank)
 *  take the review flow; everything else keeps the ordinary document path. */
export function isEvidenceImageFile(file) {
  if (!file) return false;
  if (/^image\//i.test(file.type || '')) return true;
  return !file.type && IMAGE_NAME.test(file.name || '');
}

/** EN/AR explanation for a 1A failure code (inline `ar` convention). */
export function describeEvidenceFailure(code, lang = 'en') {
  const ar = lang === 'ar';
  switch (code) {
    case 'UNSUPPORTED_TYPE': return ar ? 'يمكن تجهيز صور JPEG أو PNG فقط هنا (HEIC وGIF وPNG المتحرك غير مدعومة).' : 'Only JPEG or PNG photos can be prepared here (HEIC, GIF and animated PNG are not supported).';
    case 'SOURCE_TOO_LARGE': return ar ? 'حجم الملف أكبر من 20,000,000 بايت.' : 'The file is larger than 20,000,000 bytes.';
    case 'DIMENSIONS_TOO_LARGE': return ar ? 'أبعاد الصورة كبيرة جدًا (أكثر من 16 ميغابكسل أو 8192 بكسل على أحد الجانبين).' : 'The photo is too large in pixels (over 16 megapixels or 8192 px on a side).';
    case 'HEADER_SCAN_LIMIT': return ar ? 'تعذّر التحقق من ترويسة الصورة ضمن حد الأمان.' : 'The photo header could not be verified within the safety limit.';
    case 'INVALID_IMAGE': return ar ? 'الملف ليس صورة صالحة.' : 'The file is not a valid image.';
    case 'DECODE_FAILED': return ar ? 'تعذّر فك ترميز الصورة.' : 'The photo could not be decoded.';
    case 'ENCODE_FAILED': return ar ? 'تعذّر إعادة ترميز الصورة.' : 'The photo could not be re-encoded.';
    case 'CANNOT_MEET_SIZE_LIMIT': return ar ? 'تعذّر الوصول بالصورة إلى 3,000,000 بايت أو أقل ضمن خطوات الجودة والحجم المسموح بها.' : 'The photo could not be brought to 3,000,000 bytes or less within the allowed quality and size steps.';
    case 'PREVIEW_UNAVAILABLE': return ar ? 'تعذّر عرض المعاينة، لذا لا يمكن تأكيد الصورة.' : 'The preview could not be shown, so the image cannot be confirmed.';
    case 'TIMEOUT': return ar ? 'استغرق تجهيز الصورة وقتًا أطول من المسموح.' : 'Preparing the photo took too long.';
    default: return ar ? `تعذّر تجهيز الصورة (${code}).` : `The photo could not be prepared (${code}).`;
  }
}

const IDLE = Object.freeze({ phase: 'idle', fileName: null, candidate: null, previewUrl: null, previewSeen: false, metadata: null, code: null, error: null, frozen: null });
const makeUrl = (obj) => (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(obj) : null);
const dropUrl = (url) => { if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url); };
const sameContext = (a, b) => !!a && !!b && a.wirId === b.wirId && a.projectId === b.projectId && a.userId === b.userId && a.docType === b.docType;
const message = (err) => err?.message ?? String(err);

export function useWirEvidenceImage({ active = true, wirId, projectId, userId, docType, onUploaded }) {
  const [state, setState] = useState(IDLE);
  const stateRef = useRef(IDLE);          // synchronous mirror: guards never wait for a render
  const tokenRef = useRef(0);             // bumped by every selection/invalidation; late work compares against it
  const abortRef = useRef(null);
  const submittingRef = useRef(null);     // token of the in-flight submission (synchronous duplicate-submit guard)
  const mountedRef = useRef(true);
  const contextRef = useRef(null);
  contextRef.current = { wirId, projectId, userId, docType };
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;

  const commit = useCallback((next) => { stateRef.current = next; if (mountedRef.current) setState(next); }, []);
  // In flight means: a submission of THIS selection is pending. An upload orphaned by
  // invalidate() (token bumped) must never block the next selection's review.
  const inFlight = () => submittingRef.current !== null && submittingRef.current === tokenRef.current;

  const invalidate = useCallback(() => {
    tokenRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    dropUrl(stateRef.current.previewUrl);
    commit(IDLE);
  }, [commit]);

  // StrictMode replays effects (cleanup, then setup): the setup must re-arm the flag,
  // otherwise every later commit would be dropped as "unmounted" (src/main.jsx uses StrictMode).
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  // A different WIR, project or user, or a closed drawer, discards pending work
  // (document type is frozen per review and checked at confirm instead).
  useEffect(() => () => invalidate(), [active, wirId, projectId, userId, invalidate]);

  const select = useCallback((file) => {
    invalidate();                                                   // any pending or reviewed image is gone, whatever comes next
    if (!isEvidenceImageFile(file)) return false;                   // documents keep the caller's ordinary path
    const token = tokenRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    const frozen = { ...contextRef.current };
    commit({ ...IDLE, phase: 'preparing', fileName: file.name });
    (async () => {
      let result;
      try { result = await prepareEvidenceImage(file, { signal: controller.signal }); }
      catch (err) { result = { ok: false, error: { code: 'DECODE_FAILED', message: message(err) } }; }
      if (token !== tokenRef.current) return;                       // superseded, cancelled or context changed
      abortRef.current = null;
      if (!result?.ok) {
        commit({ ...IDLE, phase: 'failed', fileName: file.name, code: result?.error?.code ?? 'INVALID_IMAGE', metadata: result?.metadata ?? null });
        return;                                                     // no fallback: the original is never uploaded
      }
      // Name the upload candidate once, before it is previewed. A File is kept as
      // the same object; a Blob becomes a byte-identical File with the original name.
      const c = result.candidate;
      const candidate = c instanceof File ? c : new File([c], file.name, { type: c.type || file.type, lastModified: file.lastModified });
      const previewUrl = makeUrl(candidate);
      if (!previewUrl) {                                              // nobody confirms what nobody can see
        commit({ ...IDLE, phase: 'failed', fileName: file.name, code: 'PREVIEW_UNAVAILABLE', metadata: result.metadata ?? null });
        return;
      }
      commit({ phase: 'review', fileName: file.name, candidate, previewUrl, previewSeen: false, metadata: result.metadata ?? null, code: null, error: null, frozen });
    })();
    return true;
  }, [commit, invalidate]);

  const refresh = useCallback(async (token, fileName) => {
    try { await onUploadedRef.current?.(); }
    catch (err) { if (token === tokenRef.current) commit({ ...IDLE, phase: 'refresh-failed', fileName, error: message(err) }); return; }
    if (token === tokenRef.current) commit({ ...IDLE, phase: 'done', fileName });
  }, [commit]);

  const submit = useCallback(async () => {
    const s = stateRef.current;
    if (inFlight() || !s.candidate || !s.previewSeen) return;        // nothing unseen is ever submitted; one submission at a time
    const token = tokenRef.current;
    submittingRef.current = token;
    if (!sameContext(s.frozen, contextRef.current)) {                // stale work is refused, never re-targeted
      dropUrl(s.previewUrl);
      commit({ ...IDLE, phase: 'stale', fileName: s.fileName });
      submittingRef.current = null;
      return;
    }
    commit({ ...s, phase: 'uploading', error: null });
    try {
      await uploadAttachment({ recordType: 'wir', recordId: s.frozen.wirId, file: s.candidate, documentType: s.frozen.docType });
    } catch (err) {
      if (submittingRef.current === token) submittingRef.current = null;
      if (token !== tokenRef.current) return;                         // orphaned by invalidate(): URL already released
      commit({ ...s, phase: 'upload-failed', error: message(err) });  // same candidate retained for an explicit retry
      return;
    }
    if (submittingRef.current === token) submittingRef.current = null;
    if (token !== tokenRef.current) return;                           // orphaned by invalidate(): URL already released
    // Upload confirmed: the candidate is released for good — only the refresh can be retried.
    dropUrl(s.previewUrl);
    commit({ ...IDLE, phase: 'refreshing', fileName: s.fileName });
    await refresh(token, s.fileName);
  }, [commit, refresh]);

  const confirm = useCallback(() => (stateRef.current.phase === 'review' ? submit() : Promise.resolve()), [submit]);
  const retryUpload = useCallback(() => (stateRef.current.phase === 'upload-failed' ? submit() : Promise.resolve()), [submit]);
  const retryRefresh = useCallback(async () => {
    const s = stateRef.current;
    if (s.phase !== 'refresh-failed' || inFlight()) return;
    const token = tokenRef.current;
    submittingRef.current = token;
    commit({ ...IDLE, phase: 'refreshing', fileName: s.fileName });
    await refresh(token, s.fileName);
    if (submittingRef.current === token) submittingRef.current = null;
  }, [commit, refresh]);
  const discard = useCallback(() => { if (inFlight()) return; invalidate(); }, [invalidate]);
  // Preview events carry the URL of the <img> that fired them: an event from a
  // previous candidate (A) after B replaced it can neither enable nor invalidate B.
  const isCurrentPreview = (s, url) => !!s.candidate && !!s.previewUrl && (url === undefined || url === s.previewUrl);
  /** The rendered preview failed (img error): the candidate was never seen, so it can never be confirmed. */
  const previewFailed = useCallback((url) => {
    const s = stateRef.current;
    if (inFlight() || !isCurrentPreview(s, url)) return;
    tokenRef.current += 1;
    dropUrl(s.previewUrl);
    commit({ ...IDLE, phase: 'failed', fileName: s.fileName, code: 'PREVIEW_UNAVAILABLE', metadata: s.metadata });
  }, [commit]);
  /** The exact candidate preview rendered (img load with real pixels): confirmation becomes possible. */
  const previewLoaded = useCallback((url, naturalWidth) => {
    const s = stateRef.current;
    if (inFlight() || !isCurrentPreview(s, url)) return;
    if (!(naturalWidth > 0)) { previewFailed(url); return; }           // a "load" with no pixels is not a preview
    if (!s.previewSeen) commit({ ...s, previewSeen: true });
  }, [commit, previewFailed]);

  return { ...state, busy: state.phase === 'preparing' || state.phase === 'uploading' || state.phase === 'refreshing', select, confirm, retryUpload, retryRefresh, discard, cancel: discard, previewFailed, previewLoaded };
}
