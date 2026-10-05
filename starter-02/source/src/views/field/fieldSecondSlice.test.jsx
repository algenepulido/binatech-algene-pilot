import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FieldRail } from '../../components/FieldRail.jsx';
import { PersonaliseActionsSheet } from './PersonaliseActionsSheet.jsx';
import { fieldTaskCatalog } from './fieldTaskCatalog.js';

afterEach(cleanup);

describe('Field Mode Target J/T — authority-safe personalisation and tablet rail', () => {
  it('filters mutating WIR tasks out for a viewer before personalisation', () => {
    const tasks = fieldTaskCatalog({ role: 'viewer' });
    expect(tasks.map((task) => task.key)).not.toContain('raise');
    expect(tasks.map((task) => task.key)).not.toContain('progress');
    expect(tasks.map((task) => task.key)).toEqual(expect.arrayContaining(['review', 'find', 'docs', 'model']));
  });

  it('limits the pinned subset to four permitted tasks and saves the chosen order', () => {
    const catalogue = fieldTaskCatalog({ role: 'admin' });
    const onSave = vi.fn();
    render(<PersonaliseActionsSheet open catalogue={catalogue} value={['raise', 'progress', 'review', 'model']} onSave={onSave} onCancel={() => {}} />);
    expect(screen.getByText(/4 of 4 chosen/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /find a record/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /remove open the model/i }));
    expect(onSave).toHaveBeenCalledWith(['raise', 'progress', 'review'], false);
  });

  it('renders the five tablet destinations in the same order and routes Capture inline', () => {
    const onCapture = vi.fn();
    render(<FieldRail route="quick" onNavigate={() => {}} onCapture={onCapture} />);
    expect([...document.querySelectorAll('[data-field-rail] button')].map((button) => button.textContent)).toEqual(['Home', 'Work', 'Capture', 'Find', 'More']);
    fireEvent.click(screen.getByRole('button', { name: /capture/i }));
    expect(onCapture).toHaveBeenCalledOnce();
  });
});
