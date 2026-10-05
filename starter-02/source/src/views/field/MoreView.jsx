// ============================================================
// MoreView — frame L of the approved Field Mode Target: "All tasks".
//
// Four bordered task tiles became one surface of rows, and the design deleted
// the not-yet-available group outright: a task that cannot be done is not a
// greyed row, it is absent. Every row here reaches a destination that exists
// in the product today.
//
// §14/02 flags the six verb phrases as proposed rather than canonical — if the
// product already names one of these differently, the label follows that
// finding. The SET and the destinations are the part that is settled.
//
// MOB-UI1: the desktop module-tree drawer no longer exists below 1024, so its
// "All modules & tools" row is gone. Destinations outside this catalogue stay
// reachable on desktop and by their existing deep links.
// ============================================================
import { useState, useMemo } from 'react';
import { Search, Settings as Cog, SlidersHorizontal } from 'lucide-react';
import { FIELD } from '../../lib/fieldTokens.js';
import { Surface, Rule } from './surface.jsx';
import { fieldTaskCatalog } from './fieldTaskCatalog.js';

export function MoreView({ t = {}, lang = 'en', role = 'admin', onNavigate, onCapture, onPersonalise }) {
  const ar = lang === 'ar';
  const [q, setQ] = useState('');

  const tasks = useMemo(() => fieldTaskCatalog({ t, role, onNavigate, onCapture }), [t, role, onNavigate, onCapture]);

  const needle = q.trim().toLowerCase();
  const shown = needle ? tasks.filter((x) => x.label.toLowerCase().includes(needle)) : tasks;

  const Row = ({ icon: Icon, label, go, inset }) => (
    <button onClick={go} className="w-full text-start flex items-center gap-3.5"
      style={{ minHeight: 54, padding: '0 17px', borderRadius: 0, background: 'transparent' }}>
      {Icon && <Icon size={19} className="flex-none" style={{ color: FIELD.ink }} />}
      <span className="flex-1 truncate" style={{ fontSize: 15.5, fontWeight: 500 }}>{label}</span>
    </button>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden" dir={ar ? 'rtl' : 'ltr'} style={{ background: FIELD.page, color: FIELD.ink }}>
      <div className="flex-none" style={{ background: FIELD.surface, padding: '2px 20px 14px' }}>
        <div className="flex items-center" style={{ minHeight: 44 }}>
          <h1 style={{ fontSize: 27, fontWeight: 600, letterSpacing: '-.02em', margin: 0 }}>{t.fmAllTasks || 'All tasks'}</h1>
        </div>
        <div className="flex items-center gap-3" style={{ minHeight: 48, background: 'rgba(22,33,31,.05)', borderRadius: FIELD.rControl, padding: '0 14px', marginTop: 6 }}>
          <Search size={17} className="flex-none" style={{ color: FIELD.faint }} />
          <input data-task-search value={q} onChange={(e) => setQ(e.target.value)}
            aria-label={t.fmSearchTasks || 'Search tasks and records'}
            placeholder={t.fmSearchTasks || 'Search tasks and records'}
            className="flex-1 min-w-0 bg-transparent outline-none"
            /* 16px is the iOS focus-zoom floor — a 15px field zooms the page. */
            style={{ fontSize: 16, minHeight: 48, color: FIELD.ink, borderRadius: FIELD.rControl, border: 0 }} />
        </div>
      </div>
      <div className="flex-none" style={{ height: 1, background: FIELD.hair }} />

      <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ padding: '22px 20px 0' }}>
        <Surface data-tasks="" style={{ marginBottom: 22 }}>
          {shown.map(({ key, ...task }, i) => (
            <div key={key}>
              {i > 0 && <Rule inset={51} />}
              <Row {...task} />
            </div>
          ))}
        </Surface>

        <Surface style={{ marginBottom: 24 }}>
          <Row icon={SlidersHorizontal} label={t.fmPersonalise || 'Personalise quick actions'} go={onPersonalise} />
          <Rule inset={51} />
          <Row icon={Cog} label={t.fmSettings || 'Settings'} go={() => onNavigate?.('settings')} />
        </Surface>
      </div>
    </div>
  );
}
