// ============================================================
// IfcViewer — renders an uploaded .ifc model in three.js with orbit controls,
// click-to-select, hover tooltips, a status "heatmap" (colour each element by
// its derived certification status), isolate/hide/show-all, and standard views.
//
// Performance:
// - Colours/visibility are applied in ONE pass over the meshes only when
//   something changes (selection, status toggle, isolate/hide) — never per
//   frame. Colouring 731 meshes on a toggle is sub-millisecond.
// - Hover raycasts are throttled to one per animation frame and skipped while
//   orbiting; only ~2 meshes change material on a hover change.
// (The earlier magnifier inset was removed — it added little inspection value
//  over the selected-element highlight and cost a second scene render.)
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { Maximize2, Palette, Focus, Eye, EyeOff, Expand, Shrink, MousePointerClick, Keyboard, X } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildIfcScene } from '../lib/ifcRender.js';
import { ESTATUS } from '../lib/elementStatus.js';
import { COL } from '../lib/theme.js';
import { vlog } from '../lib/viewerDebug.js';
import { isTypingTarget, escPlan, keyAction, PAN_FRACTION, NAV_LEGEND } from '../lib/viewerNav.js';

const SEL_COLOR = '#1d4ed8', PICK_COLOR = '#3b82f6', DIM_COLOR = '#d4d4d8';
// Selecting an element NO LONGER yanks the camera. We only ease closer when the
// element is genuinely too small to see — i.e. its projected height is below
// this fraction of the viewport. ~12% sits in the "hard to inspect/click" zone;
// above it the element is comfortably visible, so the camera is left untouched.
const MIN_VISIBLE_FRAC = 0.12;
// Selection model: a tap (pointer press→release within a few px) selects the
// element under it; any larger movement is a drag and is left entirely to
// OrbitControls (orbit/pan/zoom). Flip to false to fall back to the browser's
// native click selection if this ever misbehaves. ENABLED after review — with
// native click, releasing an orbit drag also fired a click and could select or
// deselect by accident; the tap threshold is what makes navigation feel calm.
const SELECT_NAV = true;
const HINT_KEY = 'bimqc.viewer.hint.v1';
const LEGEND = [
  ['approved', 'Clear to certify'],
  ['ncr', 'Blocked / NCR'],
  ['in_progress', 'In progress'],
  ['not_started', 'Not started'],
];

// Parsed-model cache: keep the last loaded model's geometry in memory so
// switching tabs and coming back doesn't re-download the IFC from R2 AND
// re-parse it with web-ifc. Keyed by model id+version; bounded to one model
// (any other cached model is disposed). The cached group is reused across
// viewer mounts (BufferGeometry is renderer-independent; three re-uploads it).
const SCENE_CACHE = new Map();
function disposeGroup(g) { g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); }); }
// Free every cached model except `key` (frees their geometry/materials). Called
// at load-start so switching projects can't leave the previous model's geometry
// resident even if the new load errors before it reaches cacheScene().
function evictExcept(key) {
  for (const [k, g] of SCENE_CACHE) { if (k !== key) { disposeGroup(g); SCENE_CACHE.delete(k); } }
}
function cacheScene(key, group) {
  evictExcept(key);
  SCENE_CACHE.set(key, group);
}

