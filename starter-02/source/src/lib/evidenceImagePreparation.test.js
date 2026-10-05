// ============================================================
// EVIDENCE-IMG-1A rev1 — evidence image preparation (local, browser-native).
//
// Contract (internal acceptance record):
//   inclusive cap 3,000,000 bytes measured on the ACTUAL Blob.size; JPEG and
//   static PNG only, same-format re-encode, PNG alpha preserved; limits:
//   source 20,000,000 B · 16,000,000 px · edge 8192 · header scan 262,144 B;
//   JPEG quality ladder .90/.82/.74 then resize ×.85 down to floors 1600/600
//   (never upscale, never crop, orientation applied); PNG resize-only; at most
//   8 encoder attempts; abort/15 s timeout cancel the ORCHESTRATION (no late
//   success, no retry, late resources disposed) — not native CPU work.
//   Failures: ABORTED TIMEOUT UNSUPPORTED_TYPE SOURCE_TOO_LARGE
//   DIMENSIONS_TOO_LARGE HEADER_SCAN_LIMIT DECODE_FAILED ENCODE_FAILED
//   CANNOT_MEET_SIZE_LIMIT INVALID_IMAGE.
//
// Native APIs (createImageBitmap, canvas 2d, toBlob) are stubbed HERE, in the
// test file, as accepted: the doubles exercise the real policy/orchestration
// and every size assertion reads a real Blob.size. Native encoder proof is the
// separate real-browser check.
// ============================================================
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_EVIDENCE_IMAGE_BYTES, EVIDENCE_IMAGE_LIMITS, prepareEvidenceImage } from './evidenceImagePreparation.js';

// ── fixture builders: real bytes, real Blob.size ────────────────────────────
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n) => [(n >>> 8) & 255, n & 255];
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const be32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
// ── genuine PNG/APNG fixtures (1A-R1): CRC-correct chunks, valid zlib IDAT ──
// Verbatim copy of the browser-harness builders (img-harness/png-fixtures.js, shared block).
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (bytes) => { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const adler32 = (bytes) => { let a = 1, b = 0; for (let i = 0; i < bytes.length; i++) { a = (a + bytes[i]) % 65521; b = (b + a) % 65521; } return ((b << 16) | a) >>> 0; };
const cat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
/** RFC 1950 zlib stream of RFC 1951 stored blocks (BTYPE=00, ≤65,535 bytes each) with an Adler-32 trailer. */
function zlibStored(raw) {
  const blocks = []; let i = 0;
  do { const n = Math.min(65535, raw.length - i); const last = i + n >= raw.length ? 1 : 0; blocks.push(Uint8Array.from([last, n & 255, n >> 8, ~n & 255, (~n >> 8) & 255]), raw.subarray(i, i + n)); i += n; } while (i < raw.length);
  return cat(Uint8Array.from([0x78, 0x01]), ...blocks, Uint8Array.from(u32(adler32(raw))));
}
/** Inverse of zlibStored (stored blocks only); throws on any structural or checksum mismatch. */
function inflateStored(z) {
  if (((z[0] << 8) | z[1]) % 31 !== 0 || (z[0] & 15) !== 8) throw new Error('bad zlib header');
  const parts = []; let i = 2, last = 0;
  while (!last) { last = z[i] & 1; if (z[i] >> 1 !== 0) throw new Error('not a stored block'); const n = z[i + 1] | (z[i + 2] << 8); if ((n ^ 0xffff) !== (z[i + 3] | (z[i + 4] << 8))) throw new Error('bad LEN/NLEN'); parts.push(z.subarray(i + 5, i + 5 + n)); i += 5 + n; }
  const raw = cat(...parts);
  if (i + 4 !== z.length || be32(z, i) !== adler32(raw)) throw new Error('bad adler32');
  return raw;
}
/** PNG chunk: length, type, data, CRC-32 over type+data. */
const pngChunk = (type, data) => { const body = cat(Uint8Array.from(ascii(type)), data instanceof Uint8Array ? data : Uint8Array.from(data)); return cat(Uint8Array.from(u32(body.length - 4)), body, Uint8Array.from(u32(crc32(body)))); };
const SIG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IHDR = (w, h, colorType) => pngChunk('IHDR', [...u32(w), ...u32(h), 8, colorType, 0, 0, 0]);
const BYTES_PER_PIXEL = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
/** Filter-type-0 scanlines with every pixel equal to `pixel` (8-bit samples). */
function scanlines(w, h, colorType, pixel) { const bpp = BYTES_PER_PIXEL[colorType]; const row = 1 + w * bpp; const raw = new Uint8Array(row * h); for (let x = 0; x < w; x++) for (let k = 0; k < bpp; k++) raw[1 + x * bpp + k] = pixel[k]; for (let y = 1; y < h; y++) raw.copyWithin(y * row, 0, row); return raw; }
/** Latin-1 tEXt chunk carrying `n` bytes of text under `keyword` (chunk size 12 + keyword + 1 + n). */
const tEXt = (n, keyword = 'Comment') => pngChunk('tEXt', cat(Uint8Array.from([...ascii(keyword), 0]), new Uint8Array(n).fill(0x41)));
/** Genuine static PNG. `before` chunks sit between IHDR and IDAT, `after` chunks between IDAT and IEND. */
function realPng({ width = 4, height = 4, colorType = 6, pixel = [200, 30, 30, 255], before = [], after = [] } = {}) {
  return cat(SIG, IHDR(width, height, colorType), ...before, pngChunk('IDAT', zlibStored(scanlines(width, height, colorType, pixel))), ...after, pngChunk('IEND', []));
}
/** Genuine two-frame 1×1 RGBA APNG (acTL · fcTL/IDAT · fcTL/fdAT). `before` sits between IHDR and acTL, `afterActl` between acTL and the first fcTL. */
function realApng({ before = [], afterActl = [] } = {}) {
  const fcTL = (seq) => pngChunk('fcTL', [...u32(seq), ...u32(1), ...u32(1), ...u32(0), ...u32(0), ...u16(1), ...u16(10), 0, 0]);
  const frame = (px) => zlibStored(scanlines(1, 1, 6, px));
  return cat(SIG, IHDR(1, 1, 6), ...before, pngChunk('acTL', [...u32(2), ...u32(0)]), ...afterActl, fcTL(0), pngChunk('IDAT', frame([255, 0, 0, 255])), fcTL(1), pngChunk('fdAT', cat(Uint8Array.from(u32(2)), frame([0, 0, 255, 255]))), pngChunk('IEND', []));
}
/** Chunk walk with CRC recomputation — the fixture-fidelity oracle (not the module under test). */
function walkPng(bytes) {
  const chunks = []; let o = 8;
  while (o + 8 <= bytes.length) {
    const length = be32(bytes, o); const type = String.fromCharCode(...bytes.subarray(o + 4, o + 8)); const end = o + 12 + length;
    if (end > bytes.length) { chunks.push({ type, offset: o, length, truncated: true }); break; }
    chunks.push({ type, offset: o, length, data: bytes.subarray(o + 8, o + 8 + length), crcOk: crc32(bytes.subarray(o + 4, o + 8 + length)) === be32(bytes, o + 8 + length) });
    o = end; if (type === 'IEND') break;
  }
  return chunks;
}
/** Array-form chunk used by the size-exact ladder fixtures; CRC-correct like everything else (the module never verifies CRCs). */
const chunk = (type, data) => [...u32(data.length), ...ascii(type), ...data, ...u32(crc32(Uint8Array.from([...ascii(type), ...data])))];

/** Static or animated PNG of exactly `size` bytes. colorType 2 = RGB, 6 = RGBA. */
function pngBytes({ width, height, colorType = 2, animated = false, size, badHeader = false }) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = badHeader ? chunk('IHDR', [1, 2, 3]) : chunk('IHDR', [...u32(width), ...u32(height), 8, colorType, 0, 0, 0]);
  const actl = animated ? chunk('acTL', [...u32(2), ...u32(0)]) : [];
  const head = [...sig, ...ihdr, ...actl];
  const bodyLen = Math.max(0, size - head.length - 12);
  const idat = chunk('IDAT', new Array(bodyLen).fill(7));
  return new Uint8Array([...head, ...idat]).slice(0, size);
}

