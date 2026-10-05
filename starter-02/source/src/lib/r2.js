// ============================================================
// Cloudflare R2 client-side helper. R2 credentials NEVER touch the browser:
// the browser asks a Supabase Edge Function ("r2-signer") for a short-lived
// presigned URL, then PUTs the bytes straight to R2 (so multi-GB files
// don't pass through any server). The Edge Function holds the R2 keys.
//
// If the Edge Function isn't deployed yet, isR2Configured() returns false
// and the app cleanly falls back to Supabase Storage. See DESIGN_LOG.md
// for exactly what to create (R2 bucket) and which secrets to set.
// ============================================================
import { supabase } from './supabase.js';
import { R2_SIGN_FUNCTION, R2_SIGNER_IS_SECURE } from './config.js';

// Slug of the deployed Edge Function that signs R2 URLs — environment-owned
// via VITE_R2_SIGN_FUNCTION (see src/lib/config.js). Pilot starter: the slugs
// are neutral placeholders and Edge Functions are not available.
const R2_FN = R2_SIGN_FUNCTION;

let _configured = null; // cache the probe result for the session

/** Ask the Edge Function whether R2 is set up. Cheap, cached, never throws. */
export async function isR2Configured() {
  if (_configured != null) return _configured;
  try {
    const { data, error } = await supabase.functions.invoke(R2_FN, { body: { op: 'status' } });
    _configured = !error && !!data?.configured;
  } catch {
    _configured = false;
  }
  return _configured;
}

/** Get a presigned PUT URL for a key from the Edge Function. */
async function presignPut(key, contentType) {
  const { data, error } = await supabase.functions.invoke(R2_FN, { body: { op: 'put', key, contentType } });
  if (error) throw new Error(error.message || 'Could not get an R2 upload URL');
  if (!data?.url) throw new Error('R2 sign returned no URL');
  return data.url;
}

/** Get a presigned GET URL to read a stored object. */
export async function r2GetUrl(key, expiresIn = 3600) {
  const { data, error } = await supabase.functions.invoke(R2_FN, { body: { op: 'get', key, expiresIn } });
  if (error) throw new Error(error.message || 'Could not get an R2 download URL');
  return data?.url;
}

/**
 * Upload a file to R2 via a presigned PUT, reporting real progress (0-100).
 * Uses XHR because fetch() can't report upload progress in browsers.
 */
export async function uploadToR2({ key, file, onProgress }) {
  const url = await presignPut(key, file.type || 'application/octet-stream');
  await putBytes(url, file, onProgress);
  return key;
}

/** PUT bytes to an already-signed URL, reporting real progress (0-100). */
export async function putBytes(url, file, onProgress) {
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress((e.loaded / e.total) * 100); };
    xhr.onload = () => { (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`R2 upload failed (${xhr.status})`)); };
    xhr.onerror = () => reject(new Error('R2 upload network error'));
    xhr.send(file);
  });
}

// ── Secure signer contract (secure-r2-signer) ──────────────────
// The caller never names an object key. Reads name a model; writes name a
// project and a filename and get the server-derived key back.

/** Presigned GET for a model the caller is allowed to see. */
export async function signModelDownload(modelId) {
  const { data, error } = await supabase.functions.invoke(R2_FN, { body: { op: 'get', model_id: modelId } });
  if (error) throw new Error(error.message || 'Could not get a model download URL');
  if (data?.error) throw new Error(data.error);
  return data?.url || null;
}

/**
 * Presigned PUT into a project the caller may write to. Returns the key the
 * SERVER chose — the caller must persist that, not one of its own.
 */
export async function signModelUpload(projectId, filename) {
  const { data, error } = await supabase.functions.invoke(R2_FN, {
    body: { op: 'put', project_id: projectId, filename },
  });
  if (error) throw new Error(error.message || 'Could not get a model upload URL');
  if (data?.error) throw new Error(data.error);
  if (!data?.key || !data?.url) throw new Error('Signer returned no key');
  return { key: data.key, url: data.url };
}

export { R2_SIGNER_IS_SECURE };
