// ============================================================
// ElementsRegistryView — a single auditable list of every element in the
// project's active model: IFC GUID, name/description, type, level, quantity,
// the BoQ line(s) it backs, its WIR/QC/NCR counts, and WHEN it was imported.
// Searchable, filterable (type / level / linked-status), sortable, and
// virtualized so it stays fast with thousands of elements.
// ============================================================
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { StyledSelect } from '../components/StyledSelect.jsx';
import { Boxes, RotateCcw, Download, Search, ArrowUp, ArrowDown, Link2, ArrowRight } from 'lucide-react';
import { PageHeader, Btn } from '../components/primitives.jsx';
import { VirtualList } from '../components/VirtualList.jsx';
import { loadElementRegistry } from '../lib/elementRegistry.js';
import { subscribeProject } from '../lib/currentProject.js';
import { normalizeStorey } from '../lib/storey.js';
import { COL } from '../lib/theme.js';
import { ElementDetailInspector } from './registry/ElementDetailInspector.jsx';
import { BatchSuggestPanel } from './registry/BatchSuggestPanel.jsx';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';
import { listBoqItems, isBoqLineItem } from '../api/boqItems.js';
import { suggestBoqLinksBatch, BATCH_AUTO_LIMIT, BATCH_HARD_LIMIT } from '../lib/batchSuggest.js';
import { useResizableColumns, ColResizer } from '../components/resizableColumns.jsx';
import { ModelUpload } from './settings/ModelUpload.jsx';
import { UnlocksRow, FlowStrip, ElementsPreview } from '../components/NoModelUi.jsx';
import { REGISTRY_PAGE, FLOW_STEPS } from './model/noModelContent.js';

const byNum = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
const num = (n) => Math.round((Number(n) || 0) * 100) / 100;
const typeShort = (t) => (t || '').replace(/^Ifc/, '') || '—';

// Primary quantity for display: prefer volume, then area, then length.
function qtyLabel(e) {
  if (e.volume != null) return `${num(e.volume)} m³`;
  if (e.area != null) return `${num(e.area)} m²`;
  if (e.length != null) return `${num(e.length)} m`;
  return '—';
}
function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// [check] | GUID | Element | Type | Level | Quantity | BoQ | Checks (W/Q/N) | Imported
// Columns are resizable (see useResizableColumns) — these are the defaults. The
// `flex` columns (Element, BoQ) absorb leftover width so the table fills nicely.
const REG_COLS = [
  { key: 'check', w: 34, resizable: false },
  { key: 'guid', w: 150, label: 'IFC GUID' },
  { key: 'name', w: 220, label: 'Element', flex: true },
  { key: 'type', w: 150, label: 'Type' },
  { key: 'level', w: 90, label: 'Level' },
  { key: 'qty', w: 110, label: 'Quantity' },
  { key: 'boq', w: 130, label: 'BoQ lines', flex: true },
  { key: 'checks', w: 130, label: 'WIR / QC / NCR' },
  { key: 'imported', w: 110, label: 'Imported' },
];
const HEAD_COLS = REG_COLS.filter((c) => c.key !== 'check');

const Pill = ({ n, label, color }) => (
  <span title={`${n} ${label}`} className="mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: n > 0 ? color.bg : COL.surfaceAlt, color: n > 0 ? color.fg : COL.textMute }}>{n}</span>
);
const W = { bg: '#e0e7ff', fg: '#3730a3' };
const Q = { bg: '#dcfce7', fg: '#15803d' };
const N = { bg: '#fee2e2', fg: '#b91c1c' };

