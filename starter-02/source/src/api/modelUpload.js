// ============================================================
// Model file upload — the single entry the New-Project / upload flows use.
// Routes large BIM files to Cloudflare R2 (presigned PUT, real progress)
// when R2 is configured; otherwise falls back to Supabase Storage. After
// the bytes land in storage it writes the project_models + model_elements
// records via saveModelRecord.
// ============================================================
import { supabase } from '../lib/supabase.js';
import { saveModelRecord } from './models.js';
import { isR2Configured, uploadToR2, signModelUpload, putBytes } from '../lib/r2.js';
import { R2_SIGNER_IS_SECURE } from '../lib/config.js';

const BUCKET = 'models';

export async function uploadModelFile({ projectId, file, elements, onProgress }) {
  const safe = file.name.replace(/[^\w.\-]+/g, '_');
  const key = `${projectId}/${Date.now()}-${safe}`;

  // --- Preferred: Cloudflare R2 (cheap, no egress, multi-GB) ---
  if (await isR2Configured()) {
    onProgress?.(1);
    const report = (p) => onProgress?.(Math.max(1, Math.min(98, p)));
    let storedKey = key;
    if (R2_SIGNER_IS_SECURE) {
      // The SERVER decides the key from an authorized project. Persist what it
      // returns, never the locally-built one — if they ever disagree, the
      // server is right and the local guess would orphan the object.
      const signed = await signModelUpload(projectId, file.name);
      storedKey = signed.key;
      await putBytes(signed.url, file, report);
    } else {
      await uploadToR2({ key, file, onProgress: report });
    }
    onProgress?.(99);
    const saved = await saveModelRecord({ projectId, file, elements, storagePath: storedKey, storageBackend: 'r2' });
    onProgress?.(100);
    return saved;
  }

  // --- Fallback: Supabase Storage ---
  onProgress?.(4);
  const up = await supabase.storage.from(BUCKET).upload(key, file, { contentType: 'application/octet-stream', upsert: false });
  if (up.error) throw up.error;
  onProgress?.(92);
  const saved = await saveModelRecord({ projectId, file, elements, storagePath: key, storageBackend: 'supabase' });
  onProgress?.(100);
  return saved;
}
