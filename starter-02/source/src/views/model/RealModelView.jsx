// ============================================================
// RealModelView — shown when the project has an uploaded IFC model.
// Left: real elements grouped into the IFC's real storeys (spatial tree),
// filterable by package. Center: the IFC in 3D. Right: the selected
// element's package, its many-to-many BOQ links (add/remove), and records.
// ============================================================
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { StyledSelect } from '../../components/StyledSelect.jsx';
import { toast } from '../../components/Toast.jsx';
import { ClipboardCheck, AlertOctagon, FlaskConical, FileImage, FileText, Flag, FileSpreadsheet, Hash, History, Search, ChevronDown, ChevronRight, Layers, Link2, X, Plus, Minus, Sparkles, Check, Lock, Pencil } from 'lucide-react';
import { PageHeader, Empty, Btn } from '../../components/primitives.jsx';
import { Modal } from '../../components/Modal.jsx';
import { PackageSelect, usePackages } from '../../components/PackageControls.jsx';
import { useElements } from '../../lib/elements.jsx';
import { normalizeStorey } from '../../lib/storey.js';
import { getActiveModel, modelFileUrl, updateElementPackage, updateElementQuantity, updateElementDescription, updateElementUserMeta } from '../../api/models.js';
import { valueElementOnLine } from '../../lib/quantity.js';
import { fmt } from '../../lib/format.js';
import { vlog } from '../../lib/viewerDebug.js';
import { listBoqItems, updateBoqItem, isBoqLineItem } from '../../api/boqItems.js';
import { listLinksForElement, linkElementBoq, unlinkElementBoq, listAllLinks } from '../../api/elementBoqLinks.js';
import { suggestBoqLinks } from '../../lib/boqSuggest.js';
import { notifyDataChanged } from '../../lib/currentProject.js';
import { IfcViewer } from '../../components/IfcViewer.jsx';
import { ErrorBoundary } from '../../components/ErrorBoundary.jsx';
import { supabase } from '../../lib/supabase.js';
import { resultLabel } from '../../lib/wirStatus.js';
import { qcResultLabel } from '../../lib/qcStatus.js';
import { ncrSeverityLabel, ncrStatusLabel } from '../../lib/ncrStatus.js';
import { COL } from '../../lib/theme.js';
import { deriveElementStatus, ESTATUS, loadElementStatusMap } from '../../lib/elementStatus.js';
import { WIRsTab, QCTab, NCRsTab, SnagsTab, DocsTab, DrawingsTab, TimelineTab, QSTab } from './tabs.jsx';
import { LinkBoard } from './LinkBoard.jsx';
import { GroupSelectionPanel } from './GroupSelectionPanel.jsx';
import { SimilarSelect } from './SimilarSelect.jsx';
import { WirFormModal } from '../wirs/WirForm.jsx';
import { BulkRaiseWirModal } from './BulkRaiseWir.jsx';
import { QcFormModal } from '../qc/QcForm.jsx';
import { NcrFormModal } from '../ncrs/NcrForm.jsx';
import { DrawingFormModal } from '../drawings/DrawingForm.jsx';

const isCanonicalGuid = (value) => typeof value === 'string' && value.trim().length > 0;

