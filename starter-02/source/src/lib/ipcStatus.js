// ============================================================
// IPC status labels + financial computation.
// DB stores lowercase status; StatusPill keys off capitalized labels.
// Financials follow the project rules: 10% retention, 15% VAT.
// ============================================================
export const IPC_STATUSES = ['draft', 'submitted', 'certified', 'paid', 'rejected'];

export const IPC_STATUS_LABEL = {
  draft: 'Draft',
  submitted: 'Under Review',
  certified: 'Certified',
  paid: 'Paid',
  rejected: 'Rejected',
};

export const ipcStatusLabel = (s) => IPC_STATUS_LABEL[s] ?? s;

/** Derive retention / VAT / net payable from a gross value. */
export function computeIpc(gross, retentionRate = 0.1, vatRate = 0.15) {
  const g = Number(gross) || 0;
  const retention = Math.round(g * retentionRate * 100) / 100;
  const vat = Math.round((g - retention) * vatRate * 100) / 100;
  const net = Math.round((g - retention + vat) * 100) / 100;
  return { retention, vat, net };
}