/** JPEG of exactly `size` bytes: SOI, optional EXIF orientation, optional bulk
 *  APP segments that push SOF past `sofAfter` bytes, SOF0 with dims, filler, EOI. */
function jpegBytes({ width, height, orientation = null, size, sofAfter = 0, noSof = false }) {
  const out = [0xff, 0xd8];
  if (orientation) {
    const tiff = [...ascii('II'), 0x2a, 0x00, ...[8, 0, 0, 0], ...[1, 0], ...[0x12, 0x01], ...[3, 0], ...[1, 0, 0, 0], ...[orientation, 0, 0, 0], ...[0, 0, 0, 0]];
    const payload = [...ascii('Exif'), 0, 0, ...tiff];
    out.push(0xff, 0xe1, ...u16(payload.length + 2), ...payload);
  }
  let pushed = 0;
  while (pushed < sofAfter) {                                 // bulk COM segments (max 65,535 each)
    const len = Math.min(60_000, sofAfter - pushed + 1);
    out.push(0xff, 0xfe, ...u16(len + 2), ...new Array(len).fill(0x20));
    pushed += len + 4;
  }
  if (!noSof) out.push(0xff, 0xc0, ...u16(17), 8, ...u16(height), ...u16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1);
  const filler = Math.max(0, size - out.length - 2);
  return new Uint8Array([...out, ...new Array(filler).fill(0x5a), 0xff, 0xd9]).slice(0, size);
}
const blobOf = (bytes, type) => new Blob([bytes], type === undefined ? {} : { type });
const fileOf = (bytes, type, name = 'site-photo.jpg') => new File([bytes], name, { type, lastModified: 1_700_000_000_000 });

// ── native doubles (test-file stubs; real Blob.size everywhere) ──────────────
const native = vi.hoisted(() => ({
  decode: { width: 0, height: 0, reject: null, pending: null, bitmaps: [] },
  encode: { sizeFor: null, calls: [], nullResult: false, mime: null, throws: false, pending: null },
  canvases: [],
}));

function installNatives() {
  globalThis.createImageBitmap = vi.fn(async (_blob, opts) => {
    if (native.decode.pending) await native.decode.pending;
    if (native.decode.reject) throw new Error('decode failed');
    const swap = opts?.imageOrientation === 'from-image' && native.decode.swapForOrientation;
    const bitmap = { width: swap ? native.decode.height : native.decode.width, height: swap ? native.decode.width : native.decode.height, close: vi.fn() };
    native.decode.bitmaps.push(bitmap);
    return bitmap;
  });
  const ctx = { drawImage: vi.fn(), clearRect: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () { native.canvases.push(this); return ctx; });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb, mime, quality) {
    native.encode.calls.push({ mime, quality, width: this.width, height: this.height });
    const finish = () => {
      if (native.encode.throws) throw new Error('encoder exploded');
      if (native.encode.nullResult) return cb(null);
      const n = native.encode.sizeFor(mime, quality, this.width, this.height);
      cb(new Blob([new Uint8Array(n)], { type: native.encode.mime ?? mime }));
    };
    if (native.encode.pending) native.encode.pending.then(finish); else finish();
  });
  return ctx;
}
let ctx;
beforeEach(() => {
  native.decode = { width: 0, height: 0, reject: null, pending: null, bitmaps: [], swapForOrientation: false };
  native.encode = { sizeFor: () => 1000, calls: [], nullResult: false, mime: null, throws: false, pending: null };
  native.canvases = [];
  ctx = installNatives();
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); delete globalThis.createImageBitmap; });

const CAP = MAX_EVIDENCE_IMAGE_BYTES;
const lastEncode = () => native.encode.calls[native.encode.calls.length - 1];

