import { useState, useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { AlertOctagon, ChevronDown, ChevronRight, ChevronUp, ClipboardCheck, FileImage, FileSpreadsheet, FileText, Flag, FlaskConical, Hash, History, Layers, RotateCcw, Search, X, ZoomIn, ZoomOut } from 'lucide-react';
import { MiniStat, StatusBadge } from '../../components/primitives.jsx';
import { BOQ } from '../../data/boq.js';
import { CONTROLLED_DOCS, DRAWINGS } from '../../data/documents.js';
import { ELEMENTS } from '../../data/elements.js';
import { STATUS } from '../../data/project.js';
import { NCRS, QC_TESTS, SNAG_ITEMS, WIRS } from '../../data/quality.js';
import { BUCKET3, elementValue, opacityForType, paymentBucket } from '../../lib/bim.js';
import { fmt } from '../../lib/format.js';
import { COL } from '../../lib/theme.js';
import { DocsTab, DrawingsTab, NCRsTab, PhotosTab, PropertiesTab, QCTab, QSTab, SnagsTab, TimelineTab, WIRsTab } from './tabs.jsx';
import { supabase } from '../../lib/supabase.js';
import { resultLabel } from '../../lib/wirStatus.js';
import { qcResultLabel } from '../../lib/qcStatus.js';
import { ncrSeverityLabel, ncrStatusLabel } from '../../lib/ncrStatus.js';

// Phone composition A: a full-bleed canvas with the element tree behind one
// collapsed-by-default sheet. Desktop keeps the static side panel untouched.
const SHEET_VH = { collapsed: 0, medium: 45, expanded: 85 };

/** True at the lg breakpoint. Defaults to phone where matchMedia is absent. */
function useIsDesktop() {
  // Read synchronously on first render: starting at `false` made a desktop
  // browser paint the phone sheet for a frame before the effect corrected it.
  const [isDesktop, setIsDesktop] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(min-width: 1024px)').matches : false));
  useEffect(() => {
    const mq = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(min-width: 1024px)') : null;
    if (!mq) return undefined;
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);
  return isDesktop;
}

export function ModelView({ t, lang, selectedId, setSelectedId }) {
  const isDesktop = useIsDesktop();
  const [sheetState, setSheetState] = useState('collapsed');
  const sheetRef = useRef(null);
  const browseRef = useRef(null);
  const restoreFocusRef = useRef(false);

  // Collapsing takes the sheet out of the accessibility tree, so focus must not
  // be stranded inside it. Hand it back to the control that reopens the sheet.
  const collapseSheet = () => {
    restoreFocusRef.current = !!sheetRef.current?.contains(document.activeElement);
    setSheetState('collapsed');
  };
  useEffect(() => {
    if (sheetState !== 'collapsed' || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    browseRef.current?.focus();   // the Browse control mounts with this state
  }, [sheetState]);

  // Phone targets: the dense 240px desktop tree is untouched.
  const touch = isDesktop ? null : { minHeight: 44 };
  const [viewMode, setViewMode] = useState('status');
  const paySummary = (() => {
    const s = { clear: { v: 0, n: 0 }, blocked: { v: 0, n: 0 }, idle: { v: 0, n: 0 } };
    ELEMENTS.forEach(e => { const b = paymentBucket(e.id); s[b].v += elementValue(e.id); s[b].n++; });
    return s;
  })();
  const [activeTab, setActiveTab] = useState('properties');
  const [filters, setFilters] = useState({ approved: true, pending: true, rejected: true, ncr: true, in_progress: true, not_started: true });
  const [expandedLevels, setExpandedLevels] = useState({ B1: true, G: true, L1: true, L2: true, Multi: true });
  const [search, setSearch] = useState('');

  const mountRef = useRef(null);
  const meshesRef = useRef({});
  const selectRef = useRef();
  selectRef.current = setSelectedId;

  const selected = useMemo(() => ELEMENTS.find(e => e.id === selectedId), [selectedId]);
  // Real records linked to the selected element (by IFC GUID / element id).
  const [linked, setLinked] = useState({ wirs: [], qcs: [], ncrs: [], drawings: [], snags: [], docs: [], boq: null });
  useEffect(() => {
    if (!selected) return;
    let active = true;
    const guid = selected.guid, id = selected.id;
    Promise.all([
      supabase.from('wirs').select('*').eq('element_guid', guid),
      supabase.from('qc_tests').select('*').eq('element_guid', guid),
      supabase.from('ncrs').select('*').eq('element_guid', guid),
      supabase.from('snags').select('*').eq('element_guid', guid),
      supabase.from('drawings').select('*').contains('linked_elements', [id]),
      supabase.from('documents').select('*').contains('linked_elements', [id]),
      supabase.from('boq_items').select('*').eq('element_id', id).limit(1),
    ]).then(([w, q, n, s, dr, dc, b]) => {
      if (!active) return;
      setLinked({
        wirs: (w.data || []).map(x => ({ id: x.wir_number, type: x.inspection_type, result: resultLabel(x.result), remarks: x.remarks, date: x.inspection_date, inspector: x.inspector_name })),
        qcs: (q.data || []).map(x => ({ id: x.qc_number, test: x.test_name, result: qcResultLabel(x.result), value: x.result_value, date: x.test_date, lab: x.lab })),
        ncrs: (n.data || []).map(x => ({ id: x.ncr_number, severity: ncrSeverityLabel(x.severity), status: ncrStatusLabel(x.status), desc: x.description, date: x.ncr_date, raisedBy: x.raised_by })),
        snags: (s.data || []).map(x => ({ id: x.snag_number, title: x.title, desc: x.description, priority: x.priority, status: x.status, assignee: x.assignee, targetDate: x.target_date, raisedDate: x.raised_date, blocksHandover: x.blocks_handover, blocksPayment: x.blocks_payment })),
        drawings: (dr.data || []).map(x => ({ id: x.drawing_number, rev: x.rev, title: x.title, status: x.status, date: x.drawing_date, size: x.size_text })),
        docs: (dc.data || []).map(x => ({ no: x.doc_no, rev: x.rev, type: x.type, title: x.title, status: x.status, date: x.doc_date, size: x.size_text, pkg: x.package })),
        boq: (b.data && b.data[0]) ? { code: b.data[0].code, desc: b.data[0].description, unit: b.data[0].unit, qty: Number(b.data[0].qty || 0), rate: Number(b.data[0].rate || 0), approved: Number(b.data[0].approved_qty || 0) } : null,
      });
    }).catch(() => {});
    return () => { active = false; };
  }, [selectedId, selected]);
  const { wirs, qcs, ncrs, drawings, snags, docs, boq } = linked;

  const counts = useMemo(() => {
    const c = { approved: 0, pending: 0, rejected: 0, ncr: 0, in_progress: 0, not_started: 0 };
    ELEMENTS.forEach(e => c[e.status]++);
    return c;
  }, []);

  const grouped = useMemo(() => {
    const g = {};
    ELEMENTS.forEach(e => { if (!g[e.level]) g[e.level] = []; g[e.level].push(e); });
    return g;
  }, []);

  const filteredElements = useMemo(() =>
    ELEMENTS.filter(e => filters[e.status] && (!search || `${e.id} ${e.name} ${e.guid}`.toLowerCase().includes(search.toLowerCase())))
  , [filters, search]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#eeece2');
    scene.fog = new THREE.Fog('#eeece2', 35, 90);

    const camera = new THREE.PerspectiveCamera(40, mount.clientWidth / mount.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(15, 25, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -20; key.shadow.camera.right = 20;
    key.shadow.camera.top = 20; key.shadow.camera.bottom = -20;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xcfd8ff, 0.35);
    fill.position.set(-10, 10, -10);
    scene.add(fill);

    const grid = new THREE.GridHelper(40, 40, 0xbcb8a8, 0xd6d3c4);
    grid.position.y = -0.82;
    scene.add(grid);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0xe2e0d3, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.625;
    ground.receiveShadow = true;
    scene.add(ground);

    const meshes = {};
    // Opacity by element type: walls see-through, windows glassy, slabs/foundation light,
    // structure and openings solid. Status colour still applies to everything.
    const opacityFor = (type) => {
      if (type === 'Wall' || type === 'Partition') return 0.20;
      if (type === 'Window') return 0.38;
      if (type === 'Slab') return 0.50;
      if (type === 'Foundation') return 0.55;
      return 0.92; // Column, Beam, Door, Core Wall
    };
    ELEMENTS.forEach(el => {
      let geom, mesh;
      const shape = el.shape || 'box';

      if (shape === 'cylinder') {
        geom = new THREE.CylinderGeometry(el.size[0] / 2, el.size[0] / 2, el.size[1], 24);
      } else {
        geom = new THREE.BoxGeometry(el.size[0], el.size[1], el.size[2]);
      }

      const edges = new THREE.EdgesGeometry(geom);
      const mat = new THREE.MeshStandardMaterial({ color: STATUS[el.status].color, transparent: true, opacity: opacityFor(el.type), roughness: 0.6, metalness: el.type === 'Window' ? 0.3 : 0.05 });
      mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(...el.position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { id: el.id };
      const wire = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.45 }));
      mesh.add(wire);
      scene.add(mesh);
      meshes[el.id] = mesh;
    });
    meshesRef.current = meshes;

    let theta = Math.PI / 4, phi = Math.PI / 3, radius = 30;
    const target = new THREE.Vector3(0, 5, 0);
    const updateCamera = () => {
      camera.position.x = target.x + radius * Math.sin(phi) * Math.cos(theta);
      camera.position.y = target.y + radius * Math.cos(phi);
      camera.position.z = target.z + radius * Math.sin(phi) * Math.sin(theta);
      camera.lookAt(target);
    };
    updateCamera();

    // POINTER, not mouse. A finger emits pointer/touch events; the browser
    // synthesizes a compatibility click on a clean tap but not the continuous
    // mousemove stream a drag needs, and a touch screen has no wheel at all — so
    // the old mouse-only binding could neither orbit nor zoom on a phone. The
    // orbit maths, its constants and the 4px tap slop are unchanged, so desktop
    // behaviour is preserved exactly; touch is added around it. IfcViewer already
    // proves this pattern with OrbitControls; this view keeps its own camera
    // maths deliberately, to avoid any desktop drift.
    const canvas = renderer.domElement;
    let dragging = false, didMove = false, lastX = 0, lastY = 0;
    const active = new Map();          // live pointers, by id
    let pinchDist = 0;
    const clampRadius = (r) => Math.max(8, Math.min(70, r));
    const spread = () => {
      const [a, b] = [...active.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const onDown = (e) => {
      active.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // Capture, so the gesture keeps arriving if the finger leaves the canvas.
      try { canvas.setPointerCapture?.(e.pointerId); } catch { /* uncapturable */ }
      if (active.size === 1) { dragging = true; didMove = false; lastX = e.clientX; lastY = e.clientY; }
      else if (active.size === 2) { dragging = false; didMove = true; pinchDist = spread(); }
    };

    // One exit for every way a gesture can end. pointercancel is the one the old
    // code had no answer for: the system takes the gesture away (a call, a
    // notification, an edge swipe) and `dragging` stayed true forever, so the
    // NEXT tap was read as a drag continuation and selected nothing.
    const endPointer = (e, cancelled) => {
      const had = active.delete(e.pointerId);
      try { canvas.releasePointerCapture?.(e.pointerId); } catch { /* already gone */ }
      if (active.size < 2) pinchDist = 0;
      if (had && !cancelled && dragging && !didMove && active.size === 0) {
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        const ray = new THREE.Raycaster();
        ray.setFromCamera(mouse, camera);
        const hits = ray.intersectObjects(Object.values(meshes).filter(m => m.visible));
        if (hits.length > 0) selectRef.current(hits[0].object.userData.id);
      }
      if (active.size === 0) { dragging = false; didMove = false; }
    };
    const onUp = (e) => endPointer(e, false);
    const onCancel = (e) => endPointer(e, true);

    const onMove = (e) => {
      if (!active.has(e.pointerId)) return;
      active.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (active.size >= 2) {                     // pinch to zoom
        const d = spread();
        if (pinchDist > 0) { radius = clampRadius(radius - (d - pinchDist) * 0.05); updateCamera(); }
        pinchDist = d;
        return;
      }
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 4) didMove = true;
      theta -= dx * 0.008;
      phi = Math.max(0.15, Math.min(Math.PI / 2 - 0.05, phi - dy * 0.008));
      lastX = e.clientX; lastY = e.clientY;
      updateCamera();
    };
    const onWheel = (e) => { e.preventDefault(); radius = clampRadius(radius + e.deltaY * 0.03); updateCamera(); };

    // Claim the gesture. Without this the browser pans and zooms the PAGE and the
    // canvas never sees the drag at all.
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('pointermove', onMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // One sizing function, fed by two sources. The window resize event alone is
    // not enough: crossing the lg boundary in a mounted tab fires it BEFORE the
    // matchMedia/React composition settles, so it reads the OLD mount box and no
    // later useful resize ever arrives — leaving a 0-height canvas inside a
    // 794px mount. A ResizeObserver on the mount itself reports the SETTLED box,
    // whenever and however it changes. Transient zeroes (mid-composition
    // collapse) are ignored rather than committed.
    // Cleared FIRST in cleanup, before disconnect/dispose, so a stale callback —
    // one already queued by the browser, or invoked manually — is a no-op
    // against the disposed renderer instead of merely not crashing.
    let alive = true;
    const applySize = (w, h) => {
      if (!alive) return;
      if (!(w > 0) || !(h > 0)) return;
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    const onResize = () => applySize(mount.clientWidth, mount.clientHeight);
    window.addEventListener('resize', onResize);
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        const r = entries[entries.length - 1]?.contentRect;
        if (r) applySize(r.width, r.height);
      });
      ro.observe(mount);
    }

    let frame;
    const animate = () => { frame = requestAnimationFrame(animate); renderer.render(scene, camera); };
    animate();

    mount._reset = () => { theta = Math.PI / 4; phi = Math.PI / 3; radius = 30; updateCamera(); };
    mount._zoom = (delta) => { radius = Math.max(8, Math.min(70, radius + delta)); updateCamera(); };

    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('wheel', onWheel);
      active.clear();
      alive = false;
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
      renderer.dispose();
      if (canvas.parentNode === mount) mount.removeChild(canvas);
    };
  }, []);

  useEffect(() => {
    const meshes = meshesRef.current;
    if (!meshes) return;
    ELEMENTS.forEach(el => {
      const m = meshes[el.id];
      if (!m) return;
      m.visible = filters[el.status];
      const isSel = el.id === selectedId;
      const col = viewMode === 'mono' ? '#a8a29e' : viewMode === 'payment' ? BUCKET3[paymentBucket(el.id)].color : STATUS[el.status].color;
      m.material.color.set(col);
      if (isSel) { m.material.emissive.set('#1d4ed8'); m.material.emissiveIntensity = 0.5; m.material.opacity = 1; }
      else { m.material.emissive.set('#000000'); m.material.emissiveIntensity = 0; m.material.opacity = viewMode === 'xray' ? 0.16 : opacityForType(el.type); }
    });
  }, [selectedId, viewMode, filters]);

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
      {/* MODEL FILTER PANE */}
      <aside
        ref={sheetRef}
        {...(isDesktop ? {} : { 'data-sheet': sheetState, 'data-safe-area': 'bottom' })}
        {...(!isDesktop && sheetState === 'collapsed'
          // A zero-height overflow:hidden panel keeps its descendants focusable
          // and in the accessibility tree; `inert` is what actually removes them.
          ? { inert: '', 'aria-hidden': 'true' } : {})}
        className={isDesktop
          ? 'w-60 border-e flex flex-col flex-shrink-0'
          : 'absolute inset-x-0 bottom-0 z-30 border-t flex flex-col'}
        style={isDesktop
          ? { borderColor: COL.border, background: COL.surface }
          : {
            borderColor: COL.border, background: COL.surface,
            height: `${SHEET_VH[sheetState]}vh`,
            borderTopLeftRadius: 8, borderTopRightRadius: 8,
            // The sheet sits above the bottom nav and clears the home indicator.
            paddingBottom: 'env(safe-area-inset-bottom)',
            overflow: 'hidden', transition: 'height .18s ease',
          }}>
        {!isDesktop && sheetState !== 'collapsed' && (
          <div className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0" style={{ borderColor: COL.border }}>
            <span className="text-[12px] font-semibold truncate" style={{ color: COL.text }}>
              {lang === 'ar' ? 'تصفح العناصر' : 'Browse elements'}
            </span>
            <div className="ms-auto flex items-center gap-1.5 flex-shrink-0">
              {sheetState === 'medium' && (
                <button onClick={() => setSheetState('expanded')}
                  aria-label={lang === 'ar' ? 'توسيع اللوحة' : 'Expand sheet'}
                  title={lang === 'ar' ? 'توسيع اللوحة' : 'Expand sheet'}
                  className="border flex items-center justify-center"
                  style={{ minWidth: 44, minHeight: 44, borderRadius: 8, background: COL.surface, borderColor: COL.borderStrong }}>
                  <ChevronUp size={16} color={COL.text} />
                </button>
              )}
              <button onClick={collapseSheet}
                aria-label={lang === 'ar' ? 'إغلاق تصفح العناصر' : 'Close browse elements'}
                title={lang === 'ar' ? 'إغلاق تصفح العناصر' : 'Close browse elements'}
                className="border flex items-center justify-center"
                style={{ minWidth: 44, minHeight: 44, borderRadius: 8, background: COL.surface, borderColor: COL.borderStrong }}>
                <X size={16} color={COL.text} />
              </button>
            </div>
          </div>
        )}
        <div className="px-3 py-3 border-b" style={{ borderColor: COL.border }}>
          <div className="relative">
            <Search size={12} className="absolute start-2.5 top-1/2 -translate-y-1/2" style={{ color: COL.textMute }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="w-full ps-7 pe-2 py-1.5 text-xs border outline-none focus:border-blue-500" style={{ background: COL.bg, borderColor: COL.border, color: COL.text, borderRadius: isDesktop ? 4 : 8, ...touch }} />
          </div>
        </div>

        <div className="px-3 py-3 border-b" style={{ borderColor: COL.border }}>
          <div className="mono text-[10px] tracking-widest mb-2" style={{ color: COL.textDim }}>{t.statusFilter}</div>
          <div className="space-y-1">
            {Object.entries(STATUS).map(([key, s]) => (
              <label key={key} className="flex items-center justify-between cursor-pointer py-0.5" style={{ ...touch, borderRadius: isDesktop ? undefined : 8 }}>
                <div className="flex items-center gap-2 min-w-0">
                  <input type="checkbox" checked={filters[key]} onChange={() => setFilters(f => ({ ...f, [key]: !f[key] }))} className="w-3.5 h-3.5 accent-blue-700 flex-shrink-0" />
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                  <span className="text-[11px] truncate" style={{ color: COL.text }}>{lang === 'ar' ? s.labelAr : s.label}</span>
                </div>
                <span className="mono text-[10px]" style={{ color: COL.textDim }}>{counts[key]}</span>
              </label>
            ))}
          </div>
        </div>

        <div
          {...(isDesktop ? {} : { 'data-sheet-scroll': '' })}
          className="px-3 py-3 flex-1 scrollbar"
          style={{ overflowY: 'auto', overscrollBehavior: 'contain', touchAction: 'pan-y', minHeight: 0 }}>
          <div className="mono text-[10px] tracking-widest mb-2" style={{ color: COL.textDim }}>{t.spatialTree}</div>
          <div className="space-y-0.5">
            {Object.entries(grouped).map(([level, items]) => {
              const visibleItems = items.filter(e => filteredElements.includes(e));
              if (visibleItems.length === 0) return null;
              const isExpanded = expandedLevels[level];
              return (
                <div key={level}>
                  <button onClick={() => setExpandedLevels(p => ({ ...p, [level]: !p[level] }))} className="w-full flex items-center gap-1 px-1 py-1 text-[11px] hover:bg-stone-100 rounded" style={{ ...touch, borderRadius: isDesktop ? undefined : 8 }}>
                    {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                    <Layers size={10} style={{ color: COL.accent }} />
                    <span className="font-semibold me-auto truncate min-w-0">Level {level}</span>
                    <span className="mono text-[9px]" style={{ color: COL.textDim }}>{visibleItems.length}</span>
                  </button>
                  {isExpanded && (
                    <div className="ms-3 border-s space-y-0.5 mt-0.5 pb-1" style={{ borderColor: COL.border }}>
                      {visibleItems.map(el => {
                        const StatusIcon = STATUS[el.status].icon;
                        const isSel = el.id === selectedId;
                        return (
                          <button key={el.id} onClick={() => setSelectedId(el.id)} className="w-full flex items-center gap-2 ps-2.5 pe-2 py-1 text-[11px] rounded text-start hover:bg-stone-50" style={{ ...touch, borderRadius: isDesktop ? undefined : 8, background: isSel ? COL.accentBg : 'transparent', color: isSel ? COL.accent : COL.text, borderInlineStart: isSel ? `2px solid ${COL.accent}` : '2px solid transparent' }}>
                            <StatusIcon size={9} style={{ color: STATUS[el.status].color, flexShrink: 0 }} />
                            <span className="mono text-[10px] truncate" style={{ flexShrink: 0, color: isSel ? COL.accent : COL.textDim }}>{el.id}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      {/* 3D VIEWPORT */}
      <main
        className="order-1 lg:order-none flex flex-col relative"
        // flex-none on the phone was the regression: the canvas mount is flex:1
        // with no intrinsic height, so the only real height in the column was the
        // 49px header — the mount collapsed to 0 and the absolute Browse control
        // anchored to that 49px box, landing above the viewport. Desktop hid it
        // because lg:flex-1 supplied the height. Expressed inline so it is one
        // value at every width AND computable, hence assertable. 1 1 0% is
        // exactly what Tailwind's flex-1 already gave desktop, so desktop is
        // unchanged; min-height 0 lets the column shrink past its content.
        style={{ background: '#eeece2', flex: '1 1 0%', minHeight: 0 }}>
        {/* MOBILE control header — flow (never floats over the canvas) */}
        <div className="lg:hidden border-b" style={{ borderColor: COL.border, background: COL.surface }}>
          <div className="flex gap-1.5 overflow-x-auto px-3 py-2 scrollbar">
            {[{ v: 'status', label: 'Status' }, { v: 'payment', label: 'Payment' }, { v: 'mono', label: 'Mono' }, { v: 'xray', label: 'X-Ray' }].map(o => (
              <button key={o.v} onClick={() => setViewMode(o.v)} className="px-3.5 py-1.5 text-[12px] font-medium rounded-full border flex-shrink-0" style={{ background: viewMode === o.v ? COL.accent : COL.surface, color: viewMode === o.v ? '#fff' : COL.text, borderColor: viewMode === o.v ? COL.accent : COL.borderStrong }}>{o.label}</button>
            ))}
          </div>
          {viewMode === 'payment' && (
            <div className="flex gap-2 overflow-x-auto px-3 pb-2 scrollbar">
              {['clear', 'blocked', 'idle'].map(k => (
                <div key={k} className="flex-shrink-0 px-3 py-1.5 rounded-lg border flex items-center gap-2" style={{ background: COL.bg, borderColor: BUCKET3[k].color }}>
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: BUCKET3[k].color }} />
                  <div className="leading-tight">
                    <div className="text-[9px] whitespace-nowrap" style={{ color: COL.textDim }}>{lang === 'ar' ? BUCKET3[k].labelAr : BUCKET3[k].label}</div>
                    <div className="mono text-[12px] font-bold whitespace-nowrap" style={{ color: COL.text }}>SAR {paySummary[k].v.toLocaleString()}</div>
                  </div>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: COL.surfaceAlt, color: COL.textDim }}>{paySummary[k].n}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* DESKTOP floating view-mode toggle (top-start, mirrors in RTL) */}
        <div className="hidden lg:flex absolute top-3 z-10 items-center gap-2" style={{ insetInlineStart: 12 }}>
          <div className="flex rounded border overflow-hidden shadow-sm" style={{ borderColor: COL.borderStrong, background: COL.surface }}>
            {[{ v: 'status', label: 'Status' }, { v: 'payment', label: 'Payment' }, { v: 'mono', label: 'Mono' }, { v: 'xray', label: 'X-Ray' }].map(o => (
              <button key={o.v} onClick={() => setViewMode(o.v)} className="px-3 py-1.5 text-[11px] font-medium" style={{ background: viewMode === o.v ? COL.accent : COL.surface, color: viewMode === o.v ? '#ffffff' : COL.text }}>{o.label}</button>
            ))}
          </div>
        </div>

        {/* DESKTOP floating payment summary */}
        {viewMode === 'payment' && (
          <div className="hidden lg:flex absolute top-3 left-1/2 -translate-x-1/2 z-10 gap-2">
            {['clear', 'blocked', 'idle'].map(k => (
              <div key={k} className="px-3 py-1.5 rounded border shadow-sm flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.96)', borderColor: BUCKET3[k].color }}>
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: BUCKET3[k].color }} />
                <div className="leading-tight">
                  <div className="text-[9px]" style={{ color: COL.textDim }}>{lang === 'ar' ? BUCKET3[k].labelAr : BUCKET3[k].label}</div>
                  <div className="mono text-[12px] font-bold" style={{ color: COL.text }}>SAR {paySummary[k].v.toLocaleString()}</div>
                </div>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: COL.bg, color: COL.textDim }}>{paySummary[k].n}</span>
              </div>
            ))}
          </div>
        )}

        {!isDesktop && sheetState === 'collapsed' && (
        <button ref={browseRef} onClick={() => setSheetState('medium')}
          aria-label={lang === 'ar' ? 'تصفح العناصر' : 'Browse elements'}
          aria-expanded="false"
          className="absolute z-30 inline-flex items-center gap-2 border shadow-sm max-w-[70vw]"
          style={{
            insetInlineStart: 12,
            bottom: 12,
            minHeight: 44, borderRadius: 8, paddingInline: 14,
            background: COL.surface, borderColor: COL.borderStrong, color: COL.text,
          }}>
          <Layers size={16} />
          <span className="text-[12px] font-semibold truncate">{lang === 'ar' ? 'تصفح العناصر' : 'Browse elements'}</span>
        </button>
      )}

      {/* Zoom controls (top-end, mirrors in RTL) */}
        <div className="absolute top-3 z-10 flex flex-col gap-1" style={{ insetInlineEnd: 12 }}>
          {[
            { icon: RotateCcw, fn: () => mountRef.current?._reset?.(), label: lang === 'ar' ? 'إعادة ضبط العرض' : 'Reset view' },
            { icon: ZoomIn, fn: () => mountRef.current?._zoom?.(-3), label: lang === 'ar' ? 'تكبير' : 'Zoom in' },
            { icon: ZoomOut, fn: () => mountRef.current?._zoom?.(3), label: lang === 'ar' ? 'تصغير' : 'Zoom out' }
          ].map((b, i) => {
            const Ic = b.icon;
            // 44px minimum and the restrained 8px geometry, in the style object so
            // it is computable and can be asserted. These icon-only controls had no
            // accessible name at all, so a screen reader announced nothing.
            return <button key={i} onClick={b.fn} aria-label={b.label} title={b.label}
              className="border flex items-center justify-center shadow-sm hover:bg-stone-50"
              style={{ minWidth: 44, minHeight: 44, borderRadius: 8, background: COL.surface, borderColor: COL.borderStrong }}><Ic size={16} color={COL.text} /></button>;
          })}
        </div>

        {/* Legend (bottom-start, single column on mobile so labels never overlap) */}
        <div className="absolute bottom-3 z-10 px-3 py-2 rounded border shadow-sm" style={{ insetInlineStart: 12, background: 'rgba(255,255,255,0.95)', borderColor: COL.borderStrong }}>
          <div className="mono text-[9px] tracking-widest mb-1.5" style={{ color: COL.textDim }}>{t.legend}</div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-3 gap-y-1.5">
            {Object.entries(viewMode === 'payment' ? BUCKET3 : STATUS).map(([k, s]) => (
              <div key={k} className="flex items-center gap-1.5 text-[10px]">
                <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                <span className="whitespace-nowrap" style={{ color: COL.text }}>{lang === 'ar' ? (s.labelAr || s.label) : s.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div ref={mountRef} className="w-full" style={{ cursor: 'grab', flex: '1 1 auto', minHeight: 0 }} />
      </main>

      {/* DETAIL PANEL */}
      <aside className="order-3 lg:order-none w-full lg:w-[400px] border-t lg:border-t-0 lg:border-s flex flex-col flex-shrink-0" style={{ borderColor: COL.border, background: COL.surface }}>
        {selected && (
          <>
            <div className="px-5 py-4 border-b" style={{ borderColor: COL.border }}>
              <div className="flex items-center gap-2 mb-2">
                <StatusBadge status={selected.status} lang={lang} />
                <span className="mono text-[10px]" style={{ color: COL.textDim }}>{selected.type}</span>
              </div>
              <div className="display text-lg font-bold leading-tight">{selected.name}</div>
              <div className="mono text-[11px] mt-1" style={{ color: COL.textDim }}>{selected.id} · GUID {selected.guid}</div>
              {boq && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <MiniStat label={t.boqValue} value={fmt(boq.qty * boq.rate)} hint="SAR" />
                  <MiniStat label={t.approved} value={`${Math.round((boq.approved / boq.qty) * 100)}%`} hint={`${boq.approved}/${boq.qty}`} />
                  <MiniStat label={t.locked} value={fmt((boq.qty - boq.approved) * boq.rate)} hint={t.sarPending} warn={boq.approved < boq.qty} />
                </div>
              )}
            </div>

            <div className="flex border-b overflow-x-auto" style={{ borderColor: COL.border }}>
              {[
                { v: 'properties', label: t.properties, icon: Hash },
                { v: 'timeline', label: 'Timeline', icon: History },
                { v: 'drawings', label: `Dwgs (${drawings.length})`, icon: FileImage },
                { v: 'docs', label: `Docs (${docs.length})`, icon: FileText },
                { v: 'wir', label: `WIR (${wirs.length})`, icon: ClipboardCheck },
                { v: 'qc', label: `QC (${qcs.length})`, icon: FlaskConical },
                { v: 'ncr', label: `NCR (${ncrs.length})`, icon: AlertOctagon },
                { v: 'snags', label: `Snags (${snags.length})`, icon: Flag },
                { v: 'photos', label: 'Photos', icon: FileImage },
                { v: 'qs', label: 'QS', icon: FileSpreadsheet }
              ].map(tb => {
                const Icon = tb.icon;
                const isActive = activeTab === tb.v;
                return (
                  <button key={tb.v} onClick={() => setActiveTab(tb.v)} className="flex-shrink-0 px-2.5 py-2.5 text-[10px] font-semibold flex items-center gap-1 whitespace-nowrap" style={{ color: isActive ? COL.accent : COL.textDim, borderBottom: isActive ? `2px solid ${COL.accent}` : '2px solid transparent', background: isActive ? COL.bg : 'transparent' }}>
                    <Icon size={11} />{tb.label}
                  </button>
                );
              })}
            </div>

            <div className="lg:flex-1 overflow-y-auto scrollbar">
              {activeTab === 'properties' && <PropertiesTab el={selected} t={t} />}
              {activeTab === 'timeline' && <TimelineTab wirs={wirs} qcs={qcs} ncrs={ncrs} drawings={drawings} snags={snags} docs={docs} />}
              {activeTab === 'drawings' && <DrawingsTab drawings={drawings} />}
              {activeTab === 'docs' && <DocsTab docs={docs} />}
              {activeTab === 'wir' && <WIRsTab wirs={wirs} />}
              {activeTab === 'qc' && <QCTab qcs={qcs} />}
              {activeTab === 'ncr' && <NCRsTab ncrs={ncrs} />}
              {activeTab === 'snags' && <SnagsTab el={selected} />}
              {activeTab === 'photos' && <PhotosTab el={selected} />}
              {activeTab === 'qs' && boq && <QSTab boq={boq} t={t} />}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

