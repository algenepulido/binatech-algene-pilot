// ============================================================
// IFC parsing — reads an uploaded .ifc file with the web-ifc engine and
// extracts the physical building elements (with their real IFC GlobalId)
// AND each element's spatial storey/level (from the IFC spatial structure).
// web-ifc is loaded lazily (it's a ~1MB WASM engine) only when needed.
// The WASM file is served from /web-ifc/ (see public/web-ifc/).
// ============================================================

// IFC physical building-element types we care about for QA/QC linking.
const BUILDING_ELEMENT_TYPES = [
  'IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCCOLUMN', 'IFCBEAM', 'IFCSLAB',
  'IFCDOOR', 'IFCWINDOW', 'IFCROOF', 'IFCSTAIR', 'IFCSTAIRFLIGHT',
  'IFCRAILING', 'IFCRAMP', 'IFCRAMPFLIGHT', 'IFCCURTAINWALL', 'IFCFOOTING',
  'IFCMEMBER', 'IFCPLATE', 'IFCPILE', 'IFCCOVERING', 'IFCCHIMNEY',
  'IFCBUILDINGELEMENTPROXY',
];

/**
 * Parse an IFC file (ArrayBuffer) and return building elements:
 * [{ guid, name, ifc_type, level }]. Deduplicated by GUID. `level` is the
 * containing IfcBuildingStorey name (or null if not placed in a storey).
 */
export async function parseIfcBuildingElements(arrayBuffer, onProgress) {
  const WebIFC = await import('web-ifc');
  const api = new WebIFC.IfcAPI();
  api.SetWasmPath('/web-ifc/');
  await api.Init();

  const modelID = api.OpenModel(new Uint8Array(arrayBuffer));
  const seen = new Set();
  const out = [];
  const expressToGuid = new Map(); // expressID -> guid (to resolve spatial containment)

  for (const typeName of BUILDING_ELEMENT_TYPES) {
    const typeCode = WebIFC[typeName];
    if (typeCode == null) continue;
    let ids;
    try { ids = api.GetLineIDsWithType(modelID, typeCode); } catch { continue; }
    const n = ids.size();
    for (let i = 0; i < n; i++) {
      const expressID = ids.get(i);
      let line;
      try { line = api.GetLine(modelID, expressID); } catch { continue; }
      const guid = line?.GlobalId?.value;
      if (!guid || seen.has(guid)) continue;
      seen.add(guid);
      expressToGuid.set(expressID, guid);
      out.push({
        guid,
        name: (line?.Name?.value || '').toString().trim() || typeName.replace('IFC', ''),
        ifc_type: typeName.replace('IFC', ''),
        level: null,
      });
    }
    if (onProgress) onProgress(out.length);
  }

  // --- Spatial structure: map each element to its IfcBuildingStorey name ---
  try {
    const levelByGuid = buildLevelMap(api, WebIFC, modelID, expressToGuid);
    for (const el of out) { if (levelByGuid.has(el.guid)) el.level = levelByGuid.get(el.guid); }
  } catch { /* spatial info is best-effort; elements still work without a level */ }

  // --- Base quantities (IfcElementQuantity): volume / area / length per element.
  //     This is what enables quantity x rate valuation. Best-effort: many IFCs
  //     omit them (then the app allows manual entry).
  let withVol = 0, withArea = 0, withLen = 0;
  try {
    const qByGuid = buildQuantityMap(api, WebIFC, modelID, expressToGuid);
    for (const el of out) {
      const q = qByGuid.get(el.guid);
      if (q) {
        if (q.volume != null) { el.volume = q.volume; withVol++; }
        if (q.area != null) { el.area = q.area; withArea++; }
        if (q.length != null) { el.length = q.length; withLen++; }
      }
    }
  } catch (e) { /* quantities best-effort */ }
  // Summary so the upload flow + the developer can see if this IFC carries qtys.
  // eslint-disable-next-line no-console
  console.info(`IFC quantities: ${withVol}/${out.length} elements have volume, ${withArea} area, ${withLen} length.`);

  try { api.CloseModel(modelID); } catch { /* ignore */ }
  out.quantitySummary = { total: out.length, withVolume: withVol, withArea, withLength: withLen };
  return out;
}

