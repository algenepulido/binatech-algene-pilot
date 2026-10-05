// ============================================================
// Projects — the multi-project layer. Each signed-in user owns their
// projects (owner = auth.uid(), enforced by RLS). The built-in sample
// project (SYN-SAMPLE) is a synthetic card shown to everyone and is NOT a row
// here, so existing shared data keeps working untouched.
//
// All functions degrade gracefully: if the `projects` table doesn't exist
// yet (owner hasn't run the SQL in DESIGN_LOG.md), they behave as if there
// are simply no custom projects, so the app never crashes.
// ============================================================
import { supabase } from '../lib/supabase.js';
import { SAMPLE_PROJECT_ID } from '../lib/currentProject.js';

// The always-present sample project card (not stored in the DB).
export const SAMPLE_PROJECT = {
  id: SAMPLE_PROJECT_ID,
  code: SAMPLE_PROJECT_ID,
  name: 'Sample — Business Center',
  name_ar: 'نموذج — مركز أعمال',
  client: 'Fictional Sample Developer Co.',
  consultant: 'Fictional Sample Consultants',
  contractor: 'Fictional Sample Contracting Co.',
  status: 'sample',
  is_sample: true,
  created_at: null,
  updated_at: null,
  thumbnail_url: null,
};

function isMissingTable(error) {
  const m = (error?.message || '').toLowerCase();
  return error?.code === '42P01' || m.includes('does not exist') || m.includes('relation') && m.includes('projects');
}

// Days a soft-deleted project is recoverable before it's permanently purged.
export const TRASH_RETENTION_DAYS = 30;

/** The current user's LIVE projects (excludes soft-deleted), newest first.
 *  Filters deleted_at client-side so it works before the column migration. */
export async function listProjects() {
  try {
    const { data, error } = await supabase.from('projects').select('*').order('updated_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
    if (error) { if (isMissingTable(error)) return []; throw error; }
    return (data ?? []).filter((p) => !p.deleted_at);
  } catch (e) {
    if (isMissingTable(e)) return [];
    throw e;
  }
}

/** Soft-deleted projects still inside the recovery window, with days_left. */
export async function listDeletedProjects() {
  try {
    const { data, error } = await supabase.from('projects').select('*');
    if (error) { if (isMissingTable(error)) return []; throw error; }
    const now = Date.now();
    return (data ?? [])
      .filter((p) => p.deleted_at)
      .map((p) => { const elapsed = (now - new Date(p.deleted_at).getTime()) / 86400000; return { ...p, days_left: Math.max(0, Math.ceil(TRASH_RETENTION_DAYS - elapsed)) }; })
      .sort((a, b) => new Date(b.deleted_at) - new Date(a.deleted_at));
  } catch (e) {
    if (isMissingTable(e)) return [];
    throw e;
  }
}

export async function getProject(id) {
  if (!id || id === SAMPLE_PROJECT_ID) return SAMPLE_PROJECT;
  const { data, error } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
  if (error) { if (isMissingTable(error)) return null; throw error; }
  return data;
}

/** Create a project. Ownership is NOT sent: since ACCESS-1 (migration 000030)
 *  the projects_authorize trigger stamps `owner` from auth.uid() and discards
 *  whatever the client supplied, and projects_seed_owner_membership creates the
 *  owner's membership row in the same transaction. Sending an owner here would
 *  be an assertion the server ignores — and shipping a value that is silently
 *  overwritten is how a client comes to believe it decides ownership. */
export async function createProject({ name, client, consultant, contractor, name_ar }) {
  const payload = {
    name: (name || '').trim() || 'Untitled project',
    name_ar: (name_ar || '').trim() || null,
    client: (client || '').trim() || null,
    consultant: (consultant || '').trim() || null,
    contractor: (contractor || '').trim() || null,
    status: 'active',
  };
  const { data, error } = await supabase.from('projects').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateProject(id, fields) {
  const { data, error } = await supabase.from('projects').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}


const isMissingCol = (e) => /deleted_at|column/i.test(e?.message || '');

/** Soft-delete: mark the project deleted (recoverable for 30 days). Child data
 *  is LEFT IN PLACE so it can be restored; it's removed only on permanent purge.
 *  A missing migration fails closed: soft delete must never degrade into an
 *  irreversible hard delete. */
export async function deleteProject(id) {
  if (!id || id === SAMPLE_PROJECT_ID) throw new Error('The sample project cannot be deleted.');
  const { error } = await supabase.from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) {
    if (isMissingCol(error)) throw new Error('A database update is required before projects can be deleted safely.');
    throw error;
  }
  return { soft: true };
}

/** Restore a soft-deleted project (within the recovery window). */
export async function restoreProject(id) {
  const { error } = await supabase.from('projects').update({ deleted_at: null }).eq('id', id);
  if (error) throw error;
}

/** Start or resume the durable server-side permanent purge. The Edge workflow
 *  freezes the project, deletes verified Supabase/R2 objects, proves both stores
 *  empty, and only then finalizes relational deletion. */
export async function purgeProject(id) {
  if (!id || id === SAMPLE_PROJECT_ID) throw new Error('The sample project cannot be deleted.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('A valid project id is required.');
  }
  const { data, error } = await supabase.functions.invoke('purge-project', {
    body: { project_id: id },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  if (!data?.job_id || !['waiting', 'in_progress', 'completed'].includes(data?.status)) {
    throw new Error('Project purge returned an invalid response. Retry the same project.');
  }
  return data;
}

/** Best-effort client-side backstop: start/resume the same durable Edge workflow
 *  for soft-deleted projects whose recovery window has elapsed. */
export async function purgeExpiredProjects() {
  let n = 0;
  try {
    const deleted = await listDeletedProjects();
    for (const p of deleted) { if (p.days_left <= 0) { try { await purgeProject(p.id); n++; } catch { /* ignore */ } } }
  } catch { /* ignore */ }
  return n;
}

/** Bump updated_at so the project sorts to the top of the overview. */
export async function touchProject(id) {
  if (!id || id === SAMPLE_PROJECT_ID) return;
  try { await supabase.from('projects').update({ updated_at: new Date().toISOString() }).eq('id', id); } catch { /* ignore */ }
}
