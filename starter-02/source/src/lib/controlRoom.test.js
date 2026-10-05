import { describe, it, expect } from 'vitest';
import {
  deriveControlRoom, demoControlRoomInputs, indexWirsByLine, wirClaimQty, nextIpcLabel,
  BLOCKER_META, OWNER_GROUPS,
  CONTROL_ROOM_TAGLINE, CONTROL_ROOM_EVIDENCE_TAGLINE, CONTROL_ROOM_BOUNDARY,
} from './controlRoom.js';

// ── Fixture: 5 lines exercising every readiness class.
//  a — fully certified, evidence on file            → ready
//  b — partial: some certified + NCR hold + pending → partial
//  c — linked, nothing proven, no WIR               → blocked (missing WIR)
//  d — overclaim: claims above contract             → review
//  e — approved WIR with NO attachment              → partial (evidence gap)
const boqItems = [
  { id: 'a', code: 'A1', description: 'Concrete', unit: 'm3', qty: 10, rate: 100, approved_qty: 10 },
  { id: 'b', code: 'B1', description: 'Blockwork', unit: 'm2', qty: 100, rate: 10, approved_qty: 40 },
  { id: 'c', code: 'C1', description: 'Steel', unit: 'ton', qty: 10, rate: 500, approved_qty: 0 },
  { id: 'd', code: 'D1', description: 'Paint', unit: 'm2', qty: 10, rate: 100, approved_qty: 10 },
  { id: 'e', code: 'E1', description: 'Joints', unit: 'm', qty: 10, rate: 100, approved_qty: 6 },
  { id: 'z', code: '', description: 'Sub-total', qty: 0, rate: 0 }, // summary row → filtered
];
const linksByBoq = { a: new Set(['ga']), b: new Set(['gb1', 'gb2']), c: new Set(['gc']), d: new Set(['gd']), e: new Set(['ge']) };
const statusMap = {
  ga: { key: 'approved', clear: true },
  gb1: { key: 'approved', clear: true }, gb2: { key: 'ncr', clear: false },
  gc: { key: 'in_progress', clear: false }, // C1 is EXECUTED but has no WIR → missing_wir (not-started+no-WIR would be idle)
  gd: { key: 'approved', clear: true },
  ge: { key: 'approved', clear: true },
};
const wirs = [
  { id: 'w1', boq_item_id: 'a', result: 'Approved', approved_qty: 10 },
  { id: 'w2', boq_item_id: 'b', result: 'Approved', approved_qty: 40 },
  { id: 'w3', boq_item_id: 'b', result: 'Pending', approved_qty: 20 },
  { id: 'w4', boq_item_id: 'd', result: 'Approved', approved_qty: 14 },  // 14 > contract 10 → overclaim 4
  { id: 'w5', boq_item_id: 'e', result: 'Approved', approved_qty: 6 },   // no attachment → evidence gap
];
const ncrs = [{ id: 'n1', status: 'open', element_guid: 'gb2' }];
const ipcs = [{ id: 'p1', ipc_number: 'IPC-05', status: 'certified', gross_amount: 500 }];
const wirAttachCounts = { w1: 2, w2: 1, w4: 1 }; // w5 has none

const out = deriveControlRoom({ boqItems, linksByBoq, statusMap, wirs, ncrs, ipcs, wirAttachCounts });
const by = Object.fromEntries(out.lines.map((l) => [l.code, l]));

describe('required product copy (byte-exact)', () => {
  it('keeps the two approved taglines and the Gate 1 boundary', () => {
    expect(CONTROL_ROOM_TAGLINE).toBe('Turn approved site progress into certified payment value.');
    expect(CONTROL_ROOM_EVIDENCE_TAGLINE).toBe('Connect inspection evidence to payment certification.');
    expect(CONTROL_ROOM_BOUNDARY).toBe('Certification Control Room is display/readiness only until backend Gate 1 enforcement is connected.');
  });
  it('never uses the banned phrase', () => {
    const all = JSON.stringify({ BLOCKER_META, CONTROL_ROOM_TAGLINE, CONTROL_ROOM_EVIDENCE_TAGLINE, CONTROL_ROOM_BOUNDARY });
    expect(all.toLowerCase()).not.toContain('asserted is not earned');
  });
});

