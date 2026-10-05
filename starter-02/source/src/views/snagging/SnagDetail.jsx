// ============================================================
// SnagDetailModal — rich snag detail with quick status actions.
// UX: a Drawer, so the snag list stays behind it and Escape works — this was a
// third hand-rolled modal shell (docs/ux/UI-UX-OVERHAUL.md).
// Original note:
// real attachments, linked records, blocking impact, and model link.
// ============================================================
import { useState } from 'react';
import { confirmDialog } from '../../components/ConfirmDialog.jsx';
import { toast } from '../../components/Toast.jsx';
import { AlertOctagon, Box, CheckCircle2, Pencil, ShieldCheck, Trash2 } from 'lucide-react';
import { Btn } from '../../components/primitives.jsx';
import { Attachments } from '../../components/Attachments.jsx';
import { elementByGuid } from '../../components/ElementPicker.jsx';
import { Drawer } from '../../components/Drawer.jsx';
import { SnagFormModal } from './SnagForm.jsx';
import { updateSnag, deleteSnag } from '../../api/snags.js';
import { SNAG_PRIORITY, SNAG_STATUS } from '../../data/quality.js';
import { useAuth } from '../../lib/auth.jsx';
import { certActionConfirm } from '../../lib/actionSafety.js';
import { COL } from '../../lib/theme.js';

