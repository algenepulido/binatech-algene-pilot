// ============================================================
// Invoice Edit lifecycle — regression tests for the v3 pilot.
//
// These tests pin the accepted v3 behaviour. They FAIL on the supplied
// starter and must pass after the repair. They are written against the
// parent/child arrangement the application actually uses, not against a
// convenient one, because the defect lives in that arrangement:
//
//   InvoicesView.jsx:217 renders <InvoiceFormModal open initial={editing} />
//   permanently, with no key. InvoiceForm.jsx:42-47 seeds its form state with
//   useState(...initial...), so the seed runs once on first render — while
//   `editing` is still null — and never re-seeds when `initial` changes.
//
// The harness below reproduces exactly that: one permanently mounted modal
// whose `initial` prop is swapped, starting from null. A fix is therefore free
// to land in either file (a key on the parent, or prop synchronisation in the
// child) and these tests stay valid.
//
// Source-verified contract pinned here:
//   * Opening a record shows that record's stored values, including a real
//     zero amount and empty optional dates (SYN-INV-Z-0003).
//   * Cancel sends no write and discards the abandoned edits; the next record
//     opened never inherits them.
//   * Switching A to B shows B's identity and B's values.
//   * A repeated Save while one is pending starts only one request. The Save
//     button carries disabled={busy} (InvoiceForm.jsx:186), but submit() has no
//     guard of its own and the form also submits on Enter
//     (InvoiceForm.jsx:189 with the hidden submit button at :285), so the
//     button's disabled state is not the control that satisfies this.
//   * A late result for A does not close or overwrite the form opened on B.
//
// Fixtures mirror the starter's synthetic invoices. No production writes, no
// real services: the invoice and WIR API modules are mocked.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InvoiceFormModal } from './InvoiceForm.jsx';

const listInvoices = vi.fn();
const createInvoice = vi.fn();
const updateInvoice = vi.fn();
const listWirs = vi.fn();

vi.mock('../../api/invoices.js', async (orig) => ({
  ...(await orig()),
  listInvoices: (...a) => listInvoices(...a),
  createInvoice: (...a) => createInvoice(...a),
  updateInvoice: (...a) => updateInvoice(...a),
}));
vi.mock('../../api/wirs.js', () => ({ listWirs: (...a) => listWirs(...a) }));

const INV_A = {
  id: 'inv-a', invoice_number: 'SYN-INV-A-0001', amount: 48251,
  issue_date: '2026-08-10', due_date: '2026-09-09', paid_date: '',
  zatca_status: 'Reported', payment_status: 'Pending',
  wir_number: 'SYN-WIR-0002', element_guid: '',
};
const INV_B = {
  id: 'inv-b', invoice_number: 'SYN-INV-B-0002', amount: 13700,
  issue_date: '2026-09-01', due_date: '2026-10-01', paid_date: '2026-09-20',
  zatca_status: 'Cleared', payment_status: 'Paid',
  wir_number: '', element_guid: 'syn-el-06',
};
const INV_Z = {
  id: 'inv-z', invoice_number: 'SYN-INV-Z-0003', amount: 0,
  issue_date: '', due_date: '', paid_date: '',
  zatca_status: 'Awaiting IPC', payment_status: 'Not Issued',
  wir_number: '', element_guid: '',
};

// The application's arrangement: mounted once, `initial` swapped, never keyed.
function Harness({ onSaved = () => {} }) {
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState(null);
  return (
    <>
      <button type="button" onClick={() => { setInitial(INV_A); setOpen(true); }}>open-a</button>
      <button type="button" onClick={() => { setInitial(INV_B); setOpen(true); }}>open-b</button>
      <button type="button" onClick={() => { setInitial(INV_Z); setOpen(true); }}>open-z</button>
      <InvoiceFormModal
        open={open}
        initial={initial}
        onClose={() => setOpen(false)}
        onSaved={onSaved}
      />
    </>
  );
}

const invoiceNo = () => screen.getByPlaceholderText('INV-2026-052');
const amountField = () => screen.getByPlaceholderText('0.00');
const openRecord = async (which) => {
  fireEvent.click(screen.getByText(`open-${which}`));
  await screen.findByText(new RegExp(`^Invoice SYN-INV-${which.toUpperCase()}-`));
};