// ── contract constants ───────────────────────────────────────────────────────
describe('contract constants', () => {
  it('exposes the inclusive 3,000,000-byte cap and the accepted named limits, frozen', () => {
    expect(CAP).toBe(3_000_000);
    expect(Object.isFrozen(EVIDENCE_IMAGE_LIMITS)).toBe(true);
    expect(EVIDENCE_IMAGE_LIMITS).toEqual({
      maxSourceBytes: 20_000_000, maxPixels: 16_000_000, maxEdge: 8192, headerScanBytes: 262_144,
      floorLongEdge: 1600, floorShortEdge: 600, jpegQualities: [0.90, 0.82, 0.74], resizeFactor: 0.85,
      maxEncodeAttempts: 8, timeoutMs: 15_000,
    });
  });
});

// ── validation before any native decode ─────────────────────────────────────
describe('validation — explicit, bounded, before any native decode', () => {
  it.each([[null], [undefined], ['string'], [{}], [123]])('non-Blob input %p → INVALID_IMAGE', async (v) => {
    const r = await prepareEvidenceImage(v);
    expect(r.ok).toBe(false); expect(r.error.code).toBe('INVALID_IMAGE'); expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
  });
  it('empty Blob → INVALID_IMAGE', async () => {
    const r = await prepareEvidenceImage(new Blob([], { type: 'image/jpeg' }));
    expect(r.error.code).toBe('INVALID_IMAGE');
  });
  it('20,000,000 bytes is still a source; 20,000,001 → SOURCE_TOO_LARGE before any read', async () => {
    const slice = vi.spyOn(Blob.prototype, 'slice');
    const over = await prepareEvidenceImage(blobOf(jpegBytes({ width: 100, height: 100, size: 20_000_001 }), 'image/jpeg'));
    expect(over.error.code).toBe('SOURCE_TOO_LARGE');
    expect(slice).not.toHaveBeenCalled();
    expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
    native.decode.width = 100; native.decode.height = 100;
    const at = await prepareEvidenceImage(blobOf(jpegBytes({ width: 100, height: 100, size: 20_000_000 }), 'image/jpeg'));
    expect(at.error?.code).not.toBe('SOURCE_TOO_LARGE');
  });
  it.each([
    ['GIF', [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0], 'image/gif'],
    ['WebP', [...'RIFF'].map((c) => c.charCodeAt(0)), 'image/webp'],
    ['text', [...'hello'].map((c) => c.charCodeAt(0)), 'text/plain'],
  ])('%s bytes → UNSUPPORTED_TYPE (validated from bytes, not the label)', async (_n, bytes, type) => {
    const r = await prepareEvidenceImage(blobOf(new Uint8Array([...bytes, ...new Array(64).fill(0)]), type));
    expect(r.error.code).toBe('UNSUPPORTED_TYPE');
  });
  it('a declared MIME that disagrees with the bytes is a spoof → UNSUPPORTED_TYPE', async () => {
    const r = await prepareEvidenceImage(blobOf(jpegBytes({ width: 10, height: 10, size: 400 }), 'image/png'));
    expect(r.error.code).toBe('UNSUPPORTED_TYPE');
  });
  it('an unlabeled Blob is accepted on its bytes alone', async () => {
    const r = await prepareEvidenceImage(blobOf(jpegBytes({ width: 10, height: 10, size: 400 })));
    expect(r.ok).toBe(true);
  });
  it('animated PNG (acTL) → UNSUPPORTED_TYPE', async () => {
    const r = await prepareEvidenceImage(blobOf(pngBytes({ width: 10, height: 10, animated: true, size: 600 }), 'image/png'));
    expect(r.error.code).toBe('UNSUPPORTED_TYPE');
  });
  it('corrupt PNG header → INVALID_IMAGE', async () => {
    const r = await prepareEvidenceImage(blobOf(pngBytes({ width: 10, height: 10, badHeader: true, size: 600 }), 'image/png'));
    expect(r.error.code).toBe('INVALID_IMAGE');
  });
  it('JPEG whose SOF lies beyond the 262,144-byte scan budget → HEADER_SCAN_LIMIT, and never reads past the budget', async () => {
    const slice = vi.spyOn(Blob.prototype, 'slice');
    const r = await prepareEvidenceImage(blobOf(jpegBytes({ width: 10, height: 10, size: 400_000, sofAfter: 300_000 }), 'image/jpeg'));
    expect(r.error.code).toBe('HEADER_SCAN_LIMIT');
    for (const c of slice.mock.calls) expect(c[1] - (c[0] || 0)).toBeLessThanOrEqual(262_144);
  });
  it('JPEG with no SOF at all (truncated/corrupt) → INVALID_IMAGE', async () => {
    const r = await prepareEvidenceImage(blobOf(jpegBytes({ width: 10, height: 10, size: 2_000, noSof: true }), 'image/jpeg'));
    expect(r.error.code).toBe('INVALID_IMAGE');
  });
  it.each([[8193, 100], [100, 8193], [4000, 4001]])('%i×%i exceeds an edge or 16,000,000 px → DIMENSIONS_TOO_LARGE', async (w, h) => {
    const r = await prepareEvidenceImage(blobOf(jpegBytes({ width: w, height: h, size: 5_000 }), 'image/jpeg'));
    expect(r.error.code).toBe('DIMENSIONS_TOO_LARGE');
    expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
  });
  it('8192×1953 (15,998,976 px) is within bounds', async () => {
    native.decode.width = 8192; native.decode.height = 1953;
    const r = await prepareEvidenceImage(blobOf(jpegBytes({ width: 8192, height: 1953, size: 5_000 }), 'image/jpeg'));
    expect(r.ok).toBe(true);
  });
});

