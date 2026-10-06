// ============================================================
// Progress composer — the three jobs the test service deliberately leaves here.
//
// The service correlates an answer with a request and nothing else. It does not
// de-duplicate, it does not retry, and it does not care which screen is open
// when it answers. So the composer has to stop a second send while one is
// pending, keep everything on a refusal, and ignore an answer that no longer
// belongs to what the reporter is looking at.
//
// Also pinned: the report is the reporter's own statement. Nothing is
// pre-selected for them, the description is sent exactly as typed, and the
// acknowledgement says only what the service actually promises.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { StrictMode } from 'react';
import { ProgressComposer } from './ProgressComposer.jsx';
import { ACK_NOTE } from '../../pilot/progressReports.js';

const submitProgressReport = vi.fn();
vi.mock('../../pilot/progressReports.js', async (orig) => ({
  ...(await orig()),
  submitProgressReport: (...a) => submitProgressReport(...a),
}));

const receipt = (requestId, projectId) => ({
  ok: true, simulated: true, requestId, projectId, reference: null,
  receipt: { id: 'TEST-RECEIPT-0001', receivedAt: '2026-10-07T00:00:00.000Z', photoCount: 0, note: ACK_NOTE },
});

const describeIt = (text, status = 'in_progress') => {
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: text } });
  fireEvent.click(document.querySelector(`[data-progress-status="${status}"]`));
};
const review = () => fireEvent.click(document.querySelector('[data-progress-review]'));
const send = () => fireEvent.click(document.querySelector('[data-progress-send]'));

beforeEach(() => { submitProgressReport.mockReset(); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Progress composer — the report is the reporter own statement', () => {
  it('opens with no status chosen and no reference, and will not review an empty report', () => {
    render(<ProgressComposer />);
    for (const el of document.querySelectorAll('[data-progress-status]')) {
      expect(el.getAttribute('aria-pressed')).toBe('false');
    }
    expect(document.querySelector('[data-progress-reference]').value).toBe('none');
    expect(document.querySelector('[data-progress-review]')).toBeDisabled();
  });

  it('sends the description exactly as typed, spaces and all', async () => {
    submitProgressReport.mockImplementation((r) => Promise.resolve(receipt(r.requestId, r.projectId)));
    render(<ProgressComposer />);
    describeIt('  North bay slab poured.  ');
    review();
    send();
    await waitFor(() => expect(submitProgressReport).toHaveBeenCalledTimes(1));
    expect(submitProgressReport.mock.calls[0][0].description).toBe('  North bay slab poured.  ');
  });

  it('sends a reference as the agreed shape or not at all', async () => {
    submitProgressReport.mockImplementation((r) => Promise.resolve(receipt(r.requestId, r.projectId)));
    render(<ProgressComposer />);
    describeIt('Pour complete.');
    review();
    send();
    await waitFor(() => expect(submitProgressReport).toHaveBeenCalledTimes(1));
    const sent = submitProgressReport.mock.calls[0][0];
    expect(sent.reference).toBeNull();
    expect(sent.blockerNote).toBeNull();
    expect(sent.photos).toEqual([]);
  });
});

describe('Progress composer — one pending send, one submission', () => {
  it('a second and third press while pending start nothing', async () => {
    let settle;
    submitProgressReport.mockImplementation(() => new Promise((res) => { settle = res; }));
    render(<ProgressComposer />);
    describeIt('Pour complete.');
    review();
    send();
    await waitFor(() => expect(submitProgressReport).toHaveBeenCalledTimes(1));

    send(); send();
    expect(submitProgressReport).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-progress-send]')).toBeDisabled();
    expect(document.querySelector('[data-progress-back]')).toBeDisabled();
    settle?.(receipt(submitProgressReport.mock.calls[0][0].requestId, 'p'));
  });
});

describe('Progress composer — a refusal keeps everything', () => {
  it('says it was not sent, keeps the entries, and retries the same report', async () => {
    const err = Object.assign(new Error('refused'), { code: 'SIMULATED_FAILURE' });
    submitProgressReport.mockRejectedValueOnce(err)
      .mockImplementation((r) => Promise.resolve(receipt(r.requestId, r.projectId)));
    render(<StrictMode><ProgressComposer /></StrictMode>);
    describeIt('Pour complete.', 'blocked');
    fireEvent.change(screen.getByLabelText('Blocker note'), { target: { value: 'Consultant has not attended.' } });
    review();
    send();

    expect(await screen.findByText(/Not sent/)).toBeInTheDocument();
    expect(screen.getByText(/still here/i)).toBeInTheDocument();
    expect(document.querySelector('[data-progress-send]')).not.toBeDisabled();

    fireEvent.click(document.querySelector('[data-progress-back]'));
    expect(screen.getByLabelText('Description')).toHaveValue('Pour complete.');
    expect(screen.getByLabelText('Blocker note')).toHaveValue('Consultant has not attended.');
    expect(document.querySelector('[data-progress-status="blocked"]').getAttribute('aria-pressed')).toBe('true');

    review();
    send();
    await screen.findByText(ACK_NOTE);
    const [first, second] = submitProgressReport.mock.calls.map((c) => c[0]);
    expect(second.requestId).toBe(first.requestId);   // the same report, sent again
    expect(second.description).toBe(first.description);
  });
});

describe('Progress composer — an answer that no longer applies is dropped', () => {
  it('a late answer for a different request never reaches the screen', async () => {
    let settle;
    submitProgressReport.mockImplementation(() => new Promise((res) => { settle = res; }));
    render(<ProgressComposer />);
    describeIt('Pour complete.');
    review();
    send();
    await waitFor(() => expect(submitProgressReport).toHaveBeenCalledTimes(1));

    settle?.(receipt('pr-someone-elses-request', 'p'));
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByText(ACK_NOTE)).toBeNull();
    expect(document.querySelector('[data-progress-send]')).toBeInTheDocument();
  });
});

describe('Progress composer — the acknowledgement claims only what happened', () => {
  it('states the service note and offers Done', async () => {
    submitProgressReport.mockImplementation((r) => Promise.resolve(receipt(r.requestId, r.projectId)));
    const onDone = vi.fn();
    render(<ProgressComposer onDone={onDone} />);
    describeIt('Pour complete.');
    review();
    send();

    expect(await screen.findByText(ACK_NOTE)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bsubmitted to the office\b|\bsent to the project team\b/i);
    fireEvent.click(document.querySelector('[data-progress-done]'));
    expect(onDone).toHaveBeenCalled();
  });
});
