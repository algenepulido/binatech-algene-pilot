// ============================================================
// CaptureSheet entry — frame C, "What are you recording?".
//
// The design draws THREE options. §13 classifies local draft measurements as
// Planned and says so explicitly: "the third Capture-entry option ... a
// production build omits all three." So two ship, and the third must not
// appear as a greyed row — the design deletes unavailable tasks rather than
// disabling them.
// ============================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CaptureSheet } from './CaptureSheet.jsx';

vi.mock('../../lib/project.jsx', () => ({ useProject: () => ({ project: { name: 'Coastal Logistics Park', code: 'P2' } }) }));
vi.mock('../../lib/captureDrafts.js', () => ({ listDraftCaptures: () => Promise.resolve([]), saveDraftCapture: () => {} }));
vi.mock('../../api/wirs.js', () => ({ listWirs: () => new Promise(() => {}) }));
vi.mock('../../lib/attachments.js', () => ({ uploadAttachment: () => Promise.resolve({}) }));

afterEach(() => cleanup());
const view = (p = {}) => render(<CaptureSheet open onClose={() => {}} onNavigate={() => {}} t={{}} lang="en" {...p} />);
const num = (v) => parseFloat(v) || 0;
const options = () => [...document.querySelectorAll('[data-capture-option]')];

describe('C · Capture entry', () => {
  it('(C1) asks what is being recorded, against the bound project', () => {
    view();
    expect(screen.getByRole('heading', { name: /what are you recording\?/i })).toBeTruthy();
    expect(screen.getByText(/Coastal Logistics Park/)).toBeTruthy();
  });

  it('(C2) exactly two options ship — draft measurement is Planned in §13', () => {
    view();
    expect(options().length).toBe(2);
    expect(screen.getByText(/work progress/i)).toBeTruthy();
    expect(screen.getByText(/inspection request/i)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/draft measurement/i);
  });

  it('(C3) no unavailable option is shipped disabled instead of absent', () => {
    view();
    for (const b of options()) {
      expect(b.disabled).toBe(false);
      expect(b.getAttribute('aria-disabled')).not.toBe('true');
    }
  });

  it('(C4) the options are 92px fill cards, no borders, never nested', () => {
    view();
    for (const b of options()) {
      const cs = getComputedStyle(b);
      expect(num(cs.minHeight)).toBeGreaterThanOrEqual(92);
      expect(num(cs.borderTopWidth) + num(cs.borderBottomWidth) + num(cs.borderLeftWidth) + num(cs.borderRightWidth)).toBe(0);
      expect(num(cs.borderRadius)).toBe(14);
      expect(b.parentElement.closest('[data-capture-option]')).toBeNull();
    }
  });

  it('(C5) Inspection request reaches the live raise-a-WIR path and closes', () => {
    const onNavigate = vi.fn(); const onClose = vi.fn();
    view({ onNavigate, onClose });
    fireEvent.click(screen.getByRole('button', { name: /inspection request/i }));
    expect(onNavigate).toHaveBeenCalledWith('wirs');
    expect(onClose).toHaveBeenCalled();
  });

  it('(C6) Work progress enters the guided flow rather than leaving the sheet', () => {
    const onNavigate = vi.fn();
    view({ onNavigate });
    fireEvent.click(screen.getByRole('button', { name: /work progress/i }));
    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: /what are you recording\?/i })).toBeNull();
  });

  it('(C7) Cancel is a >=48px control that closes the sheet', () => {
    const onClose = vi.fn();
    view({ onClose });
    const cancel = screen.getByRole('button', { name: /cancel/i });
    expect(num(getComputedStyle(cancel).minHeight || getComputedStyle(cancel).height)).toBeGreaterThanOrEqual(48);
    fireEvent.click(cancel);
    expect(onClose).toHaveBeenCalled();
  });

  it('(C8) Arabic renders RTL from the dictionary', () => {
    view({ lang: 'ar', t: { fmWhatRecording: 'ماذا تسجّل؟', fmWorkProgress: 'تقدم العمل' } });
    expect(document.querySelector('[dir="rtl"]')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'ماذا تسجّل؟' })).toBeTruthy();
  });
});
