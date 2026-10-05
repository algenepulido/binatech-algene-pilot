import { useState, useEffect, useMemo, useCallback } from 'react';
import { Download, Plus, RotateCcw, ClipboardCheck, Search, ArrowUp, ArrowDown } from 'lucide-react';
import { Btn, PageHeader, StatusPill } from '../components/primitives.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { elementByGuid } from '../components/ElementPicker.jsx';
import { useElements } from '../lib/elements.jsx';
import { WirFormModal } from './wirs/WirForm.jsx';
import { WirDetailModal } from './wirs/WirDetail.jsx';
import { listWirs } from '../api/wirs.js';
import { countAttachmentsByRecord } from '../lib/attachments.js';
import { WIR_RESULTS, resultLabel } from '../lib/wirStatus.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';
import { usePermissions } from '../lib/usePermissions.jsx';
import { COL } from '../lib/theme.js';
import { exportSheet } from '../lib/excelExport.js';
import { useResizableColumns, ColResizer } from '../components/resizableColumns.jsx';

// ============================================================
// WIRs VIEW — real CRUD backed by Supabase, presented as a dense,
// enterprise-grade register: toolbar (segmented filter + search + count),
// sortable sticky header, ruled columns, compact rows. All CRUD, export
// and navigation behavior unchanged.
// ============================================================

// Columns are drag-to-resize (see useResizableColumns) — these are the defaults.
// `flex` columns absorb leftover width so the register fills the viewport.
const COLS = [
  { key: 'wir_number', label: 'WIR No.', w: 110 },
  { key: 'inspection_type', label: 'Type', w: 180, flex: true },
  { key: 'element_guid', label: 'Element / Ref', w: 150, flex: true },
  { key: 'drawing_ref', label: 'Drawing', w: 120 },
  { key: 'inspector_name', label: 'Inspector', w: 140, flex: true },
  { key: 'inspection_date', label: 'Date', w: 112 },
  { key: 'result', label: 'Result', w: 110 },
  // Evidence state belongs in the register: a WIR without evidence cannot
  // support certified value, and that should be visible while scanning rather
  // than only after opening the record. Restrained on purpose — plain text,
  // no pill (see docs/ux/UI-UX-OVERHAUL.md, status system).
  { key: 'evidence', label: 'Evidence', w: 104 },
  { key: 'remarks', label: 'Remarks', w: 200, flex: true },
];

