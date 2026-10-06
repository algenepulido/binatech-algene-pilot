// ============================================================
// Invoice register — the four states stay four states.
//
// The approved frames list the register's loading, genuinely empty and
// read-error states separately, and the read-error one carries Try again.
// The rule behind that is the client's own: a failed read must never be
// dressed up as an empty register. An empty register says there is nothing
// to invoice. A failed read says nothing at all, and the two must not look
// alike, because one of them is a reason to act.
//
// As supplied, a failed read printed the service's own error string with no
// role, no explanation and no way back. These tests pin the replacement.
//
// Source-verified contract pinned here:
//   * A read failure announces itself, says no invoices are listed and why,
//     and offers Try again. No table is rendered.
//   * Try again re-reads, and a register that comes back renders normally.
//   * A genuinely empty read is the empty state, not the error state.
//   * The register's closing note about what the status columns mean appears
//     only with rows, never over a failure or an empty register.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { InvoicesView } from '../InvoicesView.jsx';
import { T } from '../../i18n/translations.js';

const listInvoices = vi.fn();
const listIpcs = vi.fn();
const listWirs = vi.fn();

vi.mock('../../api/invoices.js', async (orig) => ({ ...(await orig()), listInvoices: (...a) => listInvoices(...a) }));
vi.mock('../../api/ipcs.js', () => ({ listIpcs: (...a) => listIpcs(...a) }));
vi.mock('../../api/wirs.js', () => ({ listWirs: (...a) => listWirs(...a) }));
vi.mock('../../lib/supabase.js', () => ({ isSupabaseConfigured: true, supabase: {} }));
vi.mock('../../lib/auth.jsx', () => ({ useAuth: () => ({ requireAuth: (fn) => fn(), user: { id: 'synthetic' } }) }));

const ONE = [{
  id: 'inv-a', invoice_number: 'SYN-INV-A-0001', amount: 48250.5,
  issue_date: '2026-08-10', due_date: '2026-09-09', paid_date: '',
  zatca_status: 'Reported', payment_status: 'Pending', wir_number: 'SYN-WIR-0002', element_guid: '',
}];
const CLOSING_NOTE = /Nothing here certifies an invoice/;

beforeEach(() => { listIpcs.mockResolvedValue([]); listWirs.mockResolvedValue([]); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Invoice register — a failed read is never an empty register', () => {
  it('a read failure announces itself, explains, and offers Try again', async () => {
    listInvoices.mockRejectedValue(new Error('Synthetic read failure for invoices (starter scenario)'));
    render(<InvoicesView t={T.en} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not be loaded/i);
    expect(alert).toHaveTextContent(/not an empty register/i);
    expect(screen.getByRole('button', { name: /Try again/i })).toBeInTheDocument();
    expect(document.querySelector('table')).toBeNull();
  });

  it('the service own error string is not what the reader is shown', async () => {
    listInvoices.mockRejectedValue(new Error('Synthetic read failure for invoices (starter scenario)'));
    render(<InvoicesView t={T.en} />);
    await screen.findByRole('alert');
    expect(document.body.textContent).not.toMatch(/Synthetic read failure/);
  });

  it('Try again re-reads, and a register that comes back renders', async () => {
    listInvoices.mockRejectedValueOnce(new Error('read failed')).mockResolvedValue(ONE);
    render(<InvoicesView t={T.en} />);
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('button', { name: /Try again/i }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(await screen.findByText('SYN-INV-A-0001')).toBeInTheDocument();
    expect(listInvoices).toHaveBeenCalledTimes(2);
  });

  it('a genuinely empty read is the empty state, not the error state', async () => {
    listInvoices.mockResolvedValue([]);
    render(<InvoicesView t={T.en} />);
    expect(await screen.findByText(/No client invoices yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: /Try again/i })).toBeNull();
  });
});

describe('Invoice register — the closing note belongs to the data', () => {
  it('appears with rows', async () => {
    listInvoices.mockResolvedValue(ONE);
    render(<InvoicesView t={T.en} />);
    await screen.findByText('SYN-INV-A-0001');
    expect(document.body.textContent).toMatch(CLOSING_NOTE);
  });

  it('does not appear over a failed read or an empty register', async () => {
    listInvoices.mockRejectedValue(new Error('read failed'));
    const first = render(<InvoicesView t={T.en} />);
    await screen.findByRole('alert');
    expect(document.body.textContent).not.toMatch(CLOSING_NOTE);
    first.unmount();

    listInvoices.mockResolvedValue([]);
    render(<InvoicesView t={T.en} />);
    await screen.findByText(/No client invoices yet/i);
    expect(document.body.textContent).not.toMatch(CLOSING_NOTE);
  });
});

describe('Invoice register — the amount keeps what is stored', () => {
  it('a stored 48250.5 is shown to the riyal, not rounded away', async () => {
    listInvoices.mockResolvedValue(ONE);
    render(<InvoicesView t={T.en} />);
    await screen.findByText('SYN-INV-A-0001');
    expect(screen.getByText('48,250.50')).toBeInTheDocument();
    expect(screen.queryByText('48,251')).toBeNull();
  });

  it('dates read as day month year, and a missing date is a dash', async () => {
    listInvoices.mockResolvedValue(ONE);
    render(<InvoicesView t={T.en} />);
    await screen.findByText('SYN-INV-A-0001');
    expect(screen.getByText('10 Aug 2026')).toBeInTheDocument();
    expect(screen.getByText('09 Sep 2026')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});
