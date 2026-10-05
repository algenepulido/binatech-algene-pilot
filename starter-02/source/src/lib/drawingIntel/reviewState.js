// ============================================================
// Review session — the single state model behind the drawing-intelligence
// review. Every entry point (BOQ item, WIR, measurement sheet, drawing
// record, IFC element, IPA requirement) resolves to the SAME session shape,
// and every candidate transition is an EXPLICIT human action. Nothing here
// persists anywhere: review records are frontend-only until a safe,
// non-authoritative persistence path exists (none is invented in this PR).
//
// STATE: built client-side · read-only · not persisted.
// ============================================================
import { proofChain, currentRevision, effectiveIpcOutcome } from '../paymentApplication/model.js';

export const NOT_PERSISTED = 'Review decisions are NOT persisted — frontend-only review records in this release.';

export const CANDIDATE_STATUS = ['suggested', 'confirmed', 'rejected', 'vo_review', 'unresolved', 'needs_review'];
const FINAL = new Set(['confirmed', 'rejected']);

// ── Entry-point resolution (five ways in, one state out) ────

/**
 * Resolve any entry {kind, id} to the review anchor:
 * { drawingId, revisionId, lineId, requirementId }.
 * BOQ/WIR/measurement/element/requirement resolve through the IPA's proof
 * chain; a drawing entry resolves to itself at its CURRENT revision. Unknown
 * entries resolve to null (the UI shows an honest empty state, never a guess).
 */
export function resolveReviewEntry(entry, { ipa, drawings }) {
  if (!entry) return null;
  if (entry.kind === 'drawing') {
    const d = (drawings || []).find((x) => x.id === entry.id);
    if (!d) return null;
    const line = (ipa?.lines || []).find((l) => l.drawingId === d.id) || null;
    return { drawingId: d.id, revisionId: line?.revisionId || currentRevision(d)?.id || null, lineId: line?.id || null, requirementId: line?.requirementId || null };
  }
  const kind = entry.kind === 'measurement' ? 'line' : entry.kind; // measurements resolve via their line
  let chain = null;
  if (entry.kind === 'measurement') {
    const line = (ipa?.lines || []).find((l) => l.measurementId === entry.id);
    chain = line ? proofChain(ipa, 'line', line.id) : null;
  } else {
    chain = proofChain(ipa, kind, entry.id);
  }
  if (!chain) return null;
  return { drawingId: chain.drawingId, revisionId: chain.revisionId || null, lineId: chain.lineId, requirementId: chain.requirementId };
}

// ── IPA context (Part 7 — the commercial frame around the review) ──

/** Locate a requirement's volume/section placement inside the template. */
function placementOf(ipa, requirementId) {
  for (const v of ipa?.template?.volumes || []) {
    for (const p of v.parts || []) {
      for (const s of p.sections || []) {
        if ((s.requirements || []).some((r) => r.id === requirementId)) {
          return { volume: v.label, section: s.label, sectionId: s.id };
        }
      }
    }
  }
  return null;
}

/** The current-IPA relationship every reviewed link must show. */
export function ipaContextFor(anchor, { ipa, drawings }) {
  const line = (ipa?.lines || []).find((l) => l.id === anchor?.lineId) || null;
  const placement = placementOf(ipa, anchor?.requirementId);
  const d = (drawings || []).find((x) => x.id === anchor?.drawingId) || null;
  const cur = d ? currentRevision(d) : null;
  const missing = [];
  if (line) {
    if (line.wirStatus !== 'approved') missing.push('approved WIR');
    if (!line.evidenceIds?.length) missing.push('evidence');
    if (!line.measurementId) missing.push('measurement');
  }
  return {
    ipaNo: ipa?.no ?? null,
    period: ipa?.period?.label ?? null,
    volume: placement?.volume || null,
    section: placement?.section || null,
    requirementId: anchor?.requirementId || null,
    boqItemId: line?.boqLineId || null,
    location: line?.drawingRegion || null,
    includedInCurrentIpa: Boolean(line),
    supportStatus: line ? (missing.length ? 'gaps' : 'supported') : 'not_in_application',
    missingRecords: missing,
    supersededRisk: Boolean(anchor?.revisionId && cur && cur.id !== anchor.revisionId),
    effectiveIpc: effectiveIpcOutcome(ipa || {})?.ref || null,
  };
}

