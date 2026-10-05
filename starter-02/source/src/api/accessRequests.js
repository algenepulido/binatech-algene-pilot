// ============================================================
// Access-requests API — scaffold for the request → approve flow (ACCESS_FLOW.md).
//
// ⚠️ NOT A SECURITY BOUNDARY. Writing a request or approving one records intent;
// it does NOT grant secure access. The secure INVITE (one-time link, user sets
// own password) is Supabase Auth's admin invite via an Edge Function with the
// service_role key — NOT here, NEVER in the frontend. Enforcement = RLS
// (co-founder). All functions degrade gracefully if the additive table
// (supabase/access_model_additive.sql) isn't provisioned yet.
// ============================================================
import { supabase } from '../lib/supabase.js';
import { functionUrl, SUPABASE_ANON_KEY } from '../lib/config.js';

function missingTable(e) {
  const m = (e?.message || '').toLowerCase();
  return e?.code === '42P01' || m.includes('does not exist') || (m.includes('relation') && m.includes('access_request'));
}

/**
 * File a pending access request through the SECURE Edge Function
 * (submit-access-request). The browser NEVER inserts into access_requests
 * directly — RLS keeps that table default-deny, and a direct anon insert is the
 * "violates row-level security policy" error. The function validates and inserts
 * with the service role server-side. Returns { ok, provisioned, error }; never
 * surfaces raw DB/RLS text. provisioned:false means the function isn't deployed
 * yet (show the contact-admin fallback).
 */
export async function submitAccessRequest({ name, email, company_name, requested_role, message }) {
  const anon = SUPABASE_ANON_KEY;
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess?.session?.access_token || anon;
    const res = await fetch(functionUrl('submit-access-request'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: (name || '').trim() || null,
        email: (email || '').trim().toLowerCase(),
        company_name: (company_name || '').trim() || null,
        requested_role: requested_role || null,
        message: (message || '').trim() || null,
      }),
    });
    if (res.status === 404) return { ok: false, provisioned: false }; // function not deployed yet
    let payload = {};
    try { payload = await res.json(); } catch { /* non-JSON */ }
    if (res.ok && payload.ok) return { ok: true, provisioned: true };
    return { ok: false, provisioned: true, error: payload.error || 'Could not submit your request. Please try again.' };
  } catch {
    return { ok: false, provisioned: true, error: 'Could not submit your request. Please try again.' };
  }
}

/** Requests for the admin review screen. Returns { provisioned, rows }. */
export async function listAccessRequests(status = 'pending') {
  try {
    const { data, error } = await supabase.from('access_requests').select('*').eq('status', status).order('requested_at', { ascending: false });
    if (error) { if (missingTable(error)) return { provisioned: false, rows: [] }; throw error; }
    return { provisioned: true, rows: data || [] };
  } catch (e) {
    if (missingTable(e)) return { provisioned: false, rows: [] };
    throw e;
  }
}

/** Approve/deny a request. decision: 'approved' | 'denied'.
 *  Sends ONLY the decision: decided_by/decided_at are server-stamped by the
 *  access_requests_decide trigger and client values are discarded — sending
 *  them just misleads a reader into thinking the client is trusted. The
 *  .select() zero-row check turns an RLS-filtered "not your project's
 *  request" into an explicit error instead of silent success. */
export async function decideAccessRequest(id, decision) {
  const { data, error } = await supabase.from('access_requests')
    .update({ status: decision })
    .eq('id', id)
    .select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('You are not authorized to decide this request.');
}
