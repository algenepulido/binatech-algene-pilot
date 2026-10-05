// ============================================================
// Access (memberships) API — scaffold for the Team & Access screen.
//
// ⚠️ NOT A SECURITY BOUNDARY. These functions read/write membership RECORDS so
// an admin can plan who-gets-what. They do NOT enforce access — enforcement is
// the Supabase RLS work in ACCESS_MODEL.md §5. Until that lands, role rows
// assigned here restrict nothing. Every function degrades gracefully if the
// additive tables (supabase/access_model_additive.sql) aren't provisioned yet.
// ============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentProjectId } from '../lib/currentProject.js';
// The functional-role catalogue + labels live in one place (the permission
// matrix). Re-exported here so existing imports keep working.
export { ROLES, roleLabel } from '../lib/permissions.js';

/**
 * The signed-in user's role on a project — for UI gating. Project owner → admin.
 * Sample (non-uuid) project → admin (local demo). Never throws; null on failure
 * (callers treat null as "still loading → show everything").
 */
export async function getMyRole(projectId = getCurrentProjectId()) {
  if (!isUuid(projectId)) return 'admin';
  try {
    const { data: u } = await supabase.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) return null;
    const { data: proj } = await supabase.from('projects').select('owner').eq('id', projectId).maybeSingle();
    if (proj && proj.owner === uid) return 'admin';
    const { data: mem } = await supabase.from('memberships').select('role')
      .eq('project_id', projectId).eq('user_id', uid).neq('status', 'revoked').limit(1).maybeSingle();
    return mem?.role || 'viewer';
  } catch { return null; }
}

const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function missingTable(e) {
  const m = (e?.message || '').toLowerCase();
  return e?.code === '42P01' || m.includes('does not exist') || (m.includes('relation') && m.includes('membership'));
}

/** Members visible for a project (project-scoped + company-wide). Never throws.
 *  Returns { provisioned, rows } so the UI can show a setup hint if the
 *  additive schema hasn't been run yet. */
export async function listMembers(projectId = getCurrentProjectId()) {
  try {
    const { data, error } = await supabase.from('memberships').select('*').order('created_at', { ascending: true });
    if (error) { if (missingTable(error)) return { provisioned: false, rows: [] }; throw error; }
    const rows = (data || []).filter((r) => r.project_id == null || r.project_id === projectId);
    return { provisioned: true, rows };
  } catch (e) {
    if (missingTable(e)) return { provisioned: false, rows: [] };
    throw e;
  }
}

/* inviteMember() was REMOVED in ACCESS-2.
 *
 * It wrote a membership row directly with status 'invited' and no user_id —
 * a pending invitation parked in the access table. That produced two problems
 * the ACCESS-1A audit proved: the row was indistinguishable to the predicates
 * from a real membership (only `<> 'revoked'` stood between it and full
 * access), and invite acceptance, which looks a membership up BY user_id,
 * could never find it — so accepting left the placeholder behind and inserted
 * a second row.
 *
 * A pending invitation now lives where it belongs, in project_invites. Use
 * sendInvite() from src/api/invites.js. Migration 000032 enforces this
 * server-side: the database refuses a membership that is not 'active',
 * 'suspended' or 'revoked', and refuses one with no user_id. */

export async function updateMemberRole(id, role) {
  // .select() is load-bearing: without it, a row RLS filtered out (not yours
  // to manage) updates ZERO rows with NO error — an authorization failure
  // dressed as success. The guard trigger raises for policy violations; the
  // zero-row check catches the silently-filtered case.
  const { data, error } = await supabase.from('memberships').update({ role }).eq('id', id).select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('You are not authorized to change this member’s role.');
}

export async function revokeMember(id) {
  const { data, error } = await supabase.from('memberships').update({ status: 'revoked' }).eq('id', id).select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('You are not authorized to revoke this member.');
}
