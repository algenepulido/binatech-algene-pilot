// ============================================================
// TeamAccessView — SCAFFOLD for the Admin "Team & Access" screen.
//
// ⚠️ NOT-YET-ENFORCED. This screen lets an admin plan memberships (invite by
// email, assign a role per project, change/revoke). It manages membership
// RECORDS only — it does NOT control access. Real access control requires the
// Supabase RLS work in ACCESS_MODEL.md §5 (co-founder). A persistent banner
// makes this explicit so the product is never presented as access-controlled.
// ============================================================
import { useCallback, useEffect, useState } from 'react';
import { StyledSelect } from '../components/StyledSelect.jsx';
import { confirmDialog } from '../components/ConfirmDialog.jsx';
import { ShieldAlert, UserPlus, Trash2, Mail, Check, X, Link2, Copy, Clock } from 'lucide-react';
import { PageHeader, Btn } from '../components/primitives.jsx';
import { toast } from '../components/Toast.jsx';
import { COL } from '../lib/theme.js';
import { useAuth } from '../lib/auth.jsx';
import { useProject } from '../lib/project.jsx';
import { ROLES, roleLabel, listMembers, updateMemberRole, revokeMember } from '../api/access.js';
import { listAccessRequests, decideAccessRequest } from '../api/accessRequests.js';
import { sendInvite, listInvites, revokeInvite } from '../api/invites.js';
import { TEAM_ACCESS_COPY as TR } from './teamAccessCopy.js';

