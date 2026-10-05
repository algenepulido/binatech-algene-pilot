// ============================================================
// PILOT STARTER ONLY — evaluator scenario selections.
//
// Scenarios decide how the synthetic services answer: normally, with a
// failure, or held until an evaluator releases them. Selections are kept in
// sessionStorage so a held/error state can be chosen BEFORE a reload (to see
// a screen's first-load loading/error state). Fixture data itself is
// in-memory and always resets on reload.
// ============================================================

export const SCENARIO_KEYS = Object.freeze({
  // How reads of the listed tables answer: 'normal' | 'error' | 'hold'
  invoiceReads: 'invoiceReads',
  commercialReads: 'commercialReads',
  // How invoice writes (update / insert) answer: 'success' | 'failure' | 'hold'
  invoiceWrites: 'invoiceWrites',
  // How simulated progress-report submissions answer: 'success' | 'failure' | 'hold'
  progressSubmission: 'progressSubmission',
});

const DEFAULTS = Object.freeze({
  invoiceReads: 'normal',
  commercialReads: 'normal',
  invoiceWrites: 'success',
  progressSubmission: 'success',
});
const ALLOWED = Object.freeze({
  invoiceReads: ['normal', 'error', 'hold'],
  commercialReads: ['normal', 'error', 'hold'],
  invoiceWrites: ['success', 'failure', 'hold'],
  progressSubmission: ['success', 'failure', 'hold'],
});
const STORAGE_KEY = 'pilot-starter-scenarios-v1';

function readStored(storage) {
  try { return JSON.parse(storage?.getItem(STORAGE_KEY) || '{}') || {}; } catch { return {}; }
}

export function createScenarios(storage) {
  const values = { ...DEFAULTS };
  const stored = readStored(storage);
  for (const [k, v] of Object.entries(stored)) if (ALLOWED[k]?.includes(v)) values[k] = v;
  const listeners = new Set();
  return {
    get: (key) => values[key],
    all: () => ({ ...values }),
    allowed: (key) => ALLOWED[key] || [],
    set(key, value) {
      if (!ALLOWED[key]?.includes(value)) throw new Error(`Unknown starter scenario ${key}=${value}`);
      values[key] = value;
      try { storage?.setItem(STORAGE_KEY, JSON.stringify(values)); } catch { /* storage unavailable: in-memory only */ }
      for (const l of listeners) l();
    },
    reset() {
      Object.assign(values, DEFAULTS);
      try { storage?.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      for (const l of listeners) l();
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
