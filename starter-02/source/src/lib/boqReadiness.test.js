import { describe, it, expect } from 'vitest';
import { buildLinksByBoq, lineReadiness, boqWaterfall } from './boqReadiness.js';

// BoQ readiness splits each line's contract quantity into approved / blocked /
// progress / unlinked. The certified value of a line is approvedQty × rate, and
// the cardinal rule is that approvedQty can NEVER exceed the contract quantity —
// that is the over-certification guard (the "asserted ≠ earned" boundary). These
// tests pin that and the blocked-share + badge logic.

describe('buildLinksByBoq', () => {
  it('merges join-table links and legacy element_id into a deduped set per line', () => {
    const links = [
      { boq_item_id: 'L1', element_guid: 'g1' },
      { boq_item_id: 'L1', element_guid: 'g2' },
      { boq_item_id: 'L2', element_guid: 'g9' },
    ];
    const items = [{ id: 'L1', element_id: 'g3' }, { id: 'L1', element_id: 'g1' /* dup */ }];
    const m = buildLinksByBoq(links, items);
    expect([...m.L1].sort()).toEqual(['g1', 'g2', 'g3']);
    expect([...m.L2]).toEqual(['g9']);
  });

  it('returns an empty map for no input', () => {
    expect(buildLinksByBoq()).toEqual({});
  });
});

describe('lineReadiness', () => {
  it('CRITICAL: caps approved quantity at the contract quantity (over-cert guard)', () => {
    const r = lineReadiness({ id: 'L1', qty: 100, rate: 10, approved_qty: 150 });
    expect(r.approvedQty).toBe(100);           // not 150
    expect(r.approvedValue).toBe(1000);        // 100 × 10, not 1500
    expect(r.badge).toBe('ready');
  });

  it('floors a negative approved quantity at 0', () => {
    const r = lineReadiness({ id: 'L1', qty: 100, rate: 10, approved_qty: -50 });
    expect(r.approvedQty).toBe(0);
    expect(r.approvedValue).toBe(0);
  });

  it('values an in-progress line as approvedQty × rate', () => {
    const r = lineReadiness({ id: 'L1', qty: 100, rate: 10, approved_qty: 40 });
    expect(r.approvedValue).toBe(400);
    expect(r.badge).toBe('progress');
  });

  it('is unmapped (full contract unlinked) when nothing is linked', () => {
    const r = lineReadiness({ id: 'L1', qty: 100, rate: 10, approved_qty: 0 });
    expect(r.badge).toBe('unmapped');
    expect(r.unlinkedQty).toBe(100);
    expect(r.linkedCount).toBe(0);
  });

  it('derives blocked quantity from the share of NCR/rejected linked elements', () => {
    const links = buildLinksByBoq([
      { boq_item_id: 'L1', element_guid: 'g1' },
      { boq_item_id: 'L1', element_guid: 'g2' },
    ]);
    const statusMap = { g1: { key: 'ncr' }, g2: { key: 'approved' } };
    const r = lineReadiness({ id: 'L1', qty: 100, rate: 10, approved_qty: 0 }, links, statusMap);
    expect(r.blockedCount).toBe(1);
    expect(r.blockedQty).toBe(50);             // (1/2) × 100 − 0
    expect(r.blockedValue).toBe(500);
    expect(r.badge).toBe('blocked');
    expect(r.unlinkedQty).toBe(0);             // it IS linked
  });

  it('always reports the full contract value regardless of linkage', () => {
    expect(lineReadiness({ id: 'L1', qty: 100, rate: 10 }).value).toBe(1000);
  });
});

describe('boqWaterfall', () => {
  const line = { id: 'L1', code: '1.01', unit: 'm3', qty: 100, rate: 10, approved_qty: 50 };
  const summary = { id: 'S1', code: '', description: 'Subtotal', qty: 999, rate: 999, approved_qty: 999 };

  it('counts only real line items, not summary/subtotal rows', () => {
    const links = buildLinksByBoq([{ boq_item_id: 'L1', element_guid: 'g1' }]);
    const w = boqWaterfall([line, summary], links, {});
    expect(w.contract).toBe(1000);             // summary's 999×999 excluded
    expect(w.mapped).toBe(1000);               // L1 is linked
    expect(w.proven).toBe(500);                // approvedQty 50 × 10
    expect(w.certifiable).toBe(500);
    expect(w.unlinked).toBe(0);
  });

  it('reports unlinked contract value when a line has no links', () => {
    const w = boqWaterfall([line], {}, {});
    expect(w.mapped).toBe(0);
    expect(w.unlinked).toBe(1000);
    expect(w.proven).toBe(500);                // approved_qty still certifies even if link map is empty
  });

  it('never returns negative certifiable value', () => {
    const w = boqWaterfall([], {}, {});
    expect(w.certifiable).toBeGreaterThanOrEqual(0);
  });
});
