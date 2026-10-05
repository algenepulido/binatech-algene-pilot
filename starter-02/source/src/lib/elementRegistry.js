// ============================================================
// Imported-elements registry loader. Joins, for the project's ACTIVE model, each
// element with its provenance (when it arrived) and linkage: linked BoQ line
// codes, and WIR / QC / NCR counts. One project-scoped query per table, tallied
// in memory — so the registry is one round-trip set, fast even with thousands of
// elements. Every part degrades to empty on error (never throws to the page).
// ============================================================
import { supabase } from './supabase.js';
import { getCurrentProjectId } from './currentProject.js';
import { listActiveElements } from '../api/models.js';
import { listAllLinks } from '../api/elementBoqLinks.js';
import { listBoqItems } from '../api/boqItems.js';

// Pull element_guid (+ optional extra columns) for a project-scoped table.
// Resilient: a missing table/column yields no rows rather than an error.
async function rowsByGuid(table, projectId, extra = '') {
  try {
    const sel = `element_guid${extra ? `, ${extra}` : ''}`;
    const { data, error } = await supabase.from(table).select(sel).eq('project_id', projectId);
    if (error) return [];
    return data || [];
  } catch { return []; }
}
const tally = (rows) => { const m = {}; for (const r of rows) { const g = r.element_guid; if (g) m[g] = (m[g] || 0) + 1; } return m; };

export async function loadElementRegistry(projectId = getCurrentProjectId()) {
  const [elements, links, boq, wRows, qRows, nRows] = await Promise.all([
    listActiveElements(projectId).catch(() => []),
    listAllLinks(projectId).catch(() => []),
    listBoqItems(projectId).catch(() => []),
    rowsByGuid('wirs', projectId),
    rowsByGuid('qc_tests', projectId),
    rowsByGuid('ncrs', projectId, 'status'),
  ]);

  const boqById = new Map(boq.map((b) => [b.id, b]));
  const boqByGuid = {};
  const addBoq = (guid, id) => { const b = boqById.get(id); if (b) (boqByGuid[guid] = boqByGuid[guid] || []).push(b.code || '(no code)'); };
  links.forEach((l) => addBoq(l.element_guid, l.boq_item_id));
  boq.forEach((b) => { if (b.element_id) addBoq(b.element_id, b.id); }); // legacy single link

  const wir = tally(wRows), qc = tally(qRows), ncr = tally(nRows);
  const ncrOpen = {};
  for (const r of nRows) { const g = r.element_guid; if (g && !/clos|void|cancel|reject/i.test(r.status || '')) ncrOpen[g] = (ncrOpen[g] || 0) + 1; }

  return elements.map((e) => ({
    guid: e.guid,
    // Friendly label: user display-name alias when set, else the IFC name.
    name: e.user_display_name || e.name || '',
    displayName: e.user_display_name ?? null, // the explicit alias (null if unset)
    ifcName: e.name || '',
    material: e.user_material ?? null,
    description: e.description ?? null,
    type: e.ifc_type || '',
    level: e.level ?? null,
    volume: e.volume ?? null, area: e.area ?? null, length: e.length ?? null,
    importedAt: e.imported_at ?? e.created_at ?? null,
    boqCodes: boqByGuid[e.guid] || [],
    wir: wir[e.guid] || 0,
    qc: qc[e.guid] || 0,
    ncr: ncr[e.guid] || 0,
    ncrOpen: ncrOpen[e.guid] || 0,
  }));
}
