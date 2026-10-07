// ============================================================
// REVIEW-RETURN-1 — review a record in the shared contextual inspector
// (src/components/Drawer.jsx), close it, and resume at the same invoking
// control without losing table context.
//
// The Drawer is MODAL by its existing contract: role="dialog" +
// aria-modal="true" over a full-viewport backdrop that closes on mousedown.
// This file pins, on the real consumers (CommercialHubView and
// CertificationControlRoomView, real useCommercialData hook, only the loader
// modules mocked) and on the Drawer itself:
//   * focus moves into the panel on open and is not stolen again on rerender;
//   * Escape and the visible Close return focus to the exact invoking control
//     (A, then later B — never A again), preserving search/filter/scroll;
//   * a removed or hidden opener is never focused — the app's explicit page
//     fallback (#main-content) is used instead, and focus that has already
//     moved to another surface (e.g. a confirm dialog) is left alone;
//   * Tab/Shift+Tab cycle inside the open panel; events from a nested dialog
//     are left to that dialog;
//   * StrictMode setup/cleanup, and no lingering listener or restriction once
//     closed or unmounted. The Drawer installs no `inert` at all (ConfirmHost
//     and in-drawer Modals must keep working), so there is nothing to leak.
// These tests prove frontend focus behaviour only — not backend linkage or
// access control. The Drawer has no nonmodal mode, so no nonmodal case applies.
//
// REVIEW-RETURN-2 extends this file to the confirmation that opens OVER the
// Drawer (app-root ConfirmHost → Modal), on the real Invoice view: focus enters
// the confirmation at a safe control (Cancel for destructive wording, never the
// destructive button), Tab/Shift+Tab stay inside it, one Escape dismisses only
// the confirmation, and Cancel / Close / Escape return focus to the control
// that asked — or, when that control is gone, to the still-open Drawer. The
// R1 expectations that encoded the superseded behaviour (focus dropped to
// <body>, focus left beneath the confirmation, Tab left free to leave it) are
// replaced here; every other R1 protection is unchanged.
//
// REVIEW-RETURN-3 gives each invoice a real opener: a native button around the
// existing reference (keyboard-reachable, named "Open invoice INV-…"), used by
// both keyboard and whole-row pointer opening, so the Drawer returns focus to
// that invoice instead of the page. A reload under the open Drawer (Edit →
// Save) returns to that invoice's new button, found by id; a delete that
// completes after the Drawer closed lands on the page landmark, never <body>.
// All R1/R2 tests are unchanged.
// ============================================================
import { StrictMode, useState } from 'react';
import { flushSync } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Drawer } from './Drawer.jsx';
import { ConfirmHost, confirmDialog } from './ConfirmDialog.jsx';
import { Modal } from './Modal.jsx';
import { InvoicesView } from '../views/InvoicesView.jsx';
import { T } from '../i18n/translations.js';
import { CommercialHubView } from '../views/CommercialHubView.jsx';
import { CertificationControlRoomView } from '../views/commercial/CertificationControlRoomView.jsx';

const listBoqItems = vi.fn();
const listWirs = vi.fn();
const listIpcs = vi.fn();
const listNcrs = vi.fn();
const listAllLinks = vi.fn();
const loadElementStatusMap = vi.fn();
const countAttachmentsByRecord = vi.fn();
const listInvoices = vi.fn();
const deleteInvoice = vi.fn();
const updateInvoice = vi.fn();
vi.mock('../api/boqItems.js', async (orig) => ({ ...(await orig()), listBoqItems: (...a) => listBoqItems(...a) }));
vi.mock('../api/elementBoqLinks.js', () => ({ listAllLinks: (...a) => listAllLinks(...a) }));
vi.mock('../api/wirs.js', () => ({ listWirs: (...a) => listWirs(...a) }));
vi.mock('../api/ncrs.js', () => ({ listNcrs: (...a) => listNcrs(...a) }));
vi.mock('../api/ipcs.js', () => ({ listIpcs: (...a) => listIpcs(...a) }));
vi.mock('../lib/elementStatus.js', () => ({ loadElementStatusMap: (...a) => loadElementStatusMap(...a) }));
vi.mock('../lib/attachments.js', () => ({ countAttachmentsByRecord: (...a) => countAttachmentsByRecord(...a),
  listAttachments: async () => [], uploadAttachment: async () => ({}), signedUrl: async () => '', deleteAttachment: async () => {} }));
// REVIEW-RETURN-2: the Invoice view's reads are synthetic; its only write (deleteInvoice) is a spy.
// REVIEW-RETURN-3: so is the edit form's save (updateInvoice).
vi.mock('../api/invoices.js', async (orig) => ({ ...(await orig()), listInvoices: (...a) => listInvoices(...a), deleteInvoice: (...a) => deleteInvoice(...a), updateInvoice: (...a) => updateInvoice(...a) }));
vi.mock('../api/invoiceWirLinks.js', () => ({ listWirsForInvoice: async () => [], listInvoiceWirLinks: async () => [], listInvoicesForWir: async () => [], linkInvoiceWir: async () => {}, unlinkInvoiceWir: async () => {} }));
vi.mock('../lib/auth.jsx', async (orig) => ({ ...(await orig()), useAuth: () => ({ requireAuth: (action) => action?.(), session: { user: { id: 'u-1' } }, user: { id: 'u-1' }, isAuthenticated: true }) }));

// Four real-mode lines; A-200 and A-400 are blocked, so a "Blocked" filter keeps two rows.
const BOQ = [
  { id: 'r1', code: 'A-100', description: 'Pile caps — zone A', unit: 'm3', qty: 100, rate: 100, approved_qty: 60 },
  { id: 'r2', code: 'A-200', description: 'Blinding concrete — zone A', unit: 'm2', qty: 50, rate: 200, approved_qty: 0 },
  { id: 'r3', code: 'A-300', description: 'Waterproofing membrane', unit: 'm2', qty: 10, rate: 500, approved_qty: 10 },
  { id: 'r4', code: 'A-400', description: 'Cable tray — main runs', unit: 'm', qty: 40, rate: 90, approved_qty: 0 },
];
const LINKS = BOQ.map((b, i) => ({ boq_item_id: b.id, element_guid: `e${i + 1}` }));
const STATUS = { e1: { key: 'approved', clear: true }, e2: { key: 'in_progress', clear: false }, e3: { key: 'approved', clear: true }, e4: { key: 'in_progress', clear: false } };
const WIRS = [
  { id: 'w1', wir_number: 'WIR-0001', boq_item_id: 'r1', result: 'Approved', approved_qty: 60, element_guid: 'e1' },
  { id: 'w2', wir_number: 'WIR-0002', boq_item_id: 'r1', result: 'Pending', approved_qty: 20, element_guid: 'e1' },
  { id: 'w3', wir_number: 'WIR-0003', boq_item_id: 'r3', result: 'Approved', approved_qty: 10, element_guid: 'e3' },
];

const INVOICES = [
  { id: 'inv-1', invoice_number: 'INV-0001', amount: 125000, issue_date: '2026-09-01', due_date: '2026-10-01', zatca_status: 'Draft', payment_status: 'Unpaid', wir_number: 'WIR-0001' },
  { id: 'inv-2', invoice_number: 'INV-0002', amount: 98000, issue_date: '2026-08-15', due_date: '2026-09-15', zatca_status: 'Draft', payment_status: 'Unpaid', wir_number: null },
];

const state = vi.hoisted(() => ({ width: 1280, listeners: new Set() }));
const evaluate = (q) => { const max = /max-width:\s*(\d+)px/.exec(q); const min = /min-width:\s*(\d+)px/.exec(q); return (!max || state.width <= Number(max[1])) && (!min || state.width >= Number(min[1])); };
const mediaAt = (q) => { const mql = { matches: evaluate(q), media: q, onchange: null, dispatchEvent: vi.fn(), removeEventListener: vi.fn(), removeListener: vi.fn() };
  const add = (_t, fn) => state.listeners.add(() => { mql.matches = evaluate(q); fn({ matches: mql.matches, media: q }); }); mql.addEventListener = add; mql.addListener = (fn) => add('change', fn); return mql; };