describe('readiness classification', () => {
  it('filters summary rows', () => {
    expect(out.lines.find((l) => l.description === 'Sub-total')).toBeUndefined();
  });
  it('classifies every state', () => {
    expect(by.A1.cls).toBe('ready');
    expect(by.B1.cls).toBe('partial');
    expect(by.C1.cls).toBe('blocked');
    expect(by.D1.cls).toBe('review');   // overclaim → review, never silently certifiable
    expect(by.E1.cls).toBe('partial');  // evidence gap keeps it out of "ready"
  });
  it('counts match the classes', () => {
    expect(out.counts).toMatchObject({ ready: 1, partial: 2, blocked: 1, review: 1 });
  });
});

describe('value decomposition — never double counts', () => {
  it('certifiable = stored approved_qty capped at contract (same engine as QS)', () => {
    expect(by.A1.values.certifiable).toBe(1000);
    expect(by.B1.values.certifiable).toBe(400);
    expect(by.D1.values.certifiable).toBe(1000); // capped at contract even though claimed 14
  });
  it('per-line buckets partition the contract (certifiable+ncr+pending+missingWir ≤ contract)', () => {
    for (const l of out.lines) {
      const sum = l.values.certifiable + l.values.ncr + l.values.pending + l.values.missingWir;
      expect(sum).toBeLessThanOrEqual(l.values.contract + 0.01);
    }
  });
  it('overclaim = claims above contract, kept OUTSIDE blocked value', () => {
    expect(by.D1.values.overclaim).toBe(400); // (14-10) × 100
    expect(by.D1.blockedValue).toBe(0);
    expect(out.kpis.overclaim).toBe(400);
  });
  it('evidence gap is flagged within certifiable, not added to blocked', () => {
    expect(by.E1.values.evidenceGap).toBe(600);
    expect(by.E1.blockedValue + by.E1.values.evidenceGap).toBeGreaterThan(by.E1.blockedValue);
    expect(out.kpis.blockedValue).not.toBeNaN();
    // blocked KPI excludes the evidence flag
    const blockedSum = out.lines.reduce((s, l) => s + l.blockedValue, 0);
    expect(out.kpis.blockedValue).toBeCloseTo(blockedSum, 2);
  });
  it('missing WIR only counts MAPPED scope with no WIR coverage', () => {
    expect(by.C1.values.missingWir).toBe(5000); // fully mapped, nothing raised
    expect(by.C1.blockedValue).toBe(5000);
  });
});

describe('blockers, owners, targets (derived suggestions)', () => {
  it('primary blocker is the largest value', () => {
    expect(by.C1.blockers[0].reason).toBe('MISSING_WIR');
    expect(by.D1.blockers[0].reason).toBe('OVERCLAIM');
    expect(by.E1.blockers[0].reason).toBe('MISSING_EVIDENCE');
  });
  it('derives owner + action + target IPC from the blocker type', () => {
    expect(by.C1.owner).toBe(BLOCKER_META.MISSING_WIR.owner);
    expect(by.C1.nextAction).toBe(BLOCKER_META.MISSING_WIR.action);
    expect(by.C1.targetIpc).toBe('IPC-06');       // next after IPC-05
    expect(by.D1.targetIpc).toBe('—');            // write-off bucket has no target
  });
  it('owner board covers the six lanes and routes certified-unpaid IPCs to Client', () => {
    expect(Object.keys(out.board).sort()).toEqual([...OWNER_GROUPS].sort());
    expect(out.board.Client.value).toBe(500);     // certified, not yet paid
    expect(out.board.Consultant.items.some((i) => i.reason === 'WIR_PENDING')).toBe(true);
  });
});

describe('KPIs + recovery forecast', () => {
  it('KPI strip adds up from the lines', () => {
    // certifiableTotal is the raw sum; readyToCertify deducts value already
    // carried into a certified/paid IPC (500 here) so it never overstates.
    expect(out.kpis.certifiableTotal).toBe(1000 + 400 + 1000 + 600); // 3000
    expect(out.kpis.certifiedInIpc).toBe(500);
    expect(out.kpis.readyToCertify).toBe(2500);
    expect(out.kpis.ncrHold).toBeGreaterThan(0);
    expect(out.kpis.missingWir).toBeGreaterThanOrEqual(5000);
  });
  it('recoverable next IPC = this_week + next_ipc buckets; overclaim goes to write-off', () => {
    expect(out.kpis.recoverableNextIpc).toBeCloseTo(out.recovery.this_week + out.recovery.next_ipc, 2);
    expect(out.recovery.write_off).toBeGreaterThanOrEqual(400);
    expect(out.recovery.external).toBeGreaterThan(0); // pending WIR sits in the consultant court
  });
});

