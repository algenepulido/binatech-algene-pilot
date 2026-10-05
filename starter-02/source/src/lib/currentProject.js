// ============================================================
// Current project — a tiny shared store for "which project am I in".
// The API layer reads getCurrentProjectId() so every list/insert is scoped
// to the open project. Persisted to localStorage so a refresh keeps the
// selection. Defaults to the built-in sample project (SYN-SAMPLE), which keeps
// all existing data working exactly as before.
// ============================================================
export const SAMPLE_PROJECT_ID = 'SYN-SAMPLE';
const KEY = 'bimqc.currentProjectId';

let current = SAMPLE_PROJECT_ID;
try { const saved = localStorage.getItem(KEY); if (saved) current = saved; } catch { /* SSR / no storage */ }

const subs = new Set();

export function getCurrentProjectId() { return current; }

/** True when the open project is the built-in sample (SYN-SAMPLE). */
export function isSampleProject() { return current === SAMPLE_PROJECT_ID; }

// --- Open-project display META (additive, frontend-only) ---
// When a project is opened from the list we already KNOW its name/client/etc.
// Stash them so the identity shown is the OPEN project — not the hardcoded
// sample default — even if getProject(id) can't resolve the row. Does NOT touch
// data scoping (lists/inserts still key off getCurrentProjectId()).
const META_KEY = 'bimqc.currentProjectMeta';
let currentMeta = {};
try { const s = localStorage.getItem(META_KEY); if (s) currentMeta = JSON.parse(s) || {}; } catch { /* ignore */ }

export function getCurrentProjectMeta() { return currentMeta; }

export function setCurrentProjectMeta(meta) {
  const clean = {};
  if (meta && typeof meta === 'object') {
    for (const k of ['name', 'nameAr', 'client', 'contractor', 'consultant', 'code']) {
      const v = k === 'nameAr' ? (meta.nameAr || meta.name_ar) : meta[k];
      if (v) clean[k] = v;
    }
  }
  currentMeta = clean;
  try { localStorage.setItem(META_KEY, JSON.stringify(currentMeta)); } catch { /* ignore */ }
}

export function setCurrentProjectId(id) {
  current = id || SAMPLE_PROJECT_ID;
  try { localStorage.setItem(KEY, current); } catch { /* ignore */ }
  subs.forEach((fn) => { try { fn(current); } catch { /* ignore */ } });
}

/** Clear the open-project context (id + display meta) — called on sign-out so a
 *  shared device does not leak one user's project to the next. Resets to sample. */
export function clearCurrentProject() {
  current = SAMPLE_PROJECT_ID;
  currentMeta = {};
  try { localStorage.removeItem(KEY); localStorage.removeItem(META_KEY); } catch { /* ignore */ }
}

/** Subscribe to project changes; returns an unsubscribe fn. */
export function subscribeProject(fn) { subs.add(fn); return () => subs.delete(fn); }

// --- Lightweight "data changed" signal (additive) ---
// Lets a view tell the shell that project data changed (e.g. new element↔BoQ
// links) so global badges/status (StatusBar counts) refresh WITHOUT remounting
// the current view. Distinct from subscribeProject (which remounts on switch).
const dataSubs = new Set();
export function notifyDataChanged() { dataSubs.forEach((fn) => { try { fn(); } catch { /* ignore */ } }); }
export function subscribeData(fn) { dataSubs.add(fn); return () => dataSubs.delete(fn); }
