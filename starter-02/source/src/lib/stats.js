// ============================================================
// Live project stats — real counts/aggregates from Supabase, used by the
// sidebar badges, the bottom status bar, the dashboard, and reports.
// All queries are scoped to the single project and require a signed-in user
// (RLS). Returns zeros if not configured / not signed in.
// ============================================================
import { fmtMoney } from './format.js';
import { supabase } from './supabase.js';
import { getCurrentProjectId } from './currentProject.js';

async function count(table, build) {
  let q = supabase.from(table).select('*', { count: 'exact', head: true }).eq('project_id', getCurrentProjectId());
  if (build) q = build(q);
  const { count: c, error } = await q;
  return error ? 0 : (c || 0);
}

export const EMPTY_COUNTS = {
  openWirs: 0, openNcrs: 0, drawingsPending: 0, docsPending: 0, openSnags: 0,
  pendingApprovals: 0, pendingSdn: 0, readyForAp: 0, totalWirs: 0, totalDrawings: 0,
  totalDocs: 0, totalIpcs: 0, totalInvoices: 0, totalPos: 0, totalVendors: 0, totalDeliveries: 0,
  totalElements: 0, linkedElements: 0,
};

/** Real model-element count + how many are linked to a BOQ line. Never throws. */
export async function loadElementLinkStats(projectId = getCurrentProjectId()) {
  let totalElements = 0, linkedElements = 0;
  try {
    const { count: c } = await supabase.from('model_elements').select('*', { count: 'exact', head: true }).eq('project_id', projectId);
    totalElements = c || 0;
  } catch { /* table/column may be absent */ }
  try {
    const { data } = await supabase.from('element_boq_links').select('element_guid').eq('project_id', projectId);
    linkedElements = new Set((data || []).map((r) => r.element_guid)).size;
  } catch { /* join table may be absent */ }
  return { totalElements, linkedElements };
}

/** Counts for badges / status bar / dashboard. */
export async function loadCounts() {
  const [
    openWirs, openNcrs, drawingsPending, docsPending, openSnags, pendingSdn,
    totalWirs, totalDrawings, totalDocs, totalIpcs, totalInvoices, totalPos, totalVendors, totalDeliveries,
    totalNcrs, totalQc, totalSnags, totalBoq,
  ] = await Promise.all([
    count('wirs', (q) => q.in('result', ['pending', 'in_progress'])),
    count('ncrs', (q) => q.eq('status', 'open')),
    count('drawings', (q) => q.eq('status', 'Under Review')),
    count('documents', (q) => q.in('status', ['submitted', 'internalReview', 'reviseResubmit'])),
    count('snags', (q) => q.in('status', ['open', 'assigned', 'inProgress', 'reopened', 'blocked', 'escalated'])),
    count('deliveries', (q) => q.in('sdn_status', ['Pending SDN', 'Pending DN'])),
    count('wirs'), count('drawings'), count('documents'), count('ipcs'),
    count('invoices'), count('purchase_orders'), count('vendors'), count('deliveries'),
    count('ncrs'), count('qc_tests'), count('snags'), count('boq_items'),
  ]);
  const els = await loadElementLinkStats();
  return {
    openWirs, openNcrs, drawingsPending, docsPending, openSnags, pendingSdn,
    pendingApprovals: openWirs + openNcrs + drawingsPending + docsPending,
    readyForAp: 0, // depends on supplier-invoice data not captured yet
    totalWirs, totalDrawings, totalDocs, totalIpcs, totalInvoices, totalPos, totalVendors, totalDeliveries,
    totalNcrs, totalQc, totalSnags, totalBoq,
    totalElements: els.totalElements, linkedElements: els.linkedElements,
  };
}

