import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileNav } from './MobileNav.jsx';
import { T } from '../i18n/translations.js';

describe('MobileNav — Field Mode tabs (HOME / WORK / CAPTURE / FIND / MORE)', () => {
  it('renders the field tabs in English', () => {
    render(<MobileNav t={T.en} route="quick" onNavigate={() => {}} onMenu={() => {}} onCapture={() => {}} counts={{}} />);
    expect(screen.getByText('Home')).toBeTruthy();
    // Find replaced Scan in the bar: same surface, the design's name for it.
    expect(screen.getByText('Find')).toBeTruthy();
    expect(screen.getByText('Work')).toBeTruthy();
    expect(screen.getByText('More')).toBeTruthy();
    expect(screen.getByText('Capture')).toBeTruthy();
    // The phone is a field tool, not the desktop sidebar in miniature: no
    // direct WIRs/BoQ tabs — those live behind Home cards and More.
    expect(screen.queryByText('WIRs')).toBeNull();
    expect(screen.queryByText('BoQ')).toBeNull();
  });
  it('translates the field tabs to Arabic', () => {
    render(<MobileNav t={T.ar} route="quick" onNavigate={() => {}} onMenu={() => {}} onCapture={() => {}} counts={{}} />);
    expect(screen.getByText('الرئيسية')).toBeTruthy();
    expect(screen.getByText('بحث')).toBeTruthy();
    expect(screen.getByText('الأعمال')).toBeTruthy();
    expect(screen.getByText('المزيد')).toBeTruthy();
  });
  it('Find and Work route to the field destinations; Capture opens the sheet', () => {
    const onNavigate = vi.fn(); const onCapture = vi.fn();
    render(<MobileNav t={T.en} route="quick" onNavigate={onNavigate} onMenu={() => {}} onCapture={onCapture} counts={{}} />);
    fireEvent.click(screen.getByText('Find'));
    expect(onNavigate).toHaveBeenCalledWith('scan');
    fireEvent.click(screen.getByText('Work'));
    expect(onNavigate).toHaveBeenCalledWith('work');
    fireEvent.click(screen.getByRole('button', { name: /Capture/i }));
    expect(onCapture).toHaveBeenCalled();
  });
  it('keeps Capture visible but fail-closed when the role cannot upload evidence', () => {
    const onCapture = vi.fn();
    render(<MobileNav t={T.en} route="quick" onNavigate={() => {}} onMenu={() => {}} onCapture={onCapture} canCapture={false} counts={{}} />);
    const button = screen.getByRole('button', { name: /Capture/i });
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onCapture).not.toHaveBeenCalled();
  });
});
