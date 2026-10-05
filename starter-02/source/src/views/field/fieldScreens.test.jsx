// ============================================================
// Field Mode screen contracts.
//
// Two things are worth locking down here, because both were real defects:
//   1. Scan leaked roadmap/engineering language at the customer ("NOT AVAILABLE
//      YET" three times, plus talk of decoding libraries and recognition
//      backends). Unavailable camera capability is stated ONCE, in three words.
//   2. The screens were English-only inside a bilingual product, so an Arabic
//      user got translated nav labels above English headings.
// ============================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ScanView } from './ScanView.jsx';
import { WorkView } from './WorkView.jsx';
import { T } from '../../i18n/translations.js';

vi.mock('../../api/wirs.js', () => ({
  listWirs: () => Promise.resolve([
    { id: 'w1', wir_number: 'WIR-001', inspection_type: 'Concrete', location: 'Zone B', result: 'pending' },
  ]),
}));
vi.mock('../../api/drawings.js', () => ({
  listDrawings: () => Promise.resolve([
    { id: 'd1', drawing_number: 'SD-STR-001', title: 'Pier P12', discipline: 'Structural' },
  ]),
}));
vi.mock('../../api/snags.js', () => ({ listSnags: () => Promise.resolve([]) }));
vi.mock('../../lib/attachments.js', () => ({ countAttachmentsByRecord: () => Promise.resolve({}) }));
vi.mock('../../lib/elements.jsx', () => ({ useElements: () => ({ elements: [{ guid: 'g1', id: 'C-14', name: 'Column C14' }] }) }));

afterEach(cleanup);

describe('ScanView — customer-facing copy', () => {
  it('states unavailable camera capability exactly once, in three words', () => {
    render(<ScanView t={T.en} lang="en" />);
    expect(screen.getByText('Camera scanning')).toBeTruthy();
    expect(screen.getByText('Coming soon')).toBeTruthy();
    // The old screen said this three times.
    expect(screen.queryAllByText(/NOT AVAILABLE YET/i)).toHaveLength(0);
  });

  it('never explains engineering dependencies to a site engineer', () => {
    const { container } = render(<ScanView t={T.en} lang="en" />);
    const copy = container.textContent;
    [/decoding library/i, /recognition backend/i, /not integrated/i, /integration document/i].forEach((re) => {
      expect(copy).not.toMatch(re);
    });
  });

  it('does not offer snag classification — that belongs under Capture', () => {
    const { container } = render(<ScanView t={T.en} lang="en" />);
    expect(container.textContent).not.toMatch(/snag/i);
  });

  it('leads with search and offers scopes', () => {
    render(<ScanView t={T.en} lang="en" />);
    expect(screen.getByLabelText(T.en.scanPlaceholder)).toBeTruthy();
    ['All', 'WIRs', 'Elements', 'Drawings'].forEach((s) => expect(screen.getByText(s)).toBeTruthy());
  });

  it('renders Arabic headings, not a half-translated screen', () => {
    const { container } = render(<ScanView t={T.ar} lang="ar" />);
    expect(screen.getByText(T.ar.scanTitle)).toBeTruthy();
    expect(screen.getByText(T.ar.scanSub)).toBeTruthy();
    expect(screen.getByText(T.ar.scanCamera)).toBeTruthy();
    // No English fallback headings left behind.
    expect(container.textContent).not.toMatch(/Find a WIR, element or drawing on site/);
  });
});

describe('WorkView — bilingual', () => {
  // Frame B replaced the strap-line with the project binding; the state group
  // labels now carry the meaning, so those are what must translate. The
  // original point of these two stands: an Arabic user must not get English
  // headings over translated nav.
  it('renders English headings and state groups', async () => {
    render(<WorkView t={T.en} lang="en" />);
    expect(await screen.findByText('Work')).toBeTruthy();
    expect(screen.getByText(/Awaiting inspection · 1/)).toBeTruthy();
  });

  it('renders Arabic headings and state groups', async () => {
    const { container } = render(<WorkView t={T.ar} lang="ar" />);
    expect(await screen.findByText(T.ar.workTitle)).toBeTruthy();
    expect(screen.getByText(new RegExp(T.ar.fmAwaiting))).toBeTruthy();
    expect(container.textContent).not.toMatch(/Awaiting inspection|Needs your action|Approved/);
    expect(container.querySelector('[dir="rtl"]')).toBeTruthy();
  });
});