const resizeTo = async (w) => { state.width = w; await act(async () => { for (const fn of state.listeners) fn(); }); };

beforeEach(() => {
  state.width = 1280; state.listeners.clear(); window.matchMedia = vi.fn(mediaAt);
  listBoqItems.mockReset().mockResolvedValue(BOQ); listWirs.mockReset().mockResolvedValue(WIRS); listIpcs.mockReset().mockResolvedValue([]);
  listNcrs.mockReset().mockResolvedValue([]); listAllLinks.mockReset().mockResolvedValue(LINKS);
  loadElementStatusMap.mockReset().mockResolvedValue(STATUS); countAttachmentsByRecord.mockReset().mockResolvedValue({ w1: 1, w3: 1 });
  listInvoices.mockReset().mockResolvedValue(INVOICES); deleteInvoice.mockReset().mockResolvedValue(undefined);
  updateInvoice.mockReset().mockRejectedValue(new Error('updateInvoice is not stubbed for this test'));
});
afterEach(() => { cleanup(); document.getElementById('main-content')?.remove(); });

const row = (code) => screen.getAllByRole('row').find((r) => within(r).queryByText(code));
const dialog = () => screen.queryByRole('dialog');
// From 1024px Commercial Control's inspector is a panel beside the register rather
// than a dialog over it. The contract it has to keep is the same, so the tests find
// whichever is mounted and assert against that. Only the two assertions that name a
// modal outright are rewritten below; identity, Escape, exact-row return, the
// rerender guard and StrictMode are unchanged.
const inspector = () => document.querySelector('[data-line-inspector-panel]') ?? screen.queryByRole('dialog');
const inspectorLabel = () => inspector()?.getAttribute('aria-label') ?? null;
// The panel stays mounted with an empty state, so "cleared" means it no longer
// shows a line, not that it vanished. The Drawer answers the same way: gone is gone.
const selectedLine = () => (document.querySelector('[data-line-inspector]') ? inspectorLabel() : null);
const settledHub = () => waitFor(() => expect(document.querySelector('[data-commercial-state]').getAttribute('data-commercial-state')).toBe('project'));
async function mountHub({ lang = 'en', strict = false } = {}) {
  const ui = <><main id="main-content" tabIndex={-1}><CommercialHubView lang={lang} onNavigate={() => {}} /></main></>;
  const utils = render(strict ? <StrictMode>{ui}</StrictMode> : ui);
  await settledHub();
  return utils;
}

