import { describe, it, expect } from 'vitest';
import { computeIpc, ipcStatusLabel, IPC_STATUS_LABEL } from './ipcStatus.js';

// The IPC financial math turns a gross value into the certified payable figure
// (10% retention, 15% VAT on the post-retention subtotal). This is the number
// printed on the payment certificate, so an accidental change must fail loudly.

describe('computeIpc', () => {
  it('applies 10% retention and 15% VAT on the post-retention subtotal', () => {
    // gross 1,000,000 → retention 100,000 → subtotal 900,000 → VAT 135,000 → net 1,035,000
    expect(computeIpc(1_000_000)).toEqual({ retention: 100_000, vat: 135_000, net: 1_035_000 });
  });

  it('returns zeroes for a zero gross', () => {
    expect(computeIpc(0)).toEqual({ retention: 0, vat: 0, net: 0 });
  });

  it('treats non-numeric / null / undefined gross as 0 (never NaN)', () => {
    for (const bad of [null, undefined, '', 'abc', NaN]) {
      expect(computeIpc(bad)).toEqual({ retention: 0, vat: 0, net: 0 });
    }
  });

  it('holds the identity net === gross − retention + VAT', () => {
    for (const g of [123_456.78, 50_000, 999_999.99, 2_000_000, 7.5]) {
      const { retention, vat, net } = computeIpc(g);
      expect(net).toBeCloseTo(Math.round((g - retention + vat) * 100) / 100, 2);
    }
  });

  it('honours custom retention / VAT rates', () => {
    // gross 1000, 5% retention → 50, subtotal 950, 10% VAT → 95, net 1045
    expect(computeIpc(1000, 0.05, 0.1)).toEqual({ retention: 50, vat: 95, net: 1045 });
  });

  it('rounds every component to 2 decimals', () => {
    const r = computeIpc(33.333);
    for (const v of Object.values(r)) expect(Number.isFinite(v)).toBe(true);
    expect(r.retention).toBe(Math.round(33.333 * 0.1 * 100) / 100);
  });
});

describe('ipcStatusLabel', () => {
  it('maps every known status to its display label', () => {
    expect(ipcStatusLabel('draft')).toBe('Draft');
    expect(ipcStatusLabel('submitted')).toBe('Under Review');
    expect(ipcStatusLabel('certified')).toBe('Certified');
    expect(ipcStatusLabel('paid')).toBe('Paid');
    expect(ipcStatusLabel('rejected')).toBe('Rejected');
  });

  it('falls back to the raw value for an unknown status', () => {
    expect(ipcStatusLabel('weird')).toBe('weird');
  });

  it('keeps the label map in step with the status keys', () => {
    for (const k of ['draft', 'submitted', 'certified', 'paid', 'rejected']) {
      expect(IPC_STATUS_LABEL[k]).toBeTruthy();
    }
  });
});
