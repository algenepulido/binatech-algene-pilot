// ============================================================
// Project context — the editable project identity (name, code, client,
// contractor, consultant, revision). Falls back to the built-in defaults
// in data/project.js until a row is saved via the Settings screen.
// useProject() returns an object shaped exactly like the old PROJECT, so
// components can swap `PROJECT.x` for `project.x`.
// ============================================================
import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { PROJECT } from '../data/project.js';
import { getProjectSettings } from '../api/projectSettings.js';
import { getProject } from '../api/projects.js';
import { subscribeProject, isSampleProject, getCurrentProjectId, getCurrentProjectMeta } from './currentProject.js';
import { useAuth } from './auth.jsx';

const ProjectContext = createContext(null);

// Identity = defaults  <  projects-table row (name/client/consultant)  <  project_settings row.
function mergeProject(defaults, settings, projectRow) {
  let p = { ...defaults };
  if (projectRow) {
    p = {
      ...p,
      name: projectRow.name || p.name,
      nameAr: projectRow.name_ar || p.nameAr,
      client: projectRow.client || p.client,
      contractor: projectRow.contractor || p.contractor,
      consultant: projectRow.consultant || p.consultant,
      code: projectRow.code || (projectRow.id ? String(projectRow.id).slice(0, 8).toUpperCase() : p.code),
    };
  }
  if (settings) {
    p = {
      ...p,
      code: settings.code || p.code,
      name: settings.name || p.name,
      nameAr: settings.name_ar || p.nameAr,
      client: settings.client || p.client,
      contractor: settings.contractor || p.contractor,
      consultant: settings.consultant || p.consultant,
      revision: settings.revision || p.revision,
    };
  }
  return p;
}

export function ProjectProvider({ children }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [projectRow, setProjectRow] = useState(null);
  const [meta, setMeta] = useState(getCurrentProjectMeta());

  const reload = useCallback(async () => {
    try { setSettings(await getProjectSettings()); } catch { /* not signed in / not configured */ }
    try { setProjectRow(isSampleProject() ? null : await getProject(getCurrentProjectId())); } catch { setProjectRow(null); }
  }, []);

  useEffect(() => { if (user) reload(); }, [user, reload]);
  // Re-read identity whenever the open project changes.
  useEffect(() => subscribeProject(() => { setSettings(null); setProjectRow(null); setMeta(getCurrentProjectMeta()); reload(); }), [reload]);

  // Identity base = hardcoded defaults, but for a non-sample project overlay the
  // KNOWN open-project meta so the label follows the open project even when the
  // projects row can't be fetched. projectRow + settings still win when present.
  const project = useMemo(() => {
    const base = isSampleProject() ? PROJECT : { ...PROJECT, ...(meta || {}) };
    return mergeProject(base, settings, projectRow);
  }, [meta, settings, projectRow]);
  return <ProjectContext.Provider value={{ project, settings, reload }}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  return useContext(ProjectContext) ?? { project: PROJECT, settings: null, reload: () => {} };
}
