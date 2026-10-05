// ============================================================
// PILOT STARTER ONLY — inspectable call log and manual "hold" registry.
//
// Every adapter decision is recorded here: reads, writes (with their target
// id and payload), simulated submissions, blocked network attempts and
// unsupported operations. The evaluator panel and the starter tests read it.
// Held operations stay pending until an evaluator releases them.
// ============================================================

export function createCallLog() {
  const entries = [];
  const held = [];
  const listeners = new Set();
  let seq = 0;
  let holdSeq = 0;
  const notify = () => { for (const l of listeners) { try { l(); } catch { /* panel errors never affect the app */ } } };

  return {
    record(entry) {
      const item = { seq: ++seq, at: new Date().toISOString(), ...entry };
      entries.push(item);
      notify();
      return item;
    },
    /** Record the later outcome of an entry (e.g. a held write that was released). */
    update(entry, patch) {
      Object.assign(entry, patch);
      notify();
      return entry;
    },
    entries: () => entries.slice(),
    ofKind: (kind) => entries.filter((e) => e.kind === kind),
    clear() { entries.length = 0; notify(); },
    /** Returns a promise that settles only when an evaluator releases it (in arrival order by default). */
    hold(label, meta = {}) {
      return new Promise((resolve, reject) => {
        held.push({ id: ++holdSeq, label, meta, resolve, reject });
        notify();
      });
    },
    held: () => held.map(({ id, label, meta }) => ({ id, label, meta })),
    /** Settle a held operation: outcome is passed to whoever is waiting (controllers interpret it). */
    release(id, outcome) {
      const index = id == null ? 0 : held.findIndex((h) => h.id === id);
      if (index < 0 || index >= held.length) return false;
      const [h] = held.splice(index, 1);
      h.resolve(outcome);
      notify();
      return true;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