// ── unchanged success at or under the cap ──────────────────────────────────
describe('unchanged success — identity preserved, no decode', () => {
  it.each([[CAP], [CAP - 1], [400]])('a supported image of %i bytes is returned as the same object, untransformed, zero attempts', async (size) => {
    const file = fileOf(jpegBytes({ width: 3000, height: 2000, size }), 'image/jpeg', 'pour-card.jpg');
    const r = await prepareEvidenceImage(file);
    expect(r.ok).toBe(true);
    expect(r.candidate).toBe(file);                       // identity, bytes, name, lastModified untouched
    expect(r.candidate.size).toBe(size);
    expect(r.metadata).toMatchObject({ originalBytes: size, resultBytes: size, originalMime: 'image/jpeg', actualMime: 'image/jpeg', originalWidth: 3000, originalHeight: 2000, width: 3000, height: 2000, transformed: false, operations: [], attempts: 0 });
    expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
  });
  it('3,000,001 bytes is never returned unchanged', async () => {
    native.decode.width = 3000; native.decode.height = 2000; native.encode.sizeFor = () => 2_500_000;
    const file = fileOf(jpegBytes({ width: 3000, height: 2000, size: CAP + 1 }), 'image/jpeg');
    const r = await prepareEvidenceImage(file);
    expect(r.candidate).not.toBe(file);
    expect(r.metadata.originalBytes).toBe(CAP + 1);
  });
});

// ── transform ladder ────────────────────────────────────────────────────────
describe('transform — same-format ladder measured on real bytes', () => {
  const big = (w, h, size = CAP + 1) => fileOf(jpegBytes({ width: w, height: h, size }), 'image/jpeg');
  beforeEach(() => { native.decode.width = 4000; native.decode.height = 3000; });

  it('first re-encode under the cap wins: transformed, metadata loss recorded, actual bytes reported', async () => {
    native.encode.sizeFor = () => 2_900_000;
    const r = await prepareEvidenceImage(big(4000, 3000));
    expect(r.ok).toBe(true);
    expect(r.candidate.size).toBe(2_900_000);
    expect(r.candidate.type).toBe('image/jpeg');
    expect(r.metadata).toMatchObject({ originalBytes: CAP + 1, resultBytes: 2_900_000, transformed: true, attempts: 1, width: 4000, height: 3000, actualMime: 'image/jpeg' });
    expect(r.metadata.operations).toEqual(expect.arrayContaining(['reencode', 'metadata-stripped']));
    expect(lastEncode()).toMatchObject({ mime: 'image/jpeg', quality: 0.90, width: 4000, height: 3000 });
  });
  it('walks the JPEG quality ladder .90 → .82 → .74 before any resize; a result of exactly 3,000,000 is accepted', async () => {
    const byQ = { 0.9: 3_100_000, 0.82: CAP + 1, 0.74: CAP };
    native.encode.sizeFor = (_m, q) => byQ[q];
    const r = await prepareEvidenceImage(big(4000, 3000));
    expect(r.ok).toBe(true);
    expect(r.candidate.size).toBe(CAP);
    expect(native.encode.calls.map((c) => c.quality)).toEqual([0.90, 0.82, 0.74]);
    expect(native.encode.calls.every((c) => c.width === 4000 && c.height === 3000)).toBe(true);
    expect(r.metadata.attempts).toBe(3);
    expect(r.metadata.operations).not.toContain('resize');
  });
  it('then resizes by ×0.85 with integer rounding, aspect ratio preserved, never upscaled, never cropped', async () => {
    native.encode.sizeFor = (_m, _q, w) => (w < 4000 ? 2_000_000 : 5_000_000);   // only the resized frame fits
    const r = await prepareEvidenceImage(big(4000, 3000));
    expect(r.ok).toBe(true);
    expect(r.metadata.operations).toEqual(expect.arrayContaining(['reencode', 'resize']));
    const e = lastEncode();
    expect(e.width).toBe(3400); expect(e.height).toBe(2550);             // 4000×.85, 3000×.85
    expect(Math.abs(e.width / e.height - 4000 / 3000)).toBeLessThan(0.01);
    expect(r.metadata).toMatchObject({ width: 3400, height: 2550, originalWidth: 4000, originalHeight: 3000 });
    for (const c of native.encode.calls) { expect(c.width).toBeLessThanOrEqual(4000); expect(c.height).toBeLessThanOrEqual(3000); }
    // full-image draw: source rect is the whole bitmap, destination is the whole canvas
    const draw = ctx.drawImage.mock.calls.at(-1);
    expect(draw.slice(1)).toEqual([0, 0, 3400, 2550]);
  });
  it('the 1600/600 floors stop resizing: an image that cannot shrink further fails CANNOT_MEET_SIZE_LIMIT after the quality ladder', async () => {
    native.decode.width = 1700; native.decode.height = 1000;
    native.encode.sizeFor = () => CAP + 1;
    const r = await prepareEvidenceImage(big(1700, 1000));
    expect(r.ok).toBe(false); expect(r.error.code).toBe('CANNOT_MEET_SIZE_LIMIT');
    expect(native.encode.calls).toHaveLength(3);                          // 3 qualities, no resize below the floor
    expect(native.encode.calls.every((c) => c.width === 1700)).toBe(true);
    expect(r.metadata.attempts).toBe(3);
  });
  it('a valid small original is never resized up to the floors', async () => {
    native.decode.width = 800; native.decode.height = 500;
    native.encode.sizeFor = () => 100;
    const r = await prepareEvidenceImage(big(800, 500));
    expect(r.ok).toBe(true);
    expect(lastEncode()).toMatchObject({ width: 800, height: 500 });
  });
  it('never exceeds 8 encoder attempts: exhaustion is CANNOT_MEET_SIZE_LIMIT with attempts 8', async () => {
    native.decode.width = 8000; native.decode.height = 1900;
    native.encode.sizeFor = () => CAP + 1;
    const r = await prepareEvidenceImage(big(8000, 1900));
    expect(r.ok).toBe(false); expect(r.error.code).toBe('CANNOT_MEET_SIZE_LIMIT');
    expect(native.encode.calls).toHaveLength(8);
    expect(r.metadata.attempts).toBe(8);
  });
  it('PNG uses a resize-only ladder (no quality parameter) and preserves alpha in the same format', async () => {
    native.decode.width = 4000; native.decode.height = 3000;
    native.encode.sizeFor = (_m, _q, w) => (w < 4000 ? 2_000_000 : 5_000_000);
    const r = await prepareEvidenceImage(fileOf(pngBytes({ width: 4000, height: 3000, colorType: 6, size: CAP + 1 }), 'image/png', 'plan.png'));
    expect(r.ok).toBe(true);
    expect(r.candidate.type).toBe('image/png');
    expect(native.encode.calls.every((c) => c.mime === 'image/png' && c.quality === undefined)).toBe(true);
    expect(native.encode.calls.map((c) => c.width)).toEqual([4000, 3400]);      // one attempt per scale, no quality steps
    expect(r.metadata).toMatchObject({ actualMime: 'image/png', hasAlpha: true, width: 3400, height: 2550 });
    expect(r.metadata.operations).not.toContain('flatten');
    expect(r.metadata.operations).not.toContain('convert');
  });
  it('final guard: an oversized result is never a success even if the ladder ends', async () => {
    native.encode.sizeFor = () => CAP + 1;
    const r = await prepareEvidenceImage(big(4000, 3000));
    expect(r.ok).toBe(false);
    expect(r.candidate).toBeUndefined();
    expect(r.error.code).toBe('CANNOT_MEET_SIZE_LIMIT');
  });
  it('encoder returning null → ENCODE_FAILED; wrong MIME → ENCODE_FAILED; throwing encoder → ENCODE_FAILED', async () => {
    native.encode.nullResult = true;
    expect((await prepareEvidenceImage(big(4000, 3000))).error.code).toBe('ENCODE_FAILED');
    native.encode.nullResult = false; native.encode.mime = 'image/webp'; native.encode.sizeFor = () => 1000;
    expect((await prepareEvidenceImage(big(4000, 3000))).error.code).toBe('ENCODE_FAILED');
    native.encode.mime = null; native.encode.throws = true;
    expect((await prepareEvidenceImage(big(4000, 3000))).error.code).toBe('ENCODE_FAILED');
  });
  it('decode failure → DECODE_FAILED; decoded dimensions disagreeing with the header → DECODE_FAILED', async () => {
    native.decode.reject = true;
    expect((await prepareEvidenceImage(big(4000, 3000))).error.code).toBe('DECODE_FAILED');
    native.decode.reject = null; native.decode.width = 100; native.decode.height = 100;
    expect((await prepareEvidenceImage(big(4000, 3000))).error.code).toBe('DECODE_FAILED');
  });
  it('EXIF orientation is applied to the visual frame (quarter-turn swaps width/height) and drawn full-frame', async () => {
    native.decode.width = 4000; native.decode.height = 3000; native.decode.swapForOrientation = true;
    native.encode.sizeFor = () => 1000;
    const r = await prepareEvidenceImage(fileOf(jpegBytes({ width: 4000, height: 3000, orientation: 6, size: CAP + 1 }), 'image/jpeg'));
    expect(r.ok).toBe(true);
    expect(globalThis.createImageBitmap.mock.calls[0][1]).toMatchObject({ imageOrientation: 'from-image' });
    expect(r.metadata).toMatchObject({ width: 3000, height: 4000, originalWidth: 3000, originalHeight: 4000 });
    expect(lastEncode()).toMatchObject({ width: 3000, height: 4000 });
  });
});

