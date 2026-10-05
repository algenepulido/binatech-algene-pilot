// ============================================================
// QcDetailModal — view / edit a QC test, manage attachments (lab certs).
// UX: a Drawer, so the QC register stays behind it (docs/ux/UI-UX-OVERHAUL.md).
// The edit form stays a Modal — it is a form, not an inspection.
// ============================================================
import { useState } from 'react';
import { confirmDialog } from '../../components/ConfirmDialog.jsx';
import { toast } from '../../components/Toast.jsx';
import { Box, Pencil, Trash2 } from 'lucide-react';
import { Drawer } from '../../components/Drawer.jsx';
import { Btn, StatusPill } from '../../components/primitives.jsx';
import { Attachments } from '../../components/Attachments.jsx';
import { elementByGuid } from '../../components/ElementPicker.jsx';
import { QcFormModal } from './QcForm.jsx';
import { deleteQcTest } from '../../api/qcTests.js';
import { qcResultLabel } from '../../lib/qcStatus.js';
import { useAuth } from '../../lib/auth.jsx';
import { COL } from '../../lib/theme.js';

const Row = ({ label, children }) => (
  <div className="flex gap-3 py-1.5 border-b" style={{ borderColor: COL.border }}>
    <div className="text-[11px] w-28 shrink-0" style={{ color: COL.textDim }}>{label}</div>
    <div className="text-xs flex-1" style={{ color: COL.text }}>{children || <span style={{ color: COL.textMute }}>—</span>}</div>
  </div>
);

export function QcDetailModal({ open, test, onClose, onChanged, onSelectElement, setRoute }) {
  const { requireAuth } = useAuth();
  const [editing, setEditing] = useState(false);
  if (!test) return null;
  const el = elementByGuid(test.element_guid);

  function onDelete() {
    requireAuth(async () => {
      if (!await confirmDialog(`Delete ${test.qc_number}?`)) return;
      try { await deleteQcTest(test.id); onChanged?.(); onClose?.(); } catch (e) { toast.error(e.message); }
    });
  }
  function openInModel() { if (!el) return; onSelectElement?.(el.id); setRoute?.('model'); onClose?.(); }

  return (
    <>
      <Drawer open={open && !editing} onClose={onClose} title={test.qc_number} subtitle={test.test_name || 'QC test'} width={560}
        footer={<><Btn icon={Trash2} onClick={onDelete}>Delete</Btn><Btn icon={Pencil} variant="primary" onClick={() => requireAuth(() => setEditing(true))}>Edit</Btn></>}>
        <div className="flex items-center gap-2 mb-3">
          <StatusPill status={qcResultLabel(test.result)} size="lg" />
          {test.test_date && <span className="mono text-[11px]" style={{ color: COL.textDim }}>{test.test_date}</span>}
        </div>
        <Row label="Element">
          {test.element_guid ? (
            <button onClick={openInModel} disabled={!el} className="mono inline-flex items-center gap-1.5 hover:underline disabled:no-underline" style={{ color: el ? COL.accent : COL.textDim }}>
              <Box size={12} /> {el ? `${el.id} · ${el.name}` : test.element_guid}{el && <span className="text-[10px]">(open in model)</span>}
            </button>
          ) : null}
        </Row>
        <Row label="Specification"><span className="mono text-[11px]">{test.specification}</span></Row>
        <Row label="Result Value"><span className="mono">{test.result_value}</span></Row>
        <Row label="Lab">{test.lab}</Row>
        <div className="mt-4 border-t pt-4" style={{ borderColor: COL.border }}>
          <Attachments recordType="qc" recordId={test.id} />
        </div>
      </Drawer>
      <QcFormModal open={open && editing} initial={test} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged?.(); }} />
    </>
  );
}
