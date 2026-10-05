// ============================================================
// NCR severity / status labels (DB stores lowercase).
// ============================================================
export const NCR_SEVERITIES = ['critical', 'major', 'minor'];
export const NCR_STATUSES = ['open', 'closed'];

export const NCR_SEVERITY_LABEL = { critical: 'Critical', major: 'Major', minor: 'Minor' };
export const NCR_STATUS_LABEL = { open: 'Open', closed: 'Closed' };

export const ncrSeverityLabel = (s) => NCR_SEVERITY_LABEL[s] ?? s;
export const ncrStatusLabel = (s) => NCR_STATUS_LABEL[s] ?? s;
