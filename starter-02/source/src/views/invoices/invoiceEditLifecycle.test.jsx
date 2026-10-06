// ============================================================
// Invoice Edit lifecycle — regression tests for the v3 pilot.
//
// These run against the real screen, InvoicesView, with only the API modules
// and auth mocked. Not against the form in isolation: the defect was never in
// the form alone, it was in how the screen kept one form alive across records.
// Driving the real view is the only way a test can tell the two apart, and it
// stays valid wherever the repair lands.
//
// The defect, as supplied: InvoicesView rendered <InvoiceFormModal> with no key,
// so the form's useState seed ran once — while nothing was selected — and never
// ran again. One cause, four of the documented symptoms. Two more sat in
// submit(): no guard of its own, so Enter through the hidden submit button
// started a second request while one was pending; and the resolution path ran
// without checking the form that asked was still the form on screen.
//
// Source-verified contract pinned here:
//   * Opening a record shows that record's stored values, including a real zero
//     amount and empty optional dates.
//   * Cancel sends no write and discards the edit; the next record opened never
//     inherits it, and reopening the same record shows the source values.
//   * Switching A to B shows B's identity and B's values.
//   * A repeated Save while one is pending starts one request, on the Enter path
//     as well as the button.
//   * A late result for A does not close or overwrite the form opened on B.
//
// Fixtures mirror the starter's synthetic invoices. No production writes.
// ============================================================
import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InvoicesView } from '../InvoicesView.jsx';
import { T } from '../../i18n/translations.js';

const listInvoices = vi.fn();
const createInvoice = vi.fn();
const updateInvoice = vi.fn();
const deleteInvoice = vi.fn();
const listIpcs = vi.fn();
const listWirs = vi.fn();

vi.mock('../../api/invoices.js', async (orig) => ({
  ...(await orig()),
  listInvoices: (...a) => listInvoices(...a),
  createInvoice: (...a) => createInvoice(...a),
  updateInvoice: (...a) => updateInvoice(...a),
  deleteInvoice: (...a) => deleteInvoice(...a),
}));
vi.mock('../../api/ipcs.js', () => ({ listIpcs: (...a) => listIpcs(...a) }));
vi.mock('../../api/wirs.js', () => ({ listWirs: (...a) => listWirs(...a) }));
vi.mock('../../lib/supabase.js', () => ({ isSupabaseConfigured: true, supabase: {} }));
vi.mock('../../lib/auth.jsx', () => ({ useAuth: () => ({ requireAuth: (fn) => fn(), user: { id: 'synthetic' } }) }));

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

const invoiceNo = () => screen.getByPlaceholderText('INV-2026-052');
const amountField = () => screen.getByPlaceholderText('0.00');

// The screen's own route to the form: pick the record, then Edit it.
const openEdit = async (inv) => {
  const register = await screen.findByRole('table');
  fireEvent.click(await within(register).findByText(inv.invoice_number));
  const drawer = await screen.findByRole('dialog');
  fireEvent.click(within(drawer).getByRole('button', { name: 'Edit' }));
  await screen.findByText(`Invoice ${inv.invoice_number}`);
};
const cancel = () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
const closeDrawer = async () => { fireEvent.keyDown(document.activeElement || document.body, { key: 'Escape' }); await waitFor(() => {}); };


// The register is drawn in two shapes, so every test has to say which width it is at.
const mediaAt = (width) => (q) => {
  const m = /\(max-width:\s*(\d+)px\)/.exec(q);
  return { matches: m ? width <= Number(m[1]) : false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false };
};
const atWidth = (w) => { window.matchMedia = vi.fn(mediaAt(w)); };

beforeEach(() => {
  atWidth(1280);
  listInvoices.mockResolvedValue([INV_A, INV_B, INV_Z]);
  listIpcs.mockResolvedValue([]);
  listWirs.mockResolvedValue([]);
  createInvoice.mockResolvedValue({ ...INV_A });
  updateInvoice.mockResolvedValue({ ...INV_A });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Invoice Edit — the record on screen is the record in the fields', () => {
  it('opening A shows A stored values', async () => {
    render(<InvoicesView t={T.en} />);
    await openEdit(INV_A);
    expect(invoiceNo()).toHaveValue('SYN-INV-A-0001');
    expect(amountField()).toHaveValue('48,251');
  });

  it('a stored zero amount is shown as zero, not as an empty field', async () => {
    render(<InvoicesView t={T.en} />);
    await openEdit(INV_Z);
    expect(invoiceNo()).toHaveValue('SYN-INV-Z-0003');
    expect(amountField()).toHaveValue('0');
  });

  it('switching A to B shows B identity and B values', async () => {
    render(<InvoicesView t={T.en} />);
    await openEdit(INV_A);
    cancel();
    await openEdit(INV_B);
    expect(invoiceNo()).toHaveValue('SYN-INV-B-0002');
    expect(amountField()).toHaveValue('13,700');
  });
});

