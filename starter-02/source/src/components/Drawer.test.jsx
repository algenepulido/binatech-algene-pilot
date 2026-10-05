// Drawer — the contract that makes it safe to swap in for Modal:
// same open/close semantics, but the list behind stays visible
// (light backdrop) and "Open full record" is a first-class affordance.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Drawer } from './Drawer.jsx';

afterEach(cleanup);

describe('Drawer', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<Drawer open={false} title="X">body</Drawer>);
    expect(container.firstChild).toBeNull();
  });

  it('renders title, subtitle, body and footer when open', () => {
    render(
      <Drawer open title="WIR-001" subtitle="Column inspection" footer={<button>Done</button>}>
        <div>record body</div>
      </Drawer>,
    );
    expect(screen.getByText('WIR-001')).toBeTruthy();
    expect(screen.getByText('Column inspection')).toBeTruthy();
    expect(screen.getByText('record body')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('WIR-001');
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<Drawer open title="X" onClose={onClose}>body</Drawer>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop mousedown but not on panel clicks', () => {
    const onClose = vi.fn();
    render(<Drawer open title="X" onClose={onClose}>body</Drawer>);
    fireEvent.mouseDown(screen.getByText('body'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByTestId('drawer-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the table behind readable: light backdrop, no blur', () => {
    render(<Drawer open title="X">body</Drawer>);
    const backdrop = screen.getByTestId('drawer-backdrop');
    // The whole point of the drawer: context preservation. A heavy or
    // blurred backdrop would regress it back into a modal.
    expect(backdrop.style.background).toContain('0.18');
    expect(backdrop.style.backdropFilter || '').toBe('');
  });

  it('shows "Open full record" only when onOpenFull is provided, and calls it', () => {
    const onOpenFull = vi.fn();
    const { rerender } = render(<Drawer open title="X">body</Drawer>);
    expect(screen.queryByText('Open full record')).toBeNull();
    rerender(<Drawer open title="X" onOpenFull={onOpenFull}>body</Drawer>);
    fireEvent.click(screen.getByText('Open full record'));
    expect(onOpenFull).toHaveBeenCalledTimes(1);
  });

  it('anchors to the reading end using a logical property, so RTL works without a class swap', () => {
    const { container } = render(<Drawer open title="X">body</Drawer>);
    const css = container.querySelector('style').textContent;
    // inset-inline-end resolves to the right in LTR and the left in RTL, so the
    // browser handles direction — no JS branch to drift out of sync.
    expect(css).toContain('inset-inline-end: 0');
  });

  it('flips the shadow direction in RTL', () => {
    document.documentElement.dir = 'rtl';
    try {
      const { container } = render(<Drawer open title="X">body</Drawer>);
      expect(container.querySelector('style').textContent).toContain('24px 0 64px');
    } finally {
      document.documentElement.dir = 'ltr';
    }
  });

  it('becomes a bottom sheet on phones instead of a shrunken side panel', () => {
    const { container } = render(<Drawer open title="X">body</Drawer>);
    const css = container.querySelector('style').textContent;
    expect(css).toContain('@media (max-width: 639px)');
    // Full width, anchored to the bottom, with the list still visible above.
    expect(css).toContain('width: 100%');
    expect(css).toContain('border-radius: 18px 18px 0 0');
  });

  it('is a programmatic focus target, not a keyboard-reachable control', () => {
    render(<Drawer open title="X">body</Drawer>);
    const panel = screen.getByRole('dialog');
    // tabIndex -1 means "focus moves here on open" — it must NOT advertise
    // itself in the tab order, and the global focus-visible ring in index.css
    // is scoped away from it (that ring was also squaring off the mobile
    // sheet's rounded corners, since it sets border-radius: 4px).
    expect(panel.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(panel);
  });

  it('reserves the home-indicator safe area so actions are never under it', () => {
    render(<Drawer open title="X" footer={<button>Done</button>}>body</Drawer>);
    const footer = screen.getByText('Done').parentElement;
    expect(footer.style.paddingBottom).toContain('safe-area-inset-bottom');
  });
});
