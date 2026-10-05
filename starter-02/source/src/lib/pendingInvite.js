// ============================================================
// Pending invite — carries a shareable-invite token across the signed-out →
// signed-in boundary. A link like  …/#/accept-invite?token=XYZ  lands on the
// public site; once the visitor signs in, the app redeems the token. The token
// survives email/password auth (which doesn't touch the URL hash) and is also
// stashed in sessionStorage as a belt-and-suspenders backup.
// ============================================================
const KEY = 'bimqc.pendingInviteToken';

/** Read an invite token from the current URL hash, or null. */
export function inviteTokenInHash() {
  const h = (typeof window !== 'undefined' && window.location?.hash) || '';
  if (!h.startsWith('#/accept-invite')) return null;
  const t = new URLSearchParams(h.split('?')[1] || '').get('token');
  return t && t.length >= 20 ? t : null;
}

/** Remember a token so it survives the auth transition. */
export function stashInviteToken(t) {
  try { if (t) sessionStorage.setItem(KEY, t); } catch { /* no storage */ }
}

/** The token to redeem: sessionStorage first, then the current hash. */
export function takePendingInviteToken() {
  let t = null;
  try { t = sessionStorage.getItem(KEY); } catch { /* no storage */ }
  return t || inviteTokenInHash();
}

/** Clear the stash and strip the token from the URL so it isn't re-consumed. */
export function clearPendingInvite() {
  try { sessionStorage.removeItem(KEY); } catch { /* no storage */ }
  if ((typeof window !== 'undefined') && (window.location.hash || '').startsWith('#/accept-invite')) {
    try { window.history.replaceState(null, '', window.location.pathname + window.location.search + '#/'); } catch { /* ignore */ }
  }
}
