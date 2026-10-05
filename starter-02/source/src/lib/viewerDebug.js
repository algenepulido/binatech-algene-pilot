// ============================================================
// Temporary diagnostic logger for the model-page stability incident.
// OFF by default. To capture a crash: open the browser console, run
//   window.__viewerDebug = true
// then reproduce the crash — the [viewer] log shows the last action before it
// tripped (mount/ready/select/isolate/hide/showAll/status/fullscreen/load).
// Safe to delete once the page is stable (remove this file + its imports).
// Never throws.
// ============================================================
export const vlog = (...args) => {
  try {
    if (typeof window !== 'undefined' && window.__viewerDebug) {
      // eslint-disable-next-line no-console
      console.log('[viewer]', ...args);
    }
  } catch { /* noop */ }
};
