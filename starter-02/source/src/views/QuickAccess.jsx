// ============================================================
// QuickAccess — the simplified MOBILE home. The phone is for quickly CHECKING
// things (inspections to sign off, open NCRs, approvals, snags), not running the
// full operational app. Big tap cards with live counts route into each module;
// full tools stay available behind the menu. Desktop never sees this.
// ============================================================
import { ClipboardCheck, AlertOctagon, Flag, FileImage, FileText, CheckSquare, LayoutDashboard, Box, ChevronRight } from 'lucide-react';
import { useProject } from '../lib/project.jsx';
import { COL } from '../lib/theme.js';

export function QuickAccess({ counts = {}, onNavigate, onOpenMenu }) {
  const { project } = useProject();
  const approvals = (counts.openWirs || 0) + (counts.openNcrs || 0) + (counts.drawingsPending || 0);

  const cards = [
    { route: 'wirs', icon: ClipboardCheck, label: 'Inspections', sub: 'awaiting sign-off', n: counts.openWirs || 0, color: COL.accent },
    { route: 'approvals', icon: CheckSquare, label: 'Approvals', sub: 'in the queue', n: approvals, color: '#7c3aed' },
    { route: 'ncrs', icon: AlertOctagon, label: 'NCRs', sub: 'open', n: counts.openNcrs || 0, color: '#dc2626' },
    { route: 'snagging', icon: Flag, label: 'Snags', sub: 'open', n: counts.openSnags || 0, color: '#d97706' },
    { route: 'drawings', icon: FileImage, label: 'Drawings', sub: 'under review', n: counts.drawingsPending || 0, color: '#0891b2' },
    { route: 'dms', icon: FileText, label: 'Documents', sub: 'pending review', n: counts.docsPending || 0, color: '#0891b2' },
  ];
  const secondary = [
    { route: 'dashboard', icon: LayoutDashboard, label: 'Full dashboard' },
    { route: 'model', icon: Box, label: '3D model' },
  ];

  return (
    <div className="flex-1 overflow-y-auto scrollbar" style={{ background: COL.bg }}>
      <div className="px-4 pt-5 pb-3">
        <div className="mono text-[10px] tracking-widest" style={{ color: COL.textMute }}>QUICK ACCESS</div>
        <div className="display text-xl font-bold mt-0.5 leading-tight" style={{ color: COL.text }}>{project?.name || 'Project'}</div>
        <div className="text-[12px] mt-0.5" style={{ color: COL.textDim }}>Tap a card to review. Open the menu for full tools.</div>
      </div>

      <div className="px-4 grid grid-cols-2 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <button key={c.route} onClick={() => onNavigate?.(c.route)} className="rounded-2xl border p-4 text-start active:scale-[0.98] transition-transform" style={{ borderColor: COL.border, background: COL.surface }}>
              <div className="flex items-center justify-between mb-2.5">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: COL.accentBg }}><Icon size={18} style={{ color: c.color }} /></span>
                {c.n > 0 && <span className="min-w-6 h-6 px-1.5 rounded-full text-[12px] font-bold flex items-center justify-center text-white" style={{ background: c.color }}>{c.n > 99 ? '99+' : c.n}</span>}
              </div>
              <div className="text-[14px] font-semibold" style={{ color: COL.text }}>{c.label}</div>
              <div className="text-[11px]" style={{ color: c.n > 0 ? COL.textDim : '#16a34a' }}>{c.n > 0 ? `${c.n} ${c.sub}` : 'all clear'}</div>
            </button>
          );
        })}
      </div>

      <div className="px-4 mt-4 grid grid-cols-2 gap-3">
        {secondary.map((c) => {
          const Icon = c.icon;
          return (
            <button key={c.route} onClick={() => onNavigate?.(c.route)} className="rounded-xl border p-3 flex items-center gap-2 active:scale-[0.98]" style={{ borderColor: COL.border, background: COL.surfaceAlt }}>
              <Icon size={16} style={{ color: COL.accent }} /><span className="text-[13px] font-medium" style={{ color: COL.text }}>{c.label}</span>
            </button>
          );
        })}
      </div>

      <button onClick={onOpenMenu} className="mx-4 mt-4 mb-8 w-[calc(100%-2rem)] rounded-xl border p-3 flex items-center justify-between active:scale-[0.99]" style={{ borderColor: COL.border, background: COL.surface }}>
        <span className="text-[13px] font-medium" style={{ color: COL.text }}>All modules & tools</span>
        <ChevronRight size={16} style={{ color: COL.textMute }} />
      </button>
    </div>
  );
}
