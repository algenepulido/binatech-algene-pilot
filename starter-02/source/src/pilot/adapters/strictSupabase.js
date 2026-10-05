// ============================================================
// PILOT STARTER ONLY — not BinaTech application code.
//
// A strict, synthetic, in-memory stand-in for the Supabase client. It is what
// src/lib/supabase.js exports in this starter, so the real screens run without
// any real backend, key or network.
//
// Rules this module enforces:
//   - Only operations listed in the table policy (./policy.js) are supported:
//     table, operation, filter operators and columns.
//   - Anything else REJECTS with StarterUnsupportedOperation and is written to
//     the call log as "unsupported". It never falls through to a real SDK and
//     never turns an unknown read into [].
//   - Auth is a synthetic test session (labelled as such). Storage, Edge
//     Functions, RPC and realtime are not supported and reject.
//   - Writes only ever change the in-memory fixtures, and only through the
//     controllers in ./controllers.js, which decide success / failure / hold.
//
// Faithfulness: query results use the same { data, error, count, status }
// shape as supabase-js, so application code (and its error handling) runs
// unchanged. This module does NOT implement retry, pending-click protection,
// stale-result guards or edit-state handling for the application.
// ============================================================

export class StarterUnsupportedOperation extends Error {
  constructor(description) {
    super(`PILOT STARTER: unsupported operation blocked — ${description}. ` +
      'The starter only supports the operations listed in src/pilot/adapters/policy.js; nothing is sent anywhere.');
    this.name = 'StarterUnsupportedOperation';
    this.code = 'PILOT_UNSUPPORTED';
  }
}

const FILTERS = {
  eq: (v, x) => v === x,
  neq: (v, x) => v !== x,
  gt: (v, x) => v != null && v > x,
  gte: (v, x) => v != null && v >= x,
  lt: (v, x) => v != null && v < x,
  lte: (v, x) => v != null && v <= x,
  in: (v, xs) => Array.isArray(xs) && xs.includes(v),
  is: (v, x) => (x === null ? v == null : v === x),
};
const MODIFIERS = new Set(['order', 'limit', 'range', 'single', 'maybeSingle']);
const WRITE_OPS = new Set(['insert', 'update', 'upsert', 'delete']);

function parseColumns(columns) {
  const text = String(columns ?? '*').replace(/\s+/g, '');
  if (text === '*' || text === '') return { all: true, list: [] };
  if (/[()!:]/.test(text)) return { embedded: true, text };
  return { all: false, list: text.split(',').filter(Boolean) };
}

function compareValues(a, b) {
  return a > b ? 1 : a < b ? -1 : 0;
}

/**
 * @param {object} deps
 * @param {object} deps.store       in-memory tables: { tableName: rows[] } (mutated only by controllers)
 * @param {object} deps.policy      table policy (./policy.js)
 * @param {object} deps.controllers write controllers keyed "table.op" (./controllers.js)
 * @param {object} deps.log         call log (./callLog.js)
 * @param {object} deps.auth        synthetic auth (./syntheticAuth.js)
 * @param {Function} [deps.readScenario] (table) => 'normal' | 'error' | 'hold' — evaluator read scenario
 */
