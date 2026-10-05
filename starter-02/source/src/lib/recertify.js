// ============================================================
// recertify — recompute the certified (approved) qty of BOQ lines from the
// real records, the automatic bridge WIR/NCR -> BOQ -> IPC.
//
// CORRECT MODEL (quantity-based): certified qty of a line = the SUM of the
// approved QUANTITIES proven by its approved WIRs, capped at the contract qty.
//   contract qty (BoQ) >= mapped (linked elements) >= approved (this).
// A WIR proves work only when it is APPROVED and its element has no open NCR.
// Each proven WIR contributes, in the line's unit:
//     explicit wir.approved_qty  >  the element's IFC quantity for that unit  > 0
// A WIR reaches a line directly (wirs.boq_item_id) or via its element's link
// (only when that element maps to exactly one line — otherwise ambiguous).
//
// KEY: LINKING ALONE NEVER CERTIFIES. A linked line with no proven WIR resolves
// to approved_qty = 0. An approved WIR with no entered quantity and no IFC
// quantity also certifies 0 until a quantity is entered. This replaces the old
// count-based "(clear elements / linked) × contract" share, which over-certified
// (one approved WIR could certify a line's full proportional value).
// Only linked / WIR-targeted lines are managed; manual lines keep their value.
// Best-effort: never throws to the caller.
// ============================================================
import { supabase } from './supabase.js';
import { getCurrentProjectId } from './currentProject.js';
import { loadElementStatusMap } from './elementStatus.js';
import { listBoqItems, updateBoqItem } from '../api/boqItems.js';
import { listAllLinks } from '../api/elementBoqLinks.js';
import { getActiveModel } from '../api/models.js';
import { quantityForUnit } from './quantity.js';

// Quantity of each element in the project's active model, keyed by GUID.
// Returns {} when the model/columns aren't present — callers then fall back to
// the count-based share, so this is purely additive.
async function loadElementQtyMap(projectId) {
  try {
    const model = await getActiveModel(projectId);
    if (!model) return {};
    // select('*') so a missing volume/area/length column never errors.
    const { data, error } = await supabase.from('model_elements').select('*').eq('model_id', model.id);
    if (error) return {};
    const map = {};
    for (const e of data || []) map[e.guid] = { volume: e.volume, area: e.area, length: e.length };
    return map;
  } catch { return {}; }
}

export async function recertifyAll(projectId = getCurrentProjectId()) {
  try {
    const [statusMap, boq, links, wirsRes, qtyMap] = await Promise.all([
      loadElementStatusMap(projectId),
      listBoqItems(projectId),
      listAllLinks(projectId),
      supabase.from('wirs').select('*').eq('project_id', projectId), // select('*') so a missing boq_item_id column never errors
      loadElementQtyMap(projectId),
    ]);

    const wirs = wirsRes.data || [];

    // Element <-> BoQ links (join table + legacy single link), both directions.
    const guidsByBoq = {};   // boq_item_id  -> Set(element_guid)
    const linesByGuid = {};  // element_guid -> Set(boq_item_id)
    const addLink = (boqId, guid) => {
      (guidsByBoq[boqId] = guidsByBoq[boqId] || new Set()).add(guid);
      (linesByGuid[guid] = linesByGuid[guid] || new Set()).add(boqId);
    };
    links.forEach((l) => addLink(l.boq_item_id, l.element_guid));
    boq.forEach((b) => { if (b.element_id) addLink(b.id, b.element_id); });
    const boqById = new Map(boq.map((b) => [b.id, b]));

    // A WIR only proves work if it is APPROVED and its element isn't NCR-blocked
    // (statusMap[guid].clear already encodes "approved WIR present AND no open NCR").
    const isProven = (w) => /approv/i.test((w.result || '').toLowerCase())
      && (!w.element_guid || statusMap[w.element_guid]?.clear);

    // How much a proven WIR certifies on a line, in the line's unit:
    //   explicit wir.approved_qty  >  the element's IFC quantity for that unit  >  0
    // (So linking alone never certifies; an approved WIR with no quantity and no
    //  IFC quantity certifies 0 until a quantity is entered.)
    const contribution = (w, line) => {
      if (w.approved_qty != null && w.approved_qty !== '' && !isNaN(Number(w.approved_qty))) return Number(w.approved_qty);
      const qm = quantityForUnit(line.unit);
      if (qm && (qm.field === 'volume' || qm.field === 'area' || qm.field === 'length') && w.element_guid) {
        const v = qtyMap[w.element_guid]?.[qm.field];
        if (v != null && !isNaN(Number(v))) return Number(v);
      }
      return 0;
    };

    // Sum proven approved-quantity per line (NOT a count share of the contract).
    const approvedByLine = {};
    const addQty = (boqId, q) => { approvedByLine[boqId] = (approvedByLine[boqId] || 0) + q; };
    for (const w of wirs) {
      if (!isProven(w)) continue;
      if (w.boq_item_id && boqById.has(w.boq_item_id)) {
        addQty(w.boq_item_id, contribution(w, boqById.get(w.boq_item_id))); // direct: WIR -> line
      } else if (w.element_guid) {
        // Element-mediated: attribute only when the element maps to exactly ONE
        // line (otherwise ambiguous — surfaced by the over-mapping flag, not guessed).
        const lines = linesByGuid[w.element_guid];
        if (lines && lines.size === 1) {
          const boqId = [...lines][0];
          const line = boqById.get(boqId);
          if (line) addQty(boqId, contribution(w, line));
        }
      }
    }

    let updated = 0, mappedColMissing = false;
    for (const b of boq) {
      const gset = guidsByBoq[b.id];
      const hasLink = gset && gset.size > 0;
      // Only auto-manage lines that are linked or WIR-targeted; manual lines keep
      // their value. A linked line with no proven WIR resolves to 0 (the fix).
      if (!hasLink && !(b.id in approvedByLine)) continue;
      const raw = approvedByLine[b.id] || 0;
      // Cap at the contract qty so summed actuals can never over-certify the line.
      const certQty = Math.min(Number(b.qty || 0), Math.round(raw * 100) / 100);
      if (Number(b.approved_qty || 0) !== certQty) { await updateBoqItem(b.id, { approved_qty: certQty }); updated++; }

      // Mapped qty = sum of linked elements' IFC quantity for the line's unit,
      // UNCAPPED (so over-mapping can be flagged). Best-effort additive column —
      // wrapped so a missing column can NEVER block the certified-quantity write.
      if (!mappedColMissing && hasLink) {
        const qm = quantityForUnit(b.unit);
        let mappedQty = null;
        if (qm && (qm.field === 'volume' || qm.field === 'area' || qm.field === 'length')) {
          let sum = 0, any = false;
          gset.forEach((gd) => { const v = qtyMap[gd]?.[qm.field]; if (v != null && !isNaN(Number(v))) { sum += Number(v); any = true; } });
          if (any) mappedQty = Math.round(sum * 100) / 100;
        }
        if (mappedQty != null && Number(b.mapped_qty || 0) !== mappedQty) {
          try { await updateBoqItem(b.id, { mapped_qty: mappedQty }); }
          catch (e) { if (/mapped_qty|column/i.test(e?.message || '')) mappedColMissing = true; }
        }
      }
    }
    return updated;
  } catch (err) {
    // Best-effort: a failed recertify must not break the WIR/NCR save, but it
    // should be visible (silent failure would mean cert silently didn't flow).
    console.warn('recertifyAll failed:', err?.message ?? err);
    return 0;
  }
}

// Back-compat alias — any record change re-certifies the whole project's linked lines.
export async function recertifyForElement() { return recertifyAll(); }
