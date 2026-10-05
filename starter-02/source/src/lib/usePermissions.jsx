// ============================================================
// usePermissions — exposes the signed-in user's functional role + capability
// checks to any view, so action buttons can gate on the permission matrix
// (src/lib/permissions.js). The provider is fed the role AppShell already
// loads; components call usePermissions() and use can()/canApprove().
//
// UI layer only — RLS is the real enforcement. While the role is still loading
// (null), capability checks (can / canApprove) DENY (fail closed) so actions are
// never enabled before the role is known; module visibility (canView) stays
// permissive so the shell doesn't flicker. `loading` exposes the null state.
// ============================================================
import { createContext, useContext, useMemo } from 'react';
import { can as canFn, canApprove as canApproveFn, canView as canViewFn, normRole } from './permissions.js';

const PermissionContext = createContext({ role: null });

export function PermissionProvider({ role, children }) {
  const value = useMemo(() => ({
    role,
    roleId: normRole(role),
    loading: role == null,
    can: (action) => canFn(role, action),
    canApprove: (action) => canApproveFn(role, action),
    canView: (navId) => canViewFn(role, navId),
  }), [role]);
  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions() {
  return useContext(PermissionContext);
}