/** Financials derived from the real Bill of Quantities + NCRs + IPCs. */
export async function loadFinance() {
  const [boq, ncr, ipc, inv] = await Promise.all([
    supabase.from('boq_items').select('qty, rate, approved_qty').eq('project_id', getCurrentProjectId()),
    supabase.from('ncrs').select('cost_impact').eq('project_id', getCurrentProjectId()).eq('status', 'open'),
    supabase.from('ipcs').select('net_payable, status').eq('project_id', getCurrentProjectId()),
    supabase.from('invoices').select('amount, payment_status').eq('project_id', getCurrentProjectId()),
  ]);
  const rows = boq.data || [];
  let total = 0, approvedValue = 0;
  for (const b of rows) {
    total += Number(b.qty || 0) * Number(b.rate || 0);
    approvedValue += Number(b.approved_qty || 0) * Number(b.rate || 0);
  }
  const blockedValue = (ncr.data || []).reduce((s, n) => s + Number(n.cost_impact || 0), 0);
  const pendingValue = Math.max(0, total - approvedValue);
  const certifiedIpc = (ipc.data || []).filter((i) => ['certified', 'paid'].includes(i.status)).reduce((s, i) => s + Number(i.net_payable || 0), 0);
  const draftIpc = (ipc.data || []).filter((i) => ['draft', 'submitted'].includes(i.status)).reduce((s, i) => s + Number(i.net_payable || 0), 0);
  const paidInvoices = (inv.data || []).filter((i) => i.payment_status === 'Paid').reduce((s, i) => s + Number(i.amount || 0), 0);
  return { total, approvedValue, pendingValue, blockedValue, certifiedIpc, draftIpc, paidInvoices };
}

/** Recent pending items + recently-added records for the dashboard. */
export async function loadDashboardLists() {
  const [wirs, ncrs, draws, ipcs] = await Promise.all([
    supabase.from('wirs').select('wir_number, inspection_type, element_guid, created_at').eq('project_id', getCurrentProjectId()).in('result', ['pending', 'in_progress']).order('created_at', { ascending: false }).limit(4),
    supabase.from('ncrs').select('ncr_number, severity, description, created_at').eq('project_id', getCurrentProjectId()).eq('status', 'open').order('created_at', { ascending: false }).limit(3),
    supabase.from('drawings').select('drawing_number, title, created_at').eq('project_id', getCurrentProjectId()).eq('status', 'Under Review').order('created_at', { ascending: false }).limit(3),
    supabase.from('ipcs').select('ipc_number, net_payable, created_at').eq('project_id', getCurrentProjectId()).in('status', ['draft', 'submitted']).order('created_at', { ascending: false }).limit(2),
  ]);
  const pending = [
    ...(wirs.data || []).map((w) => ({ type: 'WIR', id: w.wir_number, desc: `${w.inspection_type || 'Inspection'}${w.element_guid ? ' · ' + w.element_guid : ''}`, priority: 'Normal' })),
    ...(ncrs.data || []).map((n) => ({ type: 'NCR', id: n.ncr_number, desc: (n.description || 'Non-conformance').slice(0, 70), priority: n.severity === 'critical' ? 'Critical' : 'High' })),
    ...(draws.data || []).map((d) => ({ type: 'Drawing', id: d.drawing_number, desc: d.title || 'Under review', priority: 'High' })),
    ...(ipcs.data || []).map((i) => ({ type: 'IPC', id: i.ipc_number, desc: `Net ${fmtMoney(i.net_payable)}`, priority: 'High' })),
  ];
  const recents = await Promise.all([
    supabase.from('wirs').select('wir_number, created_at').eq('project_id', getCurrentProjectId()).order('created_at', { ascending: false }).limit(5),
    supabase.from('ncrs').select('ncr_number, created_at').eq('project_id', getCurrentProjectId()).order('created_at', { ascending: false }).limit(5),
    supabase.from('snags').select('snag_number, created_at').eq('project_id', getCurrentProjectId()).order('created_at', { ascending: false }).limit(5),
    supabase.from('ipcs').select('ipc_number, created_at').eq('project_id', getCurrentProjectId()).order('created_at', { ascending: false }).limit(5),
  ]);
  const labels = ['WIR', 'NCR', 'Snag', 'IPC'];
  let recent = [];
  recents.forEach((r, idx) => (r.data || []).forEach((row) => {
    const num = row.wir_number || row.ncr_number || row.snag_number || row.ipc_number;
    recent.push({ type: labels[idx], target: num, ts: row.created_at });
  }));
  recent.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
  return { pending, recent: recent.slice(0, 12) };
}
