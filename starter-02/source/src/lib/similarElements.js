// ============================================================
// "Select similar" — rules-assisted suggestion of elements similar to a target,
// for extending a viewport/table selection (e.g. all repeated pile caps on a
// level, all waterproofing in a package). Pure + synchronous, so it never throws
// to the UI and needs no network/AI call (it degrades to "no suggestions" rather
// than crashing). Reasons + a confidence label are returned for transparency.
//
// Scoring: each shared attribute adds weight; the element must share at least the
// IFC type OR reach a minimum score to be suggested. Higher score = more alike.
// ============================================================

// Family = the element's name with a trailing index/number stripped, so
// "Pile Cap 03" and "Pile Cap 12" share family "Pile Cap" (repeated members).
function family(name) {
  return (name || '')
    .toString()
    .replace(/[\s._:#-]*\d+[a-z]?$/i, '') // trailing "-03", " 12", "_A1"
    .trim()
    .toLowerCase();
}

const norm = (v) => (v == null ? '' : v.toString().trim().toLowerCase());

/**
 * Rank elements similar to `target`.
 * @param target one element ({ guid, type, level, package_id, material, zone, name })
 * @param all     all candidate elements
 * @param exclude Set of guids already selected (kept out of the suggestion list)
 * @returns { matches: [{ guid, score, confidence, reasons, element }], byConfidence }
 */
export function suggestSimilar(target, all = [], exclude = new Set()) {
  if (!target || !target.guid) return { matches: [], targetFamily: '' };
  const tType = norm(target.type);
  const tLevel = norm(target.level);
  const tPkg = norm(target.package_id);
  const tMat = norm(target.material);
  const tZone = norm(target.zone);
  const tFam = family(target.name);

  const matches = [];
  for (const e of all) {
    if (!e || !e.guid) continue;
    if (e.guid === target.guid) continue;
    if (exclude.has(e.guid)) continue;

    let score = 0;
    const reasons = [];
    if (tType && norm(e.type) === tType) { score += 3; reasons.push('same type'); }
    if (tFam && family(e.name) === tFam) { score += 2; reasons.push('same family'); }
    if (tLevel && norm(e.level) === tLevel) { score += 2; reasons.push('same level'); }
    if (tPkg && norm(e.package_id) === tPkg) { score += 2; reasons.push('same package'); }
    if (tMat && norm(e.material) === tMat) { score += 2; reasons.push('same material'); }
    if (tZone && norm(e.zone) === tZone) { score += 2; reasons.push('same zone'); }

    // Require a real signal: either the same type, or a couple of strong matches.
    const sameType = tType && norm(e.type) === tType;
    if (!sameType && score < 4) continue;
    if (score < 2) continue;

    const confidence = score >= 6 ? 'high' : score >= 4 ? 'medium' : 'low';
    matches.push({ guid: e.guid, score, confidence, reasons, element: e });
  }

  matches.sort((a, b) => b.score - a.score);
  return { matches, targetFamily: tFam };
}

/** Shared attributes across a set of elements (for the group panel summary). */
export function sharedAttributes(els = []) {
  if (!els.length) return {};
  const allSame = (key) => {
    const first = norm(els[0][key]);
    return first && els.every((e) => norm(e[key]) === first) ? els[0][key] : null;
  };
  return {
    type: allSame('type'),
    level: allSame('level'),
    package_id: allSame('package_id'),
    material: allSame('material'),
    zone: allSame('zone'),
  };
}
