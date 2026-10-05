// ============================================================
// Invoice evidence chain — pure logic. Given a supplier invoice and the loaded
// procurement records + links, compute whether its supporting chain is complete
// (PO -> delivery -> proven work) and the 3-way quantity match (PO vs delivered
// vs invoiced). Read-only; never affects the certification chain.
// ============================================================
const num = (v) => { const n = Number(v); return isFinite(n) && n > 0 ? n : null; };
const isApproved = (s) => /approv/i.test(String(s || ''));

/**
 * @returns {
 *   po:       { ok, linked, list, note },        // PO linked?
 *   delivery: { ok, linked, list, note },        // delivery linked AND confirmed?
 *   work:     { ok, linked, list, note },        // WIR linked AND approved?
 *   qty:      { state:'ok'|'over'|'short'|'unverified', msg, po, delivered, invoiced },
 *   ready:    boolean,                            // all three present
 *   missing:  string[]                            // human-readable gaps
 * }
 */
export function computeInvoiceChain(inv, { pos = [], deliveries = [], wirs = [], poLinks = [], sdnLinks = [], wirLinks = [] }) {
  const invId = inv.rowId || inv.id;
  const poIds = poLinks.filter((l) => l.invoice_id === invId).map((l) => l.po_id);
  const dnIds = sdnLinks.filter((l) => l.invoice_id === invId).map((l) => l.delivery_id);
  const wirIds = wirLinks.filter((l) => l.invoice_id === invId).map((l) => l.wir_id);

  const linkedPos = pos.filter((p) => poIds.includes(p.id));
  const linkedDns = deliveries.filter((d) => dnIds.includes(d.id));
  const linkedWirs = wirs.filter((w) => wirIds.includes(w.id));

  // PO: a structured link, or (fallback) the free-text PO ref the invoice carries.
  const poLinkedStructured = linkedPos.length > 0;
  const po = {
    linked: poLinkedStructured || !!inv.poRef,
    ok: poLinkedStructured || !!inv.poRef,
    list: linkedPos,
    note: poLinkedStructured ? `${linkedPos.length} PO linked` : inv.poRef ? `PO ref ${inv.poRef} (not linked)` : 'No PO linked',
  };
  const delivery = {
    linked: linkedDns.length > 0,
    ok: linkedDns.some((d) => isApproved(d.status)),
    list: linkedDns,
    note: linkedDns.length === 0 ? 'No delivery linked' : linkedDns.some((d) => isApproved(d.status)) ? 'Delivery confirmed' : 'Delivery not confirmed',
  };
  const work = {
    linked: linkedWirs.length > 0,
    ok: linkedWirs.some((w) => isApproved(w.result)),
    list: linkedWirs,
    note: linkedWirs.length === 0 ? 'Work not inspected (no WIR)' : linkedWirs.some((w) => isApproved(w.result)) ? 'Work proven (WIR approved)' : 'WIR linked, not approved',
  };

  // 3-way quantity match (flag, never blocks). Needs invoice qty + PO qty present.
  const invoiced = num(inv.qty);
  const poQty = linkedPos.reduce((s, p) => s + (num(p.qty) || 0), 0) || null;
  const delivered = linkedDns.reduce((s, d) => s + (num(d.qty) || 0), 0) || null;
  let qty;
  if (!invoiced) qty = { state: 'unverified', msg: 'Cannot verify — invoice qty not set' };
  else if (!poQty) qty = { state: 'unverified', msg: 'Cannot verify — PO qty missing' };
  else if (invoiced > poQty * 1.001) qty = { state: 'over', msg: `Invoiced ${invoiced} exceeds PO ${poQty}` };
  else if (delivered && invoiced > delivered * 1.001) qty = { state: 'over', msg: `Invoiced ${invoiced} exceeds delivered ${delivered}` };
  else if (delivered && invoiced < delivered * 0.999) qty = { state: 'short', msg: `Invoiced ${invoiced} below delivered ${delivered}` };
  else if (!delivered) qty = { state: 'unverified', msg: `Within PO, but delivered qty missing` };
  else qty = { state: 'ok', msg: 'PO / delivered / invoiced match' };
  qty.po = poQty; qty.delivered = delivered; qty.invoiced = invoiced;

  const missing = [];
  if (!po.ok) missing.push('no PO linked');
  if (!delivery.ok) missing.push(delivery.linked ? 'delivery not confirmed' : 'no delivery linked');
  if (!work.ok) missing.push(work.linked ? 'work not inspected' : 'no WIR linked');

  return { po, delivery, work, qty, ready: po.ok && delivery.ok && work.ok, missing };
}
