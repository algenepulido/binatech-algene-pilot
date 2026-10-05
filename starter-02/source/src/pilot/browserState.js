// ============================================================
// PILOT STARTER ONLY — browser state the real app reads at import time.
//
// src/lib/currentProject.js reads the open project from localStorage when it
// is first imported, so the starter seeds it BEFORE any application module
// loads: the synthetic Project P unless a synthetic project is already open.
// An empty route opens Invoices; a leftover sign-in route (after "Log out")
// returns to Invoices, because the public site is not part of this starter.
// ============================================================
import { PILOT_PROJECT_IDS, PROJECT_META, PROJECT_P } from './fixtures/data.js';

export const CURRENT_PROJECT_KEY = 'bimqc.currentProjectId';
export const CURRENT_PROJECT_META_KEY = 'bimqc.currentProjectMeta';
export const DEFAULT_ROUTE = '#/app/invoices';

export function prepareBrowserState(win) {
  let projectId = PROJECT_P;
  try {
    const saved = win.localStorage.getItem(CURRENT_PROJECT_KEY);
    if (PILOT_PROJECT_IDS.includes(saved)) projectId = saved;
    win.localStorage.setItem(CURRENT_PROJECT_KEY, projectId);
    win.localStorage.setItem(CURRENT_PROJECT_META_KEY, JSON.stringify(PROJECT_META[projectId]));
  } catch { /* storage unavailable: the app falls back to its own default */ }
  const hash = win.location.hash || '';
  if (!hash.startsWith('#/app/')) win.history.replaceState(null, '', `${win.location.pathname}${win.location.search}${DEFAULT_ROUTE}`);
  return projectId;
}

/** Evaluator control: return to a signed-in synthetic session on Invoices (reloads the page). */
export function restartAsSyntheticReviewer(win) {
  try { win.localStorage.setItem(CURRENT_PROJECT_KEY, PROJECT_P); } catch { /* ignore */ }
  win.history.replaceState(null, '', `${win.location.pathname}${win.location.search}${DEFAULT_ROUTE}`);
  win.location.reload();
}