// ── cancellation and cleanup: orchestration-level, honest ───────────────────
describe('cancellation and cleanup', () => {
  const big = () => fileOf(jpegBytes({ width: 4000, height: 3000, size: CAP + 1 }), 'image/jpeg');
  beforeEach(() => { native.decode.width = 4000; native.decode.height = 3000; native.encode.sizeFor = () => 1000; });

  it('an already-aborted signal → ABORTED with zero decode and zero attempts', async () => {
    const ac = new AbortController(); ac.abort();
    const r = await prepareEvidenceImage(big(), { signal: ac.signal });
    expect(r.error.code).toBe('ABORTED'); expect(r.metadata.attempts).toBe(0);
    expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
  });
  it('abort during decode → ABORTED; the late bitmap is closed and never encoded', async () => {
    let release; native.decode.pending = new Promise((res) => { release = res; });
    const ac = new AbortController();
    const p = prepareEvidenceImage(big(), { signal: ac.signal });
    await vi.waitFor(() => expect(globalThis.createImageBitmap).toHaveBeenCalledTimes(1));   // decode genuinely in flight
    ac.abort(); release(); const r = await p;
    expect(r.error.code).toBe('ABORTED');
    await vi.waitFor(() => expect(native.decode.bitmaps[0]?.close).toHaveBeenCalled());    // late bitmap disposed
    expect(native.encode.calls).toHaveLength(0);
  });
  it('abort during encode → ABORTED, no further attempts, canvas released', async () => {
    let release; native.encode.pending = new Promise((res) => { release = res; });
    const ac = new AbortController();
    const p = prepareEvidenceImage(big(), { signal: ac.signal });
    await vi.waitFor(() => expect(native.encode.calls).toHaveLength(1));
    ac.abort(); release(); const r = await p;
    expect(r.error.code).toBe('ABORTED');
    expect(native.encode.calls).toHaveLength(1);
    for (const c of native.canvases) { expect(c.width).toBe(0); expect(c.height).toBe(0); }
  });
  it('a hung decode times out at 15,000 ms → TIMEOUT; a late result is disposed, not used', async () => {
    vi.useFakeTimers();
    let release; native.decode.pending = new Promise((res) => { release = res; });
    const p = prepareEvidenceImage(big());
    await vi.advanceTimersByTimeAsync(15_000);
    const r = await p;
    expect(r.error.code).toBe('TIMEOUT');
    release(); await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(native.decode.bitmaps[0]?.close).toHaveBeenCalled());
    expect(native.encode.calls).toHaveLength(0);
  });
  it('success releases the bitmap and zeroes the canvas; failure does too', async () => {
    const ok = await prepareEvidenceImage(big());
    expect(ok.ok).toBe(true);
    expect(native.decode.bitmaps[0].close).toHaveBeenCalled();
    for (const c of native.canvases) { expect(c.width).toBe(0); expect(c.height).toBe(0); }
    native.encode.sizeFor = () => CAP + 1;
    const bad = await prepareEvidenceImage(big());
    expect(bad.ok).toBe(false);
    expect(native.decode.bitmaps[1].close).toHaveBeenCalled();
  });
});

