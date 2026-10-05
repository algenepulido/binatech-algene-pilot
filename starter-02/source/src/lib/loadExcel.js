// ============================================================
// loadExcelJS — resilient dynamic loader for the heavy ExcelJS library.
//
// ExcelJS (~270 KB gzip) is code-split into its own chunk so it never weighs on
// first paint; it's only fetched when the user actually exports. The failure
// mode we hit in production: after a redeploy the hashed chunk filename changes,
// so a tab opened against the OLD index requests an exceljs chunk that no longer
// exists → "Failed to fetch dynamically imported module".
//
// This loader:
//  • imports the chunk ONCE and caches it (the old code imported it twice),
//  • retries once for a transient network blip,
//  • on persistent failure throws a tagged error (code 'EXCEL_LOAD_FAILED') so
//    callers can show a friendly "couldn't load — retry / reload" message
//    instead of a raw module-fetch error. A stale-chunk failure is cured by a
//    page reload (the fresh index points at the new chunk) — see the global
//    `vite:preloadError` handler in App.jsx.
// ============================================================
let cached = null;

export async function loadExcelJS() {
  if (cached) return cached;
  const importOnce = async () => {
    const mod = await import('exceljs');
    return mod?.default || mod;
  };
  try {
    cached = await importOnce();
    return cached;
  } catch {
    // one retry — covers a transient network hiccup
    try {
      cached = await importOnce();
      return cached;
    } catch (e) {
      const err = new Error('EXCEL_LOAD_FAILED');
      err.code = 'EXCEL_LOAD_FAILED';
      err.cause = e;
      throw err;
    }
  }
}

// True when an error is the export library failing to load (vs a genuine
// export/data error) — lets callers offer the right remedy (reload).
export function isExcelLoadError(e) {
  return e?.code === 'EXCEL_LOAD_FAILED' || /failed to fetch dynamically imported module/i.test(e?.message || '');
}
