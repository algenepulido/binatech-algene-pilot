import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { CertificationQueueView } from './CertificationQueueView.jsx';

// Real loader and shared derivation; only external reads are replaced. These
// hand-calculated records prove that inspection quantities never earn a
// commercial-eligibility label, even at 100% or alongside a genuine hold.
const listBoqItems = vi.fn();
const listWirs = vi.fn();
vi.mock('../../api/boqItems.js', async (original) => ({ ...(await original()), listBoqItems: (...a) => listBoqItems(...a) }));
vi.mock('../../api/elementBoqLinks.js', () => ({ listAllLinks: async () => [
  { boq_item_id: 'a', element_guid: 'ga' },
  { boq_item_id: 'b', element_guid: 'gb1' }, { boq_item_id: 'b', element_guid: 'gb2' },
  { boq_item_id: 'c', element_guid: 'gc' }, { boq_item_id: 'd', element_guid: 'gd' },
  { boq_item_id: 'e', element_guid: 'ge' },
] }));
vi.mock('../../api/wirs.js', () => ({ listWirs: (...a) => listWirs(...a) }));
vi.mock('../../api/ncrs.js', () => ({ listNcrs: async () => [{ id: 'n1', status: 'open', element_guid: 'gb2' }] }));
vi.mock('../../api/ipcs.js', () => ({ listIpcs: async () => [{ id: 'p1', status: 'certified', gross_amount: 500 }] }));
vi.mock('../../lib/elementStatus.js', () => ({ loadElementStatusMap: async () => ({
  ga: { key: 'approved' }, gb1: { key: 'approved' }, gb2: { key: 'ncr' },
  gc: { key: 'in_progress' }, gd: { key: 'approved' }, ge: { key: 'approved' },
}) }));
vi.mock('../../lib/attachments.js', () => ({ countAttachmentsByRecord: async () => ({ w1: 2, w2: 1, w4: 1, w6: 1 }) }));

beforeEach(() => {
  listBoqItems.mockReset().mockResolvedValue([
    { id: 'a', code: 'A1', description: 'Concrete', unit: 'm3', qty: 10, rate: 100, approved_qty: 10 },
    { id: 'b', code: 'B1', description: 'Blockwork', unit: 'm2', qty: 100, rate: 10, approved_qty: 40 },
    { id: 'c', code: 'C1', description: 'Steel', unit: 'ton', qty: 10, rate: 500, approved_qty: 0 },
    { id: 'd', code: 'D1', description: 'Paint', unit: 'm2', qty: 10, rate: 100, approved_qty: 10 },
    { id: 'e', code: 'E1', description: 'Joints', unit: 'm', qty: 10, rate: 100, approved_qty: 10 },
    { id: 'f', code: 'F1', description: 'Unstarted', unit: 'm', qty: 4, rate: 100, approved_qty: 0 },
    { id: 'g', code: 'G1', description: 'Zero-rate inspection', unit: 'm', qty: 4, rate: 0, approved_qty: 4 },
  ]);
  listWirs.mockReset().mockResolvedValue([
    { id: 'w1', wir_number: 'WIR-A', boq_item_id: 'a', result: 'Approved', approved_qty: 10 },
    { id: 'w2', wir_number: 'WIR-B', boq_item_id: 'b', result: 'Approved', approved_qty: 40 },
    { id: 'w3', wir_number: 'WIR-B2', boq_item_id: 'b', result: 'Pending', approved_qty: 20 },
    { id: 'w4', wir_number: 'WIR-D', boq_item_id: 'd', result: 'Approved', approved_qty: 14 },
    { id: 'w5', wir_number: 'WIR-E', boq_item_id: 'e', result: 'Approved', approved_qty: 10 },
    { id: 'w6', wir_number: 'WIR-G', boq_item_id: 'g', result: 'Approved', approved_qty: 4 },
  ]);
});

async function open(lang = 'en', props = {}) {
  render(<CertificationQueueView lang={lang} {...props} />);
  await screen.findByRole('table');
}
const row = (code) => screen.getByText(code).closest('tr');
const cells = (code) => within(row(code)).getAllByRole('cell').map((c) => c.textContent.trim());
const rowCodes = () => [...document.querySelectorAll('tbody tr')].map((r) => r.firstElementChild.textContent);
const forbidden = /Eligible qty|Eligible value|Eligible now|Partly eligible|Not yet eligible|مؤهل/i;