export function createStrictClient({ store, policy, controllers, log, auth, readScenario = () => 'normal' }) {
  const unsupported = (description, detail = {}) => {
    const error = new StarterUnsupportedOperation(description);
    log.record({ kind: 'unsupported', description, ...detail });
    return error;
  };
  const rejectLater = (error) => ({
    then(resolve, reject) { return Promise.reject(error).then(resolve, reject); },
    catch(reject) { return Promise.reject(error).catch(reject); },
  });

  function from(table) {
    const tablePolicy = policy.tables[table];
    if (!tablePolicy) {
      const error = unsupported(`from('${table}') — table not in the starter policy`, { table });
      return chainThatRejects(error);
    }
    const state = { table, op: null, columns: null, countMode: null, head: false, filters: [], order: [], limit: null, range: null, single: false, maybeSingle: false, payload: null, selectAfterWrite: false, problem: null };
    const fail = (description) => { if (!state.problem) state.problem = description; };

    const builder = {
      select(columns = '*', options = {}) {
        if (state.op && WRITE_OPS.has(state.op)) { state.selectAfterWrite = true; state.columns = parseColumns(columns); return proxy; }
        if (state.op) fail(`second select() on ${table}`);
        state.op = 'select'; state.columns = parseColumns(columns);
        if (options.count) state.countMode = options.count;
        if (options.head) state.head = true;
        return proxy;
      },
      insert(payload) { if (state.op) fail(`insert() after ${state.op}`); state.op = 'insert'; state.payload = payload; return proxy; },
      update(payload) { if (state.op) fail(`update() after ${state.op}`); state.op = 'update'; state.payload = payload; return proxy; },
      upsert(payload) { if (state.op) fail(`upsert() after ${state.op}`); state.op = 'upsert'; state.payload = payload; return proxy; },
      delete() { if (state.op) fail(`delete() after ${state.op}`); state.op = 'delete'; return proxy; },
      order(column, options = {}) {
        const ascending = options.ascending !== false;
        // PostgreSQL default: ASC → NULLS LAST, DESC → NULLS FIRST, unless nullsFirst is given.
        const nullsFirst = typeof options.nullsFirst === 'boolean' ? options.nullsFirst : !ascending;
        state.order.push({ column, ascending, nullsFirst });
        return proxy;
      },
      limit(n) { state.limit = n; return proxy; },
      range(a, b) { state.range = [a, b]; return proxy; },
      single() { state.single = true; return proxy; },
      maybeSingle() { state.maybeSingle = true; return proxy; },
      then(resolve, reject) { return execute().then(resolve, reject); },
      catch(reject) { return execute().catch(reject); },
      finally(fn) { return execute().finally(fn); },
    };
    for (const name of Object.keys(FILTERS)) {
      builder[name] = (column, value) => { state.filters.push({ op: name, column, value }); return proxy; };
    }
    const proxy = new Proxy(builder, {
      get(target, key) {
        if (key in target) return target[key];
        if (typeof key === 'symbol') return undefined;
        // Any other query-builder method (or, not, ilike, textSearch, csv, abortSignal …) is unsupported.
        return () => { fail(`.${String(key)}() on ${table}`); return proxy; };
      },
    });

    let executed = null;
    function execute() {
      if (!executed) executed = run();
      return executed;
    }

    async function run() {
      const op = state.op || 'select';
      const detail = { table, op, filters: state.filters.map((f) => `${f.op}(${f.column})`), columns: describeColumns(state.columns) };
      if (state.problem) throw unsupported(state.problem, detail);
      if (tablePolicy.absent) {
        // Not supported by this isolated starter: simulated unavailable-table response (PostgREST code 42P01).
        log.record({ kind: op === 'select' ? 'read' : 'write', ...detail, outcome: 'absent-table' });
        return { data: null, error: { message: `relation "public.${table}" does not exist`, code: '42P01', details: null, hint: null }, count: null, status: 404, statusText: 'Not Found' };
      }
      const opPolicy = tablePolicy[op];
      if (!opPolicy) throw unsupported(`${op} on '${table}' is not supported by the starter`, detail);

      for (const f of state.filters) {
        if (!(opPolicy.filters || []).includes(f.op)) throw unsupported(`${f.op}('${f.column}') on ${table}.${op} is not in the policy`, detail);
        if (!tablePolicy.columns.includes(f.column)) throw unsupported(`filter on unknown ${table} field '${f.column}'`, detail);
      }
      for (const o of state.order) {
        if (!opPolicy.modifiers?.includes('order')) throw unsupported(`order() on ${table}.${op} is not in the policy`, detail);
        if (!tablePolicy.columns.includes(o.column)) throw unsupported(`order by unknown ${table} field '${o.column}'`, detail);
      }
      for (const [flag, name] of [[state.limit != null, 'limit'], [state.range != null, 'range'], [state.single, 'single'], [state.maybeSingle, 'maybeSingle']]) {
        if (flag && !opPolicy.modifiers?.includes(name)) throw unsupported(`${name}() on ${table}.${op} is not in the policy`, detail);
      }
      if (state.countMode && !opPolicy.count) throw unsupported(`count on ${table}.${op} is not in the policy`, detail);
      if (opPolicy.headOnly && !(state.head && state.countMode)) throw unsupported(`${table} is count-only in the starter (no rows are served)`, detail);
      if (state.columns?.embedded) {
        if (!(opPolicy.embedded || []).includes(state.columns.text)) throw unsupported(`embedded select '${state.columns.text}' on ${table}`, detail);
      } else if (state.columns && !state.columns.all) {
        const unknown = state.columns.list.filter((c) => !tablePolicy.columns.includes(c));
        if (unknown.length) throw unsupported(`select of unknown ${table} field(s) ${unknown.join(', ')}`, detail);
      }

      if (op === 'select') {
        let scenario = readScenario(table, state);
        const entry = log.record({ kind: 'read', ...detail, head: state.head, scenario });
        if (scenario === 'hold') {
          scenario = await log.hold(`read ${table}`, { outcomes: ['answer', 'fail'] }) === 'fail' ? 'error' : 'normal';
          log.update(entry, { scenario: `held → ${scenario}` });
        }
        if (scenario === 'error') return { data: null, error: { message: `Synthetic read failure for ${table} (starter scenario)`, code: 'PILOT_READ_FAILURE', details: null, hint: null }, count: null, status: 500, statusText: 'Synthetic failure' };
        return shapeRead(select(store[table] || []));
      }

      const controller = controllers[`${table}.${op}`];
      if (!controller) throw unsupported(`${op} on '${table}' has no starter controller`, detail);
      return controller({ state: snapshot(), store, log, columns: tablePolicy.columns, shape: (rows) => shapeWrite(rows) });
    }

    function select(rows) {
      let out = rows.filter((row) => state.filters.every((f) => FILTERS[f.op](row[f.column], f.value)));
      if (state.order.length) {
        out = [...out].sort((a, b) => {
          for (const o of state.order) {
            const x = a[o.column]; const y = b[o.column];
            if (x == null && y == null) continue;
            if (x == null) return o.nullsFirst ? -1 : 1;
            if (y == null) return o.nullsFirst ? 1 : -1;
            const c = compareValues(x, y);
            if (c) return o.ascending ? c : -c;
          }
          return 0;
        });
      }
      return out;
    }
    function shapeRows(rows) {
      let out = rows;
      if (state.range) out = out.slice(state.range[0], state.range[1] + 1);
      if (state.limit != null) out = out.slice(0, state.limit);
      return out.map((row) => projectRow(row));
    }
    function projectRow(row) {
      const copy = structuredClone(row);
      if (!state.columns || state.columns.all || state.columns.embedded) return copy;
      return Object.fromEntries(state.columns.list.map((c) => [c, copy[c] ?? null]));
    }
    function shapeRead(rows) {
      const count = rows.length;
      if (state.head) return { data: null, error: null, count: state.countMode ? count : null, status: 200, statusText: 'OK' };
      const shaped = shapeRows(rows);
      if (state.single) {
        return shaped.length === 1
          ? { data: shaped[0], error: null, count: null, status: 200, statusText: 'OK' }
          : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116', details: `The result contains ${shaped.length} rows`, hint: null }, count: null, status: 406, statusText: 'Not Acceptable' };
      }
      if (state.maybeSingle) {
        return shaped.length <= 1
          ? { data: shaped[0] ?? null, error: null, count: null, status: 200, statusText: 'OK' }
          : { data: null, error: { message: 'JSON object requested, multiple rows returned', code: 'PGRST116', details: null, hint: null }, count: null, status: 406, statusText: 'Not Acceptable' };
      }
      return { data: shaped, error: null, count: state.countMode ? count : null, status: 200, statusText: 'OK' };
    }
    function shapeWrite(rows) {
      if (!state.selectAfterWrite) return { data: null, error: null, count: null, status: 204, statusText: 'No Content' };
      return shapeRead(rows);
    }
    function snapshot() {
      return {
        table, op: state.op, payload: structuredClone(state.payload), filters: state.filters.map((f) => ({ ...f })),
        selectAfterWrite: state.selectAfterWrite, single: state.single, maybeSingle: state.maybeSingle,
        matches: (row) => state.filters.every((f) => FILTERS[f.op](row[f.column], f.value)),
      };
    }
    return proxy;
  }

  function chainThatRejects(error) {
    const chain = new Proxy({}, {
      get(_t, key) {
        if (key === 'then') return (resolve, reject) => Promise.reject(error).then(resolve, reject);
        if (key === 'catch') return (reject) => Promise.reject(error).catch(reject);
        if (key === 'finally') return (fn) => Promise.reject(error).finally(fn);
        if (typeof key === 'symbol') return undefined;
        return () => chain;
      },
    });
    return chain;
  }

  const service = (name) => new Proxy({}, {
    get(_t, key) {
      if (typeof key === 'symbol' || key === 'then') return undefined;
      return (...args) => {
        const label = `${name}.${String(key)}${name === 'storage' && key === 'from' ? `('${args[0]}')` : ''}`;
        const error = unsupported(`${label} — ${name} is not available in the starter`, { service: name, method: String(key) });
        if (name === 'storage' && key === 'from') return service(`storage('${args[0]}')`);
        return rejectLater(error);
      };
    },
  });

  const client = {
    from,
    auth,
    storage: service('storage'),
    functions: service('functions'),
    rpc: (fn) => rejectLater(unsupported(`rpc('${fn}')`, { service: 'rpc', method: fn })),
    channel: (name) => { throw unsupported(`channel('${name}') — realtime is not available in the starter`, { service: 'realtime' }); },
    removeChannel: () => { throw unsupported('removeChannel — realtime is not available in the starter', { service: 'realtime' }); },
    removeAllChannels: () => { throw unsupported('removeAllChannels — realtime is not available in the starter', { service: 'realtime' }); },
  };
  return new Proxy(client, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key === 'symbol' || key === 'then' || key === 'toJSON') return undefined;
      throw unsupported(`supabase.${String(key)} — not part of the starter client`, { service: 'client' });
    },
  });
}

function describeColumns(columns) {
  if (!columns) return '*';
  if (columns.all) return '*';
  if (columns.embedded) return columns.text;
  return columns.list.join(',');
}