// ── Session ─────────────────────────────────────────────────

/** Create a review session from a resolved anchor + validated extraction + candidates. */
export function createReviewSession({ anchor, ipa, drawings, extraction, candidates, source }) {
  const d = (drawings || []).find((x) => x.id === anchor?.drawingId) || null;
  const cur = d ? currentRevision(d) : null;
  const rev = d?.revisions?.find((r) => r.id === anchor?.revisionId) || cur || null;
  return {
    anchor: anchor || null,
    drawing: d, revision: rev,
    latestApproved: cur,
    superseded: Boolean(rev && cur && rev.id !== cur.id),
    ipaContext: ipaContextFor(anchor, { ipa, drawings }),
    extraction: extraction || null,
    source: source || 'none',          // 'live' | 'demo' | 'none' — the UI badges demo, always
    candidates: candidates || [],
    focus: null,                       // { regionId, page, bbox|polygon }
  };
}

/** Focus the source region behind a candidate/region id (page + coordinates). */
export function focusRegion(session, regionId) {
  const r = (session.extraction?.detected_regions || []).find((x) => x.id === regionId);
  if (!r) return session;
  return { ...session, focus: { regionId: r.id, page: r.page, bbox: r.bbox || null, polygon: r.polygon || null } };
}

// ── Candidate transitions (human-explicit; nothing implicit) ──

function transition(session, candId, next, patch = {}) {
  return {
    ...session,
    candidates: session.candidates.map((c) => {
      if (c.id !== candId) return c;
      if (FINAL.has(c.status)) throw new Error(`candidate already ${c.status} — review is final`);
      return { ...c, status: next, reviewedBy: 'user', ...patch };
    }),
  };
}

export const confirmCandidate = (s, id) => {
  const c = s.candidates.find((x) => x.id === id);
  if (!c?.boqItemId) throw new Error('cannot confirm a candidate with no BOQ item — choose one explicitly or mark it for VO review');
  return transition(s, id, 'confirmed', { reviewedAction: 'confirm' });
};
export const rejectCandidate = (s, id) => transition(s, id, 'rejected', { reviewedAction: 'reject' });
/** Replace the candidate's BOQ item — confirmed ONLY by this explicit pick. */
export const reassignCandidate = (s, id, boqItemId) => {
  if (!boqItemId) throw new Error('reassign requires an explicitly chosen BOQ item');
  return transition(s, id, 'confirmed', { boqItemId, possibleOutsideScope: false, reviewedAction: 'reassign' });
};
/** Route possible outside-BOQ work to VO review (a decision, not a link). */
export const markOutsideScope = (s, id) => transition(s, id, 'vo_review', { possibleOutsideScope: true, reviewedAction: 'vo' });
/** Park a suggestion without deciding — stays visible, never auto-resolves. */
export const leaveUnresolved = (s, id) => transition(s, id, 'unresolved', { reviewedAction: 'unresolved' });

/** Attach a related record (WIR / measurement / IFC element) — explicit pick. */
export function linkRelated(session, candId, kind, refId) {
  const key = { wir: 'relatedWirs', measurement: 'relatedMeasurements', element: 'relatedElements' }[kind];
  if (!key) throw new Error(`unknown related-record kind "${kind}"`);
  if (!refId) throw new Error('linking requires an explicitly chosen record');
  return {
    ...session,
    candidates: session.candidates.map((c) => (c.id === candId
      ? { ...c, [key]: c[key].includes(refId) ? c[key] : [...c[key], refId] }
      : c)),
  };
}
