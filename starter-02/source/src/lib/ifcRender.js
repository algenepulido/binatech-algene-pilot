// ============================================================
// IFC → three.js geometry. Loads an .ifc (ArrayBuffer) with web-ifc and
// builds a THREE.Group of meshes, each tagged with its element's IFC GUID
// so the viewer can map a clicked mesh back to a real element record.
// web-ifc is loaded lazily; WASM is served from /web-ifc/.
// ============================================================

export async function buildIfcScene(arrayBuffer, THREE) {
  const WebIFC = await import('web-ifc');
  const api = new WebIFC.IfcAPI();
  api.SetWasmPath('/web-ifc/');
  await api.Init();

  const modelID = api.OpenModel(new Uint8Array(arrayBuffer));
  const group = new THREE.Group();
  const guidCache = new Map();

  const guidFor = (expressID) => {
    if (guidCache.has(expressID)) return guidCache.get(expressID);
    let g = null;
    try { g = api.GetLine(modelID, expressID)?.GlobalId?.value ?? null; } catch { /* ignore */ }
    guidCache.set(expressID, g);
    return g;
  };

  api.StreamAllMeshes(modelID, (flatMesh) => {
    const expressID = flatMesh.expressID;
    const guid = guidFor(expressID);
    const placed = flatMesh.geometries;
    for (let i = 0; i < placed.size(); i++) {
      const pg = placed.get(i);
      const geom = api.GetGeometry(modelID, pg.geometryExpressID);
      const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
      const indices = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());

      // web-ifc vertex data is interleaved: [px,py,pz, nx,ny,nz] per vertex.
      const count = verts.length / 6;
      const pos = new Float32Array(count * 3);
      const nor = new Float32Array(count * 3);
      for (let v = 0; v < count; v++) {
        pos[v * 3] = verts[v * 6]; pos[v * 3 + 1] = verts[v * 6 + 1]; pos[v * 3 + 2] = verts[v * 6 + 2];
        nor[v * 3] = verts[v * 6 + 3]; nor[v * 3 + 1] = verts[v * 6 + 4]; nor[v * 3 + 2] = verts[v * 6 + 5];
      }
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      bg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      bg.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

      const c = pg.color;
      const mat = new THREE.MeshLambertMaterial({
        color: new THREE.Color(c.x, c.y, c.z),
        transparent: c.w < 1, opacity: c.w, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(bg, mat);
      mesh.matrix.fromArray(pg.flatTransformation);
      mesh.matrixAutoUpdate = false;
      mesh.userData = { expressID, guid };
      group.add(mesh);
    }
  });

  try { api.CloseModel(modelID); } catch { /* ignore */ }

  // Recenter around origin (IFC site coords can be far from 0,0,0).
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  group.position.sub(center);
  const size = box.getSize(new THREE.Vector3()).length() || 10;

  return { group, radius: size / 2 };
}
