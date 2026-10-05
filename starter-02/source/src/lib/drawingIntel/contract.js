// ============================================================
// Drawing-intelligence CONTRACT — the request/response shapes exchanged with
// the `doc-intel` Edge Function, and the fail-closed validator the frontend
// runs BEFORE rendering anything an AI returned.
//
// The extraction reads the ISSUED PDF rendition only (never the native DWG,
// which stays a separately stored first-class artifact). The response is
// STRICT: every required field must be present with the right shape, every
// detected region must carry page + normalized geometry + text + type +
// confidence + commercial relevance — otherwise the WHOLE result is rejected
// ({ ok:false }) and the UI shows an honest failure, never a partial guess.
//
// STATE: built client-side · read-only. Pure module — no network, no React.
// ============================================================

export const REGION_TYPES = [
  'title_block', 'schedule_row', 'note', 'detail_callout', 'dimension',
  'section_mark', 'revision_cloud', 'legend', 'table', 'other',
];
export const RELEVANCE = ['high', 'medium', 'low', 'none'];

/** Top-level fields the extraction MUST return (arrays may be empty, never absent). */
export const REQUIRED_FIELDS = [
  'drawing_number', 'revision', 'title', 'discipline', 'issue_status', 'issue_date',
  'levels', 'zones', 'grid_ranges', 'chainage_ranges', 'element_types',
  'material_notes', 'specification_references', 'dimensions', 'referenced_drawings',
  'referenced_details', 'quantity_relevant_annotations', 'detected_regions', 'warnings',
];
const ARRAY_FIELDS = REQUIRED_FIELDS.filter((f) => ![
  'drawing_number', 'revision', 'title', 'discipline', 'issue_status', 'issue_date',
].includes(f));

/**
 * Build the request body for the doc-intel function. The document travels as a
 * safe reference or base64 payload prepared by the caller — this module never
 * reads files itself. BOQ/WIR/measurement/IPA context are the NORMALIZED
 * shapes from matching.js, so the model sees candidates, not raw tables.
 */
export function buildExtractionRequest({ document, drawing, boqCandidates, wirs, measurements, ipaContext }) {
  return {
    kind: 'shop_drawing_extraction',
    contract_version: 1,
    document: document || null,                       // { type:'base64_pdf', data } | { type:'reference', id }
    drawing: {
      number: drawing?.number || null, title: drawing?.title || null,
      revision: drawing?.revision || null, discipline: drawing?.discipline || null,
    },
    boq_candidates: (boqCandidates || []).slice(0, 200),
    wirs: (wirs || []).slice(0, 100),
    measurements: (measurements || []).slice(0, 100),
    ipa_context: ipaContext || null,
  };
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const unit01 = (v) => isNum(v) && v >= 0 && v <= 1;

/** Validate ONE detected region. Returns a problem string or null. */
function regionProblem(r, i) {
  const at = `detected_regions[${i}]`;
  if (!r || typeof r !== 'object') return `${at} is not an object`;
  if (!Number.isInteger(r.page) || r.page < 1) return `${at}.page must be an integer ≥ 1`;
  const hasBbox = Array.isArray(r.bbox) && r.bbox.length === 4 && r.bbox.every(unit01);
  const hasPoly = Array.isArray(r.polygon) && r.polygon.length >= 3
    && r.polygon.every((p) => Array.isArray(p) && p.length === 2 && p.every(unit01));
  if (!hasBbox && !hasPoly) return `${at} needs a normalized bbox [x,y,w,h] or polygon (all 0..1)`;
  if (typeof r.text !== 'string' || !r.text.trim()) return `${at}.text is required`;
  if (!REGION_TYPES.includes(r.region_type)) return `${at}.region_type must be one of ${REGION_TYPES.join('|')}`;
  if (!unit01(r.confidence)) return `${at}.confidence must be 0..1`;
  if (!RELEVANCE.includes(r.commercial_relevance)) return `${at}.commercial_relevance must be ${RELEVANCE.join('|')}`;
  return null;
}

/**
 * Fail-closed validation of an extraction response. Anything missing,
 * mis-shaped, or unrecognisable rejects the WHOLE payload — the caller renders
 * "extraction failed", never a partial or invented result. On success, regions
 * get stable ids (`rg-<n>`) if the model didn't provide them.
 */
export function validateExtraction(raw) {
  const problems = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, extraction: null, problems: ['response is not an object'] };
  }
  for (const f of REQUIRED_FIELDS) {
    if (!(f in raw)) problems.push(`missing required field "${f}"`);
  }
  for (const f of ARRAY_FIELDS) {
    if (f in raw && !Array.isArray(raw[f])) problems.push(`"${f}" must be an array`);
  }
  if (problems.length) return { ok: false, extraction: null, problems };

  (raw.detected_regions || []).forEach((r, i) => {
    const p = regionProblem(r, i);
    if (p) problems.push(p);
  });
  if (problems.length) return { ok: false, extraction: null, problems };

  const extraction = {
    ...raw,
    detected_regions: raw.detected_regions.map((r, i) => ({ id: r.id || `rg-${i + 1}`, ...r })),
  };
  return { ok: true, extraction, problems: [] };
}
