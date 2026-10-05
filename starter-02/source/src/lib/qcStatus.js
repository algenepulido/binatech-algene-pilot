// ============================================================
// QC test result labels (DB stores lowercase).
// ============================================================
export const QC_RESULTS = ['pass', 'fail', 'pending'];
export const QC_RESULT_LABEL = { pass: 'Pass', fail: 'Fail', pending: 'Pending' };
export const qcResultLabel = (r) => QC_RESULT_LABEL[r] ?? r;
