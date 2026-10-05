// ============================================================
// MoreView — frame L, "All tasks". The design merges four bordered task tiles
// into one surface of rows and deletes the not-yet-available group, because
// those tasks are gone rather than pending.
//
// §14/02 records that the six verb phrases are proposed, not ratified: if the
// product already names these differently the catalogue follows that finding.
// These tests pin the SET and the destinations, not the wording.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

let MoreView;
beforeEach(async () => { ({ MoreView } = await import('./MoreView.jsx')); });
afterEach(() => cleanup());

const view = (p = {}) => render(<MoreView t={{}} lang="en" onNavigate={() => {}} onCapture={() => {}} {...p} />);
const num = (v) => parseFloat(v) || 0;

describe('L · More / all tasks', () => {
  it('(M1) the seven tasks (MOB-UI1.1 adds Drawings) are one surface of rows, not tiles', () => {
    view();
    const surface = document.querySelector('[data-tasks]');
    expect(surface).toBeTruthy();
    expect(surface.getAttribute('data-field-surface')).not.toBeNull();
    const rows = [...surface.querySelectorAll('button')];
    expect(rows.length).toBe(7);
    const cs = getComputedStyle(surface);
    expect(num(cs.borderTopWidth) + num(cs.borderBottomWidth)).toBe(0);
  });

  it('(M2) every task reaches a destination that exists today', () => {
    const onNavigate = vi.fn(); const onCapture = vi.fn();
    view({ onNavigate, onCapture });
    const go = (name) => fireEvent.click(screen.getByRole('button', { name }));
    go(/raise a wir/i); expect(onNavigate).toHaveBeenCalledWith('wirs');
    go(/review my wirs/i); expect(onNavigate).toHaveBeenCalledWith('wirs');
    go(/find a record/i); expect(onNavigate).toHaveBeenCalledWith('scan');
    go(/view project documents/i); expect(onNavigate).toHaveBeenCalledWith('dms');
    go(/open the model/i); expect(onNavigate).toHaveBeenCalledWith('model');
    go(/record site progress/i); expect(onCapture).toHaveBeenCalled();
  });

  it('(M3) the not-yet-available group is gone — no disabled or inert task', () => {
    view();
    for (const b of document.querySelectorAll('button')) {
      expect(b.disabled, b.textContent.slice(0, 24)).toBe(false);
      expect(b.getAttribute('aria-disabled')).not.toBe('true');
    }
    expect(document.body.textContent).not.toMatch(/coming soon|not available|not yet/i);
  });

  it('(M4) search is a real >=48px field at >=16px, so the phone does not zoom', () => {
    view();
    const input = document.querySelector('[data-task-search]');
    expect(input).toBeTruthy();
    const cs = getComputedStyle(input);
    expect(num(cs.minHeight || cs.height)).toBeGreaterThanOrEqual(48);
    expect(num(cs.fontSize)).toBeGreaterThanOrEqual(16);
    expect(num(cs.borderRadius)).toBeLessThanOrEqual(8);
  });

  it('(M5) search filters the catalogue rather than decorating it', () => {
    view();
    fireEvent.change(document.querySelector('[data-task-search]'), { target: { value: 'model' } });
    const rows = [...document.querySelectorAll('[data-tasks] button')];
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toMatch(/model/i);
  });

  it('(M6 · MOB-UI1) the desktop module-tree drawer is gone below 1024: no "All modules & tools" row; Documents and Settings stay one tap away', () => {
    const onNavigate = vi.fn();
    view({ onNavigate });
    expect(screen.queryByRole('button', { name: /all modules/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /view project documents/i })); expect(onNavigate).toHaveBeenCalledWith('dms');
    fireEvent.click(screen.getByRole('button', { name: /settings/i })); expect(onNavigate).toHaveBeenCalledWith('settings');
  });

  it('(M7) every control is a >=44px non-pill target', () => {
    view();
    for (const b of document.querySelectorAll('button')) {
      const cs = getComputedStyle(b);
      expect(num(cs.minHeight || cs.height), b.textContent.slice(0, 20)).toBeGreaterThanOrEqual(44);
      expect(num(cs.borderRadius), b.textContent.slice(0, 20)).toBeLessThanOrEqual(8);
    }
  });

  it('(M8) Arabic renders RTL from the dictionary', () => {
    view({ lang: 'ar', t: { fmAllTasks: 'كل المهام', fmRaiseWir: 'إنشاء طلب فحص' } });
    expect(document.querySelector('[dir="rtl"]')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'كل المهام' })).toBeTruthy();
  });
});
