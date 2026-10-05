// ============================================================
// Payment Application model — the canonical frontend representation of the
// corrected IPA/IPC product model (docs/binatech-payment-application-product-model.md).
//
//   IPA = the contractor's period-scoped payment APPLICATION — the parent
//         object: a structured submission package (volumes → parts → sections
//         → requirements) carrying documents, compliance validity, measurement,
//         take-off and forecast.
//   IPC = the client/consultant's CERTIFICATION OUTCOME linked to one IPA.
//         One IPA can produce zero, one, or (after returns/corrections)
//         several IPC events — of which exactly ONE is currently effective.
//
// They are never interchangeable and never one artifact.
//
// STATE: built client-side · read-only. Everything here is a pure,
// deterministic view-model over synthetic or imported data. Nothing is
// authoritative: certified values, money math and certification enforcement
// stay behind the backend gates (is_backend_derived = false throughout).
// No Supabase, no storage, no side effects — deterministically testable.
// ============================================================

// ── Enumerations (data, not UI copy) ────────────────────────

/** Lifecycle of the application package itself (the contractor's side). */
export const IPA_STATUS = ['draft', 'assembling', 'submitted', 'returned_for_correction', 'resubmitted', 'closed'];

/** Lifecycle of a certification outcome (the client/consultant's side). */
export const IPC_OUTCOME_STATUS = ['pending', 'certified', 'partially_certified', 'rejected', 'superseded'];

/** A requirement inside a template section. `required:false` = optional. */
export const REQUIREMENT_STATUS = ['missing', 'attached', 'valid', 'expiring', 'expired', 'superseded_revision'];

/** Review states for an AI-proposed commercial link. Confirmation is a HUMAN act. */
export const SUGGESTION_STATUS = ['suggested', 'confirmed', 'rejected', 'needs_review'];

/** Artifact kinds — a native CAD file and its issued rendition are DISTINCT. */
export const ARTIFACT_KINDS = ['native_dwg', 'issued_pdf', 'spreadsheet', 'photo', 'document', 'model_pointer'];

// ── Compliance validity (nullable expiry is first-class) ────

/**
 * Classify one compliance/contractual document's validity on a given date.
 * `expires_on: null` means "no expiry defined" — a legitimate state, NOT an
 * error and NOT treated as expired. `horizonDays` is the configurable warning
 * window (validity horizon), never a hardcoded business rule.
 */
export function complianceState(doc, onDate, horizonDays = 30) {
  if (!doc) return 'missing';
  if (doc.expires_on == null) return 'valid_no_expiry';
  const now = new Date(onDate).getTime();
  const exp = new Date(doc.expires_on).getTime();
  if (Number.isNaN(exp)) return 'unknown';
  if (exp < now) return 'expired';
  if (exp - now <= horizonDays * 86400000) return 'expiring';
  return 'valid';
}

// ── Template (template is DATA, not code) ───────────────────

/**
 * Validate a submission template shape. The renderer must consume WHATEVER the
 * template defines — any number of volumes/parts/sections, optional sections,
 * absent part numbers, bilingual labels. Nothing here assumes a fixed section
 * count; a template with 3 sections and one with 40 are equally valid.
 * Returns { ok, problems[] } — it reports, it never "fixes".
 */
export function validateTemplate(template) {
  const problems = [];
  if (!template || !Array.isArray(template.volumes) || template.volumes.length === 0) {
    return { ok: false, problems: ['template has no volumes'] };
  }
  if (!template.version) problems.push('template has no version — templates must be versioned');
  template.volumes.forEach((v, vi) => {
    if (!v.label?.en) problems.push(`volume[${vi}] missing en label`);
    (v.parts || []).forEach((p, pi) => {
      // part_no may legitimately be absent (irregular client templates) —
      // that is rendered with a fallback, not rejected.
      (p.sections || []).forEach((s, si) => {
        if (!s.label?.en) problems.push(`volume[${vi}].part[${pi}].section[${si}] missing en label`);
        if (s.optional !== true && (!Array.isArray(s.requirements) || s.requirements.length === 0)) {
          problems.push(`required section "${s.label?.en || si}" defines no requirements`);
        }
      });
    });
  });
  return { ok: problems.length === 0, problems };
}

