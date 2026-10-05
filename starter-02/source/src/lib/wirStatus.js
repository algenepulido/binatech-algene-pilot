// ============================================================
// WIR result <-> display label mapping.
// DB stores lowercase enum values; the BIMQC StatusPill keys off the
// capitalized labels ('Approved', 'In Progress', ...). Keep them in sync here.
// ============================================================
export const WIR_RESULTS = ['pending', 'in_progress', 'approved', 'rejected'];

export const RESULT_LABEL = {
  pending: 'Pending',
  in_progress: 'In Progress',
  approved: 'Approved',
  rejected: 'Rejected',
};

/** Display label for a stored result value (falls back to the raw value). */
export const resultLabel = (r) => RESULT_LABEL[r] ?? r;
