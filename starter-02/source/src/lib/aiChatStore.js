// ============================================================
// aiChatStore — PROJECT-SCOPED AI chat history (frontend fallback).
//
// Every conversation is keyed by project_id so Project A's chat can never appear
// under Project B: switching projects switches the visible history, and a new chat
// is created under the active project. When no project is selected the key is
// 'none' (limited global/help mode). Persisted to sessionStorage so a refresh keeps
// the thread per project. BACKEND PERSISTENCE (conversations/messages rows carrying
// tenant_id + project_id + page_context) is still required for production — this is
// the documented temporary fallback.
// ============================================================
const PREFIX = 'binatech.aichat.';

// Memory shim for environments without sessionStorage (SSR / some test runners).
const MEM = (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; })();
function store(s) {
  if (s) return s;
  try { if (typeof sessionStorage !== 'undefined') return sessionStorage; } catch { /* ignore */ }
  return MEM;
}

export function chatKey(projectId) { return PREFIX + (projectId || 'none'); }

/** Load the saved messages for a project, or null if none. */
export function loadChat(projectId, s) {
  try { const v = store(s).getItem(chatKey(projectId)); return v ? JSON.parse(v) : null; }
  catch { return null; }
}

/** Persist the messages for a project (scoped — never mixes with other projects). */
export function saveChat(projectId, messages, s) {
  try { store(s).setItem(chatKey(projectId), JSON.stringify(messages || [])); }
  catch { /* quota / disabled storage — non-fatal */ }
}

export function clearChat(projectId, s) {
  try { store(s).removeItem(chatKey(projectId)); }
  catch { /* ignore */ }
}

/** Clear EVERY project's AI chat — called on sign-out so a shared device does not
 *  leak one user's project conversations to the next. */
export function clearAllChats(s) {
  try {
    const st = store(s);
    if (typeof st.length !== 'number' || typeof st.key !== 'function') return;
    const keys = [];
    for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && k.startsWith(PREFIX)) keys.push(k); }
    keys.forEach((k) => st.removeItem(k));
  } catch { /* ignore */ }
}