// ── honesty and hygiene ─────────────────────────────────────────────────────
describe('metadata honesty and hygiene', () => {
  it('error results still carry original bytes/MIME/dimensions and never a file name', async () => {
    native.decode.width = 4000; native.decode.height = 3000; native.encode.sizeFor = () => CAP + 1;
    const r = await prepareEvidenceImage(fileOf(jpegBytes({ width: 4000, height: 3000, size: CAP + 1 }), 'image/jpeg', 'secret-customer-name.jpg'));
    expect(r.ok).toBe(false);
    expect(r.metadata).toMatchObject({ originalBytes: CAP + 1, originalMime: 'image/jpeg', originalWidth: 4000, originalHeight: 3000, transformed: false });
    expect(JSON.stringify(r.error)).not.toContain('secret-customer-name');
    expect(JSON.stringify(r)).not.toContain('secret-customer-name');
  });
  it('the original is never mutated and a transformed candidate is a new Blob', async () => {
    native.decode.width = 4000; native.decode.height = 3000; native.encode.sizeFor = () => 1000;
    const bytes = jpegBytes({ width: 4000, height: 3000, size: CAP + 1 });
    const file = fileOf(bytes, 'image/jpeg');
    const r = await prepareEvidenceImage(file);
    expect(file.size).toBe(CAP + 1);
    expect(r.candidate).not.toBe(file);
    expect(r.candidate.size).toBe(1000);
  });
  it('makes no network, storage or provider call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));
    native.decode.width = 4000; native.decode.height = 3000; native.encode.sizeFor = () => 1000;
    await prepareEvidenceImage(fileOf(jpegBytes({ width: 4000, height: 3000, size: CAP + 1 }), 'image/jpeg'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ── PR #213 review regressions: pre-IDAT eligibility must be established within the
//    header budget (fail closed), and a PNG must be structurally complete ─────────
// ── fixture fidelity: the genuine builders are what they claim to be ─────────
describe('fixture fidelity — genuine PNG/APNG builders (1A-R1)', () => {
  const HEAD = EVIDENCE_IMAGE_LIMITS.headerScanBytes;
  it('crc32 and adler32 match their published check values; the legacy chunk() helper is CRC-correct too', () => {
    expect(crc32(Uint8Array.from(ascii('123456789')))).toBe(0xcbf43926);   // CRC-32/ISO-HDLC check value
    expect(crc32(Uint8Array.from(ascii('IEND')))).toBe(0xae426082);        // the CRC every PNG IEND chunk carries
    expect(adler32(Uint8Array.from(ascii('Wikipedia')))).toBe(0x11e60398);
    expect(chunk('IEND', []).slice(-4)).toEqual([0xae, 0x42, 0x60, 0x82]);
  });
  it('a genuine static PNG: signature, IHDR first, CRC-correct chunks, an IDAT that inflates to its scanlines, IEND last', () => {
    const bytes = realPng({ width: 4, height: 4, colorType: 6, pixel: [200, 30, 30, 128] });
    const walk = walkPng(bytes);
    expect(walk.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(walk.every((c) => c.crcOk)).toBe(true);
    expect(inflateStored(walk[1].data)).toEqual(scanlines(4, 4, 6, [200, 30, 30, 128]));
    expect(walk[1].data.length).toBe(2 + 5 + 68 + 4);                       // zlib header · stored-block header · raw · adler
    expect(bytes.length).toBe(136);
  });
  it('a genuine APNG: acTL before the first IDAT, two fcTL frames, sequence-numbered fdAT, CRC-correct throughout', () => {
    const bytes = realApng();
    const walk = walkPng(bytes);
    expect(walk.map((c) => c.type)).toEqual(['IHDR', 'acTL', 'fcTL', 'IDAT', 'fcTL', 'fdAT', 'IEND']);
    expect(walk.every((c) => c.crcOk)).toBe(true);
    expect(be32(walk[1].data, 0)).toBe(2);                                  // num_frames
    expect([be32(walk[2].data, 0), be32(walk[4].data, 0), be32(walk[5].data, 0)]).toEqual([0, 1, 2]);   // sequence numbers
    expect(inflateStored(walk[3].data)).toEqual(Uint8Array.from([0, 255, 0, 0, 255]));
    expect(inflateStored(walk[5].data.subarray(4))).toEqual(Uint8Array.from([0, 0, 0, 255, 255]));
    expect(bytes.length).toBe(201);
  });
  it('the padded APNG keeps acTL beyond the 262,144-byte scan budget while the file stays far below the 20,000,000-byte source limit', () => {
    const bytes = realApng({ before: [tEXt(HEAD)] });
    const walk = walkPng(bytes);
    expect(walk.every((c) => c.crcOk)).toBe(true);
    expect(walk.find((c) => c.type === 'acTL').offset).toBe(262_197);
    expect(bytes.length).toBe(262_365);
    expect(bytes.length).toBeLessThan(EVIDENCE_IMAGE_LIMITS.maxSourceBytes);
  });
});

// ── 1A-R1 locked PNG validation contract (packet §3, matrix §6, R1/R2 §5) ───
describe('PNG structure and header budget — 1A-R1 locked contract (genuine fixtures)', () => {
  const HEAD = EVIDENCE_IMAGE_LIMITS.headerScanBytes;                    // 262,144
  const RGB = { colorType: 2, pixel: [10, 20, 30] };
  const png = (bytes, name = 'evidence.png') => fileOf(bytes, 'image/png', name);
  async function expectUnchanged(file, extra = {}) {
    const r = await prepareEvidenceImage(file);
    expect(r.ok).toBe(true);
    expect(r.candidate).toBe(file);
    expect(r.metadata).toMatchObject({ actualMime: 'image/png', originalBytes: file.size, resultBytes: file.size, transformed: false, operations: [], attempts: 0, ...extra });
    expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
    return r;
  }
  async function expectRejected(bytes, code) {
    const r = await prepareEvidenceImage(png(bytes));
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe(code);
    expect(r.metadata.originalBytes).toBe(bytes.length);
    expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
    return r;
  }

  // 1 — small valid static PNG ≤ 3,000,000 B unchanged
  it('1: a small genuine static PNG is returned unchanged as the same object, with zero decode', async () => {
    await expectUnchanged(png(realPng(RGB), 'tiny.png'), { originalWidth: 4, originalHeight: 4, width: 4, height: 4, hasAlpha: false, originalBytes: 120 });
  });
  it('1: a genuine static PNG of exactly 3,000,000 bytes is returned unchanged; one byte more is re-encoded, never returned as-is', async () => {
    const grey = { width: 1000, height: 1000, colorType: 0, pixel: [128] };
    const base = realPng(grey);
    const exact = realPng({ ...grey, after: [tEXt(CAP - base.length - 20)] });
    expect(exact.length).toBe(CAP);
    await expectUnchanged(png(exact), { width: 1000, height: 1000, hasAlpha: false });
    const over = realPng({ ...grey, after: [tEXt(CAP - base.length - 19)] });
    expect(over.length).toBe(CAP + 1);
    native.decode.width = 1000; native.decode.height = 1000; native.encode.sizeFor = () => 2_500_000;
    const file = png(over);
    const r = await prepareEvidenceImage(file);
    expect(r.ok).toBe(true); expect(r.candidate).not.toBe(file); expect(r.candidate.type).toBe('image/png'); expect(r.candidate.size).toBe(2_500_000);
    expect(r.metadata).toMatchObject({ originalBytes: CAP + 1, resultBytes: 2_500_000, transformed: true, attempts: 1 });
    expect(native.encode.calls).toEqual([{ mime: 'image/png', quality: undefined, width: 1000, height: 1000 }]);
  });
  // 2 — benign ancillary chunks before IDAT, inside the budget
  it('2: benign ancillary chunks before IDAT (sRGB, gAMA, pHYs, tEXt ×2 — 100 KB, inside the budget) leave a static PNG accepted unchanged', async () => {
    const bytes = realPng({ ...RGB, before: [pngChunk('sRGB', [0]), pngChunk('gAMA', u32(45455)), pngChunk('pHYs', [...u32(2835), ...u32(2835), 1]), tEXt(20, 'Software'), tEXt(100_000)] });
    expect(walkPng(bytes).find((c) => c.type === 'IDAT').offset).toBe(100_144);
    await expectUnchanged(png(bytes), { hasAlpha: false, originalBytes: 100_231 });
  });
  // 3 — normal APNG
  it('3 / R1 control: a genuine two-frame APNG with acTL before IDAT → UNSUPPORTED_TYPE (declared image/png agrees: a type decision, not a spoof)', async () => {
    const bytes = realApng();
    expect(bytes.length).toBe(201);
    const r = await expectRejected(bytes, 'UNSUPPORTED_TYPE');
    expect(r.metadata.originalMime).toBe('image/png');
  });
  // 4 — padded APNG (R1)
  it('4 / R1: a genuine APNG whose acTL begins beyond the 262,144-byte budget (262,144-byte tEXt first) fails closed HEADER_SCAN_LIMIT — never ok, never unchanged, never decoded', async () => {
    const bytes = realApng({ before: [tEXt(HEAD)] });
    expect(walkPng(bytes).find((c) => c.type === 'acTL').offset).toBeGreaterThan(HEAD);
    expect(bytes.length).toBe(262_365);
    const slice = vi.spyOn(Blob.prototype, 'slice');
    const r = await expectRejected(bytes, 'HEADER_SCAN_LIMIT');
    expect(r.candidate).toBeUndefined();
    expect(slice).toHaveBeenCalled();
    expect(slice.mock.calls.every(([start, end]) => start === 0 && end <= HEAD)).toBe(true);   // the PNG walk never reads past the budget either
  });
  it('4 control: the same 262,144-byte padding placed after acTL keeps acTL inside the budget → UNSUPPORTED_TYPE (the budget bounds classification, not file size)', async () => {
    const bytes = realApng({ afterActl: [tEXt(HEAD)] });
    expect(bytes.length).toBe(262_365);
    await expectRejected(bytes, 'UNSUPPORTED_TYPE');
  });
  it('4 control: the same padding after IDAT in a genuine static PNG is never inspected → accepted unchanged', async () => {
    const bytes = realPng({ ...RGB, after: [tEXt(HEAD)] });
    expect(bytes.length).toBe(262_284);
    await expectUnchanged(png(bytes), { hasAlpha: false });
  });
  // 5 — signature + IHDR + EOF (R2)
  it('5 / R2: signature + IHDR + EOF (33 bytes, CRC-correct IHDR, no image data) → INVALID_IMAGE', async () => {
    const bytes = realPng().subarray(0, 33);
    expect(walkPng(bytes)).toMatchObject([{ type: 'IHDR', crcOk: true }]);
    await expectRejected(bytes, 'INVALID_IMAGE');
  });
  it('5: a truncated chunk header after IHDR (3 stray bytes) → INVALID_IMAGE', async () => {
    await expectRejected(cat(realPng().subarray(0, 33), Uint8Array.from([0, 0, 0])), 'INVALID_IMAGE');
  });
  it('5: IEND directly after IHDR (no IDAT) → INVALID_IMAGE', async () => {
    await expectRejected(cat(SIG, IHDR(1, 1, 6), pngChunk('IEND', [])), 'INVALID_IMAGE');
  });
  // 6 — a chunk declaring bytes beyond the actual file
  it('6: an ancillary chunk declaring more bytes than the file holds → INVALID_IMAGE (patched length, genuine file cut inside its tEXt, IDAT declaring past EOF)', async () => {
    const bytes = realPng({ ...RGB, before: [tEXt(100)] });
    const declared = bytes.slice(); declared.set(u32(bytes.length), 33);    // the tEXt at 33 now claims the whole file and more
    await expectRejected(declared, 'INVALID_IMAGE');
    await expectRejected(bytes.subarray(0, 33 + 12 + 50), 'INVALID_IMAGE');
    await expectRejected(Uint8Array.from([...SIG, ...IHDR(1, 1, 6), ...u32(5000), ...ascii('IDAT'), 1, 2, 3]), 'INVALID_IMAGE');
  });
  // 7 — pre-IDAT structure exceeds the inspection budget
  it('7: a genuine static PNG whose pre-IDAT structure exceeds the budget (262,144-byte tEXt before IDAT) → HEADER_SCAN_LIMIT, although the whole file is far under the source limit', async () => {
    const bytes = realPng({ ...RGB, before: [tEXt(HEAD)] });
    expect(bytes.length).toBe(262_284);
    await expectRejected(bytes, 'HEADER_SCAN_LIMIT');
  });
  it('7: many small ancillary chunks that together push the first IDAT past the budget → HEADER_SCAN_LIMIT', async () => {
    const bytes = realPng({ ...RGB, before: Array.from({ length: 3000 }, () => tEXt(80)) });   // 3,000 × 100 B
    expect(walkPng(bytes).find((c) => c.type === 'IDAT').offset).toBe(300_033);
    await expectRejected(bytes, 'HEADER_SCAN_LIMIT');
  });
  it('7 boundary: an IDAT header ending exactly at byte 262,144 is eligible (unchanged); one byte later is HEADER_SCAN_LIMIT', async () => {
    const at = realPng({ ...RGB, before: [tEXt(HEAD - 8 - 25 - 20 - 8)] });
    expect(walkPng(at).find((c) => c.type === 'IDAT').offset + 8).toBe(HEAD);
    await expectUnchanged(png(at));
    await expectRejected(realPng({ ...RGB, before: [tEXt(HEAD - 8 - 25 - 20 - 8 + 1)] }), 'HEADER_SCAN_LIMIT');
  });
  // 8 — transparent static PNG behaviour unchanged
  it('8: a genuine transparent static PNG (RGBA, partial alpha) under the cap is returned unchanged with hasAlpha true', async () => {
    await expectUnchanged(png(realPng({ pixel: [200, 30, 30, 128] })), { hasAlpha: true, originalBytes: 136 });
  });
  it('8: a genuine RGB PNG made transparent by tRNS is reported hasAlpha true and returned unchanged', async () => {
    await expectUnchanged(png(realPng({ ...RGB, before: [pngChunk('tRNS', [...u16(10), ...u16(20), ...u16(30)])] })), { hasAlpha: true });
  });
  it('8: a genuine transparent static PNG over the cap takes the resize-only PNG ladder and stays PNG with alpha — no flatten, no convert', async () => {
    const bytes = realPng({ width: 1000, height: 800, pixel: [200, 30, 30, 128] });
    expect(bytes.length).toBe(3_201_108);
    native.decode.width = 1000; native.decode.height = 800; native.encode.sizeFor = () => 2_000_000;
    const file = png(bytes);
    const r = await prepareEvidenceImage(file);
    expect(r.ok).toBe(true); expect(r.candidate).not.toBe(file); expect(r.candidate.type).toBe('image/png');
    expect(native.encode.calls).toEqual([{ mime: 'image/png', quality: undefined, width: 1000, height: 800 }]);
    expect(r.metadata).toMatchObject({ hasAlpha: true, actualMime: 'image/png', transformed: true, attempts: 1, width: 1000, height: 800, operations: ['reencode', 'metadata-stripped'] });
    expect(file.size).toBe(bytes.length);
  });
  // 9 — oversized static PNG optimisation unchanged
  it('9: a genuine oversized static PNG (grey 2000×1700, 3,402,023 B) walks the PNG ladder ×0.85 with no quality steps and lands at 1700×1445, above the floors', async () => {
    const bytes = realPng({ width: 2000, height: 1700, colorType: 0, pixel: [77] });
    expect(bytes.length).toBe(3_402_023);
    native.decode.width = 2000; native.decode.height = 1700; native.encode.sizeFor = (_m, _q, w) => (w < 2000 ? 2_500_000 : 3_500_000);
    const r = await prepareEvidenceImage(png(bytes));
    expect(r.ok).toBe(true);
    expect(native.encode.calls.map((c) => [c.mime, c.quality, c.width, c.height])).toEqual([['image/png', undefined, 2000, 1700], ['image/png', undefined, 1700, 1445]]);
    expect(r.metadata).toMatchObject({ actualMime: 'image/png', hasAlpha: false, width: 1700, height: 1445, transformed: true, attempts: 2, resultBytes: 2_500_000, operations: ['reencode', 'metadata-stripped', 'resize'] });
  });
  it('9: a genuine oversized static PNG that sits on the floors (grey 1800×1700) is offered exactly one PNG encode and fails honestly when it does not fit', async () => {
    const bytes = realPng({ width: 1800, height: 1700, colorType: 0, pixel: [77] });
    expect(bytes.length).toBe(3_061_998);
    native.decode.width = 1800; native.decode.height = 1700; native.encode.sizeFor = () => CAP + 1;
    const r = await prepareEvidenceImage(png(bytes));
    expect(r.ok).toBe(false); expect(r.error.code).toBe('CANNOT_MEET_SIZE_LIMIT');
    expect(native.encode.calls.map((c) => [c.mime, c.quality, c.width, c.height])).toEqual([['image/png', undefined, 1800, 1700]]);   // ×0.85 would fall below the 1600 floor
    expect(r.metadata.attempts).toBe(1);
  });
  // 10 — JPEG untouched by the PNG walk
  it('10: JPEG classification is untouched by the PNG walk — SOI-led bytes carrying "acTL"/"IEND"/"IHDR" text never enter the PNG path', async () => {
    const bytes = jpegBytes({ width: 800, height: 600, size: 4000 });
    bytes.set(ascii('acTLIENDIHDR'), 200);                                    // inside the filler after SOF
    const file = fileOf(bytes, 'image/jpeg', 'pour-card.jpg');
    const r = await prepareEvidenceImage(file);
    expect(r.ok).toBe(true); expect(r.candidate).toBe(file);
    expect(r.metadata).toMatchObject({ actualMime: 'image/jpeg', width: 800, height: 600, attempts: 0 });
  });
});