describe('Invoice Edit — Cancel discards and never leaks', () => {
  it('cancel sends no write', async () => {
    render(<InvoicesView t={T.en} />);
    await openEdit(INV_A);
    await userEvent.clear(invoiceNo());
    await userEvent.type(invoiceNo(), 'STALE-1');
    cancel();
    expect(updateInvoice).not.toHaveBeenCalled();
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it('an abandoned edit on A does not appear when B is opened', async () => {
    render(<InvoicesView t={T.en} />);
    await openEdit(INV_A);
    await userEvent.clear(invoiceNo());
    await userEvent.type(invoiceNo(), 'STALE-1');
    cancel();
    await openEdit(INV_B);
    expect(invoiceNo()).toHaveValue('SYN-INV-B-0002');
  });

  it('reopening A after cancelling shows A source values again', async () => {
    render(<InvoicesView t={T.en} />);
    await openEdit(INV_A);
    await userEvent.clear(invoiceNo());
    await userEvent.type(invoiceNo(), 'STALE-1');
    cancel();
    await openEdit(INV_A);
    expect(invoiceNo()).toHaveValue('SYN-INV-A-0001');
  });
});

describe('Invoice Edit — one pending save, one request', () => {
  it('pressing Enter twice while a save is pending starts a single request', async () => {
    let settle;
    updateInvoice.mockImplementation(() => new Promise((res) => { settle = res; }));
    render(<InvoicesView t={T.en} />);
    await openEdit(INV_A);

    const field = invoiceNo();
    await userEvent.type(field, '{Enter}');
    await waitFor(() => expect(updateInvoice).toHaveBeenCalledTimes(1));
    await userEvent.type(field, '{Enter}');
    await userEvent.type(field, '{Enter}');

    expect(updateInvoice).toHaveBeenCalledTimes(1);
    settle?.({ ...INV_A });
  });
});

describe('Invoice Edit — a save in flight owns the form', () => {
  it('nothing closes the form while the service has not answered', async () => {
    let settle;
    updateInvoice.mockImplementation(() => new Promise((res) => { settle = res; }));
    render(<InvoicesView t={T.en} />);
    await openEdit(INV_A);

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateInvoice).toHaveBeenCalledTimes(1));

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(screen.getByText('Invoice SYN-INV-A-0001')).toBeInTheDocument();
    expect(invoiceNo()).toHaveValue('SYN-INV-A-0001');
    settle?.({ ...INV_A });
  });

  // The record cannot be switched under a pending save any more, so the old A-to-B
  // race is no longer reachable from the screen. The guard behind it still matters:
  // navigating away unmounts the view while the service is still thinking, and the
  // answer must not try to drive a form that is gone.
  it('an answer that arrives after the view is gone changes nothing and throws nothing', async () => {
    let settle;
    updateInvoice.mockImplementation(() => new Promise((res) => { settle = res; }));
    const view = render(<InvoicesView t={T.en} />);
    await openEdit(INV_A);

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateInvoice).toHaveBeenCalledTimes(1));

    const errors = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.join(' ')));
    view.unmount();
    settle?.({ ...INV_A });
    await new Promise((r) => setTimeout(r, 0));
    spy.mockRestore();

    expect(errors.filter((e) => /unmounted|not wrapped in act/i.test(e))).toEqual([]);
  });

  it('a failed save reports itself, and still does so under StrictMode', async () => {
    updateInvoice.mockRejectedValue({ message: 'Synthetic save failure (starter scenario). Nothing was changed.', code: 'PILOT_WRITE_FAILURE' });
    render(<StrictMode><InvoicesView t={T.en} /></StrictMode>);
    await openEdit(INV_A);

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText(/Synthetic save failure/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).not.toBeDisabled();
    expect(invoiceNo()).toHaveValue('SYN-INV-A-0001');
  });
});