describe('REVIEW-RETURN-1 · Commercial Control ledger → inspector → back to the same row', () => {
  it('RED 1 · keyboard: Enter on row A opens the inspector and leaves focus on the row; Escape returns focus to row A', async () => {
    const user = userEvent.setup();
    await mountHub();
    const a = row('A-200');
    act(() => a.focus());
    await user.keyboard('{Enter}');
    expect(inspector()).toBeTruthy();
    expect(selectedLine()).toBe('A-200');                      // canonical selection preserved
    expect(inspector().contains(document.activeElement), 'a non-modal panel does not pull focus off the row').toBe(false);
    expect(document.activeElement, 'focus stays on the row that opened it').toBe(a);
    await user.keyboard('{Escape}');
    expect(selectedLine(), 'the selection is cleared').toBeNull();
    expect(document.activeElement, 'focus returns to the exact invoking row').toBe(a);
  });

  it('pointer: clicking row A and then the visible Close returns focus to row A', async () => {
    const user = userEvent.setup();
    await mountHub();
    const a = row('A-100');
    await user.click(within(a).getByText('A-100'));
    expect(selectedLine()).toBe('A-100');
    await user.click(within(inspector()).getByRole('button', { name: 'Close' }));
    expect(selectedLine(), 'the selection is cleared').toBeNull();
    expect(document.activeElement).toBe(a);
  });

  it('A open/close, then B open/close: focus returns to B, never back to A', async () => {
    const user = userEvent.setup();
    await mountHub();
    const a = row('A-100'); const b = row('A-400');
    await user.click(within(a).getByText('A-100'));
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(a);
    act(() => b.focus());
    await user.keyboard('{Enter}');
    expect(selectedLine()).toBe('A-400');
    await user.click(within(inspector()).getByRole('button', { name: 'Close' }));
    expect(document.activeElement).toBe(b);
    expect(document.activeElement).not.toBe(a);
  });

  it('search text, status filter and the scroll position survive a review round-trip', async () => {
    const user = userEvent.setup();
    await mountHub();
    await user.click(screen.getByRole('button', { name: /^Blocked · 2$/ }));
    await user.type(screen.getByPlaceholderText(/Search BoQ code or description/), 'zone');
    const scroller = document.querySelector('[data-overview]');
    scroller.scrollTop = 140;
    const before = { rows: screen.getAllByRole('row').length, scroll: scroller.scrollTop };
    const a = row('A-200');
    await user.click(within(a).getByText('A-200'));
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(a);
    expect(screen.getByPlaceholderText(/Search BoQ code or description/).value).toBe('zone');
    expect(screen.getByRole('button', { name: /^Blocked · 2$/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByRole('row').length).toBe(before.rows);
    expect(scroller.scrollTop, 'focus return does not scroll the list').toBe(before.scroll);
  });

  it('a rerender while open (language switch, data reload) neither steals focus nor replaces the captured opener', async () => {
    const user = userEvent.setup();
    const { rerender } = await mountHub();
    const a = row('A-200');
    act(() => a.focus());
    await user.keyboard('{Enter}');
    const close = within(inspector()).getByRole('button', { name: 'Close' });
    act(() => close.focus());
    rerender(<main id="main-content" tabIndex={-1}><CommercialHubView lang="ar" onNavigate={() => {}} /></main>);
    await act(async () => {});
    expect(inspector()).toBeTruthy();
    expect(document.activeElement, 'a rerender does not pull focus back to the panel').toBe(close);
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(row('A-200'));
  });

  it('StrictMode: setup/cleanup still returns focus to the opener', async () => {
    const user = userEvent.setup();
    await mountHub({ strict: true });
    const a = row('A-300');
    act(() => a.focus());
    await user.keyboard('{Enter}');
    expect(document.activeElement, 'focus stays on the row that opened it').toBe(a);
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(a);
  });

  it('context change while open: the table is replaced by the phone list, so the removed row is not focused — the page fallback is', async () => {
    const user = userEvent.setup();
    await mountHub();
    const a = row('A-200');
    act(() => a.focus());
    await user.keyboard('{Enter}');
    await resizeTo(390);                                                              // desktop ledger -> phone line list
    await waitFor(() => expect(document.querySelector('[data-line-row]')).toBeTruthy());
    expect(a.isConnected).toBe(false);
    await user.keyboard('{Escape}');
    expect(selectedLine(), 'the selection is cleared').toBeNull();
    expect(document.activeElement).toBe(document.getElementById('main-content'));
  });

  it('no containment: focus is never trapped in the panel, and Tab reaches it and leaves again', async () => {
    const user = userEvent.setup();
    await mountHub();
    const a = row('A-100');
    act(() => a.focus());
    await user.keyboard('{Enter}');
    const panel = inspector();
    const focusables = [...panel.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
    expect(focusables.length).toBeGreaterThan(1);

    // A panel that never closes must not hold the keyboard. Tabbing far past its
    // last control has to leave it, or a keyboard user cannot get back to the table.
    expect(panel.contains(document.activeElement), 'opening does not move focus into it').toBe(false);
    for (let i = 0; i < focusables.length + 4; i += 1) await user.tab();
    expect(panel.contains(document.activeElement), 'focus is not held inside the panel').toBe(false);

    // and it is reachable: focus its last control and Escape still hands the row back
    act(() => focusables[focusables.length - 1].focus());
    expect(panel.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(a);
  });

  it('after close and after unmount nothing lingers: Tab moves normally, no document listener is ever installed, no restriction is left', async () => {
    const user = userEvent.setup();
    const { unmount } = await mountHub();
    const a = row('A-100');
    act(() => a.focus());
    await user.tab(); await user.tab({ shift: true });                              // let user-event finish its one-time document setup
    const live = new Set();
    const add = vi.spyOn(document, 'addEventListener').mockImplementation(function (t, fn, o) { live.add(fn); return EventTarget.prototype.addEventListener.call(this, t, fn, o); });
    const remove = vi.spyOn(document, 'removeEventListener').mockImplementation(function (t, fn, o) { live.delete(fn); return EventTarget.prototype.removeEventListener.call(this, t, fn, o); });
    const pending = () => [...live];
    await user.keyboard('{Enter}');
    expect(pending(), 'a panel beside the register installs no document listener at all').toEqual([]);
    await user.keyboard('{Escape}');
    expect(pending(), 'and so there is none to leave behind').toEqual([]);
    expect(document.activeElement).toBe(a);
    const ledger = [...document.querySelectorAll('tbody tr[tabindex="0"]')];
    await user.tab();
    expect(document.activeElement, 'Tab leaves the row normally — no trap left behind').toBe(ledger[ledger.indexOf(a) + 1]);
    act(() => a.focus());
    await user.keyboard('{Enter}');
    unmount();                                                                       // leave the route with the inspector open
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(pending(), 'unmounting while open removes every document listener it added').toEqual([]);
    add.mockRestore(); remove.mockRestore();
    expect(document.querySelector('[inert]')).toBeNull();
    expect(document.body.getAttribute('aria-hidden')).toBeNull();
  });
});

describe('REVIEW-RETURN-1 · Control Room consumer (mounts the Drawer only while a line is open)', () => {
  it('opening from an owner-board button and closing with Escape returns focus to that button', async () => {
    const user = userEvent.setup();
    render(<StrictMode><main id="main-content" tabIndex={-1}><CertificationControlRoomView lang="en" onNavigate={() => {}} /></main></StrictMode>);
    await waitFor(() => expect(screen.getAllByText('A-200').length).toBeGreaterThan(0));
    const opener = screen.getAllByText('A-200').map((n) => n.closest('button')).find(Boolean);
    act(() => opener.focus());
    await user.keyboard('{Enter}');
    await waitFor(() => expect(dialog()).toBeTruthy());
    expect(dialog().contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(dialog()).toBeNull());
    expect(document.activeElement).toBe(opener);
  });
});

describe('REVIEW-RETURN-1 · Drawer contract details', () => {
  function Harness({ nested = false }) {
    const [open, setOpen] = useState(null);
    const [hideOpener, setHide] = useState(false);
    const [gone, setGone] = useState(false);
    const [css, setCss] = useState({});                                              // CSS visibility:hidden on the opener, its section, or the page
    const vis = (on) => (on ? { visibility: 'hidden' } : undefined);
    const cssHide = (k) => () => setCss((c) => ({ ...c, [k]: true }));
    return (
      <>
        <main id="main-content" tabIndex={-1} style={vis(css.page)}>
          <section style={vis(css.section)}>
            {!gone && <button type="button" hidden={hideOpener} style={vis(css.self)} onClick={() => setOpen('x')}>Open X</button>}
          </section>
          <button type="button" onClick={() => setOpen('y')}>Open Y</button>
          <button type="button" data-elsewhere>Elsewhere</button>
        </main>
        <Drawer open={!!open} onClose={() => setOpen(null)} title={`Record ${open}`}>
          <button type="button" onClick={() => setHide(true)}>Hide opener</button>
          <button type="button" onClick={() => setGone(true)}>Remove opener</button>
          <button type="button" onClick={cssHide('self')}>CSS-hide opener</button>
          <button type="button" onClick={cssHide('section')}>CSS-hide opener section</button>
          <button type="button" onClick={cssHide('page')}>CSS-hide page</button>
          {nested && <div role="dialog" aria-label="Nested"><button type="button">Nested one</button><button type="button">Nested two</button></div>}
        </Drawer>
      </>
    );
  }
  it('a hidden opener is not focused; the page fallback is used', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open X' }));
    await user.click(screen.getByRole('button', { name: 'Hide opener' }));
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(document.getElementById('main-content'));
  });
  it('a removed opener is not focused; the page fallback is used', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open X' }));
    await user.click(screen.getByRole('button', { name: 'Remove opener' }));
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(document.getElementById('main-content'));
  });
  it('an opener hidden by CSS (visibility:hidden on itself) is not a return target; the page fallback is used', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const x = screen.getByRole('button', { name: 'Open X' });
    await user.click(x);
    await user.click(screen.getByRole('button', { name: 'CSS-hide opener' }));
    expect(getComputedStyle(x).visibility).toBe('hidden');
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(document.getElementById('main-content'));
  });
  it('an opener inside a CSS-hidden section (visibility:hidden ancestor) is not a return target; the page fallback is used', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const x = screen.getByRole('button', { name: 'Open X' });
    await user.click(x);
    await user.click(screen.getByRole('button', { name: 'CSS-hide opener section' }));
    expect(getComputedStyle(x).visibility, 'inherited from the section').toBe('hidden');
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(document.getElementById('main-content'));
  });
  it('when the page fallback is CSS-hidden too, nothing hidden is focused — focus is left on the document', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open X' }));
    await user.click(screen.getByRole('button', { name: 'Remove opener' }));
    await user.click(screen.getByRole('button', { name: 'CSS-hide page' }));
    await user.keyboard('{Escape}');
    expect(dialog()).toBeNull();
    expect(document.activeElement).not.toBe(document.getElementById('main-content'));
    expect(document.activeElement).toBe(document.body);
  });
  it('an opener the browser declines to focus (focus() has no effect) falls back to the page instead of leaving focus on <body>', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const x = screen.getByRole('button', { name: 'Open X' });
    await user.click(x);
    Object.defineProperty(x, 'focus', { configurable: true, value: () => {} });      // e.g. a rendering state the browser will not focus
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(document.getElementById('main-content'));
  });
  it('the Tab cycle skips CSS-hidden, disabled (incl. disabled fieldset) and aria-hidden controls at its ends', async () => {
    const user = userEvent.setup();
    function Edges() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <main id="main-content" tabIndex={-1}><button type="button" onClick={() => setOpen(true)}>Open edges</button><button type="button">Behind</button></main>
          <Drawer open={open} onClose={() => setOpen(false)} title="Edges">
            <button type="button">First body control</button>
            <button type="button">Last usable control</button>
            <button type="button" style={{ visibility: 'hidden' }}>CSS-hidden tail</button>
            <div style={{ visibility: 'hidden' }}><button type="button">Inside CSS-hidden block</button></div>
            <fieldset disabled><button type="button">In disabled fieldset</button></fieldset>
            <div aria-hidden="true"><button type="button">Aria-hidden tail</button></div>
            <button type="button" disabled>Disabled tail</button>
          </Drawer>
        </>
      );
    }
    render(<Edges />);
    await user.click(screen.getByRole('button', { name: 'Open edges' }));
    const panel = dialog();
    const close = within(panel).getByRole('button', { name: 'Close' });
    const lastUsable = within(panel).getByRole('button', { name: 'Last usable control' });
    act(() => lastUsable.focus());
    await user.tab();
    expect(document.activeElement, 'Tab from the last usable control wraps to the first').toBe(close);
    await user.tab({ shift: true });
    expect(document.activeElement, 'Shift+Tab from the first lands on the last usable control, not a hidden/disabled one').toBe(lastUsable);
    act(() => panel.focus());
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(lastUsable);
  });
  // A drawer action asks the app-root ConfirmHost (a sibling Modal, outside the panel) before acting.
  // R2 props (all optional; the defaults are the R1 harness): the asking control can be
  // removed / disabled / CSS-hidden while the confirm is open, the Drawer can disappear
  // (context change), a second asking control B can be shown, and the resolved answer is reported.
  function WithConfirm({ message = 'Archive this record?', opener = 'shown', drawerGone = false, second = false, onResult }) {
    const [open, setOpen] = useState(false);
    const ask = async () => { const ok = await confirmDialog({ message, confirmLabel: 'Archive now' }); onResult?.(ok); if (ok) setOpen(false); };
    return (
      <>
        <main id="main-content" tabIndex={-1}><button type="button" onClick={() => setOpen(true)}>Open record</button><button type="button">Background control</button></main>
        <Drawer open={open && !drawerGone} onClose={() => setOpen(false)} title="Record">
          {opener !== 'removed' && <button type="button" disabled={opener === 'disabled'} style={opener === 'css-hidden' ? { visibility: 'hidden' } : undefined} onClick={ask}>Archive</button>}
          {second && <button type="button" onClick={ask}>Archive B</button>}
          <button type="button">Keep reviewing</button>
        </Drawer>
        <ConfirmHost />
      </>
    );
  }
  const confirmBox = () => screen.getAllByRole('dialog').find((d) => d.getAttribute('aria-label') === 'Please confirm');
  it('nested confirm keeps its own keyboard: Tab stays inside the confirm (never the drawer), and confirming closes the drawer back to the opener', async () => {
    const user = userEvent.setup();
    render(<WithConfirm />);
    const opener = screen.getByRole('button', { name: 'Open record' });
    await user.click(opener);
    const panel = screen.getByRole('dialog', { name: 'Record' });
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    const confirm = await screen.findByRole('button', { name: 'Archive now' });
    expect(document.activeElement, 'the confirm takes focus at its existing, non-destructive initial target').toBe(confirm);
    await user.tab();
    expect(document.activeElement, 'Tab from the confirm\'s last control wraps to its first, not into the drawer').toBe(within(confirmBox()).getByRole('button', { name: 'Close' }));
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(confirm);
    expect(panel.contains(document.activeElement)).toBe(false);
    await user.click(confirm);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
  });
  it.each([
    ['Cancel', () => within(confirmBox()).getByRole('button', { name: 'Cancel' })],
    ['its visible Close', () => within(confirmBox()).getByRole('button', { name: 'Close' })],
  ])('a confirm dismissed with %s leaves the drawer open, returns focus to the control that asked, and Tab/Shift+Tab stay inside the drawer', async (_how, dismiss) => {
    const user = userEvent.setup();
    render(<WithConfirm />);
    await user.click(screen.getByRole('button', { name: 'Open record' }));
    const panel = screen.getByRole('dialog', { name: 'Record' });
    const close = within(panel).getByRole('button', { name: 'Close' });
    const archive = within(panel).getByRole('button', { name: 'Archive' });
    const keep = within(panel).getByRole('button', { name: 'Keep reviewing' });
    await user.click(archive);
    await screen.findByRole('button', { name: 'Archive now' });
    await user.click(dismiss());
    await waitFor(() => expect(screen.getAllByRole('dialog')).toEqual([panel]));   // confirm gone, drawer still open
    expect(document.activeElement, 'focus returns to the control that opened the confirm, not <body>').toBe(archive);
    await user.tab();
    expect(document.activeElement).toBe(keep);
    await user.tab();
    expect(document.activeElement, 'Tab past the drawer end wraps inside the drawer, not to the page').toBe(close);
    await user.click(archive);
    await screen.findByRole('button', { name: 'Archive now' });
    await user.click(dismiss());
    await waitFor(() => expect(screen.getAllByRole('dialog')).toEqual([panel]));
    expect(document.activeElement).toBe(archive);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(close);
    await user.tab({ shift: true });
    expect(document.activeElement, 'Shift+Tab past the drawer start wraps to its last control').toBe(keep);
    // R1 protection kept: with the drawer in front and focus dropped to <body>, Tab / Shift+Tab re-enter the drawer.
    act(() => document.activeElement.blur());
    await user.tab();
    expect(document.activeElement, 'Tab re-enters the drawer, not the page behind it').toBe(close);
    act(() => document.activeElement.blur());
    await user.tab({ shift: true });
    expect(document.activeElement, 'Shift+Tab re-enters the drawer at its last control').toBe(keep);
  });
  it('while the confirm is open, Tab from a dropped focus re-enters the confirm — never the drawer behind it', async () => {
    const user = userEvent.setup();
    render(<WithConfirm />);
    await user.click(screen.getByRole('button', { name: 'Open record' }));
    const panel = screen.getByRole('dialog', { name: 'Record' });
    await user.click(within(panel).getByRole('button', { name: 'Archive' }));
    await screen.findByRole('button', { name: 'Archive now' });
    act(() => document.activeElement.blur());                                        // e.g. the focused control re-rendered away
    expect(document.activeElement).toBe(document.body);
    await user.tab();
    expect(document.activeElement, 'Tab re-enters the confirm at its first control').toBe(within(confirmBox()).getByRole('button', { name: 'Close' }));
    act(() => document.activeElement.blur());
    await user.tab({ shift: true });
    expect(document.activeElement, 'Shift+Tab re-enters the confirm at its last control').toBe(within(confirmBox()).getByRole('button', { name: 'Archive now' }));
    expect(panel.contains(document.activeElement)).toBe(false);
  });
  it('a destructive confirm takes focus on Cancel (never the destructive button); the drawer beneath cannot keep the keyboard; after Cancel the drawer contains Tab again', async () => {
    const user = userEvent.setup();
    render(<WithConfirm message="Delete this record permanently?" />);
    await user.click(screen.getByRole('button', { name: 'Open record' }));
    const panel = screen.getByRole('dialog', { name: 'Record' });
    const archive = within(panel).getByRole('button', { name: 'Archive' });
    await user.click(archive);
    await screen.findByRole('button', { name: 'Archive now' });
    expect(document.activeElement, 'the destructive confirm takes focus on its Cancel control').toBe(within(confirmBox()).getByRole('button', { name: 'Cancel' }));
    act(() => within(panel).getByRole('button', { name: 'Keep reviewing' }).focus());   // focus forced beneath (e.g. by script)
    await user.tab();
    expect(confirmBox().contains(document.activeElement), 'Tab from beneath goes into the confirm, not further into the drawer or page').toBe(true);
    act(() => within(panel).getByRole('button', { name: 'Close' }).focus());
    await user.tab({ shift: true });
    expect(confirmBox().contains(document.activeElement)).toBe(true);
    await user.click(within(confirmBox()).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getAllByRole('dialog')).toEqual([panel]));
    act(() => within(panel).getByRole('button', { name: 'Keep reviewing' }).focus());
    await user.tab();
    expect(document.activeElement, 'with the confirm gone the drawer contains Tab again').toBe(within(panel).getByRole('button', { name: 'Close' }));
  });
  // ---- REVIEW-RETURN-2 · the confirmation over the Drawer (generic harness) ----
  const openConfirmFromDrawer = async (user) => {
    await user.click(screen.getByRole('button', { name: 'Open record' }));
    const panel = screen.getByRole('dialog', { name: 'Record' });
    await user.click(within(panel).getByRole('button', { name: 'Archive' }));
    await screen.findByRole('button', { name: 'Archive now' });
    return panel;
  };
  it.each([['removed'], ['disabled'], ['css-hidden']])('R2 · an asking control that is %s when the confirm closes: focus goes to the still-open drawer, never <body> or the page', async (how) => {
    const user = userEvent.setup();
    const { rerender } = render(<WithConfirm />);
    const panel = await openConfirmFromDrawer(user);
    rerender(<WithConfirm opener={how} />);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getAllByRole('dialog')).toEqual([panel]));
    expect(document.activeElement, 'the still-open drawer takes focus').toBe(panel);
    await user.tab();
    expect(document.activeElement, 'and contains Tab again from there').toBe(within(panel).getByRole('button', { name: 'Close' }));
  });
  it('R2 · the drawer disappears while the confirm is open (context change): no stale node is focused, the page fallback is', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<WithConfirm />);
    await openConfirmFromDrawer(user);
    rerender(<WithConfirm drawerGone />);
    expect(screen.queryByRole('dialog', { name: 'Record' })).toBeNull();
    await user.click(within(confirmBox()).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(document.getElementById('main-content'));
  });
  it('R2 · A then B in the same drawer, with reopen: every dismissal returns to the control that asked', async () => {
    const user = userEvent.setup();
    render(<WithConfirm second />);
    const panel = await openConfirmFromDrawer(user);
    const a = within(panel).getByRole('button', { name: 'Archive' });
    const b = within(panel).getByRole('button', { name: 'Archive B' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getAllByRole('dialog')).toEqual([panel]));
    expect(document.activeElement).toBe(a);
    await user.click(b);
    await screen.findByRole('button', { name: 'Archive now' });
    await user.click(within(confirmBox()).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getAllByRole('dialog')).toEqual([panel]));
    expect(document.activeElement, 'B asked, so B gets focus back — not A').toBe(b);
    await user.click(b);
    await screen.findByRole('button', { name: 'Archive now' });
    await user.click(within(confirmBox()).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.getAllByRole('dialog')).toEqual([panel]));
    expect(document.activeElement).toBe(b);
  });
  it('R2 · a rerender while the confirm is open (new props, new callbacks) does not move focus inside it or back to the drawer', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<WithConfirm />);
    const panel = await openConfirmFromDrawer(user);
    const close = within(confirmBox()).getByRole('button', { name: 'Close' });
    act(() => close.focus());
    rerender(<WithConfirm />);                                                       // WithConfirm renders ConfirmHost: it re-renders too
    rerender(<WithConfirm second />);
    expect(document.activeElement, 'focus stays where the user put it').toBe(close);
    expect(panel.contains(document.activeElement)).toBe(false);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getAllByRole('dialog')).toEqual([panel]));
    expect(document.activeElement).toBe(within(panel).getByRole('button', { name: 'Archive' }));
  });
  it('R2 · Escape, Cancel and Close each resolve the confirmation once, as a cancellation, and never confirm', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(<WithConfirm onResult={onResult} />);
    const panel = await openConfirmFromDrawer(user);
    const dismissals = [
      () => user.keyboard('{Escape}'),
      () => user.click(within(confirmBox()).getByRole('button', { name: 'Cancel' })),
      () => user.click(within(confirmBox()).getByRole('button', { name: 'Close' })),
    ];
    for (const [i, dismiss] of dismissals.entries()) {
      if (i > 0) { await user.click(within(panel).getByRole('button', { name: 'Archive' })); await screen.findByRole('button', { name: 'Archive now' }); }
      await dismiss();
      await waitFor(() => expect(onResult).toHaveBeenCalledTimes(i + 1));
      expect(screen.getAllByRole('dialog')).toEqual([panel]);
    }
    expect(onResult.mock.calls).toEqual([[false], [false], [false]]);
  });
  it('R2 · StrictMode: the confirm takes focus at Cancel, one Escape dismisses only it, focus returns to the control that asked', async () => {
    const user = userEvent.setup();
    render(<StrictMode><WithConfirm message="Delete this record permanently?" /></StrictMode>);
    const panel = await openConfirmFromDrawer(user);
    expect(document.activeElement).toBe(within(confirmBox()).getByRole('button', { name: 'Cancel' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getAllByRole('dialog')).toEqual([panel]));
    expect(document.activeElement).toBe(within(panel).getByRole('button', { name: 'Archive' }));
  });
  it('R2 · closing or unmounting the confirm releases every document listener it added and leaves no restriction', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<WithConfirm />);
    await user.click(screen.getByRole('button', { name: 'Open record' }));
    const panel = screen.getByRole('dialog', { name: 'Record' });
    const live = new Set();
    const add = vi.spyOn(document, 'addEventListener').mockImplementation(function (t, fn, o) { live.add(fn); return EventTarget.prototype.addEventListener.call(this, t, fn, o); });
    const remove = vi.spyOn(document, 'removeEventListener').mockImplementation(function (t, fn, o) { live.delete(fn); return EventTarget.prototype.removeEventListener.call(this, t, fn, o); });
    await user.click(within(panel).getByRole('button', { name: 'Archive' }));
    await screen.findByRole('button', { name: 'Archive now' });
    expect(live.size, 'the open confirm listens (Escape)').toBeGreaterThan(0);
    await user.click(within(confirmBox()).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getAllByRole('dialog')).toEqual([panel]));
    expect([...live], 'closing the confirm removes every listener it added').toEqual([]);
    await user.click(within(panel).getByRole('button', { name: 'Archive' }));
    await screen.findByRole('button', { name: 'Archive now' });
    unmount();
    expect([...live], 'unmounting with the confirm open removes them too').toEqual([]);
    add.mockRestore(); remove.mockRestore();
    expect(document.querySelector('[inert]')).toBeNull();
    expect(document.body.getAttribute('aria-hidden')).toBeNull();
  });
  it('R2 · a standalone Modal keeps its behaviour: focus is not moved, no tabindex is added, Escape closes it once', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    function Standalone() {
      const [open, setOpen] = useState(false);
      return (<><button type="button" onClick={() => setOpen(true)}>Open form</button>
        <Modal open={open} onClose={() => { onClose(); setOpen(false); }} title="Form"><input aria-label="Name" /></Modal></>);
    }
    render(<Standalone />);
    const btn = screen.getByRole('button', { name: 'Open form' });
    await user.click(btn);
    const dlg = screen.getByRole('dialog', { name: 'Form' });
    expect(document.activeElement, 'a standalone Modal does not move focus').toBe(btn);
    expect(dlg.hasAttribute('tabindex')).toBe(false);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('R2 · a confirm over a Modal: one Escape dismisses only the confirm, the Modal stays, and the control that asked gets focus back', async () => {
    const user = userEvent.setup();
    const formClose = vi.fn();
    render(<><Modal open onClose={formClose} title="Form"><button type="button" onClick={() => confirmDialog('Discard this draft?')}>Discard</button></Modal><ConfirmHost /></>);
    const discard = screen.getByRole('button', { name: 'Discard' });
    await user.click(discard);
    await screen.findByRole('dialog', { name: 'Please confirm' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Please confirm' })).toBeNull());
    expect(formClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Form' })).toBeTruthy();
    expect(document.activeElement).toBe(discard);
    await user.keyboard('{Escape}');
    expect(formClose).toHaveBeenCalledTimes(1);
  });
  it('focus already moved to another surface when the drawer closes is left alone (no focus theft)', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open Y' }));
    const elsewhere = document.querySelector('[data-elsewhere]');
    act(() => elsewhere.focus());                                                     // e.g. a confirm dialog outside the panel took focus
    await user.keyboard('{Escape}');
    rerender(<Harness />);
    expect(document.activeElement).toBe(elsewhere);
  });
  it('Tab inside a nested dialog is left to that dialog (the drawer does not wrap it)', async () => {
    const user = userEvent.setup();
    render(<Harness nested />);
    await user.click(screen.getByRole('button', { name: 'Open Y' }));
    const nestedTwo = screen.getByRole('button', { name: 'Nested two' });
    act(() => nestedTwo.focus());
    const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    nestedTwo.dispatchEvent(e);
    expect(e.defaultPrevented, 'the drawer does not hijack Tab from a nested dialog').toBe(false);
  });
  it('Escape still calls onClose exactly once (existing close semantics)', async () => {
    const onClose = vi.fn();
    render(<Drawer open title="X" onClose={onClose}><button type="button">Inner</button></Drawer>);
    const user = userEvent.setup();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('REVIEW-RETURN-2 · Invoice drawer → Delete confirmation (real InvoicesView, Drawer, ConfirmHost and Modal)', () => {
  const invoiceDrawer = (n = 'INV-0001') => screen.queryByRole('dialog', { name: n });
  const confirmDlg = () => screen.queryByRole('dialog', { name: 'Please confirm' });
  async function mountInvoices({ strict = false } = {}) {
    const ui = <><main id="main-content" tabIndex={-1}><InvoicesView t={T.en} /></main><ConfirmHost /></>;
    const utils = render(strict ? <StrictMode>{ui}</StrictMode> : ui);
    await screen.findByText('INV-0001');
    return utils;
  }
  async function openInvoice(user, n = 'INV-0001') {
    await user.click(screen.getAllByText(n)[0]);                                      // the row itself (no tabindex)
    await waitFor(() => expect(invoiceDrawer(n)).toBeTruthy());
    return invoiceDrawer(n);
  }
  async function askDelete(user, drawer) {
    const del = within(drawer).getByRole('button', { name: 'Delete' });
    await user.click(del);
    await waitFor(() => expect(confirmDlg()).toBeTruthy());
    return del;
  }

  it('RED · focus enters the confirmation at Cancel (not the destructive Delete) while the invoice drawer stays mounted with its record', async () => {
    const user = userEvent.setup();
    await mountInvoices();
    const drawer = await openInvoice(user);
    await askDelete(user, drawer);
    const dlg = confirmDlg();
    expect(document.activeElement).toBe(within(dlg).getByRole('button', { name: 'Cancel' }));
    expect(document.activeElement).not.toBe(within(dlg).getByRole('button', { name: 'Delete' }));
    expect(invoiceDrawer()).toBe(drawer);
    expect(deleteInvoice).not.toHaveBeenCalled();
  });

  it('Tab and Shift+Tab stay inside the confirmation; neither the drawer nor the page can take focus', async () => {
    const user = userEvent.setup();
    await mountInvoices();
    const drawer = await openInvoice(user);
    const del = await askDelete(user, drawer);
    const dlg = confirmDlg();
    for (let i = 0; i < 5; i += 1) { await user.tab(); expect(dlg.contains(document.activeElement), `Tab #${i + 1}`).toBe(true); }
    for (let i = 0; i < 5; i += 1) { await user.tab({ shift: true }); expect(dlg.contains(document.activeElement), `Shift+Tab #${i + 1}`).toBe(true); }
    act(() => within(dlg).getByRole('button', { name: 'Delete' }).focus());
    await user.tab();
    expect(document.activeElement, 'Tab from the last control wraps to the first').toBe(within(dlg).getByRole('button', { name: 'Close' }));
    await user.tab({ shift: true });
    expect(document.activeElement, 'Shift+Tab from the first wraps to the last').toBe(within(dlg).getByRole('button', { name: 'Delete' }));
    act(() => del.focus());                                                            // focus forced beneath the confirmation
    await user.tab();
    expect(dlg.contains(document.activeElement), 'Tab from the drawer beneath goes back into the confirmation').toBe(true);
    act(() => document.activeElement.blur());
    await user.tab({ shift: true });
    expect(dlg.contains(document.activeElement), 'Shift+Tab from a dropped focus re-enters the confirmation').toBe(true);
    expect(deleteInvoice).not.toHaveBeenCalled();
  });

  it('RED · one Escape closes only the confirmation — same drawer and record, nothing deleted, focus back on Delete; a second Escape closes the drawer and page Tab resumes', async () => {
    const user = userEvent.setup();
    await mountInvoices();
    const drawer = await openInvoice(user);
    const del = await askDelete(user, drawer);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(confirmDlg()).toBeNull());
    expect(invoiceDrawer(), 'the same invoice drawer is still open').toBe(drawer);
    expect(deleteInvoice).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(del);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(invoiceDrawer()).toBeNull());
    const main = document.getElementById('main-content');
    expect(main.contains(document.activeElement)).toBe(true);
    await user.tab();
    expect(main.contains(document.activeElement) && document.activeElement !== main, 'ordinary page navigation resumes').toBe(true);
  });

  it.each([
    ['Cancel', () => within(confirmDlg()).getByRole('button', { name: 'Cancel' })],
    ['its visible Close', () => within(confirmDlg()).getByRole('button', { name: 'Close' })],
  ])('%s closes only the confirmation, returns focus to Delete, deletes nothing, and the drawer contains Tab again', async (_how, dismiss) => {
    const user = userEvent.setup();
    await mountInvoices();
    const drawer = await openInvoice(user);
    const del = await askDelete(user, drawer);
    await user.click(dismiss());
    await waitFor(() => expect(confirmDlg()).toBeNull());
    expect(invoiceDrawer()).toBe(drawer);
    expect(document.activeElement).toBe(del);
    expect(deleteInvoice).not.toHaveBeenCalled();
    for (let i = 0; i < 8; i += 1) { await user.tab(); expect(drawer.contains(document.activeElement), `Tab #${i + 1}`).toBe(true); }
    for (let i = 0; i < 8; i += 1) { await user.tab({ shift: true }); expect(drawer.contains(document.activeElement), `Shift+Tab #${i + 1}`).toBe(true); }
  });

  it('reopen → Cancel → reopen → Close, then another invoice (A → B): each return lands on the Delete that asked', async () => {
    const user = userEvent.setup();
    await mountInvoices();
    const drawerA = await openInvoice(user, 'INV-0001');
    const delA = await askDelete(user, drawerA);
    await user.click(within(confirmDlg()).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(confirmDlg()).toBeNull());
    expect(document.activeElement).toBe(delA);
    await askDelete(user, drawerA);
    await user.click(within(confirmDlg()).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(confirmDlg()).toBeNull());
    expect(document.activeElement).toBe(delA);
    await user.keyboard('{Escape}');                                                   // now the drawer is topmost: it closes
    await waitFor(() => expect(invoiceDrawer('INV-0001')).toBeNull());
    const drawerB = await openInvoice(user, 'INV-0002');
    const delB = await askDelete(user, drawerB);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(confirmDlg()).toBeNull());
    expect(invoiceDrawer('INV-0002')).toBe(drawerB);
    expect(document.activeElement).toBe(delB);
    expect(delA.isConnected).toBe(false);
    expect(deleteInvoice).not.toHaveBeenCalled();
  });

  it('StrictMode: focus enters at Cancel, one Escape closes only the confirmation, focus returns to Delete', async () => {
    const user = userEvent.setup();
    await mountInvoices({ strict: true });
    const drawer = await openInvoice(user);
    const del = await askDelete(user, drawer);
    expect(document.activeElement).toBe(within(confirmDlg()).getByRole('button', { name: 'Cancel' }));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(confirmDlg()).toBeNull());
    expect(invoiceDrawer()).toBe(drawer);
    expect(document.activeElement).toBe(del);
  });

  it('the record, the list scroll and the drawer scroll survive a cancelled confirmation', async () => {
    const user = userEvent.setup();
    await mountInvoices();
    const list = screen.getByRole('table').closest('.overflow-y-auto');
    list.scrollTop = 64;
    const drawer = await openInvoice(user);
    const body = drawer.querySelector('.overflow-y-auto');
    body.scrollTop = 40;
    const rows = screen.getAllByRole('row').length;
    await askDelete(user, drawer);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(confirmDlg()).toBeNull());
    expect(invoiceDrawer()).toBe(drawer);
    expect(drawer.getAttribute('aria-label')).toBe('INV-0001');
    expect(list.scrollTop).toBe(64);
    expect(body.scrollTop).toBe(40);
    expect(screen.getAllByRole('row').length).toBe(rows);
  });

  it('RED · one Escape still closes only the confirmation when the invoice view re-renders while it is open (the drawer\'s listener then runs after the confirmation\'s)', async () => {
    const user = userEvent.setup();
    let resolveIpcs;
    listIpcs.mockReturnValue(new Promise((r) => { resolveIpcs = r; }));             // InvoicesView: listIpcs().then(setIpcs) lands late
    await mountInvoices();
    const drawer = await openInvoice(user);
    const del = await askDelete(user, drawer);
    // A browser runs a microtask checkpoint between the listeners of a real key press, so React has already
    // committed the confirmation's close when the next listener runs. This listener, registered after the
    // confirmation's and before the drawer re-registers, reproduces that checkpoint with flushSync.
    const checkpoint = () => flushSync(() => {});
    document.addEventListener('keydown', checkpoint);
    try {
      await act(async () => { resolveIpcs([{ id: 'p-late', status: 'draft' }]); });   // re-render: the drawer's onClose changes → its listener re-registers last
      await user.keyboard('{Escape}');
      await waitFor(() => expect(confirmDlg()).toBeNull());
      expect(invoiceDrawer(), 'the drawer survives the Escape that dismissed the confirmation').toBe(drawer);
      expect(document.activeElement).toBe(del);
      expect(deleteInvoice).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', checkpoint);
    }
    await user.keyboard('{Escape}');                                                  // a second, distinct Escape closes the drawer
    await waitFor(() => expect(invoiceDrawer()).toBeNull());
  });

  it('Confirm keeps the business path exactly: deleteInvoice(invoice id) once, the drawer closes, the list reloads, focus lands on a live node', async () => {
    const user = userEvent.setup();
    await mountInvoices();
    const drawer = await openInvoice(user);
    await askDelete(user, drawer);
    await user.click(within(confirmDlg()).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteInvoice).toHaveBeenCalledTimes(1));
    expect(deleteInvoice).toHaveBeenCalledWith('inv-1');
    await waitFor(() => expect(invoiceDrawer()).toBeNull());
    await waitFor(() => expect(listInvoices).toHaveBeenCalledTimes(2));
    expect(document.activeElement.isConnected).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('main-content'));
  });
});

