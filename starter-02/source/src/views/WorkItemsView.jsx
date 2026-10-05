import { useState, useEffect, useMemo, useCallback } from 'react';
import { StyledSelect } from '../components/StyledSelect.jsx';
import { confirmDialog } from '../components/ConfirmDialog.jsx';
import { toast } from '../components/Toast.jsx';
import { Layers, ListTodo, MapPin, Plus, RotateCcw, Trash2, ArrowRight, Check } from 'lucide-react';
import { Btn, KpiCard, PageHeader, StatusPill } from '../components/primitives.jsx';
import { Modal } from '../components/Modal.jsx';
import { FlowStrip } from '../components/NoModelUi.jsx';
import { INTRO, WITH_BOQ, NO_BOQ, FLOW } from './workItemsContent.js';
import { BoqLinePicker } from '../components/BoqLinePicker.jsx';
import { listWorkItems, createWorkItem, bulkCreateWorkItems, deleteWorkItem } from '../api/workItems.js';
import { listBoqItems, isBoqLineItem } from '../api/boqItems.js';
import { listWirs } from '../api/wirs.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';
import { COL } from '../lib/theme.js';

// ============================================================
// WORK ITEMS REGISTRY — the no-model unit of work. A BoQ line + a location
// (+ optional drawing). Create one-by-one or bulk-generate from a BoQ line ×
// a list of locations. WIRs reference these exactly as they reference model
// elements, and certify into the SAME engine via the work item's BoQ line.
// ============================================================
const STATUS_META = {
  planned:     { label: 'Planned',     bg: '#f5f5f4', color: '#78716c' },
  in_progress: { label: 'In Progress', bg: '#dbeafe', color: '#1d4ed8' },
  certified:   { label: 'Certified',   bg: '#dcfce7', color: '#15803d' },
};

