// ============================================================
// Derived element status — a real IFC element has no stored QA status; its
// status FLOWS from its records: an open NCR blocks it; an approved WIR makes
// it "clear to certify". This is the bridge that lets element-level proof of
// work flow into BOQ certifiable value and the IPC.
// ============================================================
import { supabase } from './supabase.js';
import { getCurrentProjectId } from './currentProject.js';

const NCR_CLOSED = ['closed', 'cleared', 'resolved', 'void', 'cancelled', 'verified'];

/**
 * @param wirResults array of lowercased WIR result strings (e.g. 'approved')
 * @param ncrStatuses array of lowercased NCR status strings (e.g. 'open')
 * @returns { key, clear } where clear = "clear to certify"
 */
export function deriveElementStatus(wirResults = [], ncrStatuses = []) {
  const openNcr = ncrStatuses.some((s) => s && !NCR_CLOSED.includes(s));
  const approved = wirResults.some((r) => /approv/.test(r));
  const rejected = wirResults.some((r) => /reject/.test(r));
  let key;
  if (openNcr) key = 'ncr';
  else if (approved) key = 'approved';
  else if (rejected) key = 'rejected';
  else if (wirResults.length) key = 'in_progress';
  else key = 'not_started';
  return { key, clear: approved && !openNcr };
}

export const ESTATUS = {
  approved: { label: 'Clear to certify', color: '#16a34a', bg: '#f0fdf4' },
  ncr: { label: 'Open NCR', color: '#dc2626', bg: '#fef2f2' },
  rejected: { label: 'Rejected', color: '#dc2626', bg: '#fef2f2' },
  in_progress: { label: 'In progress', color: '#1d4ed8', bg: '#eff6ff' },
  not_started: { label: 'Not started', color: '#a1a1a6', bg: '#f4f4f5' },
};

/** Map of element GUID -> { key, clear } for the whole project, from real WIRs + NCRs. */
export async function loadElementStatusMap(projectId = getCurrentProjectId()) {
  const [w, n] = await Promise.all([
    supabase.from('wirs').select('element_guid, result').eq('project_id', projectId),
    supabase.from('ncrs').select('element_guid, status').eq('project_id', projectId),
  ]);
  const wir = {}, ncr = {};
  (w.data || []).forEach((r) => { if (r.element_guid) (wir[r.element_guid] = wir[r.element_guid] || []).push((r.result || '').toLowerCase()); });
  (n.data || []).forEach((r) => { if (r.element_guid) (ncr[r.element_guid] = ncr[r.element_guid] || []).push((r.status || '').toLowerCase()); });
  const guids = new Set([...Object.keys(wir), ...Object.keys(ncr)]);
  const map = {};
  guids.forEach((g) => { map[g] = deriveElementStatus(wir[g] || [], ncr[g] || []); });
  return map;
}