export function IfcViewer({ fileUrl, selectedGuid, onSelect, highlightGuids = [], statusMap = {}, metaByGuid = {}, cacheKey = null, isFullscreen = false, onToggleFullscreen = null, multiSelect = false, onToggleMultiSelect = null }) {
  const mountRef = useRef(null);
  const st = useRef({});
  const [status, setStatus] = useState('loading');
  const [phase, setPhase] = useState('downloading');
  const [pct, setPct] = useState(null);
  const [error, setError] = useState(null);
  const [colorByStatus, setColorByStatus] = useState(false);
  const [isolated, setIsolated] = useState(null); // Set | null
  const [hidden, setHidden] = useState(() => new Set());
  const [hoverInfo, setHoverInfo] = useState(null); // { name, type, x, y } | null
  const [helpOpen, setHelpOpen] = useState(false);
  // One-time first-run hint chip (mouse/keys summary); dismissed = never again.
  const [hintShown, setHintShown] = useState(() => {
    try { return !localStorage.getItem(HINT_KEY); } catch { return false; }
  });
  const dismissHint = () => { setHintShown(false); try { localStorage.setItem(HINT_KEY, '1'); } catch { /* ignore */ } };

  useEffect(() => {
    let disposed = false;
    const mount = mountRef.current;
    if (!mount || !fileUrl) return undefined;
    vlog('mount', { cacheKey });
    const w = mount.clientWidth || 600, h = mount.clientHeight || 400;

    const scene = new THREE.Scene(); scene.background = new THREE.Color('#f5f5f7');
    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1e6);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const d1 = new THREE.DirectionalLight(0xffffff, 0.8); d1.position.set(1, 2, 1); scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xffffff, 0.35); d2.position.set(-1, -1, -1); scene.add(d2);
    // Smooth, professional standard navigation (damped orbit / pan / scroll-zoom
    // toward the cursor). NOT a literal Revit nav-tool clone — just a comfortable
    // standard orbit camera that stays smooth on a large model.
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;        // glide to rest, no jitter
    controls.zoomToCursor = true;         // scroll-wheel zoom toward the pointer
    controls.screenSpacePanning = true;   // pan parallel to the screen (comfortable)
    controls.rotateSpeed = 0.85;
    controls.zoomSpeed = 0.9;
    controls.panSpeed = 0.85;
    const raycaster = new THREE.Raycaster(); const mouse = new THREE.Vector2();

    st.current = { ...st.current, scene, camera, renderer, controls, group: null, dragging: false, hoverMesh: null, prevSelForFrame: undefined };

    const frameFrom = (dirVec) => {
      const g = st.current.group; if (!g) return;
      g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g); if (box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxSize = Math.max(size.x, size.y, size.z) || 10;
      const fitH = maxSize / (2 * Math.atan((Math.PI * camera.fov) / 360));
      const dist = 1.3 * Math.max(fitH, fitH / camera.aspect);
      camera.position.copy(center).addScaledVector(dirVec.clone().normalize(), dist);
      camera.near = Math.max(0.01, dist / 1000); camera.far = dist * 1000; camera.updateProjectionMatrix();
      controls.target.copy(center); controls.update();
    };
    st.current.fitView = () => frameFrom(new THREE.Vector3(1, 0.8, 1));
    st.current.setView = (name) => frameFrom(name === 'top' ? new THREE.Vector3(0, 1, 0.0001) : name === 'front' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0.8, 1));

    // Animated camera move — used to ease gently toward a tiny/off-screen
    // selection. (Esc no longer "pops back" a history stack; it fits the whole
    // model in one press — see the Escape handler below.)
    let tweenId = 0;
    const tweenCam = (toPos, toTarget, ms = 340) => {
      const id = ++tweenId;
      const fromPos = camera.position.clone(), fromT = controls.target.clone();
      const t0 = performance.now();
      const ease = (t) => 1 - Math.pow(1 - t, 3);
      const step = (now) => {
        if (id !== tweenId) { vlog('tween cancelled', id); return; } // a newer tween (or user action) took over
        const p = Math.min(1, (now - t0) / ms), e = ease(p);
        camera.position.lerpVectors(fromPos, toPos, e);
        controls.target.lerpVectors(fromT, toTarget, e);
        controls.update();
        if (p < 1) requestAnimationFrame(step);
        else vlog('tween done', camera.position.toArray().map((n) => n.toFixed(1)).join(','));
      };
      requestAnimationFrame(step);
    };
    // Keyboard navigation primitives (arrows orbit, shift+arrows pan, +/- zoom).
    st.current.orbitBy = (az, pol) => {
      const offset = camera.position.clone().sub(controls.target);
      const sph = new THREE.Spherical().setFromVector3(offset);
      sph.theta += az;
      sph.phi = Math.min(Math.PI - 0.05, Math.max(0.05, sph.phi + pol));
      offset.setFromSpherical(sph);
      camera.position.copy(controls.target).add(offset);
      controls.update();
    };
    st.current.panBy = (dx, dy) => {
      const dist = camera.position.distanceTo(controls.target) * PAN_FRACTION;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).multiplyScalar(dx * dist);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1).multiplyScalar(-dy * dist);
      const move = right.add(up);
      camera.position.add(move); controls.target.add(move); controls.update();
    };
    st.current.zoomBy = (factor) => {
      const offset = camera.position.clone().sub(controls.target).multiplyScalar(factor);
      camera.position.copy(controls.target).add(offset); controls.update();
    };
    // Is this element already big enough on screen to inspect? True = leave the
    // camera alone. Measures the element's projected height as a fraction of the
    // viewport (via its bounding sphere's angular size), and requires its centre
    // to be on screen and in front of the camera.
    const _fwd = new THREE.Vector3();
    const isAdequatelyVisible = (guid) => {
      const gr = st.current.group; if (!gr || !guid) return false;
      const mesh = gr.children.find((m) => m.userData?.guid === guid && m.visible !== false);
      if (!mesh) return false;
      mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(mesh); if (box.isEmpty()) return false;
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const radius = sphere.radius || 0.001;
      camera.getWorldDirection(_fwd);
      const depth = sphere.center.clone().sub(camera.position).dot(_fwd); // along view axis
      if (depth <= radius) return false;          // behind camera / camera inside it
      const ndc = sphere.center.clone().project(camera);
      if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1) return false; // centre off screen
      const vfov = (camera.fov * Math.PI) / 180;
      const frac = (2 * Math.atan(radius / depth)) / vfov;          // viewport-height fraction
      return frac >= MIN_VISIBLE_FRAC;
    };

    // Ease the camera to frame a SET of elements COMFORTABLY with context — never
    // slammed in tight. Dollies along the current view direction (no spin); a
    // generous margin + a floor derived from the whole model keep neighbours in
    // view. Smooth tween by default (never an instant snap).
    const frameTargets = (guids, tween = true) => {
      const gr = st.current.group; if (!gr) return;
      const box = new THREE.Box3(); let found = false;
      for (const guid of guids) {
        const mesh = gr.children.find((m) => m.userData?.guid === guid && m.visible !== false);
        if (mesh) { mesh.updateMatrixWorld(true); box.expandByObject(mesh); found = true; }
      }
      if (!found || box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxSize = Math.max(size.x, size.y, size.z) || 1;
      const fitH = maxSize / (2 * Math.atan((Math.PI * camera.fov) / 360));
      let dist = 3.4 * Math.max(fitH, fitH / camera.aspect); // breathing room, not tight
      const gbox = new THREE.Box3().setFromObject(gr);
      if (!gbox.isEmpty()) {
        const gsize = gbox.getSize(new THREE.Vector3());
        const gMax = Math.max(gsize.x, gsize.y, gsize.z) || maxSize;
        const gFitH = gMax / (2 * Math.atan((Math.PI * camera.fov) / 360));
        dist = Math.max(dist, 1.3 * Math.max(gFitH, gFitH / camera.aspect) * 0.22); // context floor
      }
      let dir = camera.position.clone().sub(controls.target);
      if (!isFinite(dir.x) || dir.length() < 1e-6) dir = new THREE.Vector3(1, 0.8, 1);
      dir.normalize();
      const toPos = center.clone().addScaledVector(dir, dist);
      camera.near = Math.max(0.01, dist / 1000); camera.far = Math.max(camera.far, dist * 1000); camera.updateProjectionMatrix();
      if (tween) tweenCam(toPos, center, 420);
      else { camera.position.copy(toPos); controls.target.copy(center); controls.update(); }
    };

    // Selection-driven camera move — the whole point of this behaviour. PRESERVE
    // the current view if ANY element in the selection is already adequately
    // visible (single OR multi-select). Only when nothing is visible do we
    // capture the current view (so Esc can restore it) and gently ease to frame
    // the selection. Guarded; a fit error never crashes the viewer.
    st.current.frameSelectionIfNeeded = (targetGuid, pickedGuids) => {
      const gr = st.current.group; if (!gr || !targetGuid) return;
      try {
        const guids = (pickedGuids && pickedGuids.length) ? pickedGuids : [targetGuid];
        if (guids.some((g) => isAdequatelyVisible(g))) return; // already visible → don't move
        frameTargets(guids, true);
      } catch { /* never crash on a fit */ }
    };

    const applyColors = () => {
      const g = st.current.group; if (!g) return;
      const sel = st.current.selectedGuid, hi = st.current.highlightSet, cbs = st.current.colorByStatus;
      const sm = st.current.statusMap || {}, iso = st.current.isolated, hid = st.current.hidden;
      // When something is selected (and not in status-colour mode), everything
      // else is dimmed to a flat light grey so the selection reads against the
      // canvas — the core "selected element washes out" fix.
      const hasSel = !!sel || (hi && hi.size > 0);
      g.children.forEach((m) => {
        const guid = m.userData?.guid; const mat = m.material; if (!mat) return;
        if (m.userData._orig == null) m.userData._orig = mat.color.getHex();
        if (m.userData._origOpacity == null) m.userData._origOpacity = mat.opacity;
        m.visible = iso ? !!(guid && iso.has(guid)) : !(hid && guid && hid.has(guid));
        const isSel = guid && guid === sel;
        const isPick = guid && hi && hi.has(guid);
        if (isSel || isPick) {
          mat.color.set(isSel ? SEL_COLOR : PICK_COLOR);
          mat.transparent = false; mat.opacity = 1;
          if (mat.emissive) { mat.emissive.set(isSel ? SEL_COLOR : '#1e40af'); mat.emissiveIntensity = isSel ? 0.65 : 0.4; }
        } else if (cbs && guid) {
          mat.color.set(ESTATUS[sm[guid]?.key || 'not_started']?.color || ESTATUS.not_started.color);
          mat.transparent = false; mat.opacity = 1;
          if (mat.emissive) { mat.emissive.set('#000000'); mat.emissiveIntensity = 0; }
        } else if (hasSel) {
          // Dimmed context: flat light grey, opaque (no transparency sorting).
          mat.color.set(DIM_COLOR);
          mat.transparent = false; mat.opacity = 1;
          if (mat.emissive) { mat.emissive.set('#000000'); mat.emissiveIntensity = 0; }
        } else {
          mat.color.setHex(m.userData._orig);
          mat.opacity = m.userData._origOpacity ?? 1;
          mat.transparent = mat.opacity < 1;
          if (mat.emissive) { mat.emissive.set('#000000'); mat.emissiveIntensity = 0; }
        }
      });
      st.current.hoverMesh = null;
    };
    st.current.applyColors = applyColors;

    const onCtrlStart = () => { st.current.dragging = true; };
    const onCtrlEnd = () => { st.current.dragging = false; };
    controls.addEventListener('start', onCtrlStart);
    controls.addEventListener('end', onCtrlEnd);

    let frame;
    const animate = () => { controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(animate); };
    animate();

    (async () => {
      try {
        // Free any OTHER cached model up-front (bounded to one resident model),
        // before the cache lookup — so a load that errors still can't leak the
        // previous project's geometry. Never evicts the current key.
        if (cacheKey) evictExcept(cacheKey);
        // Cache hit: reuse the already-parsed model — no re-download, no re-parse.
        const cached = cacheKey ? SCENE_CACHE.get(cacheKey) : null;
        if (cached) {
          if (disposed) return;
          scene.add(cached); st.current.group = cached; st.current.cachedGroup = true;
          st.current.fitView();
          applyColors(); setStatus('ready');
          vlog('ready (cache hit)', { meshes: cached.children?.length });
          return;
        }
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`download failed (${res.status})`);
        const total = Number(res.headers.get('Content-Length')) || 0;
        let buf;
        if (res.body && res.body.getReader) {
          const reader = res.body.getReader(); const chunks = []; let received = 0;
          for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); received += value.length; if (!disposed) setPct(total ? Math.min(99, (received / total) * 100) : null); }
          if (disposed) return; buf = await new Blob(chunks).arrayBuffer();
        } else { buf = await res.arrayBuffer(); }
        if (disposed) return;
        setPhase('building'); setPct(null);
        await new Promise((r) => setTimeout(r, 30));
        const { group } = await buildIfcScene(buf, THREE);
        if (disposed) return;
        scene.add(group); st.current.group = group;
        if (cacheKey) { cacheScene(cacheKey, group); st.current.cachedGroup = true; }
        st.current.fitView();
        applyColors();
        setStatus('ready');
        vlog('ready', { meshes: group.children?.length });
      } catch (e) { if (!disposed) { vlog('load error', e?.message); setError(e?.message ?? String(e)); setStatus('error'); } }
    })();

    const onResize = () => { const nw = mount.clientWidth, nh = mount.clientHeight; if (!nw || !nh) return; camera.aspect = nw / nh; camera.updateProjectionMatrix(); renderer.setSize(nw, nh); };
    window.addEventListener('resize', onResize);
    // Track the container itself so entering/leaving fullscreen (or any layout
    // change) re-sizes the canvas correctly without depending on a window event.
    const ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(() => onResize()) : null;
    ro?.observe(mount);

    // Raycast under the pointer and select the hit element. Wrapped in try/catch
    // so a transient raycast error can never bubble into a render crash.
    const selectAt = (ev) => {
      const g = st.current.group; if (!g) return;
      try {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const guid = raycaster.intersectObjects(g.children, false)[0]?.object?.userData?.guid;
        // Shift-click extends the multi-selection; a plain click replaces it.
        // A plain click that hits NO geometry clears the selection (never on a
        // drag — this only runs for a true click/tap, not an orbit gesture).
        // Selection no longer force-frames here — the mirror effect decides
        // whether the camera needs to ease (only if the element is too small).
        if (guid && onSelect) { vlog('select', guid, ev.shiftKey ? '(shift)' : ''); onSelect(guid, !!ev.shiftKey); }
        else if (!guid && onSelect && !ev.shiftKey) { vlog('deselect (empty)'); onSelect(null); }
      } catch { /* a raycast hiccup must never crash the viewer */ }
    };
    const onClick = (ev) => selectAt(ev); // native-click fallback (SELECT_NAV off)
    // Drag-threshold pointer selection (same proven pattern as LinkBoard). We only
    // OBSERVE pointer events — never preventDefault, never disable controls — so
    // OrbitControls fully owns the gesture; we just decide tap-vs-drag from the
    // press→release distance. Covers touch too (pointer events fire for touch).
    const SELECT_THRESH = 4;
    const onPointerDown = (ev) => {
      if (ev.button != null && ev.button > 0) { st.current.pointerStart = null; return; } // ignore right/middle (pan/context)
      st.current.pointerStart = { x: ev.clientX, y: ev.clientY };
    };
    const onPointerUp = (ev) => {
      const start = st.current.pointerStart; st.current.pointerStart = null;
      if (!start) return;
      const moved = Math.abs(ev.clientX - start.x) + Math.abs(ev.clientY - start.y);
      if (moved <= SELECT_THRESH) selectAt(ev); // a tap, not a drag → select
    };
    if (SELECT_NAV) {
      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointerup', onPointerUp);
    } else {
      renderer.domElement.addEventListener('click', onClick);
    }

    let hoverRaf = 0, lastEv = null;
    const setHoverMesh = (obj) => {
      const prev = st.current.hoverMesh;
      const plain = (o) => { const gu = o?.userData?.guid; return o && gu && gu !== st.current.selectedGuid && !(st.current.highlightSet && st.current.highlightSet.has(gu)); };
      if (prev && prev !== obj && plain(prev) && prev.material.emissive) { prev.material.emissive.set('#000000'); prev.material.emissiveIntensity = 0; }
      if (obj && plain(obj) && obj.material.emissive) { obj.material.emissive.set(SEL_COLOR); obj.material.emissiveIntensity = 0.18; }
      st.current.hoverMesh = obj || null;
    };
    const doHover = (ev) => {
      const g = st.current.group; if (!g || st.current.dragging) return;
      try {
        const rect = renderer.domElement.getBoundingClientRect();
        const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
        mouse.x = (x / rect.width) * 2 - 1; mouse.y = -(y / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const obj = raycaster.intersectObjects(g.children, false)[0]?.object || null;
        setHoverMesh(obj);
        renderer.domElement.style.cursor = obj ? 'pointer' : '';
        const guid = obj?.userData?.guid;
        const meta = guid ? st.current.metaByGuid?.[guid] : null;
        setHoverInfo(guid ? { name: meta?.name || guid, type: meta?.type || '', x, y } : null);
      } catch { /* a hover raycast hiccup must never crash the viewer */ }
    };
    const onMove = (ev) => { lastEv = ev; if (hoverRaf) return; hoverRaf = requestAnimationFrame(() => { hoverRaf = 0; if (lastEv) doHover(lastEv); }); };
    const onLeave = () => { setHoverMesh(null); renderer.domElement.style.cursor = ''; setHoverInfo(null); };
    renderer.domElement.addEventListener('mousemove', onMove);
    renderer.domElement.addEventListener('mouseleave', onLeave);

    return () => {
      vlog('unmount', { cacheKey });
      disposed = true; cancelAnimationFrame(frame); if (hoverRaf) cancelAnimationFrame(hoverRaf);
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('mousemove', onMove);
      renderer.domElement.removeEventListener('mouseleave', onLeave);
      controls.removeEventListener('start', onCtrlStart);
      controls.removeEventListener('end', onCtrlEnd);
      controls.dispose(); renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      // Keep the cached model alive: pull it out of the scene BEFORE disposing,
      // so the traverse below doesn't free its geometry/materials.
      if (st.current.group && st.current.cachedGroup) scene.remove(st.current.group);
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
    };
  }, [fileUrl, cacheKey]);

  // Mirror React state onto st.current and re-apply colours/visibility (one pass).
  useEffect(() => {
    Object.assign(st.current, {
      selectedGuid, highlightSet: new Set(highlightGuids || []), colorByStatus,
      statusMap, isolated, hidden, metaByGuid,
    });
    if (st.current.applyColors) st.current.applyColors();
    // Selection-driven camera (works for BOTH a 3D-scene click and an element-
    // list click — both just change selectedGuid). Only when the selection
    // actually changes to a new element, and only after the model is ready. The
    // first post-ready selection (the auto-selected element[0]) is recorded as
    // the baseline WITHOUT moving, so loading never zooms to an element.
    // frameSelectionIfNeeded itself no-ops when the selection is already visible,
    // so the camera is preserved by default and only eases for tiny/off-screen
    // elements.
    if (status === 'ready') {
      const prev = st.current.prevSelForFrame;
      if (selectedGuid && selectedGuid !== prev && prev !== undefined) {
        st.current.frameSelectionIfNeeded?.(selectedGuid, highlightGuids || []);
      }
      st.current.prevSelForFrame = selectedGuid;
    }
  }, [selectedGuid, status, (highlightGuids || []).join(','), colorByStatus, statusMap, isolated, hidden, metaByGuid]);

  // Keyboard navigation. ESC is a single "reset to the whole model" press: it
  // drops any isolate/hide overlay, clears the selection, and fits the full
  // model — using the SAME fitView the toolbar's "Fit model" button calls, so
  // the two always land on the same camera. Arrows orbit · Shift+Arrows pan ·
  // +/- zoom · F fits the whole model. Never fires while typing in an input.
  useEffect(() => {
    const onKey = (e) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === 'Escape') {
        const plan = escPlan({ hasOverlays: !!isolated || hidden.size > 0, hasSelection: !!st.current.selectedGuid });
        if (plan.clearOverlays) { setIsolated(null); setHidden(new Set()); }
        if (plan.clearSelection) onSelect?.(null);
        if (plan.fit) st.current.fitView?.();
        return;
      }
      const action = keyAction(e);
      if (!action) return;
      e.preventDefault();
      if (action.type === 'orbit') st.current.orbitBy?.(action.az, action.pol);
      else if (action.type === 'pan') st.current.panBy?.(action.dx, action.dy);
      else if (action.type === 'zoom') st.current.zoomBy?.(action.factor);
      else if (action.type === 'fit') st.current.fitView?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSelect, isolated, hidden]);

  const isolateSel = () => { if (selectedGuid) { vlog('isolate', selectedGuid); setIsolated(new Set([selectedGuid])); } };
  const hideSel = () => { if (selectedGuid) { vlog('hide', selectedGuid); setHidden((p) => new Set(p).add(selectedGuid)); } };
  const showAll = () => { vlog('showAll'); setIsolated(null); setHidden(new Set()); };

  const TBtn = ({ icon: Icon, label, active, onClick, title }) => (
    <button type="button" onClick={onClick} title={title || label} aria-label={title || label} aria-pressed={active}
      className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-semibold transition"
      style={{ background: active ? COL.accent : 'transparent', color: active ? '#fff' : COL.text }}>
      {Icon && <Icon size={13} />}{label && <span className="hidden md:inline">{label}</span>}
    </button>
  );
  const barStyle = { background: 'rgba(255,255,255,0.92)', borderColor: COL.borderStrong, backdropFilter: 'blur(4px)' };

  return (
    <div className="relative w-full h-full" style={{ background: '#f5f5f7' }}>
      <div ref={mountRef} className="w-full h-full" />

      {/* Mobile: the 3D viewer stays interactive (one finger orbits, two-finger
          pinch/pan via OrbitControls), but it's richest on desktop — a quiet,
          honest note rather than disabling it. Hidden on lg+. */}
      {status === 'ready' && (
        <div className="lg:hidden absolute top-2 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-medium shadow-sm pointer-events-none" style={{ background: 'rgba(255,255,255,0.92)', color: COL.textDim, border: `1px solid ${COL.borderStrong}` }}>
          Best on desktop · drag to orbit, pinch to zoom
        </div>
      )}

      {status === 'ready' && (
        <div className="absolute top-3 flex flex-wrap items-center gap-0.5 p-0.5 rounded-lg border shadow-sm" style={{ insetInlineStart: isFullscreen ? 352 : 12, ...barStyle }}>
          <TBtn icon={Maximize2} label="Fit model" title="Fit the whole model (same as Esc)" onClick={() => st.current.fitView?.()} />
          {/* View presets — secondary; hidden on the smallest screens (Fit still reframes). */}
          <div className="hidden sm:flex items-center">
            {['iso', 'top', 'front'].map((v) => (
              <button key={v} type="button" onClick={() => st.current.setView?.(v)} title={`${v} view`} className="px-1.5 py-1.5 rounded-md text-[10px] font-semibold uppercase transition hover:bg-stone-100" style={{ color: COL.textDim }}>{v}</button>
            ))}
          </div>
          <span className="hidden sm:block w-px h-5 mx-0.5" style={{ background: COL.border }} />
          <TBtn icon={Palette} label="Status" title="Colour by certification status" active={colorByStatus} onClick={() => { vlog('statusToggle'); setColorByStatus((v) => !v); }} />
          <span className="hidden sm:block w-px h-5 mx-0.5" style={{ background: COL.border }} />
          {onToggleMultiSelect && <TBtn icon={MousePointerClick} label="Multi-select" title="Multi-select — click elements to add them to the selection (Shift-click also works)" active={multiSelect} onClick={onToggleMultiSelect} />}
          <TBtn icon={Focus} label="Isolate" title="Isolate selected" onClick={isolateSel} />
          <TBtn icon={EyeOff} label="Hide" title="Hide selected" onClick={hideSel} />
          {/* Show all only matters once something is isolated/hidden (also on Esc). */}
          {(isolated || hidden.size > 0) && <TBtn icon={Eye} label="All" title="Show all" onClick={showAll} />}
          {onToggleFullscreen && <>
            <span className="hidden sm:block w-px h-5 mx-0.5" style={{ background: COL.border }} />
            <TBtn icon={isFullscreen ? Shrink : Expand} label={isFullscreen ? 'Exit' : 'Fullscreen'} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} active={isFullscreen} onClick={onToggleFullscreen} />
          </>}
          <span className="hidden sm:block w-px h-5 mx-0.5" style={{ background: COL.border }} />
          <TBtn icon={Keyboard} title="Mouse & keyboard controls" active={helpOpen} onClick={() => setHelpOpen((v) => !v)} />
        </div>
      )}

      {/* Controls legend — toggled by the keyboard button */}
      {status === 'ready' && helpOpen && (
        <div className="absolute top-14 rounded-xl border shadow-lg px-3.5 py-3 z-20 w-64" style={{ insetInlineStart: isFullscreen ? 352 : 12, ...barStyle }}>
          <div className="flex items-center justify-between mb-2">
            <span className="mono text-[9px] tracking-widest font-bold" style={{ color: COL.textMute }}>NAVIGATION</span>
            <button onClick={() => setHelpOpen(false)} aria-label="Close" className="p-0.5 rounded hover:bg-stone-100" style={{ color: COL.textDim }}><X size={12} /></button>
          </div>
          <div className="grid gap-1.5">
            {NAV_LEGEND.map(([key, what]) => (
              <div key={key} className="flex items-center gap-2 text-[11px]">
                <span className="mono text-[9.5px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0" style={{ background: COL.surfaceAlt, borderColor: COL.border, color: COL.text, minWidth: 64, textAlign: 'center' }}>{key}</span>
                <span style={{ color: COL.textDim }}>{what}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* One-time first-run hint */}
      {status === 'ready' && hintShown && !helpOpen && (
        <button onClick={dismissHint} className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border shadow-md px-4 py-2 text-[11px] flex items-center gap-2 z-10" style={{ ...barStyle, color: COL.text }}>
          <Keyboard size={12} style={{ color: COL.accent }} />
          Drag to orbit · Scroll to zoom · Click an element to inspect · <b>Esc clears selection &amp; fits model</b>
          <span className="mono text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: COL.surfaceAlt, color: COL.textMute }}>OK</span>
        </button>
      )}

      {status === 'ready' && colorByStatus && (
        <div className="absolute bottom-3 rounded-lg border shadow-sm px-2.5 py-2" style={{ insetInlineStart: isFullscreen ? 352 : 12, ...barStyle }}>
          <div className="mono text-[8px] tracking-widest mb-1.5" style={{ color: COL.textMute }}>CERTIFICATION STATUS</div>
          <div className="grid gap-1">
            {LEGEND.map(([k, label]) => (
              <div key={k} className="flex items-center gap-1.5 text-[10.5px]" style={{ color: COL.text }}>
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: ESTATUS[k]?.color }} />{label}
              </div>
            ))}
          </div>
        </div>
      )}

      {hoverInfo && (
        <div className="absolute pointer-events-none rounded-md border shadow-sm px-2 py-1 text-[10.5px] z-10" style={{ left: hoverInfo.x + 12, top: hoverInfo.y + 12, maxWidth: 220, ...barStyle, color: COL.text }}>
          <div className="font-semibold truncate">{hoverInfo.name}</div>
          {hoverInfo.type && <div className="mono text-[9px] truncate" style={{ color: COL.textMute }}>{hoverInfo.type}</div>}
        </div>
      )}

      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-8" style={{ background: '#f5f5f7' }}>
          <div className="text-xs mb-3" style={{ color: COL.textDim }}>{phase === 'building' ? 'Building 3D model… (large models can take a moment)' : 'Downloading model…'}</div>
          <div className="w-56 h-2 rounded-full overflow-hidden" style={{ background: COL.surfaceAlt }}>
            <div className="h-full rounded-full" style={{ width: pct == null ? '35%' : `${pct}%`, background: COL.accent, animation: pct == null ? 'lpindeterminate2 1.1s ease-in-out infinite' : 'none', transition: pct == null ? 'none' : 'width .2s' }} />
          </div>
          {pct != null && <div className="mono text-[10px] mt-2" style={{ color: COL.textDim }}>{Math.round(pct)}%</div>}
          <style>{`@keyframes lpindeterminate2 { 0%{margin-left:-35%} 100%{margin-left:100%} }`}</style>
        </div>
      )}
      {status === 'error' && <div className="absolute inset-0 flex items-center justify-center text-xs px-6 text-center" style={{ color: '#b91c1c' }}>Couldn't render this IFC in 3D ({error}). The element list and records on the side still work.</div>}
    </div>
  );
}
