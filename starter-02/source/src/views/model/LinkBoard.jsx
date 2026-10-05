// ============================================================
// LinkBoard — ONE reusable two-pane element↔BoQ linking surface, used from BOTH
// entry points (the Model view and QS/BoQ). Chosen as a wide modal over a
// dedicated route: lower risk, identical from either side, keeps page context.
//
// LEFT  — model elements: collapsible groups (by level or IFC type), filters
//         (type / level / linked-status), search, multi-select + select-all-
//         in-group, a certification-status dot and link count per row.
// RIGHT — real BoQ line items only (summary rows filtered via isBoqLineItem),
//         grouped by section, recently-linked on top, multi-select, search.
//
// Entry-point awareness: open with initialLines (from a BoQ line → line is
// pre-selected, pick elements) OR initialElements (from an element → it's
// pre-selected, pick lines). Same component, same data, both directions.
// ============================================================
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { StyledSelect } from '../../components/StyledSelect.jsx';
import { Search, Plus, Minus, ChevronDown, ChevronRight } from 'lucide-react';
import { Modal } from '../../components/Modal.jsx';
import { Btn } from '../../components/primitives.jsx';
import { listAllLinks, linkElementBoq, unlinkElementBoq } from '../../api/elementBoqLinks.js';
import { updateBoqItem, isBoqLineItem } from '../../api/boqItems.js';
import { loadElementStatusMap, ESTATUS } from '../../lib/elementStatus.js';
import { normalizeStorey } from '../../lib/storey.js';
import { notifyDataChanged } from '../../lib/currentProject.js';
import { COL } from '../../lib/theme.js';

const num = (n) => { const v = Number(n) || 0; return Math.round(v * 100) / 100; };
const byNumeric = (a, b) => a.localeCompare(b, undefined, { numeric: true });

