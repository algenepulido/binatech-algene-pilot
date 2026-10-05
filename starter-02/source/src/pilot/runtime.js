// ============================================================
// PILOT STARTER ONLY — the single runtime that wires the synthetic services.
//
// Imported by src/lib/supabase.js (the application's only backend boundary)
// and by the starter bootstrap. It imports NO application module, so it is
// ready before any provider or screen loads. One instance per page.
// ============================================================
import { createCallLog } from './adapters/callLog.js';
import { createStrictClient } from './adapters/strictSupabase.js';
import { createSyntheticAuth } from './adapters/syntheticAuth.js';
import { createInvoiceControllers } from './adapters/controllers.js';
import { POLICY } from './adapters/policy.js';
import { createProgressReportService } from './services/progressReportService.js';
import { createScenarios, SCENARIO_KEYS } from './scenarios.js';
import { createFixtureStore, SYNTHETIC_USER, PILOT_PROJECT_IDS, PROGRESS_REFERENCE_FIXTURES } from './fixtures/data.js';

function safeSessionStorage() {
  try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null; } catch { return null; }
}

export function createPilotRuntime({ storage = safeSessionStorage() } = {}) {
  const log = createCallLog();
  const scenarios = createScenarios(storage);
  const store = createFixtureStore();
  const { auth, control: authControl } = createSyntheticAuth({ user: SYNTHETIC_USER, log });
  let idSeq = 0;
  const controllers = createInvoiceControllers({
    writeScenario: () => scenarios.get(SCENARIO_KEYS.invoiceWrites),
    newId: () => `d0000000-0000-4000-8000-${String(900000000000 + ++idSeq)}`,
    now: () => new Date().toISOString(),
    userId: () => authControl.current()?.user?.id ?? null,
  });
  // Read scenarios apply to the target lists only: the invoice list and the Commercial Control BoQ list.
  const readScenario = (table, state) => {
    const fullRowList = state.columns?.all && !state.head;
    if (table === 'invoices' && fullRowList) return scenarios.get(SCENARIO_KEYS.invoiceReads);
    if (table === 'boq_items' && fullRowList) return scenarios.get(SCENARIO_KEYS.commercialReads);
    return 'normal';
  };
  const client = createStrictClient({ store, policy: POLICY, controllers, log, auth, readScenario });
  // Reference ids resolve to their fixture's project; WIR references use the WIR number of a fixture WIR.
  const referenceProject = (type, id) => {
    if (type === 'wir') return store.wirs.find((w) => w.wir_number === id)?.project_id ?? null;
    return PROGRESS_REFERENCE_FIXTURES[type]?.find((r) => r.id === id)?.projectId ?? null;
  };
  const progressReports = createProgressReportService({
    log,
    scenario: () => scenarios.get(SCENARIO_KEYS.progressSubmission),
    isProject: (id) => PILOT_PROJECT_IDS.includes(id),
    referenceProject,
  });
  return { log, scenarios, store, client, authControl, progressReports, user: SYNTHETIC_USER };
}

/** The page-wide runtime. Tests may create their own with createPilotRuntime(). */
export const pilot = createPilotRuntime();
if (typeof globalThis !== 'undefined') {
  // Evaluator/test access only (labelled test behaviour); application code never reads this.
  globalThis.__pilotStarter = pilot;
}
