import { ELEMENTS } from '../data/elements.js';
import { COL } from '../lib/theme.js';
import { useProject } from '../lib/project.jsx';
import { isSupabaseConfigured } from '../lib/supabase.js';

export function StatusBar({ t, counts = {} }) {
  const { project } = useProject();
  // Honest connection state: green only when Supabase is actually configured
  // (not a permanently-green pill). Grey + "Offline" otherwise.
  const online = isSupabaseConfigured;
  return (
    <footer className="px-5 py-2 border-t flex items-center justify-between mono text-[10px]" style={{ borderColor: COL.inkBorder, background: COL.ink, color: COL.inkMute }}>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: online ? '#16a34a' : '#9ca3af' }} /> {online ? 'Connected' : 'Offline'}</span>
        <span>Project {project.code}</span>
        {(() => {
          const els = counts.totalElements > 0 ? counts.totalElements : ELEMENTS.length;
          const linked = counts.linkedElements ?? 0;
          return <span>{els} model elements{counts.totalElements > 0 ? ` · ${linked}/${els} linked to BoQ` : ''} · {counts.totalWirs ?? 0} WIRs · {counts.totalDrawings ?? 0} drawings</span>;
        })()}
      </div>
      <div className="flex items-center gap-4">
        <span>IFC sync {project.lastSync}</span>
        <span>v1.0.0-demo</span>
      </div>
    </footer>
  );
}

