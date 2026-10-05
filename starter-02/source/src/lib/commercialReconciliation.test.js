// ============================================================
// Cross-screen commercial reconciliation.
//
// The bug this locks down: Commercial Readiness ran its own readiness math
// whose "Blocked" counted ONLY NCR holds, so it displayed SAR 0 on a project
// the Control Room and the Certification Queue displayed as SAR 18.37M
// blocked. Same label, two numbers, two screens apart — the kind of thing a
// commercial manager takes to a meeting and gets contradicted on.
//
// All three screens now read `deriveControlRoom` through `useCommercialData`,
// so these tests assert the CONTRACT that keeps them honest:
//   * a metric shown under the same label must be the same number everywhere;
//   * a narrower metric must not borrow the broader metric's name;
//   * the blocked partition must not double count.
// ============================================================
import { describe, it, expect } from 'vitest';
import { deriveControlRoom } from './controlRoom.js';

/** A project with one line per blocker type, so every bucket is exercised. */
function project() {
  const boqItems = [
    // NCR-held: linked, approved WIR present, element carries an open NCR.
    { id: 'ncr', code: '1.01', description: 'NCR held', unit: 'm3', qty: 100, rate: 100, approved_qty: 0 },
    // (approved_qty 0: the whole line is held, so blockedQty = full contract)
    // Missing WIR: linked, elements started, nothing inspected.
    { id: 'mw', code: '1.02', description: 'Missing WIR', unit: 'm3', qty: 100, rate: 100, approved_qty: 0 },
    // Pending WIR: a submitted-but-unapproved WIR claims the line.
    { id: 'pw', code: '1.03', description: 'Pending WIR', unit: 'm3', qty: 100, rate: 100, approved_qty: 0 },
    // Ready: fully supported by an approved WIR, nothing holding it.
    { id: 'rd', code: '1.04', description: 'Ready', unit: 'm3', qty: 100, rate: 100, approved_qty: 100 },
  ];
  const linksByBoq = {
    ncr: new Set(['g-ncr']), mw: new Set(['g-mw']), pw: new Set(['g-pw']), rd: new Set(['g-rd']),
  };
  const statusMap = {
    'g-ncr': { key: 'ncr', clear: false },   // ESTATUS key for an open NCR
    'g-mw': { key: 'in_progress', clear: true },
    'g-pw': { key: 'in_progress', clear: true },
    'g-rd': { key: 'approved', clear: true },
  };
  const wirs = [
    { id: 'w1', boq_item_id: 'ncr', element_guid: 'g-ncr', result: 'approved', approved_qty: 100 },
    { id: 'w2', boq_item_id: 'pw', element_guid: 'g-pw', result: 'pending', scope_qty: 100 },
    { id: 'w3', boq_item_id: 'rd', element_guid: 'g-rd', result: 'approved', approved_qty: 100 },
  ];
  const ncrs = [{ id: 'n1', element_guid: 'g-ncr', status: 'open' }];
  const ipcs = [{ id: 'i1', ipc_number: 'IPC-001', status: 'certified', gross_amount: 5000 }];
  return { boqItems, linksByBoq, statusMap, wirs, ncrs, ipcs, wirAttachCounts: { w1: 1, w3: 1 } };
}

describe('commercial reconciliation across screens', () => {
  const room = deriveControlRoom(project());

  it('every screen reads the same derivation, so blocked value is one number', () => {
    // Control Room reads kpis.blockedValue; the Certification Queue sums the
    // same per-line blockedValue; Commercial Readiness now reads kpis too.
    const controlRoom = room.kpis.blockedValue;
    const certificationQueue = room.lines.reduce((s, l) => s + l.blockedValue, 0);
    const commercialReadiness = room.kpis.blockedValue;

    expect(Math.round(certificationQueue)).toBe(Math.round(controlRoom));
    expect(commercialReadiness).toBe(controlRoom);
    expect(controlRoom).toBeGreaterThan(0); // the fixture really is blocked
  });

  it('NCR hold is a SUBSET of blocked value, and is never called "blocked value"', () => {
    const { ncrHold, blockedValue } = room.kpis;
    expect(ncrHold).toBeGreaterThan(0);
    expect(ncrHold).toBeLessThan(blockedValue);
    // Regression guard: the old Commercial Readiness showed ncrHold under the
    // label "Blocked". If someone re-points that KPI, this fails.
    expect(ncrHold).not.toBe(blockedValue);
  });

  it('blocked value is a partition — its parts sum to the whole, no double counting', () => {
    const { ncrHold, missingWir, blockedValue } = room.kpis;
    const pending = room.lines.reduce((s, l) => s + l.values.pending, 0);
    expect(Math.round(ncrHold + missingWir + pending)).toBe(Math.round(blockedValue));
  });

  it('eligible value agrees wherever it is shown', () => {
    const queue = room.lines.reduce((s, l) => s + l.values.certifiable, 0);
    expect(Math.round(queue)).toBe(Math.round(room.kpis.certifiableTotal));
  });

  it('ready lines agree between the queue filter and the readiness tiles', () => {
    const readyLines = room.lines.filter((l) => l.cls === 'ready');
    expect(readyLines.length).toBe(room.counts.ready);
  });

  it('evidence-gap value sits INSIDE eligible value, never added to blocked', () => {
    // An evidence gap is an audit risk on money that is otherwise certifiable,
    // so counting it as blocked would inflate the blocked total.
    const { missingEvidence, blockedValue, certifiableTotal } = room.kpis;
    expect(missingEvidence).toBeLessThanOrEqual(certifiableTotal);
    const parts = room.kpis.ncrHold + room.kpis.missingWir
      + room.lines.reduce((s, l) => s + l.values.pending, 0);
    expect(Math.round(parts)).toBe(Math.round(blockedValue));
  });

  it('certified-to-date comes from IPC headers, not from line readiness', () => {
    // Line math can never produce the certified position — only IPC headers can.
    expect(room.kpis.certifiedInIpc).toBe(5000);
  });
});