describe('ACC-R1 · inspection-backed figures are not commercial eligibility', () => {
  it('labels the unchanged quantity/value columns and total by their inspection basis', async () => {
    await open();
    expect(screen.getByRole('columnheader', { name: 'Inspection-approved qty' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Inspection-backed value' })).toBeTruthy();
    const total = screen.getByText('INSPECTION-BACKED VALUE').parentElement;
    expect(total.textContent).toContain('SAR 3,400');
    expect(screen.getByText(/Inspection-approved quantity × rate/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(forbidden);
  });
  it('100% inspection approval has only a limited no-blocker signal, not an entitlement', async () => {
    await open();
    expect(cells('A1').slice(6, 9)).toEqual(['10', '1,000', '0']);
    expect(row('A1').textContent).toContain('No blocker signal');
    expect(row('A1').textContent).not.toMatch(/eligible|ready|certified|payable/i);
  });
  it('partial approval with NCR/pending quantities keeps its holds and exact values', async () => {
    await open();
    expect(cells('B1').slice(6, 9)).toEqual(['40', '400', '60']);
    expect(row('B1').textContent).toContain('Commercial review required');
    fireEvent.click(row('B1'));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('NCR hold');
    expect(dialog.textContent).toContain('WIR awaiting approval');
    expect(dialog.textContent).toContain('SAR 100');
    expect(dialog.textContent).not.toMatch(forbidden);
  });
  it('full approval with missing evidence does not claim partial quantity or readiness', async () => {
    await open();
    expect(cells('E1').slice(6, 9)).toEqual(['10', '1,000', '0']);
    expect(row('E1').textContent).toContain('Commercial review required');
    expect(row('E1').textContent).toContain('Evidence gap');
    expect(row('E1').textContent).not.toMatch(/Partially inspection-backed|ready|eligible/i);
  });
  it('zero approval and separate overclaim review keep their existing dominant statuses', async () => {
    await open();
    expect(cells('C1').slice(6, 9)).toEqual(['0', '0', '10']);
    expect(row('C1').textContent).toContain('Blocked');
    expect(row('C1').textContent).toContain('No WIR coverage');
    expect(row('F1').textContent).toContain('Not started');
    expect(row('D1').textContent).toContain('Review needed');
    expect(row('D1').textContent).toContain('Overclaim above contract');
  });
  it('the low-value filter remains value-based, including positive inspection qty at zero rate', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: /Inspection-backed value < SAR 0.50/ }));
    expect(rowCodes()).toEqual(['C1', 'F1', 'G1']);
    expect(cells('G1').slice(6, 9)).toEqual(['4', '0', '0']);
    expect(document.body.textContent).not.toMatch(/No inspection-approved qty|No eligible qty/);
  });
  it('preserves shared-engine ordering, partial filter, search, scoped totals and refresh', async () => {
    await open();
    expect(rowCodes()).toEqual(['C1', 'B1', 'A1', 'D1', 'E1', 'F1', 'G1']);
    fireEvent.click(screen.getByRole('button', { name: /^Commercial review required 2$/ }));
    expect(rowCodes()).toEqual(['B1', 'E1']);
    expect(document.querySelector('tfoot').textContent).toContain('1,400');
    expect(document.querySelector('tfoot').textContent).toContain('Filtered lines only');
    fireEvent.change(screen.getByPlaceholderText('Search code or description…'), { target: { value: 'joints' } });
    expect(rowCodes()).toEqual(['E1']);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(rowCodes()).toEqual(['B1', 'E1']);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByRole('table');
    expect(listBoqItems).toHaveBeenCalledTimes(2);
  });
  it('drawer shows the reviewed values, remains read-only and preserves BoQ/WIR navigation', async () => {
    const nav = vi.fn(); await open('en', { onNavigate: nav });
    fireEvent.click(row('A1'));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Inspection-approved qty');
    expect(dialog.textContent).toContain('Inspection-backed value');
    expect(dialog.textContent).toContain('SAR 1,000');
    expect(dialog.textContent).toContain('No blocker signal in the loaded records — not an all-clear.');
    expect(dialog.textContent).toContain('WIR-A');
    for (const name of [/^certify/i, /^approve/i, /^pay/i]) expect(within(dialog).queryByRole('button', { name })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open BoQ' }));
    expect(nav).toHaveBeenLastCalledWith('qs');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open WIRs' }));
    expect(nav).toHaveBeenLastCalledWith('wirs');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('Arabic preserves the same inspection-only meaning, values and blocker-led review', async () => {
    await open('ar');
    expect(screen.getByRole('columnheader', { name: 'الكمية المعتمدة بالفحص' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'القيمة المستندة إلى الفحص' })).toBeTruthy();
    expect(document.querySelector('[dir="rtl"]')).toBeTruthy();
    expect(row('A1').textContent).toContain('لا إشارة عائق');
    expect(row('E1').textContent).toContain('يتطلب مراجعة تجارية');
    expect(row('E1').textContent).toContain('فجوة أدلة');
    expect(cells('A1').slice(6, 9)).toEqual(['10', '1,000', '0']);
    fireEvent.click(row('A1'));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('الكمية المعتمدة بالفحص');
    expect(dialog.textContent).toContain('القيمة المستندة إلى الفحص');
    expect(document.body.textContent).not.toMatch(forbidden);
  });
  it.each(['en', 'ar'])('measurement-review suggestions retain the action without calling inspection quantity certifiable (%s)', async (lang) => {
    listWirs.mockResolvedValue([{ id: 'w1', wir_number: 'WIR-A', boq_item_id: 'a', result: 'Approved', approved_qty: 5 }]);
    await open(lang);
    fireEvent.click(row('A1'));
    const dialog = screen.getByRole('dialog');
    const instruction = lang === 'ar'
      ? 'أعد القياس وطابق الكمية المعتمدة بالفحص مع الكمية المطالب بها'
      : 'Re-measure; reconcile inspection-approved vs claimed quantity';
    expect(within(dialog).getAllByText(instruction)).toHaveLength(2);
    expect(dialog.textContent).not.toMatch(/certifiable|القابل للاعتماد/);
  });
});
