// ============================================================
// NcrDetailModal — view / edit an NCR, manage attachments, jump to element.
// UX: renders in a right-hand Drawer so the NCR register stays visible behind
// it (docs/ux/UI-UX-OVERHAUL.md). The edit form stays a Modal — it is a form.
// ============================================================
import { useState } from 'react';
import { confirmDialog } from '../../components/ConfirmDialog.jsx';
import { toast } from '../../components/Toast.jsx';
import { Box, Pencil, Trash2 } from 'lucide-react';
import { Drawer } from '../../components/Drawer.jsx';
import { Btn, StatusPill } from '../../components/primitives.jsx';
import { Attachments } from '../../components/Attachments.jsx';
import { elementByGuid } from '../../components/ElementPicker.jsx';
import { NcrFormModal } from './NcrForm.jsx';
import { deleteNcr } from '../../api/ncrs.js';
import { ncrSeverityLabel, ncrStatusLabel } from '../../lib/ncrStatus.js';
import { fmt } from '../../lib/format.js';
import { useAuth } from '../../lib/auth.jsx';
import { COL } from '../../lib/theme.js';

const Row = ({ label, children }) => (
  <div className="flex gap-3 py-1.5 border-b" style={{ borderColor: COL.border }}>
    <div className="text-[11px] w-28 shrink-0" style={{ color: COL.textDim }}>{label}</div>
    <div className="text-xs flex-1" style={{ color: COL.text }}>{children || <span style={{ color: COL.textMute }}>—</span>}</div>
  </div>
);

export function NcrDetailModal({ open, ncr, onClose, onChanged, onSelectElement, setRoute }) {
  const { requireAuth } = useAuth();
  const [editing, setEditing] = useState(false);
  if (!ncr) return null;
  const el = elementByGuid(ncr.element_guid);

  function onDelete() {
    requireAuth(async () => {
      if (!await confirmDialog(`Delete ${ncr.ncr_number}?`)) return;
      try { await deleteNcr(ncr.id); onChanged?.(); onClose?.(); } catch (e) { toast.error(e.message); }
    });
  }
  function openInModel() { if (!el) return; onSelectElement?.(el.id); setRoute?.('model'); onClose?.(); }

  return (
    <>
      <Drawer open={open && !editing} onClose={onClose} title={ncr.ncr_number} subtitle="Non-Conformance Report" width={560}
        footer={<><Btn icon={Trash2} onClick={onDelete}>Delete</Btn><Btn icon={Pencil} variant="primary" onClick={() => requireAuth(() => setEditing(true))}>Edit</Btn></>}>
        <div className="flex items-center gap-2 mb-3">
          <StatusPill status={ncrSeverityLabel(ncr.severity)} size="lg" />
          <StatusPill status={ncrStatusLabel(ncr.status)} size="lg" />
          {ncr.ncr_date && <span className="mono text-[11px]" style={{ color: COL.textDim }}>{ncr.ncr_date}</span>}
          <span className="mono text-xs ml-auto font-bold" style={{ color: ncr.cost_impact > 0 ? '#dc2626' : '#15803d' }}>SAR {fmt(ncr.cost_impact)}</span>
        </div>
        <Row label="Element">
          {ncr.element_guid ? (
            <button onClick={openInModel} disabled={!el} className="mono inline-flex items-center gap-1.5 hover:underline disabled:no-underline" style={{ color: el ? COL.accent : COL.textDim }}>
              <Box size={12} /> {el ? `${el.id} · ${el.name}` : ncr.element_guid}{el && <span className="text-[10px]">(open in model)</span>}
            </button>
          ) : null}
        </Row>
        <Row label="Drawing Ref"><span className="mono text-[11px]">{ncr.drawing_ref}</span></Row>
        <Row label="Raised By">{ncr.raised_by}</Row>
        <Row label="Linked WIR"><span className="mono text-[11px]">{ncr.linked_wir}</span></Row>
        <Row label="Description">{ncr.description}</Row>
        <div className="mt-4 border-t pt-4" style={{ borderColor: COL.border }}>
          <Attachments recordType="ncr" recordId={ncr.id} />
        </div>
      </Drawer>
      <NcrFormModal open={open && editing} initial={ncr} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged?.(); }} />
    </>
  );
}
