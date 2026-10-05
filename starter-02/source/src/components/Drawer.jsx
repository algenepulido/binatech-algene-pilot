// ============================================================
// Drawer — the standard surface for INSPECTING a record without leaving
// the table behind it.
//
// DESKTOP: slides in from the reading end (right in LTR, left in RTL), keeps
// the list visible under a light backdrop, and keeps filters/sort/scroll alive
// — closing it puts the user exactly where they were.
//
// PHONE: a side panel on a 375px screen is just the desktop pattern shrunk —
// it leaves a useless sliver of table and puts actions out of thumb reach. So
// below the `sm` breakpoint the same drawer becomes a near-full-height sheet
// anchored to the BOTTOM: it rises from the thumb, gets a grab handle, honours
// the home-indicator safe area, and leaves a strip of the list visible at the
// top so the user can still see (and tap back to) where they came from.
//
// One component, both shapes — every drawer in the app (WIR, BoQ, NCR,
// certification, QC, snag, invoice) inherits the field layout for free.
//
// Interaction rule (docs/ux/UI-UX-OVERHAUL.md): record INSPECTION opens a
// Drawer; short/destructive confirmations stay in Modal; genuinely complex
// workflows get a full page, reachable from the drawer via onOpenFull.
// ============================================================
import { useEffect, useRef, useId } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { COL } from '../lib/theme.js';

// Dialog focus helpers, shared with Modal (the app-root confirmation uses them).
// Controls a keyboard user can reach with Tab.
export const TABBABLE = 'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"])';

// Rendered and visible: CSS visibility (inherited, so a hidden ancestor counts)
// keeps a box but cannot take focus. Geometry is only consulted where the
// document has layout (jsdom has none).
export function isShown(el) {
  const { visibility } = getComputedStyle(el);
  if (visibility === 'hidden' || visibility === 'collapse') return false;
  return document.body.getBoundingClientRect().width <= 0 || el.getClientRects().length > 0;
}