/** Flatten a template into its requirement rows (for readiness + rendering). */
export function flattenRequirements(template) {
  const rows = [];
  (template?.volumes || []).forEach((v) => (v.parts || []).forEach((p) => (p.sections || []).forEach((s) => {
    (s.requirements || []).forEach((r) => rows.push({ ...r, volumeId: v.id, partId: p.id, sectionId: s.id, sectionOptional: s.optional === true }));
  })));
  return rows;
}

// ── Two-axis readiness (the axes are NEVER mixed) ───────────

/**
 * SUBMISSION readiness — "is the package complete enough to submit?"
 * Counts required requirements whose document instance exists and whose
 * compliance is not expired/superseded. Optional sections never count against.
 * Returns { pct, satisfied, requiredTotal, blockers[] }.
 */
export function computeSubmissionReadiness(ipa, onDate) {
  const rows = flattenRequirements(ipa.template).filter((r) => r.required !== false && !r.sectionOptional);
  const blockers = [];
  let satisfied = 0;
  for (const r of rows) {
    const doc = (ipa.documents || []).find((d) => d.requirementId === r.id);
    if (!doc) { blockers.push({ requirementId: r.id, kind: 'missing' }); continue; }
    const state = complianceState(doc, onDate ?? ipa.periodEnd, ipa.validityHorizonDays);
    if (state === 'expired') { blockers.push({ requirementId: r.id, kind: 'expired' }); continue; }
    if (doc.revisionSuperseded) { blockers.push({ requirementId: r.id, kind: 'superseded_revision' }); continue; }
    satisfied += 1;
  }
  const requiredTotal = rows.length;
  return { pct: requiredTotal ? Math.round((satisfied / requiredTotal) * 100) : 0, satisfied, requiredTotal, blockers };
}

/**
 * CERTIFICATION readiness — "is the claimed value provable?"
 * Value-weighted: a claimed line counts as provable only when it is backed by
 * an approved WIR AND linked evidence AND a measurement reference. This is an
 * ILLUSTRATIVE client-side computation over display data — the authoritative
 * certifiable-value calculation is a backend concern (Gate 1) and is not here.
 * Returns { pct, provableValue, claimedValue, gaps[] }.
 */
export function computeCertificationReadiness(ipa) {
  let claimedValue = 0; let provableValue = 0; const gaps = [];
  for (const line of ipa.lines || []) {
    const v = Number(line.claimedValue) || 0;
    claimedValue += v;
    const missing = [];
    if (line.wirStatus !== 'approved') missing.push('approved WIR');
    if (!line.evidenceIds?.length) missing.push('evidence');
    if (!line.measurementId) missing.push('measurement');
    if (missing.length) gaps.push({ lineId: line.id, missing, value: v });
    else provableValue += v;
  }
  return { pct: claimedValue ? Math.round((provableValue / claimedValue) * 100) : 0, provableValue, claimedValue, gaps };
}

// ── IPC outcomes (linked, never the package itself) ─────────

/**
 * Exactly ONE current effective IPC outcome per IPA: the latest event that is
 * not superseded. Earlier events remain in history (corrective certification
 * chains), they never disappear and are never "the IPA".
 */
export function effectiveIpcOutcome(ipa) {
  const events = (ipa.ipcEvents || []).filter((e) => e.status !== 'superseded');
  if (!events.length) return null;
  return [...events].sort((a, b) => new Date(b.issuedOn) - new Date(a.issuedOn))[0];
}

/** Full outcome history, newest first (superseded included, flagged). */
export function ipcOutcomeHistory(ipa) {
  return [...(ipa.ipcEvents || [])].sort((a, b) => new Date(b.issuedOn) - new Date(a.issuedOn));
}

// ── Drawings: revisions + native/issued renditions ──────────

