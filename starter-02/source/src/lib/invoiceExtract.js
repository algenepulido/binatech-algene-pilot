// ============================================================
// invoiceExtract — uploads a scanned/photographed invoice (PDF or image) to the
// server-side `extract-invoice` Edge Function, which reads it with Anthropic and
// returns structured fields to PRE-FILL the New Invoice form (human confirms).
// The API key NEVER touches the browser (it's a Supabase secret server-side).
// ============================================================
import { supabase } from './supabase.js';
import { functionUrl } from './config.js';

export const ACCEPT_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
export const MAX_BYTES = 12 * 1024 * 1024; // 12 MB

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || ''); // strip the "data:...;base64," prefix
    r.onerror = () => reject(new Error('Could not read the file'));
    r.readAsDataURL(file);
  });
}

/** Send the file to the Edge Function and get back extracted invoice fields. */
export async function extractInvoice(file) {
  if (!file) throw new Error('No file');
  if (file.size > MAX_BYTES) throw new Error('File is too large (max 12 MB).');
  const fileBase64 = await fileToBase64(file);
  const { data } = await supabase.auth.getSession();
  const NOT_DEPLOYED = 'AI extraction service isn’t reachable yet — the extract-invoice Edge Function needs to be deployed (supabase functions deploy extract-invoice). You can still fill the invoice in manually.';
  let res;
  try {
    res = await fetch(functionUrl('extract-invoice'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data?.session?.access_token || ''}` },
      body: JSON.stringify({ fileBase64, mediaType: file.type || 'application/octet-stream', fileName: file.name }),
    });
  } catch {
    // fetch throws "Failed to fetch" on a network/CORS error — typically the
    // function isn't deployed (a 404 from the gateway carries no CORS headers).
    throw new Error(NOT_DEPLOYED);
  }
  if (res.status === 404) throw new Error(NOT_DEPLOYED);
  if (!res.ok) throw new Error(`Extraction service error (${res.status}). Try again, or fill the invoice manually.`);
  const json = await res.json();
  if (json.notConfigured) { const e = new Error('AI extraction isn’t configured on the server yet — fill the fields manually.'); e.notConfigured = true; throw e; }
  if (json.error) throw new Error(json.error);
  return json.fields || {};
}
