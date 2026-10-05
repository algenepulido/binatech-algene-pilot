// ============================================================
// Excel BOQ import helpers.
// - parseXlsx: read an .xlsx into raw rows (client-side, SheetJS).
// - heuristicMap: best-effort column mapping that works WITHOUT AI.
// - aiParse: calls the server-side Edge Function (Anthropic key stays
//   server-side) for robust structuring across varied layouts.
// The UI previews the result and only saves on user confirmation.
// ============================================================
import { supabase } from './supabase.js';
import { functionUrl, SUPABASE_ANON_KEY } from './config.js';

export async function parseXlsx(file) {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
}

const HEADER_KEYS = {
  code: ['code', 'item no', 'item code', 'item', 'ref', 'boq code', 'bill no', 'position', 'pos', 'sl', 'sr', 'serial'],
  description: ['description', 'desc', 'particulars', 'work', 'scope'],
  unit: ['unit', 'uom', 'units'],
  qty: ['qty', 'quantity', 'quant'],
  rate: ['rate', 'unit rate', 'unit price', 'price'],
  amount: ['amount', 'total', 'value'],
  section: ['section', 'wbs', 'category', 'group', 'bill'],
};

const num = (v) => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };

// Classify a parsed row so messy real-world BoQs don't import junk as priced
// lines. 'note' = spec/PDF/reference text; 'section' = a division/bill header
// (description but no measure); 'line' = a real priced item (has a measure).
const NOTE_RX = /\.(pdf|docx?|xlsx?|dwg|jpe?g|png)\b|^\s*n\.?\s*b\.?\b|\bn\s*\/\s*a\b|\b(specification|refer to|see spec|see drawing|as per drawing|notes?\s*:)/i;
const SECTION_RX = /^\s*(div(ision)?|bill\b|section\b|sub-?bill|element\b|trade\b)/i;
export function classifyBoqRow(r) {
  const desc = (r.description || '').toString().trim();
  const hasUnit = !!(r.unit && String(r.unit).trim());
  const hasMeasure = hasUnit || Number(r.qty) > 0 || Number(r.rate) > 0;
  if (hasMeasure) return 'line';
  if (NOTE_RX.test(desc)) return 'note';
  if (SECTION_RX.test(desc) || (desc && desc === desc.toUpperCase() && desc.length <= 60)) return 'section';
  return desc ? 'note' : 'note';
}