export function RealModelView({ t, onNavigate, selectedId, selectionIntent }) {
  const { elements, reload: reloadElements } = useElements();
  const { packages } = usePackages();
  const [fileUrl, setFileUrl] = useState(null);
  const [model, setModel] = useState(null);
  const [modelError, setModelError] = useState(null); // file-URL/model load failure (was silently swallowed → infinite spinner)
  const [selectedGuid, setSelectedGuid] = useState(null);
  const [search, setSearch] = useState('');
  const [pkgFilter, setPkgFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('properties');
  const [collapsed, setCollapsed] = useState({});
  const [propSection, setPropSection] = useState({ model: true, mine: true }); // Properties tab: collapsible sections
  const [panelSugOpen, setPanelSugOpen] = useState(false); // side-panel: AI suggestions collapsed by default
  const [refreshKey, setRefreshKey] = useState(0);
  const [linkGuids, setLinkGuids] = useState(null); // array of element guids to link, or null
  const [picked, setPicked] = useState(() => new Set()); // multi-select of element guids
  const [raise, setRaise] = useState(null); // 'wir' | 'qc' | 'ncr' | 'drawing'
  const [bulkWir, setBulkWir] = useState(false); // bulk-raise WIRs for picked elements
  const [boqAll, setBoqAll] = useState([]);
  const [links, setLinks] = useState([]); // join-table rows for selected element
  const [linked, setLinked] = useState({ wirs: [], qcs: [], ncrs: [], snags: [], drawings: [], docs: [], boq: null });
  const [recordsError, setRecordsError] = useState(null); // records load failed (was silently swallowed → blank tabs)
  const [wirCount, setWirCount] = useState(null); // project-wide WIR count (for the empty-state banner)
  const [wirBannerOpen, setWirBannerOpen] = useState(true); // session-only dismiss
  // AI-suggested BOQ links for the selected element (advisory; user confirms).
  const [suggest, setSuggest] = useState({ loading: false, items: null, unavailable: false });

  // An explicit Find transition is authoritative and consumed exactly once.
  // Missing/unknown Find IDs deliberately produce a neutral viewer instead of
  // substituting the first or a remembered element. Without a Find intent,
  // retain the established direct-entry behaviour: a valid requested GUID, an
  // existing local selection, or (lastly) the first model element.
  const handledFindIntent = useRef(null);
  useEffect(() => {
    // Reconcile live receiver state before the one-shot intent gate. An element
    // can disappear on a same-project refresh after its Find intent was already
    // consumed; keeping that GUID here would leave the renderer/highlight stale
    // even though the inspector truthfully resolves no element. Prune only IDs
    // no longer present so a legitimate later C remains selected and is never
    // replaced by replaying the earlier Find A.
    const available = new Set(elements.map((element) => element.guid).filter(isCanonicalGuid));
    if (selectedGuid && !available.has(selectedGuid)) setSelectedGuid(null);
    if ([...picked].some((guid) => !available.has(guid))) {
      setPicked(new Set([...picked].filter((guid) => available.has(guid))));
    }
    if (selectionIntent?.source === 'find') {
      if (handledFindIntent.current === selectionIntent.sequence) return;
      const requestedGuid = isCanonicalGuid(selectionIntent.id) ? selectionIntent.id : null;
      // A requested GUID may arrive before the provider's async element list.
      // Wait for a non-empty list before classifying it as invalid; a genuinely
      // missing intent (null) can be consumed immediately.
      if (requestedGuid && elements.length === 0) return;
      handledFindIntent.current = selectionIntent.sequence;
      const guid = requestedGuid && available.has(requestedGuid) ? requestedGuid : null;
      setSelectedGuid(guid);
      setPicked(guid ? new Set([guid]) : new Set());
      return;
    }
    if (isCanonicalGuid(selectedGuid) && available.has(selectedGuid)) return;
    const firstGuid = elements[0]?.guid;
    const guid = isCanonicalGuid(selectedId) && available.has(selectedId)
      ? selectedId : (isCanonicalGuid(firstGuid) ? firstGuid : null);
    if (selectedGuid !== guid) setSelectedGuid(guid);
    if (guid && (picked.size !== 1 || !picked.has(guid))) setPicked(new Set([guid]));
  }, [selectionIntent, selectedId, elements, selectedGuid, picked]);

  const loadBoq = useCallback(() => { listBoqItems().then(setBoqAll).catch(() => setBoqAll([])); }, []);
  useEffect(() => { loadBoq(); }, [loadBoq, refreshKey]);

  // Project-wide WIR count — drives the "0 WIRs" onboarding banner. RLS scopes
  // the query to the current project. Wrapped so a failure just hides the banner.
  useEffect(() => {
    let active = true;
    supabase.from('wirs').select('id', { count: 'exact', head: true })
      .then(({ count }) => { if (active) setWirCount(count ?? 0); })
      .catch(() => { if (active) setWirCount(null); });
    return () => { active = false; };
  }, [refreshKey]);

  // Whole-model derived status (guid -> {key, clear}) for the 3D status heatmap.
  // Re-derives whenever records change (refreshKey). Read-only; no data change.
  const [statusMap, setStatusMap] = useState({});
  useEffect(() => { loadElementStatusMap().then(setStatusMap).catch(() => setStatusMap({})); }, [refreshKey]);
  const metaByGuid = useMemo(() => {
    const m = {};
    for (const e of elements) m[e.guid] = { name: e.name, type: e.type, level: e.level };
    return m;
  }, [elements]);

  // Load the active model + its file URL. Extracted into a callback so the
  // viewer's Retry button can re-run it. Any failure now surfaces as an error
  // state (previously the catch was empty → the viewer span "Loading…" forever).
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  const loadModel = useCallback(async () => {
    setModelError(null);
    try {
      const m = await getActiveModel();
      if (!mountedRef.current || !m) return;
      setModel(m);
      const url = await modelFileUrl(m);
      if (mountedRef.current) setFileUrl(url);
      vlog('loadModel ok', { model: m?.id, elements: m?.element_count });
    } catch (e) {
      vlog('loadModel error', e?.message);
      if (mountedRef.current) setModelError(e?.message || 'Could not load the model.');
    }
  }, []);
  useEffect(() => { loadModel(); }, [loadModel]);

  useEffect(() => {
    if (!selectedGuid) return undefined;
    let active = true;
    const guid = selectedGuid;
    // `active` is flipped false on cleanup (selection change/unmount); the extra
    // `guid === selectedGuid` check below is belt-and-suspenders against a stale
    // response winning. Errors now surface (recordsError) instead of blank tabs.
    const fresh = () => active && guid === selectedGuid;
    setRecordsError(null);
    listLinksForElement(guid).then((l) => fresh() && setLinks(l)).catch(() => fresh() && setLinks([]));
    Promise.all([
      supabase.from('wirs').select('*').eq('element_guid', guid),
      supabase.from('qc_tests').select('*').eq('element_guid', guid),
      supabase.from('ncrs').select('*').eq('element_guid', guid),
      supabase.from('snags').select('*').eq('element_guid', guid),
      supabase.from('drawings').select('*').contains('linked_elements', [guid]),
      supabase.from('documents').select('*').contains('linked_elements', [guid]),
      supabase.from('boq_items').select('*').eq('element_id', guid).limit(1),
    ]).then(([w, q, n, s, dr, dc, b]) => {
      if (!fresh()) return;
      setLinked({
        wirs: (w.data || []).map((x) => ({ id: x.wir_number, type: x.inspection_type, result: resultLabel(x.result), remarks: x.remarks, date: x.inspection_date, inspector: x.inspector_name })),
        qcs: (q.data || []).map((x) => ({ id: x.qc_number, test: x.test_name, result: qcResultLabel(x.result), value: x.result_value, date: x.test_date, lab: x.lab })),
        ncrs: (n.data || []).map((x) => ({ id: x.ncr_number, severity: ncrSeverityLabel(x.severity), status: ncrStatusLabel(x.status), desc: x.description, date: x.ncr_date, raisedBy: x.raised_by })),
        snags: (s.data || []).map((x) => ({ id: x.snag_number, title: x.title, desc: x.description, priority: x.priority, status: x.status, assignee: x.assignee, targetDate: x.target_date, raisedDate: x.raised_date, blocksHandover: x.blocks_handover, blocksPayment: x.blocks_payment })),
        drawings: (dr.data || []).map((x) => ({ id: x.drawing_number, rev: x.rev, title: x.title, status: x.status, date: x.drawing_date, size: x.size_text })),
        docs: (dc.data || []).map((x) => ({ no: x.doc_no, rev: x.rev, type: x.type, title: x.title, status: x.status, date: x.doc_date, size: x.size_text, pkg: x.package })),
        boq: (b.data && b.data[0]) ? { id: b.data[0].id, code: b.data[0].code, desc: b.data[0].description, unit: b.data[0].unit, qty: Number(b.data[0].qty || 0), rate: Number(b.data[0].rate || 0), approved: Number(b.data[0].approved_qty || 0) } : null,
      });
    }).catch((e) => { if (fresh()) setRecordsError(e?.message || 'Could not load records for this element.'); });
    return () => { active = false; };
  }, [selectedGuid, refreshKey]);

  const hasSelectedGuid = isCanonicalGuid(selectedGuid);
  const selected = hasSelectedGuid ? elements.find((e) => e.guid === selectedGuid) || null : null;

  // Element-side BOQ links: join-table links + the legacy single element_id link, deduped.
  const linkedLines = useMemo(() => {
    const byId = new Map(boqAll.map((b) => [b.id, b]));
    const out = [];
    const seen = new Set();
    for (const l of links) { const b = byId.get(l.boq_item_id); if (b && !seen.has(b.id)) { seen.add(b.id); out.push({ ...b, _legacy: false }); } }
    for (const b of boqAll) { if (b.element_id === selectedGuid && !seen.has(b.id)) { seen.add(b.id); out.push({ ...b, _legacy: true }); } }
    return out;
  }, [links, boqAll, selectedGuid]);

  const filtered = useMemo(() => elements.filter((e) => {
    if (pkgFilter === 'all') return true;
    if (pkgFilter === 'unassigned') return !e.package_id;
    return e.package_id === pkgFilter;
  }), [elements, pkgFilter]);
  const list = useMemo(() => filtered.filter((e) => !search || `${e.name} ${e.ifcName || ''} ${e.description || ''} ${e.type} ${e.guid} ${e.level || ''}`.toLowerCase().includes(search.toLowerCase())), [filtered, search]);

  const grouped = useMemo(() => {
    const g = {};
    list.forEach((e) => { const lv = e.level || 'Unassigned'; (g[lv] = g[lv] || []).push(e); });
    return g;
  }, [list]);
  const levelNames = useMemo(() => Object.keys(grouped).sort((a, b) => (a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b, undefined, { numeric: true }))), [grouped]);
  // Flat guid order exactly as rows render (level groups, top→bottom). Drives
  // Shift+click contiguous range selection in the left list.
  const orderedGuids = useMemo(() => levelNames.flatMap((lv) => grouped[lv].map((e) => e.guid)).filter(isCanonicalGuid), [levelNames, grouped]);
  const selectableGuids = useMemo(() => list.map((element) => element.guid).filter(isCanonicalGuid), [list]);

  const { wirs, qcs, ncrs, snags, drawings, docs, boq } = linked;

  // Derived element status from its real WIRs + NCRs (open NCR blocks; approved WIR clears).
  const estatus = useMemo(() => deriveElementStatus(
    (wirs || []).map((w) => (w.result || '').toLowerCase()),
    (ncrs || []).map((n) => (n.status || '').toLowerCase()),
  ), [wirs, ncrs]);
  const es = ESTATUS[estatus.key] || ESTATUS.not_started;

  async function assignPackage(pkgId) {
    if (!selected) return;
    try { await updateElementPackage(selected.guid, pkgId || null); reloadElements(); }
    catch (e) { toast.error(/package_id|column|does not exist/i.test(e?.message || '') ? 'Packages aren’t set up yet — run the SQL in DESIGN_LOG (packages section).' : e.message); }
  }
  // Manual quantity entry / correction (when the IFC didn't carry it, or to fix).
  async function saveQty(field, raw) {
    if (!selected) return;
    const s = String(raw).trim();
    const val = s === '' ? null : Number(s);
    if (val != null && isNaN(val)) { toast.error('Enter a number (or clear the field).'); return; }
    try { await updateElementQuantity(selected.guid, { [field]: val }); reloadElements(); }
    catch (e) { toast.error(/quantity columns/i.test(e?.message || '') ? e.message : (e?.message || 'Could not save quantity.')); }
  }

  // Add/edit a human description for an element that came through with none.
  async function saveDescription(raw) {
    if (!selected) return;
    if ((raw ?? '').trim() === (selected.description ?? '').trim()) return; // no change
    try { await updateElementDescription(selected.guid, raw); reloadElements(); }
    catch (e) { toast.error(/description column/i.test(e?.message || '') ? e.message : (e?.message || 'Could not save description.')); }
  }

  // Save a USER metadata field (additive — never touches IFC native data).
  async function saveUserMeta(field, value) {
    if (!selected) return;
    try { await updateElementUserMeta(selected.guid, { [field]: value }); reloadElements(); }
    catch (e) { toast.error(/user-metadata/i.test(e?.message || '') ? e.message : (e?.message || 'Could not save.')); }
  }
  const saveUserText = (field, raw, current) => { const v = (raw ?? '').trim() || null; if (v === (current ?? null)) return; saveUserMeta(field, v); };
  // Custom key→value notes (jsonb object on the element).
  const [noteK, setNoteK] = useState('');
  const [noteV, setNoteV] = useState('');
  const addNote = () => {
    const k = noteK.trim(); if (!k || !selected) return;
    const next = { ...(selected.notes || {}), [k]: noteV.trim() };
    saveUserMeta('user_notes', next); setNoteK(''); setNoteV('');
  };
  const removeNote = (k) => { const next = { ...(selected.notes || {}) }; delete next[k]; saveUserMeta('user_notes', Object.keys(next).length ? next : null); };

  // Fullscreen viewer + a left linking overlay so the user can explore the model
  // fullscreen and link to BoQ without leaving it. Uses the browser Fullscreen
  // API on the viewer wrapper, so the same canvas (and camera) stays alive — no
  // remount, no reload — and the overlay (a child of the wrapper) shows over it.
  const viewerWrapRef = useRef(null);
  const [viewerFull, setViewerFull] = useState(false);
  const [fsLinkQ, setFsLinkQ] = useState('');
  // Fullscreen overlay: keep suggestions collapsed and manual-linking hidden
  // until intentionally opened (calmer default state).
  const [fsManualOpen, setFsManualOpen] = useState(false);
  const [fsSugOpen, setFsSugOpen] = useState(false);
  const [fsSugAll, setFsSugAll] = useState(false);
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const toggleFullscreen = () => {
    const el = viewerWrapRef.current; if (!el) return;
    if (!fsElement()) (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
    else (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
  };
  useEffect(() => {
    const onFs = () => { const on = !!fsElement(); vlog('fullscreen', on); setViewerFull(on); };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    return () => { document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('webkitfullscreenchange', onFs); };
  }, []);
  // Link the selected element straight to a BoQ line (no modal — works inside
  // the fullscreen overlay where a portalled modal wouldn't be visible).
  async function linkLine(boqId) {
    if (!selectedGuid) return;
    try { await linkElementBoq(selectedGuid, boqId); setRefreshKey((k) => k + 1); }
    catch (e) { toast.error(e.message); }
  }
  // Candidate BoQ lines for the fullscreen quick-picker (unlinked line items).
  const fsCandidates = useMemo(() => {
    const linkedIds = new Set(linkedLines.map((l) => l.id));
    const s = fsLinkQ.trim().toLowerCase();
    return boqAll.filter((b) => isBoqLineItem(b) && !linkedIds.has(b.id)
      && (!s || `${b.code} ${b.description} ${b.unit || ''}`.toLowerCase().includes(s))).slice(0, 60);
  }, [boqAll, linkedLines, fsLinkQ]);
  const togglePick = (guid) => {
    if (!isCanonicalGuid(guid)) return;
    setPicked((s) => { const n = new Set(s); n.has(guid) ? n.delete(guid) : n.add(guid); return n; });
  };
  const toggleAllVisible = () => setPicked((s) => {
    if (selectableGuids.length === 0) return s;
    const n = new Set(s);
    if (selectableGuids.every((guid) => n.has(guid))) selectableGuids.forEach((guid) => n.delete(guid));
    else selectableGuids.forEach((guid) => n.add(guid));
    return n;
  });
  // Multi-select MODE: when on, a plain click adds to the selection (no Shift
  // needed) — a discoverable alternative to Shift-click. Read via a ref so the
  // selection handler below stays stable (the viewer captures onSelect once).
  const [multiSelect, setMultiSelect] = useState(false);
  const multiSelectRef = useRef(false);
  useEffect(() => { multiSelectRef.current = multiSelect; }, [multiSelect]);

  // Unified selection used by BOTH the 3D viewport and a left-table row click:
  //  - plain click  → single select (replace the multi-selection with this one)
  //  - shift+click OR multi-select mode → toggle this element in/out of the set
  // Both paths drive `picked` + `selectedGuid`, so viewport and table stay synced.
  const selectInViewport = useCallback((guid, additive) => {
    if (!isCanonicalGuid(guid)) { setSelectedGuid(null); setPicked(new Set()); return; }
    const add = additive || multiSelectRef.current;
    setSelectedGuid(guid);
    setPicked((prev) => {
      if (add) { const n = new Set(prev); n.has(guid) ? n.delete(guid) : n.add(guid); return n; }
      return new Set([guid]);
    });
  }, []);
  const clearSelection = useCallback(() => { setPicked(new Set()); setSelectedGuid(null); }, []);

  // Left-list row selection with standard table modifiers (mirrored to the 3D
  // highlight via `picked`/`selectedGuid`):
  //  - plain click        → single select (replaces the set), sets the anchor
  //  - Ctrl/Cmd+click      → toggle this row, RETAINING the rest of the selection
  //  - Shift+click         → contiguous range from the anchor to this row
  const anchorGuidRef = useRef(null);
  const selectRow = useCallback((guid, ev) => {
    if (!isCanonicalGuid(guid)) return;
    const range = ev?.shiftKey && anchorGuidRef.current && anchorGuidRef.current !== guid;
    if (range) {
      const a = orderedGuids.indexOf(anchorGuidRef.current);
      const b = orderedGuids.indexOf(guid);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setPicked(new Set(orderedGuids.slice(lo, hi + 1)));
        setSelectedGuid(guid);
        return; // anchor stays put so the range can be re-dragged
      }
    }
    if (ev && (ev.metaKey || ev.ctrlKey)) {
      setPicked((prev) => { const n = new Set(prev); n.has(guid) ? n.delete(guid) : n.add(guid); return n; });
      setSelectedGuid(guid);
      anchorGuidRef.current = guid;
      return;
    }
    // plain click → single
    setSelectedGuid(guid);
    setPicked(new Set([guid]));
    anchorGuidRef.current = guid;
  }, [orderedGuids]);

  // Keep the left list in sync with the active element: open its level group and
  // scroll its row into view when the selection changes (e.g. clicked in 3D), so
  // the element you picked in the model is always visible and marked in the list.
  const selectedRowRef = useRef(null);
  useEffect(() => {
    if (!selectedGuid) return;
    const el = elements.find((e) => e.guid === selectedGuid);
    if (!el) return;
    const lv = el.level || 'Unassigned';
    setCollapsed((c) => (c[lv] === true ? { ...c, [lv]: false } : c));
  }, [selectedGuid, elements]);
  useEffect(() => {
    const id = requestAnimationFrame(() => { try { selectedRowRef.current?.scrollIntoView({ block: 'nearest' }); } catch { /* noop */ } });
    return () => cancelAnimationFrame(id);
  }, [selectedGuid, collapsed]);
  const addGuids = useCallback((guids) => setPicked((prev) => { const n = new Set(prev); guids.forEach((g) => n.add(g)); return n; }), []);

  // Project-wide link + WIR coverage maps (for the group panel summary). Both are
  // additive reads; a failure degrades to an empty map, never a crash.
  const [allLinks, setAllLinks] = useState([]);
  useEffect(() => { listAllLinks().then(setAllLinks).catch(() => setAllLinks([])); }, [refreshKey]);
  const [wirGuidList, setWirGuidList] = useState([]);
  useEffect(() => {
    let a = true;
    supabase.from('wirs').select('element_guid')
      .then(({ data }) => { if (a) setWirGuidList((data || []).map((r) => r.element_guid).filter(Boolean)); })
      .catch(() => { if (a) setWirGuidList([]); });
    return () => { a = false; };
  }, [refreshKey]);
  const linkCountByGuid = useMemo(() => {
    const m = new Map();
    for (const l of allLinks) if (l.element_guid) m.set(l.element_guid, (m.get(l.element_guid) || 0) + 1);
    for (const b of boqAll) if (b.element_id) m.set(b.element_id, (m.get(b.element_id) || 0) + 1);
    return m;
  }, [allLinks, boqAll]);
  const wirCountByGuid = useMemo(() => {
    const m = new Map();
    for (const g of wirGuidList) m.set(g, (m.get(g) || 0) + 1);
    return m;
  }, [wirGuidList]);

  // Top summary strip: at-a-glance model coverage. "Linked to BoQ" = mapped to a
  // pay item (mapping only — certified value is earned from approved WIR qty in
  // QS, not shown here). "With WIR" = has an inspection record.
  const summary = useMemo(() => {
    let linked = 0, withWir = 0;
    for (const e of elements) {
      if ((linkCountByGuid.get(e.guid) || 0) > 0) linked++;
      if ((wirCountByGuid.get(e.guid) || 0) > 0) withWir++;
    }
    return { total: elements.length, linked, withWir, unlinked: Math.max(0, elements.length - linked) };
  }, [elements, linkCountByGuid, wirCountByGuid]);

  // No-selection action: jump to the first element not yet tied to a BoQ line so
  // the user can start linking. Selects + picks it (mirrored into the 3D view).
  const reviewUnlinked = useCallback(() => {
    const first = elements.find((e) => (linkCountByGuid.get(e.guid) || 0) === 0);
    if (first) { setSelectedGuid(first.guid); setPicked(new Set([first.guid])); }
  }, [elements, linkCountByGuid]);

  // "Select similar" review panel (extends, never overwrites). Closes when the
  // active element changes so it always reflects the current target.
  const [similarOpen, setSimilarOpen] = useState(false);
  useEffect(() => { setSimilarOpen(false); }, [selectedGuid]);

  // Assign every selected element to a package in one action (additive metadata).
  async function saveGroupPackage(pkgId) {
    const ids = [...picked];
    try {
      for (const g of ids) await updateElementPackage(g, pkgId || null);
      reloadElements(); notifyDataChanged();
    } catch (e) {
      toast.error(/package_id|column|does not exist/i.test(e?.message || '') ? 'Packages aren’t set up yet — run the SQL in DESIGN_LOG (packages section).' : (e?.message || 'Could not save package.'));
    }
  }

  async function unlink(line) {
    try {
      if (line._legacy) await updateBoqItem(line.id, { element_id: null });
      else await unlinkElementBoq(selectedGuid, line.id);
      setRefreshKey((k) => k + 1);
    } catch (e) { toast.error(e.message); }
  }

  // Reset suggestions whenever the selected element changes (don't auto-fetch —
  // the user asks for them, which also keeps the AI call cost intentional).
  useEffect(() => { vlog('selected', selectedGuid); setSuggest({ loading: false, items: null, unavailable: false }); setFsManualOpen(false); setFsSugOpen(false); setFsSugAll(false); setFsLinkQ(''); setPanelSugOpen(false); }, [selectedGuid]);

  // Ask the AI to suggest BOQ lines for the selected element. Only lines not
  // already linked are offered as candidates; nothing auto-links.
  async function fetchSuggestions() {
    if (!selected) return;
    setSuggest({ loading: true, items: null, unavailable: false });
    const linkedIds = new Set(linkedLines.map((l) => l.id));
    const candidates = boqAll.filter((b) => isBoqLineItem(b) && !linkedIds.has(b.id));
    const res = await suggestBoqLinks(selected, candidates);
    if (!res.ok) { setSuggest({ loading: false, items: null, unavailable: true }); return; }
    // Resolve each suggestion's id back to the real BOQ line; drop unknowns.
    const byId = new Map(boqAll.map((b) => [String(b.id), b]));
    const items = res.suggestions
      .map((s) => ({ line: byId.get(String(s.id)), confidence: s.confidence, reason: s.reason }))
      .filter((s) => s.line && !linkedIds.has(s.line.id));
    setSuggest({ loading: false, items, unavailable: false });
    setPanelSugOpen(items.length > 0); // reveal results immediately when the user asks for them
  }

  // Accept one suggestion → create the real link (the user's explicit confirm).
  async function acceptSuggestion(line) {
    try {
      await linkElementBoq(selectedGuid, line.id);
      setSuggest((s) => ({ ...s, items: (s.items || []).filter((it) => it.line.id !== line.id) }));
      setRefreshKey((k) => k + 1);
    } catch (e) { toast.error(e.message); }
  }
  const ignoreSuggestion = (line) => setSuggest((s) => ({ ...s, items: (s.items || []).filter((it) => it.line.id !== line.id) }));

  const tabs = [
    { v: 'properties', label: t.properties || 'Properties', icon: Hash },
    { v: 'timeline', label: 'Timeline', icon: History },
    { v: 'wir', label: `WIR (${wirs.length})`, icon: ClipboardCheck },
    { v: 'qc', label: `QC (${qcs.length})`, icon: FlaskConical },
    { v: 'ncr', label: `NCR (${ncrs.length})`, icon: AlertOctagon },
    { v: 'snags', label: `Snags (${snags.length})`, icon: Flag },
    { v: 'drawings', label: `Dwgs (${drawings.length})`, icon: FileImage },
    { v: 'docs', label: `Docs (${docs.length})`, icon: FileText },
    { v: 'qs', label: 'QS', icon: FileSpreadsheet },
  ];
  // De-crowd: present the 9 tabs as 3 labeled clusters (a two-tier bar) instead
  // of one long scrolling row. activeTab stays the single source of truth, so the
  // content switch below is unchanged — only the tab *buttons* are regrouped.
  const tabByV = Object.fromEntries(tabs.map((tb) => [tb.v, tb]));
  const tabCount = { wir: wirs.length, qc: qcs.length, ncr: ncrs.length, snags: snags.length, drawings: drawings.length, docs: docs.length };
  const tabClusters = [
    { key: 'info', label: 'Info', tabs: ['properties', 'timeline', 'qs'] },
    { key: 'quality', label: 'Quality', tabs: ['wir', 'qc', 'ncr', 'snags'] },
    { key: 'docs', label: 'Documents', tabs: ['drawings', 'docs'] },
  ];
  const activeCluster = tabClusters.find((c) => c.tabs.includes(activeTab)) || tabClusters[0];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title={t.model || 'BIM Model'} subtitle={model ? `${model.file_name} · v${model.version} · ${model.element_count} elements` : 'Uploaded IFC model'} />
      {/* Workflow orientation — what this page is for, in commercial terms, before
          any technical detail. Subtle (not loud): one line + a quiet flow strip. */}
      <div className="hidden lg:block px-4 py-2.5 border-b flex-shrink-0" style={{ borderColor: COL.border, background: COL.surface }}>
        <p className="text-[12px] leading-snug mb-2" style={{ color: COL.textDim }}>
          Use the model to locate work, link elements to BoQ lines, and connect site evidence.{' '}
          <span style={{ color: COL.textMute }}>BIM is optional — certification still comes from approved WIRs.</span>
        </p>
        <div className="flex items-center gap-1.5 flex-wrap" style={{ color: COL.textMute }}>
          {['IFC model', 'Elements', 'BoQ links', 'WIR / QC evidence', 'Certified value'].map((step, i, arr) => (
            <span key={step} className="inline-flex items-center gap-1.5">
              <span className="mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: COL.surfaceAlt, color: COL.textDim }}>{step}</span>
              {i < arr.length - 1 && <ChevronRight size={11} style={{ color: COL.textMute }} />}
            </span>
          ))}
        </div>
      </div>
      {/* Coverage summary — commercial-readable labels. Mapping/inspection counts
          only; certified value is earned in QS from approved WIR quantity, not here. */}
      <div className="hidden lg:flex items-center gap-2 px-4 py-2 border-b text-[11px] flex-shrink-0" style={{ borderColor: COL.border, background: COL.surface }}>
        {[
          ['Model elements', summary.total, COL.text, 'Total elements in the uploaded IFC model.'],
          ['Linked to BoQ', summary.linked, COL.accent, 'Tied to a commercial BoQ line — can support quantity / progress traceability.'],
          ['Evidence started', summary.withWir, '#15803d', 'Elements with at least one WIR / inspection record.'],
          ['Need linking', summary.unlinked, '#b45309', 'Not yet tied to a commercial BoQ line.'],
        ].map(([label, val, color, tip]) => (
          <span key={label} title={tip} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border cursor-help" style={{ background: COL.bg, borderColor: COL.border }}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color === COL.text ? COL.textMute : color }} />
            <span style={{ color: COL.textDim }}>{label}</span>
            <span className="mono font-bold" style={{ color }}>{val.toLocaleString()}</span>
          </span>
        ))}
      </div>
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Spatial tree (real IFC storeys), filterable by package */}
        <ErrorBoundary compact label="Elements list">
        <div className="hidden lg:flex flex-col w-80 border-e flex-shrink-0" style={{ borderColor: COL.border, background: COL.surface }}>
          {/* Empty-state onboarding: no WIRs yet on this project (dismiss = session only) */}
          {wirCount === 0 && wirBannerOpen && (
            <div className="flex items-start gap-2 px-2.5 py-2 border-b text-[10.5px]" style={{ background: '#fef3c7', borderColor: '#fde68a', color: '#92400e' }}>
              <AlertOctagon size={13} className="flex-shrink-0 mt-0.5" />
              <span className="flex-1 leading-snug">0 WIRs on this project. Link elements to BoQ to begin certification.</span>
              <button onClick={() => setWirBannerOpen(false)} title="Dismiss" className="flex-shrink-0 p-0.5 rounded hover:bg-amber-200/60"><X size={12} /></button>
            </div>
          )}
          <div className="p-2 border-b space-y-2" style={{ borderColor: COL.border }}>
            <div className="relative">
              <Search size={12} className="absolute start-2 top-1/2 -translate-y-1/2" style={{ color: COL.textMute }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search elements" className="w-full ps-7 pe-2 py-1.5 text-[11px] rounded border outline-none" style={{ background: COL.bg, borderColor: COL.border }} />
            </div>
            <PackageSelect value={pkgFilter} onChange={setPkgFilter} packages={packages} style={{ width: '100%' }} />
          </div>
          <div className="px-2 py-1.5 border-b flex items-center justify-between text-[11px]" style={{ borderColor: COL.border }}>
            <label className="flex items-center gap-1.5 cursor-pointer" style={{ color: COL.textDim }}>
              <input type="checkbox" checked={selectableGuids.length > 0 && selectableGuids.every((guid) => picked.has(guid))}
                disabled={selectableGuids.length === 0} onChange={toggleAllVisible} className="w-3.5 h-3.5 accent-blue-700" />
              Select all ({list.length})
            </label>
            <div className="flex items-center gap-2">
              {picked.size > 0 && <button onClick={() => setBulkWir(true)} className="font-semibold" style={{ color: COL.accent }}>+ WIR ({picked.size})</button>}
              <button onClick={() => setLinkGuids(picked.size ? [...picked] : [])} className="font-semibold" style={{ color: COL.accent }}>Link ↔ BoQ{picked.size ? ` (${picked.size})` : ''}</button>
            </div>
          </div>
          {/* Two distinct ways to select: a tick "picks" for bulk actions (shown blue
              in the 3D view); clicking a name "inspects" it in the right-hand panel. */}
          {picked.size > 0 ? (
            <div className="px-2 py-1.5 border-b flex items-center gap-2 text-[10px]" style={{ borderColor: COL.border, background: COL.accentBg, color: COL.accent }}>
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: '#3b82f6' }} />
              <span className="font-semibold flex-1">{picked.size} picked · highlighted in 3D</span>
              <button onClick={() => setPicked(new Set())} className="font-semibold underline">Clear</button>
            </div>
          ) : (
            <div className="px-2 py-1 border-b text-[9.5px] leading-tight" style={{ borderColor: COL.border, color: COL.textMute }}>
              Click to inspect · Shift+click a range · Ctrl/Cmd+click to add · tick to pick
            </div>
          )}
          <div className="flex-1 overflow-y-auto scrollbar p-1.5">
            {levelNames.map((lv) => {
              const items = grouped[lv];
              const open = collapsed[lv] !== true;
              return (
                <div key={lv} className="mb-0.5">
                  <button onClick={() => setCollapsed((c) => ({ ...c, [lv]: !(c[lv] !== true) }))} className="w-full flex items-center gap-1 px-1.5 py-1 rounded hover:bg-stone-100">
                    {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    <Layers size={11} style={{ color: COL.accent }} />
                    <span className="text-[11px] font-semibold truncate me-auto">{normalizeStorey(lv)}</span>
                    <span className="mono text-[9px]" style={{ color: COL.textMute }}>{items.length}</span>
                  </button>
                  {open && (
                    <div className="ms-3 border-s" style={{ borderColor: COL.border }}>
                      {items.map((el) => {
                        const rowGuid = isCanonicalGuid(el.guid) ? el.guid : null;
                        const sel = Boolean(rowGuid && rowGuid === selectedGuid);
                        const isLinked = (linkCountByGuid.get(el.guid) || 0) > 0;
                        const hasWir = (wirCountByGuid.get(el.guid) || 0) > 0;
                        return (
                        <div key={el.guid} ref={sel ? selectedRowRef : undefined} title={el.name} className="flex items-center gap-2 ps-1.5 pe-2 rounded transition-colors hover:bg-stone-50" style={{ background: sel ? COL.accentBg : 'transparent', borderInlineStart: `3px solid ${sel ? COL.accent : 'transparent'}` }}>
                          <input type="checkbox" aria-label={`Pick ${el.name}`} checked={Boolean(rowGuid && picked.has(rowGuid))}
                            disabled={!rowGuid} onChange={() => togglePick(rowGuid)} className="w-3.5 h-3.5 accent-blue-700 flex-shrink-0" onClick={(e) => e.stopPropagation()} />
                          <button onClick={(ev) => selectRow(rowGuid, ev)} aria-pressed={sel} disabled={!rowGuid}
                            title="Click to inspect · Shift+click for a range · Ctrl/Cmd+click to add" className="flex-1 min-w-0 flex flex-col items-start py-1.5 text-start" style={{ minHeight: 38 }}>
                            <span className="text-[12px] font-medium truncate w-full leading-tight" style={{ color: sel ? COL.accent : COL.text }}>{el.name}</span>
                            <span className="mono text-[10px] truncate w-full leading-tight" style={{ color: COL.textMute }}>
                              {(el.type || '').replace(/^Ifc/, '') || '—'} · <span style={{ color: isLinked ? COL.accent : '#b45309' }}>{isLinked ? 'Linked' : 'Unlinked'}</span>
                            </span>
                          </button>
                          {/* Evidence badge — green once this element has a WIR record */}
                          <span title={hasWir ? 'Has WIR evidence' : 'No WIR yet'} className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: hasWir ? '#15803d' : COL.border }} />
                        </div>
                      ); })}
                    </div>
                  )}
                </div>
              );
            })}
            {levelNames.length === 0 && <Empty label="No elements" />}
          </div>
        </div>
        </ErrorBoundary>

        {/* 3D viewer — isolated: a viewer render error fails locally; list + panel survive */}
        <ErrorBoundary compact label="3D viewer">
        <div ref={viewerWrapRef} className="flex-1 min-h-[260px] relative" style={{ background: '#f5f5f7' }}>
          {fileUrl ? <IfcViewer fileUrl={fileUrl} selectedGuid={selectedGuid} onSelect={selectInViewport} highlightGuids={[...picked]} statusMap={statusMap} metaByGuid={metaByGuid} cacheKey={model ? `${model.id}:${model.version}` : fileUrl} isFullscreen={viewerFull} onToggleFullscreen={toggleFullscreen} multiSelect={multiSelect} onToggleMultiSelect={() => setMultiSelect((v) => !v)} />
            : modelError ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="text-xs" style={{ color: '#b91c1c' }}>Couldn’t load the 3D model ({modelError}). The element list and records still work.</div>
                <button onClick={loadModel} className="px-3 py-1.5 text-[11px] rounded border font-medium" style={{ borderColor: COL.borderStrong, color: COL.text, background: COL.surface }}>Retry</button>
              </div>
            )
            : <div className="w-full h-full flex items-center justify-center text-xs" style={{ color: COL.textMute }}>Loading model…</div>}

          {/* Fullscreen-only LEFT linking overlay — explore + link without leaving fullscreen */}
          {viewerFull && (
            <div className="absolute top-0 bottom-0 flex flex-col shadow-2xl" style={{ insetInlineStart: 0, width: 300, background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(6px)', borderInlineEnd: `1px solid ${COL.border}` }}>
              {/* Compact header — name + type · level, no all-caps label */}
              <div className="px-3 py-2 border-b flex-shrink-0" style={{ borderColor: COL.border }}>
                {selected ? (<>
                  <div className="text-[12.5px] font-bold truncate leading-tight" style={{ color: COL.text }}>{selected.description || selected.name}</div>
                  <div className="mono text-[9px] truncate mt-0.5" style={{ color: COL.textMute }}>{selected.type}{selected.level ? ` · ${normalizeStorey(selected.level)}` : ''}</div>
                </>) : <div className="text-[11px]" style={{ color: COL.textMute }}>No element selected</div>}
              </div>

              {!selected ? (
                <div className="flex-1 flex items-center justify-center text-[11px] px-6 text-center" style={{ color: COL.textMute }}>Click any element in the 3D view to select it, then link it to BoQ here.</div>
              ) : (
                <div className="flex-1 overflow-y-auto scrollbar p-3 space-y-4 text-xs">
                  {/* Linked BoQ — the primary commercial state */}
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[11px] font-semibold" style={{ color: COL.text }}>Linked BoQ</span>
                      <span className="mono text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: COL.surfaceAlt, color: COL.textDim }}>{linkedLines.length}</span>
                    </div>
                    {linkedLines.length === 0 ? (
                      <div className="text-[10px]" style={{ color: COL.textMute }}>No BoQ linked yet.</div>
                    ) : (
                      <div className="space-y-1">
                        {linkedLines.map((line) => { const v = valueElementOnLine(selected, line); return (
                          <div key={line.id} className="rounded-md px-2 py-1.5" style={{ background: COL.surfaceAlt }}>
                            <div className="flex items-center gap-2">
                              <span className="mono text-[10px] font-semibold" style={{ color: COL.accent }}>{line.code || '(no code)'}</span>
                              <span className="text-[10px] truncate flex-1" style={{ color: COL.textDim }}>{line.description || ''}</span>
                              <button onClick={() => unlink(line)} title="Unlink" className="p-0.5 rounded hover:bg-stone-200" style={{ color: '#b91c1c' }}><X size={12} /></button>
                            </div>
                            {v.ok && !v.count ? <div className="mono text-[10px] mt-0.5" style={{ color: '#15803d' }}>{Math.round(v.qty * 100) / 100} {v.unit} × SAR {fmt(v.rate)} = <b>SAR {fmt(v.value)}</b></div>
                              : v.ok && v.count ? <div className="mono text-[10px] mt-0.5" style={{ color: '#15803d' }}>SAR {fmt(v.value)} (per {v.unit})</div> : null}
                          </div>
                        ); })}
                      </div>
                    )}
                  </div>

                  {/* Suggested matches — collapsed by default; quieter */}
                  <div>
                    {!Array.isArray(suggest.items) ? (
                      !suggest.unavailable && (
                        <button onClick={fetchSuggestions} disabled={suggest.loading} className="inline-flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium hover:bg-stone-100 disabled:opacity-50" style={{ color: COL.accent }}>
                          <Sparkles size={11} />{suggest.loading ? 'Suggesting…' : 'Suggest matches'}
                        </button>
                      )
                    ) : (
                      <div className="rounded-md border" style={{ borderColor: COL.border }}>
                        <button onClick={() => setFsSugOpen((o) => !o)} className="w-full flex items-center gap-2 px-2 py-1.5">
                          <Sparkles size={11} style={{ color: suggest.items.length ? COL.accent : COL.textMute }} />
                          <span className="text-[10.5px] font-medium" style={{ color: COL.text }}>Suggested matches</span>
                          {suggest.items.length > 0 && <span className="mono text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: COL.accentBg, color: COL.accent }}>{suggest.items.length}</span>}
                          {suggest.items.length > 0 && (fsSugOpen ? <ChevronDown size={12} className="ms-auto" style={{ color: COL.textMute }} /> : <ChevronRight size={12} className="ms-auto" style={{ color: COL.textMute }} />)}
                        </button>
                        {fsSugOpen && (suggest.items.length > 0 ? (
                          <div className="px-1.5 pb-1.5 space-y-1">
                            {(fsSugAll ? suggest.items : suggest.items.slice(0, 3)).map((s) => (
                              <div key={s.line.id} className="rounded px-2 py-1 flex items-center gap-1.5" style={{ background: COL.surfaceAlt }}>
                                <span className="mono text-[10px] font-semibold" style={{ color: COL.accent }}>{s.line.code || '(no code)'}</span>
                                {s.confidence && <span className="text-[8px] uppercase" style={{ color: COL.textMute }}>{s.confidence}</span>}
                                <span className="text-[9.5px] truncate flex-1" style={{ color: COL.textDim }}>{s.reason || s.line.description || ''}</span>
                                <button onClick={() => acceptSuggestion(s.line)} title="Accept" className="p-0.5 rounded hover:bg-green-100" style={{ color: '#15803d' }}><Check size={12} /></button>
                                <button onClick={() => ignoreSuggestion(s.line)} title="Ignore" className="p-0.5 rounded hover:bg-stone-200" style={{ color: COL.textMute }}><X size={11} /></button>
                              </div>
                            ))}
                            {!fsSugAll && suggest.items.length > 3 && <button onClick={() => setFsSugAll(true)} className="text-[9.5px] px-1 font-medium" style={{ color: COL.accent }}>Show {suggest.items.length - 3} more</button>}
                          </div>
                        ) : (
                          <div className="px-2 pb-2 text-[10px]" style={{ color: COL.textMute }}>No matches — link manually.</div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Manual linking — hidden until intentionally opened */}
                  <div>
                    {!fsManualOpen ? (
                      <button onClick={() => setFsManualOpen(true)} className="inline-flex items-center gap-1 h-6 px-2 rounded border text-[10px] font-medium hover:bg-stone-50" style={{ borderColor: COL.border, color: COL.text }}><Plus size={11} />Link manually</button>
                    ) : (
                      <div className="rounded-md border" style={{ borderColor: COL.border }}>
                        <div className="flex items-center gap-2 px-2 py-1.5 border-b" style={{ borderColor: COL.border }}>
                          <span className="text-[10.5px] font-medium" style={{ color: COL.text }}>Link manually</span>
                          <button onClick={() => { setFsManualOpen(false); setFsLinkQ(''); }} title="Close" className="ms-auto p-0.5 rounded hover:bg-stone-100" style={{ color: COL.textMute }}><X size={12} /></button>
                        </div>
                        <div className="p-1.5">
                          <div className="relative mb-1">
                            <Search size={12} className="absolute start-2 top-1/2 -translate-y-1/2" style={{ color: COL.textMute }} />
                            <input value={fsLinkQ} onChange={(e) => setFsLinkQ(e.target.value)} autoFocus placeholder="Search BoQ code or description…" className="w-full ps-7 pe-2 py-1.5 text-[11px] rounded border outline-none focus:border-blue-500" style={{ borderColor: COL.border, background: COL.surface, color: COL.text }} />
                          </div>
                          <div className="space-y-1 max-h-56 overflow-y-auto scrollbar">
                            {fsCandidates.length === 0 ? <div className="text-[10px] px-1" style={{ color: COL.textMute }}>No matching unlinked lines.</div> : fsCandidates.map((b) => (
                              <button key={b.id} onClick={() => linkLine(b.id)} className="w-full text-start rounded px-2 py-1 hover:bg-stone-100 flex items-center gap-2" style={{ background: COL.surfaceAlt }}>
                                <span className="mono text-[10px] font-semibold flex-shrink-0" style={{ color: COL.accent }}>{b.code || '(no code)'}</span>
                                <span className="text-[10px] truncate flex-1" style={{ color: COL.textDim }}>{b.description || ''}</span>
                                <Plus size={12} style={{ color: COL.accent }} />
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        </ErrorBoundary>

        {/* Detail panel — isolated: a panel render error fails locally; the viewer survives */}
        <ErrorBoundary compact label="Detail panel">
        {similarOpen && selected ? (
          <div className="w-full lg:w-[360px] border-t lg:border-t-0 lg:border-s flex flex-col flex-shrink-0" style={{ borderColor: COL.border, background: COL.surface }}>
            <SimilarSelect key={selectedGuid} target={selected} elements={elements} picked={picked} onAdd={addGuids} onClose={() => setSimilarOpen(false)} />
          </div>
        ) : picked.size > 1 ? (
          <div className="w-full lg:w-[360px] border-t lg:border-t-0 lg:border-s flex flex-col flex-shrink-0" style={{ borderColor: COL.border, background: COL.surface }}>
            <GroupSelectionPanel guids={[...picked]} elements={elements} packages={packages} linkCountByGuid={linkCountByGuid} wirCountByGuid={wirCountByGuid} onClear={clearSelection} onLinkBoq={() => setLinkGuids([...picked])} onCreateWir={() => setBulkWir(true)} onSelectSimilar={() => setSimilarOpen(true)} onSavePackage={saveGroupPackage} />
          </div>
        ) : (
        <div className="w-full lg:w-[360px] border-t lg:border-t-0 lg:border-s flex flex-col flex-shrink-0" style={{ borderColor: COL.border, background: COL.surface }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: COL.border }}>
            <div className="flex items-center justify-between gap-2">
              <div className="mono text-[10px]" style={{ color: COL.textDim }}>{selected ? 'SELECTED ELEMENT' : 'MODEL INSPECTOR'}</div>
              {selected && <span className="mono text-[9px] px-1.5 py-0.5 rounded font-bold flex-shrink-0" style={{ background: es.bg, color: es.color }}>{es.label}</span>}
            </div>
            <div className="display text-[15px] font-semibold mt-0.5 truncate">{selected ? (selected.displayName || selected.name || (selected.type || '').replace(/^Ifc/, '')) : 'No element selected'}</div>
            <div className="mono text-[11px] mt-0.5 truncate" style={{ color: COL.textMute }}>{selected ? selected.guid : 'Pick an element to see its commercial status'}</div>
            {/* Commercial-readable summary first, technical detail second. */}
            {selected && (() => {
              const linkN = linkedLines.length, wirN = wirs.length;
              const consequence = linkN === 0
                ? 'Cannot support certified value until linked to a BoQ line and inspected.'
                : wirN === 0
                ? 'Linked — needs an approved WIR before it can support certified value.'
                : 'Linked with inspection evidence. Certified value is earned from approved WIR quantity in QS.';
              return (
                <div className="mt-2.5 space-y-1.5">
                  <div className="flex items-center gap-2 text-[11px]">
                    <Link2 size={12} style={{ color: linkN > 0 ? COL.accent : '#b45309' }} />
                    <span style={{ color: COL.textDim }}>{linkN > 0 ? `Linked to BoQ (${linkN})` : 'Not linked to BoQ'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <ClipboardCheck size={12} style={{ color: wirN > 0 ? '#15803d' : COL.textMute }} />
                    <span style={{ color: COL.textDim }}>{wirN > 0 ? `${wirN} WIR record${wirN > 1 ? 's' : ''}` : 'No WIR yet'}</span>
                  </div>
                  <div className="text-[10.5px] leading-snug rounded-md px-2 py-1.5" style={{ background: linkN === 0 ? '#fffbeb' : COL.surfaceAlt, color: linkN === 0 ? '#92400e' : COL.textDim }}>
                    {consequence}
                  </div>
                </div>
              );
            })()}
          </div>

          {selected && (
            <div className="px-4 py-2.5 border-b space-y-2" style={{ borderColor: COL.border, background: COL.bg }}>
              {/* Package assignment */}
              <div className="flex items-center gap-2 text-[11px]">
                <Layers size={12} style={{ color: COL.textMute }} />
                <span style={{ color: COL.textDim }}>Package:</span>
                <div className="flex-1"><StyledSelect ariaLabel="Package" value={selected.package_id || ''} onChange={assignPackage}
                  options={[{ value: '', label: 'Unassigned' }, ...packages.map((p) => ({ value: p.id, label: `${p.code ? `${p.code} · ` : ''}${p.name}` }))]} /></div>
              </div>
              {/* ───── BoQ links — one card: Linked (always) + Suggested (collapsible) ───── */}
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: COL.border }}>
                {/* Header: title · count · Link… */}
                <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ background: COL.surfaceAlt }}>
                  <Link2 size={12} style={{ color: COL.textMute }} />
                  <span className="text-[11px] font-semibold" style={{ color: COL.text }}>BoQ links</span>
                  <span className="mono text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: COL.surface, color: COL.textDim }}>{linkedLines.length}</span>
                  <button onClick={() => setLinkGuids([selectedGuid])} className="ms-auto px-2 py-0.5 text-[10.5px] rounded border font-medium" style={{ borderColor: COL.borderStrong, color: COL.text, background: COL.surface }}>Link…</button>
                </div>
                {/* Linked lines — the primary state, always visible */}
                <div className="px-2 py-2 space-y-1">
                  {linkedLines.length === 0 ? (
                    <div className="px-1 py-0.5 space-y-1.5">
                      <div className="text-[10.5px] leading-snug" style={{ color: COL.textDim }}>No BoQ link yet. This element is visible in the model, but it is not connected to a commercial BoQ line. Link it to make it useful for progress and evidence tracking.</div>
                      <button onClick={() => setLinkGuids([selectedGuid])} className="inline-flex items-center gap-1 px-2 py-1 text-[10.5px] rounded border font-medium" style={{ borderColor: COL.borderStrong, color: COL.accent, background: COL.surface }}><Link2 size={11} />Link to BoQ</button>
                    </div>
                  ) : linkedLines.map((line) => {
                    const v = valueElementOnLine(selected, line);
                    return (
                    <div key={line.id} className="rounded border px-2 py-1.5" style={{ borderColor: COL.border, background: COL.surface }}>
                      <div className="flex items-center gap-2">
                        <span className="mono text-[10px] font-semibold" style={{ color: COL.accent }}>{line.code || '(no code)'}</span>
                        <span className="text-[10px] truncate flex-1" style={{ color: COL.textDim }}>{line.description || ''}</span>
                        <button onClick={() => unlink(line)} title="Unlink" className="p-0.5 rounded hover:bg-stone-100" style={{ color: '#b91c1c' }}><X size={12} /></button>
                      </div>
                      {/* element value = quantity × rate (unit-matched) */}
                      {v.ok && !v.count ? (
                        <div className="mono text-[10px] mt-0.5" style={{ color: '#15803d' }}>{Math.round(v.qty * 100) / 100} {v.unit} × SAR {fmt(v.rate)}/{v.unit} = <b>SAR {fmt(v.value)}</b></div>
                      ) : v.ok && v.count ? (
                        <div className="mono text-[10px] mt-0.5" style={{ color: '#15803d' }}>SAR {fmt(v.value)} (per {v.unit})</div>
                      ) : (
                        <div className="text-[9.5px] mt-0.5" style={{ color: '#b45309' }}>⚠ {v.reason}</div>
                      )}
                    </div>
                    );
                  })}
                </div>
                {/* Suggested — AI advisory, collapsed by default; hidden when unavailable */}
                {!suggest.unavailable && (
                  <div className="border-t" style={{ borderColor: COL.border }}>
                    {!Array.isArray(suggest.items) ? (
                      <button onClick={fetchSuggestions} disabled={suggest.loading} className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[10.5px] font-medium hover:bg-stone-50 disabled:opacity-50" style={{ color: COL.accent }}>
                        <Sparkles size={11} />{suggest.loading ? 'Suggesting…' : 'Suggest BoQ links with AI'}
                      </button>
                    ) : (
                      <div>
                        <button onClick={() => setPanelSugOpen((o) => !o)} className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[10.5px] font-medium hover:bg-stone-50" style={{ color: COL.text }}>
                          <Sparkles size={11} style={{ color: suggest.items.length ? COL.accent : COL.textMute }} />
                          <span>Suggested</span>
                          {suggest.items.length > 0 && <span className="mono text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: COL.accentBg, color: COL.accent }}>{suggest.items.length}</span>}
                          {suggest.items.length > 0 && (panelSugOpen ? <ChevronDown size={13} className="ms-auto" style={{ color: COL.textMute }} /> : <ChevronRight size={13} className="ms-auto" style={{ color: COL.textMute }} />)}
                        </button>
                        {suggest.items.length === 0 ? (
                          <div className="text-[10px] px-2.5 pb-2" style={{ color: COL.textMute }}>No AI suggestions for this element — link manually.</div>
                        ) : panelSugOpen && (
                          <div className="px-2 pb-2 space-y-1">
                            {suggest.items.map((s) => (
                              <div key={s.line.id} className="rounded border px-2 py-1.5" style={{ borderColor: COL.border, background: COL.surface }}>
                                <div className="flex items-center gap-2">
                                  <span className="mono text-[10px] font-semibold" style={{ color: COL.accent }}>{s.line.code || '(no code)'}</span>
                                  <span className="text-[10px] truncate flex-1" style={{ color: COL.textDim }}>{s.line.description || ''}</span>
                                  <span className="mono text-[8.5px] uppercase px-1 rounded" style={{ color: COL.textMute, border: `1px solid ${COL.border}` }}>{s.confidence || '—'}</span>
                                  <button onClick={() => acceptSuggestion(s.line)} title="Accept — create this link" className="p-0.5 rounded hover:bg-green-50" style={{ color: '#15803d' }}><Check size={13} /></button>
                                  <button onClick={() => ignoreSuggestion(s.line)} title="Ignore" className="p-0.5 rounded hover:bg-stone-100" style={{ color: COL.textMute }}><X size={12} /></button>
                                </div>
                                {s.reason && <div className="text-[9.5px] mt-0.5" style={{ color: COL.textDim }}>{s.reason}</div>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* AI is advisory only — it suggests, the user confirms; nothing auto-links */}
              <div className="flex items-start gap-1.5 text-[10px] px-0.5" style={{ color: COL.textMute }}>
                <Sparkles size={11} className="flex-shrink-0 mt-0.5" />
                <span>AI can suggest possible BoQ links, but you confirm each one — nothing links automatically.</span>
              </div>
              {/* Create a record already linked to this element */}
              <div className="pt-0.5">
                <div className="text-[11px] font-semibold mb-1" style={{ color: COL.text }}>Create linked record</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[['wir', 'WIR'], ['qc', 'QC note'], ['ncr', 'NCR'], ['drawing', 'Drawing reference']].map(([k, l]) => (
                    <button key={k} onClick={() => setRaise(k)} className="px-2 py-0.5 text-[11px] rounded border font-medium" style={{ borderColor: COL.borderStrong, color: COL.text }}>+ {l}</button>
                  ))}
                </div>
                <div className="text-[10px] mt-1" style={{ color: COL.textMute }}>New records will be linked to the selected model element.</div>
              </div>
              {/* Select similar — extends the selection from this one element */}
              <button onClick={() => setSimilarOpen(true)} className="inline-flex items-center gap-1.5 text-[11px] font-semibold pt-0.5" style={{ color: COL.accent }}>
                <Sparkles size={12} /> Select similar elements
              </button>
            </div>
          )}

          {selected && (<div className="border-b" style={{ borderColor: COL.border }}>
            {/* Tier 1: clusters (with aggregate record counts so you see what's there without clicking in) */}
            <div className="flex items-center gap-1 px-2 pt-2">
              {tabClusters.map((c) => {
                const on = c === activeCluster;
                const cnt = c.tabs.reduce((n, v) => n + (tabCount[v] || 0), 0);
                return (
                  <button key={c.key} onClick={() => { if (!c.tabs.includes(activeTab)) setActiveTab(c.tabs[0]); }}
                    className="px-2.5 py-1 rounded-full text-[10.5px] font-semibold flex items-center gap-1.5 transition"
                    style={{ background: on ? COL.accent : COL.surfaceAlt, color: on ? '#fff' : COL.textDim }}>
                    {c.label}
                    {cnt > 0 && <span className="mono text-[9px] px-1 rounded-full" style={{ background: on ? 'rgba(255,255,255,0.25)' : COL.surface, color: on ? '#fff' : COL.textMute }}>{cnt}</span>}
                  </button>
                );
              })}
            </div>
            {/* Tier 2: the tabs inside the active cluster */}
            <div className="flex px-1.5 mt-1">
              {activeCluster.tabs.map((v) => { const tb = tabByV[v]; if (!tb) return null; const Icon = tb.icon; const a = activeTab === v; return (
                <button key={v} onClick={() => setActiveTab(v)} className="flex-shrink-0 px-2.5 py-2 text-[10px] font-semibold flex items-center gap-1 whitespace-nowrap" style={{ color: a ? COL.accent : COL.textDim, borderBottom: a ? `2px solid ${COL.accent}` : '2px solid transparent' }}><Icon size={11} />{tb.label}</button>
              ); })}
            </div>
          </div>)}
          {selected && recordsError && (
            <div className="flex items-center gap-2 px-4 py-2 text-[10.5px] border-b" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' }}>
              <AlertOctagon size={12} className="flex-shrink-0" />
              <span className="flex-1">Couldn’t load records for this element.</span>
              <button onClick={() => setRefreshKey((k) => k + 1)} className="font-semibold underline">Retry</button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto scrollbar">
            {!selected ? (
              <div className="p-5 space-y-4">
                <div>
                  <div className="text-[13px] font-semibold" style={{ color: COL.text }}>Select an element to inspect</div>
                  <div className="text-[11px] mt-1 leading-snug" style={{ color: COL.textDim }}>Click any element in the 3D model or the list to see its BoQ link, evidence, and commercial status.</div>
                </div>
                {/* At-a-glance model readiness */}
                <div className="rounded-lg border divide-y" style={{ borderColor: COL.border }}>
                  {[['Linked to BoQ', summary.linked, COL.accent], ['Need linking', summary.unlinked, '#b45309'], ['With WIR evidence', summary.withWir, '#15803d']].map(([label, val, color]) => (
                    <div key={label} className="flex items-center justify-between px-3 py-2 text-[11.5px]" style={{ borderColor: COL.border }}>
                      <span style={{ color: COL.textDim }}>{label}</span>
                      <span className="mono font-bold" style={{ color }}>{val.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                {/* Where to go next */}
                <div className="space-y-1.5">
                  <button onClick={reviewUnlinked} disabled={summary.unlinked === 0} className="w-full flex items-center gap-2 px-3 py-2 text-[11.5px] rounded-lg border font-medium transition hover:bg-stone-50 disabled:opacity-50" style={{ borderColor: COL.borderStrong, color: COL.text, background: COL.surface }}>
                    <AlertOctagon size={13} style={{ color: '#b45309' }} />Review unlinked elements
                  </button>
                  <button onClick={() => onNavigate?.('registry')} className="w-full flex items-center gap-2 px-3 py-2 text-[11.5px] rounded-lg border font-medium transition hover:bg-stone-50" style={{ borderColor: COL.borderStrong, color: COL.text, background: COL.surface }}>
                    <Layers size={13} style={{ color: COL.accent }} />Open Elements Registry
                  </button>
                  <button onClick={() => onNavigate?.('workitems')} className="w-full flex items-center gap-2 px-3 py-2 text-[11.5px] rounded-lg border font-medium transition hover:bg-stone-50" style={{ borderColor: COL.borderStrong, color: COL.text, background: COL.surface }}>
                    <ClipboardCheck size={13} style={{ color: COL.accent }} />Go to Work Items
                  </button>
                </div>
                {/* BIM stays optional */}
                <div className="text-[10.5px] leading-snug rounded-md px-2.5 py-2" style={{ background: COL.surfaceAlt, color: COL.textMute }}>
                  BIM helps locate and link work visually. It’s optional — projects can still run from BoQ and Work Items without a model.
                </div>
              </div>
            ) : <>
              {activeTab === 'properties' && (
                <div className="p-5 space-y-4 text-xs">
                  {/* ───── FROM MODEL (read-only) — the IFC's own data, never edited ───── */}
                  <div className="rounded-lg border overflow-hidden" style={{ borderColor: COL.border }}>
                    <button type="button" onClick={() => setPropSection((s) => ({ ...s, model: !s.model }))} className="w-full flex items-center gap-1.5 px-3 py-2" style={{ background: COL.surfaceAlt }}>
                      <Lock size={10} style={{ color: COL.textMute }} />
                      <span className="mono text-[10px] tracking-widest" style={{ color: COL.textMute }}>FROM MODEL · READ-ONLY</span>
                      {propSection.model ? <ChevronDown size={13} className="ms-auto" style={{ color: COL.textMute }} /> : <ChevronRight size={13} className="ms-auto" style={{ color: COL.textMute }} />}
                    </button>
                    {propSection.model && (
                    <div className="px-3 py-2.5" style={{ background: COL.surface }}>
                    {[['IFC Name', selected.ifcName || selected.name], ['IFC Type', selected.type], ['Level', selected.level ? normalizeStorey(selected.level) : '—'], ['IFC GUID', selected.guid]].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-3 py-0.5"><span style={{ color: COL.textDim }}>{k}</span><span className="mono text-[11px]" style={{ color: COL.text, textAlign: 'end', wordBreak: 'break-all' }}>{v}</span></div>
                    ))}
                    {/* Base quantities (from the IFC where available; fill blanks if the
                        IFC carried none). Editing here never changes the IFC file. */}
                    <div className="mt-2">
                      <div className="text-[9.5px] mb-1" style={{ color: COL.textMute }}>Base quantities (from IFC where available)</div>
                      {[['volume', 'Volume', 'm³'], ['area', 'Area', 'm²'], ['length', 'Length', 'm']].map(([f, label, unit]) => (
                        <div key={f} className="flex justify-between items-center gap-3 py-1">
                          <span style={{ color: COL.textDim }}>{label}</span>
                          <div className="flex items-center gap-1">
                            <input key={`${selected.guid}-${f}`} defaultValue={selected[f] ?? ''} inputMode="decimal" placeholder="—"
                              onBlur={(e) => { if (String(e.target.value) !== String(selected[f] ?? '')) saveQty(f, e.target.value); }}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                              className="mono text-[11px] text-right w-20 px-1 py-0.5 rounded border outline-none focus:border-blue-500" style={{ borderColor: COL.border, background: COL.surface, color: COL.text }} />
                            <span className="mono text-[10px]" style={{ color: COL.textMute }}>{unit}</span>
                          </div>
                        </div>
                      ))}
                      {selected.volume == null && selected.area == null && selected.length == null && (
                        <div className="text-[10px] mt-1" style={{ color: '#b45309' }}>No quantities from the IFC — enter manually to enable quantity × rate valuation.</div>
                      )}
                    </div>
                    </div>
                    )}
                  </div>

                  {/* ───── ADDED BY YOU (editable) — additive user metadata only ───── */}
                  <div className="rounded-lg border overflow-hidden" style={{ borderColor: COL.border }}>
                    <button type="button" onClick={() => setPropSection((s) => ({ ...s, mine: !s.mine }))} className="w-full flex items-center gap-1.5 px-3 py-2" style={{ background: COL.accentBg }}>
                      <Pencil size={10} style={{ color: COL.accent }} />
                      <span className="mono text-[10px] tracking-widest" style={{ color: COL.accent }}>ADDED BY YOU · EDITABLE</span>
                      {propSection.mine ? <ChevronDown size={13} className="ms-auto" style={{ color: COL.accent }} /> : <ChevronRight size={13} className="ms-auto" style={{ color: COL.accent }} />}
                    </button>
                    {propSection.mine && (
                    <div className="px-3 py-2.5" style={{ background: COL.surface }}>

                    {/* Display name (alias) — what shows in lists & the link picker */}
                    <label className="block mb-2">
                      <div className="flex items-center justify-between mb-1">
                        <span style={{ color: COL.textDim }}>Display name</span>
                        {selected.displayName == null && <span className="text-[9.5px]" style={{ color: '#b45309' }}>none — add one</span>}
                      </div>
                      <input key={`${selected.guid}-dn`} defaultValue={selected.displayName ?? ''} placeholder={selected.ifcName || 'Friendly name for this element'}
                        onBlur={(e) => saveUserText('user_display_name', e.target.value, selected.displayName)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        className="w-full px-2 py-1.5 text-[11px] rounded border outline-none focus:border-blue-500" style={{ borderColor: COL.border, background: COL.surface, color: COL.text }} />
                    </label>

                    {/* Description (existing feature — unchanged) */}
                    <label className="block mb-2">
                      <div className="flex items-center justify-between mb-1">
                        <span style={{ color: COL.textDim }}>Description</span>
                        {selected.description == null && <span className="text-[9.5px]" style={{ color: '#b45309' }}>none — add one</span>}
                      </div>
                      <textarea key={`${selected.guid}-desc`} defaultValue={selected.description ?? ''} rows={2} placeholder="Add a description for this element…"
                        onBlur={(e) => saveDescription(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } }}
                        className="w-full resize-none px-2 py-1.5 text-[11px] rounded border outline-none focus:border-blue-500" style={{ borderColor: COL.border, background: COL.surface, color: COL.text }} />
                    </label>

                    {/* Material / grade tag — also assists BoQ matching */}
                    <label className="block mb-2">
                      <span className="block mb-1" style={{ color: COL.textDim }}>Material / grade</span>
                      <input key={`${selected.guid}-mat`} defaultValue={selected.material ?? ''} placeholder="e.g. Concrete C40, S355 steel…"
                        onBlur={(e) => saveUserText('user_material', e.target.value, selected.material)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        className="w-full px-2 py-1.5 text-[11px] rounded border outline-none focus:border-blue-500" style={{ borderColor: COL.border, background: COL.surface, color: COL.text }} />
                    </label>

                    {/* Zone / area tag */}
                    <label className="block mb-2">
                      <span className="block mb-1" style={{ color: COL.textDim }}>Zone / area</span>
                      <input key={`${selected.guid}-zone`} defaultValue={selected.zone ?? ''} placeholder="e.g. Pier 3, Deck span B…"
                        onBlur={(e) => saveUserText('user_zone', e.target.value, selected.zone)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        className="w-full px-2 py-1.5 text-[11px] rounded border outline-none focus:border-blue-500" style={{ borderColor: COL.border, background: COL.surface, color: COL.text }} />
                    </label>

                    {/* Custom key→value notes */}
                    <div>
                      <span className="block mb-1" style={{ color: COL.textDim }}>Notes</span>
                      {selected.notes && Object.keys(selected.notes).length > 0 && (
                        <div className="space-y-1 mb-1.5">
                          {Object.entries(selected.notes).map(([k, val]) => (
                            <div key={k} className="flex items-center gap-2 rounded border px-2 py-1" style={{ borderColor: COL.border, background: COL.surface }}>
                              <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: COL.text }}>{k}</span>
                              <span className="text-[10px] truncate flex-1" style={{ color: COL.textDim }}>{String(val)}</span>
                              <button onClick={() => removeNote(k)} title="Remove note" className="p-0.5 rounded hover:bg-stone-100 flex-shrink-0" style={{ color: '#b91c1c' }}><X size={11} /></button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <input value={noteK} onChange={(e) => setNoteK(e.target.value)} placeholder="Key" className="w-24 px-2 py-1 text-[10px] rounded border outline-none focus:border-blue-500" style={{ borderColor: COL.border, background: COL.surface, color: COL.text }} />
                        <input value={noteV} onChange={(e) => setNoteV(e.target.value)} placeholder="Value" onKeyDown={(e) => { if (e.key === 'Enter') addNote(); }} className="flex-1 px-2 py-1 text-[10px] rounded border outline-none focus:border-blue-500" style={{ borderColor: COL.border, background: COL.surface, color: COL.text }} />
                        <button onClick={addNote} disabled={!noteK.trim()} title="Add note" className="p-1 rounded border disabled:opacity-40" style={{ borderColor: COL.borderStrong, color: COL.accent }}><Plus size={12} /></button>
                      </div>
                    </div>
                    </div>
                    )}
                  </div>
                </div>
              )}
              {activeTab === 'timeline' && <TimelineTab wirs={wirs} qcs={qcs} ncrs={ncrs} drawings={drawings} snags={snags} docs={docs} />}
              {activeTab === 'wir' && <WIRsTab wirs={wirs} />}
              {activeTab === 'qc' && <QCTab qcs={qcs} />}
              {activeTab === 'ncr' && <NCRsTab ncrs={ncrs} />}
              {activeTab === 'snags' && <SnagsTab snags={snags} />}
              {activeTab === 'drawings' && <DrawingsTab drawings={drawings} />}
              {activeTab === 'docs' && <DocsTab docs={docs} />}
              {activeTab === 'qs' && (boq ? <QSTab boq={boq} t={t} /> : <Empty label="No BoQ line linked to this element" />)}
            </>}
          </div>
        </div>
        )}
        </ErrorBoundary>
      </div>

      {linkGuids && (
        <LinkBoard elements={elements} boqAll={boqAll} initialElements={linkGuids}
          onClose={() => { setLinkGuids(null); setPicked(new Set()); setRefreshKey((k) => k + 1); }}
          onChanged={() => { loadBoq(); reloadElements(); setRefreshKey((k) => k + 1); }} />
      )}
      {/* Quick-raise records prefilled with the selected element. Each modal is
          mounted ONLY while active so its form seeds from the CURRENT selected
          element — a permanently-mounted modal captured `initial` once (when
          selectedGuid was still null), so raised records saved with an empty
          element_guid and never linked to the element. */}
      {selected && raise === 'wir' && <WirFormModal open initial={{ element_guid: selectedGuid }} onClose={() => setRaise(null)} onSaved={() => { setRaise(null); setRefreshKey((k) => k + 1); }} />}
      {selected && raise === 'qc' && <QcFormModal open initial={{ element_guid: selectedGuid }} onClose={() => setRaise(null)} onSaved={() => { setRaise(null); setRefreshKey((k) => k + 1); }} />}
      {selected && raise === 'ncr' && <NcrFormModal open initial={{ element_guid: selectedGuid }} onClose={() => setRaise(null)} onSaved={() => { setRaise(null); setRefreshKey((k) => k + 1); }} />}
      {selected && raise === 'drawing' && <DrawingFormModal open initial={{ linked_elements: [selectedGuid] }} onClose={() => setRaise(null)} onSaved={() => { setRaise(null); setRefreshKey((k) => k + 1); }} />}
      <BulkRaiseWirModal open={bulkWir} guids={[...picked]} names={metaByGuid} onClose={() => setBulkWir(false)} onDone={() => { setBulkWir(false); setPicked(new Set()); setRefreshKey((k) => k + 1); }} />
    </div>
  );
}
