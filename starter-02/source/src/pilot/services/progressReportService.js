// ============================================================
// PILOT STARTER ONLY — the TEST SERVICE for progress reports.
//
// This is the only submission service the mobile composer uses in the pilot.
// Nothing leaves the page: no office delivery, no upload, no persistence and
// no real acknowledgement. It is not a backend.
//
// Approved payload (v3 pilot):
//
//   import { submitProgressReport } from '<path>/pilot/progressReports.js';
//   const receipt = await submitProgressReport(report);
//
//   report = {
//     requestId:   string — required; the caller's identity for this request, used only to
//                  correlate the answer with the request. It is NOT an idempotency key: the
//                  test service does not de-duplicate, so sending the same requestId twice
//                  is two submissions.
//     projectId:   string — required; the explicit current project (getCurrentProjectId()),
//                  one of the synthetic projects.
//     reference:   null, or { type: 'area' | 'work_item' | 'wir', id: string } — a reference
//                  the reporter supplied, whose id must exist in the starter fixtures for that
//                  type AND belong to projectId. No label, no null id, no other fields.
//     description: string — required; must contain text after trimming. Kept exactly as
//                  entered (never trimmed or rewritten).
//     fieldStatus: 'in_progress' | 'blocked' | 'reported_complete' — required, chosen
//                  explicitly. Labels: In progress / Blocked / Reported complete.
//     blockerNote: string | null — optional for every status, including 'blocked'.
//     photos:      Array — 0 to 3 items. Each item is the `candidate` returned by the
//                  existing helper prepareEvidenceImage(file) when `ok` is true, passed as-is
//                  (a Blob; a File when the original was a File). Each must be a JPEG or PNG
//                  by its bytes and at most 3,000,000 bytes (inclusive) by its actual size.
//   }
//
//   success → resolves { ok: true, simulated: true, requestId, projectId, reference,
//                        receipt: { id, receivedAt, photoCount,
//                                   note: 'Received by the test service. Not delivered to the project team.' } }
//   failure → rejects SimulatedSubmissionError { requestId, projectId, code: 'SIMULATED_FAILURE' }
//   invalid → rejects ProgressReportContractError (the report broke the contract above)
//   hold    → stays pending until an evaluator releases it as success or failure
//
// The test service does NOT prevent duplicate submissions, retry, ignore late
// results or keep editor state — those belong to the composer.
// ============================================================

// Same cap as the existing image helper (src/lib/evidenceImagePreparation.js MAX_EVIDENCE_IMAGE_BYTES);
// kept as a literal so the runtime imports no application module. A starter smoke test pins the two together.
const MAX_EVIDENCE_IMAGE_BYTES = 3_000_000;

export const FIELD_STATUS_LABELS = Object.freeze({
  in_progress: 'In progress',
  blocked: 'Blocked',
  reported_complete: 'Reported complete',
});
export const REFERENCE_TYPE_LABELS = Object.freeze({ area: 'Area', work_item: 'Work item', wir: 'WIR' });

export const ACK_NOTE = 'Received by the test service. Not delivered to the project team.';

export const PROGRESS_REPORT_LIMITS = Object.freeze({
  maxPhotos: 3,
  maxPhotoBytes: MAX_EVIDENCE_IMAGE_BYTES,
  fieldStatuses: Object.freeze(Object.keys(FIELD_STATUS_LABELS)),
  referenceTypes: Object.freeze(Object.keys(REFERENCE_TYPE_LABELS)),
});

export class ProgressReportContractError extends TypeError {
  constructor(problem, requestId = null) {
    super(`Test service: the report breaks the agreed payload — ${problem}.`);
    this.name = 'ProgressReportContractError';
    this.code = 'CONTRACT_VIOLATION';
    this.requestId = requestId;
  }
}

export class SimulatedSubmissionError extends Error {
  constructor({ requestId, projectId }) {
    super('The test service did not receive your report (starter scenario). Nothing was sent or saved.');
    this.name = 'SimulatedSubmissionError';
    this.code = 'SIMULATED_FAILURE';
    this.requestId = requestId;
    this.projectId = projectId;
  }
}

const REPORT_FIELDS = ['requestId', 'projectId', 'reference', 'description', 'fieldStatus', 'blockerNote', 'photos'];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const isNonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

async function leadingBytes(blob, n) {
  const part = blob.slice(0, n);
  if (typeof part.arrayBuffer === 'function') return new Uint8Array(await part.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(part);
  });
}

/** JPEG or PNG judged by the bytes, with the declared type (if any) agreeing — the same rule the image helper applies. */
async function photoKind(blob) {
  const head = await leadingBytes(blob, 8);
  const kind = head.length >= 8 && PNG_SIGNATURE.every((v, i) => head[i] === v) ? 'png'
    : head.length >= 2 && head[0] === 0xff && head[1] === 0xd8 ? 'jpeg' : null;
  if (!kind) return null;
  const declared = blob.type || '';
  const agrees = !declared || (kind === 'jpeg' ? ['image/jpeg', 'image/jpg'].includes(declared) : declared === 'image/png');
  return agrees ? kind : null;
}

