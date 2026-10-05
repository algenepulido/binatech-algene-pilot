import { BOQ } from '../data/boq.js';
import { ELEMENTS } from '../data/elements.js';
import { NCRS, QC_TESTS, SNAG_ITEMS, WIRS } from '../data/quality.js';

export const BUCKET3 = {
  clear:   { color: '#16a34a', label: 'Clear to certify', labelAr: 'جاهز للاعتماد' },
  blocked: { color: '#dc2626', label: 'Blocked',          labelAr: 'محظور' },
  idle:    { color: '#a8a29e', label: 'Not started',      labelAr: 'لم يبدأ' }
};
export function elementValue(id) { const b = BOQ[id]; return b ? Math.round((b.qty || 0) * (b.rate || 0)) : 0; }
export function paymentBucket(id) {
  const el = ELEMENTS.find(e => e.id === id);
  if (!el || el.status === 'not_started') return 'idle';
  const openNcr = NCRS.some(n => n.elementId === id && n.status === 'Open');
  const blockingSnag = SNAG_ITEMS.some(s => s.elementId === id && s.blocksPayment && !['closed', 'verified'].includes(s.status));
  const qcFail = QC_TESTS.some(q => q.elementId === id && q.result !== 'Pass');
  const wirs = WIRS.filter(w => w.elementId === id).slice().sort((a, b) => a.date < b.date ? 1 : -1);
  const wirOk = wirs.length === 0 || wirs[0].result === 'Approved';
  return (el.status === 'approved' && !openNcr && !blockingSnag && !qcFail && wirOk) ? 'clear' : 'blocked';
}
export function opacityForType(type) {
  if (type === 'Wall' || type === 'Partition') return 0.20;
  if (type === 'Window') return 0.38;
  if (type === 'Slab') return 0.50;
  if (type === 'Foundation') return 0.55;
  return 0.92;
}

