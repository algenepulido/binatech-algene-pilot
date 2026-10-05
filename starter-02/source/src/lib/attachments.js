// ============================================================
// Generic attachments — used by every module (WIR, NCR, snag, ...).
// Files live in the 'attachments' Storage bucket; a row in the
// `attachments` table records the path + metadata. `uploaded_by` is
// filled by the DB default (auth.uid()).
// ============================================================
import { supabase } from './supabase.js';
import { getCurrentProjectId } from './currentProject.js';

const BUCKET = 'attachments';

/** Upload a File for a given record and record it in the attachments table.
 *  `documentType` (optional) classifies WIR quality evidence — see
 *  src/lib/wirDocTypes.js. `project_id` scopes the row to the open project
 *  for tenancy (supabase/tenancy_enforcement.sql). Both are additive: if a
 *  column isn't migrated yet the insert retries without it. */
export async function uploadAttachment({ recordType, recordId, file, documentType = null }) {
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');

  // The object key is project-owned: <project_id>/<record_type>/<record_id>/<file>.
  // The project comes from the PARENT RECORD, never from the open-project
  // selection in localStorage — those can disagree, and the storage policy
  // authorizes on the path's first segment. Asking the database keeps the key,
  // the metadata row and the authorization decision talking about the same
  // project. The row's project_id is then set server-side by a trigger, so a
  // client that lies about it changes nothing.
  const { data: projectId, error: projErr } = await supabase.rpc('record_project_id', {
    p_record_type: recordType,
    p_record_id: recordId,
  });
  if (projErr) throw projErr;
  if (!projectId) throw new Error('Cannot attach a file: the parent record was not found.');

  const path = `${projectId}/${recordType}/${recordId}/${Date.now()}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (upErr) throw upErr;

  const row = {
    record_type: recordType,
    record_id: recordId,
    file_name: file.name,
    storage_path: path,
    content_type: file.type || null,
    size: file.size,
    document_type: documentType,
  };
  let { data, error } = await supabase.from('attachments').insert(row).select().single();
  // Graceful degradation for document_type only. The project_id retry was
  // REMOVED deliberately: it used to strip project_id and re-insert, which is
  // how live rows ended up unscoped in the first place. project_id is now set
  // by a server-side trigger and is NOT NULL, so there is nothing to strip and
  // an unscoped row can no longer be created.
  if (error && /document_type/i.test(error.message || '')) {
    const { document_type, ...rest } = row; // eslint-disable-line no-unused-vars
    ({ data, error } = await supabase.from('attachments').insert(rest).select().single());
  }
  if (error) throw error;
  return data;
}

/** Read-only bulk index: record_id -> attachment count for one record type,
 *  scoped to the current project and paginated past PostgREST's 1000-row cap.
 *  Used by display surfaces (e.g. the Certification Control Room evidence panel)
 *  to flag records with no evidence on file.
 *
 *  Returns `null` on a genuine load error — a distinct "UNKNOWN" sentinel so the
 *  caller never mistakes a failed query for "no evidence" and fabricates gaps.
 *  Degrades gracefully if the additive project_id column isn't migrated yet. */
export async function countAttachmentsByRecord(recordType, projectId = getCurrentProjectId()) {
  const PAGE = 1000;
  async function pageAll(scoped) {
    const m = {};
    for (let from = 0; ; from += PAGE) {
      let q = supabase.from('attachments').select('record_id').eq('record_type', recordType).range(from, from + PAGE - 1);
      if (scoped && projectId) q = q.eq('project_id', projectId);
      const { data, error } = await q;
      if (error) return { error };
      for (const r of data || []) m[r.record_id] = (m[r.record_id] || 0) + 1;
      if (!data || data.length < PAGE) return { m };
    }
  }
  try {
    let res = await pageAll(true);
    if (res.error && /project_id|column/i.test(res.error.message || '')) res = await pageAll(false);
    return res.error ? null : res.m;
  } catch { return null; }
}

export async function listAttachments(recordType, recordId) {
  const { data, error } = await supabase
    .from('attachments')
    .select('*')
    .eq('record_type', recordType)
    .eq('record_id', recordId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Short-lived signed URL for downloading/viewing a private object. */
export async function signedUrl(storagePath, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteAttachment(id, storagePath) {
  await supabase.storage.from(BUCKET).remove([storagePath]);
  const { error } = await supabase.from('attachments').delete().eq('id', id);
  if (error) throw error;
}