describe('evidence gap panel honesty', () => {
  it('MIR and drawing rows are demo-labelled with no fabricated value', () => {
    const mir = out.evidencePanel.find((g) => g.key === 'missing_mir');
    const drw = out.evidencePanel.find((g) => g.key === 'missing_drawing');
    expect(mir.demo).toBe(true); expect(mir.value).toBe(0);
    expect(drw.demo).toBe(true); expect(drw.value).toBe(0);
  });
  it('real rows carry real values', () => {
    expect(out.evidencePanel.find((g) => g.key === 'missing_wir').value).toBe(out.kpis.missingWir);
    expect(out.evidencePanel.find((g) => g.key === 'ncr_clearance').count).toBe(1);
  });
  it('null attachment index = UNKNOWN evidence: derives no gaps, flags the panel', () => {
    const unk = deriveControlRoom({ boqItems, linksByBoq, statusMap, wirs, ncrs, ipcs, wirAttachCounts: null });
    expect(unk.kpis.missingEvidence).toBe(0);          // never fabricate a gap
    expect(unk.kpis.evidenceUnknown).toBe(true);
    const photo = unk.evidencePanel.find((g) => g.key === 'missing_photo');
    expect(photo.unknown).toBe(true);
    // E1 was a partial (evidence gap) with a real index; unknown must NOT demote it via a gap
    expect(unk.lines.find((l) => l.code === 'E1').values.evidenceGap).toBe(0);
  });
});

describe('not-yet-executed scope is not a blocker', () => {
  it('a linked line whose elements are all not-started with no WIR is idle, not missing-WIR', () => {
    const o = deriveControlRoom({
      boqItems: [{ id: 'x', code: 'X1', description: 'future', unit: 'm', qty: 10, rate: 100, approved_qty: 0 }],
      linksByBoq: { x: new Set(['gx']) }, statusMap: { gx: { key: 'not_started', clear: false } },
      wirs: [], ncrs: [], ipcs: [], wirAttachCounts: {},
    });
    expect(o.lines[0].cls).toBe('idle');
    expect(o.lines[0].values.missingWir).toBe(0);
  });
});

describe('helpers', () => {
  it('wirClaimQty prefers approved_qty, falls back to scope_qty', () => {
    expect(wirClaimQty({ approved_qty: 5, scope_qty: 9 })).toBe(5);
    expect(wirClaimQty({ scope_qty: 9 })).toBe(9);
    expect(wirClaimQty({})).toBe(0);
  });
  it('indexWirsByLine attributes direct + unambiguous element-mediated WIRs only', () => {
    const idx = indexWirsByLine(
      [{ id: 'x', boq_item_id: 'a' }, { id: 'y', element_guid: 'g1' }, { id: 'amb', element_guid: 'g2' }],
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      { b: new Set(['g1']), a: new Set(['g2']), c: new Set(['g2']) },
    );
    expect(idx.a.map((w) => w.id)).toEqual(['x']);   // ambiguous g2 never guessed
    expect(idx.b.map((w) => w.id)).toEqual(['y']);
  });
  it('nextIpcLabel increments the highest certificate number', () => {
    expect(nextIpcLabel([{ ipc_number: 'IPC-09' }, { ipc_number: 'IPC-3' }])).toBe('IPC-10');
    expect(nextIpcLabel([])).toBe('Next IPC');
  });
});

describe('demo dataset', () => {
  it('runs through the same derivation and exercises every class', () => {
    const demo = deriveControlRoom(demoControlRoomInputs());
    expect(demo.lines.length).toBeGreaterThan(4);
    expect(demo.counts.ready).toBeGreaterThan(0);
    expect(demo.counts.blocked + demo.counts.partial).toBeGreaterThan(0);
    expect(demo.counts.review).toBeGreaterThan(0);
    expect(demo.kpis.recoverableNextIpc).toBeGreaterThan(0);
  });
});
