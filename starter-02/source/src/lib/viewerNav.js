// ============================================================
// viewerNav — pure decision helpers for the 3D viewer's keyboard/Escape
// navigation. Kept free of three.js so the behavior contract is testable:
// the viewer asks "what should this key do?" and applies the answer.
// ============================================================

/** True when the key event happened while typing — navigation must not fire. */
export function isTypingTarget(target) {
  if (!target) return false;
  const tag = (target.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!target.isContentEditable;
}

/**
 * Escape is a single, predictable "reset to the whole model" action — one press
 * does all of it (no multi-step unwind):
 *  1. drop any isolate/hide overlay,
 *  2. clear the current selection,
 *  3. fit the whole model (the SAME fit the toolbar's "Fit model" button uses).
 * Returns the three sub-actions so the viewer can apply them; `fit` is always
 * true so Esc reliably re-frames the full model whether or not anything was
 * selected or overlaid.
 */
export function escPlan({ hasOverlays, hasSelection }) {
  return {
    clearOverlays: !!hasOverlays,
    clearSelection: !!hasSelection,
    fit: true,
  };
}

// Orbit step per key press (radians) and pan/zoom factors.
export const ORBIT_STEP = Math.PI / 24;   // 7.5° per press — precise but quick
export const ZOOM_STEP = 0.88;            // dolly factor per press
export const PAN_FRACTION = 0.08;         // pan distance as a share of view depth

/**
 * Map a keydown to a navigation action:
 *  Arrows = orbit · Shift+Arrows = pan · +/- = zoom · F = fit (frame all).
 * Returns null for keys the viewer doesn't own (never swallows typing,
 * shortcuts, etc. — the caller already input-guards via isTypingTarget).
 */
export function keyAction(e) {
  const k = e.key;
  if (k === 'ArrowLeft') return e.shiftKey ? { type: 'pan', dx: 1, dy: 0 } : { type: 'orbit', az: ORBIT_STEP, pol: 0 };
  if (k === 'ArrowRight') return e.shiftKey ? { type: 'pan', dx: -1, dy: 0 } : { type: 'orbit', az: -ORBIT_STEP, pol: 0 };
  if (k === 'ArrowUp') return e.shiftKey ? { type: 'pan', dx: 0, dy: -1 } : { type: 'orbit', az: 0, pol: -ORBIT_STEP };
  if (k === 'ArrowDown') return e.shiftKey ? { type: 'pan', dx: 0, dy: 1 } : { type: 'orbit', az: 0, pol: ORBIT_STEP };
  if (k === '+' || k === '=') return { type: 'zoom', factor: ZOOM_STEP };
  if (k === '-' || k === '_') return { type: 'zoom', factor: 1 / ZOOM_STEP };
  if (k === 'f' || k === 'F') return { type: 'fit' };
  return null;
}

/** The control legend shown by the viewer's "?" — single source of truth. */
export const NAV_LEGEND = [
  ['Drag', 'Orbit around the model'],
  ['Right-drag', 'Pan'],
  ['Scroll', 'Zoom toward the cursor'],
  ['Click element', 'Select & inspect it'],
  ['Shift+Click', 'Add to multi-selection'],
  ['Esc', 'Clear selection & fit model'],
  ['Arrows', 'Orbit · Shift+Arrows pan'],
  ['+ / −', 'Zoom in / out'],
  ['F', 'Fit whole model'],
];
