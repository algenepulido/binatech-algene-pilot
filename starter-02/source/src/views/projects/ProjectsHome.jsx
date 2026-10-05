// ============================================================
// ProjectsHome — configurable landing list of projects. Users can switch
// between grid cards and a scannable table, choose/reorder/hide fields,
// filter, sort, group, save personalised views, and use quick actions.
// View preferences persist per-browser in localStorage (no backend needed).
// ============================================================
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { StyledSelect } from '../../components/StyledSelect.jsx';
import { confirmDialog } from '../../components/ConfirmDialog.jsx';
import { toast } from '../../components/Toast.jsx';
import { Plus, Book, Building2, Layers, Clock, ChevronRight, ChevronUp, ChevronDown, LayoutGrid, List, SlidersHorizontal, Check, Search, Box, FolderOpen, MoreVertical, Save, Trash2 , MoreHorizontal} from 'lucide-react';
import { PageHeader, Btn } from '../../components/primitives.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { cleanLabel } from '../../lib/labels.js';
import { BottomSheet } from '../../components/BottomSheet.jsx';
import { useIsMobile } from '../../lib/useIsMobile.js';
import { listProjects, SAMPLE_PROJECT, deleteProject, listDeletedProjects, restoreProject, purgeProject, purgeExpiredProjects, TRASH_RETENTION_DAYS } from '../../api/projects.js';
import { activeModelsByProject } from '../../api/models.js';
import { setCurrentProjectId, setCurrentProjectMeta } from '../../lib/currentProject.js';
import { NewProjectModal } from './NewProjectModal.jsx';
import { COL } from '../../lib/theme.js';

function timeAgo(ts) {
  if (!ts) return null;
  const d = new Date(ts); if (isNaN(d)) return null;
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return d.toISOString().slice(0, 10);
}

// Org-label hygiene (cleanLabel) is shared via lib/labels.js so the Dashboard,
// header and this list all normalise placeholders the same way.
function NotSet() {
  return <span style={{ color: COL.textMute }}>Not set</span>;
}

// --- Project-level status pill (distinct from the record-level StatusPill
// in primitives, which covers approved/pending/NCR etc.). Colour-coded,
// brand-token based, with a small dot. Unknown statuses fall back cleanly. ---
const PROJ_STATUS = {
  active: { label: 'Active', color: '#16a34a', bg: '#f0fdf4' },
  on_hold: { label: 'On hold', color: '#d97706', bg: '#fffbeb' },
  'on hold': { label: 'On hold', color: '#d97706', bg: '#fffbeb' },
  hold: { label: 'On hold', color: '#d97706', bg: '#fffbeb' },
  complete: { label: 'Complete', color: '#2563eb', bg: '#eff6ff' },
  completed: { label: 'Complete', color: '#2563eb', bg: '#eff6ff' },
  done: { label: 'Complete', color: '#2563eb', bg: '#eff6ff' },
  archived: { label: 'Archived', color: '#6e6e73', bg: COL.surfaceAlt },
  sample: { label: 'Sample', color: '#8a8a93', bg: COL.surfaceAlt },
};
function ProjStatusPill({ status }) {
  const key = String(status || 'active').toLowerCase();
  const s = PROJ_STATUS[key] || { label: String(status || 'Active').replace(/\b\w/g, (c) => c.toUpperCase()), color: COL.textDim, bg: COL.surfaceAlt };
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={{ background: s.bg, color: s.color }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />{s.label}
    </span>
  );
}

// Field registry — what can be shown/sorted/grouped.
const FIELDS = {
  name: { label: 'Name', always: true },
  status: { label: 'Status' },
  client: { label: 'Client' },
  consultant: { label: 'Consultant' },
  contractor: { label: 'Contractor' },
  model: { label: 'Model' },
  version: { label: 'Model ver.' },
  updated: { label: 'Last updated' },
  created: { label: 'Created' },
};
const ALL_KEYS = Object.keys(FIELDS);
const DEFAULT_CFG = { mode: 'grid', cols: ['name', 'status', 'client', 'consultant', 'model', 'updated'], sort: { key: 'updated', dir: 'desc' }, group: 'none', q: '', filterStatus: 'all' };

