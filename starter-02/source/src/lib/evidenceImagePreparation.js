// ============================================================
// evidenceImagePreparation — EVIDENCE-IMG-1A rev1.
//
// Prepares ONE local evidence image (File/Blob) for the existing attachment
// path by guaranteeing the candidate is at most MAX_EVIDENCE_IMAGE_BYTES on its
// ACTUAL byte size. It is a pure, browser-native module: no upload, no network,
// no persistence, no provider, no camera, no UI. It is not a live upload
// feature and not server-side enforcement.
//
// What it promises, and only this:
//   · the original is never mutated; an in-cap supported image is returned as
//     the very same object (identity, bytes, name, lastModified untouched);
//   · JPEG and static PNG only, validated from bytes (a declared MIME that
//     disagrees is a spoof); same-format re-encoding, PNG alpha preserved, no
//     silent flattening or conversion, no crop, no upscale, orientation applied
//     to the visual frame;
//   · a deterministic, finite ladder (JPEG quality .90/.82/.74, then ×0.85
//     resize down to the 1600/600 floors; PNG resize-only; at most 8 encodes);
//   · discriminated failures with machine-stable reasons and honest metadata,
//     never a successful oversized candidate, never a file name in an error;
//   · abort / 15 s timeout cancel the ORCHESTRATION — no late success, no
//     retry, late resources disposed. They do not hard-abort native CPU work
//     already in flight, and this module does not claim that they do.
// ============================================================

export const MAX_EVIDENCE_IMAGE_BYTES = 3_000_000;

export const EVIDENCE_IMAGE_LIMITS = Object.freeze({
  maxSourceBytes: 20_000_000,
  maxPixels: 16_000_000,
  maxEdge: 8192,
  headerScanBytes: 262_144,
  floorLongEdge: 1600,
  floorShortEdge: 600,
  jpegQualities: Object.freeze([0.90, 0.82, 0.74]),
  resizeFactor: 0.85,
  maxEncodeAttempts: 8,
  timeoutMs: 15_000,
});

const JPEG_MIMES = new Set(['image/jpeg', 'image/jpg']);
const PNG_MIMES = new Set(['image/png']);
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

class PreparationFailure extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = (code) => new PreparationFailure(code);

// ── byte access ─────────────────────────────────────────────────────────────

/** Read the first `length` bytes (bounded by the caller) without loading the whole file. */
async function readHead(blob, length) {
  const part = blob.slice(0, length);
  if (typeof part.arrayBuffer === 'function') return new Uint8Array(await part.arrayBuffer());
  // Older WebKit (and jsdom) lack Blob.arrayBuffer; FileReader is universal.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(fail('INVALID_IMAGE'));
    reader.readAsArrayBuffer(part);
  });
}

const be16 = (b, i) => (b[i] << 8) | b[i + 1];
const be32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const tag4 = (b, i) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);

// ── header inspection (bounded, before any native decode) ───────────────────

/** PNG: IHDR must be the first chunk; acTL anywhere in the scanned head = animated. */
function inspectPng(head, totalBytes) {
  if (head.length < 33 || be32(head, 8) !== 13 || tag4(head, 12) !== 'IHDR') throw fail('INVALID_IMAGE');
  const width = be32(head, 16);
  const height = be32(head, 20);
  const colorType = head[25];
  if (!width || !height) throw fail('INVALID_IMAGE');
  let hasAlpha = colorType === 4 || colorType === 6;
  // Static-PNG eligibility means: no acTL before the first IDAT, and that IDAT
  // structurally present with its declared payload inside the file. Both must
  // be established inside the scanned head; if the head ends first while the
  // file goes on, the answer is unknown and the module fails closed.
  let offset = 8;
  for (;;) {
    if (offset + 8 > head.length) {
      if (offset + 8 > totalBytes) throw fail('INVALID_IMAGE');       // truncated chunk header
      throw fail('HEADER_SCAN_LIMIT');                                 // eligibility not provable within budget
    }
    const length = be32(head, offset);
    const type = tag4(head, offset + 4);
    if (type === 'acTL') throw fail('UNSUPPORTED_TYPE');            // animated PNG
    if (type === 'tRNS') hasAlpha = true;
    if (type === 'IEND') throw fail('INVALID_IMAGE');                // no image data at all
    const next = offset + 12 + length;
    if (next > totalBytes) throw fail('INVALID_IMAGE');              // declared payload runs past the file
    if (type === 'IDAT') break;                                      // eligible: first IDAT reached inside the budget
    offset = next;
  }
  return { mime: 'image/png', width, height, orientation: 1, hasAlpha };
}

