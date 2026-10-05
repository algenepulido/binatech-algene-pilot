import { describe, it, expect } from 'vitest';
import { deriveElementStatus } from './elementStatus.js';

// deriveElementStatus is the bridge from element-level proof (WIRs/NCRs) to
// certifiable value. Its single most important property: an OPEN NCR blocks an
// element even when it also has an approved WIR — "approved but blocked" must
// never read as "clear to certify". These tests lock that and the other states.

describe('deriveElementStatus', () => {
  it('is not_started with no records', () => {
    expect(deriveElementStatus([], [])).toEqual({ key: 'not_started', clear: false });
  });

  it('is clear-to-certify when a WIR is approved and no NCR is open', () => {
    expect(deriveElementStatus(['approved'], [])).toEqual({ key: 'approved', clear: true });
  });

  it('CRITICAL: an open NCR blocks an element even if a WIR is approved', () => {
    const s = deriveElementStatus(['approved'], ['open']);
    expect(s.key).toBe('ncr');
    expect(s.clear).toBe(false);
  });

  it('does not block when the NCR is in any closed-equivalent state', () => {
    for (const closed of ['closed', 'cleared', 'resolved', 'void', 'cancelled', 'verified']) {
      expect(deriveElementStatus(['approved'], [closed])).toEqual({ key: 'approved', clear: true });
    }
  });

  it('treats any non-closed NCR status as open (blocking)', () => {
    for (const open of ['open', 'in progress', 'pending', 'reopened']) {
      expect(deriveElementStatus(['approved'], [open]).clear).toBe(false);
    }
  });

  it('prefers approved over rejected when both WIR results exist and nothing is blocked', () => {
    expect(deriveElementStatus(['rejected', 'approved'], [])).toEqual({ key: 'approved', clear: true });
  });

  it('is rejected when a WIR is rejected and none approved', () => {
    expect(deriveElementStatus(['rejected'], [])).toEqual({ key: 'rejected', clear: false });
  });

  it('is in_progress with WIRs present but none approved or rejected', () => {
    expect(deriveElementStatus(['pending'], [])).toEqual({ key: 'in_progress', clear: false });
  });

  it('matches approval/rejection by substring (approval, approved, rejected)', () => {
    expect(deriveElementStatus(['approval'], []).key).toBe('approved');
    expect(deriveElementStatus(['rejection'], []).key).toBe('rejected');
  });
});