function useLocalState(key, initial) {
  const [v, setV] = useState(() => { try { const s = localStorage.getItem(key); return s ? { ...initial, ...JSON.parse(s) } : initial; } catch { return initial; } });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } }, [key, v]);
  return [v, setV];
}

export function ProjectsHome({ onOpenProject, onNavigate, t }) {
  const [projects, setProjects] = useState([SAMPLE_PROJECT]);
  const [models, setModels] = useState({});
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [hideSample, setHideSampleState] = useState(() => { try { return localStorage.getItem('bimqc.hideSample') === '1'; } catch { return false; } });
  const setHideSample = (v) => { setHideSampleState(v); try { localStorage.setItem('bimqc.hideSample', v ? '1' : '0'); } catch { /* ignore */ } };
  const [cfg, setCfg] = useLocalState('bimqc.projects.cfg', DEFAULT_CFG);
  const [views, setViews] = useLocalState('bimqc.projects.views', {});
  const [showCols, setShowCols] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const isMobile = useIsMobile();
  const [filterSheet, setFilterSheet] = useState(false);

  const [trash, setTrash] = useState([]); // soft-deleted projects still recoverable
  const [showTrash, setShowTrash] = useState(false);
  const loadTrash = useCallback(() => { listDeletedProjects().then(setTrash).catch(() => setTrash([])); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      purgeExpiredProjects().catch(() => {});   // best-effort client backstop for the 30-day window
      const rows = await listProjects();
      const all = [...rows, SAMPLE_PROJECT];
      setProjects(all);
      setModels(await activeModelsByProject(all.map((p) => p.id)));
      loadTrash();
    } catch { /* keep sample */ }
    setLoading(false);
  }, [loadTrash]);
  useEffect(() => { load(); }, [load]);

  const set = (patch) => setCfg((c) => ({ ...c, ...patch }));

  // value accessors (for sort/group/render)
  const statusOf = (p) => (p.is_sample ? 'sample' : (p.status || 'active'));
  const val = useMemo(() => ({
    name: (p) => p.name || '',
    status: (p) => statusOf(p),
    client: (p) => p.client || '',
    consultant: (p) => p.consultant || '',
    contractor: (p) => p.contractor || '',
    model: (p) => (models[p.id]?.element_count ?? -1),
    version: (p) => (models[p.id]?.version || 0),
    updated: (p) => (p.updated_at || p.created_at || models[p.id]?.updated_at || ''),
    created: (p) => (p.created_at || ''),
  }), [models]);

  const processed = useMemo(() => {
    const q = (cfg.q || '').toLowerCase();
    let list = projects.filter((p) => {
      if (p.is_sample && hideSample) return false;
      if (cfg.filterStatus !== 'all' && statusOf(p) !== cfg.filterStatus) return false;
      if (!q) return true;
      return `${p.name} ${p.client || ''} ${p.consultant || ''} ${p.contractor || ''}`.toLowerCase().includes(q);
    });
    const acc = val[cfg.sort.key] || val.name;
    const dir = cfg.sort.dir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      const x = acc(a), y = acc(b);
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
      return String(x).localeCompare(String(y), undefined, { numeric: true }) * dir;
    });
    return list;
  }, [projects, cfg, val, hideSample]);

  // grouping
  const groups = useMemo(() => {
    if (cfg.group === 'none') return [['', processed]];
    const acc = val[cfg.group] || (() => '');
    const m = new Map();
    processed.forEach((p) => { const g = String(acc(p) || '—'); if (!m.has(g)) m.set(g, []); m.get(g).push(p); });
    return [...m.entries()];
  }, [processed, cfg.group, val]);

  function open(p) { setCurrentProjectMeta(p); setCurrentProjectId(p.id); onOpenProject?.(p); }
  function openTo(p, route) { setCurrentProjectMeta(p); setCurrentProjectId(p.id); onNavigate?.(route); }
  async function removeProject(p) {
    if (p.is_sample) {
      if (!await confirmDialog('Hide the built-in sample project?\n\nIt’s a demo, not your data — you can show it again from the toolbar.')) return;
      setHideSample(true);
      return;
    }
    if (!await confirmDialog(`Move project "${p.name}" to Recently deleted?\n\nIt (and all its records) will be recoverable for ${TRASH_RETENTION_DAYS} days, then permanently deleted.`)) return;
    try { await deleteProject(p.id); load(); } catch (e) { toast.error(e.message); }
  }
  async function restore(p) { try { await restoreProject(p.id); load(); } catch (e) { toast.error(e.message); } }
  async function purgeNow(p) {
    if (!p.purge_state && !await confirmDialog(`Permanently delete "${p.name}"?\n\nThis freezes the project immediately, then safely removes its files and records. It may take up to 15 minutes and CANNOT be undone once started.`)) return;
    try {
      const result = await purgeProject(p.id);
      if (result.status === 'completed') toast.success('Project permanently deleted.');
      else if (result.status === 'waiting') toast.info('Permanent deletion started. Existing secure uploads must expire before cleanup continues.');
      else toast.info('Permanent deletion is in progress. You can safely check again.');
      load();
    } catch (e) { toast.error(e.message); }
  }
  function onCreated(project) { setShowNew(false); load(); setTimeout(() => open(project), 350); }

  const visibleCols = cfg.cols.filter((k) => FIELDS[k]);
  const custom = projects.filter((p) => !p.is_sample);

  // saved views
  function saveView() {
    const name = window.prompt('Save this view as:');
    if (!name) return;
    setViews((v) => ({ ...v, [name]: cfg }));
  }
  function applyView(name) { if (views[name]) setCfg({ ...DEFAULT_CFG, ...views[name] }); }
  function deleteView(name) { setViews((v) => { const n = { ...v }; delete n[name]; return n; }); }

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: COL.bg }}>
      <PageHeader
        title={t?.projects || 'Projects'}
        subtitle="Find and open a project quickly."
        actions={<>
          {/* Help is tertiary — it was competing with the primary action. */}
          <button onClick={() => onNavigate?.('guide')} title="How it works"
            className="w-8 h-8 rounded-lg border flex items-center justify-center hover:bg-stone-50"
            style={{ borderColor: COL.borderStrong, color: COL.textDim }}><Book size={14} /></button>
          <Btn icon={Plus} variant="primary" onClick={() => setShowNew(true)}>New project</Btn>
        </>}
      />

      {/* Toolbar */}
      <div className="px-4 sm:px-6 py-3 border-b flex items-center gap-2 flex-wrap" style={{ borderColor: COL.border, background: COL.surface }}>
        <div className="relative flex-1 sm:flex-none">
          <Search size={14} className="absolute start-2.5 top-1/2 -translate-y-1/2" style={{ color: COL.textMute }} />
          <input value={cfg.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search projects…" className="ps-8 pe-2.5 py-2 text-xs rounded-lg border outline-none w-full sm:w-60 focus:border-blue-500 transition-colors" style={{ background: COL.bg, borderColor: COL.borderStrong, color: COL.text }} />
        </div>

        {isMobile ? (
          <button onClick={() => setFilterSheet(true)} className="px-3 rounded-lg border text-[13px] font-medium flex items-center gap-1.5" style={{ minHeight: 38, borderColor: COL.borderStrong, color: COL.text }}><SlidersHorizontal size={14} style={{ color: COL.accent }} /> Filter</button>
        ) : (
          <>
            <Select label="Status" value={cfg.filterStatus} onChange={(v) => set({ filterStatus: v })} options={[['all', 'All statuses'], ['active', 'Active'], ['sample', 'Sample']]} />
            <Select label="Sort" value={cfg.sort.key} onChange={(v) => set({ sort: { ...cfg.sort, key: v } })} options={ALL_KEYS.map((k) => [k, FIELDS[k].label])} />
            <button onClick={() => set({ sort: { ...cfg.sort, dir: cfg.sort.dir === 'asc' ? 'desc' : 'asc' } })} className="px-2 py-1.5 text-xs rounded-lg border" style={{ borderColor: COL.borderStrong, color: COL.text }} title="Sort direction">{cfg.sort.dir === 'asc' ? '↑' : '↓'}</button>
            {/* Grouping, field config and saved views are power-user controls:
                kept in full, folded behind one button so the toolbar stops
                out-weighing the projects it sits above. */}
            <div className="relative">
              <button onClick={() => setShowAdvanced((v) => !v)} aria-expanded={showAdvanced}
                className="px-2.5 py-1.5 text-xs rounded-lg border font-medium flex items-center gap-1.5"
                style={{ borderColor: COL.borderStrong, color: showAdvanced ? COL.accent : COL.text }}>
                <SlidersHorizontal size={13} /> More
                {(cfg.group !== 'none' || cfg.cols.length !== DEFAULT_CFG.cols.length) && <span className="w-1.5 h-1.5 rounded-full" style={{ background: COL.accent }} />}
              </button>
              {showAdvanced && (
                <div className="absolute z-20 mt-1 end-0 rounded-lg border shadow-lg p-3 space-y-3 min-w-[230px]" style={{ borderColor: COL.border, background: COL.surface }}>
                  <Select label="Group" value={cfg.group} onChange={(v) => set({ group: v })} options={[['none', 'No grouping'], ['status', 'By status'], ['client', 'By client'], ['consultant', 'By consultant']]} />
                  <div className="relative">
                    <button onClick={() => setShowCols((v) => !v)} className="px-2.5 py-1.5 text-xs rounded-lg border font-medium flex items-center gap-1.5 w-full justify-center" style={{ borderColor: COL.borderStrong, color: COL.text }}><SlidersHorizontal size={13} /> Fields</button>
                    {showCols && <ColumnConfig cfg={cfg} setCfg={setCfg} onClose={() => setShowCols(false)} />}
                  </div>
                  <ViewsMenu views={views} onApply={applyView} onSave={saveView} onDelete={deleteView} />
                </div>
              )}
            </div>
            {hideSample && <button onClick={() => setHideSample(false)} className="px-2.5 py-1.5 text-xs rounded-lg border font-medium" style={{ borderColor: COL.borderStrong, color: COL.textDim }}>Show sample</button>}
            <div className="ms-auto flex items-center rounded-lg border overflow-hidden" style={{ borderColor: COL.borderStrong }}>
              {[['grid', LayoutGrid], ['table', List]].map(([m, Icon]) => (
                <button key={m} onClick={() => set({ mode: m })} className="px-2.5 py-1.5" style={{ background: cfg.mode === m ? COL.accent : COL.surface, color: cfg.mode === m ? '#fff' : COL.text }} title={m === 'grid' ? 'Grid' : 'Table'}><Icon size={14} /></button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="p-6">
        {loading && projects.length <= 1 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <div key={i} className="rounded-xl border h-40 animate-pulse" style={{ borderColor: COL.border, background: COL.surface }} />)}</div>
        ) : (
          <>
            {custom.length === 0 && (
              <div className="rounded-xl border border-dashed mb-6" style={{ borderColor: COL.borderStrong, background: COL.surface }}>
                <EmptyState
                  icon={FolderOpen}
                  title="Create your first project"
                  description="Name it, set client & consultant, and upload its BIM (IFC) model. Or explore the sample below."
                  steps={['Add a project name, client and consultant', 'Upload the project’s .ifc model (optional, add later)', 'Open it to start inspections, BoQ and payments']}
                  actions={[{ label: 'New project', icon: Plus, onClick: () => setShowNew(true) }]}
                />
              </div>
            )}

            {groups.map(([gname, rows]) => (
              <div key={gname || 'all'} className="mb-6">
                {gname !== '' && <div className="mono text-[10px] tracking-widest mb-2 flex items-center gap-2" style={{ color: COL.textMute }}>{gname.toUpperCase()} <span>· {rows.length}</span></div>}
                {(isMobile || cfg.mode === 'grid')
                  ? <GridView rows={rows} cols={visibleCols} models={models} statusOf={statusOf} onOpen={open} onOpenTo={openTo} onDelete={removeProject} />
                  : <TableView rows={rows} cols={visibleCols} models={models} statusOf={statusOf} val={val} cfg={cfg} setCfg={setCfg} onOpen={open} onOpenTo={openTo} onDelete={removeProject} />}
              </div>
            ))}
            {processed.length === 0 && <div className="text-center text-xs py-10" style={{ color: COL.textMute }}>No projects match your filter.</div>}
          </>
        )}

        {/* Recently deleted — recoverable for TRASH_RETENTION_DAYS days, then purged */}
        {trash.length > 0 && (
          <div className="mt-8 border-t pt-4" style={{ borderColor: COL.border }}>
            <button onClick={() => setShowTrash((v) => !v)} className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: COL.textDim }}>
              <Trash2 size={14} /> Recently deleted ({trash.length})
              <ChevronDown size={14} style={{ transform: showTrash ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
            </button>
            {showTrash && (
              <div className="mt-3 rounded-xl border divide-y" style={{ borderColor: COL.border, background: COL.surface }}>
                {trash.map((p) => (
                  <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate" style={{ color: COL.text }}>{p.name}</div>
                      <div className="text-[11px] mt-0.5" style={{ color: p.days_left <= 3 ? '#dc2626' : COL.textMute }}>
                        {p.purge_state === 'purging'
                          ? 'Permanent deletion in progress — project is read-only'
                          : p.days_left > 0
                            ? `Permanently deleted in ${p.days_left} day${p.days_left === 1 ? '' : 's'}`
                            : 'Pending permanent deletion'}
                        {cleanLabel(p.client) ? ` · ${cleanLabel(p.client)}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {!p.purge_state && <button onClick={() => restore(p)} className="text-[12px] font-semibold px-2.5 py-1 rounded-lg border" style={{ borderColor: COL.borderStrong, color: COL.accent }}>Restore</button>}
                      <button onClick={() => purgeNow(p)} className="text-[12px] font-semibold px-2.5 py-1 rounded-lg" style={{ color: '#b91c1c' }}>{p.purge_state === 'purging' ? 'Check status' : 'Delete now'}</button>
                    </div>
                  </div>
                ))}
                <div className="px-4 py-2 text-[10.5px]" style={{ color: COL.textMute }}>Deleted projects (and their records) are recoverable for {TRASH_RETENTION_DAYS} days, then permanently removed.</div>
              </div>
            )}
          </div>
        )}
      </div>

      <NewProjectModal open={showNew} onClose={() => setShowNew(false)} onCreated={onCreated} />

      <BottomSheet open={filterSheet} onClose={() => setFilterSheet(false)} title="Filter & sort">
        <div className="px-2 pb-2 space-y-4">
          <SheetGroup label="Status" value={cfg.filterStatus} onPick={(v) => set({ filterStatus: v })} options={[['all', 'All statuses'], ['active', 'Active'], ['sample', 'Sample']]} />
          <SheetGroup label="Sort by" value={cfg.sort.key} onPick={(v) => set({ sort: { ...cfg.sort, key: v } })} options={ALL_KEYS.map((k) => [k, FIELDS[k].label])} />
          <button onClick={() => set({ sort: { ...cfg.sort, dir: cfg.sort.dir === 'asc' ? 'desc' : 'asc' } })} className="text-[13px] font-medium px-3 py-1.5 rounded-lg border" style={{ borderColor: COL.borderStrong, color: COL.text }}>Direction: {cfg.sort.dir === 'asc' ? 'Ascending ↑' : 'Descending ↓'}</button>
          <SheetGroup label="Group" value={cfg.group} onPick={(v) => set({ group: v })} options={[['none', 'No grouping'], ['status', 'By status'], ['client', 'By client'], ['consultant', 'By consultant']]} />
        </div>
      </BottomSheet>
    </div>
  );
}

// ---- chip group for the mobile filter sheet ----
function SheetGroup({ label, value, onPick, options }) {
  return (
    <div>
      <div className="text-[11px] mb-1.5" style={{ color: COL.textDim }}>{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, l]) => (
          <button key={v} onClick={() => onPick(v)} className="px-3 rounded-lg border text-[13px] font-medium" style={{ minHeight: 40, background: value === v ? COL.accent : COL.surface, color: value === v ? '#fff' : COL.text, borderColor: value === v ? COL.accent : COL.border }}>{l}</button>
        ))}
      </div>
    </div>
  );
}

// ---- small toolbar select ----
function Select({ label, value, onChange, options }) {
  return (
    <label className="flex items-center gap-1.5 text-xs" style={{ color: COL.textDim }}>
      <span className="hidden sm:inline">{label}</span>
      <div className="min-w-[120px]"><StyledSelect ariaLabel={label} value={value} onChange={onChange} options={options.map(([v, l]) => ({ value: v, label: l }))} /></div>
    </label>
  );
}

// ---- field visibility + reorder popover ----
function ColumnConfig({ cfg, setCfg, onClose }) {
  const ref = useRef(null);
  useEffect(() => { const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); }; document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc); }, [onClose]);
  const cols = cfg.cols.filter((k) => FIELDS[k]);
  const hidden = ALL_KEYS.filter((k) => !cols.includes(k));
  const move = (i, d) => { const a = [...cols]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setCfg((c) => ({ ...c, cols: a })); };
  const toggle = (k) => setCfg((c) => ({ ...c, cols: c.cols.includes(k) ? c.cols.filter((x) => x !== k) : [...c.cols, k] }));
  return (
    <div ref={ref} className="absolute z-50 mt-1 w-64 rounded-xl border shadow-lg p-2" style={{ background: COL.surface, borderColor: COL.border }}>
      <div className="mono text-[9px] tracking-widest px-1 py-1" style={{ color: COL.textMute }}>VISIBLE FIELDS (reorder)</div>
      {cols.map((k, i) => (
        <div key={k} className="flex items-center gap-1.5 px-1 py-1 text-[13px]">
          <input type="checkbox" checked readOnly={FIELDS[k].always} onChange={() => !FIELDS[k].always && toggle(k)} disabled={FIELDS[k].always} className="w-3.5 h-3.5 accent-blue-700" />
          <span className="flex-1">{FIELDS[k].label}</span>
          <button onClick={() => move(i, -1)} className="p-0.5" style={{ color: COL.textMute }}><ChevronUp size={13} /></button>
          <button onClick={() => move(i, 1)} className="p-0.5" style={{ color: COL.textMute }}><ChevronDown size={13} /></button>
        </div>
      ))}
      {hidden.length > 0 && <><div className="mono text-[9px] tracking-widest px-1 py-1 mt-1" style={{ color: COL.textMute }}>ADD FIELD</div>
        {hidden.map((k) => (
          <button key={k} onClick={() => toggle(k)} className="w-full flex items-center gap-1.5 px-1 py-1 text-[13px] text-left hover:bg-stone-50" style={{ color: COL.text }}><Plus size={12} style={{ color: COL.textMute }} />{FIELDS[k].label}</button>
        ))}</>}
    </div>
  );
}

// ---- saved views menu ----
function ViewsMenu({ views, onApply, onSave, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc); }, []);
  const names = Object.keys(views);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="px-2.5 py-1.5 text-xs rounded-lg border font-medium flex items-center gap-1.5" style={{ borderColor: COL.borderStrong, color: COL.text }}>Views <ChevronDown size={12} /></button>
      {open && (
        <div className="absolute z-50 mt-1 w-56 rounded-xl border shadow-lg py-1.5" style={{ background: COL.surface, borderColor: COL.border }}>
          {names.length === 0 && <div className="px-3 py-2 text-[12px]" style={{ color: COL.textMute }}>No saved views yet.</div>}
          {names.map((n) => (
            <div key={n} className="flex items-center px-3 py-1.5 hover:bg-stone-50">
              <button onClick={() => { onApply(n); setOpen(false); }} className="flex-1 text-left text-[13px]" style={{ color: COL.text }}>{n}</button>
              <button onClick={() => onDelete(n)} className="p-0.5" style={{ color: '#b91c1c' }}><Trash2 size={12} /></button>
            </div>
          ))}
          <div className="border-t mt-1 pt-1" style={{ borderColor: COL.border }}>
            <button onClick={() => { onSave(); setOpen(false); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-left hover:bg-stone-50" style={{ color: COL.accent }}><Save size={13} /> Save current view…</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- cell renderer ----
function Cell({ k, p, models, statusOf }) {
  const m = models[p.id];
  const labelCell = (raw) => { const v = cleanLabel(raw); return v ? <span style={{ color: COL.textDim }}>{v}</span> : <NotSet />; };
  switch (k) {
    case 'name': return <span className="font-semibold" style={{ color: COL.text }}>{p.name}</span>;
    case 'status': return <ProjStatusPill status={statusOf(p)} />;
    case 'client': return labelCell(p.client);
    case 'consultant': return labelCell(p.consultant);
    case 'contractor': return labelCell(p.contractor);
    case 'model': return m
      ? <span className="inline-flex items-center gap-1.5" style={{ color: COL.text }}><Box size={12} style={{ color: COL.accent }} />{(m.element_count?.toLocaleString?.() || m.element_count)} els</span>
      : <span style={{ color: COL.textMute }}>No model</span>;
    case 'version': return <span className="mono" style={{ color: m?.version ? COL.textDim : COL.textMute }}>{m?.version ? `v${m.version}` : '—'}</span>;
    case 'updated': { const t = timeAgo(p.updated_at || p.created_at || m?.updated_at); return <span style={{ color: t ? COL.textDim : COL.textMute }}>{t || '—'}</span>; }
    case 'created': return <span style={{ color: p.created_at ? COL.textDim : COL.textMute }}>{p.created_at ? p.created_at.slice(0, 10) : '—'}</span>;
    default: return null;
  }
}

// Project identity mark. A 72px generic building illustration in a 96px band
// told the user nothing and cost half the card; four projects called
// "Project One", "Project Two", "Project Three" looked identical. A
// compact initials tile differentiates faster and costs 40px.
function IdentityMark({ project }) {
  const seed = (project.name || project.id || 'x').charCodeAt(0) % 5;
  const tints = ['#1d4ed8', '#0ea5e9', '#7c3aed', '#0d9488', '#d97706'];
  const c = project.is_sample ? '#94a3b8' : tints[seed];
  const initials = String(project.name || '?')
    .replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).slice(0, 2)
    .map((w) => w[0]).join('').toUpperCase() || '?';
  return (
    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
      style={{ background: `${c}14`, color: c, border: `1px solid ${c}22` }}>
      <span className="display text-[13px] font-bold tracking-tight">{initials}</span>
    </div>
  );
}

// One compact metadata line: "CLIENT · CONSULTANT" or "IFC · 36 elements".
function MetaLine({ children }) {
  return <div className="text-[11.5px] truncate" style={{ color: COL.textDim }}>{children}</div>;
}

function GridView({ rows, cols, models, statusOf, onOpen, onOpenTo, onDelete }) {
  return (
    // 4 columns on a wide desktop (was 3 with cards twice as tall), so a
    // 25-project portfolio is scannable instead of a scroll marathon.
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
      {rows.map((p, i) => {
        const m = models[p.id];
        const status = statusOf(p);
        const exceptional = status !== 'active';   // Active is the norm — stay quiet about it
        const client = cleanLabel(p.client);
        const consultant = cleanLabel(p.consultant);
        const parties = [client, consultant].filter(Boolean).join(' · ');
        const missing = [!client && 'client', !consultant && 'consultant', !m && 'model'].filter(Boolean);
        const updated = timeAgo(p.updated_at || p.created_at || m?.updated_at);
        return (
          <div key={p.id} className="app-rise group relative rounded-lg border transition-all duration-150 hover:-translate-y-px hover:shadow-[0_10px_28px_-18px_rgba(13,18,40,0.45)]"
            style={{ borderColor: COL.border, background: COL.surface, animationDelay: `${Math.min(i * 0.02, 0.18)}s` }}>
            {/* The whole card opens the project — the primary job of this screen. */}
            <button onClick={() => onOpen(p)} className="w-full text-start p-3.5">
              <div className="flex items-start gap-2.5">
                <IdentityMark project={p} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="display text-[14.5px] font-bold truncate" style={{ color: COL.text }}>{p.name}</span>
                    {/* Quiet dot for the normal case; a real pill only when the
                        state is exceptional and therefore worth reading. */}
                    {exceptional
                      ? <span className="flex-shrink-0"><ProjStatusPill status={status} /></span>
                      : <span title="Active" className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#16a34a' }} />}
                  </div>
                  <MetaLine>{parties || <span style={{ color: COL.textMute }}>No client or consultant set</span>}</MetaLine>
                  <MetaLine>
                    {m
                      ? <span style={{ color: COL.text }}>IFC · {(m.element_count?.toLocaleString?.() || m.element_count)} elements</span>
                      : <span style={{ color: COL.textMute }}>No model</span>}
                  </MetaLine>
                  <div className="text-[11px] mt-1" style={{ color: COL.textMute }}>{updated ? `Updated ${updated}` : 'Never opened'}</div>
                  {/* One restrained line instead of three separate "Not set" rows. */}
                  {missing.length >= 2 && (
                    <div className="mono text-[9.5px] mt-1.5 inline-block px-1.5 py-0.5 rounded" style={{ background: COL.surfaceAlt, color: COL.textMute }}>
                      SETUP INCOMPLETE
                    </div>
                  )}
                </div>
              </div>
            </button>
            {/* Secondary controls sit outside the card button so they do not
                nest interactive elements. Administration lives behind "…"
                rather than a permanent red delete icon on every project. */}
            <div className="absolute top-2.5 end-2.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-0.5">
              {m && (
                <button onClick={(e) => { e.stopPropagation(); onOpenTo(p, 'model'); }} title="Open 3D model"
                  className="w-7 h-7 rounded-md flex items-center justify-center border hover:bg-stone-50"
                  style={{ borderColor: COL.border, color: COL.textDim, background: COL.surface }}><Box size={12} /></button>
              )}
              <ProjectMenu project={p} onDelete={onDelete} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Compact overflow menu — keeps destructive actions off the resting card.
function ProjectMenu({ project, onDelete }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);
  return (
    <div className="relative">
      <button onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} aria-label={`Manage ${project.name}`}
        className="w-7 h-7 rounded-md flex items-center justify-center border hover:bg-stone-50"
        style={{ borderColor: COL.border, color: COL.textDim, background: COL.surface }}>
        <MoreHorizontal size={13} />
      </button>
      {open && (
        <div className="absolute end-0 mt-1 z-20 rounded-lg border shadow-lg py-1 min-w-[150px]" style={{ borderColor: COL.border, background: COL.surface }}>
          <button onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(project); }}
            className="w-full text-start px-3 py-1.5 text-[12.5px] hover:bg-stone-50" style={{ color: '#b91c1c' }}>
            {project.is_sample ? 'Hide sample project' : 'Delete project'}
          </button>
        </div>
      )}
    </div>
  );
}

function TableView({ rows, cols, models, statusOf, val, cfg, setCfg, onOpen, onOpenTo, onDelete }) {
  const sortBy = (k) => setCfg((c) => ({ ...c, sort: { key: k, dir: c.sort.key === k && c.sort.dir === 'asc' ? 'desc' : 'asc' } }));
  return (
    <div className="app-rise rounded-xl border overflow-x-auto" style={{ borderColor: COL.border, background: COL.surface }}>
      <table className="w-full text-sm">
        <thead className="mono" style={{ background: COL.surfaceAlt }}>
          <tr style={{ borderBottom: `1px solid ${COL.border}` }}>
            {cols.map((k) => {
              const active = cfg.sort.key === k;
              return (
                <th key={k} onClick={() => sortBy(k)} className="px-4 py-3 text-start text-[11px] font-semibold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap" style={{ color: active ? COL.accent : COL.textDim }}>
                  <span className="inline-flex items-center gap-1">{FIELDS[k].label}{active && (cfg.sort.dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}</span>
                </th>
              );
            })}
            <th className="px-4 py-3 text-end text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: COL.textDim }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-b hover:bg-stone-50 cursor-pointer transition-colors" style={{ borderColor: COL.border }} onClick={() => onOpen(p)}>
              {cols.map((k) => <td key={k} className="px-4 py-3 whitespace-nowrap text-[13px] align-middle"><Cell k={k} p={p} models={models} statusOf={statusOf} /></td>)}
              <td className="px-4 py-3 text-end whitespace-nowrap align-middle" onClick={(e) => e.stopPropagation()}>
                <div className="inline-flex items-center gap-1 justify-end">
                  <button onClick={() => onOpen(p)} className="text-[12px] font-semibold px-2.5 py-1 rounded-lg border transition hover:bg-stone-50" style={{ borderColor: COL.borderStrong, color: COL.accent }}>Open</button>
                  <button onClick={() => onOpenTo(p, 'model')} className="p-1.5 rounded-lg transition hover:bg-stone-100" style={{ color: COL.textDim }} title="Open 3D"><Box size={13} /></button>
                  <button onClick={() => onDelete(p)} className="p-1.5 rounded-lg transition hover:bg-red-50" style={{ color: '#b91c1c' }} title={p.is_sample ? 'Hide sample' : 'Delete project'}><Trash2 size={13} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
