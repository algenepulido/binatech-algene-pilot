// ============================================================
// Deterministic package auto-split (NO AI). Groups BoQ lines by their code
// structure (shared prefix / numbering hierarchy) or the bill's own section
// field, and derives a sensible name from the dominant descriptions. Pure +
// side-effect-free: it only PROPOSES groupings — assignment happens on user
// Accept. Organizational only; never touches certification.
// ============================================================

// The grouping key for a single code:
//  - delimited hierarchy ("1.01", "2-03", "A/1")  -> first token ("1", "2", "A")
//  - concatenated numeric ("5030", "5110")         -> leading 2 digits ("50", "51")
//  - short numeric ("3")                            -> the number itself
//  - alpha-led ("ELEC-1")                           -> leading letters
export function groupKeyFromCode(code) {
  const c = String(code ?? '').trim();
  if (!c) return null;
  const delim = c.match(/^([^.\-/\s]+)[.\-/\s]/);
  if (delim) return delim[1];
  const digits = c.match(/^\d+/);
  if (digits) return digits[0].length >= 4 ? digits[0].slice(0, 2) : digits[0];
  const alpha = c.match(/^[A-Za-z]+/);
  return alpha ? alpha[0] : c.slice(0, 2);
}

const lineValue = (l) => Number(l.qty || 0) * Number(l.rate || 0);

// Name a group from the most common leading word across its descriptions.
function deriveName(key, ls) {
  const words = {};
  ls.forEach((l) => { const w = String(l.description || '').trim().split(/\s+/)[0]; if (w && w.length > 1) words[w] = (words[w] || 0) + 1; });
  const top = Object.entries(words).sort((a, b) => b[1] - a[1])[0];
  return top ? `${key} · ${top[0]}` : `Group ${key}`;
}

/**
 * Propose packages from a set of line items.
 * @param lines [{ id, code, description, unit, qty, rate, section? }]
 * @returns [{ key, name, lineIds[], lineCount, contractValue, lines[] }]
 */
export function suggestPackages(lines = []) {
  if (!lines.length) return [];
  // Prefer the bill's own section field when it's populated for most lines.
  const sectioned = lines.filter((l) => (l.section || '').trim()).length >= lines.length * 0.6;
  const keyOf = sectioned
    ? (l) => (l.section || '').trim() || groupKeyFromCode(l.code) || 'Other'
    : (l) => groupKeyFromCode(l.code) || 'Other';

  const groups = new Map();
  lines.forEach((l) => { const k = keyOf(l); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(l); });

  return [...groups.entries()].map(([key, ls]) => ({
    key,
    name: sectioned ? key : deriveName(key, ls),
    lineIds: ls.map((l) => l.id),
    lineCount: ls.length,
    contractValue: ls.reduce((s, l) => s + lineValue(l), 0),
    lines: ls,
  })).sort((a, b) => b.contractValue - a.contractValue);
}

/**
 * Is the deterministic split poor (so we should offer the AI fallback)?
 * Poor = one giant group swallowing most lines, OR most codes unparseable.
 */
export function splitQuality(lines = []) {
  if (!lines.length) return { poor: true, reason: 'No lines to group.' };
  const groups = suggestPackages(lines);
  const unparsed = lines.filter((l) => !groupKeyFromCode(l.code)).length;
  const biggest = groups.reduce((m, g) => Math.max(m, g.lineCount), 0);
  if (groups.length <= 1) return { poor: true, reason: 'Code structure yields a single group.' };
  if (biggest / lines.length > 0.8) return { poor: true, reason: 'One group covers most lines — codes may be flat.' };
  if (unparsed / lines.length > 0.4) return { poor: true, reason: 'Most codes are missing or unparseable.' };
  return { poor: false, reason: '' };
}
