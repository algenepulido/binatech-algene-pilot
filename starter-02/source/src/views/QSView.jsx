import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import { confirmDialog } from '../components/ConfirmDialog.jsx';
import { toast } from '../components/Toast.jsx';
import { Download, FileSpreadsheet, Pencil, Plus, RotateCcw, Trash2, Upload, ShieldCheck, ChevronDown, Sparkles } from 'lucide-react';
import { Btn, KpiCard, PageHeader } from '../components/primitives.jsx';
import { BoqFormModal } from './qs/BoqForm.jsx';
import { BoqImportModal } from './qs/BoqImport.jsx';
import { BulkEditModal } from './qs/BulkEdit.jsx';
import { listBoqItems, listBoqItemsPage, deleteBoqItem, updateBoqItem, isBoqLineItem } from '../api/boqItems.js';
import { listAllLinks, linkElementBoq, unlinkElementBoq } from '../api/elementBoqLinks.js';
import { loadElementStatusMap, ESTATUS } from '../lib/elementStatus.js';
import { recertifyAll } from '../lib/recertify.js';
import { useElements } from '../lib/elements.jsx';
import { getCurrentProjectId } from '../lib/currentProject.js';
import { Modal } from '../components/Modal.jsx';
import { Drawer } from '../components/Drawer.jsx';
import { listWirs } from '../api/wirs.js';
import { countAttachmentsByRecord } from '../lib/attachments.js';
import { ChevronRight as ChevR, Lock, Unlock, X, Box as CubeIcon, Plus as PlusIcon, Link2 } from 'lucide-react';
import { usePackages, PackageBar, PackageManagerModal } from '../components/PackageControls.jsx';
import { PackageSplitModal } from '../components/PackageSplitModal.jsx';
import { splitQuality } from '../lib/packageSplit.js';
import { suggestPackagesAI } from '../api/packageSuggest.js';
import { LinkBoard } from './model/LinkBoard.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { VirtualList } from '../components/VirtualList.jsx';
import { Search } from 'lucide-react';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';
import { usePermissions } from '../lib/usePermissions.jsx';
import { fmt, fmtSAR, fmtMoney, fmtQty, fmtAmount, fmtRate } from '../lib/format.js';
import { COL } from '../lib/theme.js';
import { exportSheet } from '../lib/excelExport.js';

// Inline-editable table cell: edits in place, commits on blur / Enter.
function InlineCell({ value, onCommit, type = 'text', align = 'left', mono, disabled }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  if (disabled) return <span className={`px-1.5 py-1 inline-block w-full ${mono ? 'mono' : ''}`} style={{ textAlign: align, color: COL.text, fontSize: 12 }}>{(value === '' || value == null) ? '—' : value}</span>;
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (String(v) !== String(value ?? '')) onCommit(v); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setV(value ?? ''); e.currentTarget.blur(); } }}
      inputMode={type === 'num' ? 'decimal' : undefined}
      className={`w-full bg-transparent outline-none px-1.5 py-1 rounded border border-transparent hover:border-stone-200 focus:bg-white ${mono ? 'mono' : ''}`}
      style={{ textAlign: align, color: COL.text, fontSize: 12 }}
    />
  );
}

// Commercial-readiness presentation: the five-quantity stacked bar + status badge.
const BADGE = {
  ready: ['Ready', '#15803d', '#dcfce7'],
  progress: ['In progress', '#b45309', '#fef3c7'],
  blocked: ['Blocked', '#991b1b', '#fee2e2'],
  unmapped: ['Unmapped', '#78716c', COL.surfaceAlt],
};
function ReadinessBadge({ kind }) {
  const [l, c, bg] = BADGE[kind] || BADGE.unmapped;
  return <span className="mono text-[9px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap" style={{ background: bg, color: c }}>{l}</span>;
}
function ReadinessBar({ r }) {
  const total = r.contractQty || 1;
  const seg = (q, color, title) => (q > 0.0001 ? <div title={title} style={{ width: `${Math.min(100, (q / total) * 100)}%`, background: color }} /> : null);
  return (
    <div className="h-2 rounded-full overflow-hidden flex" style={{ background: '#e5e7eb' }}>
      {seg(r.approvedQty, '#16a34a', 'Approved / certifiable')}
      {seg(r.progressQty, '#1d4ed8', 'Linked, in progress')}
      {seg(r.blockedQty, '#dc2626', 'Blocked by NCR')}
      {seg(r.unlinkedQty, '#d1d5db', 'Unlinked / unmapped')}
    </div>
  );
}

