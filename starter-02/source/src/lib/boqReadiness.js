// ============================================================
// BoQ commercial-readiness — pure helpers shared by the QS and IPC modules.
// Splits each line's contract quantity into approved / in-progress / blocked /
// unlinked, derived from its linked elements' WIR/NCR status. Read-only; never
// mutates data or the certification chain.
// ============================================================
import { isBoqLineItem } from '../api/boqItems.js';

/** boq_item_id -> Set of linked element guids (join table + legacy element_id). */
export function buildLinksByBoq(allLinks = [], items = []) {
  const m = {};
  for (const l of allLinks) { (m[l.boq_item_id] = m[l.boq_item_id] || new Set()).add(l.element_guid); }
  for (const b of items) { if (b.element_id) (m[b.id] = m[b.id] || new Set()).add(b.element_id); }
  return m;
}

export function lineReadiness(b, linksByBoq = {}, statusMap = {}) {
  const qty = Number(b.qty || 0), rate = Number(b.rate || 0);
  const guids = linksByBoq[b.id];
  const linkedCount = guids ? guids.size : 0;
  // CERTIFIED follows the stored approved_qty (written by recertify from approved
  // WIR quantities, capped at contract) — NOT a count share of the contract.
  // Linking alone (no approved WIR) => approvedQty 0.
  const approvedQty = Math.min(qty, Math.max(0, Number(b.approved_qty || 0)));
  const approvedValue = approvedQty * rate;
  let blocked = 0;
  if (guids) guids.forEach((g) => { const s = statusMap[g]; if (s?.key === 'ncr' || s?.key === 'rejected') blocked++; });
  const blockedQty = linkedCount ? Math.max(0, ((blocked / linkedCount) * qty) - approvedQty) : 0;
  const progressQty = Math.max(0, qty - approvedQty - blockedQty);
  const badge = (qty > 0 && approvedQty >= qty) ? 'ready' : approvedQty > 0 ? 'progress' : blocked > 0 ? 'blocked' : linkedCount > 0 ? 'progress' : 'unmapped';
  return { contractQty: qty, approvedQty, progressQty, blockedQty, unlinkedQty: linkedCount === 0 ? qty : 0, linkedCount, clearCount: 0, blockedCount: blocked, rate, value: qty * rate, approvedValue, blockedValue: blockedQty * rate, badge };
}

/** Whole-project waterfall over real line items only. */
export function boqWaterfall(items = [], linksByBoq = {}, statusMap = {}) {
  let contract = 0, mapped = 0, proven = 0, blocked = 0;
  for (const b of items) {
    if (!isBoqLineItem(b)) continue;
    const r = lineReadiness(b, linksByBoq, statusMap);
    contract += r.value; if (r.linkedCount > 0) mapped += r.value;
    proven += r.approvedValue; blocked += r.blockedValue;
  }
  return { contract, mapped, unlinked: contract - mapped, proven, blocked, certifiable: Math.max(0, proven) };
}