// Per-line confidence shown in the import preview. Field-completeness based
// (client-side) so it works whether the row came from the AI parse or the
// heuristic — without changing the Edge Function. high = code + unit + qty +
// rate all present; medium = has a measure but a field is missing; low = sparse.
export function lineConfidence(r) {
  const has = (v) => v != null && String(v).trim() !== '';
  const code = has(r.code), unit = has(r.unit), qty = Number(r.qty) > 0, rate = Number(r.rate) > 0, desc = has(r.description);
  const score = (code ? 1 : 0) + (unit ? 1 : 0) + (qty ? 1 : 0) + (rate ? 1 : 0) + (desc ? 1 : 0);
  if (code && unit && qty && rate) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

/** Heuristic column mapping — no AI. Returns { ok, rows, headerIdx, mapping }. */
export function heuristicMap(rows) {
  let headerIdx = -1, best = 0, mapping = {};
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const cells = (rows[i] || []).map((c) => String(c).toLowerCase().trim());
    const m = {}; let score = 0;
    cells.forEach((c, ci) => {
      for (const [field, keys] of Object.entries(HEADER_KEYS)) {
        if (m[field] != null) continue;
        if (keys.some((k) => c === k || c.includes(k))) { m[field] = ci; score++; }
      }
    });
    if (score > best) { best = score; headerIdx = i; mapping = m; }
  }
  if (headerIdx === -1 || best < 2) return { ok: false, rows: [], headerIdx };

  const dataRows = rows.slice(headerIdx + 1);
  const ncols = dataRows.reduce((mx, r) => Math.max(mx, (r || []).length), 0);

  // Content fallback: infer the CODE column when the header didn't name it
  // (the column whose cells most look like item numbers: 1, 1.01, 22 11 00, A1).
  if (mapping.code == null) {
    const CODE_RX = /^[A-Za-z]{0,3}\d+(?:[.\-/ ]\s?\d+)*[A-Za-z]?$/;
    let bestCol = -1, bestFrac = 0;
    for (let ci = 0; ci < ncols; ci++) {
      if (ci === mapping.description) continue;
      let hit = 0, tot = 0;
      for (const r of dataRows.slice(0, 80)) { const v = String((r || [])[ci] ?? '').trim(); if (!v) continue; tot++; if (CODE_RX.test(v)) hit++; }
      const frac = tot ? hit / tot : 0;
      if (tot >= 3 && frac > bestFrac) { bestFrac = frac; bestCol = ci; }
    }
    if (bestCol >= 0 && bestFrac >= 0.5) mapping.code = bestCol;
  }

  // Content fallback: infer numeric columns (qty/rate/amount) when not named —
  // fixes the "all numbers came in as 0" case. Common BoQ layout = the rightmost
  // numeric columns are qty, rate, amount.
  const numericCols = [];
  for (let ci = 0; ci < ncols; ci++) {
    if (ci === mapping.code || ci === mapping.description) continue;
    let numHit = 0, tot = 0;
    for (const r of dataRows.slice(0, 80)) { const v = String((r || [])[ci] ?? '').trim(); if (!v) continue; tot++; if (/^[-(]?[\d,]+(\.\d+)?\)?$/.test(v)) numHit++; }
    if (tot >= 3 && numHit / tot >= 0.6) numericCols.push(ci);
  }
  const unassigned = numericCols.filter((ci) => ci !== mapping.qty && ci !== mapping.rate && ci !== mapping.amount);
  if (mapping.amount == null && unassigned.length) mapping.amount = unassigned.pop();
  if (mapping.rate == null && unassigned.length) mapping.rate = unassigned.pop();
  if (mapping.qty == null && unassigned.length) mapping.qty = unassigned.pop();

  const out = [];
  let currentSection = null; // the active division/bill header — carried onto its items
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const get = (f) => (mapping[f] != null ? r[mapping[f]] : '');
    const code = String(get('code')).trim();
    const description = String(get('description')).trim();
    if (!code && !description) continue;
    const qty = num(get('qty')); const rate = num(get('rate'));
    const row = {
      section: String(get('section')).trim() || null,
      code: code || null,
      description: description || null,
      unit: String(get('unit')).trim() || null,
      qty, rate,
      amount: num(get('amount')) || qty * rate || 0,
    };
    row.kind = classifyBoqRow(row);
    // Preserve the source structure: a section/division header becomes the
    // active section and is carried DOWN onto the line items beneath it; every
    // row keeps its source-order position so the bill isn't re-sorted on save.
    if (row.kind === 'section') currentSection = (row.description || '').trim() || currentSection;
    else if (row.kind === 'line' && !row.section) row.section = currentSection;
    row.position = i;
    out.push(row);
  }
  return { ok: true, rows: out, headerIdx, mapping };
}

/** AI structuring via the server-side Edge Function (key stays on the server). */
export async function aiParse(rows) {
  const anon = SUPABASE_ANON_KEY;
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token || anon;
  // Only Authorization (the Bearer token authenticates). No `apikey` header — it
  // would trigger a CORS preflight the function doesn't allow, blocking the call.
  const res = await fetch(functionUrl('parse-boq'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ rows: rows.slice(0, 500) }),
  });
  if (!res.ok) {
    // Surface WHY so the fallback log is actionable: 404 = function not deployed;
    // a 500 'ANTHROPIC_API_KEY is not set' = secret missing (both owner actions).
    let detail = `${res.status}`;
    try { const e = await res.json(); detail = e?.error || e?.message || detail; } catch { /* non-JSON */ }
    throw new Error(`AI parser unavailable: ${detail}`);
  }
  const json = await res.json();
  if (!Array.isArray(json.rows)) throw new Error('AI parser returned no rows');
  let currentSection = null;
  return json.rows.map((r, idx) => {
    const row = {
      section: r.section ?? null, code: r.code ?? null, description: r.description ?? null,
      unit: r.unit ?? null, qty: Number(r.qty) || 0, rate: Number(r.rate) || 0,
      amount: Number(r.amount) || (Number(r.qty) || 0) * (Number(r.rate) || 0),
    };
    // Honor a kind from the AI if it classified; otherwise classify locally.
    row.kind = (r.kind === 'line' || r.kind === 'section' || r.kind === 'note') ? r.kind : classifyBoqRow(row);
    // Same structure preservation as the heuristic: carry the section down, keep order.
    if (row.kind === 'section') currentSection = (row.description || '').trim() || currentSection;
    else if (row.kind === 'line' && !row.section) row.section = currentSection;
    row.position = idx;
    return row;
  });
}
