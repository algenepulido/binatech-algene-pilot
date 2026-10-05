import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './Modal.jsx';
import { STATUS_PILL_COLORS } from './primitives.jsx';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<Modal open={false} title="Hidden" onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders title, subtitle and children when open', () => {
    render(<Modal open title="Raise WIR" subtitle="sub" onClose={() => {}}><div>body</div></Modal>);
    expect(screen.getByRole('dialog', { name: 'Raise WIR' })).toBeTruthy();
    expect(screen.getByText('sub')).toBeTruthy();
    expect(screen.getByText('body')).toBeTruthy();
  });

  it('Escape closes (no keyboard trap)', () => {
    const onClose = vi.fn();
    render(<Modal open title="T" onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('close button closes', () => {
    const onClose = vi.fn();
    render(<Modal open title="T" onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('StatusPill color map', () => {
  it('covers every workflow status used across the app', () => {
    for (const k of ['Approved', 'Rejected', 'Pending', 'In Progress', 'Pass', 'Fail', 'Open', 'Closed', 'Paid', 'Certified', 'Draft', 'Under Review', 'Critical', 'Major', 'Minor']) {
      expect(STATUS_PILL_COLORS[k], `missing color for ${k}`).toBeTruthy();
      expect(STATUS_PILL_COLORS[k].bg).toMatch(/^#/);
      expect(STATUS_PILL_COLORS[k].fg).toMatch(/^#/);
    }
  });
});
