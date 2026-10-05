// ============================================================
// Certification Ledger token migration — regression guard for the proof
// screen group (Control Room). Asserts the migrated files stay on var(--sc-*)
// tokens and that any remaining hex literal is on the DELIBERATE allowlist
// below (values with no matching token yet — extend the token set before
// using them again; see docs/certification-ledger-adoption-report.md).
// ============================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SC } from '../../styles/ledgerTokens.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const hexes = (src) => [...new Set((src.match(/#[0-9a-fA-F]{6}\b/g) || []).map((h) => h.toLowerCase()))];

// Values deliberately KEPT as literals — no matching --sc-* token. Do not grow
// these lists silently: either map to an existing token or extend the token
// set in certification-ledger.css first.
const VIEW_ALLOWED = [
  '#15803d', // legacy "ready/certifiable" green — pending owner ruling: mockup renders Ready as muted Steel, and the green rule reserves green for CERTIFIED/PAID
  '#dcfce7', // legacy green tint (approved-WIR pill bg) — same ruling
  '#7c3aed', // purple (missing-evidence KPI) — no purple token
  '#0d9488', // teal (recoverable-next-IPC KPI) — no teal token
  '#fde68a', // amber border on warning banners — no --sc-warning-bd token yet
];
const LIB_ALLOWED = [
  '#15803d', '#dcfce7', // READINESS ready / RECOVERY next_ipc greens — same owner ruling
  '#7c3aed', '#ede9fe', // review purple — no token
  '#115e59', '#ccfbf1', // measurement-review teal — no token
  '#0d9488',            // recoverable-this-week teal — no token
];

describe('Certification Ledger migration (Control Room proof group)', () => {
  const view = read('./CertificationControlRoomView.jsx');
  const lib = read('../../lib/controlRoom.js');

  it('view consumes SC tokens, not the legacy COL palette', () => {
    expect(view).not.toMatch(/from ['"].*lib\/theme(\.js)?['"]/);
    expect(view).not.toMatch(/\bCOL\./);
    expect(view).toMatch(/from ['"].*styles\/ledgerTokens(\.js)?['"]/);
    expect(view).toMatch(/SC\.surface/);
  });

  it('view keeps only the documented hex allowlist', () => {
    const extra = hexes(view).filter((h) => !VIEW_ALLOWED.includes(h));
    expect(extra).toEqual([]);
  });

  it('controlRoom META colors are tokens, with only the documented exceptions', () => {
    const extra = hexes(lib).filter((h) => !LIB_ALLOWED.includes(h));
    expect(extra).toEqual([]);
    // The clean semantic mappings really landed:
    expect(lib).toContain("color: 'var(--sc-danger)', soft: 'var(--sc-danger-bg)'");   // NCR_HOLD / blocked
    expect(lib).toContain("color: 'var(--sc-warning)', soft: 'var(--sc-warning-bg)'"); // MISSING_WIR / partial
    expect(lib).toContain("color: 'var(--sc-action)', soft: 'var(--sc-action-bg)'");   // WIR_PENDING
  });

  it('SC token map is var() references only — never hex (single source of truth stays in CSS)', () => {
    for (const [k, v] of Object.entries(SC)) {
      expect(v, `SC.${k}`).toMatch(/^var\(--sc-[a-z0-9-]+\)$/);
    }
  });

  it('boundary copy survives the reskin byte-exact', () => {
    expect(lib).toContain('Certification Control Room is display/readiness only until backend Gate 1 enforcement is connected.');
    expect(lib).toContain('Turn approved site progress into certified payment value.');
  });
});