// The Sidebar's restoration test plus CSS visibility: connected, enabled, not
// inside a hidden/inert subtree, and shown.
export function isUsable(el) {
  if (!(el instanceof HTMLElement) || !el.isConnected || el === document.body) return false;
  if (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true') return false;
  if (el.closest('[inert],[hidden],[aria-hidden="true"]')) return false;
  return isShown(el);
}

// The dialog in front: the last open modal dialog in tree order (a dialog
// nested in another follows it, and the app-root confirmation follows the page
// and its drawers). Only that dialog handles Escape and Tab; a confirmation or
// preview over the drawer keeps its own keys until it closes.
export function isTopmostModal(el) {
  const open = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
  return Boolean(el) && open[open.length - 1] === el;
}

// Tab/Shift+Tab stay inside the panel: past its last usable control back to
// the first and the reverse, and from the panel itself or from nowhere (focus
// dropped to <body>) to the nearest end. The cycle's ends are controls a
// keyboard user can actually use: not disabled (a disabled fieldset included),
// not hidden/inert/aria-hidden.
export function cycleWithin(panel, e) {
  const items = [...panel.querySelectorAll(TABBABLE)].filter((el) => !el.matches(':disabled') && !el.closest('[hidden],[inert],[aria-hidden="true"]') && isShown(el));
  const first = items[0];
  const last = items[items.length - 1];
  const at = document.activeElement;
  const unplaced = at === panel || !panel.contains(at);
  const follows = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  let to = null;
  if (!first) to = panel;
  else if (e.shiftKey) { if (unplaced || !follows(first, at)) to = last; }
  else if (unplaced || !follows(at, last)) to = first;
  if (to) { e.preventDefault(); to.focus(); }
}

export function Drawer({ open, onClose, title, subtitle, children, footer, width = 560, onOpenFull, openFullLabel = 'Open full record' }) {
  const panelRef = useRef(null);
  // Width and shape are driven by CSS, not JS: an inline width would beat the
  // responsive rules, and a JS resize listener would fight the browser.
  const cls = `bt-drawer-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  // Escape closes — same keyboard contract as Modal — when the drawer is the
  // dialog in front; with a confirmation open over it, that Escape belongs to
  // the confirmation alone. The layer that acts on an Escape claims it
  // (preventDefault), and a claimed Escape is ignored: listeners of stacked
  // dialogs run in registration order, which re-renders can change, and a
  // browser may already have removed the confirmation before this listener
  // runs. A Tab pressed while no control has focus re-enters the panel instead
  // of walking the page behind it, again only while the drawer is in front.
  useEffect(() => {
    if (!open) return undefined;
    const reenter = (e) => {
      const panel = panelRef.current;
      if (e.defaultPrevented || !panel || (e.target !== document.body && e.target !== document.documentElement)) return;
      if (isTopmostModal(panel)) cycleWithin(panel, e);
    };
    const onKey = (e) => {
      if (e.key === 'Tab') reenter(e);
      else if (e.key === 'Escape' && !e.defaultPrevented && isTopmostModal(panelRef.current)) { e.preventDefault(); onClose?.(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Focus moves into the drawer when it opens so keyboard users land in it, and
  // back to the control that opened it when it closes — the row or button the
  // user was on, so the table below is resumed, not restarted. A removed or
  // hidden opener is never focused: the page's content landmark (#main-content)
  // takes focus instead, as it does when the browser declines the opener for a
  // reason not detectable up front. Focus that has already moved to another
  // surface (a confirm dialog, a navigation) is left where it is. Keyed on
  // `open` only, so a rerender while open neither steals focus nor replaces the
  // opener.
  useEffect(() => {
    if (!open) return undefined;
    const panel = panelRef.current;
    const active = document.activeElement;
    const opener = active && active !== document.body && !panel?.contains(active) ? active : null;
    panel?.focus();
    return () => {
      const now = document.activeElement;
      if (now && now !== document.body && now !== document.documentElement && !panel?.contains(now)) return;
      for (const target of [opener, document.getElementById('main-content')]) {
        if (!isUsable(target)) continue;
        target.focus({ preventScroll: true });
        if (document.activeElement === target) return;
      }
    };
  }, [open]);

  // The drawer is modal (aria-modal, and the backdrop takes the pointer), so
  // Tab and Shift+Tab cycle inside the panel instead of walking the page
  // behind it. A nested dialog (a Modal or preview opened from the drawer)
  // keeps its own Tab handling, also while focus is still beneath it.
  const onPanelKeyDown = (e) => {
    const panel = panelRef.current;
    if (e.key !== 'Tab' || e.defaultPrevented || !panel || e.target.closest?.('[role="dialog"]') !== panel) return;
    if (isTopmostModal(panel)) cycleWithin(panel, e);
  };

  if (!open) return null;

  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

  return (
    <div
      className="fixed inset-0 z-50"
      // Light, non-blurred backdrop — the table behind must stay readable.
      style={{ background: 'rgba(13,16,28,0.18)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      data-testid="drawer-backdrop"
    >
      <style>{`
        .${cls} {
          position: absolute;
          inset-inline-end: 0;
          top: 0;
          bottom: 0;
          width: min(${width}px, calc(100vw - 48px));
          display: flex;
          flex-direction: column;
          background: ${COL.surface};
          border-inline-start: 1px solid ${COL.border};
          box-shadow: ${rtl ? '24px' : '-24px'} 0 64px -24px rgba(13,16,28,0.30);
          animation: btDrawerIn 0.18s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes btDrawerIn {
          from { transform: translateX(${rtl ? '-24px' : '24px'}); opacity: 0.6; }
          to { transform: none; opacity: 1; }
        }
        /* Phone: bottom sheet, not a shrunken side panel. */
        @media (max-width: 639px) {
          .${cls} {
            inset-inline: 0;
            width: 100%;
            top: 56px;            /* leave the list visible above — context stays */
            bottom: 0;
            border-inline-start: none;
            border-top: 1px solid ${COL.border};
            border-radius: 18px 18px 0 0;
            box-shadow: 0 -18px 48px -18px rgba(13,16,28,0.35);
            animation: btSheetUp 0.2s cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          @keyframes btSheetUp {
            from { transform: translateY(28px); opacity: 0.7; }
            to { transform: none; opacity: 1; }
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .${cls} { animation: none; }
        }
      `}</style>
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={`${cls} outline-none`}
        onKeyDown={onPanelKeyDown}
      >
        {/* Grab handle — phone only. Signals "this sheet dismisses downward". */}
        <div className="sm:hidden flex justify-center pt-2 pb-0.5 shrink-0">
          <div className="w-9 h-1 rounded-full" style={{ background: COL.borderStrong }} />
        </div>

        <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-3 sm:py-4 border-b shrink-0" style={{ borderColor: COL.border }}>
          <div className="min-w-0">
            <div className="display text-[16px] sm:text-[17px] font-bold tracking-tight truncate" style={{ color: COL.text }}>{title}</div>
            {subtitle && <div className="text-xs mt-0.5 truncate" style={{ color: COL.textDim }}>{subtitle}</div>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenFull && (
              <button
                onClick={onOpenFull}
                className="h-8 sm:h-7 px-2.5 rounded-full flex items-center gap-1.5 text-[11px] font-semibold transition-colors hover:bg-stone-100"
                style={{ color: COL.textDim, background: COL.surfaceAlt, border: `1px solid ${COL.border}` }}
              >
                <ExternalLink size={11} />
                <span className="hidden sm:inline">{openFullLabel}</span>
              </button>
            )}
            {/* 40px on phones (comfortable thumb target), 28px on pointer devices. */}
            <button
              onClick={onClose}
              className="w-10 h-10 sm:w-7 sm:h-7 rounded-full flex items-center justify-center transition-colors hover:bg-stone-100"
              style={{ color: COL.textDim, background: COL.surfaceAlt }}
              aria-label="Close"
            >
              <X size={16} className="sm:hidden" />
              <X size={14} className="hidden sm:block" />
            </button>
          </div>
        </div>

        <div
          className="px-4 sm:px-5 py-4 flex-1 overflow-y-auto scrollbar"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          {children}
        </div>

        {footer && (
          <div
            className="flex items-center justify-end gap-2 px-4 sm:px-5 py-3 sm:py-3.5 border-t shrink-0"
            style={{ borderColor: COL.border, background: COL.surfaceAlt, paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
