// ============================================================
// noModelContent — the copy + structure for the "no IFC model yet" workspace,
// shared by the Model page (NoModelYet) and the Elements Registry empty state.
// Kept as pure data (no JSX, no imports) so the operational guarantees — a
// no-model path, an upload path, and a "what this unlocks" explanation — are
// unit-testable and the EN copy lives in ONE place. A model is always optional;
// nothing here may imply it is required.
// ============================================================

// The downstream chain a model feeds. Shown as a left-to-right flow strip on
// both pages so the user sees WHY the model matters without it feeling required.
export const FLOW_STEPS = ['IFC import', 'Elements Registry', 'BoQ links', 'WIR / QC traceability'];

// ── Model page (the signed-in Model route, project has no model yet) ─────────
export const MODEL_PAGE = {
  subtitle:
    'Attach an IFC model for 3D review and element-linked quantity support — or continue without one. The certification workflow runs fully either way.',
  // Left path — co-equal, never apologetic. BIM is optional by product design.
  noModel: {
    header: 'Continue without a model',
    description:
      'Work Items, WIRs, approvals, IPCs and invoice readiness all run on a BoQ line plus a location. A model is an accelerator you can add at any time.',
    bullets: ['Track scope by location', 'Link WIRs, QC and documents', 'Certify and bill work normally'],
    ctaLabel: 'Go to Work Items',
    ctaRoute: 'workitems',
  },
  // Right path — valuable, not required.
  upload: {
    header: 'Add the BIM model',
    description:
      'View work in 3D, attach elements to BoQ lines where valid, and speed up traceability across the project.',
  },
  // Richer empty-state status block (label → value rows).
  status: {
    title: 'Model status',
    fields: [
      ['Current model', 'None uploaded'],
      ['Supported format', '.ifc'],
      ['Sample data in use', 'No'],
      ['Unlocked after upload', '3D viewer · element registry · model-assisted linking'],
    ],
  },
  unlocks: ['Elements Registry', 'Work Items', 'WIR / QC', 'BoQ linking where valid'],
};

// ── Elements Registry page (no model imported for the project yet) ───────────
export const REGISTRY_PAGE = {
  subtitle:
    'Review imported model elements, see what they are linked to, and trace how model data supports site and commercial workflows.',
  status: {
    title: 'No IFC model imported yet',
    line: 'Once imported, elements appear here with type, level, quantity, BoQ links and QC linkage — one auditable record per element.',
    fields: [
      ['Supported format', '.ifc'],
      ['Sample data in use', 'No'],
    ],
  },
  // Next actions — one dominant upload, one calm no-BIM path.
  actions: {
    primary: { label: 'Upload IFC model' }, // handled by the ModelUpload panel
    secondary: { label: 'Continue without BIM', route: 'workitems' },
  },
  upload: {
    header: 'Add the BIM model',
    description: 'Import an IFC and its elements become traceable records here, ready to link to BoQ lines and QC activity.',
  },
  unlocks: ['Elements Registry', 'Type & level filtering', 'Quantity reference', 'BoQ linking where valid', 'WIR / QC traceability'],
};

// ── Test/maintenance helpers (used by noModelContent.test.js) ────────────────

// Every route key wired to a CTA across both pages.
export function collectRouteKeys() {
  return [MODEL_PAGE.noModel.ctaRoute, REGISTRY_PAGE.actions.secondary.route].filter(Boolean);
}

// Every human-readable string, flattened — so copy rules (no hedging/filler)
// can be asserted in one sweep.
export function collectCopyStrings() {
  const out = [];
  const walk = (v) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(MODEL_PAGE);
  walk(REGISTRY_PAGE);
  walk(FLOW_STEPS);
  return out;
}