export function WorkItemsView({ t, lang, onNavigate }) {
  const { requireAuth } = useAuth();
  const [items, setItems] = useState([]);
  const [boq, setBoq] = useState([]);
  const [wirs, setWirs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    try {
      const [wi, b, w] = await Promise.all([listWorkItems(), listBoqItems().catch(() => []), listWirs().catch(() => [])]);
      setItems(wi); setBoq(b); setWirs(w);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const boqLines = useMemo(() => boq.filter(isBoqLineItem), [boq]);
  const boqById = useMemo(() => Object.fromEntries(boqLines.map((b) => [b.id, b])), [boqLines]);

  // Derive each work item's live status from the WIRs that reference it.
  const enrich = useCallback((wi) => {
    const refs = wirs.filter((w) => w.work_item_id === wi.id);
    const approved = refs.filter((w) => /approv/i.test(String(w.result || '')));
    const approvedQty = approved.reduce((s, w) => s + (Number(w.approved_qty) || 0), 0);
    const status = approved.length ? 'certified' : refs.length ? 'in_progress' : (wi.status || 'planned');
    return { ...wi, wirCount: refs.length, approvedQty, dStatus: status, line: boqById[wi.boq_item_id] || null };
  }, [wirs, boqById]);

  const enriched = useMemo(() => items.map(enrich), [items, enrich]);
  const counts = useMemo(() => ({
    total: enriched.length,
    planned: enriched.filter((w) => w.dStatus === 'planned').length,
    in_progress: enriched.filter((w) => w.dStatus === 'in_progress').length,
    certified: enriched.filter((w) => w.dStatus === 'certified').length,
    lines: new Set(enriched.map((w) => w.boq_item_id).filter(Boolean)).size,
  }), [enriched]);

  const filtered = enriched.filter((w) => {
    if (filter !== 'all' && w.dStatus !== filter) return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [w.location, w.description, w.drawing_ref, w.line?.code, w.line?.description].some((v) => String(v || '').toLowerCase().includes(s));
  });

  function onDelete(w) { requireAuth(async () => { if (!await confirmDialog(`Delete work item "${w.location || w.id}"?`)) return; try { await deleteWorkItem(w.id); load(); } catch (e) { toast.error(e.message); } }); }

  const hasItems = enriched.length > 0; // KPIs + filters are noise until there's data

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title="Work Items" subtitle="The no-model unit of work — a BoQ line + a location. WIRs certify these into the same engine."
        actions={<><Btn icon={RotateCcw} onClick={load}>Refresh</Btn><Btn icon={Layers} disabled={boqLines.length === 0} onClick={() => requireAuth(() => setBulkOpen(true))}>Bulk from BoQ</Btn><Btn icon={Plus} variant="primary" onClick={() => requireAuth(() => setAddOpen(true))}>New Work Item</Btn></>} />

      {hasItems && (
        <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 border-b" style={{ borderColor: COL.border, background: COL.surface }}>
          <KpiCard label="Work Items" value={counts.total} icon={ListTodo} />
          <KpiCard label="Planned" value={counts.planned} accent="#78716c" />
          <KpiCard label="In Progress" value={counts.in_progress} accent={COL.accent} />
          <KpiCard label="Certified" value={counts.certified} accent="#15803d" />
          <KpiCard label="BoQ Lines Covered" value={counts.lines} accent="#7c3aed" icon={MapPin} />
        </div>
      )}

      {hasItems && (
        <div className="px-6 py-3 border-b flex flex-wrap items-center gap-2" style={{ borderColor: COL.border, background: COL.surface }}>
          {[['all', 'All'], ['planned', 'Planned'], ['in_progress', 'In Progress'], ['certified', 'Certified']].map(([f, l]) => (
            <button key={f} onClick={() => setFilter(f)} className="px-3 py-1 text-xs rounded border" style={{ background: filter === f ? COL.accent : COL.surface, color: filter === f ? '#fff' : COL.text, borderColor: filter === f ? COL.accent : COL.border }}>{l}</button>
          ))}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search location / BoQ…" className="ms-2 px-3 py-1 text-xs rounded border outline-none" style={{ background: COL.bg, borderColor: COL.border, color: COL.text }} />
          <div className="mono text-[10px] ms-auto" style={{ color: COL.textDim }}>{filtered.length} items</div>
        </div>
      )}

      {!isSupabaseConfigured && <div className="mx-6 mt-3 text-xs px-3 py-2 rounded border" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>Supabase isn't configured. Add your keys to <span className="mono">.env</span> and restart.</div>}

      <div className="flex-1 overflow-y-auto overflow-x-auto scrollbar">
        {loading ? <div className="text-center text-xs py-10" style={{ color: COL.textMute }}>Loading…</div>
          : enriched.length === 0 ? <WorkItemsEmpty boqCount={boqLines.length} onNavigate={onNavigate} lang={lang}
              onNew={() => requireAuth(() => setAddOpen(true))} onBulk={() => requireAuth(() => setBulkOpen(true))} />
          : filtered.length === 0 ? <div className="text-center text-xs py-10" style={{ color: COL.textMute }}>No work items match this filter.</div>
          : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 mono" style={{ background: COL.surface, color: COL.textDim }}><tr style={{ borderBottom: `1px solid ${COL.border}` }}>{['Location', 'BoQ Line', 'Unit', 'Drawing', 'WIRs', 'Approved Qty', 'Status', ''].map((h) => <th key={h} className="px-4 py-2.5 text-left">{h}</th>)}</tr></thead>
              <tbody>
                {filtered.map((w) => { const sm = STATUS_META[w.dStatus] || STATUS_META.planned; return (
                  <tr key={w.id} className="border-b hover:bg-stone-50" style={{ borderColor: COL.border }}>
                    <td className="px-4 py-2.5 font-medium">{w.location || '—'}{w.description && <div className="text-[10px]" style={{ color: COL.textDim }}>{w.description}</div>}</td>
                    <td className="px-4 py-2.5">{w.line ? <><span className="mono text-[10px] font-semibold" style={{ color: COL.accent }}>{w.line.code}</span><div className="text-[10px] truncate max-w-[220px]" style={{ color: COL.textDim }}>{w.line.description}</div></> : <span className="text-[10px]" style={{ color: '#b45309' }}>No BoQ line</span>}</td>
                    <td className="px-4 py-2.5 mono text-[10px]" style={{ color: COL.textDim }}>{w.line?.unit || '—'}</td>
                    <td className="px-4 py-2.5 mono text-[10px]" style={{ color: COL.textDim }}>{w.drawing_ref || '—'}</td>
                    <td className="px-4 py-2.5 mono text-[11px]">{w.wirCount || 0}</td>
                    <td className="px-4 py-2.5 mono text-right font-semibold">{w.approvedQty ? w.approvedQty : '—'}</td>
                    <td className="px-4 py-2.5"><span className="mono text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: sm.bg, color: sm.color }}>{sm.label}</span></td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => onDelete(w)} className="p-1 rounded hover:bg-stone-100" style={{ color: '#b91c1c' }}><Trash2 size={12} /></button></td>
                  </tr>
                ); })}
              </tbody>
            </table>
          )}
      </div>

      <WorkItemModal open={addOpen} boqLines={boqLines} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); }} />
      <BulkModal open={bulkOpen} boqLines={boqLines} onClose={() => setBulkOpen(false)} onSaved={() => { setBulkOpen(false); load(); }} />
    </div>
  );
}

