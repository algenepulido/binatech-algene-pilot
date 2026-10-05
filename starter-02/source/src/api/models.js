// ============================================================
// BIM model files + extracted elements. Each project owns versioned
// models; the latest is "active". Elements carry the real IFC GUID and
// feed the link-to-element dropdowns. Additive only — older versions and
// their elements are kept, never deleted.
// ============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentProjectId } from '../lib/currentProject.js';
import { r2GetUrl, signModelDownload } from '../lib/r2.js';
import { R2_SIGNER_IS_SECURE } from '../lib/config.js';

const BUCKET = 'models';

export async function listModels(projectId = getCurrentProjectId()) {
  const { data, error } = await supabase.from('project_models').select('*').eq('project_id', projectId).order('version', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getActiveModel(projectId = getCurrentProjectId()) {
  const { data, error } = await supabase.from('project_models').select('*').eq('project_id', projectId).eq('is_active', true).order('version', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

/** Elements of the project's active model (empty if none uploaded yet). */
export async function listActiveElements(projectId = getCurrentProjectId()) {
  const model = await getActiveModel(projectId);
  if (!model) return [];
  // select('*') so a missing `level` column never errors (additive migration).
  const { data, error } = await supabase.from('model_elements').select('*').eq('model_id', model.id).order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Next version number for a project's models. */
async function nextVersion(projectId) {
  const { data } = await supabase.from('project_models').select('version').eq('project_id', projectId).order('version', { ascending: false }).limit(1);
  return ((data && data[0]?.version) || 0) + 1;
}

/**
 * Save the project_models row + model_elements after the file bytes are
 * already in storage. Marks the new version active and deactivates older
 * ones (kept, never deleted). Resilient to optional columns
 * (storage_backend, file_size) not existing yet — retries without them.
 */
export async function saveModelRecord({ projectId = getCurrentProjectId(), file, elements, storagePath, storageBackend = 'supabase', version }) {
  const v = version || (await nextVersion(projectId));
  await supabase.from('project_models').update({ is_active: false }).eq('project_id', projectId);

  const base = { project_id: projectId, file_name: file.name, storage_path: storagePath, version: v, is_active: true, element_count: elements.length };
  const full = { ...base, storage_backend: storageBackend, file_size: file.size ?? null };
  let ins = await supabase.from('project_models').insert(full).select().single();
  if (ins.error && /column|storage_backend|file_size/i.test(ins.error.message || '')) {
    ins = await supabase.from('project_models').insert(base).select().single(); // older schema
  }
  if (ins.error) throw ins.error;

  const modelId = ins.data.id;
  // Insert element metadata in batches. `level` (storey) is additive: if the
  // column doesn't exist yet, fall back to inserting without it.
  // `level` and the quantity columns (volume/area/length) are additive: if a
  // column doesn't exist yet, fall back to inserting without it.
  let useLevel = true, useQty = true;
  const make = (e) => {
    const b = { project_id: projectId, model_id: modelId, guid: e.guid, name: e.name, ifc_type: e.ifc_type };
    if (useLevel) b.level = e.level ?? null;
    if (useQty) { b.volume = e.volume ?? null; b.area = e.area ?? null; b.length = e.length ?? null; }
    return b;
  };
  for (let i = 0; i < elements.length; i += 500) {
    const batch = elements.slice(i, i + 500);
    let r = await supabase.from('model_elements').insert(batch.map(make));
    if (r.error && useQty && /volume|area|length|column/i.test(r.error.message || '')) {
      useQty = false; r = await supabase.from('model_elements').insert(batch.map(make));
    }
    if (r.error && useLevel && /level|column/i.test(r.error.message || '')) {
      useLevel = false; r = await supabase.from('model_elements').insert(batch.map(make));
    }
    if (r.error) throw r.error;
  }
  return ins.data;
}

/** Manual quantity entry / correction for one element (additive, graceful). */
export async function updateElementQuantity(guid, fields, projectId = getCurrentProjectId()) {
  const { error } = await supabase.from('model_elements').update(fields).eq('project_id', projectId).eq('guid', guid);
  if (error) { if (/volume|area|length|column/i.test(error.message || '')) throw new Error('Quantity columns not set up yet — run the model-quantity SQL.'); throw error; }
}

/** Add/edit a human description on one element (additive, graceful). */
export async function updateElementDescription(guid, description, projectId = getCurrentProjectId()) {
  const value = (description ?? '').toString().trim() || null;
  const { error } = await supabase.from('model_elements').update({ description: value }).eq('project_id', projectId).eq('guid', guid);
  if (error) { if (/description|column/i.test(error.message || '')) throw new Error('Description column not set up yet — run the model-description SQL.'); throw error; }
}

/**
 * Set USER metadata on an element (additive). Only writes the user_* columns —
 * never the IFC's native fields (guid, ifc_type, level, geometry, quantities).
 * `fields` is e.g. { user_display_name } / { user_material } / { user_notes }.
 */
export async function updateElementUserMeta(guid, fields, projectId = getCurrentProjectId()) {
  // Defensive: only ever pass through known user_* keys.
  const allowed = ['user_display_name', 'user_material', 'user_zone', 'user_notes'];
  const patch = {};
  for (const k of allowed) if (k in fields) patch[k] = fields[k];
  if (!Object.keys(patch).length) return;
  const { error } = await supabase.from('model_elements').update(patch).eq('project_id', projectId).eq('guid', guid);
  if (error) { if (/user_|column|notes/i.test(error.message || '')) throw new Error('User-metadata columns not set up yet — run the model-user-meta SQL.'); throw error; }
}

/**
 * Upload an .ifc to Supabase Storage + save the record. Kept for the
 * existing Settings uploader; the project-creation flow uses
 * api/modelUpload.js (which adds R2 + progress on top of saveModelRecord).
 */
export async function uploadModel({ projectId = getCurrentProjectId(), file, elements }) {
  const version = await nextVersion(projectId);
  const safe = file.name.replace(/[^\w.\-]+/g, '_');
  const path = `${projectId}/v${version}-${Date.now()}-${safe}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: 'application/octet-stream', upsert: false });
  if (up.error) throw up.error;
  return saveModelRecord({ projectId, file, elements, storagePath: path, storageBackend: 'supabase', version });
}

/** Remove the project's active model (non-destructive: deactivates it; the file
 *  + elements stay in history, project shows "no model" until a new upload). */
export async function deactivateModels(projectId = getCurrentProjectId()) {
  const { error } = await supabase.from('project_models').update({ is_active: false }).eq('project_id', projectId).eq('is_active', true);
  if (error) throw error;
}

/** Assign a model element (by GUID, in the project's active model) to a package. */
export async function updateElementPackage(guid, packageId, projectId = getCurrentProjectId()) {
  const { error } = await supabase.from('model_elements').update({ package_id: packageId }).eq('project_id', projectId).eq('guid', guid);
  if (error) throw error;
}

/** Active model (file_name, element_count, version, updated_at) for many
 *  projects in one query — powers the project overview cards. Never throws. */
export async function activeModelsByProject(projectIds = []) {
  if (!projectIds.length) return {};
  try {
    // select('*') (not a fixed column list) so a project on an older schema
    // — missing an optional column like file_size/storage_backend — can't make
    // the whole query error and blank the Model column for every project.
    const { data, error } = await supabase
      .from('project_models')
      .select('*')
      .in('project_id', projectIds)
      .eq('is_active', true);
    if (error) return {};
    const map = {};
    for (const m of data || []) map[m.project_id] = m;
    return map;
  } catch { return {}; }
}

/**
 * A readable URL for a stored model file. Routes to R2 (presigned GET) when
 * the record was stored there, else a Supabase Storage signed URL.
 * Accepts a model record OR (storagePath, backend).
 */
export async function modelFileUrl(modelOrPath, backendOrExpires = 3600) {
  const storagePath = typeof modelOrPath === 'string' ? modelOrPath : modelOrPath?.storage_path;
  const backend = typeof modelOrPath === 'object' ? (modelOrPath?.storage_backend || 'supabase') : (typeof backendOrExpires === 'string' ? backendOrExpires : 'supabase');
  if (backend === 'r2') {
    // The secure signer takes a model id and looks the key up itself; the
    // legacy one takes the key. Either way a failure must FALL THROUGH — the
    // old code documented that but could not do it, because r2GetUrl throws
    // and the throw escaped before the fallthrough line was reached.
    const modelId = typeof modelOrPath === 'object' ? modelOrPath?.id : null;
    try {
      const url = R2_SIGNER_IS_SECURE && modelId
        ? await signModelDownload(modelId)
        : await r2GetUrl(storagePath, 3600);
      if (url) return url;
    } catch {
      // fall through to Supabase Storage below
    }
  }
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}
