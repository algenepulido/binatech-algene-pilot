// ============================================================
// Modal — dialog shell in the BIMQC style (fintech treatment: blurred
// backdrop, rounded sheet, pop-in motion). Reused by AuthModal and the
// record forms. Renders nothing when closed. API unchanged; `manageFocus`
// and `initialFocusRef` are optional and off by default.
// ============================================================
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { COL } from '../lib/theme.js';
import { TABBABLE, cycleWithin, isTopmostModal, isUsable } from './Drawer.jsx';

// Where a focus-managed Modal sends focus when the control that opened it is
// gone: the dialog still open beneath it (its container when focusable, else
// its first usable control), else the page's content landmark.
function fallbackTargets(closing) {
  const below = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].filter((d) => d !== closing).pop();
  if (!below) return [document.getElementById('main-content')];
  return [below.hasAttribute('tabindex') ? below : null, [...below.querySelectorAll(TABBABLE)].find(isUsable)];
}

export function Modal({ open, onClose, title, subtitle, children, footer, width = 480, manageFocus = false, initialFocusRef }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);

  // Escape closes the dialog (keyboard dismissal — no keyboard trap) when it is
  // the dialog in front, and claims that Escape (preventDefault) so a layer
  // beneath never acts on the same key, whatever order the listeners run in.
  // With manageFocus, a Tab from outside the dialog (focus dropped to <body>,
  // or left on a layer beneath) comes back into it.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      const dialog = dialogRef.current;
      if (e.defaultPrevented || !isTopmostModal(dialog)) return;
      if (e.key === 'Escape') { e.preventDefault(); onClose?.(); }
      else if (manageFocus && e.key === 'Tab' && !dialog.contains(e.target)) cycleWithin(dialog, e);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, manageFocus]);

  // manageFocus: focus moves in when the dialog opens — to initialFocusRef
  // when usable, else the Close control — and back to the control that opened
  // it when it closes; when that control is gone, to the dialog still open
  // beneath (e.g. the Drawer a confirmation was asked from), else the page.
  // Focus already moved to another surface is left alone. Keyed on `open`, so
  // a rerender never steals focus.
  useEffect(() => {
    if (!open || !manageFocus) return undefined;
    const dialog = dialogRef.current;
    const active = document.activeElement;
    const opener = active && active !== document.body && !dialog?.contains(active) ? active : null;
    if (!dialog?.contains(document.activeElement)) [initialFocusRef?.current, closeRef.current, dialog].find(isUsable)?.focus();
    return () => {
      const now = document.activeElement;
      if (now && now !== document.body && now !== document.documentElement && !dialog?.contains(now)) return;
      for (const target of [opener, ...fallbackTargets(dialog)]) {
        if (!isUsable(target)) continue;
        target.focus({ preventScroll: true });
        if (document.activeElement === target) return;
      }
    };
  }, [open, manageFocus]);

  // manageFocus: Tab and Shift+Tab cycle over the dialog's usable controls
  // while it is the dialog in front.
  const onDialogKeyDown = (e) => {
    const dialog = dialogRef.current;
    if (e.key !== 'Tab' || e.defaultPrevented || !dialog || e.target.closest?.('[role="dialog"]') !== dialog || !isTopmostModal(dialog)) return;
    cycleWithin(dialog, e);
  };

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(13,16,28,0.50)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        ref={dialogRef}
        role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={manageFocus ? -1 : undefined}
        onKeyDown={manageFocus ? onDialogKeyDown : undefined}
        className={`modal-pop rounded-2xl border my-8 w-full${manageFocus ? ' outline-none' : ''}`}
        style={{ maxWidth: width, background: COL.surface, borderColor: COL.border, boxShadow: '0 24px 64px -16px rgba(13,16,28,0.35), 0 4px 16px -8px rgba(13,16,28,0.2)' }}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b" style={{ borderColor: COL.border }}>
          <div>
            <div className="display text-[17px] font-bold tracking-tight" style={{ color: COL.text }}>{title}</div>
            {subtitle && <div className="text-xs mt-0.5" style={{ color: COL.textDim }}>{subtitle}</div>}
          </div>
          <button ref={closeRef} onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-stone-100" style={{ color: COL.textDim, background: COL.surfaceAlt }} aria-label="Close">
            <X size={14} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t rounded-b-2xl" style={{ borderColor: COL.border, background: COL.surfaceAlt }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
