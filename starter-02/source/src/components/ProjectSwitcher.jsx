// ============================================================
// ProjectSwitcher — persistent current-project breadcrumb + quick switcher in
// the header. Switching sets the current project, which re-scopes every tab
// (the API layer reads getCurrentProjectId(); contexts subscribe to changes).
// ============================================================
import { useState, useRef, useEffect } from 'react';
import { Building2, ChevronDown, Check, FolderOpen } from 'lucide-react';
import { listProjects, SAMPLE_PROJECT } from '../api/projects.js';
import { getCurrentProjectId, setCurrentProjectId } from '../lib/currentProject.js';
import { useProject } from '../lib/project.jsx';
import { COL } from '../lib/theme.js';

export function ProjectSwitcher({ lang, onGoHome, phone = false }) {
  const { project } = useProject();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState([SAMPLE_PROJECT]);
  const ref = useRef(null);
  const current = getCurrentProjectId();

  useEffect(() => {
    if (!open) return undefined;
    listProjects().then((rows) => setProjects([...rows, SAMPLE_PROJECT])).catch(() => {});
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function pick(p) {
    setOpen(false);
    if (p.id !== current) setCurrentProjectId(p.id); // contexts + tabs re-scope via subscribers
  }

  return (
    <div className="relative min-w-0" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        data-phone-shell-control={phone ? '' : undefined}
        className="flex items-center gap-2 text-sm px-2.5 py-1.5 rounded-lg border min-w-0 hover:bg-stone-50 transition-colors"
        style={{ borderColor: COL.borderStrong, background: COL.surface, ...(phone ? { width: '100%', minWidth: 44, minHeight: 44, paddingInline: 8 } : {}) }}
        title="Switch project"
      >
        <Building2 size={14} className="flex-shrink-0" style={{ color: COL.accent }} />
        <span className="hidden lg:inline mono text-[11px] flex-shrink-0" style={{ color: COL.textMute }}>{project.code}</span>
        <span className="hidden lg:inline flex-shrink-0" style={{ color: COL.borderStrong }}>/</span>
        <span className="font-semibold max-w-[120px] sm:max-w-[200px] truncate" style={{ color: COL.text, ...(phone ? { flex: '1 1 auto', minWidth: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : {}) }}>{lang === 'ar' ? project.nameAr || project.name : project.name}</span>
        <ChevronDown size={13} className="flex-shrink-0" style={{ color: COL.textMute, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div data-project-picker="" className="absolute z-50 mt-1 w-72 rounded-xl border shadow-lg py-1.5 max-h-[60vh] overflow-y-auto scrollbar" style={{ background: COL.surface, borderColor: COL.border, insetInlineStart: phone ? -50 : 0, ...(phone ? { width: 'calc(100vw - 16px)' } : {}) }}>
          <div className="mono text-[9px] tracking-widest px-3 py-1.5" style={{ color: COL.textMute }}>SWITCH PROJECT</div>
          {projects.map((p) => {
            const active = p.id === current;
            return (
              <button key={p.id} onClick={() => pick(p)} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-stone-50" style={{ background: active ? COL.accentBg : 'transparent' }}>
                <Building2 size={14} style={{ color: active ? COL.accent : COL.textMute, flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate" style={{ color: active ? COL.accent : COL.text }}>{p.name}</div>
                  <div className="mono text-[10px] truncate" style={{ color: COL.textMute }}>{p.code || String(p.id).slice(0, 8)}{p.client ? ` · ${p.client}` : ''}</div>
                </div>
                {active && <Check size={14} style={{ color: COL.accent, flexShrink: 0 }} />}
              </button>
            );
          })}
          <div className="border-t mt-1 pt-1" style={{ borderColor: COL.border }}>
            <button onClick={() => { setOpen(false); onGoHome?.(); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-stone-50 text-[13px]" style={{ color: COL.text }}>
              <FolderOpen size={14} style={{ color: COL.textMute }} /> All projects…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