/** Current (latest, non-withdrawn) revision of a drawing record. */
export function currentRevision(drawing) {
  const revs = (drawing?.revisions || []).filter((r) => !r.withdrawn);
  if (!revs.length) return null;
  return [...revs].sort((a, b) => new Date(b.issuedOn) - new Date(a.issuedOn))[0];
}

/**
 * Warnings for links that point at a superseded drawing revision — the
 * classic "measured off the old rev" failure. Pure detection, no mutation.
 */
export function supersededLinkWarnings(links, drawings) {
  const byId = new Map((drawings || []).map((d) => [d.id, d]));
  const warnings = [];
  for (const link of links || []) {
    if (!link.drawingId || !link.revisionId) continue;
    const cur = currentRevision(byId.get(link.drawingId));
    if (cur && cur.id !== link.revisionId) {
      warnings.push({ linkId: link.id, drawingId: link.drawingId, linkedRevision: link.revisionId, currentRevision: cur.id });
    }
  }
  return warnings;
}

/**
 * Split a drawing revision's artifacts into the native CAD file and its issued
 * rendition. They are distinct artifacts related by rendition_of — the AI
 * intake (PR B) reads the ISSUED PDF; the native DWG is stored and linked only.
 */
export function revisionArtifacts(revision) {
  const arts = revision?.artifacts || [];
  return {
    native: arts.find((a) => a.kind === 'native_dwg') || null,
    issued: arts.find((a) => a.kind === 'issued_pdf') || null,
    others: arts.filter((a) => a.kind !== 'native_dwg' && a.kind !== 'issued_pdf'),
  };
}

// ── Proof chain (one relationship, five entry points) ───────

/**
 * Resolve the shared proof chain around any starting entity. The SAME chain
 * (BOQ line ↔ BIM element ↔ drawing location ↔ WIR ↔ measurement ↔ evidence
 * ↔ IPA section) must be reachable from a BOQ line, a drawing region, a BIM
 * element, a WIR or an IPA requirement — so this takes (kind, id) and returns
 * whatever is connected in the cycle's link graph.
 */
export function proofChain(ipa, kind, id) {
  const line = (ipa.lines || []).find((l) => (
    (kind === 'boq' && l.boqLineId === id) ||
    (kind === 'element' && l.elementId === id) ||
    (kind === 'drawing' && l.drawingId === id) ||
    (kind === 'wir' && l.wirId === id) ||
    (kind === 'requirement' && l.requirementId === id) ||
    (kind === 'line' && l.id === id)
  ));
  if (!line) return null;
  return {
    lineId: line.id,
    boqLineId: line.boqLineId || null,
    elementId: line.elementId || null,
    drawingId: line.drawingId || null,
    revisionId: line.revisionId || null,
    drawingRegion: line.drawingRegion || null,
    wirId: line.wirId || null,
    measurementId: line.measurementId || null,
    evidenceIds: line.evidenceIds || [],
    requirementId: line.requirementId || null,
  };
}

// ── Take-off hierarchy rollup ───────────────────────────────

/**
 * Aggregate measurement details up the take-off hierarchy:
 * measurement detail → zone → work type → bill → IPA summary.
 * Pure fold; qty values are display data, never authoritative money.
 */
export function takeoffRollup(details) {
  const zones = new Map();
  for (const d of details || []) {
    const zKey = d.zone || '—';
    const wKey = d.workType || '—';
    const bKey = d.bill || '—';
    if (!zones.has(zKey)) zones.set(zKey, { zone: zKey, qty: 0, workTypes: new Map() });
    const z = zones.get(zKey);
    z.qty += Number(d.qty) || 0;
    if (!z.workTypes.has(wKey)) z.workTypes.set(wKey, { workType: wKey, qty: 0, bills: new Map() });
    const w = z.workTypes.get(wKey);
    w.qty += Number(d.qty) || 0;
    w.bills.set(bKey, (w.bills.get(bKey) || 0) + (Number(d.qty) || 0));
  }
  const total = [...zones.values()].reduce((s, z) => s + z.qty, 0);
  return {
    total,
    zones: [...zones.values()].map((z) => ({
      zone: z.zone, qty: z.qty,
      workTypes: [...z.workTypes.values()].map((w) => ({ workType: w.workType, qty: w.qty, bills: [...w.bills.entries()].map(([bill, qty]) => ({ bill, qty })) })),
    })),
  };
}

