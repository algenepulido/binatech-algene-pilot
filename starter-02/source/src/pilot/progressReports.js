// ============================================================
// PILOT STARTER ONLY — the progress-report TEST SERVICE for the page (not a backend).
// The mobile composer imports submitProgressReport from here. See
// src/pilot/services/progressReportService.js for the full contract.
// ============================================================
import { pilot } from './runtime.js';

export {
  PROGRESS_REPORT_LIMITS, FIELD_STATUS_LABELS, REFERENCE_TYPE_LABELS, ACK_NOTE,
  ProgressReportContractError, SimulatedSubmissionError,
} from './services/progressReportService.js';
export { PROGRESS_CONTEXTS, PROGRESS_REFERENCE_FIXTURES } from './fixtures/data.js';

/** Test-service submission — nothing leaves the page. */
export const submitProgressReport = (report) => pilot.progressReports.submitProgressReport(report);
