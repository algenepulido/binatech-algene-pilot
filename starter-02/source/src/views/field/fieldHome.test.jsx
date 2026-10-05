// ============================================================
// FieldHome — conformance to frame A of the approved Field Mode Target.
//
// §13 marks the offline queue, readiness rules and project switching Planned.
// The design's rule is explicit: Home ships WITHOUT the sync foot line, the
// readiness blocker is simply absent, and the project strip keeps the project
// but not a working chevron. These tests hold that line so a later change
// cannot quietly ship a control with nothing behind it.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const WIRS = [
  { id: '1', wir_number: 'WIR-2451-A', inspection_type: 'Blinding pour', location: 'Zone C', result: 'rejected', inspection_date: '2026-08-20' },
  { id: '2', wir_number: 'WIR-2437-A', inspection_type: 'Kerb line levels', location: 'Zone D', result: 'rejected', inspection_date: '2026-08-21' },
  { id: '3', wir_number: 'WIR-2448-C', inspection_type: 'Duct hanger spacing', location: 'L1 plantroom', result: 'pending', inspection_date: '2026-08-22' },
  { id: '4', wir_number: 'WIR-2450-B', inspection_type: 'Rebar cover check', location: 'Zone C', result: 'in_progress', inspection_date: '2026-08-23' },
  { id: '5', wir_number: 'WIR-2440-B', inspection_type: 'Blockwork set-out', location: 'Zone A', result: 'approved', inspection_date: '2026-08-21' },
];
let rows = WIRS;
vi.mock('../../api/wirs.js', () => ({ listWirs: () => Promise.resolve(rows) }));
vi.mock('../../lib/project.jsx', () => ({ useProject: () => ({ project: { name: 'Coastal Logistics Park', code: 'P2' } }) }));

let FieldHome;
beforeEach(async () => { rows = WIRS; ({ FieldHome } = await import('./FieldHome.jsx')); });
afterEach(() => cleanup());

const view = (p = {}) => render(<FieldHome t={{}} lang="en" userName="Fahad" role="QA/QC Inspector" onNavigate={() => {}} onCapture={() => {}} onOpenWir={() => {}} {...p} />);
const surfaces = () => [...document.querySelectorAll('[data-field-surface]')];
const num = (v) => parseFloat(v) || 0;

describe('A · Home — the field surface', () => {
  it('(H1) the role is carried here; the project is not duplicated', async () => {
    view();
    await screen.findByText(/QA\/QC Inspector/);
    // The app Header already renders the project and a working switcher at
    // every width. A second project line on Home would be duplicated chrome.
    expect(document.body.textContent).not.toMatch(/Coastal Logistics Park/);
  });

  it('(H2) project switching is not faked inert — it is live in the Header', async () => {
    view();
    await screen.findByText(/QA\/QC Inspector/);
    // §13 lists switching as Planned; this repo actually ships it, which is the
    // drift open decision 05 anticipates. Home must therefore NOT render a dead
    // chevron pretending the capability is absent.
    expect(document.querySelector('[data-project-strip]')).toBeNull();
    for (const n of document.querySelectorAll('[aria-disabled="true"]')) {
      expect(n.textContent, 'no inert stand-in control').not.toMatch(/project|switch/i);
    }
  });

  it('(H3) the headline counts the items that genuinely need action', async () => {
    view();
    // two returned WIRs need this person; pending/approved do not
    expect(await screen.findByRole('heading', { name: /2 items need your attention/i })).toBeTruthy();
  });

  it('(H4) attention rows sit on one fill surface with no border', async () => {
    view();
    await screen.findByText(/Blinding pour/);
    const s = surfaces();
    expect(s.length).toBeGreaterThan(0);
    for (const el of s) {
      const cs = getComputedStyle(el);
      expect(num(cs.borderTopWidth) + num(cs.borderBottomWidth) + num(cs.borderLeftWidth) + num(cs.borderRightWidth), 'fill only, zero borders').toBe(0);
      expect(num(cs.borderRadius)).toBe(14);
    }
  });

  it('(H5) no cards inside cards — a surface never nests inside a surface', async () => {
    view();
    await screen.findByText(/Blinding pour/);
    for (const el of surfaces()) expect(el.parentElement.closest('[data-field-surface]')).toBeNull();
  });

  it('(H6) every actionable row is a >=44px target', async () => {
    view();
    await screen.findByText(/Blinding pour/);
    const btns = [...document.querySelectorAll('button')];
    expect(btns.length).toBeGreaterThan(4);
    for (const b of btns) expect(num(getComputedStyle(b).minHeight), b.textContent.slice(0, 24)).toBeGreaterThanOrEqual(44);
  });

  it('(H7) View all work reaches the Work destination', async () => {
    const onNavigate = vi.fn();
    view({ onNavigate });
    fireEvent.click(await screen.findByRole('button', { name: /view all work/i }));
    expect(onNavigate).toHaveBeenCalledWith('work');
  });

  it('(H8) the four quick actions are present and reach live destinations', async () => {
    const onNavigate = vi.fn(); const onCapture = vi.fn();
    view({ onNavigate, onCapture });
    await screen.findByText(/Blinding pour/);
    for (const label of [/raise a wir/i, /record site progress/i, /review my wirs/i, /open the model/i]) {
      expect(screen.getByRole('button', { name: label }), String(label)).toBeTruthy();
    }
    fireEvent.click(screen.getByRole('button', { name: /review my wirs/i }));
    expect(onNavigate).toHaveBeenCalledWith('wirs');
    fireEvent.click(screen.getByRole('button', { name: /open the model/i }));
    expect(onNavigate).toHaveBeenCalledWith('model');
    fireEvent.click(screen.getByRole('button', { name: /record site progress/i }));
    expect(onCapture).toHaveBeenCalled();
  });

  it('(H9) nothing Planned ships: no sync foot line, no drafts entry, no readiness verdict', async () => {
    view();
    await screen.findByText(/Blinding pour/);
    const txt = document.body.textContent;
    expect(txt).not.toMatch(/waiting to sync|on this device/i);
    expect(txt).not.toMatch(/\bdrafts?\b/i);
    expect(txt).not.toMatch(/ready to submit|not ready to submit/i);
  });

  it('(H10) an empty attention list says so honestly instead of inventing a count', async () => {
    rows = WIRS.filter((w) => w.result === 'approved');
    view();
    await waitFor(() => expect(document.body.textContent).not.toMatch(/Loading/i));
    expect(screen.queryByRole('heading', { name: /need your attention/i })).toBeNull();
    expect(screen.getByRole('heading', { name: /nothing needs you/i })).toBeTruthy();
  });

  it('(H11) Arabic renders RTL from the dictionary', async () => {
    view({ lang: 'ar', t: { fmGreetMorning: 'صباح الخير', fmViewAllWork: 'عرض كل الأعمال', fmQuickActions: 'إجراءات سريعة' } });
    await screen.findByText(/Blinding pour/);
    expect(document.querySelector('[dir="rtl"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: /عرض كل الأعمال/ })).toBeTruthy();
  });
});
