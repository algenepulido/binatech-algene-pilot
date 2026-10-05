// ============================================================
// BOQ matching — turns validated extraction regions + a normalized BOQ into
// EXPLAINABLE candidate links. Deterministic and pure: every candidate says
// WHAT matched, WHERE it matched, WHY the item is plausible and WHAT makes it
// uncertain — confidence is never presented alone, and nothing here confirms
// anything (confirmation is a human act in reviewState.js).
//
// STATE: built client-side · read-only.
// ============================================================

/** Normalize one BOQ record into the matching shape (missing fields → null/[]). */
export function normalizeBoqItem(raw) {
  return {
    id: raw.id, code: raw.code || raw.id, bill: raw.bill || null,
    description: raw.description || '', unit: (raw.unit || '').toLowerCase(),
    workType: raw.workType || null, discipline: raw.discipline || null,
    material: raw.material || null,
    locationConstraints: raw.locationConstraints || [],
    contractQty: raw.contractQty ?? null,
    inCurrentIpa: raw.inCurrentIpa === true,
  };
}

const STOP = new Set(['the', 'and', 'all', 'to', 'in', 'of', 'for', 'with', 'see', 'per', 'by']);
const tokens = (s) => String(s || '').toLowerCase().replace(/[^\w؀-ۿ/–-]+/g, ' ')
  .split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

/** Units that measure the same kind of quantity (compatible for claiming). */
const UNIT_FAMILY = { 'm³': 'volume', m3: 'volume', 'm²': 'area', m2: 'area', m: 'length', lm: 'length', t: 'mass', kg: 'mass', no: 'count', nr: 'count', ls: 'sum' };
export function unitsCompatible(a, b) {
  if (!a || !b) return null;                       // unknown, not incompatible
  const fa = UNIT_FAMILY[a.toLowerCase()] || a.toLowerCase();
  const fb = UNIT_FAMILY[b.toLowerCase()] || b.toLowerCase();
  return fa === fb;
}

/** Pull an explicit unit mention out of region text ("120 m³", "LS"), if any.
 *  NOTE: superscript ²/³ are non-word chars, so `\b` cannot close them —
 *  they get their own alternation without a trailing boundary. */
function unitInText(text) {
  const m = String(text || '').match(/\b(m3|m2|lm|kg|t|no\.?|nr|ls)\b|(m³|m²)/i);
  return m ? (m[1] || m[2]).toLowerCase().replace('.', '') : null;
}

/**
 * Candidates for ONE region against the normalized BOQ.
 * Deterministic scoring, explanation assembled ONLY from real matches:
 *   description-token overlap → base; discipline / material / location /
 *   unit each adjust and are reported individually. A location or unit
 *   mismatch WARNS and lowers confidence — it never silently disappears.
 * If nothing clears `minConfidence`, one `possibleOutsideScope` marker
 * candidate is returned so the region can be routed to VO review.
 */
