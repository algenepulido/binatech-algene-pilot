// ============================================================
// workItemsContent — copy + structure for the Work Items first-run / empty
// state. Pure data (no JSX/imports) so the operational guarantees are
// unit-testable and the EN copy lives in one place. Work Items IS the no-BIM
// path, so the framing positions a model as optional, never required, and the
// certification wording stays descriptive (this module never changes cert math).
// ============================================================

// What a work item is + why it exists. Reinforces that scope can be tracked and
// certified with NO model at all.
export const INTRO = {
  title: 'Track and certify scope without a BIM model',
  body: 'A work item is a BoQ line plus a location (zone / level / chainage). Raise WIRs against it and approved quantities certify through the same engine as model elements — so QA/QC and payment readiness work with no model attached.',
  bullets: ['Bill against a BoQ line', 'Locate by zone / level / chainage', 'Certify through WIRs — the same engine as BIM'],
};

// Create-path when the project HAS BoQ lines: bulk is the efficient default.
export const WITH_BOQ = {
  title: 'Create work items',
  body: 'Generate many at once from a BoQ line across locations, or add a single item manually.',
  primary: { label: 'Bulk from BoQ' }, // opens the bulk modal
  secondary: { label: 'New work item' }, // opens the single-item modal
};

// Create-path when there are NO BoQ lines yet: work items bill against BoQ
// lines, so the honest first step is to add them in QS. A location-only item is
// still possible (it just can't certify value until linked).
export const NO_BOQ = {
  title: 'Start with your BoQ',
  body: 'Work items bill against BoQ lines. Add or import them in QS, then bulk-generate items across locations. You can also add a location-only item now and link its BoQ line later.',
  primary: { label: 'Go to QS / BoQ', route: 'qs' },
  secondary: { label: 'New work item' }, // opens the single-item modal (location-only allowed)
};

// Downstream chain — shown as a flow strip so the user sees how a work item
// reaches a certified payment line.
export const FLOW = ['BoQ line + location', 'WIR raised', 'QC approval', 'Certified in IPC'];

// ── Test/maintenance helpers ─────────────────────────────────────────────────
export function routeKeys() {
  return [NO_BOQ.primary.route].filter(Boolean);
}
export function copyStrings() {
  const out = [];
  const walk = (v) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  [INTRO, WITH_BOQ, NO_BOQ, FLOW].forEach(walk);
  return out;
}
