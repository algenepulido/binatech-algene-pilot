// ============================================================
// Elements context — the source of truth for "link to element" dropdowns.
// Uses the active uploaded IFC model's real elements when available;
// otherwise falls back to the built-in 35 sample elements so the app keeps
// working before any model is uploaded.
// ============================================================
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { ELEMENTS } from '../data/elements.js';
import { listActiveElements } from '../api/models.js';
import { subscribeProject, isSampleProject } from './currentProject.js';
import { useAuth } from './auth.jsx';

const ElementsContext = createContext(null);

export function ElementsProvider({ children }) {
  const { user } = useAuth();
  const [dbEls, setDbEls] = useState(null);

  const reload = useCallback(async () => {
    try { setDbEls(await listActiveElements()); } catch { setDbEls([]); }
  }, []);
  useEffect(() => { if (user) reload(); }, [user, reload]);
  // Reload the element list whenever the open project changes.
  useEffect(() => subscribeProject(() => { setDbEls(null); reload(); }), [reload]);

  const value = useMemo(() => {
    const usingModel = Array.isArray(dbEls) && dbEls.length > 0;
    // Normalize to { id, guid, name, type }. For real model elements the id IS the GUID.
    // The 35 built-in sample elements are ONLY used on the sample project — a real
    // project with no model yet shows an empty list (prompting an upload).
    const elements = usingModel
      // `name` is the FRIENDLY label used across lists/links/hover: the user's
      // display name when set, else the IFC name. `ifcName` keeps the raw IFC
      // name (read-only, shown in the panel). User metadata is additive only.
      ? dbEls.map((e) => ({ id: e.guid, guid: e.guid, name: e.user_display_name || e.name, ifcName: e.name, type: e.ifc_type, level: e.level || null, package_id: e.package_id || null, description: e.description ?? null, displayName: e.user_display_name ?? null, material: e.user_material ?? null, zone: e.user_zone ?? null, notes: e.user_notes ?? null, volume: e.volume ?? null, area: e.area ?? null, length: e.length ?? null }))
      : (isSampleProject() ? ELEMENTS : []);
    const byGuid = (g) => elements.find((e) => e.guid === g) || null;
    const byId = (i) => elements.find((e) => e.id === i) || null;
    return { elements, usingModel, loading: dbEls === null, byGuid, byId, reload };
  }, [dbEls, reload]);

  return <ElementsContext.Provider value={value}>{children}</ElementsContext.Provider>;
}

export function useElements() {
  return useContext(ElementsContext) ?? {
    elements: ELEMENTS, usingModel: false,
    byGuid: (g) => ELEMENTS.find((e) => e.guid === g) || null,
    byId: (i) => ELEMENTS.find((e) => e.id === i) || null,
    reload: () => {},
  };
}
