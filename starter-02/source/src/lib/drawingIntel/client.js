// ============================================================
// doc-intel client — invokes the `doc-intel` Edge Function and returns an
// HONEST state machine result. The provider key lives ONLY server-side; the
// response is contract-validated before anything renders. Every failure mode
// is explicit:
//   { state:'ok', extraction }            — validated live extraction
//   { state:'not_configured' }            — function not deployed / key missing
//   { state:'unavailable', tag }          — network / upstream / auth failure
//   { state:'invalid', problems }         — AI answered, contract rejected it
// Nothing here ever substitutes fixture data for a live result — the demo
// path is a separate, badged code path in the view.
// ============================================================
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { classifyAssistantResult, assistantDiagTag, ASSISTANT_STATE } from '../assistantError.js';
import { buildExtractionRequest, validateExtraction } from './contract.js';

export async function runExtraction(args) {
  if (!isSupabaseConfigured) return { state: 'not_configured' };
  let res;
  try {
    res = await supabase.functions.invoke('doc-intel', { body: buildExtractionRequest(args) });
  } catch (e) {
    return { state: 'unavailable', tag: assistantDiagTag(e) };
  }
  const cls = classifyAssistantResult(res);
  if (cls === ASSISTANT_STATE.NOT_CONFIGURED) return { state: 'not_configured' };
  if (cls === ASSISTANT_STATE.UNAVAILABLE) return { state: 'unavailable', tag: assistantDiagTag(res.error) };
  const { ok, extraction, problems } = validateExtraction(res.data?.extraction);
  if (!ok) return { state: 'invalid', problems };
  return { state: 'ok', extraction };
}