beforeEach(() => {
  listInvoices.mockResolvedValue([INV_A, INV_B, INV_Z]);
  listWirs.mockResolvedValue([]);
  createInvoice.mockResolvedValue({ ...INV_A });
  updateInvoice.mockResolvedValue({ ...INV_A });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Invoice Edit — the record on screen is the record in the fields', () => {
  it('opening A shows A stored values', async () => {
    render(<Harness />);
    await openRecord('a');
    expect(invoiceNo()).toHaveValue('SYN-INV-A-0001');
    expect(amountField()).toHaveValue('48251');
  });

  it('a stored zero amount is shown as zero, not as an empty field', async () => {
    render(<Harness />);
    await openRecord('z');
    expect(invoiceNo()).toHaveValue('SYN-INV-Z-0003');
    expect(amountField()).toHaveValue('0');
  });

  it('switching A to B shows B identity and B values', async () => {
    render(<Harness />);
    await openRecord('a');
    fireEvent.click(screen.getByText('open-b'));
    await screen.findByText(/^Invoice SYN-INV-B-0002/);
    expect(invoiceNo()).toHaveValue('SYN-INV-B-0002');
    expect(amountField()).toHaveValue('13700');
  });
});

describe('Invoice Edit — Cancel discards and never leaks', () => {
  it('cancel sends no write', async () => {
    render(<Harness />);
    await openRecord('a');
    await userEvent.clear(invoiceNo());
    await userEvent.type(invoiceNo(), 'STALE-1');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(updateInvoice).not.toHaveBeenCalled();
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it('an abandoned edit on A does not appear when B is opened', async () => {
    render(<Harness />);
    await openRecord('a');
    await userEvent.clear(invoiceNo());
    await userEvent.type(invoiceNo(), 'STALE-1');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByText('open-b'));
    await screen.findByText(/^Invoice SYN-INV-B-0002/);
    expect(invoiceNo()).toHaveValue('SYN-INV-B-0002');
  });

  it('reopening A after cancelling shows A source values again', async () => {
    render(<Harness />);
    await openRecord('a');
    await userEvent.clear(invoiceNo());
    await userEvent.type(invoiceNo(), 'STALE-1');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await openRecord('a');
    expect(invoiceNo()).toHaveValue('SYN-INV-A-0001');
  });
});

describe('Invoice Edit — one pending save, one request', () => {
  it('pressing Enter twice while a save is pending starts a single request', async () => {
    let settle;
    updateInvoice.mockImplementation(() => new Promise((res) => { settle = res; }));
    render(<Harness />);
    await openRecord('a');

    // Give the field a value of its own, so this test is about the pending
    // guard rather than about the seeding defect: submit() returns early on an
    // empty Invoice No. (InvoiceForm.jsx:142).
    const field = invoiceNo();
    await userEvent.clear(field);
    await userEvent.type(field, 'SYN-INV-A-0001');

    await userEvent.type(field, '{Enter}');
    await waitFor(() => expect(updateInvoice).toHaveBeenCalledTimes(1));
    await userEvent.type(field, '{Enter}');
    await userEvent.type(field, '{Enter}');

    expect(updateInvoice).toHaveBeenCalledTimes(1);
    settle?.({ ...INV_A });
  });
});

describe('Invoice Edit — a late answer belongs to the record that asked', () => {
  it('a late result for A does not close the form opened on B', async () => {
    let settleA;
    updateInvoice.mockImplementation(() => new Promise((res) => { settleA = res; }));
    render(<Harness />);
    await openRecord('a');

    // As above: a value of its own, so the save actually starts.
    await userEvent.clear(invoiceNo());
    await userEvent.type(invoiceNo(), 'SYN-INV-A-0001');

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateInvoice).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('open-b'));
    await screen.findByText(/^Invoice SYN-INV-B-0002/);

    settleA?.({ ...INV_A });
    await new Promise((r) => setTimeout(r, 0));

    expect(
      screen.queryByText(/^Invoice SYN-INV-B-0002/),
      'the form opened on B must still be open after a late result for A',
    ).toBeInTheDocument();
    expect(invoiceNo()).toHaveValue('SYN-INV-B-0002');
  });
});
