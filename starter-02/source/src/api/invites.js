// ============================================================
// Invites API — shareable, single-use, expiring invite links.
//
// Creating an invite: the browser generates a random token with a CSPRNG,
// stores only its SHA-256 HASH in project_invites (RLS lets project managers
// insert), and returns a link carrying the RAW token. The raw token never
// touches the database — possession of the link is the bearer secret.
//
// Accepting an invite: the new member can't add themselves (RLS), so acceptance
// goes through the accept-invite Edge Function (service role), which validates
// the token and creates the membership. Functions degrade gracefully if the
// schema/function isn't provisioned yet (provisioned:false).
// ============================================================
import { supabase } from '../lib/supabase.js';
import { functionUrl, SUPABASE_ANON_KEY } from '../lib/config.js';
import { getCurrentProjectId } from '../lib/currentProject.js';

const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function missingTable(e) {
  const m = (e?.message || '').toLowerCase();
  return e?.code === '42P01' || (m.includes('does not exist') && m.includes('invite')) || (m.includes('relation') && m.includes('invite'));
}

// Random URL-safe token (32 bytes → 64 hex chars) using the browser CSPRNG.
function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
function inviteLink(token) {
  const origin = (typeof window !== 'undefined' && window.location?.origin) || 'https://pilot-starter.invalid';
  return `${origin}/#/accept-invite?token=${token}`;
}

/**
 * Create a shareable invite. Returns { provisioned, link, role, email } or
 * { provisioned:false } if project_invites isn't set up yet. Only a project
 * manager can do this (RLS); a viewer/editor insert returns an RLS error.
 */
export async function createInvite({ email, role = 'viewer', projectId = getCurrentProjectId() }) {
  if (!isUuid(projectId)) return { provisioned: true, error: 'Open a real project before inviting (the sample project can’t hold members).' };
  const token = randomToken();
  const token_hash = await sha256Hex(token);
  const { data: u } = await supabase.auth.getUser();
  try {
    const { data, error } = await supabase.from('project_invites').insert({
      project_id: projectId,
      role,
      email: (email || '').trim().toLowerCase() || null,
      token_hash,
      status: 'pending',
      invited_by: u?.user?.id ?? null,
    }).select().single();
    if (error) { if (missingTable(error)) return { provisioned: false }; throw error; }
    return { provisioned: true, link: inviteLink(token), role: data.role, email: data.email, id: data.id, expires_at: data.expires_at };
  } catch (e) {
    if (missingTable(e)) return { provisioned: false };
    throw e;
  }
}

/**
 * Create an invite AND email the join link via the send-invite Edge Function.
 * The token is minted server-side; this returns { ok, provisioned, link, emailed,
 * emailError, error }. emailed:false means the invite exists and the link works,
 * but no email went out (Resend not configured yet) — show the copyable link.
 * provisioned:false → the function isn't deployed yet.
 */
export async function sendInvite({ email, role = 'viewer', projectId = getCurrentProjectId() }) {
  if (!isUuid(projectId)) return { ok: false, provisioned: true, error: 'Open a real project before inviting (the sample project can’t hold members).' };
  const anon = SUPABASE_ANON_KEY;
  try {
    const { data: sess } = await supabase.auth.getSession();
    const access = sess?.session?.access_token;
    if (!access) return { ok: false, provisioned: true, error: 'Sign in to send an invite.' };
    const res = await fetch(functionUrl('send-invite'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${access}` },
      body: JSON.stringify({ project_id: projectId, role, email: (email || '').trim().toLowerCase() }),
    });
    if (res.status === 404) return { ok: false, provisioned: false };
    let payload = {};
    try { payload = await res.json(); } catch { /* non-JSON */ }
    if (res.ok && payload.ok) return { ok: true, provisioned: true, link: payload.link, emailed: !!payload.emailed, emailError: payload.emailError || null };
    return { ok: false, provisioned: true, error: payload.error || 'Could not send the invite.' };
  } catch {
    return { ok: false, provisioned: true, error: 'Could not send the invite. Please try again.' };
  }
}

/** Pending invites for the current project (managers only, via RLS). { provisioned, rows }. */
export async function listInvites(projectId = getCurrentProjectId()) {
  if (!isUuid(projectId)) return { provisioned: true, rows: [] };
  try {
    const { data, error } = await supabase.from('project_invites')
      .select('id,email,role,status,expires_at,created_at').eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) { if (missingTable(error)) return { provisioned: false, rows: [] }; throw error; }
    return { provisioned: true, rows: data || [] };
  } catch (e) {
    if (missingTable(e)) return { provisioned: false, rows: [] };
    throw e;
  }
}

/** Revoke a pending invite so its link can no longer be redeemed. */
export async function revokeInvite(id) {
  const { data, error } = await supabase.from('project_invites').update({ status: 'revoked' }).eq('id', id).select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('You are not authorized to revoke this invite.');
}

/**
 * Redeem an invite link. Calls the accept-invite Edge Function with the caller's
 * session. Returns { ok, provisioned, project_id, project_name, role, error }.
 * provisioned:false → the function isn't deployed yet (show a contact-admin note).
 */
export async function acceptInvite(token) {
  const anon = SUPABASE_ANON_KEY;
  try {
    const { data: sess } = await supabase.auth.getSession();
    const access = sess?.session?.access_token;
    if (!access) return { ok: false, provisioned: true, error: 'Sign in to accept the invite.' };
    const res = await fetch(functionUrl('accept-invite'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${access}` },
      body: JSON.stringify({ token }),
    });
    if (res.status === 404) return { ok: false, provisioned: false };
    let payload = {};
    try { payload = await res.json(); } catch { /* non-JSON */ }
    if (res.ok && payload.ok) return { ok: true, provisioned: true, project_id: payload.project_id, project_name: payload.project_name, role: payload.role };
    return { ok: false, provisioned: true, error: payload.error || 'Could not accept the invite.' };
  } catch {
    return { ok: false, provisioned: true, error: 'Could not accept the invite. Please try again.' };
  }
}
