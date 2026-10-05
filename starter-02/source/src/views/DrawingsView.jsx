import { useState, useEffect, useMemo, useCallback } from 'react';
import { confirmDialog } from '../components/ConfirmDialog.jsx';
import { toast } from '../components/Toast.jsx';
import { Download, Pencil, Plus, RotateCcw, Trash2, X, FileImage, MoreHorizontal, SlidersHorizontal } from 'lucide-react';
import { EmptyState } from '../components/EmptyState.jsx';
import { Btn, PageHeader, StatusPill } from '../components/primitives.jsx';
import { Attachments } from '../components/Attachments.jsx';
import { BottomSheet, SheetItem } from '../components/BottomSheet.jsx';
import { DrawingFormModal } from './drawings/DrawingForm.jsx';
import { listDrawings, deleteDrawing, DRAWING_STATUSES } from '../api/drawings.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';
import { useIsMobile } from '../lib/useIsMobile.js';
import { COL } from '../lib/theme.js';
import { exportSheet } from '../lib/excelExport.js';

// ============================================================
// DRAWINGS VIEW — real CRUD backed by Supabase.
// ============================================================
export function DrawingsView({ t }) {
  const { requireAuth } = useAuth();
  const [drawings, setDrawings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const isMobile = useIsMobile();
  const [moreOpen, setMoreOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setDrawings([]); setLoading(false); return; }
    setLoading(true); setError(null);
    try { setDrawings(await listDrawings()); }
    catch (err) { setError(err?.message ?? String(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const list = useMemo(() => filter === 'all' ? drawings : drawings.filter((d) => d.status === filter), [filter, drawings]);

  function onDelete(d) {
    requireAuth(async () => {
      if (!await confirmDialog(`Delete ${d.drawing_number}?`)) return;
      try { await deleteDrawing(d.id); setSelected(null); load(); } catch (e) { toast.error(e.message); }
    });
  }
  const upload = () => requireAuth(() => { setEditing(null); setFormOpen(true); });
  function doExport() {
    exportSheet({ fileName: 'Drawings', title: 'DRAWING REGISTER', rows: list, columns: [
      { label: 'Drawing No', key: 'drawing_number', width: 16 },
      { label: 'Rev', key: 'rev', width: 8 },
      { label: 'Title', key: 'title', width: 36, wrap: true },
      { label: 'Discipline', key: 'discipline', width: 16 },
      { label: 'Status', key: 'status', width: 16 },
      { label: 'Date', key: 'drawing_date', width: 12 },
      { label: 'Submitted By', key: 'submitted_by', width: 18 },
      { label: 'Reviewed By', key: 'reviewed_by', width: 18 },
    ] });
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title={t.drawings} subtitle="Shop drawing register with revision control"
        actions={isMobile
          ? <><Btn icon={Plus} variant="primary" onClick={upload}>Upload</Btn><Btn icon={MoreHorizontal} variant="secondary" onClick={() => setMoreOpen(true)}>More</Btn></>
          : <><Btn icon={RotateCcw} onClick={load}>Refresh</Btn><Btn icon={Download} variant="secondary" onClick={doExport}>Export</Btn><Btn icon={Plus} variant="primary" onClick={upload}>Upload Drawing</Btn></>} />

      <div className="px-4 sm:px-6 py-3 border-b flex flex-wrap items-center gap-2" style={{ borderColor: COL.border, background: COL.surface }}>
        {isMobile ? (
          <button onClick={() => setFilterOpen(true)} className="flex items-center gap-2 px-3 rounded-lg border text-[13px] font-medium" style={{ minHeight: 40, borderColor: COL.borderStrong, color: COL.text, background: COL.surface }}>
            <SlidersHorizontal size={15} style={{ color: COL.accent }} /> {filter === 'all' ? 'All drawings' : filter}
            <span className="text-[11px]" style={{ color: COL.textMute }}>· {list.length}</span>
          </button>
        ) : (
          <>
            {['all', ...DRAWING_STATUSES].map((f) => (
              <button key={f} onClick={() => setFilter(f)} className="px-3 py-1 text-xs rounded border" style={{ background: filter === f ? COL.accent : COL.surface, color: filter === f ? '#fff' : COL.text, borderColor: filter === f ? COL.accent : COL.border }}>{f === 'all' ? 'All' : f}</button>
            ))}
            <div className="mono text-[10px] ml-auto" style={{ color: COL.textDim }}>{list.length} drawings</div>
          </>
        )}
      </div>

      {!isSupabaseConfigured && (
        <div className="mx-6 mt-3 text-xs px-3 py-2 rounded border" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>Supabase isn't configured. Add your keys to <span className="mono">.env</span> and restart the dev server.</div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto overflow-x-auto scrollbar">
          {loading ? <div className="text-center text-xs py-10" style={{ color: COL.textMute }}>Loading drawings…</div>
            : error ? <div className="mx-6 my-4 text-xs px-3 py-2 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>
            : list.length === 0 ? (drawings.length === 0 ? <EmptyState icon={FileImage} title="No drawings yet"
                description="Your drawing register with revisions. Add a drawing, track its review status, and link it to the model elements it covers."
                actions={[{ label: 'Upload Drawing', icon: Plus, onClick: () => requireAuth(() => { setEditing(null); setFormOpen(true); }) }]} /> : <div className="text-center text-xs py-10" style={{ color: COL.textMute }}>No drawings match this filter.</div>)
            : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 mono" style={{ background: COL.surface, color: COL.textDim }}>
                  <tr style={{ borderBottom: `1px solid ${COL.border}` }}>
                    {['Drawing No.', 'Rev', 'Title', 'Discipline', 'Status', 'Linked Elements', 'Date'].map((h) => <th key={h} className="px-4 py-2.5 text-left">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {list.map((d) => (
                    <tr key={d.id} onClick={() => setSelected(d)} className="border-b cursor-pointer hover:bg-stone-50" style={{ borderColor: COL.border, background: selected?.id === d.id ? COL.accentBg : 'transparent' }}>
                      <td className="px-4 py-2.5 mono font-semibold" style={{ color: COL.accent }}>{d.drawing_number}</td>
                      <td className="px-4 py-2.5 mono">{d.rev}</td>
                      <td className="px-4 py-2.5">{d.title}</td>
                      <td className="px-4 py-2.5" style={{ color: COL.textDim }}>{d.discipline}</td>
                      <td className="px-4 py-2.5"><StatusPill status={d.status} /></td>
                      <td className="px-4 py-2.5 mono text-[10px]" style={{ color: COL.textDim }}>{d.linked_elements?.length ? d.linked_elements.join(', ') : '—'}</td>
                      <td className="px-4 py-2.5 mono text-[10px]" style={{ color: COL.textDim }}>{d.drawing_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>

        {selected && (
          <aside className="fixed inset-0 z-30 w-full lg:static lg:z-auto lg:w-96 border-l flex flex-col lg:flex-shrink-0" style={{ borderColor: COL.border, background: COL.surface }}>
            <div className="px-5 py-4 border-b" style={{ borderColor: COL.border }}>
              <div className="flex items-center justify-between">
                <div className="mono text-[10px]" style={{ color: COL.textDim }}>DRAWING DETAIL</div>
                <button onClick={() => setSelected(null)}><X size={14} /></button>
              </div>
              <div className="mono text-[11px] mt-2 font-semibold" style={{ color: COL.accent }}>{selected.drawing_number} · REV {selected.rev}</div>
              <div className="display text-base font-bold mt-1">{selected.title}</div>
              <div className="mt-2"><StatusPill status={selected.status} size="lg" /></div>
            </div>
            <div className="p-5 space-y-3 text-xs flex-1 overflow-y-auto scrollbar">
              {[['Discipline', selected.discipline], ['Submitted By', selected.submitted_by], ['Reviewed By', selected.reviewed_by], ['Submission Date', selected.drawing_date], ['File Size', selected.size_text], ['Linked Elements', selected.linked_elements?.length ? selected.linked_elements.join(', ') : 'None']].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <span style={{ color: COL.textDim }}>{k}</span>
                  <span style={{ color: COL.text, textAlign: 'right' }} className={k === 'Linked Elements' ? 'mono text-[10px]' : ''}>{v || '—'}</span>
                </div>
              ))}
              <div className="pt-3 mt-3 border-t" style={{ borderColor: COL.border }}>
                <Attachments recordType="drawing" recordId={selected.id} />
              </div>
              <div className="flex gap-2 pt-2">
                <Btn variant="primary" icon={Pencil} onClick={() => requireAuth(() => { setEditing(selected); setFormOpen(true); })}>Edit</Btn>
                <Btn variant="secondary" icon={Trash2} onClick={() => onDelete(selected)}>Delete</Btn>
              </div>
            </div>
          </aside>
        )}
      </div>

      <DrawingFormModal open={formOpen} initial={editing} onClose={() => setFormOpen(false)} onSaved={(saved) => { setFormOpen(false); load(); if (selected && saved?.id === selected.id) setSelected(saved); }} />

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <SheetItem icon={RotateCcw} label="Refresh" onClick={() => { setMoreOpen(false); load(); }} />
        <SheetItem icon={Download} label="Export to Excel" onClick={() => { setMoreOpen(false); doExport(); }} />
      </BottomSheet>
      <BottomSheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter by status">
        {['all', ...DRAWING_STATUSES].map((f) => (
          <SheetItem key={f} icon={f === filter ? SlidersHorizontal : undefined} label={f === 'all' ? 'All drawings' : f} onClick={() => { setFilter(f); setFilterOpen(false); }} />
        ))}
      </BottomSheet>
    </div>
  );
}
