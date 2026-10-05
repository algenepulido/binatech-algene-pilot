// ============================================================
// NotificationsBell — header bell with a live dropdown of actionable items
// for the current project (open WIRs, NCRs, pending drawings/docs/SDN, snags).
// Clicking an item jumps to that module. Badge = total actionable count.
// ============================================================
import { useState, useRef, useEffect } from 'react';
import { Bell, ClipboardCheck, AlertOctagon, FileImage, FileText, Truck, Flag, CheckCircle2 } from 'lucide-react';
import { COL } from '../lib/theme.js';

export function NotificationsBell({ counts = {}, onNavigate, phone = false }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false); // clicking pins it open; hover alone auto-closes
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setPinned(false); } };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const closeAll = () => { setOpen(false); setPinned(false); };

  const items = [
    { n: counts.openWirs, route: 'wirs', icon: ClipboardCheck, label: 'WIRs awaiting sign-off', color: COL.accent },
    { n: counts.openNcrs, route: 'ncrs', icon: AlertOctagon, label: 'open NCRs', color: '#dc2626' },
    { n: counts.drawingsPending, route: 'drawings', icon: FileImage, label: 'drawings under review', color: '#d97706' },
    { n: counts.docsPending, route: 'dms', icon: FileText, label: 'documents pending review', color: '#d97706' },
    { n: counts.pendingSdn, route: 'receiving', icon: Truck, label: 'deliveries pending SDN', color: '#d97706' },
    { n: counts.openSnags, route: 'snagging', icon: Flag, label: 'open snags', color: '#dc2626' },
  ].filter((x) => (x.n || 0) > 0);
  const total = items.reduce((s, x) => s + (x.n || 0), 0);

  return (
    <div className="relative" ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => { if (!pinned) setOpen(false); }}>
      <button onClick={() => { setPinned((p) => !p); setOpen(true); }} data-phone-shell-control={phone ? '' : undefined} className="w-8 h-8 rounded border flex items-center justify-center relative hover:bg-stone-50 flex-shrink-0" style={{ background: COL.surface, borderColor: COL.borderStrong, ...(phone ? { width: 44, height: 44, minWidth: 44, minHeight: 44 } : {}) }} aria-label="Notifications" title="Notifications (click to pin open)">
        <Bell size={14} style={{ color: COL.text }} />
        {total > 0 && <span className="absolute -top-1 w-4 h-4 rounded-full text-[8px] flex items-center justify-center font-bold text-white" style={{ insetInlineEnd: -4, background: '#dc2626' }}>{total > 99 ? '99+' : total}</span>}
      </button>
      {open && (
        // pt-2 is a transparent "bridge" so moving from the bell to the card
        // doesn't cross a gap (which would trigger mouse-leave and auto-close).
        <div className="absolute z-50 w-72 pt-2" style={{ insetInlineEnd: 0, top: '100%' }}>
          <div className="rounded-xl border shadow-lg py-1.5" style={{ background: COL.surface, borderColor: COL.border }}>
            <div className="px-3 py-1.5 flex items-center justify-between">
              <span className="mono text-[9px] tracking-widest" style={{ color: COL.textMute }}>NOTIFICATIONS</span>
              <span className="mono text-[10px]" style={{ color: COL.textDim }}>{total} action{total === 1 ? '' : 's'}</span>
            </div>
            {items.length === 0 ? (
              <div className="px-3 py-6 text-center"><CheckCircle2 size={22} className="mx-auto mb-2" style={{ color: '#16a34a' }} /><div className="text-[13px]" style={{ color: COL.textDim }}>You're all caught up.</div></div>
            ) : items.map((it) => { const Icon = it.icon; return (
              <button key={it.route} onClick={() => { closeAll(); onNavigate?.(it.route); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-stone-50">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: COL.bg }}><Icon size={14} style={{ color: it.color }} /></span>
                <span className="text-[13px] flex-1" style={{ color: COL.text }}><b>{it.n}</b> {it.label}</span>
                <span className="text-[11px]" style={{ color: COL.accent }}>→</span>
              </button>
            ); })}
          </div>
        </div>
      )}
    </div>
  );
}