// ── AI suggestion review (human confirmation is the ONLY path) ──

/**
 * Apply a HUMAN review action to an AI-proposed commercial link. This is the
 * single legal transition function:
 *   • only 'confirm' | 'reject' | 'reassign' are accepted, and only from a
 *     reviewable state — AI output can never arrive pre-confirmed;
 *   • an unrecognised suggestion status fails CLOSED to needs_review;
 *   • an unrecognised action throws (no silent success);
 *   • 'reassign' requires an explicit target BOQ line chosen by the user.
 * AI never writes certified quantities, rates, WIR approvals or IPC outcomes —
 * those fields do not even exist on this object.
 */
export function reviewSuggestion(suggestion, action, { boqLineId, reviewer } = {}) {
  const status = SUGGESTION_STATUS.includes(suggestion?.status) ? suggestion.status : 'needs_review';
  const base = { ...suggestion, status };
  if (status === 'confirmed' || status === 'rejected') {
    throw new Error(`suggestion already ${status} — review is final`);
  }
  switch (action) {
    case 'confirm':
      return { ...base, status: 'confirmed', reviewedBy: reviewer || 'user', reviewedAction: 'confirm' };
    case 'reject':
      return { ...base, status: 'rejected', reviewedBy: reviewer || 'user', reviewedAction: 'reject' };
    case 'reassign':
      if (!boqLineId) throw new Error('reassign requires an explicitly chosen BOQ line');
      return { ...base, status: 'confirmed', boqLineId, reviewedBy: reviewer || 'user', reviewedAction: 'reassign' };
    default:
      throw new Error(`unknown review action "${action}" — suggestions cannot change state implicitly`);
  }
}

/**
 * Normalize a raw AI extraction result into reviewable suggestions.
 * Anything malformed (no BOQ line, no confidence, unknown shape) fails closed
 * to needs_review — the UI shows it as "needs human triage", it is NEVER
 * silently confirmed and never dropped.
 */
export function normalizeAiResult(raw) {
  if (!raw || !Array.isArray(raw.suggestions)) return { ok: false, suggestions: [], reason: 'unrecognised AI result shape' };
  const suggestions = raw.suggestions.map((s, i) => {
    const conf = Number(s?.confidence);
    const wellFormed = s && typeof s.boqLineId === 'string' && Number.isFinite(conf) && conf >= 0 && conf <= 1;
    return {
      id: s?.id || `sug-${i}`,
      boqLineId: s?.boqLineId || null,
      confidence: wellFormed ? conf : null,
      reason: s?.reason || '',
      matchedText: s?.matchedText || '',
      location: s?.location || null,
      unitCompatible: s?.unitCompatible === true,
      sourceRegion: s?.sourceRegion || null,
      warnings: Array.isArray(s?.warnings) ? s.warnings : [],
      status: wellFormed ? 'suggested' : 'needs_review',
    };
  });
  return { ok: true, suggestions };
}

// ── Naming: three distinct filename concepts ────────────────

/**
 * Deterministic submission name for the ordered package output. Same inputs →
 * same name, always. This never overwrites `originalFilename` (preserved
 * verbatim) or the normalized metadata record — three concepts, three fields.
 * Shape: <PROJ>-IPA<nn>-V<vol>-S<section>-<slug>-R<rev>.<ext>
 */
export function deterministicSubmissionName({ projectCode, ipaNo, volumeNo, sectionCode, title, revision, ext }) {
  const slug = String(title || 'document').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 40) || 'document';
  const pad = (n) => String(n ?? 0).padStart(2, '0');
  return `${projectCode || 'PROJ'}-IPA${pad(ipaNo)}-V${pad(volumeNo)}-S${sectionCode || '00'}-${slug}-R${pad(revision)}.${(ext || 'pdf').replace(/^\./, '')}`;
}