// ============================================================
// QS / BoQ VIEW — real CRUD backed by Supabase. Line Items are inline-editable
// (single rows) and multi-select bulk-editable. The "Commercial" tab adds the
// five-quantity commercial-readiness surface (contract/linked/approved/blocked).
// ============================================================
export function QSView({ t }) {
  const { requireAuth } = useAuth();
  const { can } = usePermissions();
  const canEditBoq = can('boq.edit');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('commercial');
  const [proofLine, setProofLine] = useState(null);   // BoQ line shown in the proof drawer
  const [applyPreview, setApplyPreview] = useState(null); // { rows, updates } before committing readiness
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const { packages, reload: reloadPackages } = usePackages();
  const [pkg, setPkg] = useState('all');
  const [pkgMgr, setPkgMgr] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [aiGroups, setAiGroups] = useState(null); // set by the AI fallback (Step 4); null = deterministic
  const [aiBusy, setAiBusy] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [sort, setSort] = useState({ key: 'code', dir: 'asc' });
  const sortBy = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
  // Search (debounced) — filters BoQ by code + description across all tabs.
  const [q, setQ] = useState('');
  const [qd, setQd] = useState('');
  useEffect(() => { const id = setTimeout(() => setQd(q.trim().toLowerCase()), 200); return () => clearTimeout(id); }, [q]);
  // Independent sort for the Commercial tab.
  const [csort, setCsort] = useState({ key: 'code', dir: 'asc' });
  const csortBy = (key) => setCsort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
  const { elements } = useElements();
  const elName = useMemo(() => Object.fromEntries(elements.map((e) => [e.guid, e.name])), [elements]);
  const [expanded, setExpanded] = useState(null); // expanded BoQ code
  const [linkTarget, setLinkTarget] = useState(null); // boq item to link elements to
  const lockKey = `bimqc.boqLock.${getCurrentProjectId()}`;
  const [locked, setLocked] = useState(() => { try { return localStorage.getItem(lockKey) === '1'; } catch { return false; } });
  const toggleLock = () => { const v = !locked; setLocked(v); try { localStorage.setItem(lockKey, v ? '1' : '0'); } catch { /* ignore */ } };

  const [allLinks, setAllLinks] = useState([]);
  const [statusMap, setStatusMap] = useState({});
  // WIRs + their evidence counts power the "supporting WIRs" section of the
  // proof drawer: a commercial line's claim is only as good as the inspections
  // behind it, so the chain BoQ → WIR → evidence is readable without leaving
  // this screen. Both are non-blocking: the BoQ table renders regardless, and
  // an unavailable evidence index stays UNKNOWN (null) rather than "0 files".
  const [wirs, setWirs] = useState([]);
  const [wirAttachCounts, setWirAttachCounts] = useState(null);
  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setItems([]); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      setItems(await listBoqItems());
      listAllLinks().then(setAllLinks).catch(() => setAllLinks([]));
      loadElementStatusMap().then(setStatusMap).catch(() => setStatusMap({}));
      listWirs().then(setWirs).catch(() => setWirs([]));
      countAttachmentsByRecord('wir').then(setWirAttachCounts).catch(() => setWirAttachCounts(null));
    } catch (err) { setError(err?.message ?? String(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // --- Line Items: SERVER-SIDE pagination/search/sort (scales to huge BoQs) ---
  const PAGE_SIZE = 100;
  const [page, setPage] = useState(0);
  const [itemRows, setItemRows] = useState([]);
  const [itemCount, setItemCount] = useState(0);
  const [itemLoading, setItemLoading] = useState(false);
  const loadItemsPage = useCallback(async (p) => {
    setItemLoading(true);
    try { const { rows, count } = await listBoqItemsPage({ q: qd, sortKey: sort.key, sortDir: sort.dir, pkg, page: p, pageSize: PAGE_SIZE }); setItemRows(rows); setItemCount(count); }
    catch { setItemRows([]); setItemCount(0); }
    finally { setItemLoading(false); }
  }, [qd, sort.key, sort.dir, pkg]);
  useEffect(() => { setPage(0); }, [qd, sort.key, sort.dir, pkg, tab]);
  useEffect(() => { if (tab === 'items') loadItemsPage(page); }, [tab, page, loadItemsPage]);

  // boq_item_id -> set of linked element guids (join table + legacy element_id)
  const linksByBoq = useMemo(() => {
    const m = {};
    for (const l of allLinks) { (m[l.boq_item_id] = m[l.boq_item_id] || new Set()).add(l.element_guid); }
    for (const b of items) { if (b.element_id) (m[b.id] = m[b.id] || new Set()).add(b.element_id); }
    return m;
  }, [allLinks, items]);

  // Model readiness for a BOQ line: of its linked elements, how many are
  // "clear to certify" (approved WIR, no open NCR) -> certifiable qty.
  const readinessFor = useCallback((boqId, qty) => {
    const guids = linksByBoq[boqId];
    if (!guids || guids.size === 0) return null;
    let clear = 0; guids.forEach((g) => { if (statusMap[g]?.clear) clear++; });
    return { linked: guids.size, clear, pct: clear / guids.size, certQty: (clear / guids.size) * Number(qty || 0) };
  }, [linksByBoq, statusMap]);

  // Live commercial readiness for ONE line: split the contract qty into
  // approved (clear elements), blocked (open NCR), in-progress (linked, not yet
  // proven) and unlinked. Derived from element status — never typed.
  const lineReadiness = useCallback((b) => {
    const qty = Number(b.qty || 0), rate = Number(b.rate || 0);
    const guids = linksByBoq[b.id];
    const linkedCount = guids ? guids.size : 0;
    // CERTIFIED follows the stored approved_qty (written by recertify from approved
    // WIR quantities), capped at contract — NOT a count share of the contract.
    // Linking alone (no approved WIR) => approvedQty 0.
    const approvedQty = Math.min(qty, Math.max(0, Number(b.approved_qty || 0)));
    const approvedValue = approvedQty * rate;
    const pct = qty > 0 ? Math.min(1, approvedQty / qty) : 0;
    // Blocked is informational: linked elements held by an open NCR / rejected.
    let blocked = 0;
    if (guids) guids.forEach((g) => { const s = statusMap[g]; if (s?.key === 'ncr' || s?.key === 'rejected') blocked++; });
    const blockedQty = linkedCount ? Math.max(0, ((blocked / linkedCount) * qty) - approvedQty) : 0;
    const progressQty = Math.max(0, qty - approvedQty - blockedQty);
    const badge = (qty > 0 && approvedQty >= qty) ? 'ready' : approvedQty > 0 ? 'progress' : blocked > 0 ? 'blocked' : linkedCount > 0 ? 'progress' : 'unmapped';
    // Over-mapping: linked elements' total quantity exceeds the contract qty
    // (likely a wrong/duplicate link) — flagged, never silently inflated.
    const mappedQty = b.mapped_qty != null ? Number(b.mapped_qty) : null;
    const overMapped = mappedQty != null && qty > 0 && mappedQty > qty + 0.001;
    return { contractQty: qty, approvedQty, progressQty, blockedQty, unlinkedQty: linkedCount === 0 ? qty : 0, linkedCount, clearCount: 0, blockedCount: blocked, rate, value: qty * rate, approvedValue, blockedValue: blockedQty * rate, pct, badge, mappedQty, overMapped };
  }, [linksByBoq, statusMap]);

  // WIRs that reach a BoQ line, via the elements linked to it. This is the
  // commercial chain made visible: contract quantity is only claimable where an
  // approved inspection supports it. Read-only derivation — it changes no
  // certification semantics, it just shows the evidence already in the records.
  const wirsForLine = useCallback((b) => {
    const guids = linksByBoq[b?.id];
    if (!guids || guids.size === 0) return [];
    return wirs
      .filter((w) => w.element_guid && guids.has(w.element_guid))
      .sort((x, y) => String(y.inspection_date || '').localeCompare(String(x.inspection_date || '')));
  }, [linksByBoq, wirs]);

  // Whole-project commercial waterfall (real line items only — excludes summary rows).
  const waterfall = useMemo(() => {
    let contract = 0, mapped = 0, proven = 0, blocked = 0;
    for (const b of items) {
      if (!isBoqLineItem(b)) continue;
      const r = lineReadiness(b);
      contract += r.value; if (r.linkedCount > 0) mapped += r.value;
      proven += r.approvedValue; blocked += r.blockedValue;
    }
    return { contract, mapped, unlinked: contract - mapped, proven, blocked, certifiable: Math.max(0, proven) };
  }, [items, lineReadiness]);

  // Recompute every line's approved_qty from the real approved-WIR quantities
  // (the SAME engine the WIR/NCR saves run). This replaces the old count-based
  // "push model readiness", which would re-introduce over-certification by
  // certifying a count share of the contract rather than approved quantities.
  function applyModelReadiness() {
    requireAuth(async () => {
      // Cert-adjacent write (recomputes certified qty from approved WIRs across
      // the project) — confirm first so it isn't a silent one-click money-chain edit.
      if (!await confirmDialog({
        title: 'Recompute certified quantities?',
        message: 'This recalculates each BoQ line’s certified quantity from its approved WIRs (capped at contract) and updates commercial figures across the project. Continue?',
        confirmLabel: 'Recompute', cancelLabel: 'Cancel',
      })) return;
      try {
        const n = await recertifyAll();
        load();
        toast.success(n > 0 ? `Recomputed certified quantities from approved WIRs — ${n} line(s) updated.` : 'Certified quantities already match approved WIRs.');
      } catch (e) { toast.error(e?.message || 'Could not recompute certified quantities.'); }
    });
  }
  async function commitApply() {
    const updates = applyPreview?.updates || []; setApplyPreview(null);
    try { for (const u of updates) await updateBoqItem(u.id, { approved_qty: u.approved_qty }); load(); }
    catch (e) { toast.error(e.message); }
  }

  // Package filter for the TABLE only. The master BOQ totals (KPIs) always
  // reflect the whole project, regardless of the filter (partial cert by package).
  const view = useMemo(() => items.filter((b) => {
    if (pkg !== 'all' && (pkg === 'unassigned' ? !!b.package_id : b.package_id !== pkg)) return false;
    if (qd && !`${b.code || ''} ${b.description || ''}`.toLowerCase().includes(qd)) return false;
    return true;
  }), [items, pkg, qd]);

  // Real line items shaped for the package auto-split (id/code/description/qty/rate/section).
  const splitLines = useMemo(() => items.filter(isBoqLineItem).map((b) => ({ id: b.id, code: b.code, description: b.description, unit: b.unit, qty: Number(b.qty || 0), rate: Number(b.rate || 0), section: b.section })), [items]);
  // Offer the AI fallback only when deterministic code-based grouping is poor.
  const splitPoor = useMemo(() => splitQuality(splitLines).poor, [splitLines]);
  async function suggestWithAI() {
    setAiBusy(true);
    try { const groups = await suggestPackagesAI(splitLines); setAiGroups(groups); setSplitOpen(true); }
    catch (e) { toast.error(`${e?.message || 'AI suggestion failed'} — falling back to code-based grouping.`); setAiGroups(null); setSplitOpen(true); }
    finally { setAiBusy(false); }
  }

  // The pkg-filtered, real line items for the Commercial table (after `view`),
  // with readiness precomputed once, then sorted by the Commercial sort.
  const commercialData = useMemo(() => view.filter(isBoqLineItem).map((b) => ({ b, r: lineReadiness(b) })), [view, lineReadiness]);
  const commercialSorted = useMemo(() => {
    const acc = {
      code: ({ b }) => b.code || '', desc: ({ b }) => b.description || '',
      cert: ({ r }) => r.approvedValue, status: ({ r }) => ['ready', 'progress', 'blocked', 'unmapped'].indexOf(r.badge), links: ({ r }) => r.linkedCount,
      contractQty: ({ r }) => r.contractQty, rate: ({ r }) => r.rate, contractValue: ({ r }) => r.value, eligibleQty: ({ r }) => r.approvedQty,
    }[csort.key] || ((x) => x.b.code || '');
    const d = csort.dir === 'asc' ? 1 : -1;
    return [...commercialData].sort((x, y) => { const a = acc(x), b = acc(y); return (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true })) * d; });
  }, [commercialData, csort]);

  const aggregated = useMemo(() => {
    const map = {};
    for (const b of view) {
      if (!map[b.code]) map[b.code] = { code: b.code, desc: b.description, unit: b.unit, rate: Number(b.rate || 0), totalQty: 0, approvedQty: 0, elements: [], section: b.section || null, minPos: b.position ?? Infinity };
      map[b.code].totalQty += Number(b.qty || 0);
      map[b.code].approvedQty += Number(b.approved_qty || 0);
      if (b.position != null) map[b.code].minPos = Math.min(map[b.code].minPos, b.position);
      if (b.element_id) map[b.code].elements.push(b.element_id);
    }
    return Object.values(map);
  }, [view]);
  // Does the bill have section/division structure to show as group headers?
  const hasSections = useMemo(() => view.some((b) => b.section), [view]);

  // Whole-project totals (always all items) for the KPI cards.
  const totals = useMemo(() => {
    let total = 0, approved = 0;
    for (const b of items) { total += Number(b.qty || 0) * Number(b.rate || 0); approved += Number(b.approved_qty || 0) * Number(b.rate || 0); }
    return { total, approved, pct: total ? (approved / total) * 100 : 0 };
  }, [items]);

  // Subset rollup for the selected package (shown when filtered).
  const subset = useMemo(() => {
    if (pkg === 'all') return null;
    let total = 0, approved = 0;
    for (const b of view) { total += Number(b.qty || 0) * Number(b.rate || 0); approved += Number(b.approved_qty || 0) * Number(b.rate || 0); }
    return { total, approved, count: view.length };
  }, [view, pkg]);

  // --- Sorting (clickable headers in both tabs) ---
  const cmp = (a, b) => {
    if (a == null && b == null) return 0; if (a == null) return 1; if (b == null) return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  };
  const codeVal = { code: (b) => b.code, desc: (b) => b.desc, unit: (b) => b.unit, totalQty: (b) => b.totalQty, approvedQty: (b) => b.approvedQty, rate: (b) => b.rate, totalValue: (b) => b.totalQty * b.rate, certified: (b) => b.approvedQty * b.rate, progress: (b) => (b.totalQty ? b.approvedQty / b.totalQty : 0), elements: (b) => b.elements.length };
  const itemVal = { code: (b) => b.code, element: (b) => b.element_id, description: (b) => b.description, unit: (b) => b.unit, qty: (b) => Number(b.qty), approved: (b) => Number(b.approved_qty), rate: (b) => Number(b.rate), value: (b) => Number(b.qty || 0) * Number(b.rate || 0) };
  const sortedAggregated = useMemo(() => {
    // Default (Code) order = SOURCE order when the bill has sections, so division
    // headers render above their items in the original sequence; explicit other
    // sorts behave normally.
    if (sort.key === 'code' && hasSections) return [...aggregated].sort((x, y) => ((x.minPos ?? Infinity) - (y.minPos ?? Infinity)) * (sort.dir === 'asc' ? 1 : -1));
    const acc = codeVal[sort.key]; if (!acc) return aggregated; const d = sort.dir === 'asc' ? 1 : -1; return [...aggregated].sort((x, y) => cmp(acc(x), acc(y)) * d);
  }, [aggregated, sort, hasSections]);
  // Decorate each group with the section header to render above it (only in the
  // source-ordered default view).
  const aggDecorated = useMemo(() => {
    const showHeaders = hasSections && sort.key === 'code';
    let last;
    return sortedAggregated.map((g) => { const sec = g.section || null; const header = showHeaders && sec !== last ? sec : null; last = sec; return { g, header }; });
  }, [sortedAggregated, hasSections, sort.key]);
  const sortedView = useMemo(() => { const acc = itemVal[sort.key]; if (!acc) return view; const d = sort.dir === 'asc' ? 1 : -1; return [...view].sort((x, y) => cmp(acc(x), acc(y)) * d); }, [view, sort]);
  const CODE_COLS = [['code', 'BoQ Code'], ['desc', 'Description'], ['unit', 'Unit'], ['totalQty', 'Total Qty'], ['approvedQty', 'Approved Qty'], ['rate', 'Rate (SAR)'], ['totalValue', 'Total Value'], ['certified', 'Certified Value'], ['progress', 'Progress'], ['elements', 'Elements']];
  const ITEM_COLS = [['code', 'Code'], ['element', 'Element'], ['description', 'Description'], ['unit', 'Unit'], ['qty', 'Qty'], ['approved', 'Approved'], ['rate', 'Rate'], ['value', 'Value']];
  const arrow = (k) => (sort.key === k ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '');

  const refreshAfterEdit = () => { if (tab === 'items') loadItemsPage(page); else load(); };
  function onDelete(it) { requireAuth(async () => { if (!await confirmDialog(`Delete BoQ item ${it.code} / ${it.element_id || ''}?`)) return; try { await deleteBoqItem(it.id); refreshAfterEdit(); } catch (e) { toast.error(e.message); } }); }

  const itemsByCode = useMemo(() => { const m = {}; items.forEach((b) => { (m[b.code || '(no code)'] = m[b.code || '(no code)'] || []).push(b); }); return m; }, [items]);
  async function unlinkEl(it, guid) {
    try { if (it.element_id === guid) await updateBoqItem(it.id, { element_id: null }); else await unlinkElementBoq(guid, it.id, getCurrentProjectId()); load(); }
    catch (e) { toast.error(e.message); }
  }

  // Inline single-cell save.
  async function saveCell(id, field, raw) {
    if (locked) return;
    const num = field === 'qty' || field === 'approved_qty' || field === 'rate';
    const val = num ? (Number(raw) || 0) : (String(raw).trim() || null);
    try { await updateBoqItem(id, { [field]: val }); refreshAfterEdit(); } catch (e) { toast.error(e.message); }
  }
  const toggleSel = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allVisibleSelected = itemRows.length > 0 && itemRows.every((b) => sel.has(b.id));
  const toggleAll = () => setSel((s) => { const n = new Set(s); if (itemRows.every((b) => n.has(b.id))) itemRows.forEach((b) => n.delete(b.id)); else itemRows.forEach((b) => n.add(b.id)); return n; });
  function bulkDelete() { requireAuth(async () => { if (!await confirmDialog(`Delete ${sel.size} selected line(s)? This cannot be undone.`)) return; try { for (const id of sel) await deleteBoqItem(id); setSel(new Set()); refreshAfterEdit(); } catch (e) { toast.error(e.message); } }); }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title={t.qs} subtitle="Bill of Quantities mapped to BIM elements"
        actions={<><Btn icon={RotateCcw} onClick={load}>Refresh</Btn>{!locked && <Btn icon={ShieldCheck} onClick={applyModelReadiness}>Recompute certified</Btn>}<Btn icon={Upload} onClick={() => exportSheet({ fileName: 'BoQ', title: 'BILL OF QUANTITIES', rows: items, columns: [
          { label: 'Code', key: 'code', width: 12 },
          { label: 'Section', key: 'section', width: 22 },
          { label: 'Description', key: 'description', width: 40, wrap: true },
          { label: 'Unit', key: 'unit', width: 8 },
          { label: 'Qty', key: 'qty', type: 'num', width: 10 },
          { label: 'Approved Qty', key: 'approved_qty', type: 'num', width: 12 },
          { label: 'Rate', key: 'rate', type: 'money', width: 12 },
          { label: 'Amount', type: 'money', width: 16, total: true, value: (r) => (Number(r.qty) || 0) * (Number(r.rate) || 0) },
          { label: 'Certified', type: 'money', width: 16, total: true, value: (r) => (Number(r.approved_qty) || 0) * (Number(r.rate) || 0) },
        ] })}>Export</Btn>{!locked && canEditBoq && <Btn icon={Download} onClick={() => requireAuth(() => setImportOpen(true))}>Import Excel</Btn>}{canEditBoq && <Btn icon={locked ? Unlock : Lock} onClick={toggleLock}>{locked ? 'Unlock' : 'Lock'}</Btn>}{!locked && canEditBoq && <Btn icon={Plus} variant="primary" onClick={() => requireAuth(() => { setEditing(null); setFormOpen(true); })}>Add BoQ Item</Btn>}</>} />
      {items.length > 0 && tab !== 'commercial' && (
        <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b" style={{ borderColor: COL.border, background: COL.surface }}>
          <KpiCard label="Total BoQ Value" value={fmtMoney(totals.total)} />
          <KpiCard label="Certified Value" value={fmtMoney(totals.approved)} accent="#16a34a" progress={totals.pct} />
          <KpiCard label="Remaining" value={fmtMoney(totals.total - totals.approved)} accent="#d97706" />
          <KpiCard label="% Complete" value={`${Math.round(totals.pct)}%`} accent={COL.accent} />
        </div>
      )}

      <div className="px-6 py-2.5 border-b flex items-center justify-between flex-wrap gap-2" style={{ borderColor: COL.border, background: COL.surface }}>
        <div className="flex items-center gap-2 flex-wrap">
          <PackageBar packages={packages} value={pkg} onChange={setPkg} onManage={() => setPkgMgr(true)} />
          {splitLines.length > 1 && <button onClick={() => { setAiGroups(null); setSplitOpen(true); }} className="px-2 py-1.5 text-[11px] rounded-lg border font-medium flex items-center gap-1.5" style={{ borderColor: COL.borderStrong, color: COL.accent }}><Sparkles size={12} /> Suggest packages</button>}
          {splitPoor && splitLines.length > 1 && <button onClick={suggestWithAI} disabled={aiBusy} className="px-2 py-1.5 text-[11px] rounded-lg border font-medium flex items-center gap-1.5" style={{ borderColor: COL.borderStrong, color: '#7c3aed' }} title="Code-based grouping looks weak — let AI propose packages"><Sparkles size={12} /> {aiBusy ? 'Thinking…' : 'Suggest with AI'}</button>}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {subset && <span className="mono text-[11px]" style={{ color: COL.textDim }}>Package subset: {subset.count} lines · {fmtMoney(subset.total)} · certified {fmtMoney(subset.approved)}</span>}
          <div className="relative">
            <Search size={13} className="absolute start-2.5 top-1/2 -translate-y-1/2" style={{ color: COL.textMute }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code or description…" className="ps-8 pe-2 py-1.5 text-xs rounded-lg border outline-none w-56 focus:border-blue-500" style={{ background: COL.bg, borderColor: COL.borderStrong, color: COL.text }} />
          </div>
        </div>
      </div>

      <div className="flex border-b" style={{ borderColor: COL.border, background: COL.surface }}>
        {[{ id: 'commercial', label: 'Commercial' }, { id: 'code', label: 'By BoQ Code' }, { id: 'items', label: 'Line Items' }].map((tb) => (
          <button key={tb.id} onClick={() => setTab(tb.id)} className="px-5 py-2.5 text-sm font-medium" style={{ color: tab === tb.id ? COL.accent : COL.textDim, borderBottom: tab === tb.id ? `2px solid ${COL.accent}` : '2px solid transparent', background: tab === tb.id ? COL.bg : 'transparent' }}>{tb.label}</button>
        ))}
      </div>

      {!isSupabaseConfigured && <div className="mx-6 mt-3 text-xs px-3 py-2 rounded border" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>Supabase isn't configured. Add your keys to <span className="mono">.env</span> and restart the dev server.</div>}

      <div className="flex-1 overflow-y-auto scrollbar">
        {loading ? <div className="text-center text-xs py-10" style={{ color: COL.textMute }}>Loading BoQ…</div>
          : error ? <div className="mx-6 my-4 text-xs px-3 py-2 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>
          : items.length === 0 ? <EmptyState icon={FileSpreadsheet} title="No Bill of Quantities yet"
              description={t.boqEmptyDescription}
              steps={t.boqEmptySteps}
              actions={canEditBoq ? [{ label: 'Import Excel', icon: Download, onClick: () => requireAuth(() => setImportOpen(true)) }, { label: 'Add BoQ Item', icon: Plus, variant: 'secondary', onClick: () => requireAuth(() => { setEditing(null); setFormOpen(true); }) }] : []} />
          : tab === 'commercial' ? (
            <div className="p-4 sm:p-6 space-y-4">
              {/* Commercial waterfall — contract → mapped → proven → certifiable, with blocked */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <KpiCard label="Contract value" value={fmtMoney(waterfall.contract)} />
                <KpiCard label="Mapped to model" value={fmtMoney(waterfall.mapped)} accent={COL.accent} hint={waterfall.unlinked > 0 ? `${fmtMoney(waterfall.unlinked)} unlinked` : 'fully mapped'} />
                <KpiCard label="Eligible value" value={fmtMoney(waterfall.proven)} accent="#16a34a" hint="supported by approved WIR qty" />
                <KpiCard label="Eligible, not blocked" value={fmtMoney(waterfall.certifiable)} accent="#15803d" hint="ready to put in an IPC" />
                <KpiCard label="Blocked value" value={fmtMoney(waterfall.blocked)} accent={waterfall.blocked > 0 ? '#dc2626' : undefined} hint={waterfall.blocked > 0 ? 'held by NCRs' : 'nothing held by NCRs'} />
              </div>

              {(() => {
                // A QS reads left-to-right: what is contracted, what that is
                // worth, how much is eligible, and what supports it. Numerics
                // are fixed-width so columns compare down the page.
                const GRID = '92px minmax(140px,1fr) 88px 92px 116px 88px 116px 190px 96px 56px';
                const cArrow = (k) => (csort.key === k ? (csort.dir === 'asc' ? ' ▲' : ' ▼') : '');
                const HEADS = [['code', 'Code'], ['desc', 'Description'], ['contractQty', 'Contract qty'], ['rate', 'Rate'],
                  ['contractValue', 'Contract value'], ['eligibleQty', 'Eligible qty'], ['cert', 'Eligible value'],
                  ['readiness', 'Readiness'], ['status', 'Status'], ['links', 'WIRs']];
                const sortableKeys = { readiness: null }; // readiness header isn't a sort key
                const listH = Math.max(260, (typeof window !== 'undefined' ? window.innerHeight : 800) - 420);
                return (
                  // On phones the key figures live in the KPI cards above; the
                  // detailed per-line grid scrolls within its own box (contained)
                  // rather than clipping or breaking the page. Desktop unaffected.
                  <div className="rounded-xl border overflow-x-auto lg:overflow-hidden" style={{ borderColor: COL.border, background: COL.surface }}>
                    <div className="mono grid items-center px-4 py-2.5 border-b text-[11px] font-semibold uppercase tracking-wide" style={{ gridTemplateColumns: GRID, minWidth: 660, background: COL.surfaceAlt, color: COL.textDim, borderColor: COL.border }}>
                      {HEADS.map(([k, label]) => (
                        <button key={k} type="button" onClick={() => (k in sortableKeys ? null : csortBy(k))} className={`text-start whitespace-nowrap ${k in sortableKeys ? 'cursor-default' : 'cursor-pointer hover:text-stone-700'}`} style={{ color: csort.key === k ? COL.accent : undefined }}>{label}{cArrow(k)}</button>
                      ))}
                    </div>
                    <VirtualList items={commercialSorted} rowHeight={56} height={listH}
                      empty={<div className="px-4 py-10 text-center text-[12px]" style={{ color: COL.textMute }}>{qd ? 'No lines match your search.' : 'No line items in this view.'}</div>}
                      renderRow={({ b, r }) => (
                        <div key={b.id} onClick={() => setProofLine(b)} aria-selected={proofLine?.id === b.id}
                          className={`grid items-center px-4 border-b cursor-pointer ${proofLine?.id === b.id ? '' : 'hover:bg-stone-50'}`}
                          style={{ gridTemplateColumns: GRID, height: 56, borderColor: COL.border, background: proofLine?.id === b.id ? COL.accentBg : undefined, boxShadow: proofLine?.id === b.id ? `inset 3px 0 0 ${COL.accent}` : undefined }}>
                          <span className="mono font-semibold truncate" style={{ color: COL.accent }}>{b.code || '—'}</span>
                          <span className="truncate pe-3 text-[12px]" title={b.description}>{b.description || '—'}</span>
                          <span className="mono text-end text-[12px] pe-2" style={{ color: COL.text }}>{fmtQty(r.contractQty)}<span className="text-[9.5px]" style={{ color: COL.textMute }}> {b.unit || ''}</span></span>
                          <span className="mono text-end text-[12px] pe-2" style={{ color: COL.textDim }}>{fmtRate(r.rate)}</span>
                          <span className="mono text-end text-[12px] pe-2" style={{ color: COL.text }}>{fmtAmount(r.value)}</span>
                          <span className="mono text-end text-[12px] pe-2" style={{ color: r.approvedQty > 0 ? '#15803d' : COL.textMute }}>{fmtQty(r.approvedQty)}</span>
                          <span className="mono text-end font-bold text-[12px] pe-2" style={{ color: r.approvedValue > 0 ? '#15803d' : COL.textMute }}>{r.approvedValue > 0 ? fmtAmount(r.approvedValue) : '—'}</span>
                          <span className="pe-3">
                            <ReadinessBar r={r} />
                            <span className="mono text-[9.5px] mt-1 block" style={{ color: COL.textDim }}>{fmtQty(r.approvedQty)}/{fmtQty(r.contractQty)} {b.unit || ''}{r.blockedQty > 0 ? ` · ${fmtQty(r.blockedQty)} blocked` : r.unlinkedQty > 0 ? ' · unlinked' : ''}{r.overMapped ? <b style={{ color: '#b91c1c' }}> · over-mapped {fmtQty(r.mappedQty)}</b> : ''}</span>
                          </span>
                          <span><ReadinessBadge kind={r.badge} /></span>
                          <span className="mono text-[10px] text-end pe-1" style={{ color: COL.textDim }}>{wirsForLine(b).length || '—'}</span>
                        </div>
                      )} />
                  </div>
                );
              })()}
              {/* Scoped totals. A commercial total that silently covered only
                  the filtered rows would be read as the project position, so the
                  scope is always stated. */}
              {(() => {
                const scoped = Boolean(qd) || pkg !== 'all';
                const t = commercialSorted.reduce((acc, { r }) => ({
                  contract: acc.contract + r.value, eligible: acc.eligible + r.approvedValue,
                }), { contract: 0, eligible: 0 });
                return (
                  <div className="rounded-xl border px-4 py-2.5 flex items-center gap-6 flex-wrap" style={{ borderColor: COL.border, background: COL.surfaceAlt }}>
                    <span className="mono text-[10.5px] font-bold uppercase tracking-wide" style={{ color: scoped ? '#b45309' : COL.textDim }}>
                      {scoped ? 'Filtered lines only' : 'All lines'} · {commercialSorted.length.toLocaleString()} lines
                    </span>
                    <span className="mono text-[11.5px]" style={{ color: COL.textDim }}>Contract value <b style={{ color: COL.text }}>SAR {fmtAmount(t.contract)}</b></span>
                    <span className="mono text-[11.5px]" style={{ color: COL.textDim }}>Eligible value <b style={{ color: t.eligible > 0 ? '#15803d' : COL.textMute }}>SAR {fmtAmount(t.eligible)}</b></span>
                  </div>
                );
              })()}
              <div className="text-[10.5px]" style={{ color: COL.textMute }}><b>Contract ≥ Mapped ≥ Eligible.</b> Eligible = approved-WIR quantity × rate, capped at contract — linking maps an element to a line but does not make it eligible. Click a line for its proof.</div>
            </div>
          ) : tab === 'code' ? (
            <table className="w-full text-xs">
              <thead className="sticky top-0 mono" style={{ background: COL.surface, color: COL.textDim }}><tr style={{ borderBottom: `1px solid ${COL.border}` }}>{CODE_COLS.map(([k, label]) => <th key={k} onClick={() => sortBy(k)} className="px-4 py-2.5 text-start cursor-pointer select-none whitespace-nowrap hover:text-stone-700" style={{ color: sort.key === k ? COL.accent : undefined }}>{label}{arrow(k)}</th>)}</tr></thead>
              <tbody>
                {aggDecorated.map(({ g: b, header }) => {
                  const pct = b.totalQty ? (b.approvedQty / b.totalQty) * 100 : 0;
                  const codeItems = itemsByCode[b.code] || [];
                  const linkedTotal = codeItems.reduce((n, it) => n + (linksByBoq[it.id]?.size || 0), 0);
                  const isOpen = expanded === b.code;
                  return (
                    <Fragment key={b.code}>
                      {header !== null && <tr style={{ background: COL.surfaceAlt }}><td colSpan={CODE_COLS.length} className="px-4 py-2 mono text-[11px] font-bold tracking-wide" style={{ color: COL.text, borderTop: `2px solid ${COL.border}` }}>▸ {header || '(no section)'}</td></tr>}
                      <tr className="border-b hover:bg-stone-50 cursor-pointer" style={{ borderColor: COL.border, background: isOpen ? COL.bg : undefined }} onClick={() => setExpanded(isOpen ? null : b.code)}>
                        <td className="px-4 py-2.5 mono font-semibold" style={{ color: COL.accent }}><span className="inline-flex items-center gap-1">{isOpen ? <ChevronDown size={12} /> : <ChevR size={12} />}{b.code}</span></td>
                        <td className="px-4 py-2.5">{b.desc}</td>
                        <td className="px-4 py-2.5 mono text-[10px]" style={{ color: COL.textDim }}>{b.unit}</td>
                        <td className="px-4 py-2.5 mono text-right">{Math.round(b.totalQty * 100) / 100}</td>
                        <td className="px-4 py-2.5 mono text-right" style={{ color: b.approvedQty > 0 ? '#16a34a' : COL.textMute }}>{Math.round(b.approvedQty * 100) / 100}</td>
                        <td className="px-4 py-2.5 mono text-right">{fmt(b.rate)}</td>
                        <td className="px-4 py-2.5 mono text-right font-semibold">{fmt(b.totalQty * b.rate)}</td>
                        <td className="px-4 py-2.5 mono text-right font-bold" style={{ color: '#15803d' }}>{fmt(b.approvedQty * b.rate)}</td>
                        <td className="px-4 py-2.5"><div className="flex items-center gap-2"><div className="h-1.5 rounded-full overflow-hidden flex-1" style={{ background: COL.surfaceAlt }}><div className="h-full" style={{ width: `${pct}%`, background: pct === 100 ? '#16a34a' : pct > 0 ? COL.accent : COL.textMute }} /></div><span className="mono text-[10px]" style={{ color: COL.textDim }}>{Math.round(pct)}%</span></div></td>
                        <td className="px-4 py-2.5 mono text-[10px]" style={{ color: COL.textDim }}>{linkedTotal} linked</td>
                      </tr>
                      {isOpen && (
                        <tr style={{ borderBottom: `1px solid ${COL.border}` }}><td colSpan={CODE_COLS.length} className="p-0" style={{ background: COL.bg }}>
                          <div className="px-6 py-4 space-y-3">
                          {codeItems.map((it) => {
                            const gs = [...(linksByBoq[it.id] || [])];
                            const clearCount = gs.reduce((n, g) => n + (statusMap[g]?.clear ? 1 : 0), 0);
                            return (
                              <div key={it.id} className="rounded-xl border overflow-hidden" style={{ borderColor: COL.border, background: COL.surface }}>
                                {/* line header */}
                                <div className="flex items-center gap-3 px-3.5 py-2.5 border-b" style={{ borderColor: COL.border, background: COL.surfaceAlt }}>
                                  <Link2 size={13} style={{ color: COL.accent }} className="flex-shrink-0" />
                                  <span className="text-[12.5px] font-semibold flex-1 min-w-0 truncate" style={{ color: COL.text }}>{it.description || it.code || '(line)'}</span>
                                  {gs.length > 0 && (
                                    <span className="mono text-[10px] px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: COL.bg, color: COL.textDim, border: `1px solid ${COL.border}` }}>
                                      {gs.length} linked{clearCount > 0 && <span style={{ color: '#15803d' }}> · {clearCount} clear</span>}
                                    </span>
                                  )}
                                  {!locked && (
                                    <button onClick={() => requireAuth(() => setLinkTarget(it))} className="text-[11px] px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1 hover:bg-stone-50 flex-shrink-0" style={{ borderColor: COL.borderStrong, color: COL.accent, background: COL.surface }}>
                                      <PlusIcon size={12} /> Link elements
                                    </button>
                                  )}
                                </div>
                                {/* element chips */}
                                <div className="px-3.5 py-3">
                                  {gs.length === 0 ? (
                                    <div className="flex items-center gap-2 text-[11.5px] py-1" style={{ color: COL.textMute }}>
                                      <CubeIcon size={13} className="opacity-50" /> No model elements linked yet.
                                    </div>
                                  ) : (
                                    <div className="flex flex-wrap gap-2">{gs.map((g) => {
                                      const st = ESTATUS[statusMap[g]?.key] || ESTATUS.not_started;
                                      return (
                                        <span key={g} className="group inline-flex items-center gap-2 ps-2.5 pe-1.5 py-1 rounded-lg text-[11px]" style={{ background: COL.bg, border: `1px solid ${COL.border}`, color: COL.text }} title={st.label}>
                                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: st.color }} />
                                          <span className="flex flex-col leading-tight min-w-0">
                                            <span className="font-semibold truncate max-w-[160px]">{elName[g] || 'Element'}</span>
                                            <span className="mono text-[8.5px] truncate max-w-[160px]" style={{ color: COL.textMute }}>{g}</span>
                                          </span>
                                          {!locked && <button onClick={() => unlinkEl(it, g)} className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 opacity-40 group-hover:opacity-100 hover:bg-red-50" style={{ color: '#b91c1c' }} title="Unlink element"><X size={12} /></button>}
                                        </span>
                                      );
                                    })}</div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          </div>
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <>
              {sel.size > 0 && (
                <div className="px-6 py-2 border-b flex items-center gap-2 flex-wrap" style={{ borderColor: COL.border, background: COL.accentBg }}>
                  <span className="text-[12px] font-semibold" style={{ color: COL.accent }}>{sel.size} selected</span>
                  {canEditBoq && <Btn icon={Pencil} onClick={() => requireAuth(() => setBulkOpen(true))}>Edit selected</Btn>}
                  {canEditBoq && <Btn icon={Trash2} onClick={bulkDelete}>Delete</Btn>}
                  <button onClick={() => setSel(new Set())} className="text-[12px] ms-auto" style={{ color: COL.textDim }}>Clear selection</button>
                </div>
              )}
              <div className="px-6 pt-2 flex items-center justify-between flex-wrap gap-2 text-[11px]" style={{ color: COL.textMute }}>
                <span>{locked ? 'BoQ is locked — read-only. Click Unlock to edit.' : 'Tip: edit any cell directly (Enter to save). Tick rows to edit or delete several. Search + sort + paging run server-side.'}</span>
                <span className="mono">{itemLoading ? 'Loading…' : `${itemCount.toLocaleString()} rows`}</span>
              </div>
              <table className="w-full text-xs">
                <thead className="sticky top-0 mono" style={{ background: COL.surfaceAlt, color: COL.textDim }}>
                  <tr style={{ borderBottom: `1px solid ${COL.border}` }}>
                    {!locked && <th className="px-3 py-2.5 w-8"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} className="w-3.5 h-3.5 accent-blue-700" /></th>}
                    {ITEM_COLS.map(([k, label]) => <th key={k} onClick={() => sortBy(k)} className="px-3 py-2.5 text-start text-[11px] font-semibold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:text-stone-700" style={{ color: sort.key === k ? COL.accent : undefined }}>{label}{arrow(k)}</th>)}
                    {!locked && <th className="px-3 py-2.5" />}
                  </tr>
                </thead>
                <tbody>
                  {itemRows.map((b) => (
                    <tr key={b.id} className="border-b hover:bg-stone-50" style={{ borderColor: COL.border, background: sel.has(b.id) ? COL.accentBg : undefined }}>
                      {!locked && <td className="px-3 py-1 text-center"><input type="checkbox" checked={sel.has(b.id)} onChange={() => toggleSel(b.id)} className="w-3.5 h-3.5 accent-blue-700" /></td>}
                      <td className="px-2 py-1 w-24"><InlineCell value={b.code} onCommit={(v) => saveCell(b.id, 'code', v)} mono disabled={locked} /></td>
                      <td className="px-3 py-1 mono text-[11px]">
                        {b.element_id || '—'}
                        {(() => { const n = linksByBoq[b.id]?.size || 0; return n > 0 ? <span title={[...(linksByBoq[b.id] || [])].join(', ')} className="ms-1.5 inline-flex items-center gap-0.5 px-1 rounded text-[9px]" style={{ background: COL.accentBg, color: COL.accent }}>🔗 {n}</span> : null; })()}
                        {(() => { const r = readinessFor(b.id, b.qty); return r ? <span className="ms-1 inline-flex items-center px-1 rounded text-[9px]" style={{ background: r.clear === r.linked ? '#f0fdf4' : '#fffbeb', color: r.clear === r.linked ? '#15803d' : '#b45309' }} title="clear to certify / linked">{r.clear}/{r.linked} clear</span> : null; })()}
                      </td>
                      <td className="px-2 py-1"><InlineCell value={b.description} onCommit={(v) => saveCell(b.id, 'description', v)} disabled={locked} /></td>
                      <td className="px-2 py-1 w-16"><InlineCell value={b.unit} onCommit={(v) => saveCell(b.id, 'unit', v)} mono disabled={locked} /></td>
                      <td className="px-2 py-1 w-20"><InlineCell value={b.qty} onCommit={(v) => saveCell(b.id, 'qty', v)} type="num" align="right" mono disabled={locked} /></td>
                      <td className="px-2 py-1 w-20"><InlineCell value={b.approved_qty} onCommit={(v) => saveCell(b.id, 'approved_qty', v)} type="num" align="right" mono disabled={locked} /></td>
                      <td className="px-2 py-1 w-24"><InlineCell value={b.rate} onCommit={(v) => saveCell(b.id, 'rate', v)} type="num" align="right" mono disabled={locked} /></td>
                      <td className="px-3 py-1 mono text-end font-semibold">{fmt(Number(b.qty || 0) * Number(b.rate || 0))}</td>
                      {!locked && <td className="px-3 py-1 text-end whitespace-nowrap">
                        <button onClick={() => requireAuth(() => { setEditing(b); setFormOpen(true); })} className="p-1 rounded hover:bg-stone-100" style={{ color: COL.accent }} title="Open full editor"><Pencil size={12} /></button>
                        <button onClick={() => onDelete(b)} className="p-1 rounded hover:bg-stone-100" style={{ color: '#b91c1c' }}><Trash2 size={12} /></button>
                      </td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              {itemRows.length === 0 && !itemLoading && <div className="px-6 py-10 text-center text-[12px]" style={{ color: COL.textMute }}>{qd ? 'No lines match your search.' : 'No line items.'}</div>}
              {itemCount > PAGE_SIZE && (
                <div className="px-6 py-3 flex items-center justify-between text-[12px] border-t" style={{ borderColor: COL.border, color: COL.textDim }}>
                  <span className="mono">Page {page + 1} of {Math.max(1, Math.ceil(itemCount / PAGE_SIZE))} · {itemCount.toLocaleString()} rows</span>
                  <div className="flex gap-2">
                    <button disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="px-2.5 py-1 rounded-lg border disabled:opacity-40" style={{ borderColor: COL.borderStrong, color: COL.text }}>Prev</button>
                    <button disabled={(page + 1) * PAGE_SIZE >= itemCount} onClick={() => setPage((p) => p + 1)} className="px-2.5 py-1 rounded-lg border disabled:opacity-40" style={{ borderColor: COL.borderStrong, color: COL.text }}>Next</button>
                  </div>
                </div>
              )}
            </>
          )}
      </div>

      <BoqFormModal open={formOpen} initial={editing} packages={packages} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); load(); }} />
      <BoqImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={load} />
      <PackageManagerModal open={pkgMgr} onClose={() => setPkgMgr(false)} packages={packages} onChanged={reloadPackages} />
      <PackageSplitModal open={splitOpen} lines={splitLines} initialGroups={aiGroups} title={aiGroups ? 'AI-suggested packages' : 'Suggested packages'}
        onClose={() => { setSplitOpen(false); setAiGroups(null); }} onAccepted={() => { load(); reloadPackages(); }} />
      <BulkEditModal open={bulkOpen} ids={[...sel]} packages={packages} onClose={() => setBulkOpen(false)} onDone={() => { setBulkOpen(false); setSel(new Set()); load(); }} />
      {linkTarget && <LinkBoard elements={elements} boqAll={items} initialLines={[linkTarget.id]} onClose={() => setLinkTarget(null)} onChanged={load} />}

      {/* Proof drawer — why this line is (not) certifiable, traced to its elements */}
      {proofLine && (() => {
        const r = lineReadiness(proofLine);
        const gs = [...(linksByBoq[proofLine.id] || [])];
        return (
          <Drawer open onClose={() => setProofLine(null)} title={`${proofLine.code || 'Line'} · proof`} subtitle={proofLine.description} width={560}
            footer={<><Btn variant="secondary" onClick={() => setProofLine(null)}>Close</Btn>{!locked && <Btn variant="primary" icon={Link2} onClick={() => { setLinkTarget(proofLine); setProofLine(null); }}>Link elements</Btn>}</>}>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                {[['Contract', fmt(r.value), COL.text], ['Certifiable', fmt(r.approvedValue), '#15803d'], ['Blocked', fmt(r.blockedValue), '#dc2626']].map(([l, v, c]) => (
                  <div key={l} className="rounded-lg border p-2.5" style={{ borderColor: COL.border, background: COL.bg }}>
                    <div className="mono text-[9px] tracking-widest" style={{ color: COL.textMute }}>{l.toUpperCase()} SAR</div>
                    <div className="mono text-sm font-bold mt-1" style={{ color: c }}>{v}</div>
                  </div>
                ))}
              </div>
              {/* Quantity ledger — the commercial question is "how much of the
                  contract quantity is actually supported, and what is left". */}
              <div className="rounded-lg border divide-y" style={{ borderColor: COL.border }}>
                {[
                  ['Contract qty', `${Math.round(r.contractQty * 100) / 100} ${proofLine.unit || ''}`, COL.text],
                  ['Approved (supported by WIR)', `${Math.round(r.approvedQty * 100) / 100} ${proofLine.unit || ''}`, r.approvedQty > 0 ? '#15803d' : COL.textMute],
                  ['Remaining', `${Math.round(Math.max(0, r.contractQty - r.approvedQty) * 100) / 100} ${proofLine.unit || ''}`, COL.text],
                ].map(([l, v, c]) => (
                  <div key={l} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[12px]">
                    <span style={{ color: COL.textDim }}>{l}</span>
                    <span className="mono font-semibold" style={{ color: c }}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="text-[12px] px-3 py-2 rounded-lg" style={{ background: COL.accentBg, color: COL.text }}>
                {r.linkedCount === 0 ? 'Not mapped to the model — link elements to make this line certifiable.'
                  : `${Math.round(r.approvedQty * 100) / 100} of ${Math.round(r.contractQty * 100) / 100} ${proofLine.unit || ''} approved — ${r.clearCount} of ${r.linkedCount} linked elements clear${r.blockedCount > 0 ? `, ${r.blockedCount} blocked by NCR` : ''}.`}
              </div>

              {/* Supporting WIRs — the inspections behind the claim, in context. */}
              {(() => {
                const lw = wirsForLine(proofLine);
                return (
                  <div>
                    <div className="mono text-[10px] tracking-widest mb-1.5" style={{ color: COL.textMute }}>SUPPORTING WIRs ({lw.length})</div>
                    {lw.length === 0 ? (
                      <div className="text-[12px]" style={{ color: COL.textMute }}>
                        {r.linkedCount === 0 ? 'No elements linked, so no inspection can reach this line.' : 'No WIR reaches the linked elements yet — quantity cannot be certified without one.'}
                      </div>
                    ) : (
                      <div className="rounded-lg border divide-y max-h-56 overflow-y-auto scrollbar" style={{ borderColor: COL.border }}>
                        {lw.map((w) => {
                          const approved = /approv|pass|closed/i.test(String(w.result || ''));
                          const known = wirAttachCounts != null;
                          const files = known ? (wirAttachCounts[w.id] || 0) : 0;
                          return (
                            <div key={w.id} className="flex items-center gap-2 px-3 py-2">
                              <span className="mono text-[11px] font-semibold flex-shrink-0" style={{ color: COL.accent }}>{w.wir_number || w.id.slice(0, 8)}</span>
                              <span className="mono text-[9.5px] px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: approved ? '#dcfce7' : COL.pendingSoft, color: approved ? '#15803d' : COL.pending }}>{w.result || 'Pending'}</span>
                              <span className="text-[11.5px] truncate flex-1" style={{ color: COL.textDim }}>{elName[w.element_guid] || w.inspection_type || ''}</span>
                              <span className="mono text-[10px] flex-shrink-0 inline-flex items-center gap-1" style={{ color: !known ? COL.textMute : files > 0 ? COL.textDim : COL.pending }}>
                                {!known ? '—' : files > 0 ? `${files} file${files === 1 ? '' : 's'}` : 'no evidence'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
              <div>
                <div className="mono text-[10px] tracking-widest mb-1.5" style={{ color: COL.textMute }}>LINKED ELEMENTS ({gs.length})</div>
                {gs.length === 0 ? <div className="text-[12px]" style={{ color: COL.textMute }}>None linked.</div> : (
                  <div className="rounded-lg border divide-y max-h-64 overflow-y-auto scrollbar" style={{ borderColor: COL.border }}>
                    {gs.map((g) => { const st = ESTATUS[statusMap[g]?.key] || ESTATUS.not_started; return (
                      <div key={g} className="flex items-center gap-2 px-3 py-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: st.color }} />
                        <span className="text-[12.5px] truncate flex-1" style={{ color: COL.text }}>{elName[g] || 'Element'}</span>
                        <span className="mono text-[10px] flex-shrink-0" style={{ color: st.color }}>{st.label}</span>
                      </div>
                    ); })}
                  </div>
                )}
              </div>
            </div>
          </Drawer>
        );
      })()}

      {/* Apply-readiness preview diff — never overwrite silently */}
      {applyPreview && (
        <Modal open onClose={() => setApplyPreview(null)} title="Apply model readiness" subtitle={`${applyPreview.rows.length} line(s) will change`} width={620}
          footer={<><Btn variant="secondary" onClick={() => setApplyPreview(null)}>Cancel</Btn><Btn variant="primary" icon={ShieldCheck} onClick={commitApply}>Apply {applyPreview.rows.length} change(s)</Btn></>}>
          <div className="rounded-lg border divide-y max-h-[50vh] overflow-y-auto scrollbar" style={{ borderColor: COL.border }}>
            {applyPreview.rows.map((row, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 text-[12px]">
                <span className="mono font-semibold" style={{ color: COL.accent, minWidth: 64 }}>{row.code || '—'}</span>
                <span className="flex-1 truncate" style={{ color: COL.textDim }} title={row.desc}>{row.desc}</span>
                <span className="mono whitespace-nowrap" style={{ color: COL.textDim }}>{Math.round(row.oldQ * 100) / 100} → <b style={{ color: COL.text }}>{Math.round(row.newQ * 100) / 100}</b></span>
                <span className="mono whitespace-nowrap font-semibold" style={{ minWidth: 90, textAlign: 'end', color: row.deltaVal >= 0 ? '#15803d' : '#b91c1c' }}>{row.deltaVal >= 0 ? '+' : ''}{fmt(row.deltaVal)}</span>
              </div>
            ))}
          </div>
          <div className="text-[11px] mt-2" style={{ color: COL.textMute }}>Sets each linked line's Approved Qty from its clear-to-certify elements. This feeds the IPC.</div>
        </Modal>
      )}
    </div>
  );
}