/** EXIF orientation from an APP1 payload; 1 when absent or unreadable. */
function exifOrientation(seg) {
  if (seg.length < 14 || tag4(seg, 0) !== 'Exif') return 1;
  const t = 6;                                                        // TIFF header offset inside the payload
  const little = seg[t] === 0x49 && seg[t + 1] === 0x49;
  const r16 = (i) => (little ? seg[i] | (seg[i + 1] << 8) : be16(seg, i));
  const r32 = (i) => (little ? (seg[i] | (seg[i + 1] << 8) | (seg[i + 2] << 16) | (seg[i + 3] << 24)) >>> 0 : be32(seg, i));
  if (r16(t + 2) !== 0x2a) return 1;
  const ifd = t + r32(t + 4);
  if (ifd + 2 > seg.length) return 1;
  const entries = r16(ifd);
  for (let n = 0; n < entries; n += 1) {
    const e = ifd + 2 + n * 12;
    if (e + 12 > seg.length) return 1;
    if (r16(e) === 0x0112) { const v = r16(e + 8); return v >= 1 && v <= 8 ? v : 1; }
  }
  return 1;
}

const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** JPEG: walk marker segments to the first SOF; stop honestly at the scan budget. */
function inspectJpeg(head, totalBytes) {
  let offset = 2;
  let orientation = 1;
  for (;;) {
    if (offset + 4 > head.length) throw fail(offset + 4 > totalBytes ? 'INVALID_IMAGE' : 'HEADER_SCAN_LIMIT');
    if (head[offset] !== 0xff) throw fail('INVALID_IMAGE');
    let marker = head[offset + 1];
    while (marker === 0xff) { offset += 1; if (offset + 4 > head.length) throw fail('HEADER_SCAN_LIMIT'); marker = head[offset + 1]; }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { offset += 2; continue; }   // standalone markers
    if (marker === 0xd9 || marker === 0xda) throw fail('INVALID_IMAGE');       // EOI / SOS before any SOF
    const length = be16(head, offset + 2);
    if (length < 2) throw fail('INVALID_IMAGE');
    const segStart = offset + 4;
    const next = offset + 2 + length;
    if (SOF_MARKERS.has(marker)) {
      if (segStart + 5 > head.length) throw fail(next > totalBytes ? 'INVALID_IMAGE' : 'HEADER_SCAN_LIMIT');
      const height = be16(head, segStart + 1);
      const width = be16(head, segStart + 3);
      if (!width || !height) throw fail('INVALID_IMAGE');
      return { mime: 'image/jpeg', width, height, orientation, hasAlpha: false };
    }
    if (marker === 0xe1 && next <= head.length) orientation = exifOrientation(head.subarray(segStart, next));
    if (next > totalBytes) throw fail('INVALID_IMAGE');
    if (next > head.length) throw fail('HEADER_SCAN_LIMIT');
    offset = next;
  }
}

function inspectHeader(head, totalBytes) {
  if (head.length >= 8 && PNG_SIGNATURE.every((v, i) => head[i] === v)) return inspectPng(head, totalBytes);
  // JPEG magic is SOI (FF D8); what follows decides valid vs corrupt, not the type.
  if (head.length >= 2 && head[0] === 0xff && head[1] === 0xd8) return inspectJpeg(head, totalBytes);
  throw fail('UNSUPPORTED_TYPE');
}

const declaredMimeAgrees = (declared, mime) => !declared
  || (mime === 'image/jpeg' && JPEG_MIMES.has(declared))
  || (mime === 'image/png' && PNG_MIMES.has(declared));

// ── cancellation: orchestration-level, never a claim of native abort ────────

function cancellation(signal, timeoutMs) {
  let cancelled = null;
  let settle;
  const promise = new Promise((_resolve, reject) => { settle = reject; });
  promise.catch(() => undefined);                                     // never an unhandled rejection
  const cancel = (code) => { if (!cancelled) { cancelled = code; settle(fail(code)); } };
  const onAbort = () => cancel('ABORTED');
  if (signal?.aborted) cancel('ABORTED');
  else signal?.addEventListener?.('abort', onAbort, { once: true });
  const timer = setTimeout(() => cancel('TIMEOUT'), timeoutMs);
  return {
    get code() { return cancelled; },
    check() { if (cancelled) throw fail(cancelled); },
    race(work) { return Promise.race([work, promise]); },
    dispose() { clearTimeout(timer); signal?.removeEventListener?.('abort', onAbort); },
  };
}

// ── the ladder ──────────────────────────────────────────────────────────────

/** Frames from the visual size down by the resize factor, never below the floors, never up. */
function frames(width, height, limits) {
  const list = [{ scale: 1, width, height }];
  let scale = 1;
  for (;;) {
    scale *= limits.resizeFactor;
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    if (Math.max(w, h) < limits.floorLongEdge || Math.min(w, h) < limits.floorShortEdge) return list;
    list.push({ scale, width: w, height: h });
  }
}

function encodeCanvas(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    try {
      const done = (blob) => resolve(blob);
      quality === undefined ? canvas.toBlob(done, mime) : canvas.toBlob(done, mime, quality);
    } catch (error) {
      reject(error);
    }
  });
}

