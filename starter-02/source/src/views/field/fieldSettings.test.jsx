import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FieldSettings } from './FieldSettings.jsx';

const signOut = vi.fn();
vi.mock('../../lib/auth.jsx', () => ({ useAuth: () => ({ user: { email: 'fahad@example.com', user_metadata: { full_name: 'Fahad Al-Mutairi' } }, signOut }) }));
vi.mock('../../lib/project.jsx', () => ({ useProject: () => ({ project: { contractor: 'Najd Contracting Co.' } }) }));

describe('K · phone settings', () => {
  it('shows only the implemented identity, language, Gregorian date and logout rows', () => {
    render(<FieldSettings role="site_eng" lang="en" />);
    expect(screen.getByText('Fahad Al-Mutairi')).toBeTruthy();
    expect(screen.getByText('Site Engineer / Inspector')).toBeTruthy();
    expect(screen.getByText('Najd Contracting Co.')).toBeTruthy();
    expect(screen.getByText('Gregorian')).toBeTruthy();
    expect(screen.queryByText(/biometric|trusted devices|hijri/i)).toBeNull();
  });

  it('switches language and uses the real sign-out action', () => {
    const setLang = vi.fn();
    render(<FieldSettings role="site_eng" lang="en" setLang={setLang} />);
    fireEvent.click(screen.getByRole('button', { name: 'AR' }));
    expect(setLang).toHaveBeenCalledWith('ar');
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));
    expect(signOut).toHaveBeenCalled();
  });
});
