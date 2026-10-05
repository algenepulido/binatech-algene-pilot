// ============================================================
// Approval delegations — temporary hand-overs of approval authority shown
// on the Approval Matrix screen. Scoped to the open project. Degrades
// gracefully if the table doesn't exist yet.
// ============================================================
import { supabase } from '../lib/supabase.js';
import { getCurrentProjectId } from '../lib/currentProject.js';

function missing(error) {
  const m = (error?.message || '').toLowerCase();
  return error?.code === '42P01' || (m.includes('does not exist') && m.includes('approval_delegations'));
}

export async function listDelegations(projectId = getCurrentProjectId()) {
  try {
    const { data, error } = await supabase
      .from('approval_delegations')
      .select('*')
      .eq('project_id', projectId)
      .order('start_date', { ascending: false });
    if (error) { if (missing(error)) return []; throw error; }
    return data ?? [];
  } catch (e) { if (missing(e)) return []; throw e; }
}

// Additive columns (from the approval_delegation_escalation migration). If they
// aren't provisioned yet, strip them and retry so role-based delegation still works.
const NEW_FIELDS = ['from_user_id', 'to_user_id', 'note'];
async function insertDelegation(payload) {
  const { data, error } = await supabase.from('approval_delegations').insert(payload).select().single();
  if (!error) return data;
  const msg = (error.message || '').toLowerCase();
  if (NEW_FIELDS.some((f) => msg.includes(f))) {
    const stripped = { ...payload };
    for (const f of NEW_FIELDS) delete stripped[f];
    const { data: d2, error: e2 } = await supabase.from('approval_delegations').insert(stripped).select().single();
    if (e2) throw e2;
    return d2;
  }
  throw error;
}

export async function createDelegation(fields, projectId = getCurrentProjectId()) {
  return insertDelegation({
    project_id: projectId,
    tier: fields.tier || null,
    from_role: (fields.from_role || '').trim() || null,
    to_role: (fields.to_role || '').trim() || null,
    from_user_id: fields.from_user_id || null,
    to_user_id: fields.to_user_id || null,
    note: (fields.note || '').trim() || null,
    start_date: fields.start_date || new Date().toISOString().slice(0, 10),
    end_date: fields.end_date || null,
  });
}

// "I'm out of office — cover my approvals." The current user delegates to another
// user (or a role) for a date range. Recorded for the audit trail (on-behalf-of).
export async function setMyDelegate({ to_user_id, to_role, start_date, end_date, note }, projectId = getCurrentProjectId()) {
  let me = null;
  try { const { data: u } = await supabase.auth.getUser(); me = u?.user?.id || null; } catch { /* anon */ }
  return insertDelegation({
    project_id: projectId,
    from_user_id: me,
    to_user_id: to_user_id || null,
    to_role: (to_role || '').trim() || null,
    note: (note || '').trim() || null,
    start_date: start_date || new Date().toISOString().slice(0, 10),
    end_date: end_date || null,
  });
}
