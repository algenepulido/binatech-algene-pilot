// ============================================================
// Storey/level display hygiene — DISPLAY ONLY. Maps known IFC typos to clean
// labels for rendering. The underlying element→storey data and all grouping
// keys stay the raw IFC value (we only transform the label at render time),
// so nothing about the model or its mapping is altered.
// ============================================================
const FIXES = {
  'grond floor': 'Ground floor',
  'grond': 'Ground',
  'grnd floor': 'Ground floor',
  'grnd': 'Ground',
};

export function normalizeStorey(name) {
  if (name == null) return name;
  const s = String(name).trim().replace(/\s+/g, ' ');
  if (!s) return s;
  const fixed = FIXES[s.toLowerCase()];
  if (fixed) return fixed;
  // Otherwise just tidy the leading capital; leave the rest of the source
  // label intact (e.g. "Roof" and "Roof floor" stay as distinct storeys).
  return s.charAt(0).toUpperCase() + s.slice(1);
}