export function LinkBoard({ elements = [], boqAll = [], initialElements = [], initialLines = [], onClose, onChanged }) {
  const [allLinks, setAllLinks] = useState([]);
  const [statusMap, setStatusMap] = useState({});
  const reload = useCallback(() => listAllLinks().then(setAllLinks).catch(() => setAllLinks([])), []);
  useEffect(() => { reload(); loadElementStatusMap().then(setStatusMap).catch(() => setStatusMap({})); }, [reload]);

  const [selEls, setSelEls] = useState(() => new Set(initialElements || []));
  const [selLines, setSelLines] = useState(() => new Set(initialLines || []));
  const [elQ, setElQ] = useState('');
  const [lineQ, setLineQ] = useState('');
  const [groupBy, setGroupBy] = useState('level');       // 'level' | 'type'
  const [typeFilter, setTypeFilter] = useState('');       // '' = all
  const [levelFilter, setLevelFilter] = useState('');     // '' = all
  const [linkFilter, setLinkFilter] = useState('all');    // 'all' | 'linked' | 'unlinked'
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const key = (g, id) => `${g}|${id}`;
  const linkSet = useMemo(() => {
    const s = new Set();
    allLinks.forEach((l) => s.add(key(l.element_guid, l.boq_item_id)));
    boqAll.forEach((b) => { if (b.element_id) s.add(key(b.element_id, b.id)); }); // legacy single link
    return s;
  }, [allLinks, boqAll]);
  const elLinkCount = useMemo(() => { const m = {}; linkSet.forEach((k) => { const g = k.split('|')[0]; m[g] = (m[g] || 0) + 1; }); return m; }, [linkSet]);
  const lineLinkCount = useMemo(() => { const m = {}; linkSet.forEach((k) => { const id = k.slice(k.indexOf('|') + 1); m[id] = (m[id] || 0) + 1; }); return m; }, [linkSet]);

  const recentIds = useMemo(() => {
    const seen = new Set(); const out = [];
    [...allLinks].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).forEach((l) => { if (!seen.has(l.boq_item_id)) { seen.add(l.boq_item_id); out.push(l.boq_item_id); } });
    return out.slice(0, 3);
  }, [allLinks]);

  // distinct types / levels for the filter selects
  const types = useMemo(() => [...new Set(elements.map((e) => e.type).filter(Boolean))].sort(byNumeric), [elements]);
  const levels = useMemo(() => [...new Set(elements.map((e) => e.level).filter(Boolean))].sort(byNumeric), [elements]);

  // LEFT — filtered + grouped elements
  const elList = useMemo(() => elements.filter((e) => {
    if (elQ && !`${e.name} ${e.type} ${e.level || ''} ${e.guid}`.toLowerCase().includes(elQ.toLowerCase())) return false;
    if (typeFilter && e.type !== typeFilter) return false;
    if (levelFilter && (e.level || 'Unassigned') !== levelFilter) return false;
    if (linkFilter === 'linked' && !(elLinkCount[e.guid] > 0)) return false;
    if (linkFilter === 'unlinked' && elLinkCount[e.guid] > 0) return false;
    return true;
  }), [elements, elQ, typeFilter, levelFilter, linkFilter, elLinkCount]);
  const elGroups = useMemo(() => {
    const g = {};
    elList.forEach((e) => { const kk = groupBy === 'type' ? (e.type || 'Unknown') : (e.level || 'Unassigned'); (g[kk] = g[kk] || []).push(e); });
    return g;
  }, [elList, groupBy]);
  const elGroupKeys = useMemo(() => Object.keys(elGroups).sort((a, b) => (a === 'Unassigned' || a === 'Unknown' ? 1 : b === 'Unassigned' || b === 'Unknown' ? -1 : byNumeric(a, b))), [elGroups]);

  // RIGHT — real line items, recently-linked on top, then by section
  const lineMatch = (b) => !lineQ || `${b.code} ${b.description} ${b.section || ''}`.toLowerCase().includes(lineQ.toLowerCase());
  const lineItems = useMemo(() => boqAll.filter(isBoqLineItem).filter(lineMatch), [boqAll, lineQ]);
  const recentLines = useMemo(() => recentIds.map((id) => lineItems.find((b) => b.id === id)).filter(Boolean), [recentIds, lineItems]);
  const recentSet = useMemo(() => new Set(recentLines.map((b) => b.id)), [recentLines]);
  const sectionGroups = useMemo(() => { const g = {}; lineItems.filter((b) => !recentSet.has(b.id)).forEach((b) => { const sec = b.section || 'Unsectioned'; (g[sec] = g[sec] || []).push(b); }); return g; }, [lineItems, recentSet]);
  const sections = useMemo(() => Object.keys(sectionGroups).sort(byNumeric), [sectionGroups]);

  const toggleEl = (g) => setSelEls((s) => { const n = new Set(s); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const toggleLine = (id) => setSelLines((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleCollapse = (k) => setCollapsed((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const selectGroup = (members) => setSelEls((s) => {
    const n = new Set(s);
    if (members.length && members.every((e) => n.has(e.guid))) members.forEach((e) => n.delete(e.guid));
    else members.forEach((e) => n.add(e.guid));
    return n;
  });
  // Select / clear every element in the current filter (regardless of group).
  const toggleAllFiltered = () => setSelEls((s) => {
    const n = new Set(s);
    const all = elList.length > 0 && elList.every((e) => n.has(e.guid));
    elList.forEach((e) => (all ? n.delete(e.guid) : n.add(e.guid)));
    return n;
  });

  // ---- Flat, VIRTUALIZED row model for the element pane -------------------
  // One flat array of {header | element} rows in display order. Elements also
  // get a running elIdx so shift-click / drag can address ranges by index. Only
  // the rows in the scroll window are rendered, so it stays fast at thousands.
  const ROW_H = 40;
  const { flatRows, flatEls } = useMemo(() => {
    const rows = [], els = [];
    for (const k of elGroupKeys) {
      const members = elGroups[k];
      rows.push({ kind: 'header', k, members });
      if (!collapsed.has(k)) for (const e of members) { rows.push({ kind: 'el', el: e, elIdx: els.length }); els.push(e.guid); }
    }
    return { flatRows: rows, flatEls: els };
  }, [elGroupKeys, elGroups, collapsed]);

  const [scrollTop, setScrollTop] = useState(0);
  const elScrollRef = useRef(null);
  // When the filter changes the list shrinks; snap back to the top so the
  // virtual window can't be stranded past the new end.
  useEffect(() => { if (elScrollRef.current) elScrollRef.current.scrollTop = 0; setScrollTop(0); }, [elQ, typeFilter, levelFilter, linkFilter, groupBy]);
  const LIST_H = 460, OVER = 6;
  const vStart = Math.max(0, Math.floor(scrollTop / ROW_H) - OVER);
  const vEnd = Math.min(flatRows.length, vStart + Math.ceil(LIST_H / ROW_H) + OVER * 2);
  const vSlice = flatRows.slice(vStart, vEnd);

  // Range/drag selection. anchorRef = last single-clicked element index (the
  // shift-click pivot). dragRef tracks a press-and-drag over rows.
  const anchorRef = useRef(null);
  const dragRef = useRef({ active: false, add: true, anchor: 0, moved: false });
  const suppressClickRef = useRef(false);
  const applyRange = useCallback((a, b, add) => {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    setSelEls((s) => {
      const n = new Set(s);
      for (let i = lo; i <= hi; i++) { const g = flatEls[i]; if (g) add ? n.add(g) : n.delete(g); }
      return n;
    });
  }, [flatEls]);
  // End any drag on pointer release anywhere; remember if it actually moved so the
  // trailing click on the press row doesn't undo the drag.
  useEffect(() => {
    const up = () => { if (dragRef.current.active) { suppressClickRef.current = dragRef.current.moved; dragRef.current.active = false; } };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);
  const rowClick = (idx, guid, e) => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; } // was a drag
    if (e.shiftKey && anchorRef.current != null) applyRange(anchorRef.current, idx, true);
    else { anchorRef.current = idx; toggleEl(guid); }
  };
  const rowPointerDown = (idx, guid, e) => {
    if (e.button !== 0 || e.shiftKey) return; // let shift-click be a pure range click
    dragRef.current = { active: true, add: !selEls.has(guid), anchor: idx, moved: false };
  };
  const rowPointerEnter = (idx) => {
    const d = dragRef.current;
    if (!d.active) return;
    d.moved = true; anchorRef.current = d.anchor;
    applyRange(d.anchor, idx, d.add);
  };

  const selPairs = useMemo(() => { const out = []; selEls.forEach((g) => selLines.forEach((id) => out.push([g, id]))); return out; }, [selEls, selLines]);
  const toLink = selPairs.filter(([g, id]) => !linkSet.has(key(g, id)));
  const toUnlink = selPairs.filter(([g, id]) => linkSet.has(key(g, id)));

  async function doLink() {
    if (!toLink.length) return;
    setBusy(true); setError(''); setMsg('');
    try {
      for (const [g, id] of toLink) await linkElementBoq(g, id);
      await reload(); onChanged?.(); notifyDataChanged();
      setMsg(`Linked ${selEls.size} element${selEls.size > 1 ? 's' : ''} to ${selLines.size} line${selLines.size > 1 ? 's' : ''} — ${toLink.length} new link${toLink.length > 1 ? 's' : ''}.`);
    } catch (e) { setError(/relation|does not exist|element_boq_links/i.test(e?.message || '') ? 'Link table isn’t set up yet — run the SQL in DESIGN_LOG (element_boq_links section).' : (e?.message || 'Could not link.')); }
    finally { setBusy(false); }
  }
  async function doUnlink() {
    if (!toUnlink.length) return;
    setBusy(true); setError(''); setMsg('');
    try {
      for (const [g, id] of toUnlink) {
        await unlinkElementBoq(g, id).catch(() => {});
        const b = boqAll.find((x) => x.id === id);
        if (b && b.element_id === g) await updateBoqItem(id, { element_id: null });
      }
      await reload(); onChanged?.(); notifyDataChanged();
      setMsg(`Unlinked ${toUnlink.length} link${toUnlink.length > 1 ? 's' : ''}.`);
    } catch (e) { setError(e?.message || 'Could not unlink.'); }
    finally { setBusy(false); }
  }

  const inp = 'w-full ps-7 pe-2 py-1.5 text-[11px] rounded border outline-none';
  const seg = (active) => ({ background: active ? COL.accent : COL.surface, color: active ? '#fff' : COL.text, borderColor: active ? COL.accent : COL.border });

  // Virtualized element row. Plain click toggles (and sets the shift pivot);
  // shift-click selects the range from the pivot; press-and-drag selects a run.
  // Fixed ROW_H so windowing maths stay exact. `idx` is the elIdx in flatEls.
  const ElRowV = (e, idx) => {
    const lc = elLinkCount[e.guid] || 0;
    const st = ESTATUS[statusMap[e.guid]?.key] || ESTATUS.not_started;
    const on = selEls.has(e.guid);
    // Prefer the user display-name alias, then a description, then the (friendly) name.
    const label = e.displayName || e.description || e.name || 'Element';
    return (
      <div key={e.guid} onClick={(ev) => rowClick(idx, e.guid, ev)} onPointerDown={(ev) => rowPointerDown(idx, e.guid, ev)} onPointerEnter={() => rowPointerEnter(idx)}
        className="flex items-center gap-2.5 px-2.5 rounded cursor-pointer hover:bg-stone-50 select-none" style={{ height: ROW_H, background: on ? COL.accentBg : undefined }}>
        <input type="checkbox" readOnly checked={on} tabIndex={-1} className="w-3.5 h-3.5 accent-blue-700 flex-shrink-0" style={{ pointerEvents: 'none' }} />
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: st.color }} title={st.label} />
        <span className="flex-1 min-w-0">
          <span className="block text-[12px] truncate" style={{ color: COL.text }}>{label}</span>
          <span className="block mono text-[9px] truncate" style={{ color: COL.textMute }}>{e.type || '—'}{e.level ? ` · ${normalizeStorey(e.level)}` : ''}</span>
        </span>
        <span className="mono text-[9px] flex-shrink-0" style={{ color: lc > 0 ? '#15803d' : COL.textMute }}>{lc > 0 ? `${lc} linked` : '—'}</span>
      </div>
    );
  };
  const LineRow = (b) => {
    const lc = lineLinkCount[b.id] || 0;
    return (
      <label key={b.id} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded cursor-pointer hover:bg-stone-50" style={{ background: selLines.has(b.id) ? COL.accentBg : undefined }}>
        <input type="checkbox" checked={selLines.has(b.id)} onChange={() => toggleLine(b.id)} className="w-3.5 h-3.5 accent-blue-700 flex-shrink-0" />
        <span className="mono text-[11px] font-semibold flex-shrink-0" style={{ color: COL.accent }}>{b.code}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-[12px] truncate" style={{ color: COL.text }}>{b.description || '—'}</span>
          <span className="block mono text-[9px] truncate" style={{ color: COL.textMute }}>{b.unit || '—'} · {num(b.qty)} × {num(b.rate)}</span>
        </span>
        <span className="mono text-[9px] flex-shrink-0" style={{ color: lc > 0 ? '#15803d' : COL.textMute }}>{lc > 0 ? `${lc} el` : '—'}</span>
      </label>
    );
  };
  // Fixed-height group header with collapse + select-all-in-group (this whole
  // group, even the rows currently scrolled out of the window).
  const HeaderRowV = (k, members) => {
    const open = !collapsed.has(k);
    const allIn = members.length > 0 && members.every((e) => selEls.has(e.guid));
    const Chevron = open ? ChevronDown : ChevronRight;
    return (
      <div key={`h:${k}`} className="flex items-center gap-2 px-2" style={{ height: ROW_H, background: COL.surfaceAlt }}>
        <button onClick={() => toggleCollapse(k)} className="flex items-center gap-1 flex-1 min-w-0 text-start" style={{ color: COL.textDim }}>
          <Chevron size={12} className="flex-shrink-0" />
          <span className="text-[11px] font-semibold truncate">{groupBy === 'level' ? normalizeStorey(k) : k}</span>
          <span className="mono text-[9px] flex-shrink-0" style={{ color: COL.textMute }}>{members.length}</span>
        </button>
        <label className="flex items-center gap-1 text-[9px] cursor-pointer flex-shrink-0" style={{ color: COL.textMute }} title="Select all in group">
          <input type="checkbox" checked={allIn} onChange={() => selectGroup(members)} className="w-3 h-3 accent-blue-700" /> all
        </label>
      </div>
    );
  };
  const SecGroup = (sec) => (
    <div key={sec}>
      <div className="mono text-[9px] tracking-widest px-2.5 py-1 sticky top-0 flex items-center justify-between" style={{ color: COL.textMute, background: COL.surfaceAlt }}>
        <span>{sec}</span><span>{sectionGroups[sec].length}</span>
      </div>
      {sectionGroups[sec].map(LineRow)}
    </div>
  );

  return (
    <Modal open onClose={onClose} title="Link elements ↔ BoQ" subtitle="Pick elements on the left and BoQ line items on the right, then link or unlink" width={1080}
      footer={
        <div className="flex items-center gap-2 flex-wrap w-full">
          <span className="text-[11px] me-auto" style={{ color: COL.textDim }}>
            {selEls.size} element{selEls.size === 1 ? '' : 's'} · {selLines.size} line{selLines.size === 1 ? '' : 's'} selected
            {toLink.length > 0 && <span style={{ color: COL.accent }}> · {toLink.length} to link</span>}
            {toUnlink.length > 0 && <span style={{ color: '#b91c1c' }}> · {toUnlink.length} to unlink</span>}
          </span>
          <Btn icon={Minus} variant="secondary" onClick={doUnlink} disabled={busy || toUnlink.length === 0}>Unlink</Btn>
          <Btn icon={Plus} variant="primary" onClick={doLink} disabled={busy || toLink.length === 0}>Link selected</Btn>
          <Btn variant="secondary" onClick={onClose}>Done</Btn>
        </div>
      }>
      <div className="space-y-2">
        {error && <div className="text-[12px] px-3 py-2 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}
        {msg && !error && <div className="text-[12px] px-3 py-2 rounded" style={{ background: '#dcfce7', color: '#15803d' }}>{msg}</div>}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* LEFT — elements */}
          <div className="border rounded-lg flex flex-col min-h-0" style={{ borderColor: COL.border }}>
            <div className="p-2 border-b space-y-2" style={{ borderColor: COL.border }}>
              <div className="flex items-center justify-between">
                <span className="mono text-[10px] tracking-widest" style={{ color: COL.textMute }}>ELEMENTS</span>
                <span className="text-[11px]" style={{ color: COL.textDim }}>{elList.length} shown</span>
              </div>
              <div className="relative">
                <Search size={12} className="absolute start-2 top-1/2 -translate-y-1/2" style={{ color: COL.textMute }} />
                <input value={elQ} onChange={(e) => setElQ(e.target.value)} placeholder="Search elements" className={inp} style={{ background: COL.bg, borderColor: COL.border, color: COL.text }} />
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                {/* group by */}
                <span style={{ color: COL.textMute }}>Group:</span>
                <button onClick={() => setGroupBy('level')} className="px-2 py-0.5 rounded border" style={seg(groupBy === 'level')}>Level</button>
                <button onClick={() => setGroupBy('type')} className="px-2 py-0.5 rounded border" style={seg(groupBy === 'type')}>Type</button>
                <span className="ms-1" style={{ color: COL.textMute }}>·</span>
                {/* link-status filter */}
                {['all', 'linked', 'unlinked'].map((v) => (
                  <button key={v} onClick={() => setLinkFilter(v)} className="px-2 py-0.5 rounded border capitalize" style={seg(linkFilter === v)}>{v}</button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="flex-1"><StyledSelect ariaLabel="Filter by type" value={typeFilter} onChange={setTypeFilter}
                  options={[{ value: '', label: 'All types' }, ...types.map((tp) => ({ value: tp, label: tp }))]} /></div>
                <div className="flex-1"><StyledSelect ariaLabel="Filter by level" value={levelFilter} onChange={setLevelFilter}
                  options={[{ value: '', label: 'All levels' }, ...levels.map((lv) => ({ value: lv, label: normalizeStorey(lv) }))]} /></div>
              </div>
              {/* Bulk-select toolbar + selection count for the whole filter */}
              <div className="flex items-center gap-2 text-[10px]">
                <label className="flex items-center gap-1 cursor-pointer" style={{ color: COL.textDim }} title="Select / clear all elements in the current filter">
                  <input type="checkbox" checked={elList.length > 0 && elList.every((e) => selEls.has(e.guid))} onChange={toggleAllFiltered} className="w-3.5 h-3.5 accent-blue-700" />
                  Select all {elList.length.toLocaleString()}
                </label>
                {selEls.size > 0 && <button onClick={() => setSelEls(new Set())} className="font-semibold" style={{ color: COL.accent }}>Clear ({selEls.size})</button>}
                <span className="ms-auto" style={{ color: COL.textMute }}>shift-click or drag to range-select</span>
              </div>
            </div>
            <div ref={elScrollRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} className="overflow-y-auto scrollbar p-1" style={{ height: LIST_H }}>
              {elList.length === 0 ? (
                <div className="p-6 text-center text-[11px]" style={{ color: COL.textMute }}>No elements match.</div>
              ) : (
                <div style={{ height: flatRows.length * ROW_H, position: 'relative' }}>
                  <div style={{ position: 'absolute', insetInlineStart: 0, insetInlineEnd: 0, transform: `translateY(${vStart * ROW_H}px)` }}>
                    {vSlice.map((row) => row.kind === 'header' ? HeaderRowV(row.k, row.members) : ElRowV(row.el, row.elIdx))}
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* RIGHT — BoQ line items */}
          <div className="border rounded-lg flex flex-col min-h-0" style={{ borderColor: COL.border }}>
            <div className="p-2 border-b space-y-2" style={{ borderColor: COL.border }}>
              <div className="flex items-center justify-between">
                <span className="mono text-[10px] tracking-widest" style={{ color: COL.textMute }}>BOQ LINE ITEMS</span>
                <span className="text-[11px]" style={{ color: COL.textDim }}>{lineItems.length} item{lineItems.length === 1 ? '' : 's'}</span>
              </div>
              <div className="relative">
                <Search size={12} className="absolute start-2 top-1/2 -translate-y-1/2" style={{ color: COL.textMute }} />
                <input value={lineQ} onChange={(e) => setLineQ(e.target.value)} placeholder="Search code or description" className={inp} style={{ background: COL.bg, borderColor: COL.border, color: COL.text }} />
              </div>
            </div>
            <div className="overflow-y-auto scrollbar p-1" style={{ maxHeight: '48vh' }}>
              {lineItems.length === 0 && <div className="p-6 text-center text-[11px]" style={{ color: COL.textMute }}>No measurable BoQ line items. Create them in <b>QS / BoQ</b> (or import from Excel).</div>}
              {recentLines.length > 0 && (
                <div>
                  <div className="mono text-[9px] tracking-widest px-2.5 py-1 sticky top-0" style={{ color: COL.textMute, background: COL.surfaceAlt }}>RECENTLY LINKED</div>
                  {recentLines.map(LineRow)}
                </div>
              )}
              {sections.map(SecGroup)}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