describe('REVIEW-RETURN-3 · Invoice opener (real InvoicesView, Drawer, ConfirmHost and Modal)', () => {
  const opener = (n) => screen.queryByRole('button', { name: `Open invoice ${n}` });
  const drawerFor = (n) => screen.queryByRole('dialog', { name: n });
  const confirmDlg = () => screen.queryByRole('dialog', { name: 'Please confirm' });
  const main = () => document.getElementById('main-content');
  const rowOf = (n) => screen.getAllByRole('row').find((r) => r.cells[0]?.textContent === n);
  async function mount() {
    render(<><main id="main-content" tabIndex={-1}><InvoicesView t={T.en} /></main><ConfirmHost /></>);
    await screen.findByText('INV-0001');
  }
  // Real keyboard reachability: walk the page with Tab until the control has focus.
  async function tabTo(user, el, max = 40) {
    for (let i = 0; i < max && document.activeElement !== el; i += 1) await user.tab();
    return document.activeElement === el;
  }

  it('RED · every invoice has exactly one keyboard-reachable opener around its reference, named for it, with no nested control; table semantics intact', async () => {
    const user = userEvent.setup();
    await mount();
    const a = opener('INV-0001');
    const b = opener('INV-0002');
    expect(a, 'INV-0001 has an opener').toBeTruthy();
    expect(b, 'INV-0002 has an opener').toBeTruthy();
    expect(a.tagName).toBe('BUTTON');
    expect(a.getAttribute('type')).toBe('button');
    expect(a.textContent, 'the visible reference is unchanged').toBe('INV-0001');
    expect(a.querySelector('button, a, input, select, textarea, [tabindex]')).toBeNull();
    expect(rowOf('INV-0001').cells[0].contains(a)).toBe(true);
    expect(rowOf('INV-0001').querySelectorAll('button, a[href], [tabindex]').length, 'one control per row').toBe(1);
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getAllByRole('row').map((r) => r.cells[0].textContent)).toEqual(['Invoice #', 'INV-0001', 'INV-0002']);
    expect(await tabTo(user, a), 'Tab reaches invoice A').toBe(true);
    await user.tab();
    expect(document.activeElement, 'the next Tab reaches invoice B, in list order').toBe(b);
  });

  it('RED · A: Enter opens exactly invoice A; Escape returns focus to A\'s opener; ordinary Tab resumes', async () => {
    const user = userEvent.setup();
    await mount();
    const a = opener('INV-0001');
    expect(await tabTo(user, a)).toBe(true);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(drawerFor('INV-0001')).toBeTruthy());
    expect(drawerFor('INV-0002')).toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(drawerFor('INV-0001')).toBeNull());
    expect(document.activeElement, 'focus returns to invoice A').toBe(a);
    await user.tab();
    expect(document.activeElement).toBe(opener('INV-0002'));
  });

  it('RED · B: Space opens exactly invoice B (never A); the visible Close returns focus to B\'s opener', async () => {
    const user = userEvent.setup();
    await mount();
    const b = opener('INV-0002');
    expect(await tabTo(user, b)).toBe(true);
    await user.keyboard(' ');
    await waitFor(() => expect(drawerFor('INV-0002')).toBeTruthy());
    expect(drawerFor('INV-0001'), 'B never opens A').toBeNull();
    await user.click(within(drawerFor('INV-0002')).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(drawerFor('INV-0002')).toBeNull());
    expect(document.activeElement).toBe(b);
    expect(document.activeElement).not.toBe(opener('INV-0001'));
  });

  it('RED · pointer anywhere on the row still opens that invoice, and closing returns focus to its opener — not the page', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(rowOf('INV-0002').cells[4]);                                   // the amount cell, not the button
    await waitFor(() => expect(drawerFor('INV-0002')).toBeTruthy());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(drawerFor('INV-0002')).toBeNull());
    expect(document.activeElement, 'not #main-content').toBe(opener('INV-0002'));
    await user.click(opener('INV-0001'));                                            // pointer on the reference itself
    await waitFor(() => expect(drawerFor('INV-0001')).toBeTruthy());
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await user.click(within(drawerFor('INV-0001')).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(drawerFor('INV-0001')).toBeNull());
    expect(document.activeElement).toBe(opener('INV-0001'));
  });

  it('scrolled list: order and scroll position are unchanged by a keyboard review round-trip', async () => {
    const user = userEvent.setup();
    await mount();
    const list = screen.getByRole('table').closest('.overflow-y-auto');
    list.scrollTop = 48;
    const order = screen.getAllByRole('row').map((r) => r.cells[0].textContent);
    const b = opener('INV-0002');
    act(() => b.focus());
    await user.keyboard('{Enter}');
    await waitFor(() => expect(drawerFor('INV-0002')).toBeTruthy());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(drawerFor('INV-0002')).toBeNull());
    expect(document.activeElement).toBe(b);
    expect(list.scrollTop).toBe(48);
    expect(screen.getAllByRole('row').map((r) => r.cells[0].textContent)).toEqual(order);
  });

  it('RED · nested confirmation: Cancel returns to the drawer\'s Delete, then closing the drawer returns to the invoice\'s opener', async () => {
    const user = userEvent.setup();
    await mount();
    const a = opener('INV-0001');
    expect(await tabTo(user, a)).toBe(true);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(drawerFor('INV-0001')).toBeTruthy());
    const del = within(drawerFor('INV-0001')).getByRole('button', { name: 'Delete' });
    await user.click(del);
    await waitFor(() => expect(confirmDlg()).toBeTruthy());
    await user.click(within(confirmDlg()).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(confirmDlg()).toBeNull());
    expect(document.activeElement, 'back on the drawer\'s Delete').toBe(del);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(drawerFor('INV-0001')).toBeNull());
    expect(document.activeElement, 'then back on the invoice\'s opener').toBe(a);
    expect(deleteInvoice).not.toHaveBeenCalled();
  });

  it('RED · a deleted invoice takes its opener with it: after Confirm and the reload, focus goes to the page landmark — never <body>', async () => {
    const user = userEvent.setup();
    listInvoices.mockResolvedValueOnce(INVOICES).mockResolvedValueOnce([INVOICES[1]]);  // the reload no longer has INV-0001
    await mount();
    const a = opener('INV-0001');
    expect(await tabTo(user, a)).toBe(true);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(drawerFor('INV-0001')).toBeTruthy());
    await user.click(within(drawerFor('INV-0001')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(confirmDlg()).toBeTruthy());
    await user.click(within(confirmDlg()).getByRole('button', { name: 'Delete' }));       // business path via the spy only
    await waitFor(() => expect(deleteInvoice).toHaveBeenCalledWith('inv-1'));
    await waitFor(() => expect(opener('INV-0001')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(main()));
    expect(opener('INV-0002')).toBeTruthy();
  });

  it('RED · the reference keeps its cell\'s look: the button adds only start alignment (the UA centres button text); font, colour and focus ring come from the cell and the global button style', async () => {
    await mount();
    const a = opener('INV-0001');
    expect(a.className).toBe('text-start');
    expect(a.getAttribute('style')).toBeNull();
    expect(rowOf('INV-0001').cells[0].className).toBe('px-4 py-2.5 mono font-semibold');
  });

  // A save or a delete reloads the list: the table is swapped for "Loading invoices…" while the request
  // is in flight, so every invoice button is replaced. Each reload here is held open until the test lets
  // it arrive, as a network round-trip is (an instant mock would batch the swap away).
  it('RED · Edit → Save reloads the list under the open drawer (renamed and re-ordered); closing returns to that invoice\'s new opener, found by id — not by its old text or its old position', async () => {
    const user = userEvent.setup();
    const renamed = { ...INVOICES[1], invoice_number: 'INV-0002-R', issue_date: '2026-09-20' };  // now sorts first
    let saved = false;
    let arrive;
    listInvoices.mockImplementation(() => (saved ? new Promise((r) => { arrive = () => r([renamed, INVOICES[0]]); }) : Promise.resolve(INVOICES)));
    updateInvoice.mockImplementation(async () => { saved = true; return renamed; });
    await mount();
    const b = opener('INV-0002');
    expect(await tabTo(user, b)).toBe(true);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(drawerFor('INV-0002')).toBeTruthy());
    await user.click(within(drawerFor('INV-0002')).getByRole('button', { name: 'Edit' }));
    const number = await screen.findByPlaceholderText('INV-2026-052');
    await user.clear(number);
    await user.type(number, 'INV-0002-R');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByText('Loading invoices…')).toBeTruthy());
    expect(b.isConnected, 'the button the drawer captured is gone').toBe(false);
    await act(async () => arrive());
    await waitFor(() => expect(opener('INV-0002-R')).toBeTruthy());
    expect(updateInvoice).toHaveBeenCalledTimes(1);
    expect(updateInvoice.mock.calls[0][0]).toBe('inv-2');
    expect(drawerFor('INV-0002-R'), 'the drawer stayed open on the saved record').toBeTruthy();
    expect(screen.getAllByRole('row').map((r) => r.cells[0].textContent)).toEqual(['Invoice #', 'INV-0002-R', 'INV-0001']);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(drawerFor('INV-0002-R')).toBeNull());
    expect(document.activeElement, 'the same invoice\'s current opener, not #main-content').toBe(opener('INV-0002-R'));
    await user.tab();
    expect(document.activeElement, 'ordinary Tab resumes in the new list order').toBe(opener('INV-0001'));
    expect(deleteInvoice).not.toHaveBeenCalled();
  });

  it('closing while the list is still reloading after a save: the page landmark takes focus, and the list arriving later does not move it', async () => {
    const user = userEvent.setup();
    let saved = false;
    let arrive;
    listInvoices.mockImplementation(() => (saved ? new Promise((r) => { arrive = () => r(INVOICES); }) : Promise.resolve(INVOICES)));
    updateInvoice.mockImplementation(async () => { saved = true; return INVOICES[0]; });
    await mount();
    expect(await tabTo(user, opener('INV-0001'))).toBe(true);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(drawerFor('INV-0001')).toBeTruthy());
    await user.click(within(drawerFor('INV-0001')).getByRole('button', { name: 'Edit' }));
    await user.type(await screen.findByPlaceholderText('INV-2026-052'), 'INV-0001');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByText('Loading invoices…')).toBeTruthy());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(drawerFor('INV-0001')).toBeNull());
    expect(document.activeElement, 'no opener exists yet: the page landmark').toBe(main());
    await act(async () => arrive());
    await waitFor(() => expect(opener('INV-0001')).toBeTruthy());
    expect(document.activeElement, 'the arriving list does not take focus').toBe(main());
  });

  describe('a delete that completes after the drawer has closed', () => {
    async function deleteThenClose(user) {
      let finish;
      let arrive;
      let deleted = false;
      deleteInvoice.mockImplementation(() => new Promise((r) => { finish = r; }));
      listInvoices.mockImplementation(() => (deleted ? new Promise((r) => { arrive = () => r([INVOICES[1]]); }) : Promise.resolve(INVOICES)));
      await mount();
      const a = opener('INV-0001');
      expect(await tabTo(user, a)).toBe(true);
      await user.keyboard('{Enter}');
      await waitFor(() => expect(drawerFor('INV-0001')).toBeTruthy());
      await user.click(within(drawerFor('INV-0001')).getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(confirmDlg()).toBeTruthy());
      await user.click(within(confirmDlg()).getByRole('button', { name: 'Delete' }));     // business path via the spy only
      await waitFor(() => expect(deleteInvoice).toHaveBeenCalledWith('inv-1'));
      await waitFor(() => expect(confirmDlg()).toBeNull());
      await user.keyboard('{Escape}');                                                  // closed while the delete is pending
      await waitFor(() => expect(drawerFor('INV-0001')).toBeNull());
      expect(document.activeElement, 'the drawer returned to the invoice being deleted').toBe(a);
      return {
        finish: async () => { deleted = true; await act(async () => finish()); await waitFor(() => expect(screen.getByText('Loading invoices…')).toBeTruthy()); },
        arrive: async () => { await act(async () => arrive()); await waitFor(() => expect(opener('INV-0002')).toBeTruthy()); },
      };
    }

    it('RED · focus on the deleted invoice\'s opener goes to the page landmark — never <body> — and stays there when the list arrives; ordinary Tab resumes', async () => {
      const user = userEvent.setup();
      const { finish, arrive } = await deleteThenClose(user);
      await finish();
      expect(document.activeElement).toBe(main());
      await arrive();
      expect(opener('INV-0001')).toBeNull();
      expect(document.activeElement).toBe(main());
      await user.tab();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Refresh' }));
      expect(deleteInvoice).toHaveBeenCalledTimes(1);
    });

    it('RED · focus the user moved to another invoice\'s opener (replaced by the reload too) goes to the page landmark — never <body>', async () => {
      const user = userEvent.setup();
      const { finish, arrive } = await deleteThenClose(user);
      await user.tab();
      expect(document.activeElement).toBe(opener('INV-0002'));
      await finish();
      expect(document.activeElement).toBe(main());
      await arrive();
      expect(document.activeElement).toBe(main());
    });

    it('focus the user moved outside the list is left where it is', async () => {
      const user = userEvent.setup();
      const { finish, arrive } = await deleteThenClose(user);
      await user.tab({ shift: true });
      const moved = document.activeElement;
      expect(moved).toBe(screen.getByRole('button', { name: 'New Invoice' }));
      await finish();
      expect(document.activeElement).toBe(moved);
      await arrive();
      expect(document.activeElement).toBe(moved);
    });
  });
});