const numOf = (v) => { const n = Number(v); return isFinite(n) ? n : null; };

// Element GUID -> { volume, area, length } from IfcElementQuantity base quantities,
// attached via IfcRelDefinesByProperties. Prefers Net* over Gross* values.
function buildQuantityMap(api, WebIFC, modelID, expressToGuid) {
  const qByGuid = new Map();
  const EQ = WebIFC.IFCELEMENTQUANTITY;
  let rels;
  try { rels = api.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYPROPERTIES); } catch { return qByGuid; }
  for (let i = 0; i < rels.size(); i++) {
    let rel; try { rel = api.GetLine(modelID, rels.get(i)); } catch { continue; }
    const pdRef = rel?.RelatingPropertyDefinition?.value;
    if (pdRef == null) continue;
    let pd; try { pd = api.GetLine(modelID, pdRef); } catch { continue; }
    if (pd?.type !== EQ) continue;
    const quants = Array.isArray(pd.Quantities) ? pd.Quantities : [];
    let volume = null, area = null, length = null, volNet = false, areaNet = false;
    for (const qref of quants) {
      let q; try { q = api.GetLine(modelID, qref?.value); } catch { continue; }
      const nm = (q?.Name?.value || '').toString();
      const net = /net/i.test(nm);
      if (q?.VolumeValue != null) { const v = numOf(q.VolumeValue?.value ?? q.VolumeValue); if (v != null && (volume == null || (net && !volNet))) { volume = v; volNet = net; } }
      else if (q?.AreaValue != null) { const v = numOf(q.AreaValue?.value ?? q.AreaValue); if (v != null && (area == null || (net && !areaNet))) { area = v; areaNet = net; } }
      else if (q?.LengthValue != null) { const v = numOf(q.LengthValue?.value ?? q.LengthValue); if (v != null && (length == null || /length/i.test(nm))) length = v; }
    }
    const relObjs = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [];
    for (const o of relObjs) {
      const guid = expressToGuid.get(o?.value);
      if (!guid) continue;
      const cur = qByGuid.get(guid) || {};
      if (volume != null) cur.volume = volume;
      if (area != null) cur.area = area;
      if (length != null) cur.length = length;
      qByGuid.set(guid, cur);
    }
  }
  return qByGuid;
}

// Resolve element GUID -> storey name using IfcRelContainedInSpatialStructure.
function buildLevelMap(api, WebIFC, modelID, expressToGuid) {
  const levelByGuid = new Map();
  // storey expressID -> display name
  const storeyName = new Map();
  try {
    const storeys = api.GetLineIDsWithType(modelID, WebIFC.IFCBUILDINGSTOREY);
    for (let i = 0; i < storeys.size(); i++) {
      const id = storeys.get(i);
      const s = api.GetLine(modelID, id);
      const nm = (s?.Name?.value || s?.LongName?.value || '').toString().trim();
      storeyName.set(id, nm || `Storey ${i + 1}`);
    }
  } catch { /* ignore */ }

  try {
    const rels = api.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
    for (let i = 0; i < rels.size(); i++) {
      const rel = api.GetLine(modelID, rels.get(i));
      const structRef = rel?.RelatingStructure?.value;
      const name = storeyName.get(structRef);
      if (!name) continue; // structure may be a space/site, not a storey
      const related = Array.isArray(rel?.RelatedElements) ? rel.RelatedElements : [];
      for (const r of related) {
        const guid = expressToGuid.get(r?.value);
        if (guid) levelByGuid.set(guid, name);
      }
    }
  } catch { /* ignore */ }

  return levelByGuid;
}
