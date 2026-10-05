import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const state = vi.hoisted(() => ({
  phone: true,
  user: { email: 'fahad@example.com', user_metadata: { full_name: 'Fahad Al-Mutairi' } },
  signOut: vi.fn(),
}));

vi.mock('../lib/auth.jsx', () => ({
  useAuth: () => ({ user: state.user, openAuth: vi.fn(), signOut: state.signOut }),
}));
vi.mock('../lib/project.jsx', () => ({
  useProject: () => ({
    project: {
      id: 'project-1',
      code: 'CLP-001',
      name: 'Coastal Logistics Park — Northern Infrastructure Package',
      nameAr: 'مجمع الخدمات اللوجستية الساحلي — حزمة البنية التحتية الشمالية',
    },
  }),
}));
vi.mock('../lib/stats.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    loadCounts: vi.fn().mockResolvedValue(original.EMPTY_COUNTS),
    loadFinance: vi.fn().mockResolvedValue({ total: 0, approvedValue: 0, pendingValue: 0, blockedValue: 0, certifiedIpc: 0 }),
  };
});
vi.mock('../api/access.js', () => ({ getMyRole: vi.fn().mockResolvedValue('site_eng') }));

import AppShell from '../AppShell.jsx';
import { Header } from './Header.jsx';

const mediaQuery = (query) => ({
  matches: state.phone && /max-width:(767|1024)px/.test(query),
  media: query,
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(),
});

const renderHeader = (props = {}) => render(
  <Header
    t={{ tagline: 'Quality Control', search: 'Search' }}
    lang="en"
    setLang={vi.fn()}
    route="quick"
    onMenuToggle={vi.fn()}
    setRoute={vi.fn()}
    {...props}
  />,
);

const pixels = (value) => Number.parseFloat(value) || 0;

beforeEach(() => {
  state.phone = true;
  state.signOut.mockClear();
  window.matchMedia = vi.fn(mediaQuery);
  window.location.hash = '#/app/more';
});

afterEach(() => cleanup());

describe('MOBILE-SHELL-1 — authenticated phone chrome', () => {
  it('keeps exactly current project, Language and Notifications as >=44px phone targets — no drawer opener (MOB-UI1)', () => {
    renderHeader();

    const controls = [...document.querySelectorAll('[data-phone-shell-control]')];
    expect(controls).toHaveLength(3);
    for (const control of controls) {
      const style = getComputedStyle(control);
      expect(pixels(style.minHeight || style.height), control.getAttribute('aria-label') || control.title).toBeGreaterThanOrEqual(44);
      expect(pixels(style.minWidth || style.width), control.getAttribute('aria-label') || control.title).toBeGreaterThanOrEqual(44);
    }

    expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull();
    expect(screen.getByTitle('Switch project')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Switch language to Arabic' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
  });

  it('gives a long current-project name the flexible, ellipsizing slot and a viewport-contained picker', () => {
    renderHeader();
    const projectButton = screen.getByTitle('Switch project');
    const projectName = screen.getByText(/Coastal Logistics Park/);
    const slot = projectButton.closest('[data-phone-project-slot]');

    expect(slot).toBeTruthy();
    expect(pixels(getComputedStyle(slot).minWidth)).toBe(0);
    expect(getComputedStyle(projectButton).width).toBe('100%');
    expect(getComputedStyle(projectName).textOverflow).toBe('ellipsis');

    fireEvent.click(projectButton);
    const picker = document.querySelector('[data-project-picker]');
    expect(picker).toBeTruthy();
    expect(getComputedStyle(picker).width).toBe('calc(100vw - 16px)');
  });

  it('removes duplicate brand and account actions only from the phone header', () => {
    renderHeader();
    expect(screen.queryByTitle('Projects home')).toBeNull();
    expect(screen.queryByTitle('fahad@example.com')).toBeNull();
    expect(screen.queryByTitle('Sign out')).toBeNull();
  });

  it('preserves the existing brand, avatar and sign-out chrome on tablet/desktop', () => {
    state.phone = false;
    renderHeader();
    expect(screen.getByTitle('Projects home')).toBeTruthy();
    expect(screen.getByTitle('fahad@example.com')).toBeTruthy();
    expect(screen.getByTitle('Sign out')).toBeTruthy();
    expect(document.querySelectorAll('[data-phone-shell-control]')).toHaveLength(0);
  });

  it('binds the signed-in frame to dynamic viewport height without making the shell a scroll surface', async () => {
    const { container } = render(<AppShell />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'All tasks' })).toBeTruthy());
    const root = container.firstElementChild;
    const content = root.querySelector('[data-app-content]');

    expect(root.style.height).toBe('100dvh');
    expect(pixels(root.style.minHeight)).toBe(0);
    expect(root.style.overflow).toBe('hidden');
    expect(content).toBeTruthy();
    expect(pixels(content.style.minHeight)).toBe(0);
    expect(content.style.overflow).toBe('hidden');

    const sameRoot = root;
    window.innerHeight = 560;
    fireEvent(window, new Event('resize'));
    expect(container.firstElementChild).toBe(sameRoot);
    expect(root.style.height).toBe('100dvh');
  });
});