export function WIRsView({ t, lang, onSelectElement, setRoute, openWir, onOpenedWir }) {
  const { requireAuth } = useAuth();
  const { can } = usePermissions();
  const canRaise = can('wir.edit');
  const [wirs, setWirs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ key: 'wir_number', dir: 'desc' });
  const [addOpen, setAddOpen] = useState(false);
  const [detailWir, setDetailWir] = useState(null);
  // A record handed over from Field Mode (Scan / Work) opens directly, once.
  useEffect(() => {
    if (openWir) { setDetailWir(openWir); onOpenedWir?.(); }
  }, [openWir, onOpenedWir]);
  // null = evidence index unavailable → render '—' (UNKNOWN), never a
  // confident "no evidence" the reviewer might act on.
  const [attachCounts, setAttachCounts] = useState(null);
  const { template: gridTemplate, startResize, reset: resetCols } = useResizableColumns('bimqc.cols.wirs.v2', COLS);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setWirs([]); setLoading(false); return; }
    setLoading(true); setError(null);
    try { setWirs(await listWirs()); }
    catch (err) { setError(err?.message ?? String(err)); }
    finally { setLoading(false); }
    countAttachmentsByRecord('wir').then(setAttachCounts).catch(() => setAttachCounts(null));
  }, []);

  useEffect(() => { load(); }, [load]);

  const list = useMemo(() => {
    let rows = filter === 'all' ? wirs : wirs.filter((w) => w.result === filter);
    const s = q.trim().toLowerCase();
    if (s) {
      rows = rows.filter((w) =>
        `${w.wir_number} ${w.inspection_type} ${w.element_guid || ''} ${w.drawing_ref || ''} ${w.inspector_name || ''} ${w.remarks || ''}`
          .toLowerCase().includes(s));
    }
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) =>
      String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? ''), undefined, { numeric: true }) * dir);
  }, [filter, q, sort, wirs]);

  // Live model elements for THIS project: guid -> {id, name, type}. The static
  // sample lookup only covers the built-in villa; without this, real-project
  // registers print raw IFC GUIDs — meaningless to anyone defending an IPC.
  const { byGuid } = useElements();
  const resolveEl = useCallback((guid) => (guid ? byGuid(guid) || elementByGuid(guid) : null), [byGuid]);

  const counts = useMemo(() => {
    const c = { all: wirs.length };
    for (const r of WIR_RESULTS) c[r] = wirs.filter((w) => w.result === r).length;
    return c;
  }, [wirs]);

  const setSortKey = (k) => setSort((s) => (s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' }));
  const Arrow = ({ k }) => (sort.key !== k ? null : (sort.dir === 'asc' ? <ArrowUp size={10} className="inline ms-0.5" /> : <ArrowDown size={10} className="inline ms-0.5" />));

  function goToElement(guid) {
    const el = resolveEl(guid);
    if (!el) return;
    onSelectElement(el.id);
    setRoute('model');
  }

  const cell = 'px-3 py-1.5 text-[12px] truncate border-e';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader
        title={t.wirs}
        subtitle="Work Inspection Requests — anchored to work items, BoQ lines or model elements"
        actions={
          <>
            <Btn icon={RotateCcw} onClick={load}>Refresh</Btn>
            <Btn icon={Download} onClick={() => exportSheet({ fileName: 'WIRs', title: 'WORK INSPECTION REQUESTS', rows: list, columns: [
              { label: 'WIR No', key: 'wir_number', width: 14 },
              { label: 'Type', key: 'inspection_type', width: 20 },
              { label: 'Element', key: 'element_guid', width: 22 },
              { label: 'Drawing', key: 'drawing_ref', width: 16 },
              { label: 'Inspector', key: 'inspector_name', width: 18 },
              { label: 'Date', key: 'inspection_date', width: 12 },
              { label: 'Result', key: 'result', width: 12 },
              { label: 'Remarks', key: 'remarks', width: 40, wrap: true },
            ] })}>Export</Btn>
            {canRaise && <Btn icon={Plus} variant="primary" onClick={() => requireAuth(() => setAddOpen(true))}>{t.raiseWir}</Btn>}
          </>
        }
      />

      {/* Register toolbar — segmented status filter, search, live counts */}
      <div className="px-4 sm:px-5 py-2 border-b flex flex-wrap items-center gap-3" style={{ borderColor: COL.border, background: COL.surface }}>
        <div className="inline-flex rounded-lg border overflow-hidden" style={{ borderColor: COL.borderStrong }}>
          {['all', ...WIR_RESULTS].map((f, i) => {
            const on = filter === f;
            return (
              <button key={f} onClick={() => setFilter(f)}
                className="px-3 py-1.5 text-[11.5px] font-medium whitespace-nowrap"
                style={{
                  background: on ? COL.accent : COL.surface, color: on ? '#fff' : COL.textDim,
                  borderInlineStart: i === 0 ? 'none' : `1px solid ${COL.border}`,
                }}>
                {f === 'all' ? 'All' : resultLabel(f)}
                <span className="mono ms-1.5 text-[10px]" style={{ color: on ? 'rgba(255,255,255,0.75)' : COL.textMute }}>{counts[f] ?? 0}</span>
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search size={13} className="absolute start-2.5 top-1/2 -translate-y-1/2" style={{ color: COL.textMute }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search no., type, element, inspector…"
            className="ps-8 pe-2 py-1.5 text-xs rounded-lg border outline-none w-64 focus:border-blue-500" style={{ background: COL.bg, borderColor: COL.borderStrong, color: COL.text }} />
        </div>
        <div className="flex items-center gap-3 ms-auto">
          <button onClick={resetCols} title="Reset column widths" className="text-[11px] hover:underline" style={{ color: COL.textMute }}>Reset columns</button>
          <div className="mono text-[11px]" style={{ color: COL.textMute }}>{list.length.toLocaleString()} of {wirs.length.toLocaleString()} records</div>
        </div>
      </div>

      {!isSupabaseConfigured && (
        <div className="mx-6 mt-3 text-xs px-3 py-2 rounded border" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>
          Supabase isn't configured. Copy <span className="mono">.env.example</span> to <span className="mono">.env</span>, add your project URL and anon key, then restart the dev server.
        </div>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-auto scrollbar">
        {loading ? (
          <div className="text-center text-xs py-10" style={{ color: COL.textMute }}>Loading WIRs…</div>
        ) : error ? (
          <div className="mx-6 my-4 text-xs px-3 py-2 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>
        ) : list.length === 0 ? (
          wirs.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="No inspections yet"
              description={t.wirEmptyDescription}
              steps={t.wirEmptySteps}
              actions={canRaise ? [{ label: t.raiseWir, icon: Plus, onClick: () => requireAuth(() => setAddOpen(true)) }] : []} />
          ) : (
            <div className="text-center text-xs py-10" style={{ color: COL.textMute }}>No WIRs match this filter.</div>
          )
        ) : (
          <>
            {/* Mobile: card list — no horizontal table scroll on a phone */}
            <div className="lg:hidden p-3 space-y-2">
              {list.map((w) => { const el = resolveEl(w.element_guid); return (
                <button key={w.id} onClick={() => setDetailWir(w)} className="w-full text-start rounded-xl border p-3 active:bg-blue-50/50" style={{ borderColor: COL.border, background: COL.surface }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="mono font-semibold text-[13px]" style={{ color: COL.accent }}>{w.wir_number}</span>
                    <StatusPill status={resultLabel(w.result)} />
                  </div>
                  <div className="text-[12.5px] mt-1 truncate" style={{ color: COL.text }}>{w.inspection_type || '—'}</div>
                  <div className="flex items-center justify-between gap-2 mt-1.5 text-[11px]">
                    <span className="mono truncate" style={{ color: COL.textDim }}>{w.element_guid ? (el ? (el.name || el.id) : `…${String(w.element_guid).slice(-6)}`) : '—'}</span>
                    <span className="mono flex-shrink-0" style={{ color: COL.textDim }}>{w.inspection_date || '—'}</span>
                  </div>
                </button>
              ); })}
            </div>
            {/* Desktop: full register table */}
            <div className="hidden lg:block min-w-[1080px]">
            {/* sortable sticky header — drag-to-resize columns */}
            <div className="mono grid sticky top-0 z-10 border-b text-[10px] font-semibold uppercase tracking-wider select-none"
              style={{ gridTemplateColumns: gridTemplate, background: COL.surfaceAlt, color: COL.textDim, borderColor: COL.borderStrong }}>
              {COLS.map((c) => (
                <button key={c.key} onClick={() => setSortKey(c.key)}
                  className="relative px-3 py-2 text-start whitespace-nowrap border-e hover:bg-black/[0.03]"
                  style={{ borderColor: COL.border, color: sort.key === c.key ? COL.accent : undefined }}>
                  {c.label}<Arrow k={c.key} />
                  <ColResizer onResize={(e) => startResize(c.key, e)} />
                </button>
              ))}
            </div>
            {list.map((w, i) => {
              const el = resolveEl(w.element_guid);
              return (
                <div key={w.id} onClick={() => setDetailWir(w)} aria-selected={detailWir?.id === w.id}
                  className={`grid items-center border-b cursor-pointer ${detailWir?.id === w.id ? '' : 'hover:bg-blue-50/40'}`}
                  style={{ gridTemplateColumns: gridTemplate, borderColor: COL.border, background: detailWir?.id === w.id ? COL.accentBg : (i % 2 === 1 ? 'rgba(0,0,0,0.012)' : undefined), boxShadow: detailWir?.id === w.id ? `inset 3px 0 0 ${COL.accent}` : undefined }}>
                  <span className={`${cell} mono font-semibold`} style={{ color: COL.accent, borderColor: COL.border }} title={w.wir_number}>{w.wir_number}</span>
                  <span className={cell} style={{ color: COL.text, borderColor: COL.border }} title={w.inspection_type || undefined}>{w.inspection_type}</span>
                  <span className={`${cell} mono text-[11px]`} style={{ borderColor: COL.border }}>
                    {w.element_guid ? (
                      <button onClick={(e) => { e.stopPropagation(); goToElement(w.element_guid); }} disabled={!el} className="hover:underline disabled:no-underline truncate" style={{ color: el ? COL.accent : COL.textDim }}>
                        <span title={w.element_guid}>{el ? (el.name || el.id) : `…${String(w.element_guid).slice(-6)}`}</span>
                      </button>
                    ) : <span style={{ color: COL.textMute }}>—</span>}
                  </span>
                  <span className={`${cell} mono text-[10.5px]`} style={{ color: COL.textDim, borderColor: COL.border }} title={w.drawing_ref || undefined}>{w.drawing_ref || '—'}</span>
                  <span className={cell} style={{ color: w.inspector_name ? COL.textDim : COL.textMute, borderColor: COL.border }} title={w.inspector_name || undefined}>{w.inspector_name || '—'}</span>
                  <span className={`${cell} mono text-[10.5px]`} style={{ color: COL.textDim, borderColor: COL.border }}>{w.inspection_date}</span>
                  <span className={cell} style={{ borderColor: COL.border }}><StatusPill status={resultLabel(w.result)} /></span>
                  <span className={`${cell} mono text-[10.5px]`} style={{ borderColor: COL.border }}>
                    {attachCounts == null
                      ? <span style={{ color: COL.textMute }}>—</span>
                      : (attachCounts[w.id] || 0) > 0
                        ? <span style={{ color: COL.textDim }}>{attachCounts[w.id]} file{attachCounts[w.id] === 1 ? '' : 's'}</span>
                        : <span style={{ color: COL.pending }}>none</span>}
                  </span>
                  <span className={`${cell} text-[11px] border-e-0`} style={{ color: COL.textDim }} title={w.remarks || undefined}>{w.remarks}</span>
                </div>
              );
            })}
            </div>
          </>
        )}
      </div>

      <WirFormModal open={addOpen} initial={null} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); }} />
      <WirDetailModal
        open={Boolean(detailWir)}
        wir={detailWir}
        onClose={() => setDetailWir(null)}
        onChanged={(saved) => { load(); if (saved) setDetailWir(saved); }}
        onSelectElement={onSelectElement}
        setRoute={setRoute}
        lang={lang}
      />
    </div>
  );
}