export function TeamAccessView({ t, lang = 'en' }) {
  const L = TR[lang] || TR.en;
  const { requireAuth, user } = useAuth();
  const { project } = useProject();
  const [provisioned, setProvisioned] = useState(true);
  const [rows, setRows] = useState([]);
  const [reqs, setReqs] = useState([]);
  const [invites, setInvites] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [lastLink, setLastLink] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const { provisioned: p, rows: r } = await listMembers(); setProvisioned(p); setRows(r);
      const { rows: rq } = await listAccessRequests('pending'); setReqs(rq);
      const { rows: iv } = await listInvites(); setInvites((iv || []).filter((i) => i.status === 'pending'));
    } catch (e) { setErr(e?.message || String(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Approve: record the decision, then send a real INVITATION.
  //
  // This used to call inviteMember(), which wrote a membership row directly
  // with status 'invited' and no user_id — a pending invitation parked in the
  // access table. Since ACCESS-2 (migration 000032) a membership records an
  // ACTUAL user's access and the database refuses to create one in a pending
  // state, so approving a request mints a project_invites row instead and the
  // membership appears only when the invitation is accepted.
  //
  // Approving is a decision to invite, not a grant of access.
  const approve = (r) => requireAuth(async () => {
    // Granting access is an access-control change — confirm before it happens.
    if (!await confirmDialog({ title: 'Approve access request?', message: `${r.name || r.email} will be sent a join link for ${r.requested_role || 'viewer'} access. They get access when they accept it.`, confirmLabel: 'Approve & invite' })) return;
    try {
      await decideAccessRequest(r.id, 'approved');
      const res = await sendInvite({ email: r.email, role: r.requested_role || 'viewer' });
      if (res?.error) setErr(res.error);
      else if (res?.emailed === false) setErr(`Invitation created, but no email was sent${res.emailError ? ` (${res.emailError})` : ''}. Share the link from the invite list.`);
      await load();
    } catch (e) { setErr(e?.message || String(e)); }
  });
  const deny = (r) => requireAuth(async () => {
    try { await decideAccessRequest(r.id, 'denied'); await load(); } catch (e) { setErr(e?.message || String(e)); }
  });

  // Email is required — we email the join link to this address.
  const emailOk = /\S+@\S+\.\S+/.test(email);
  const invite = () => requireAuth(async () => {
    if (!emailOk) return;
    setBusy(true); setErr(''); setLastLink(''); setCopied(false);
    try {
      const to = email.trim();
      const res = await sendInvite({ email: to, role });
      if (res.provisioned === false) { setErr(L.notProvisionedInvite); }
      else if (res.error) { setErr(res.error); }
      else if (res.ok) {
        if (res.emailed) toast.success(`${L.emailedTo} ${to}`);
        else toast.info(L.linkOnly);
        if (res.link) setLastLink(res.link);
        setEmail(''); await load();
      }
    } catch (e) { setErr(e?.message || String(e)); }
    setBusy(false);
  });
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(lastLink); setCopied(true); toast.success(L.copied); setTimeout(() => setCopied(false), 2000); }
    catch { setErr('Copy failed — select and copy the link manually.'); }
  };
  const dropInvite = (id) => requireAuth(async () => { if (!await confirmDialog(L.revoke + '?')) return; try { await revokeInvite(id); await load(); } catch (e) { setErr(e?.message || String(e)); } });
  const changeRole = (id, r) => requireAuth(async () => {
    // A role change is an access-control change — confirm before applying it.
    if (!await confirmDialog({ title: 'Change this member’s role?', message: `Their access on ${project.name} will change to “${roleLabel ? roleLabel(r, lang) : r}”.`, confirmLabel: 'Change role' })) { await load(); return; }
    try { await updateMemberRole(id, r); await load(); } catch (e) { setErr(e?.message || String(e)); }
  });
  const revoke = (id) => requireAuth(async () => { if (!await confirmDialog('Revoke this member’s role?')) return; try { await revokeMember(id); await load(); } catch (e) { setErr(e?.message || String(e)); } });

  const statusLabel = (s) => (s === 'active' ? L.active : s === 'revoked' ? L.revoked : L.invited);
  const inputStyle = { background: COL.surface, borderColor: COL.borderStrong, color: COL.text };

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: COL.bg }}>
      <PageHeader title={L.title} subtitle={`${L.subtitle} · ${project.name}`} />

      <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
        {/* Persistent NOT-ENFORCED banner */}
        <div role="alert" className="rounded-2xl border p-3.5 flex items-start gap-3" style={{ background: '#fffbeb', borderColor: '#f59e0b' }}>
          <ShieldAlert size={18} className="flex-shrink-0 mt-0.5" style={{ color: '#b45309' }} />
          <div className="text-[12.5px] leading-relaxed" style={{ color: '#92400e' }}>{L.notEnforced}</div>
        </div>

        {!provisioned ? (
          <div className="rounded-2xl border p-4 text-[13px]" style={{ background: COL.surface, borderColor: COL.border, color: COL.textDim }}>{L.notProvisioned}</div>
        ) : (
          <>
            {/* Access requests (pending) */}
            <div className="rounded-2xl border overflow-hidden" style={{ background: COL.surface, borderColor: COL.border, boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
              <div className="px-4 py-2.5 border-b mono text-[10px] tracking-widest" style={{ borderColor: COL.border, color: COL.textMute }}>{L.requests.toUpperCase()} · {reqs.length}</div>
              <div className="px-4 py-2 text-[11px]" style={{ color: COL.textMute }}>{L.inviteNote}</div>
              {reqs.length === 0 ? (
                <div className="px-4 pb-4 text-[13px]" style={{ color: COL.textMute }}>{L.noRequests}</div>
              ) : (
                <div className="divide-y" style={{ borderColor: COL.border }}>
                  {reqs.map((r) => (
                    <div key={r.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate" style={{ color: COL.text }}>{r.name || r.email}{r.company_name ? ` · ${r.company_name}` : ''}</div>
                        <div className="text-[11px] mt-0.5" style={{ color: COL.textMute }}>{r.email} · {roleLabel(r.requested_role, lang)}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => approve(r)} className="inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-full text-white" style={{ background: '#16a34a' }}><Check size={13} /> {L.approve}</button>
                        <button onClick={() => deny(r)} className="inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-full border" style={{ borderColor: COL.borderStrong, color: '#b91c1c' }}><X size={13} /> {L.deny}</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Invite by link */}
            <div className="rounded-2xl border p-4" style={{ background: COL.surface, borderColor: COL.border, boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
              <div className="flex items-center gap-1.5 text-[13px] font-semibold mb-1" style={{ color: COL.text }}><Link2 size={14} /> {L.inviteHead}</div>
              <div className="text-[11.5px] mb-3" style={{ color: COL.textMute }}>{L.inviteHint}</div>
              <div className="flex flex-col sm:flex-row gap-2.5 sm:items-end">
                <div className="flex-1">
                  <label htmlFor="ta-email" className="block text-[11px] font-semibold mb-1" style={{ color: COL.textDim }}>{lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}</label>
                  <div className="relative">
                    <Mail size={14} className="absolute start-2.5 top-1/2 -translate-y-1/2" style={{ color: COL.textMute }} />
                    <input id="ta-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={L.emailPh} className="w-full ps-8 pe-2 py-2 text-[13px] rounded-lg border outline-none" style={inputStyle} />
                  </div>
                </div>
                <div className="sm:w-56">
                  <label htmlFor="ta-role" className="block text-[11px] font-semibold mb-1" style={{ color: COL.textDim }}>{L.role}</label>
                  <StyledSelect id="ta-role" ariaLabel="Invite role" value={role} onChange={setRole} options={ROLES.map((r) => ({ value: r.id, label: roleLabel(r.id, lang) }))} />
                </div>
                <Btn icon={UserPlus} variant="primary" disabled={!emailOk || busy} onClick={invite}>{busy ? '…' : L.invite}</Btn>
              </div>
              {lastLink && (
                <div className="mt-3 rounded-xl border p-3" style={{ background: '#f0fdf4', borderColor: '#86efac' }}>
                  <div className="text-[12px] font-semibold mb-1.5" style={{ color: '#166534' }}>{L.linkReady}</div>
                  <div className="flex items-stretch gap-2">
                    <input readOnly value={lastLink} onFocus={(e) => e.target.select()} className="flex-1 px-2.5 py-2 text-[12px] rounded-lg border mono outline-none" style={{ background: '#fff', borderColor: '#86efac', color: COL.text }} />
                    <button onClick={copyLink} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold text-white" style={{ background: copied ? '#16a34a' : COL.accent }}>
                      {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? L.copied : L.copy}
                    </button>
                  </div>
                </div>
              )}
              {err && <div className="text-[12px] mt-2" style={{ color: '#b91c1c' }}>{err}</div>}
            </div>

            {/* Pending invites */}
            {invites.length > 0 && (
              <div className="rounded-2xl border overflow-hidden" style={{ background: COL.surface, borderColor: COL.border, boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
                <div className="px-4 py-2.5 border-b mono text-[10px] tracking-widest" style={{ borderColor: COL.border, color: COL.textMute }}>{L.invites.toUpperCase()} · {invites.length}</div>
                <div className="px-4 py-2 text-[11px]" style={{ color: COL.textMute }}>{L.invitesNote}</div>
                <div className="divide-y" style={{ borderColor: COL.border }}>
                  {invites.map((iv) => (
                    <div key={iv.id} className="px-4 py-3 flex items-center gap-2.5">
                      <Clock size={14} style={{ color: COL.textMute }} className="flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate" style={{ color: COL.text }}>{iv.email || (lang === 'ar' ? 'رابط مشترك' : 'Shareable link')} · {roleLabel(iv.role, lang)}</div>
                        <div className="text-[11px] mt-0.5" style={{ color: COL.textMute }}>{L.expires} {iv.expires_at ? new Date(iv.expires_at).toLocaleDateString() : '—'}</div>
                      </div>
                      <button onClick={() => dropInvite(iv.id)} className="p-1.5 rounded-lg hover:bg-red-50" style={{ color: '#b91c1c' }} aria-label={L.revoke} title={L.revoke}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Members */}
            <div className="rounded-2xl border overflow-hidden" style={{ background: COL.surface, borderColor: COL.border, boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
              <div className="px-4 py-2.5 border-b mono text-[10px] tracking-widest" style={{ borderColor: COL.border, color: COL.textMute }}>{L.members.toUpperCase()} · {rows.length}</div>
              {rows.length === 0 ? (
                <div className="px-4 py-8 text-center text-[13px]" style={{ color: COL.textMute }}>{L.noMembers}</div>
              ) : (
                <div className="divide-y" style={{ borderColor: COL.border }}>
                  {rows.map((m) => (
                    <div key={m.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2.5">
                      <span className="hidden sm:flex w-8 h-8 rounded-full items-center justify-center text-[12px] font-bold uppercase flex-shrink-0" style={{ background: COL.accentBg, color: COL.accent }}>{(m.invited_email || m.user_id || '?')[0]}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate" style={{ color: COL.text }}>{m.invited_email || m.user_id || '—'}{m.user_id && user?.id === m.user_id ? ` (${L.you})` : ''}</div>
                        <div className="text-[11px] mt-0.5" style={{ color: COL.textMute }}>{m.project_id ? L.scope : L.companyWide} · {statusLabel(m.status)}</div>
                      </div>
                      <div className="min-w-[140px]"><StyledSelect ariaLabel="Member role" value={m.role} onChange={(v) => changeRole(m.id, v)} disabled={m.status === 'revoked'} options={ROLES.map((r) => ({ value: r.id, label: roleLabel(r.id, lang) }))} /></div>
                      {m.status !== 'revoked' && (
                        <button onClick={() => revoke(m.id)} className="p-1.5 rounded-lg hover:bg-red-50 self-start sm:self-auto" style={{ color: '#b91c1c' }} aria-label={L.revoke} title={L.revoke}><Trash2 size={14} /></button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
