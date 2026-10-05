// ============================================================
// PILOT STARTER ONLY — controllers for the few supported writes (invoices).
//
// Each write is logged with the exact target id, filters and payload the
// application sent, then answered according to the evaluator scenario:
//   success → the in-memory fixture changes and the row is returned
//   failure → a PostgREST-shaped error; nothing changes
//   hold    → stays pending until an evaluator releases it (success/failure)
// Baseline-compatible CHECK and NOT NULL rules for invoices are simulated so a
// bad payload fails here too (a synthetic contract, not live enforcement). These controllers do not add
// duplicate-click protection, retries, stale-result guards or permissions —
// those belong to the application.
// ============================================================
import { INVOICE_RULES } from './policy.js';

const failure = (message, code) => ({ data: null, error: { message, code, details: null, hint: null }, count: null, status: code === 'PILOT_WRITE_FAILURE' ? 500 : 400, statusText: 'Synthetic failure' });

function unknownFields(payload, columns) {
  return Object.keys(payload || {}).filter((k) => !columns.includes(k));
}

function violation(row) {
  for (const field of INVOICE_RULES.notNull) {
    if (row[field] == null || row[field] === '') {
      return failure(`null value in "${field}" of "invoices" violates not-null constraint`, '23502');
    }
  }
  if (!INVOICE_RULES.zatca_status.includes(row.zatca_status)) return failure('new row for "invoices" violates check constraint "invoices_zatca_status_check"', '23514');
  if (!INVOICE_RULES.payment_status.includes(row.payment_status)) return failure('new row for "invoices" violates check constraint "invoices_payment_status_check"', '23514');
  if (typeof row.amount !== 'number' || !Number.isFinite(row.amount)) return failure('invalid input syntax for type numeric', '22P02');
  return null;
}

/**
 * @param {object} deps
 * @param {() => string} deps.writeScenario  'success' | 'failure' | 'hold'
 * @param {() => string} deps.newId          deterministic synthetic id factory
 * @param {() => string} deps.now            clock (ISO string)
 * @param {() => string|null} deps.userId    synthetic session user id
 */
export function createInvoiceControllers({ writeScenario, newId, now, userId }) {
  async function decide(log, entry, label) {
    const scenario = writeScenario();
    if (scenario !== 'hold') return scenario;
    log.update(entry, { outcome: 'held' });
    return log.hold(label, { outcomes: ['success', 'failure'], seq: entry.seq });
  }
  const targetId = (state) => state.filters.find((f) => f.op === 'eq' && f.column === 'id')?.value ?? null;
  const settleFailure = (log, entry) => { log.update(entry, { outcome: 'failure' }); return failure('Synthetic save failure (starter scenario). Nothing was changed.', 'PILOT_WRITE_FAILURE'); };

  return {
    async 'invoices.update'({ state, store, log, columns, shape }) {
      const id = targetId(state);
      const entry = log.record({ kind: 'write', table: 'invoices', op: 'update', id, filters: state.filters.map((f) => `${f.op}(${f.column}=${JSON.stringify(f.value)})`), payload: state.payload, outcome: 'pending' });
      const outcome = await decide(log, entry, `invoice update ${id}`);
      if (outcome === 'failure') return settleFailure(log, entry);
      const unknown = unknownFields(state.payload, columns);
      if (unknown.length) { log.update(entry, { outcome: 'rejected-schema' }); return failure(`Could not find the '${unknown[0]}' column of 'invoices' in the schema cache`, 'PGRST204'); }
      const rows = store.invoices.filter(state.matches);
      for (const row of rows) {
        const next = { ...row, ...structuredClone(state.payload) };
        const bad = violation(next);
        if (bad) { log.update(entry, { outcome: 'rejected-constraint' }); return bad; }
      }
      for (const row of rows) Object.assign(row, structuredClone(state.payload));
      log.update(entry, { outcome: 'success', rowsChanged: rows.length });
      return shape(rows);
    },

    async 'invoices.insert'({ state, store, log, columns, shape }) {
      const payloads = Array.isArray(state.payload) ? state.payload : [state.payload];
      const entry = log.record({ kind: 'write', table: 'invoices', op: 'insert', id: null, payload: state.payload, outcome: 'pending' });
      const outcome = await decide(log, entry, 'invoice create');
      if (outcome === 'failure') return settleFailure(log, entry);
      for (const p of payloads) {
        const unknown = unknownFields(p, columns);
        if (unknown.length) { log.update(entry, { outcome: 'rejected-schema' }); return failure(`Could not find the '${unknown[0]}' column of 'invoices' in the schema cache`, 'PGRST204'); }
      }
      const created = payloads.map((p) => ({
        id: newId(), ipc_ref: null, issue_date: null, due_date: null, paid_date: null, amount: 0,
        zatca_status: 'Awaiting IPC', payment_status: 'Not Issued', element_guid: null, wir_number: null,
        created_by: userId(), created_at: now(), ...structuredClone(p),
      }));
      for (const row of created) {
        const bad = violation(row);
        if (bad) { log.update(entry, { outcome: 'rejected-constraint' }); return bad; }
      }
      store.invoices.push(...created);
      log.update(entry, { outcome: 'success', id: created.map((r) => r.id).join(',') });
      return shape(created);
    },

    async 'invoices.delete'({ state, store, log, shape }) {
      const id = targetId(state);
      const entry = log.record({ kind: 'write', table: 'invoices', op: 'delete', id, filters: state.filters.map((f) => `${f.op}(${f.column}=${JSON.stringify(f.value)})`), outcome: 'pending' });
      const outcome = await decide(log, entry, `invoice delete ${id}`);
      if (outcome === 'failure') return settleFailure(log, entry);
      const keep = store.invoices.filter((row) => !state.matches(row));
      const removed = store.invoices.length - keep.length;
      store.invoices.splice(0, store.invoices.length, ...keep);
      log.update(entry, { outcome: 'success', rowsChanged: removed });
      return shape([]);
    },
  };
}