// Shown in place of the grid when the project has no imported model yet. A
// structured workspace (status · dominant upload · what unlocks · downstream
// flow · a faded grid preview) so the page reads as intentional, not broken.
function RegistryEmptyState({ onNavigate, lang, onUploaded }) {
  const c = REGISTRY_PAGE;
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: COL.bg }}>
      <div className="p-4 sm:p-6">
        <div className="max-w-5xl mx-auto space-y-4 sm:space-y-5">
          <div className="grid lg:grid-cols-5 gap-4 sm:gap-5 items-stretch">
            {/* A. Status + the calm no-BIM path */}
            <section className="lg:col-span-3 rounded-2xl border p-5 sm:p-6 flex flex-col" style={{ background: COL.surface, borderColor: COL.border }}>
              <div className="flex items-center gap-2.5 mb-3">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: COL.accentBg }}><Boxes size={18} style={{ color: COL.accent }} /></span>
                <h2 className="display text-base font-bold" style={{ color: COL.text }}>{c.status.title}</h2>
              </div>
              <p className="text-[13px] leading-relaxed mb-4" style={{ color: COL.textDim }}>{c.status.line}</p>
              <dl className="space-y-2 mb-5">
                {c.status.fields.map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 text-[12.5px]">
                    <dt style={{ color: COL.textDim }}>{k}</dt>
                    <dd className="mono font-medium text-end" style={{ color: COL.text }}>{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-auto">
                <Btn icon={ArrowRight} variant="secondary" size="md" onClick={() => onNavigate?.(c.actions.secondary.route)}>{c.actions.secondary.label}</Btn>
                <div className="text-[11px] mt-2" style={{ color: COL.textMute }}>The registry, BoQ links and QC all populate once a model is imported — a model stays optional.</div>
              </div>
            </section>
            {/* B. Upload — the dominant action for this state */}
            <section className="lg:col-span-2 rounded-2xl border p-5 sm:p-6 flex flex-col" style={{ background: COL.surface, borderColor: COL.borderStrong, boxShadow: '0 1px 2px rgba(16,24,40,0.05)' }}>
              <div className="flex items-center gap-2.5 mb-1.5">
                <h2 className="display text-base font-bold" style={{ color: COL.text }}>{c.upload.header}</h2>
                <span className="ms-auto text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: COL.surfaceAlt, color: COL.textDim }}>Optional</span>
              </div>
              <p className="text-[12.5px] leading-relaxed mb-4" style={{ color: COL.textDim }}>{c.upload.description}</p>
              <div className="mt-auto"><ModelUpload compact uploadLabel={c.actions.primary.label} onComplete={onUploaded} /></div>
            </section>
          </div>

          {/* C. What this unlocks */}
          <section className="rounded-2xl border p-5" style={{ background: COL.surface, borderColor: COL.border }}>
            <UnlocksRow items={c.unlocks} />
          </section>

          {/* Downstream role of this page */}
          <section className="rounded-2xl border p-5" style={{ background: COL.surface, borderColor: COL.border }}>
            <div className="text-[10.5px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: COL.textDim }}>How this page fits the workflow</div>
            <FlowStrip steps={FLOW_STEPS} lang={lang} />
          </section>

          {/* Future data area — what the grid will hold after import */}
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-wider mb-2" style={{ color: COL.textDim }}>Registry preview</div>
            <ElementsPreview caption="Elements will appear here after IFC import" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ElementsRegistryView({ onOpenInModel, onNavigate, lang }) {
  const [rows, setRows] = useState(null); // null = loading
  const [q, setQ] = useState('');
  const [typeF, setTypeF] = useState('');
  const [levelF, setLevelF] = useState('');
  const [linkF, setLinkF] = useState('all'); // all | linked | unlinked
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' });
  const [openGuid, setOpenGuid] = useState(null); // detail inspector target
  const [picked, setPicked] = useState(() => new Set()); // multi-select for batch suggest
  const anchorRef = useRef(null); // sorted-index pivot for shift-range select
  const { template: gridTemplate, startResize, reset: resetCols } = useResizableColumns('bimqc.cols.elements.v1', REG_COLS);

  const load = useCallback(() => { loadElementRegistry().then(setRows).catch(() => setRows([])); }, []);
  // First load shows the skeleton; refreshes (e.g. after linking) keep rows in place.
  useEffect(() => { setRows(null); load(); }, [load]);
  useEffect(() => subscribeProject(() => { setRows(null); load(); }), [load]);

  const all = rows || [];
  const types = useMemo(() => [...new Set(all.map((e) => e.type).filter(Boolean))].sort(byNum), [all]);
  const levels = useMemo(() => [...new Set(all.map((e) => e.level).filter(Boolean))].sort(byNum), [all]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter((e) => {
      if (typeF && e.type !== typeF) return false;
      if (levelF && (e.level || '') !== levelF) return false;
      if (linkF === 'linked' && e.boqCodes.length === 0) return false;
      if (linkF === 'unlinked' && e.boqCodes.length > 0) return false;
      if (s && !`${e.name} ${e.ifcName || ''} ${e.description || ''} ${e.material || ''} ${e.type} ${e.guid} ${e.level || ''} ${e.boqCodes.join(' ')}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [all, q, typeF, levelF, linkF]);

  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    const keyVal = (e) => {
      switch (sort.key) {
        case 'name': return (e.description || e.name || '').toLowerCase();
        case 'type': return e.type || '';
        case 'level': return e.level || '';
        case 'qty': return e.volume ?? e.area ?? e.length ?? -1;
        case 'boq': return e.boqCodes.length;
        case 'checks': return e.wir + e.qc + e.ncr;
        case 'imported': return e.importedAt ? new Date(e.importedAt).getTime() : 0;
        case 'guid': return e.guid || '';
        default: return '';
      }
    };
    return [...filtered].sort((a, b) => {
      const va = keyVal(a), vb = keyVal(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return byNum(va, vb) * dir;
    });
  }, [filtered, sort]);

  const setSortKey = (k) => setSort((s) => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' });
  const Arrow = ({ k }) => sort.key !== k ? null : (sort.dir === 'asc' ? <ArrowUp size={11} className="inline ms-0.5" /> : <ArrowDown size={11} className="inline ms-0.5" />);

  // ── Multi-select (checkbox column) — drives batch AI suggestions ──────────
  const togglePick = (guid) => setPicked((s) => { const n = new Set(s); n.has(guid) ? n.delete(guid) : n.add(guid); return n; });
  const pickRange = (toIdx) => { const from = anchorRef.current; if (from == null) return; const [lo, hi] = from < toIdx ? [from, toIdx] : [toIdx, from]; setPicked((s) => { const n = new Set(s); for (let i = lo; i <= hi; i++) { const e = sorted[i]; if (e) n.add(e.guid); } return n; }); };
  const onRowCheck = (ev, idx, guid) => { ev.stopPropagation(); if (ev.shiftKey && anchorRef.current != null) pickRange(idx); else { anchorRef.current = idx; togglePick(guid); } };
  const allVisiblePicked = sorted.length > 0 && sorted.every((e) => picked.has(e.guid));
  const toggleVisible = () => setPicked((s) => { const n = new Set(s); sorted.forEach((e) => (allVisiblePicked ? n.delete(e.guid) : n.add(e.guid))); return n; });
  const clearPicked = () => { setPicked(new Set()); anchorRef.current = null; };
  // Drop selected guids that no longer exist after a data refresh.
  useEffect(() => { if (!rows) return; setPicked((s) => { if (s.size === 0) return s; const valid = new Set(all.map((e) => e.guid)); let changed = false; const n = new Set(); s.forEach((g) => { if (valid.has(g)) n.add(g); else changed = true; }); return changed ? n : s; }); }, [rows]); // eslint-disable-line

  // ── Batch AI suggestions (guarded, debounced, cancelable) ────────────────
  const [boqAll, setBoqAll] = useState(null); // lazy — only loaded once batch mode is needed
  const [batch, setBatch] = useState({ status: 'idle', results: [], done: 0, total: 0 });
  const reqRef = useRef(0);   // monotonic id; a newer selection invalidates older in-flight batches
  const acRef = useRef(null); // AbortController for in-flight fetches
  const pickedElements = useMemo(() => all.filter((e) => picked.has(e.guid)), [all, picked]);

  // Multi-select takes over from the single inspector.
  useEffect(() => { if (picked.size >= 2 && openGuid) setOpenGuid(null); }, [picked, openGuid]);
  // Lazily load BoQ lines the first time batch mode is entered.
  useEffect(() => { if (picked.size >= 2 && boqAll == null) listBoqItems().then(setBoqAll).catch(() => setBoqAll([])); }, [picked, boqAll]);

  const cancelInflight = () => { reqRef.current++; try { acRef.current?.abort(); } catch { /* ignore */ } };
  const runBatch = useCallback((force) => {
    const els = pickedElements;
    if (els.length < 2) { setBatch({ status: 'idle', results: [], done: 0, total: 0 }); return; }
    if (els.length > BATCH_HARD_LIMIT || (!force && els.length > BATCH_AUTO_LIMIT)) { setBatch({ status: 'oversized', results: [], done: 0, total: els.length }); return; }
    const candidates = (boqAll || []).filter(isBoqLineItem);
    if (candidates.length === 0) { setBatch({ status: 'empty', results: [], done: 0, total: els.length }); return; }
    const id = ++reqRef.current;
    try { acRef.current?.abort(); } catch { /* ignore */ }
    const ac = new AbortController(); acRef.current = ac;
    setBatch({ status: 'loading', results: [], done: 0, total: els.length });
    suggestBoqLinksBatch(els, candidates, {
      signal: ac.signal,
      shouldCancel: () => id !== reqRef.current,
      onProgress: (done, total) => { if (id === reqRef.current) setBatch((b) => ({ ...b, done, total })); },
    }).then((results) => { if (id === reqRef.current) setBatch({ status: 'done', results, done: results.length, total: els.length }); })
      .catch((e) => { console.warn('batch suggest failed:', e?.message ?? e); if (id === reqRef.current) setBatch({ status: 'error', results: [], done: 0, total: els.length }); });
  }, [pickedElements, boqAll]);

  // Keep the latest runBatch in a ref so the auto-run effect can fire without
  // depending on its identity (which changes on every data refresh).
  const runBatchRef = useRef(runBatch);
  useEffect(() => { runBatchRef.current = runBatch; }, [runBatch]);
  // Stable signature of the SELECTED SET — changes only when selection changes,
  // NOT when row objects are replaced by a refresh (so applying a link doesn't re-fetch).
  const pickedKey = useMemo(() => [...picked].sort().join(','), [picked]);

  // Auto-run on multi-select, 500ms debounced; a selection change cancels stale runs.
  useEffect(() => {
    const count = picked.size;
    if (count < 2) { cancelInflight(); setBatch({ status: 'idle', results: [], done: 0, total: 0 }); return undefined; }
    if (count > BATCH_AUTO_LIMIT) { cancelInflight(); setBatch({ status: 'oversized', results: [], done: 0, total: count }); return undefined; }
    if (boqAll == null) return undefined; // wait for BoQ load; this effect re-runs when it arrives
    const t = setTimeout(() => runBatchRef.current(false), 500);
    return () => clearTimeout(t);
  }, [pickedKey, boqAll]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportCsv = () => {
    const head = ['IFC GUID', 'Name', 'Description', 'Type', 'Level', 'Volume m3', 'Area m2', 'Length m', 'BoQ lines', 'WIRs', 'QC', 'NCRs', 'Open NCRs', 'Imported'];
    const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [head.join(',')];
    for (const e of sorted) lines.push([e.guid, e.name, e.description || '', e.type, e.level || '', e.volume ?? '', e.area ?? '', e.length ?? '', e.boqCodes.join(' | '), e.wir, e.qc, e.ncr, e.ncrOpen, fmtDate(e.importedAt)].map(esc).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'elements-registry.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const selStyle = { padding: '6px 8px', fontSize: 11.5, borderRadius: 8, border: `1px solid ${COL.borderStrong}`, background: COL.surface, color: COL.text, outline: 'none' };
  const segBtn = (active) => ({ background: active ? COL.accent : COL.surface, color: active ? '#fff' : COL.text, borderColor: active ? COL.accent : COL.borderStrong });
  const linkedCount = all.filter((e) => e.boqCodes.length > 0).length;

  const openRow = openGuid ? all.find((e) => e.guid === openGuid) : null;
  const noModel = rows !== null && all.length === 0; // loaded, but the project has no imported model
  return (
    <>
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title="Elements Registry" subtitle={REGISTRY_PAGE.subtitle}
        actions={<><Btn icon={Download} variant="secondary" onClick={exportCsv} disabled={!sorted.length}>Export CSV</Btn><Btn icon={RotateCcw} onClick={load}>Refresh</Btn></>} />

      {/* Toolbar — when no model is imported there is nothing to search/filter yet,
          so we show a single calm "unlocks after import" line instead of a faded,
          broken-looking control strip. The live controls return with the data. */}
      <div className="px-5 py-3 border-b flex flex-wrap items-center gap-2" style={{ borderColor: COL.border, background: COL.surface }}>
        {noModel ? (
          <div className="flex items-center gap-2 text-[11.5px]" style={{ color: COL.textMute }}>
            <Search size={13} className="flex-shrink-0" style={{ color: COL.textMute }} />
            <span>Search, filters and export unlock once a model is imported.</span>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search size={13} className="absolute start-2.5 top-1/2 -translate-y-1/2" style={{ color: COL.textMute }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, GUID, type, BoQ code…"
                className="ps-8 pe-2 py-1.5 text-xs rounded-lg border outline-none w-72 focus:border-blue-500" style={{ background: COL.bg, borderColor: COL.borderStrong, color: COL.text }} />
            </div>
            <div className="w-40"><StyledSelect ariaLabel="Filter by type" value={typeF} onChange={setTypeF} options={[{ value: '', label: 'All types' }, ...types.map((tp) => ({ value: tp, label: typeShort(tp) }))]} /></div>
            <div className="w-36"><StyledSelect ariaLabel="Filter by level" value={levelF} onChange={setLevelF} options={[{ value: '', label: 'All levels' }, ...levels.map((lv) => ({ value: lv, label: normalizeStorey(lv) }))]} /></div>
            <div className="flex items-center gap-1">
              {['all', 'linked', 'unlinked'].map((v) => (
                <button key={v} onClick={() => setLinkF(v)} className="px-2.5 py-1 text-[11px] rounded-lg border capitalize" style={segBtn(linkF === v)}>{v}</button>
              ))}
            </div>
            <div className="flex items-center gap-3 ms-auto">
              <button onClick={resetCols} title="Reset column widths" className="text-[11px] hover:underline" style={{ color: COL.textMute }}>Reset columns</button>
              <div className="mono text-[11px]" style={{ color: COL.textMute }}>
                <Link2 size={11} className="inline me-1" />{linkedCount.toLocaleString()} linked · {sorted.length.toLocaleString()} of {all.length.toLocaleString()} shown
              </div>
            </div>
          </>
        )}
      </div>

      {/* Multi-select batch bar — appears once any rows are checked */}
      {picked.size >= 1 && (
        <div className="px-5 py-2 border-b flex flex-wrap items-center gap-3 text-[11px]" style={{ borderColor: COL.border, background: COL.accentBg }}>
          <span className="font-semibold" style={{ color: COL.accent }}>{picked.size} selected</span>
          <button onClick={toggleVisible} className="font-medium hover:underline" style={{ color: COL.accent }}>{allVisiblePicked ? 'Deselect visible' : 'Select visible'}</button>
          <button onClick={clearPicked} className="font-medium hover:underline" style={{ color: COL.textDim }}>Clear</button>
          {picked.size >= 2 && (
            <span className="ms-auto" style={{ color: COL.textMute }}>
              {batch.status === 'loading' ? `AI is finding matches… ${batch.done}/${batch.total}`
                : batch.status === 'done' ? 'Suggestions ready — review in the panel →'
                : batch.status === 'oversized' ? 'Select up to 10 elements for AI suggestions'
                : batch.status === 'empty' ? 'No BoQ lines to match against'
                : batch.status === 'error' ? 'Suggestion run failed — try again'
                : 'Preparing AI suggestions…'}
            </span>
          )}
        </div>
      )}

      {rows === null ? (
        <div className="flex-1 flex items-center justify-center py-16 text-xs" style={{ color: COL.textMute }}>Loading elements…</div>
      ) : noModel ? (
        <RegistryEmptyState onNavigate={onNavigate} lang={lang} onUploaded={load} />
      ) : (
      <>
      {/* Header row — sortable + drag-to-resize columns (double-click a handle area
          via the Reset link below restores defaults) */}
      <div className="mono grid items-stretch px-5 border-b text-[10px] font-semibold uppercase tracking-wider select-none" style={{ gridTemplateColumns: gridTemplate, background: COL.surfaceAlt, color: COL.textDim, borderColor: COL.borderStrong }}>
        <span className="flex items-center py-2"><input type="checkbox" checked={allVisiblePicked} onChange={toggleVisible} title="Select all visible" className="w-3.5 h-3.5 accent-blue-700 cursor-pointer" /></span>
        {HEAD_COLS.map((c) => (
          <button key={c.key} onClick={() => setSortKey(c.key)} className="relative text-start whitespace-nowrap py-2 pe-2 border-e hover:bg-black/[0.03]" style={{ borderColor: COL.border, color: sort.key === c.key ? COL.accent : undefined }}>
            {c.label}<Arrow k={c.key} />
            <ColResizer onResize={(e) => startResize(c.key, e)} />
          </button>
        ))}
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-hidden">
        {(
          <VirtualList items={sorted} rowHeight={40} height={typeof window !== 'undefined' ? Math.max(320, window.innerHeight - 230) : 520}
            empty={<div className="px-5 py-12 text-center text-[12px]" style={{ color: COL.textMute }}>No elements match these filters.</div>}
            renderRow={(e, idx) => (
              <div key={e.guid} onClick={() => setOpenGuid(e.guid)} className="grid items-center px-5 border-b hover:bg-blue-50/40 cursor-pointer" style={{ gridTemplateColumns: gridTemplate, height: 40, borderColor: COL.border, background: picked.has(e.guid) ? COL.accentBg : (e.guid === openGuid ? COL.surfaceAlt : (idx % 2 === 1 ? 'rgba(0,0,0,0.012)' : undefined)) }}>
                <span className="flex items-center"><input type="checkbox" readOnly checked={picked.has(e.guid)} onClick={(ev) => onRowCheck(ev, idx, e.guid)} className="w-3.5 h-3.5 accent-blue-700 cursor-pointer" /></span>
                <span className="mono text-[10px] truncate pe-2 border-e self-stretch flex items-center" style={{ color: COL.textMute, borderColor: COL.border }} title={e.guid}>{e.guid}</span>
                <span className="min-w-0 pe-2 border-e self-stretch flex items-center" style={{ borderColor: COL.border }}>
                  {/* Primary label prefers the explicit display-name alias, then a
                      description, then the IFC name. The raw IFC name is always
                      shown small alongside (when it differs) so identity stays
                      visible for matching — it is never editable here. */}
                  {(() => { const primary = e.displayName || e.description || e.ifcName || 'Element'; const showIfc = e.ifcName && e.ifcName !== primary; return (
                  <span className="truncate text-[12px]" style={{ color: COL.text }} title={showIfc ? `${primary} · IFC: ${e.ifcName}` : primary}>
                    {primary}
                    {showIfc && <span className="mono text-[9.5px] ms-1.5" style={{ color: COL.textMute }}>{e.ifcName}</span>}
                  </span>
                  ); })()}
                </span>
                <span className="text-[11.5px] truncate pe-2 border-e self-stretch flex items-center" style={{ color: COL.textDim, borderColor: COL.border }} title={e.type || undefined}>{typeShort(e.type)}</span>
                <span className="text-[11.5px] truncate pe-2 border-e self-stretch flex items-center" style={{ color: COL.textDim, borderColor: COL.border }} title={e.level ? normalizeStorey(e.level) : undefined}>{e.level ? normalizeStorey(e.level) : '—'}</span>
                <span className="mono text-[11px] pe-2 border-e self-stretch flex items-center" style={{ color: e.volume != null || e.area != null || e.length != null ? COL.text : COL.textMute, borderColor: COL.border }}>{qtyLabel(e)}</span>
                <span className="min-w-0 pe-2 border-e self-stretch flex items-center" style={{ borderColor: COL.border }}>
                  {e.boqCodes.length === 0 ? <span className="text-[11px]" style={{ color: COL.textMute }}>—</span> : (
                    <span className="mono text-[10.5px] truncate block" style={{ color: COL.accent }} title={e.boqCodes.join(', ')}>{e.boqCodes[0]}{e.boqCodes.length > 1 ? ` +${e.boqCodes.length - 1}` : ''}</span>
                  )}
                </span>
                <span className="flex items-center gap-1 pe-2 border-e self-stretch" style={{ borderColor: COL.border }}>
                  <Pill n={e.wir} label="WIRs" color={W} />
                  <Pill n={e.qc} label="QC tests" color={Q} />
                  <Pill n={e.ncr} label={`NCRs${e.ncrOpen ? ` (${e.ncrOpen} open)` : ''}`} color={N} />
                </span>
                <span className="text-[10.5px] mono" style={{ color: COL.textDim }}>{fmtDate(e.importedAt)}</span>
              </div>
            )} />
        )}
      </div>
      </>
      )}
    </div>
    {/* Multi-select (2+) shows the batch panel; otherwise the single inspector.
        Each is isolated in its own ErrorBoundary so a fault fails locally and the
        registry table stays usable. */}
    {picked.size >= 2 ? (
      <ErrorBoundary compact>
        <BatchSuggestPanel pickedElements={pickedElements} boqAll={boqAll || []} batch={batch}
          onRunBatch={() => runBatch(true)} onClose={clearPicked} onApplied={load} />
      </ErrorBoundary>
    ) : openRow ? (
      <ErrorBoundary key={openGuid} compact>
        <ElementDetailInspector element={openRow} onClose={() => setOpenGuid(null)}
          onOpenInModel={(guid) => { setOpenGuid(null); onOpenInModel?.(guid); }} onChanged={load} />
      </ErrorBoundary>
    ) : null}
    </>
  );
}
