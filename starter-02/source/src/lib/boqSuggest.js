// ============================================================
// AI-suggested BOQ links. Asks the server-side Edge Function which BOQ lines
// likely match a model element. The Anthropic key lives ONLY on the server
// (suggest-boq-links function) — never in the frontend.
//
// Suggestions are advisory: the UI shows them, the user always confirms, and
// nothing auto-links. If the key/function isn't configured this resolves to a
// clean { ok:false } so the UI can hide suggestions and log why.
// ============================================================
import { supabase } from './supabase.js';
import { functionUrl, SUPABASE_ANON_KEY } from './config.js';

/**
 * @returns { ok:true, suggestions:[{ id, confidence, reason }] }
 *        | { ok:false, reason }   // unavailable — UI hides suggestions, logs reason
 */
export async function suggestBoqLinks(element, boqLines, { signal } = {}) {
  if (!Array.isArray(boqLines) || boqLines.length === 0) return { ok: true, suggestions: [] };
  const anon = SUPABASE_ANON_KEY;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token || anon;
    // Send only what the matcher needs — id is what we link back on.
    const el = { name: element.name, ifc_type: element.type || element.ifc_type, material: element.material ?? null, level: element.level ?? null };
    const boq = boqLines.map((b) => ({ id: b.id, code: b.code ?? null, description: b.description ?? null, unit: b.unit ?? null }));
    // NOTE: send ONLY Authorization (the Bearer token authenticates at the gateway).
    // Do NOT add an `apikey` header — it would trigger a CORS preflight for a header
    // the function doesn't allow, and the browser would block the request.
    const res = await fetch(functionUrl('suggest-boq-links'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ element: el, boq }),
      signal, // optional AbortSignal — lets a stale batch cancel in-flight calls
    });
    if (!res.ok) {
      // 404 = function not deployed; 500 'ANTHROPIC_API_KEY is not set' = secret missing.
      let detail = `${res.status}`;
      try { const e = await res.json(); detail = e?.error || e?.message || detail; } catch { /* non-JSON */ }
      console.info(`BoQ suggestions unavailable: ${detail}`);
      return { ok: false, reason: detail };
    }
    const json = await res.json();
    const suggestions = Array.isArray(json.suggestions) ? json.suggestions : [];
    return { ok: true, suggestions };
  } catch (e) {
    console.info('BoQ suggestions unavailable:', e?.message ?? e);
    return { ok: false, reason: e?.message ?? String(e) };
  }
}