function toCandidate(blob, input) {
  return typeof File === 'function' && input instanceof File
    ? new File([blob], input.name, { type: blob.type, lastModified: input.lastModified })
    : blob;
}

// ── entry point ─────────────────────────────────────────────────────────────

/**
 * @param {Blob} input  a local File or Blob
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ok:true, candidate:Blob, metadata:object} | {ok:false, error:{code:string}, metadata:object}>}
 */
export async function prepareEvidenceImage(input, { signal } = {}) {
  const limits = EVIDENCE_IMAGE_LIMITS;
  const metadata = {
    originalBytes: null, resultBytes: null, originalMime: null, actualMime: null,
    originalWidth: null, originalHeight: null, width: null, height: null,
    hasAlpha: null, transformed: false, operations: [], attempts: 0,
  };
  const failure = (code) => ({ ok: false, error: { code }, metadata });

  if (typeof Blob === 'undefined' || !(input instanceof Blob) || !(input.size > 0)) return failure('INVALID_IMAGE');
  metadata.originalBytes = input.size;
  metadata.originalMime = input.type || null;
  if (input.size > limits.maxSourceBytes) return failure('SOURCE_TOO_LARGE');
  if (signal?.aborted) return failure('ABORTED');

  const cancel = cancellation(signal, limits.timeoutMs);
  let bitmap = null;
  let canvas = null;
  try {
    // 1. Bounded header inspection — dimensions, orientation, alpha, animation.
    const head = await cancel.race(readHead(input, Math.min(input.size, limits.headerScanBytes)));
    cancel.check();
    const info = inspectHeader(head, input.size);
    if (!declaredMimeAgrees(input.type, info.mime)) throw fail('UNSUPPORTED_TYPE');
    if (info.width > limits.maxEdge || info.height > limits.maxEdge || info.width * info.height > limits.maxPixels) throw fail('DIMENSIONS_TOO_LARGE');
    const swapped = info.orientation >= 5;
    const visualWidth = swapped ? info.height : info.width;
    const visualHeight = swapped ? info.width : info.height;
    Object.assign(metadata, { actualMime: info.mime, originalWidth: visualWidth, originalHeight: visualHeight, hasAlpha: info.hasAlpha });

    // 2. Already within the cap: the original itself, untouched.
    if (input.size <= MAX_EVIDENCE_IMAGE_BYTES) {
      Object.assign(metadata, { resultBytes: input.size, width: visualWidth, height: visualHeight });
      return { ok: true, candidate: input, metadata };
    }

    // 3. Decode with orientation applied; dispose a late bitmap if we were cancelled meanwhile.
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') throw fail('DECODE_FAILED');
    const decoding = createImageBitmap(input, { imageOrientation: 'from-image' });
    decoding.then((late) => { if (cancel.code) late?.close?.(); }, () => undefined);
    try {
      bitmap = await cancel.race(decoding);
    } catch (error) {
      throw error instanceof PreparationFailure ? error : fail('DECODE_FAILED');
    }
    cancel.check();
    if (bitmap.width !== visualWidth || bitmap.height !== visualHeight) throw fail('DECODE_FAILED');

    // 4. Deterministic same-format ladder on real output bytes.
    canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw fail('ENCODE_FAILED');
    const qualities = info.mime === 'image/jpeg' ? limits.jpegQualities : [undefined];
    for (const frame of frames(visualWidth, visualHeight, limits)) {
      for (const quality of qualities) {
        if (metadata.attempts >= limits.maxEncodeAttempts) throw fail('CANNOT_MEET_SIZE_LIMIT');
        cancel.check();
        canvas.width = frame.width;
        canvas.height = frame.height;
        context.clearRect(0, 0, frame.width, frame.height);
        context.drawImage(bitmap, 0, 0, frame.width, frame.height);       // whole image, no crop
        let blob;
        try {
          blob = await cancel.race(encodeCanvas(canvas, info.mime, quality));
        } catch (error) {
          throw error instanceof PreparationFailure ? error : fail('ENCODE_FAILED');
        }
        metadata.attempts += 1;
        cancel.check();
        if (!blob || !(blob.size > 0) || blob.type !== info.mime) throw fail('ENCODE_FAILED');
        // The one guard every success passes through: actual bytes, inclusive cap.
        if (blob.size <= MAX_EVIDENCE_IMAGE_BYTES) {
          const operations = ['reencode', 'metadata-stripped'];
          if (frame.scale < 1) operations.push('resize');
          Object.assign(metadata, { resultBytes: blob.size, width: frame.width, height: frame.height, transformed: true, operations });
          return { ok: true, candidate: toCandidate(blob, input), metadata };
        }
      }
    }
    throw fail('CANNOT_MEET_SIZE_LIMIT');
  } catch (error) {
    return failure(error instanceof PreparationFailure ? error.code : 'INVALID_IMAGE');
  } finally {
    cancel.dispose();
    if (bitmap) { try { bitmap.close(); } catch { /* already closed */ } }
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