// First-run workspace: explains the module, gives the right next action for
// the project's state (bulk from BoQ when lines exist, else start in QS), shows
// how a work item certifies, and previews the table to come. Replaces a row of
// zero KPIs + a generic centered empty card.
function WorkItemsEmpty({ boqCount, onNavigate, lang, onNew, onBulk }) {
  const hasBoq = boqCount > 0;
  const act = hasBoq ? WITH_BOQ : NO_BOQ;
  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-4 sm:space-y-5">
        <div className="grid lg:grid-cols-5 gap-4 sm:gap-5 items-stretch">
          {/* What a work item is — the no-model path, framed positively */}
          <section className="lg:col-span-3 rounded-2xl border p-5 sm:p-6 flex flex-col" style={{ background: COL.surface, borderColor: COL.border }}>
            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: COL.accentBg }}><ListTodo size={18} style={{ color: COL.accent }} /></span>
              <h2 className="display text-base font-bold" style={{ color: COL.text }}>{INTRO.title}</h2>
            </div>
            <p className="text-[13px] leading-relaxed mb-4" style={{ color: COL.textDim }}>{INTRO.body}</p>
            <ul className="space-y-2">
              {INTRO.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2 text-[12.5px]" style={{ color: COL.text }}>
                  <Check size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#15803d' }} />{b}
                </li>
              ))}
            </ul>
          </section>
          {/* Next action — state-aware: bulk when BoQ lines exist, else go to QS */}
          <section className="lg:col-span-2 rounded-2xl border p-5 sm:p-6 flex flex-col" style={{ background: COL.surface, borderColor: COL.borderStrong, boxShadow: '0 1px 2px rgba(16,24,40,0.05)' }}>
            <h2 className="display text-base font-bold mb-1.5" style={{ color: COL.text }}>{act.title}</h2>
            <p className="text-[12.5px] leading-relaxed mb-4" style={{ color: COL.textDim }}>{act.body}</p>
            <div className="mt-auto flex flex-col gap-2">
              {hasBoq
                ? <Btn icon={Layers} variant="primary" size="md" onClick={onBulk}>{WITH_BOQ.primary.label}</Btn>
                : <Btn icon={ArrowRight} variant="primary" size="md" onClick={() => onNavigate?.(NO_BOQ.primary.route)}>{NO_BOQ.primary.label}</Btn>}
              <Btn icon={Plus} variant="secondary" size="md" onClick={onNew}>{act.secondary.label}</Btn>
            </div>
          </section>
        </div>

        {/* How a work item reaches a certified payment line */}
        <section className="rounded-2xl border p-5" style={{ background: COL.surface, borderColor: COL.border }}>
          <div className="text-[10.5px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: COL.textDim }}>How a work item gets certified</div>
          <FlowStrip steps={FLOW} lang={lang} />
        </section>

        {/* Preview of the table to come — illustrative, never real figures */}
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wider mb-2" style={{ color: COL.textDim }}>What you’ll see here</div>
          <WorkItemPreview />
        </div>
      </div>
    </div>
  );
}

