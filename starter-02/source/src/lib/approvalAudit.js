// ============================================================
// Approval audit — record WHO approved, WHEN, and ON WHOSE BEHALF (delegation),
// additively. The certification chain is NOT touched: this only annotates the
// status transition that ApprovalsView already performs. If the audit columns
// aren't migrated yet (approval_delegation_escalation_additive.sql), the fields
// are stripped and the update is retried, so existing WIR/IPC/invoice approvals
// and the recertify flow can never be blocked.
// ============================================================
import { supabase } from './supabase.js';

const AUDIT_FIELDS = ['approved_by', 'approved_at', 'approved_on_behalf_of'];

/**
 * If an active delegation makes ME the approver on someone else's behalf today,
 * return that delegator's user id (so the approval records on-behalf-of).
 * Project-scoped, date-ranged. Returns null if none / table or column absent.
 */
export async function actingOnBehalfOf(projectId) {
  try {
    const { data: u } = await supabase.auth.getUser();
    const me = u?.user?.id;
    if (!me) return null;
    const today = new Date().toISOString().slice(0, 10);
    let q = supabase.from('approval_delegations').select('from_user_id, start_date, end_date').eq('to_user_id', me).lte('start_date', today);
    if (projectId) q = q.eq('project_id', projectId);
    const { data, error } = await q;
    if (error || !data) return null;
    const active = data.find((d) => d.from_user_id && (!d.end_date || d.end_date >= today));
    return active?.from_user_id || null;
  } catch { return null; }
}

/**
 * Apply a status transition (e.g. { result: 'approved' }) AND record the audit
 * fields. Never throws on a missing audit column — it strips them and retries,
 * so the underlying approval always goes through exactly as before.
 */
export async function approveWithAudit(table, id, statusPatch, { onBehalfOf = null } = {}) {
  let me = null;
  try { const { data: u } = await supabase.auth.getUser(); me = u?.user?.id || null; } catch { /* anon */ }
  const patch = { ...statusPatch };
  if (me) { patch.approved_by = me; patch.approved_at = new Date().toISOString(); }
  if (onBehalfOf) patch.approved_on_behalf_of = onBehalfOf;

  const { error } = await supabase.from(table).update(patch).eq('id', id);
  if (!error) return;
  const msg = (error.message || '').toLowerCase();
  if (AUDIT_FIELDS.some((f) => msg.includes(f))) {
    const { error: e2 } = await supabase.from(table).update(statusPatch).eq('id', id);
    if (e2) throw e2;
    return;
  }
  throw error;
}

/**
 * Age of a queued item in whole days, from queued_at (fallback created_at).
 * Returns { days, escalated } given the project's threshold (default 3).
 */
export function approvalAge(row, thresholdDays = 3) {
  const ts = row?.queued_at || row?.created_at;
  if (!ts) return { days: 0, escalated: false };
  const ms = Date.now() - new Date(ts).getTime();
  const days = Math.max(0, Math.floor(ms / 86400000));
  return { days, escalated: days >= (thresholdDays || 3) };
}
