// ============================================================
// QualityTabs — consolidates Work Inspection Requests (WIRs) and Quality
// Control (QC) tests behind one "Quality" surface with sub-tabs, so QC is no
// longer a separate top-level nav item. Both the 'wirs' and 'qc' routes stay
// valid (the active tab IS the route), so every existing onNavigate('qc') /
// onNavigate('wirs') call, deep link and the "New QC test" action keep working.
// The underlying WIRsView / QCView are rendered unchanged — pure IA wrapper.
// ============================================================
import { ClipboardCheck, FlaskConical } from 'lucide-react';
import { WIRsView } from './WIRsView.jsx';
import { QCView } from './QCView.jsx';
import { COL } from '../lib/theme.js';

const TABS = [
  { id: 'wirs', label: 'WIRs', icon: ClipboardCheck },
  { id: 'qc', label: 'QC tests', icon: FlaskConical },
];

export function QualityTabs({ tab, setRoute, t, lang, onSelectElement, openWir, onOpenedWir }) {
  const active = tab === 'qc' ? 'qc' : 'wirs';
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-1 px-3 sm:px-4 pt-2 border-b" style={{ borderColor: COL.border, background: COL.surface }}>
        {TABS.map((tb) => {
          const Icon = tb.icon;
          const on = active === tb.id;
          return (
            <button key={tb.id} onClick={() => setRoute(tb.id)}
              className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium rounded-t-lg -mb-px border-b-2 transition-colors"
              style={{ color: on ? COL.accent : COL.textDim, borderColor: on ? COL.accent : 'transparent' }}
              aria-current={on ? 'page' : undefined}>
              <Icon size={14} /> {tb.label}
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-hidden flex flex-col">
        {active === 'wirs'
          ? <WIRsView t={t} lang={lang} onSelectElement={onSelectElement} setRoute={setRoute} openWir={openWir} onOpenedWir={onOpenedWir} />
          : <QCView t={t} onSelectElement={onSelectElement} setRoute={setRoute} />}
      </div>
    </div>
  );
}
