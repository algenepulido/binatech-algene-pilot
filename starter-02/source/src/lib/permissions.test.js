import { describe, it, expect } from 'vitest';
import { canView, can, canApprove, normRole, roleLabel } from './permissions.js';

describe('role normalization', () => {
  it('maps legacy/synonym values onto canonical roles', () => {
    expect(normRole('owner')).toBe('admin');
    expect(normRole('Inspector')).toBe('site_eng');
    expect(normRole('accountant')).toBe('commercial');
    expect(roleLabel('owner')).toBe('Admin');
  });
});

describe('module visibility', () => {
  it('hides contractor-internal modules from consultant & client', () => {
    for (const m of ['pos', 'portal', 'ap', 'receiving']) {
      expect(canView('consultant', m)).toBe(false);
      expect(canView('client', m)).toBe(false);
    }
    expect(canView('admin', 'pos')).toBe(true);
    expect(canView('commercial', 'pos')).toBe(true);
  });
  it('hides commercial modules from inspectors/QC', () => {
    expect(canView('site_eng', 'qs')).toBe(false);
    expect(canView('qc_officer', 'qs')).toBe(false);
    expect(canView('qc_officer', 'qc')).toBe(true);
  });
  it('user management is admin-only', () => {
    expect(canView('admin', 'team')).toBe(true);
    expect(canView('qs', 'team')).toBe(false);
    expect(canView('viewer', 'team')).toBe(false);
  });
  it('unmapped modules are visible to everyone; null role shows all', () => {
    expect(canView('viewer', 'dashboard')).toBe(true);
    expect(canView(null, 'pos')).toBe(true); // loading
  });
});

describe('action capability', () => {
  it('inspector can raise WIRs but not certify IPCs', () => {
    expect(can('site_eng', 'wir.edit')).toBe(true);
    expect(can('site_eng', 'ipc.compose')).toBe(false);
    expect(canApprove('site_eng', 'ipc.certify')).toBe(false);
  });
  it('null/loading role DENIES capabilities (fail closed) but still shows modules', () => {
    expect(can(null, 'wir.edit')).toBe(false);
    expect(can('', 'boq.edit')).toBe(false);
    expect(canApprove(null, 'ipc.certify')).toBe(false);
    expect(canView(null, 'pos')).toBe(true); // visibility stays permissive
  });
  it('QC officer records tests but cannot edit BoQ', () => {
    expect(can('qc_officer', 'qc.record')).toBe(true);
    expect(can('qc_officer', 'boq.edit')).toBe(false);
  });
  it('only consultant/client/admin approve WIRs; QS does not', () => {
    expect(canApprove('consultant', 'wir.approve')).toBe(true);
    expect(canApprove('admin', 'wir.approve')).toBe(true);
    expect(canApprove('qs', 'wir.approve')).toBe(false);
  });
  it('viewer can do nothing; unknown action fails closed', () => {
    expect(can('viewer', 'wir.edit')).toBe(false);
    expect(can('admin', 'nonexistent.action')).toBe(false);
  });
});