export function candidatesForRegion(region, boqItems, { extraction, wirs = [], measurements = [], elements = [], minConfidence = 0.35 } = {}) {
  const regTokens = tokens(region.text);
  const regUnit = unitInText(region.text);
  const zones = extraction?.zones || [];
  const out = [];

  for (const item of boqItems) {
    const itemTokens = tokens(`${item.description} ${item.material || ''} ${item.workType || ''}`);
    const overlap = itemTokens.filter((t) => regTokens.includes(t));
    if (!overlap.length) continue;                       // nothing matched — no candidate, no noise

    let confidence = Math.min(0.55, overlap.length * 0.14);
    const warnings = [];
    const why = [];

    const disciplineMatch = item.discipline && extraction?.discipline
      ? item.discipline.toLowerCase() === extraction.discipline.toLowerCase() : null;
    if (disciplineMatch === true) { confidence += 0.1; why.push(`discipline matches (${item.discipline})`); }
    if (disciplineMatch === false) { confidence -= 0.15; warnings.push(`Discipline mismatch: drawing is ${extraction.discipline}, item is ${item.discipline}`); }

    const materialMatch = item.material ? regTokens.some((t) => tokens(item.material).includes(t)) : null;
    if (materialMatch) { confidence += 0.12; why.push(`material "${item.material}" appears in the region text`); }

    let locationMatch = null;
    if (item.locationConstraints.length) {
      locationMatch = item.locationConstraints.some((lc) => zones.includes(lc) || regTokens.includes(lc.toLowerCase().replace(/\s+/g, '')) || String(region.text).toLowerCase().includes(lc.toLowerCase()));
      if (locationMatch) { confidence += 0.1; why.push(`location constraint ${item.locationConstraints.join('/')} matches the drawing zone`); }
      else { confidence -= 0.12; warnings.push(`Location mismatch: item is constrained to ${item.locationConstraints.join('/')}, drawing shows ${zones.join('/') || 'no matching zone'}`); }
    }

    const unitCompatible = unitsCompatible(regUnit, item.unit);
    if (unitCompatible === true) { confidence += 0.08; why.push(`unit ${item.unit} is compatible with the annotated quantity`); }
    if (unitCompatible === false) { confidence -= 0.1; warnings.push(`Unit mismatch: region quantity reads "${regUnit}", BOQ item is measured in "${item.unit}"`); }

    confidence = Math.max(0.05, Math.min(0.97, confidence));

    out.push({
      id: `cand-${region.id}-${item.id}`,
      regionId: region.id,
      boqItemId: item.id,
      confidence: Math.round(confidence * 100) / 100,
      explanation: `Matched "${overlap.join(', ')}" between the region text and the BOQ description${why.length ? '; ' + why.join('; ') : ''}.${warnings.length ? ' Uncertain because: ' + warnings.join(' · ') : ''}`,
      matchedDrawingText: region.text,
      matchedBoqText: item.description,
      disciplineMatch, locationMatch, materialMatch,
      unitCompatible,
      quantityRelevance: region.commercial_relevance,
      warnings,
      possibleOutsideScope: false,
      relatedWirs: wirs.filter((w) => w.boqItemId === item.id || (w.zone && zones.includes(w.zone))).map((w) => w.id),
      relatedMeasurements: measurements.filter((m) => zones.includes(m.zone)).map((m) => m.id),
      relatedElements: elements.filter((e) => e.boqItemId === item.id).map((e) => e.id),
      status: 'suggested',
      inCurrentIpa: item.inCurrentIpa,
    });
  }

  out.sort((a, b) => b.confidence - a.confidence);
  const best = out[0];
  if (!best || best.confidence < minConfidence) {
    // Nothing plausibly in scope — surface that honestly as a VO-review marker.
    out.unshift({
      id: `cand-${region.id}-oos`, regionId: region.id, boqItemId: null,
      confidence: best ? best.confidence : 0,
      explanation: best
        ? `No BOQ item cleared the plausibility threshold (best: "${best.matchedBoqText}" at ${Math.round(best.confidence * 100)}%). This work may be outside the current BOQ scope.`
        : 'No BOQ item shares any description, material or location signal with this region. This work may be outside the current BOQ scope.',
      matchedDrawingText: region.text, matchedBoqText: null,
      disciplineMatch: null, locationMatch: null, materialMatch: null,
      unitCompatible: null, quantityRelevance: region.commercial_relevance,
      warnings: ['Possible variation / outside-BOQ work — route to VO review, do not force-link'],
      possibleOutsideScope: true,
      relatedWirs: [], relatedMeasurements: [], relatedElements: [],
      status: 'suggested', inCurrentIpa: false,
    });
  }
  return out;
}

/** Candidates for every commercially relevant region of a validated extraction. */
export function buildCandidates(extraction, boqRaw, ctx = {}) {
  const boq = (boqRaw || []).map(normalizeBoqItem);
  return (extraction?.detected_regions || [])
    .filter((r) => r.commercial_relevance !== 'none')
    .flatMap((r) => candidatesForRegion(r, boq, { ...ctx, extraction }));
}
