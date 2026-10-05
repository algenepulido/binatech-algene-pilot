// ============================================================
// BottomSheet — a thumb-friendly bottom-anchored sheet for mobile: filters,
// "More" actions, pickers. Slides up from the bottom, dim backdrop, drag handle,
// safe-area padding. Tap the backdrop or the close to dismiss.
// ============================================================
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { COL } from '../lib/theme.js';

export function BottomSheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="absolute inset-0" style={{ background: 'rgba(24,24,27,0.45)' }} />
      <div role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Options'} className="relative rounded-t-2xl border-t shadow-2xl sheet-up" style={{ background: COL.surface, borderColor: COL.border, maxHeight: '82vh', paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}>
        <div className="flex justify-center pt-2.5"><div className="w-9 h-1 rounded-full" style={{ background: COL.borderStrong }} /></div>
        {title && (
          <div className="flex items-center justify-between px-5 pt-2 pb-1">
            <span className="text-[15px] font-semibold" style={{ color: COL.text }}>{title}</span>
            <button onClick={onClose} className="w-9 h-9 -me-2 flex items-center justify-center rounded-lg" style={{ color: COL.textDim }} aria-label="Close"><X size={18} /></button>
          </div>
        )}
        <div className="px-3 pb-1 overflow-y-auto scrollbar" style={{ maxHeight: '70vh' }}>{children}</div>
      </div>
    </div>
  );
}

// A full-width, 48px-tall row for sheet menus (icon + label, optional danger).
export function SheetItem({ icon: Icon, label, onClick, danger }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-3 rounded-xl active:bg-stone-100" style={{ minHeight: 48, color: danger ? '#b91c1c' : COL.text }}>
      {Icon && <Icon size={18} style={{ color: danger ? '#b91c1c' : COL.accent }} />}
      <span className="text-[15px] font-medium">{label}</span>
    </button>
  );
}
