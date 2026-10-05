// ============================================================
// Snag priority/status option lists for forms (keys match the
// SNAG_PRIORITY / SNAG_STATUS label maps in data/quality.js, which the
// views already use for colors/labels).
// ============================================================
import { SNAG_PRIORITY, SNAG_STATUS } from '../data/quality.js';

export const SNAG_PRIORITIES = Object.keys(SNAG_PRIORITY); // critical, major, minor, observation
export const SNAG_STATUSES = Object.keys(SNAG_STATUS);     // open, assigned, inProgress, ...

export const SNAG_CATEGORIES = ['defect', 'finish issue', 'incomplete', 'safety', 'testing', 'MEP'];
