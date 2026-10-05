// ============================================================
// exportSanitize — neutralize spreadsheet formula (CSV) injection in exports.
//
// A TEXT value that starts with = + - @ (or a tab / carriage return) can be
// executed as a formula when a CSV/XLSX is opened in Excel or Google Sheets
// (CSV / formula injection, OWASP). We prefix such text with a single quote so
// the spreadsheet shows it as literal text instead of evaluating it.
//
// Only STRINGS are touched. Numbers, booleans, null, and ExcelJS formula objects
// ({ formula: '...' }) pass through unchanged — so legitimate numeric exports and
// the app's own linked formulas are never corrupted.
// ============================================================

// Leading characters that trigger formula evaluation in spreadsheet apps.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * Sanitize one cell value for spreadsheet export (typed cells, e.g. ExcelJS).
 * - a string starting with a formula trigger → prefixed with a single quote
 * - everything else (number, boolean, null, formula object) → returned as-is
 */
export function sanitizeCell(value) {
  if (typeof value === 'string' && FORMULA_TRIGGER.test(value)) return `'${value}`;
  return value;
}

/**
 * Sanitize a value destined for a CSV field, where every value becomes text.
 * Genuine numbers/booleans stay numeric (never prefixed) so numeric columns are
 * not corrupted; arrays are joined with '; '; any other text is guarded.
 * Returns '' for null/undefined.
 */
export function sanitizeCsvField(value) {
  if (value == null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const s = Array.isArray(value) ? value.join('; ') : String(value);
  return FORMULA_TRIGGER.test(s) ? `'${s}` : s;
}
