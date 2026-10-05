import { describe, it, expect } from 'vitest';
import { fmt, fmtSAR, fmtMoney, groupThousands, cleanNumber } from './format.js';

// Smoke test for the number/currency formatting helpers. Doubles as the reference
// pattern the development loop copies for new pure-function tests: import, describe,
// one `it` per behavior, assert exact output.

describe('fmt', () => {
  it('formats integers with thousands separators', () => {
    expect(fmt(1234567)).toBe('1,234,567');
  });

  it('rounds to the nearest integer', () => {
    expect(fmt(1234.6)).toBe('1,235');
  });

  it('treats null/undefined/NaN as 0', () => {
    expect(fmt(null)).toBe('0');
    expect(fmt(undefined)).toBe('0');
    expect(fmt(NaN)).toBe('0');
  });
});

describe('fmtSAR', () => {
  it('prefixes the SAR currency label', () => {
    expect(fmtSAR(2500)).toBe('SAR 2,500');
  });
});

describe('fmtMoney', () => {
  it('shows an honest zero — never a dash, never "0K"', () => {
    expect(fmtMoney(0)).toBe('SAR 0');
    expect(fmtMoney(null)).toBe('SAR 0');
  });

  it('keeps full digits below a million', () => {
    expect(fmtMoney(482)).toBe('SAR 482');
    expect(fmtMoney(30468)).toBe('SAR 30,468');
    expect(fmtMoney(999999)).toBe('SAR 999,999');
  });

  it('abbreviates millions with two decimals', () => {
    expect(fmtMoney(1284500)).toBe('SAR 1.28M');
    expect(fmtMoney(30467765)).toBe('SAR 30.47M');
  });

  it('drops decimals from 100M up', () => {
    expect(fmtMoney(305000000)).toBe('SAR 305M');
  });
});

describe('groupThousands', () => {
  it('groups an integer string', () => {
    expect(groupThousands('1234567')).toBe('1,234,567');
  });

  it('preserves a decimal part', () => {
    expect(groupThousands('1234.56')).toBe('1,234.56');
  });

  it('preserves a leading minus', () => {
    expect(groupThousands('-1234')).toBe('-1,234');
  });

  it('returns empty string for empty/nullish input', () => {
    expect(groupThousands('')).toBe('');
    expect(groupThousands(null)).toBe('');
    expect(groupThousands(undefined)).toBe('');
  });
});

describe('cleanNumber', () => {
  it('strips grouping commas and spaces', () => {
    expect(cleanNumber('1,234,567')).toBe('1234567');
    expect(cleanNumber('1 234 567')).toBe('1234567');
  });

  it('is the inverse of groupThousands for plain integers', () => {
    expect(cleanNumber(groupThousands('1234567'))).toBe('1234567');
  });
});
