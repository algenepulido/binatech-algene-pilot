// ============================================================
// ipcDisplay — pure, DISPLAY-ONLY helpers for the IPC register.
// These are visible trust-hygiene helpers: they NEVER change stored values,
// certification math, retention/VAT, or any money logic — they only decide
// how existing IPC fields are SHOWN.
//
//  - paidDateForDisplay: a Paid Date is shown only on a certified/paid IPC and
//    never before its Cert Date. An Under-Review IPC, or a paid-before-certified
//    row, must not display a paid date (mixing those states blurs the money
//    chain: a Certified IPC can be certified-but-unpaid).
//  - normalizeIpcNumber / normalizeIpcPeriod: consistent casing in display only.
// ============================================================

// Statuses for which a Paid Date may be shown. A Paid Date is only meaningful
// once the certificate is certified or paid — never while it is under review.
const PAID_DATE_STATUSES = new Set(['certified', 'paid']);

// Returns the paid date string to render, or null to render a placeholder.
// Show paid_date ONLY when (a) it exists, (b) the IPC status is certified/paid,
// and (c) it is not before the cert date (paid-before-certified is invalid).
// Date strings are ISO (YYYY-MM-DD), so a lexical compare is chronological.
export function paidDateForDisplay(ipc) {
  if (!ipc || !ipc.paid_date) return null;
  if (!PAID_DATE_STATUSES.has(ipc.status)) return null;
  if (ipc.cert_date && ipc.paid_date < ipc.cert_date) return null;
  return ipc.paid_date;
}

// Display-only: uppercase the IPC number so "ipc-002" and "IPC-001" read
// consistently. Does NOT change the stored value.
export function normalizeIpcNumber(n) {
  return n == null ? '' : String(n).toUpperCase();
}

// Display-only: title-case the period so "april 2026" and "May 2026" read
// consistently ("April 2026" / "May 2026"). Does NOT change the stored value.
// No-op for scripts without letter case (e.g. Arabic).
export function normalizeIpcPeriod(p) {
  if (p == null) return '';
  return String(p).replace(/\b\w/g, (c) => c.toUpperCase());
}
