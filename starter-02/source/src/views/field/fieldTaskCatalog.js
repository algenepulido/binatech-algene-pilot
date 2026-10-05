import { Box, Camera, ClipboardCheck, FileImage, FileText, ListChecks, Search } from 'lucide-react';
import { can, canView } from '../../lib/permissions.js';

export const DEFAULT_QUICK_ACTIONS = ['raise', 'progress', 'review', 'model'];

// This catalogue translates authority into reach. It never grants authority:
// every mutating task is removed unless the existing permission matrix allows
// it for the current project role.
export function fieldTaskCatalog({ t = {}, role = 'admin', onNavigate, onCapture }) {
  return [
    { key: 'raise', icon: ClipboardCheck, label: t.fmRaiseWir || 'Raise a WIR', permitted: can(role, 'wir.edit'), go: () => onNavigate?.('wirs') },
    { key: 'review', icon: ListChecks, label: t.fmReviewWirs || 'Review My WIRs', permitted: canView(role, 'wirs'), go: () => onNavigate?.('wirs') },
    { key: 'progress', icon: Camera, label: t.fmRecordProgress || 'Record Site Progress', permitted: can(role, 'wir.edit'), go: () => onCapture?.() },
    { key: 'find', icon: Search, label: t.fmFindRecord || 'Find a Record', permitted: true, go: () => onNavigate?.('scan') },
    { key: 'docs', icon: FileText, label: t.fmViewDocs || 'View Project Documents', permitted: canView(role, 'dms'), go: () => onNavigate?.('dms') },
    { key: 'drawings', icon: FileImage, label: t.fmViewDrawings || 'View Drawings', permitted: canView(role, 'drawings'), go: () => onNavigate?.('drawings') },
    { key: 'model', icon: Box, label: t.fmOpenModel || 'Open the Model', permitted: canView(role, 'model'), go: () => onNavigate?.('model') },
  ].filter((task) => task.permitted);
}

export function validQuickActionKeys(keys, catalogue) {
  const allowed = new Set(catalogue.map((task) => task.key));
  return (Array.isArray(keys) ? keys : DEFAULT_QUICK_ACTIONS)
    .filter((key, index, all) => allowed.has(key) && all.indexOf(key) === index)
    .slice(0, 4);
}