export function SnagDetailModal({ open, snag, onClose, onChanged, onSelectElement, setRoute }) {
  const { requireAuth } = useAuth();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!open || !snag) return null;
  if (editing) {
    return <SnagFormModal open initial={snag} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged?.(); }} />;
  }

  const pri = SNAG_PRIORITY[snag.priority] ?? {};
  const st = SNAG_STATUS[snag.status] ?? {};
  const el = elementByGuid(snag.element_guid);

  function setStatus(status, extra = {}) {
    requireAuth(async () => {
      // Protect the two transitions that carry commercial/handover weight:
      // Verify & Close (can unblock payment on a payment-blocking snag) and
      // Escalate to NCR (raises a hard block). Confirm with a reason-bearing
      // dialog; the real gate is backend, this is the UX guard.
      if (status === 'verified' && (snag.blocks_payment || snag.blocks_handover)) {
        const ok = await confirmDialog(certActionConfirm({
          title: `Verify & close ${snag.snag_number}?`,
          message: 'This snag is flagged as blocking. Closing it clears that block for this scope.',
          confirmLabel: 'Verify & close',
        }));
        if (!ok) return;
      } else if (status === 'escalated') {
        const ok = await confirmDialog({
          title: `Escalate ${snag.snag_number} to NCR?`,
          message: 'This raises a formal non-conformance and can block certification for the affected scope.',
          confirmLabel: 'Escalate',
        });
        if (!ok) return;
      }
      setBusy(true);
      try { await updateSnag(snag.id, { status, ...extra }); onChanged?.(); onClose?.(); }
      catch (e) { toast.error(e.message); } finally { setBusy(false); }
    });
  }
  function onDelete() {
    requireAuth(async () => {
      if (!await confirmDialog(`Delete ${snag.snag_number}?`)) return;
      try { await deleteSnag(snag.id); onChanged?.(); onClose?.(); } catch (e) { toast.error(e.message); }
    });
  }
  function viewInModel() { if (!el) return; onSelectElement?.(el.id); setRoute?.('model'); onClose?.(); }

  const Cell = ({ label, children }) => (
    <div><div className="mono text-[9px] tracking-widest mb-1" style={{ color: COL.textDim }}>{label}</div><div className="text-[11px]" style={{ color: COL.text }}>{children || <span style={{ color: COL.textMute }}>—</span>}</div></div>
  );

  return (
    <Drawer open onClose={onClose} title={snag.snag_number} subtitle={snag.title} width={560}>
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold mono uppercase" style={{ color: pri.color, background: pri.bg }}>{pri.label}</span>
          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold mono" style={{ color: st.color, background: st.bg }}>{st.label}</span>
        </div>

        <div className="space-y-5">
          <div>
            <div className="mono text-[9px] tracking-widest mb-1.5" style={{ color: COL.textDim }}>DESCRIPTION</div>
            <div className="text-[12px]" style={{ color: COL.text }}>{snag.description}</div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Cell label="LINKED ELEMENT">
              {snag.element_guid ? (
                <button onClick={viewInModel} disabled={!el} className="mono font-semibold hover:underline disabled:no-underline" style={{ color: el ? COL.accent : COL.textDim }}>{el ? `${el.id} · ${el.name}` : snag.element_guid}</button>
              ) : null}
            </Cell>
            <Cell label="DRAWING REF"><span className="mono">{snag.drawing_ref}</span></Cell>
            <Cell label="ZONE / LEVEL">{[snag.zone, snag.level].filter(Boolean).join(' · ')}</Cell>
            <Cell label="CATEGORY">{snag.category}</Cell>
            <Cell label="RAISED BY">{[snag.raised_by, snag.raised_date].filter(Boolean).join(' · ')}</Cell>
            <Cell label="TARGET CLOSURE">{snag.target_date}</Cell>
            <Cell label="ASSIGNEE">{snag.assignee_co}{snag.assignee ? <><br /><span style={{ color: COL.textDim }}>{snag.assignee}</span></> : null}</Cell>
            <Cell label="VERIFIER">{snag.verifier}</Cell>
          </div>

          {(snag.related_ncr || snag.related_wir || snag.related_doc) && (
            <div>
              <div className="mono text-[9px] tracking-widest mb-2" style={{ color: COL.textDim }}>LINKED RECORDS</div>
              <div className="flex flex-wrap gap-2">
                {snag.related_ncr && <span className="mono text-[10px] px-2 py-1 rounded" style={{ background: '#fecaca', color: '#991b1b' }}>NCR: {snag.related_ncr}</span>}
                {snag.related_wir && <span className="mono text-[10px] px-2 py-1 rounded" style={{ background: '#cffafe', color: '#0c4a6e' }}>WIR: {snag.related_wir}</span>}
                {snag.related_doc && <span className="mono text-[10px] px-2 py-1 rounded" style={{ background: '#ede9fe', color: '#5b21b6' }}>Doc: {snag.related_doc}</span>}
              </div>
            </div>
          )}

          {(snag.blocks_handover || snag.blocks_payment) && (
            <div className="rounded p-3 border-l-4" style={{ background: '#fef2f2', borderColor: '#fecaca', borderLeftColor: '#dc2626' }}>
              <div className="flex items-center gap-2 mb-1"><AlertOctagon size={14} style={{ color: '#991b1b' }} /><span className="font-bold text-[11px]" style={{ color: '#991b1b' }}>BLOCKING IMPACT</span></div>
              <div className="text-[10.5px]" style={{ color: '#991b1b' }}>
                {snag.blocks_payment && <div>· Blocks IPC certification for this scope</div>}
                {snag.blocks_handover && <div>· Blocks sectional handover for {snag.zone}</div>}
              </div>
            </div>
          )}

          <div className="border-t pt-4" style={{ borderColor: COL.border }}>
            <Attachments recordType="snag" recordId={snag.id} />
          </div>

          <div className="flex flex-wrap gap-2 pt-2 border-t" style={{ borderColor: COL.border }}>
            {['open', 'assigned', 'inProgress'].includes(snag.status) && <Btn variant="primary" icon={CheckCircle2} onClick={() => setStatus('rectified')}>Mark Rectified</Btn>}
            {snag.status === 'rectified' && <Btn variant="primary" icon={ShieldCheck} onClick={() => setStatus('verified', { closed_date: new Date().toISOString().slice(0, 10) })}>Verify &amp; Close</Btn>}
            <Btn variant="secondary" icon={AlertOctagon} onClick={() => setStatus('escalated')}>Escalate to NCR</Btn>
            <Btn variant="secondary" icon={Pencil} onClick={() => requireAuth(() => setEditing(true))}>Edit</Btn>
            <Btn variant="ghost" icon={Box} onClick={viewInModel}>View in BIM</Btn>
            <Btn variant="danger" icon={Trash2} onClick={onDelete}>Delete</Btn>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
