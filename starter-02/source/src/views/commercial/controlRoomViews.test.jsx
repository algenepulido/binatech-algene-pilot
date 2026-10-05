import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RecoveryQueueView } from './RecoveryQueueView.jsx';
import { CertificationControlRoomView } from './CertificationControlRoomView.jsx';
import { RECOVERY_BADGE } from '../../lib/recoveryQueue.js';
import { CONTROL_ROOM_BOUNDARY } from '../../lib/controlRoom.js';

// The Control Room loads real project data — mock every read to empty so the
// view exercises its clearly-bannered synthetic demo fallback in jsdom.
// listBoqItems is a vi.fn so a test can force it to reject (load-error path).
const listBoqItems = vi.fn(async () => []);
const listAllLinks = vi.fn();
const listWirs = vi.fn();
const listNcrs = vi.fn();
const listIpcs = vi.fn();
const loadElementStatusMap = vi.fn();
const countAttachmentsByRecord = vi.fn();
vi.mock('../../api/boqItems.js', async (orig) => ({ ...(await orig()), listBoqItems: (...a) => listBoqItems(...a) }));
vi.mock('../../api/elementBoqLinks.js', () => ({ listAllLinks: (...a) => listAllLinks(...a) }));
vi.mock('../../api/wirs.js', () => ({ listWirs: (...a) => listWirs(...a) }));
vi.mock('../../api/ncrs.js', () => ({ listNcrs: (...a) => listNcrs(...a) }));
vi.mock('../../api/ipcs.js', () => ({ listIpcs: (...a) => listIpcs(...a) }));
vi.mock('../../lib/elementStatus.js', () => ({ loadElementStatusMap: (...a) => loadElementStatusMap(...a) }));
vi.mock('../../lib/attachments.js', () => ({ countAttachmentsByRecord: (...a) => countAttachmentsByRecord(...a) }));

beforeEach(() => {
  for (const read of [listBoqItems, listAllLinks, listWirs, listNcrs, listIpcs]) read.mockReset().mockResolvedValue([]);
  for (const read of [loadElementStatusMap, countAttachmentsByRecord]) read.mockReset().mockResolvedValue({});
});

describe('RecoveryQueueView (display-only, badged demo data)', () => {
  it('renders the mandatory badge, KPIs, table and charts', () => {
    render(<RecoveryQueueView lang="en" />);
    expect(screen.getAllByText(RECOVERY_BADGE).length).toBeGreaterThan(0);
    expect(screen.getByText('Total blocked value')).toBeTruthy();
    expect(screen.getByText('Blocked value by reason')).toBeTruthy();
    expect(screen.getByText('Blocked value by owner')).toBeTruthy();
    expect(screen.getAllByText('NCR hold').length).toBeGreaterThan(0);
  });
  it('opens the detail drawer on row click; draft note is display-only', () => {
    render(<RecoveryQueueView lang="en" />);
    fireEvent.click(screen.getAllByText('03.10.055')[0]);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByText('Draft action note'));
    expect(screen.getByPlaceholderText(/display-only/)).toBeTruthy();
    expect(screen.getByText(/notes are not saved/)).toBeTruthy();
  });
  it('exposes no certify/approve/pay controls', () => {
    render(<RecoveryQueueView lang="en" />);
    for (const banned of [/certify/i, /approve/i, /mark paid/i]) {
      expect(screen.queryByRole('button', { name: banned })).toBeNull();
    }
  });
  it('renders Arabic labels in ar mode (RTL content is localized, not English)', () => {
    const { container } = render(<RecoveryQueueView lang="ar" />);
    expect(container.querySelector('[dir="rtl"]')).toBeTruthy();
    expect(screen.getAllByText('معلّق بمخالفة').length).toBeGreaterThan(0); // NCR hold (AR)
    expect(screen.getAllByText('عالية').length).toBeGreaterThan(0);          // High priority (AR)
  });
});