const PREVIEW_ROWS = [
  ['GF — Grid A–C', 'C-201 Blinding', 'Planned'],
  ['L1 — Core wall', 'C-310 RC walls', 'In Progress'],
  ['Pier 3', 'C-410 Deck slab', 'Certified'],
];
function WorkItemPreview() {
  return (
    <div className="rounded-xl border overflow-hidden select-none" style={{ borderColor: COL.border, background: COL.surface }} aria-hidden="true">
      <div className="mono grid text-[9.5px] uppercase tracking-wider px-3 py-1.5" style={{ gridTemplateColumns: '1fr 1fr 88px', background: COL.surfaceAlt, color: COL.textMute }}>
        <span>Location</span><span>BoQ line</span><span>Status</span>
      </div>
      {PREVIEW_ROWS.map((r) => (
        <div key={r[0]} className="grid items-center px-3 py-2 text-[11.5px]" style={{ gridTemplateColumns: '1fr 1fr 88px', borderTop: `1px solid ${COL.border}`, opacity: 0.5 }}>
          <span className="truncate" style={{ color: COL.textDim }}>{r[0]}</span>
          <span className="truncate mono text-[10.5px]" style={{ color: COL.textDim }}>{r[1]}</span>
          <span className="mono text-[10px]" style={{ color: COL.textMute }}>{r[2]}</span>
        </div>
      ))}
      <div className="px-3 py-2 text-[10.5px] text-center" style={{ color: COL.textMute, borderTop: `1px dashed ${COL.borderStrong}`, background: COL.bg }}>Work items you create will appear here</div>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border outline-none';
function Field({ label, children, hint }) {
  return <div><label className="block text-[12px] font-semibold mb-1.5" style={{ color: COL.text }}>{label}</label>{children}{hint && <div className="text-[10.5px] mt-1" style={{ color: COL.textMute }}>{hint}</div>}</div>;
}

// Create a single work item.
function WorkItemModal({ open, boqLines, onClose, onSaved }) {
  const [boqId, setBoqId] = useState('');
  const [location, setLocation] = useState('');
  const [drawingRef, setDrawingRef] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setBoqId(''); setLocation(''); setDrawingRef(''); setDescription(''); setErr(''); } }, [open]);

  async function save() {
    if (!location.trim()) { setErr('Enter a location (zone / level / chainage).'); return; }
    setBusy(true); setErr('');
    try { await createWorkItem({ boq_item_id: boqId || null, location, drawing_ref: drawingRef, description }); onSaved(); }
    catch (e) { setErr(e?.message || 'Could not create work item.'); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="New work item" subtitle="A BoQ line + a location" width={460}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="primary" icon={Plus} onClick={save}>{busy ? 'Saving…' : 'Create'}</Btn></>}>
      <div className="space-y-3.5">
        <Field label="BoQ line" hint="What this work bills against (optional, but needed to certify value).">
          {/* Searchable code+description picker (same one the bulk-generate modal
              in this file uses) — a flat select is unusable at hundreds of lines. */}
          <BoqLinePicker id="wi-boq-line" value={boqId} items={boqLines} onChange={setBoqId} placeholder="Search a BoQ line by code or description…" noneLabel="— none —" />
        </Field>
        <Field label="Location" hint="Zone / level / chainage — free text (e.g. “GF — Grid A-C”).">
          <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} placeholder="GF, L1, Pier 3…" style={{ background: COL.surface, borderColor: COL.borderStrong }} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Drawing ref (optional)"><input value={drawingRef} onChange={(e) => setDrawingRef(e.target.value)} className={inputCls} placeholder="SD-STR-201" style={{ background: COL.surface, borderColor: COL.borderStrong }} /></Field>
          <Field label="Description (optional)"><input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} placeholder="Note" style={{ background: COL.surface, borderColor: COL.borderStrong }} /></Field>
        </div>
        {err && <div className="text-[12px] px-3 py-2 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{err}</div>}
      </div>
    </Modal>
  );
}

// Bulk-generate work items: one BoQ line × a list of locations.
function BulkModal({ open, boqLines, onClose, onSaved }) {
  const [boqId, setBoqId] = useState('');
  const [locText, setLocText] = useState('');
  const [drawingRef, setDrawingRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setBoqId(''); setLocText(''); setDrawingRef(''); setErr(''); } }, [open]);

  const locations = locText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);

  async function save() {
    if (!boqId) { setErr('Pick a BoQ line.'); return; }
    if (!locations.length) { setErr('Enter at least one location.'); return; }
    setBusy(true); setErr('');
    try { await bulkCreateWorkItems({ boq_item_id: boqId, locations, drawing_ref: drawingRef }); onSaved(); }
    catch (e) { setErr(e?.message || 'Could not generate work items.'); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Bulk-generate work items" subtitle="One BoQ line × a list of locations" width={480}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="primary" icon={Layers} onClick={save}>{busy ? 'Generating…' : `Generate ${locations.length || ''}`.trim()}</Btn></>}>
      <div className="space-y-3.5">
        <Field label="BoQ line" hint={`${boqLines.length} line${boqLines.length === 1 ? '' : 's'} — search by code or description.`}>
          <BoqLinePicker id="bulk-boq-line" value={boqId} items={boqLines} onChange={setBoqId} placeholder="Search a BoQ line by code or description…" noneLabel="— pick a BoQ line —" />
        </Field>
        <Field label="Locations" hint="One per line, or comma-separated (e.g. “GF, L1, L2, L3” → 4 work items).">
          <textarea value={locText} onChange={(e) => setLocText(e.target.value)} rows={5} className={inputCls} placeholder={'GF\nL1\nL2\nL3'} style={{ background: COL.surface, borderColor: COL.borderStrong, resize: 'vertical' }} />
        </Field>
        <Field label="Drawing ref (optional, applied to all)"><input value={drawingRef} onChange={(e) => setDrawingRef(e.target.value)} className={inputCls} placeholder="SD-STR-201" style={{ background: COL.surface, borderColor: COL.borderStrong }} /></Field>
        <div className="text-[12px] px-3 py-2 rounded" style={{ background: COL.accentBg, color: COL.accent }}>
          Will create <b>{locations.length}</b> work item{locations.length === 1 ? '' : 's'}.
        </div>
        {err && <div className="text-[12px] px-3 py-2 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{err}</div>}
      </div>
    </Modal>
  );
}
