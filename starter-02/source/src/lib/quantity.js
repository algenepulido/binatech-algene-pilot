// ============================================================
// Quantity-based valuation helpers. Map a BoQ unit to the matching element
// quantity (volume/area/length), and compute element value = quantity x rate.
// If the unit doesn't match the available quantity, FLAG rather than miscompute.
// ============================================================

/** BoQ unit string -> { field, label } of the element quantity that matches. */
export function quantityForUnit(unit) {
  const u = (unit || '').toString().trim().toLowerCase().replace(/\s|\./g, '');
  if (!u) return null;
  if (/m3|m³|cum|cbm|cubicmet|m\^3/.test(u)) return { field: 'volume', label: 'm³' };
  if (/m2|m²|sqm|squaremet|m\^2/.test(u)) return { field: 'area', label: 'm²' };
  if (/^(m|lm|rm|ml|mtr|meter|metre)$/.test(u) || /linearm|lin\.?m|runningm/.test(u)) return { field: 'length', label: 'm' };
  if (/^(no|nr|nos|each|ea|pcs|pc|item|unit|set|lot|ls|sum)$/.test(u)) return { field: 'count', label: 'no' };
  return null; // unrecognised unit — can't quantity-match
}

/**
 * Value one element against a BoQ line: quantity x rate, units matched.
 * @returns one of:
 *   { ok:true, qty, unit, rate, value, field }            // valued
 *   { ok:true, count:true, value }                        // per-unit (no/LS): rate itself
 *   { ok:false, needsQty:true, field, unit, reason }      // unit known but element has no qty (allow manual)
 *   { ok:false, reason }                                  // unit unrecognised (flag, don't miscompute)
 */
export function valueElementOnLine(el, line) {
  const rate = Number(line?.rate || 0);
  const q = quantityForUnit(line?.unit);
  if (!q) return { ok: false, reason: `Unit "${line?.unit || '—'}" not recognised — set the BoQ unit or enter value manually` };
  if (q.field === 'count') return { ok: true, count: true, unit: 'no', rate, value: rate };
  const qty = el?.[q.field];
  if (qty == null || isNaN(Number(qty))) return { ok: false, needsQty: true, field: q.field, unit: q.label, reason: `No ${q.field} on this element — enter it to value this line` };
  return { ok: true, qty: Number(qty), unit: q.label, rate, value: Number(qty) * rate, field: q.field };
}
