// ============================================================
// actionSafety — shared, non-negotiable copy + a tiny classifier for dangerous
// signed-in actions. FRONTEND UX SAFETY ONLY. None of this enforces anything —
// the real boundary is server-side (RLS + role-gated backend). It exists so
// value-moving / destructive / certification-affecting actions never read as
// casual, and so backend-required actions are labelled consistently.
// ============================================================

// Required copy (asserted by tests — keep byte-exact).
export const SAFETY_COPY = {
  backendRequired: 'Backend enforcement required before this action can be production-authoritative.',
  certPaymentGated: 'This action affects certification/payment state and requires role-gated backend enforcement.',
  draftOnly: 'Draft only. No certification or payment change will be made.',
};

// Action classes (spec §classify). Purely descriptive — drives UX treatment.
export const ACTION_CLASS = {
  view: 'View',                     // read-only
  draft: 'Draft',                   // creates a draft, no state change
  request: 'Request',              // asks someone else to act
  edit: 'Edit',                     // ordinary create/edit
  protected: 'Protected',           // needs a confirmation step
  dangerous: 'Dangerous',           // destructive / value-moving; needs reason + red treatment
  backend: 'Backend-required',      // must be disabled/labelled until server enforcement exists
};

/** Confirm-dialog options for a certification/payment-affecting transition.
 *  Callers `await confirmDialog(certActionConfirm({...}))`. */
export function certActionConfirm({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return {
    title,
    message: `${message}\n\n${SAFETY_COPY.certPaymentGated}`,
    confirmLabel,
    danger,
  };
}
