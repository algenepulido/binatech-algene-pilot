import { describe, it, expect } from 'vitest';
import { resultLabel, RESULT_LABEL, WIR_RESULTS } from './wirStatus.js';

// WIR result ↔ label mapping. The StatusPill keys off these capitalized labels,
// so a drifted mapping silently shows the wrong inspection state on a register
// that defends payment — keep the values pinned.

describe('resultLabel', () => {
  it('maps every known WIR result to its display label', () => {
    expect(resultLabel('pending')).toBe('Pending');
    expect(resultLabel('in_progress')).toBe('In Progress');
    expect(resultLabel('approved')).toBe('Approved');
    expect(resultLabel('rejected')).toBe('Rejected');
  });

  it('falls back to the raw value for an unknown result', () => {
    expect(resultLabel('foo')).toBe('foo');
  });

  it('has a label for every declared result value', () => {
    for (const r of WIR_RESULTS) expect(RESULT_LABEL[r]).toBeTruthy();
  });
});