/**
 * @param {object} deps
 * @param {object} deps.log                 call log
 * @param {() => string} deps.scenario      'success' | 'failure' | 'hold'
 * @param {(projectId: string) => boolean} deps.isProject   true for a synthetic project id
 * @param {(type: string, id: string) => string|null} deps.referenceProject  the fixture's project id, or null if unknown
 */
export function createProgressReportService({ log, scenario, isProject, referenceProject }) {
  let receiptSeq = 0;

  async function validate(report) {
    if (!report || typeof report !== 'object' || Array.isArray(report)) return 'report must be an object';
    const extra = Object.keys(report).filter((k) => !REPORT_FIELDS.includes(k));
    if (extra.length) return `unknown field(s) ${extra.join(', ')}`;
    if (!isNonEmpty(report.requestId)) return 'requestId is required';
    if (typeof report.projectId !== 'string' || !isProject(report.projectId)) return 'projectId must be the current synthetic project';
    if (report.reference !== null) {
      const r = report.reference;
      if (!r || typeof r !== 'object' || Array.isArray(r)) return 'reference must be null or { type, id }';
      const keys = Object.keys(r).sort().join(',');
      if (keys !== 'id,type') return 'reference must have exactly { type, id } (no label or other fields)';
      if (!PROGRESS_REPORT_LIMITS.referenceTypes.includes(r.type)) return 'reference.type must be area, work_item or wir';
      if (!isNonEmpty(r.id)) return 'reference.id must be a supplied fixture id';
      const owner = referenceProject(r.type, r.id);
      if (owner === null) return `reference ${r.type} "${r.id}" is not a known fixture`;
      if (owner !== report.projectId) return `reference ${r.type} "${r.id}" belongs to another project`;
    }
    if (typeof report.description !== 'string' || !isNonEmpty(report.description)) return 'description must contain text';
    if (!PROGRESS_REPORT_LIMITS.fieldStatuses.includes(report.fieldStatus)) return 'fieldStatus must be in_progress, blocked or reported_complete';
    if (!(report.blockerNote === null || report.blockerNote === undefined || typeof report.blockerNote === 'string')) return 'blockerNote must be text or null';
    if (!Array.isArray(report.photos)) return 'photos must be an array (empty when there are none)';
    if (report.photos.length > PROGRESS_REPORT_LIMITS.maxPhotos) return `at most ${PROGRESS_REPORT_LIMITS.maxPhotos} photos`;
    for (const photo of report.photos) {
      if (typeof Blob === 'undefined' || !(photo instanceof Blob)) return 'each photo must be the File/Blob candidate returned by prepareEvidenceImage';
      if (!(photo.size > 0) || photo.size > PROGRESS_REPORT_LIMITS.maxPhotoBytes) return `photo of ${photo.size} bytes is outside 1–${PROGRESS_REPORT_LIMITS.maxPhotoBytes} bytes`;
      if (!(await photoKind(photo))) return 'each photo must be a JPEG or PNG (by its bytes)';
    }
    return null;
  }

  async function submitProgressReport(report) {
    const requestId = typeof report?.requestId === 'string' ? report.requestId : null;
    const projectId = typeof report?.projectId === 'string' ? report.projectId : null;
    const photos = Array.isArray(report?.photos)
      ? report.photos.map((p) => ({ name: typeof p?.name === 'string' ? p.name : null, declaredType: p?.type ?? null, bytes: p?.size ?? null }))
      : null;
    const entry = log.record({
      kind: 'submission', requestId, projectId, reference: report?.reference ?? null,
      descriptionLength: typeof report?.description === 'string' ? report.description.length : null,
      fieldStatus: report?.fieldStatus ?? null, hasBlockerNote: typeof report?.blockerNote === 'string' && report.blockerNote.length > 0,
      photos, outcome: 'validating',
    });
    const problem = await validate(report);
    if (problem) { log.update(entry, { outcome: 'contract-violation', problem }); throw new ProgressReportContractError(problem, requestId); }

    let outcome = scenario();
    if (outcome === 'hold') {
      log.update(entry, { outcome: 'held' });
      outcome = await log.hold(`progress report ${requestId}`, { outcomes: ['success', 'failure'], seq: entry.seq });
    }
    if (outcome === 'failure') {
      log.update(entry, { outcome: 'failure' });
      throw new SimulatedSubmissionError({ requestId, projectId });
    }
    const receipt = {
      id: `TEST-RECEIPT-${String(++receiptSeq).padStart(4, '0')}`,
      receivedAt: new Date().toISOString(),
      photoCount: report.photos.length,
      note: ACK_NOTE,
    };
    log.update(entry, { outcome: 'success', receiptId: receipt.id });
    return { ok: true, simulated: true, requestId, projectId, reference: report.reference, receipt };
  }
  return { submitProgressReport, limits: PROGRESS_REPORT_LIMITS };
}
