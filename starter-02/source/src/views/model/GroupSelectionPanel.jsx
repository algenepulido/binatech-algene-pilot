// ============================================================
// GroupSelectionPanel — shown in the detail column when MORE THAN ONE element
// is selected (in the viewport or the left table). Summarises the selection
// (count, shared attributes, existing BoQ/WIR coverage) and offers group actions
// (link to BoQ, create a WIR, select similar, save to a package, clear). It only
// reads element data + count maps passed in; it never writes directly, so it
// can't break linking or the certification chain.
// ============================================================
import { Link2, ClipboardCheck, Sparkles, X, Package } from 'lucide-react';
import { StyledSelect } from '../../components/StyledSelect.jsx';
import { COL } from '../../lib/theme.js';
import { normalizeStorey } from '../../lib/storey.js';
import { sharedAttributes } from '../../lib/similarElements.js';

export function GroupSelectionPanel({ guids = [], elements = [], packages = [], linkCountByGuid = new Map(), wirCountByGuid = new Map(), onClear, onLinkBoq, onCreateWir, onSelectSimilar, onSavePackage }) {
  const set = new Set(guids);
  const els = elements.filter((e) => set.has(e.guid));
  const shared = sharedAttributes(els);
  const linkedCount = els.filter((e) => (linkCountByGuid.get(e.guid) || 0) > 0).length;
  const wirTotal = els.reduce((n, e) => n + (wirCountByGuid.get(e.guid) || 0), 0);
  const pkgName = (id) => { const p = packages.find((x) => x.id === id); return p ? `${p.code ? p.code + ' · ' : ''}${p.name}` : '—'; };
  const Chip = ({ label, value }) => (
    <div className="px-2 py-1 rounded-md text-[10px]" style={{ background: COL.surfaceAlt, color: COL.textDim }}>{label}: <b style={{ color: COL.text }}>{value}</b></div>
  );
  const Action = ({ icon: Icon, label, onClick, primary }) => (
    <button onClick={onClick} className="w-full text-start px-3 py-2 rounded-md border text-[11px] font-semibold inline-flex items-center gap-2"
      style={primary ? { borderColor: COL.accent, color: COL.accent, background: COL.accentBg } : { borderColor: COL.borderStrong, color: COL.text }}>
      <Icon size={13} />{label}
    </button>
  );

  return (
    <div className="flex-1 overflow-y-auto scrollbar p-4 space-y-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="display text-base font-bold" style={{ color: COL.accent }}>{els.length} selected</span>
        <button onClick={onClear} className="ms-auto inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: COL.textDim }}><X size={12} /> Clear</button>
      </div>

      {/* Shared attributes across the whole selection */}
      <div className="flex flex-wrap gap-1.5">
        {shared.type && <Chip label="Type" value={(shared.type || '').replace(/^Ifc/, '')} />}
        {shared.level && <Chip label="Level" value={normalizeStorey(shared.level)} />}
        {shared.package_id && <Chip label="Package" value={pkgName(shared.package_id)} />}
        {shared.material && <Chip label="Material" value={shared.material} />}
        {shared.zone && <Chip label="Zone" value={shared.zone} />}
        {!shared.type && !shared.level && !shared.package_id && !shared.material && !shared.zone && (
          <div className="text-[10px]" style={{ color: COL.textMute }}>Mixed attributes across the selection.</div>
        )}
      </div>

      {/* Existing coverage */}
      <div className="flex items-center gap-3 text-[11px]" style={{ color: COL.textDim }}>
        <span className="inline-flex items-center gap-1"><Link2 size={12} /> {linkedCount}/{els.length} linked to BoQ</span>
        <span className="inline-flex items-center gap-1"><ClipboardCheck size={12} /> {wirTotal} WIR{wirTotal === 1 ? '' : 's'}</span>
      </div>

      {/* Group actions */}
      <div className="grid grid-cols-1 gap-1.5 pt-1">
        <Action icon={Link2} label="Link selected to BoQ" onClick={onLinkBoq} primary />
        <Action icon={ClipboardCheck} label="Create WIR for selected" onClick={onCreateWir} />
        <Action icon={Sparkles} label="Select similar" onClick={onSelectSimilar} />
        <div className="flex items-center gap-2 px-1 pt-0.5">
          <Package size={13} style={{ color: COL.textMute }} />
          <span className="text-[10.5px] flex-shrink-0" style={{ color: COL.textDim }}>Save to package:</span>
          <div className="flex-1"><StyledSelect ariaLabel="Assign package" value="" onChange={(v) => { if (v) onSavePackage(v); }}
            options={[{ value: '', label: 'Choose…' }, ...packages.map((p) => ({ value: p.id, label: `${p.code ? `${p.code} · ` : ''}${p.name}` }))]} /></div>
        </div>
      </div>
    </div>
  );
}
