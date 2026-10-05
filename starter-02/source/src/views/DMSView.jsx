import { useState, useEffect, useMemo, useCallback } from 'react';
import { confirmDialog } from '../components/ConfirmDialog.jsx';
import { toast } from '../components/Toast.jsx';
import { AlertTriangle, CheckCircle2, FileText, Hourglass, Pencil, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import { Btn, KpiCard, PageHeader } from '../components/primitives.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { Attachments } from '../components/Attachments.jsx';
import { StyledSelect } from '../components/StyledSelect.jsx';
import { DocFormModal } from './dms/DocForm.jsx';
import { DocumentsField } from './dms/DocumentsField.jsx';
import { listDocuments, deleteDocument, updateDocument } from '../api/documents.js';
import { DOC_STATUS, DOC_TYPES } from '../data/documents.js';

// Status options for the inline per-document editor (workflow metadata only).
const STATUS_OPTIONS = Object.keys(DOC_STATUS).map((k) => ({ value: k, label: DOC_STATUS[k].label, color: DOC_STATUS[k].color }));
import { isSupabaseConfigured } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';
import { COL } from '../lib/theme.js';
import { T } from '../i18n/translations.js';

// ============================================================
// DMS VIEW — Document Management System (real CRUD via Supabase).
//
// MOB-UI1: below 1024 (`field`) the register is drawn by DocumentsField — a
// presentation-only child on the SAME load, gate, upload and detail path. The
// desktop render below it is unchanged.
// ============================================================
export function DMSView({ t, lang = 'en', field = false, onBack }) {
  const { requireAuth } = useAuth();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [q, setQ] = useState('');                       // field search only; desktop has no search box
  const [selected, setSelected] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setDocs([]); setLoading(false); return; }
    setLoading(true); setError(null);
    try { setDocs(await listDocuments()); }
    catch (err) { setError(err?.message ?? String(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const needle = q.trim().toLowerCase();
  const list = useMemo(() => docs.filter((d) =>
    (filter === 'all' || d.type === filter) && (statusFilter === 'all' || d.status === statusFilter)
    && (!needle || `${d.doc_no ?? ''} ${d.title ?? ''} ${d.discipline ?? ''} ${d.package ?? ''}`.toLowerCase().includes(needle))
  ), [docs, filter, statusFilter, needle]);
  const openUpload = () => requireAuth(() => { setEditing(null); setFormOpen(true); });

  const stats = useMemo(() => ({
    total: docs.length,
    pending: docs.filter((d) => d.status === 'submitted' || d.status === 'internalReview').length,
    rejected: docs.filter((d) => d.status === 'rejected' || d.status === 'reviseResubmit').length,
    approved: docs.filter((d) => ['approved', 'approvedC', 'forConstruction'].includes(d.status)).length,
  }), [docs]);

  const A = (x) => x ?? [];
  // Per-document status edit — updates ONLY this document's own status (document
  // workflow metadata; never touches certification/WIR/BoQ). Optimistically
  // reflects in the list + detail so two documents stay fully independent.
  function setDocStatus(doc, status) {
    if (!doc || status === doc.status) return;
    requireAuth(async () => {
      try {
        await updateDocument(doc.id, { status });
        setDocs((arr) => arr.map((d) => (d.id === doc.id ? { ...d, status } : d)));
        setSelected((s) => (s && s.id === doc.id ? { ...s, status } : s));
      } catch (e) { toast.error(e.message); }
    });
  }
  function onDelete(d) {
    requireAuth(async () => {
      if (!await confirmDialog(`Delete ${d.doc_no}?`)) return;
      try { await deleteDocument(d.id); setSelected(null); load(); } catch (e) { toast.error(e.message); }
    });
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {field ? (
        <DocumentsField t={(t?.dmsField) || T[lang === 'ar' ? 'ar' : 'en'].dmsField} lang={lang} configured={isSupabaseConfigured}
          loading={loading} error={error} docs={docs} list={list} q={q} onSearch={setQ}
          filter={filter} statusFilter={statusFilter} onFilters={({ type, status }) => { setFilter(type); setStatusFilter(status); }}
          onRetry={load} onUpload={openUpload} onSelect={setSelected} selectedId={selected?.id} onBack={onBack} />
      ) : (
      <main className="flex-1 overflow-y-auto" style={{ background: COL.bg }}>
        <PageHeader title="Document Management" subtitle="Controlled documents · transmittals · revision history · linked records"
          actions={<><Btn variant="ghost" icon={RotateCcw} onClick={load}>Refresh</Btn><Btn variant="primary" icon={Upload} onClick={() => requireAuth(() => { setEditing(null); setFormOpen(true); })}>Upload Document</Btn></>} />

        <div className="px-7 pb-4">
          {!isSupabaseConfigured && (
            <div className="my-3 text-xs px-3 py-2 rounded border" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>Supabase isn't configured. Add your keys to <span className="mono">.env</span> and restart the dev server.</div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <KpiCard label="Total Documents" value={stats.total} icon={FileText} accent={COL.accent} />
            <KpiCard label="Pending Review" value={stats.pending} icon={Hourglass} accent="#d97706" />
            <KpiCard label="Revise / Rejected" value={stats.rejected} icon={AlertTriangle} accent="#dc2626" />
            <KpiCard label="Approved / For Construction" value={stats.approved} icon={CheckCircle2} accent="#16a34a" />
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            {['all', ...Object.keys(DOC_TYPES)].map((f) => (
              <button key={f} onClick={() => setFilter(f)} className="px-2.5 py-1 rounded-full text-[10px] font-semibold mono uppercase tracking-wide" style={{ background: filter === f ? COL.accent : COL.surface, color: filter === f ? '#fff' : COL.text, border: `1px solid ${filter === f ? COL.accent : COL.border}` }}>{f === 'all' ? 'All Types' : DOC_TYPES[f]?.label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {['all', 'submitted', 'approved', 'approvedC', 'reviseResubmit', 'rejected', 'forConstruction', 'superseded', 'closed'].map((f) => (
              <button key={f} onClick={() => setStatusFilter(f)} className="px-2 py-0.5 rounded text-[10px] font-semibold mono" style={{ background: statusFilter === f ? COL.text : 'transparent', color: statusFilter === f ? '#fff' : COL.textDim, border: `1px solid ${statusFilter === f ? COL.text : COL.border}` }}>{f === 'all' ? 'All Statuses' : DOC_STATUS[f]?.label}</button>
            ))}
          </div>

          {loading ? <div className="text-center text-xs py-10" style={{ color: COL.textMute }}>Loading documents…</div>
            : error ? <div className="text-xs px-3 py-2 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>
            : list.length === 0 ? (docs.length === 0 ? <EmptyState icon={FileText} title="No documents yet"
                description="A controlled register for submittals, RFIs and MIRs — with revisions and links to the records they support. Upload your first."
                actions={[{ label: 'Upload Document', icon: Upload, onClick: () => requireAuth(() => { setEditing(null); setFormOpen(true); }) }]} /> : <div className="text-center text-xs py-10" style={{ color: COL.textMute }}>No documents match these filters.</div>)
            : (
              <div className="rounded border overflow-hidden" style={{ borderColor: COL.border, background: COL.surface }}>
                <table className="w-full text-[11px]">
                  <thead><tr style={{ background: COL.bg, borderBottom: `1px solid ${COL.border}` }}>{['Document No', 'Type', 'Title', 'Rev', 'Status', 'Linked', 'Date'].map((h) => <th key={h} className="text-left px-3 py-2 mono text-[10px] uppercase tracking-wide" style={{ color: COL.textDim }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {list.map((d) => (
                      <tr key={d.id} onClick={() => setSelected(d)} className="cursor-pointer hover:bg-stone-50 border-t" style={{ borderColor: '#f0ede0', background: selected?.id === d.id ? '#eef4ff' : 'transparent' }}>
                        <td className="px-3 py-2 mono font-semibold" style={{ color: COL.accent }}>{d.doc_no}</td>
                        <td className="px-3 py-2"><span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold mono" style={{ color: DOC_TYPES[d.type]?.color, background: DOC_TYPES[d.type]?.bg }}>{DOC_TYPES[d.type]?.label ?? d.type}</span></td>
                        <td className="px-3 py-2">{d.title}</td>
                        <td className="px-3 py-2 mono">{d.rev}</td>
                        <td className="px-3 py-2"><span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold mono" style={{ color: DOC_STATUS[d.status]?.color, background: DOC_STATUS[d.status]?.bg }}>{DOC_STATUS[d.status]?.label ?? d.status}</span></td>
                        <td className="px-3 py-2 mono text-[10px]" style={{ color: COL.textDim }}>
                          {A(d.linked_elements).length > 0 && <span>{A(d.linked_elements).length}E</span>}
                          {A(d.linked_drawings).length > 0 && <span className="ml-1">{A(d.linked_drawings).length}D</span>}
                          {A(d.linked_wirs).length > 0 && <span className="ml-1">{A(d.linked_wirs).length}W</span>}
                          {A(d.linked_ipcs).length > 0 && <span className="ml-1 font-bold" style={{ color: '#a16207' }}>{A(d.linked_ipcs).length}IPC</span>}
                        </td>
                        <td className="px-3 py-2 mono">{d.doc_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      </main>
      )}

      {selected && (
        <aside className="fixed inset-0 z-30 w-full lg:static lg:z-auto lg:w-[420px] border-l flex flex-col lg:flex-shrink-0 overflow-y-auto scrollbar" style={{ borderColor: COL.border, background: COL.surface }}>
            <div className="px-5 py-4 border-b" style={{ borderColor: COL.border }}>
              <div className="flex items-center justify-between mb-2">
                <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold mono" style={{ color: DOC_TYPES[selected.type]?.color, background: DOC_TYPES[selected.type]?.bg }}>{DOC_TYPES[selected.type]?.label ?? selected.type}</span>
                <div className="flex items-center gap-2">
                  <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold mono" style={{ color: DOC_STATUS[selected.status]?.color, background: DOC_STATUS[selected.status]?.bg }}>{DOC_STATUS[selected.status]?.label ?? selected.status}</span>
                  <button onClick={() => setSelected(null)} className="lg:hidden p-1 rounded hover:bg-stone-100" style={{ color: COL.textDim }} aria-label="Close"><X size={16} /></button>
                </div>
              </div>
              <div className="mono text-[11px] font-bold" style={{ color: COL.accent }}>{selected.doc_no} · REV {selected.rev}</div>
              <div className="display text-base font-bold leading-tight mt-1">{selected.title}</div>
              <div className="mono text-[10px] mt-2" style={{ color: COL.textDim }}>{[selected.discipline, selected.package, selected.size_text].filter(Boolean).join(' · ')}</div>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <div className="mono text-[9px] tracking-widest mb-2" style={{ color: COL.textDim }}>STATUS</div>
                <StyledSelect ariaLabel="Document status" value={selected.status} onChange={(v) => setDocStatus(selected, v)} options={STATUS_OPTIONS} />
              </div>
              <div>
                <div className="mono text-[9px] tracking-widest mb-2" style={{ color: COL.textDim }}>METADATA</div>
                {[['Submitted by', selected.submitted_by], ['Reviewed by', selected.reviewed_by], ['Date', selected.doc_date], ['Package', selected.package], ['File Size', selected.size_text]].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-[11px] py-1"><span style={{ color: COL.textDim }}>{k}</span><span style={{ color: COL.text }}>{v || '—'}</span></div>
                ))}
              </div>

              {A(selected.tags).length > 0 && (
                <div>
                  <div className="mono text-[9px] tracking-widest mb-2" style={{ color: COL.textDim }}>TAGS</div>
                  <div className="flex flex-wrap gap-1">{A(selected.tags).map((tg) => <span key={tg} className="inline-block px-1.5 py-0.5 rounded text-[9px] mono" style={{ color: COL.text, background: COL.bg, border: `1px solid ${COL.border}` }}>#{tg}</span>)}</div>
                </div>
              )}

              {(A(selected.linked_elements).length || A(selected.linked_drawings).length || A(selected.linked_wirs).length || A(selected.linked_snags).length || A(selected.linked_ipcs).length) > 0 && (
                <div>
                  <div className="mono text-[9px] tracking-widest mb-2" style={{ color: COL.textDim }}>LINKED RECORDS</div>
                  <div className="space-y-1.5">
                    {[['BIM Elements', selected.linked_elements, '#dbeafe', '#1e3a8a'], ['Drawings', selected.linked_drawings, '#dbeafe', '#1e3a8a'], ['WIRs', selected.linked_wirs, '#cffafe', '#0c4a6e'], ['Snags', selected.linked_snags, '#fed7aa', '#9a3412']].map(([label, arr, bg, fg]) => A(arr).length > 0 && (
                      <div key={label} className="rounded border p-2" style={{ background: COL.bg, borderColor: COL.border }}>
                        <div className="mono text-[10px] font-semibold mb-1" style={{ color: COL.accent }}>{label} ({A(arr).length})</div>
                        <div className="flex flex-wrap gap-1">{A(arr).map((e) => <span key={e} className="mono text-[9px] px-1 py-0.5 rounded" style={{ background: bg, color: fg }}>{e}</span>)}</div>
                      </div>
                    ))}
                    {A(selected.linked_ipcs).length > 0 && (
                      <div className="rounded border-l-2 p-2" style={{ background: '#fef9c3', borderColor: '#a16207', borderLeftColor: '#a16207' }}>
                        <div className="mono text-[10px] font-semibold mb-1" style={{ color: '#92400e' }}>Used in IPC Claims ({A(selected.linked_ipcs).length})</div>
                        <div className="flex flex-wrap gap-1">{A(selected.linked_ipcs).map((e) => <span key={e} className="mono text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: '#a16207', color: '#fff' }}>{e}</span>)}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="border-t pt-4" style={{ borderColor: COL.border }}>
                <Attachments recordType="document" recordId={selected.id} />
              </div>

              <div className="flex gap-2">
                <Btn variant="primary" icon={Pencil} onClick={() => requireAuth(() => { setEditing(selected); setFormOpen(true); })}>Edit</Btn>
                <Btn variant="secondary" icon={Trash2} onClick={() => onDelete(selected)}>Delete</Btn>
              </div>
            </div>
        </aside>
      )}

      <DocFormModal open={formOpen} initial={editing} onClose={() => setFormOpen(false)} onSaved={(saved) => { setFormOpen(false); load(); if (selected && saved?.id === selected.id) setSelected(saved); }} />
    </div>
  );
}
