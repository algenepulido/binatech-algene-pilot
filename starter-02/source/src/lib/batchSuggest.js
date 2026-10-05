// ============================================================
// Batch BoQ suggestions for the Elements Registry. The suggest endpoint handles
// ONE element at a time, so this is a SAFE client-side wrapper: limited
// concurrency, a per-call timeout, cooperative cancellation (a stale batch stops
// early), and never-throws result objects. It never auto-links — it only returns
// recommendations to review.
//
// Guardrails (tunable):
//   BATCH_AUTO_LIMIT  — auto-fetch up to this many selected elements on multi-select
//   BATCH_HARD_LIMIT  — refuse to run beyond this many (even manually) to avoid spam
//   CONCURRENCY       — max in-flight suggest calls at once
//   PER_CALL_TIMEOUT  — give up on a single element after this long
// ============================================================
import { suggestBoqLinks } from './boqSuggest.js';

export const BATCH_AUTO_LIMIT = 10;   // 2–10 selected → auto-suggest per element
export const BATCH_HARD_LIMIT = 10;   // >10 → do not call the Edge Function at all
const CONCURRENCY = 4;
const PER_CALL_TIMEOUT = 15000;

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

/**
 * Suggest BoQ lines for many elements with bounded concurrency + cancellation.
 * @returns Promise<Array<{ guid, element, ok, suggestions, reason }>>  (order not guaranteed)
 * opts.shouldCancel?() — checked between calls; truthy stops the run early.
 * opts.onProgress?(done,total) — progress ticks.
 * opts.signal — AbortSignal forwarded to each fetch.
 */
export async function suggestBoqLinksBatch(elements, boqLines, opts = {}) {
  const { shouldCancel, onProgress, signal } = opts;
  const results = [];
  let i = 0;
  const worker = async () => {
    while (i < elements.length) {
      if (shouldCancel && shouldCancel()) return;
      const el = elements[i++];
      let res;
      try { res = await withTimeout(suggestBoqLinks(el, boqLines, { signal }), PER_CALL_TIMEOUT); }
      catch (e) { res = { ok: false, reason: e?.message || 'failed' }; }
      if (shouldCancel && shouldCancel()) return;
      results.push({ guid: el.guid, element: el, ok: !!(res && res.ok), suggestions: (res && res.suggestions) || [], reason: res && res.reason });
      onProgress && onProgress(results.length, elements.length);
    }
  };
  const pool = Math.max(1, Math.min(CONCURRENCY, elements.length));
  await Promise.all(Array.from({ length: pool }, worker));
  return results;
}

/**
 * Group batch results for the two-level UI:
 *  - common:    BoQ lines suggested (as top match) for 2+ elements, biggest first
 *  - exceptions: elements with a low-confidence / unique / no / failed suggestion
 * `boqById` maps a BoQ line id -> the line object (for code/description/unit/rate).
 */
export function groupBatchResults(results, boqById) {
  const byLine = new Map();   // boqId -> { line, items:[{guid, element, confidence, reason}] }
  const exceptions = [];      // { guid, element, top?, reason?, failed? }
  for (const r of results) {
    const top = r.ok ? r.suggestions[0] : null;
    if (!r.ok) { exceptions.push({ guid: r.guid, element: r.element, failed: true, reason: r.reason }); continue; }
    if (!top) { exceptions.push({ guid: r.guid, element: r.element, none: true }); continue; }
    const line = boqById.get(String(top.id)) || boqById.get(top.id);
    if (!line) { exceptions.push({ guid: r.guid, element: r.element, none: true }); continue; }
    const entry = byLine.get(line.id) || { line, items: [] };
    entry.items.push({ guid: r.guid, element: r.element, confidence: top.confidence, reason: top.reason });
    byLine.set(line.id, entry);
  }
  const common = [];
  for (const entry of byLine.values()) {
    // A "common match" = the same BoQ line is the top pick for 2+ elements.
    if (entry.items.length >= 2) common.push(entry);
    else exceptions.push({ guid: entry.items[0].guid, element: entry.items[0].element, line: entry.line, confidence: entry.items[0].confidence, reason: entry.items[0].reason, single: true });
  }
  common.sort((a, b) => b.items.length - a.items.length);
  return { common, exceptions };
}