describe('CertificationControlRoomView (boundary + demo fallback)', () => {
  it('shows the Gate 1 boundary, review-only copy, and the demo banner on empty data', async () => {
    render(<CertificationControlRoomView lang="en" />);
    expect(await screen.findByText(CONTROL_ROOM_BOUNDARY)).toBeTruthy();
    expect(screen.getByText(/^Review inspection evidence and commercial blockers\./)).toBeTruthy();
    expect(await screen.findByText(/Synthetic demo data/)).toBeTruthy();
    expect(screen.getByText('· Use inspection evidence for measurement and commercial review.')).toBeTruthy();
    expect(screen.getByText('Indicative balance after IPCs')).toBeTruthy();
    expect(screen.getByText('Owner Action Board')).toBeTruthy();
  });
  it('cross-links to the Recovery Queue when onNavigate is provided', async () => {
    const nav = vi.fn();
    render(<CertificationControlRoomView lang="en" onNavigate={nav} />);
    fireEvent.click(await screen.findByText('Open Recovery Queue'));
    expect(nav).toHaveBeenCalledWith('recovery-queue');
  });
  it('never contains the banned phrase', async () => {
    const { container } = render(<CertificationControlRoomView lang="en" />);
    await screen.findByText(CONTROL_ROOM_BOUNDARY);
    expect(container.textContent.toLowerCase()).not.toContain('asserted is not earned');
  });
  it('a failed critical fetch shows an error + retry, NOT fabricated demo data', async () => {
    listBoqItems.mockRejectedValue(new Error('network'));
    render(<CertificationControlRoomView lang="en" />);
    expect(await screen.findByText(/Couldn't load the certification data/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeTruthy();
    // must NOT silently fall back to the synthetic demo dataset on an error
    expect(screen.queryByText(/Synthetic demo data/)).toBeNull();
  });
});

// ACC-R3: real view, loader and shared engine; only external reads are doubled.
// Values are independently calculated: backed total 3400, IPC headers 700,
// balance 2700. The ready signal contains only1000; these are NOT the same set.
function inspectionRecords() {
  listBoqItems.mockResolvedValue([
    { id: 'a', code: 'A1', description: 'Concrete', unit: 'm3', qty: 10, rate: 100, approved_qty: 10 },
    { id: 'b', code: 'B1', description: 'Blockwork', unit: 'm2', qty: 100, rate: 10, approved_qty: 40 },
    { id: 'c', code: 'C1', description: 'Steel', unit: 'ton', qty: 10, rate: 500, approved_qty: 0 },
    { id: 'd', code: 'D1', description: 'Paint', unit: 'm2', qty: 10, rate: 100, approved_qty: 10 },
    { id: 'e', code: 'E1', description: 'Joints', unit: 'm', qty: 10, rate: 100, approved_qty: 10 },
  ]);
  listAllLinks.mockResolvedValue([
    { boq_item_id: 'a', element_guid: 'ga' },
    { boq_item_id: 'b', element_guid: 'gb1' }, { boq_item_id: 'b', element_guid: 'gb2' },
    { boq_item_id: 'c', element_guid: 'gc' }, { boq_item_id: 'd', element_guid: 'gd' },
    { boq_item_id: 'e', element_guid: 'ge' },
  ]);
  loadElementStatusMap.mockResolvedValue({ ga: { key: 'approved' }, gb1: { key: 'approved' }, gb2: { key: 'ncr' }, gc: { key: 'in_progress' }, gd: { key: 'approved' }, ge: { key: 'approved' } });
  listWirs.mockResolvedValue([
    { id: 'w1', wir_number: 'WIR-A', boq_item_id: 'a', result: 'Approved', approved_qty: 10 },
    { id: 'w2', wir_number: 'WIR-B', boq_item_id: 'b', result: 'Approved', approved_qty: 40 },
    { id: 'w3', wir_number: 'WIR-B2', boq_item_id: 'b', result: 'Pending', approved_qty: 20 },
    { id: 'w4', wir_number: 'WIR-D', boq_item_id: 'd', result: 'Approved', approved_qty: 14 },
    { id: 'w5', wir_number: 'WIR-E', boq_item_id: 'e', result: 'Approved', approved_qty: 10 },
  ]);
  countAttachmentsByRecord.mockResolvedValue({ w1: 2, w2: 1, w4: 1 });
  listNcrs.mockResolvedValue([{ id: 'n1', ncr_number: 'NCR-B', status: 'open', element_guid: 'gb2' }]);
  listIpcs.mockResolvedValue([
    { id: 'p1', ipc_number: 'IPC-01', status: 'certified', gross_amount: 500 },
    { id: 'p2', ipc_number: 'IPC-02', status: 'paid', gross_amount: 200 },
    { id: 'p3', ipc_number: 'IPC-03', status: 'draft', gross_amount: 9000 },
  ]);
}

async function openRoom(lang = 'en', props = {}) {
  render(<CertificationControlRoomView lang={lang} {...props} />);
  await screen.findByRole('table');
}
const roomRow = (code) => [...document.querySelectorAll('tbody tr')].find((r) => r.firstElementChild.textContent === code);
const roomCells = (code) => within(roomRow(code)).getAllByRole('cell').map((c) => c.textContent.trim());
const overclaims = /Ready to certify|Certifiable|Certifiability|Partly eligible|Eligible (?:qty|value)|Certified value|جاهز للاعتماد|قابل(?:ة)? للاعتماد|القابل للاعتماد|قابلية الاعتماد|مؤهل/;
const readSource = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('ACC-R3 · Control Room signals never assert commercial entitlement', () => {
  beforeEach(inspectionRecords);

  it('labels the header-deducted balance distinctly from inspection-backed line values', async () => {
    await openRoom('en', { onNavigate: vi.fn() });
    const balance = screen.getByRole('button', { name: /Indicative balance after IPCs/ });
    expect(balance.textContent).toContain('SAR 2,700');
    expect(balance.textContent).toContain('Inspection-backed total less certified/paid IPC headers; not payment approval.');
    expect(screen.getByRole('columnheader', { name: 'Inspection-backed value' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Primary signal value' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(overclaims);
  });

  it('100% inspection approval produces only a limited no-blocker signal, not ready-to-certify', async () => {
    await openRoom('en', { onNavigate: vi.fn() });
    const ready = screen.getByRole('button', { name: /^No blocker signal/ });
    expect(ready.textContent).toContain('1 lines');
    expect(ready.textContent).toContain('SAR 1,000');
    expect(screen.getByText(/Signals reflect loaded records only/)).toBeTruthy();
    expect(ready.textContent).not.toMatch(/eligible|ready|certif/i);
  });

  it('partial approval and full approval with missing files share review, not partial eligibility', async () => {
    await openRoom('en', { onNavigate: vi.fn() });
    const partial = screen.getByRole('button', { name: /^Commercial review required/ });
    expect(partial.textContent).toContain('2 lines');
    expect(partial.textContent).toContain('SAR 1,400');
    expect(roomRow('B1').textContent).toContain('Commercial review required');
    // E1 is evidence-only: existing exclusion from blocked table is preserved.
    expect(roomRow('E1')).toBeUndefined();
    const evidenceAction = screen.getByRole('button', { name: /E1.*Compile & attach evidence pack/ });
    fireEvent.click(evidenceAction);
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Commercial review required');
    expect(dialog.textContent).toContain('Evidence gap');
    expect(dialog.textContent).toContain('Inspection-approved qty: 10 m (100%)');
    expect(dialog.textContent).not.toMatch(/Partially inspection-backed|Partly eligible|Ready to certify/);
  });

  it('preserves exact blocked ordering, values, primary reason and review dominance', async () => {
    await openRoom();
    expect([...document.querySelectorAll('tbody tr')].map((r) => r.firstElementChild.textContent)).toEqual(['C1', 'B1', 'D1']);
    expect(roomCells('C1').slice(2, 5)).toEqual(['SAR 0', 'SAR 0', 'SAR 5,000']);
    // NCR100 + pending200 + missingWIR300 = blocked600; primary signal is300.
    expect(roomCells('B1').slice(2, 5)).toEqual(['SAR 600', 'SAR 400', 'SAR 300']);
    expect(roomCells('D1').slice(2, 5)).toEqual(['SAR 1,400', 'SAR 1,000', 'SAR 400']);
    expect(roomRow('C1').textContent).toContain('Blocked');
    expect(roomRow('B1').textContent).toContain('No WIR coverage');
    expect(roomRow('D1').textContent).toContain('Review needed');
    expect(roomRow('D1').textContent).toContain('Overclaim above contract');
  });

  it('keeps genuine certified IPC status distinct, with only certified headers awaiting payment', async () => {
    await openRoom();
    const client = screen.getByText('Certified certificates awaiting payment');
    expect(client.closest('button')).toBeNull();
    expect(client.parentElement.textContent).toContain('SAR 500');
    expect(client.parentElement.textContent).not.toContain('SAR 700');
    for (const name of [/^certify/i, /^approve/i, /^pay/i]) expect(screen.queryByRole('button', { name })).toBeNull();
  });

  it('preserves every KPI/summary destination, refresh and absence of a certify action', async () => {
    const nav = vi.fn(); await openRoom('en', { onNavigate: nav });
    for (const [label, filter] of [
      ['Indicative balance after IPCs', 'ready'], ['Blocked value', 'blocked'], ['Missing WIR value', 'missing_wir'],
      ['Missing evidence value', 'evidence'], ['NCR hold value', 'ncr'], ['Above-contract claim signal', 'cap'],
      ['No blocker signal', 'ready'], ['Commercial review required', 'partial'], ['Blocked 1 lines', 'blocked'], ['Review needed', 'cap'],
    ]) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }));
      expect(nav).toHaveBeenLastCalledWith('certqueue', filter);
    }
    expect(screen.queryByRole('button', { name: /Recoverable next IPC/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open Certification Queue' }));
    expect(nav).toHaveBeenLastCalledWith('certqueue', 'all');
    fireEvent.click(screen.getByRole('button', { name: 'Open Recovery Queue' }));
    expect(nav).toHaveBeenLastCalledWith('recovery-queue');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByRole('table');
    expect(listBoqItems).toHaveBeenCalledTimes(2);
  });

  it('drawer remains read-only with exact quantity/value, NCR/WIR links and unsaved note', async () => {
    await openRoom(); fireEvent.click(roomRow('B1'));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Inspection-approved qty: 40 m2 (40%)');
    expect(dialog.textContent).toContain('INSPECTION-BACKED VALUE');
    expect(dialog.textContent).toContain('SAR 400');
    expect(dialog.textContent).toContain('Stored inspection-approved quantity: 40 of 100 m2, capped at contract. Measurement and commercial review remain separate.');
    expect(dialog.textContent).toContain('NCR-B');
    expect(dialog.textContent).toContain('WIR-B2');
    const note = within(dialog).getByPlaceholderText(/display-only/);
    fireEvent.change(note, { target: { value: 'Draft review only' } });
    expect(note.value).toBe('Draft review only');
    expect(dialog.textContent).toContain('notes are not saved');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(roomRow('B1'));
    expect(screen.getByPlaceholderText(/display-only/).value).toBe('');
  });

  it.each(['en', 'ar'])('localizes measurement suggestions without renaming genuine certification (%s)', async (lang) => {
    listWirs.mockResolvedValue([{ id: 'wa', boq_item_id: 'a', result: 'Approved', approved_qty: 5 }]);
    countAttachmentsByRecord.mockResolvedValue({ wa: 1 });
    await openRoom(lang);
    const instruction = lang === 'ar' ? 'أعد القياس وطابق الكمية المعتمدة بالفحص مع الكمية المطالب بها' : 'Re-measure; reconcile inspection-approved vs claimed quantity';
    expect(screen.getAllByText(instruction).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`A1.*${instruction}`) }));
    expect(screen.getByRole('dialog').textContent).toContain(instruction);
    expect(document.body.textContent).not.toMatch(overclaims);
  });

  it('Arabic keeps the same commercial boundary, quantities, statuses and recorded IPCs', async () => {
    await openRoom('ar', { onNavigate: vi.fn() });
    expect(screen.getByRole('button', { name: /^رصيد استرشادي بعد المستخلصات/ }).textContent).toContain('SAR 2,700');
    expect(screen.getByRole('columnheader', { name: 'القيمة المستندة إلى الفحص' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^لا إشارة عائق/ }).textContent).toContain('SAR 1,000');
    expect(roomRow('B1').textContent).toContain('يتطلب مراجعة تجارية');
    expect(roomRow('B1').textContent).toContain('بدون تغطية فحص');
    expect(screen.getByText('شهادات معتمدة بانتظار الدفع').closest('button')).toBeNull();
    fireEvent.click(roomRow('B1'));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('الكمية المعتمدة بالفحص: 40 m2 (40%)');
    expect(dialog.textContent).toContain('يظل القياس والمراجعة التجارية خطوتين منفصلتين');
    expect(document.body.textContent).not.toMatch(overclaims);
  });

  it('unknown evidence never becomes a certified or verified-complete statement', async () => {
    countAttachmentsByRecord.mockRejectedValue(new Error('index unavailable'));
    await openRoom('en', { onNavigate: vi.fn() });
    expect(screen.getByText(/evidence index unavailable — status unknown/)).toBeTruthy();
    // Same legacy predicate: E1 moves from partial to ready when gaps are unknown.
    const signal = screen.getByRole('button', { name: /^No blocker signal/ });
    expect(signal.textContent).toContain('2 lines');
    expect(signal.textContent).toContain('SAR 2,000');
    expect(screen.getByText(/Signals reflect loaded records only/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Inspection evidence complete|Ready to certify|Eligible value/);
  });

  it.each(['en', 'ar'])('an empty blocker queue does not promise certifiability (%s)', async (lang) => {
    listBoqItems.mockResolvedValue([{ id: 'a', code: 'A1', unit: 'm3', qty: 10, rate: 100, approved_qty: 10 }]);
    render(<CertificationControlRoomView lang={lang} onNavigate={vi.fn()} />);
    const empty = lang === 'ar'
      ? 'لا توجد بنود تبلغ حد العوائق في هذه القائمة. تظل المراجعة التجارية مطلوبة.'
      : 'No lines meet this queue’s blocker threshold. Commercial review is still required.';
    expect(await screen.findByText(empty)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(overclaims);
  });

  it('keeps the established route and real shared derivation contract', () => {
    const shell = readSource('../../AppShell.jsx');
    expect(shell).toContain("route === 'certification-control-room' && <CertificationControlRoomView");
    const view = readSource('./CertificationControlRoomView.jsx');
    expect(view).toContain("from '../../lib/controlRoom.js'");
    expect(view).toContain('deriveControlRoom(inputs)');
    expect(view).not.toMatch(/certify_ipc|\.update\(|\.insert\(/);
  });
});

// ── Master-detail contract (UX loop 2) ──────────────────────
// The Control Room is the live certification queue. Reviewing a line must not
// cost the operator the queue: the row stays marked, the table stays behind,
// and Escape returns them exactly where they were.
describe('CertificationControlRoomView — line review keeps the queue', () => {
  it('opens a line dossier in the shared Drawer, marks the row, and closes on Escape', async () => {
    render(<CertificationControlRoomView lang="en" />);
    await waitFor(() => expect(screen.getByText('Blocked Value Queue')).toBeTruthy());

    // No dossier until a line is chosen.
    expect(screen.queryByRole('dialog')).toBeNull();

    const row = document.querySelector('tbody tr');
    expect(row).toBeTruthy();
    fireEvent.click(row);

    // Drawer is the shared primitive: a labelled dialog over a light backdrop.
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(screen.getByTestId('drawer-backdrop').style.background).toContain('0.18');

    // The queue behind is still rendered — this is master-detail, not navigation.
    expect(screen.getByText('Blocked Value Queue')).toBeTruthy();
    // ...and the row the operator opened is visibly the selected one.
    expect(document.querySelector('tbody tr[aria-selected="true"]')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.querySelector('tbody tr[aria-selected="true"]')).toBeNull();
    expect(screen.getByText('Blocked Value Queue')).toBeTruthy();
  });
});
