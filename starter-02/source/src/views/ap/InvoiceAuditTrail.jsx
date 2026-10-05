// ============================================================
// InvoiceAuditTrail — the supplier-invoice lifecycle as a RESPONSIBILITY
// timeline: each step shows the role accountable for it (mapped to
// ROLE_PERMISSION_MATRIX.md) and its current state, derived from the invoice's
// status. Actor name + timestamp are intentionally left as placeholders: they
// go live the moment an append-only audit-event store exists (see
// docs/ERP_AUDIT_INTEGRATION.md). Presentation only — reads the invoice, writes
// nothing, no engine/RLS/schema.
// ============================================================
import { Check, Clock, CircleDot, AlertTriangle, History, UserRound } from 'lucide-react';
import { Modal } from '../../components/Modal.jsx';
import { COL } from '../../lib/theme.js';

// The fixed lifecycle of a supplier invoice. `role` is the accountable party per
// the permission matrix; `data` names the audit fields that will populate the
// actor/timestamp once the audit_events table is live.
const LIFECYCLE = [
  { key: 'received', label: 'Invoice received', role: 'Supplier · Commercial', desc: 'Supplier submits the invoice and its documents via the portal.' },
  { key: 'readiness', label: 'Readiness check', role: 'Commercial', desc: 'PO match, delivery proof and required documents verified.' },
  { key: 'ap_review', label: 'AP review', role: 'AP / Accounting', desc: 'Accounting confirms net, VAT and exception flags.' },
  { key: 'approved', label: 'Approved for payment', role: 'AP lead · Admin', desc: 'Cleared for posting — segregation of duties: approver ≠ raiser.' },
  { key: 'posted', label: 'Posted to ERP', role: 'AP / Admin', desc: 'Batch-exported / posted to the ERP; the ERP reference is recorded.' },
];

// Derive each step's state from the invoice status. 'done' | 'current' |
// 'pending' | 'blocked'. Illustrative until real audit events drive this.
function stepStates(inv) {
  const blocked = inv?.status === 'Blocked' || !!inv?.exceptionNote;
  const inReview = inv?.status === 'In Accounting Review';
  const ready = inv?.status === 'Ready for Accounting';
  return {
    received: 'done',
    readiness: blocked ? 'blocked' : 'done',
    ap_review: blocked ? 'pending' : inReview ? 'current' : 'done',
    approved: blocked || inReview ? 'pending' : ready ? 'current' : 'pending',
    posted: 'pending',
  };
}

const STATE = {
  done: { color: '#16a34a', bg: '#f0fdf4', Icon: Check, label: 'Done' },
  current: { color: COL.accent, bg: COL.accentBg, Icon: CircleDot, label: 'In progress' },
  blocked: { color: '#dc2626', bg: '#fef2f2', Icon: AlertTriangle, label: 'Blocked' },
  pending: { color: COL.textMute, bg: COL.surfaceAlt, Icon: Clock, label: 'Pending' },
};

export function InvoiceAuditTrail({ open, invoice, onClose }) {
  const states = stepStates(invoice || {});

  return (
    <Modal open={open} onClose={onClose} width={560}
      title={invoice ? `Audit trail — ${invoice.id}` : 'Audit trail'}
      subtitle={invoice ? `${invoice.vendorName || ''} · accountability at each step` : ''}
      footer={null}>
      {/* Honest scope banner — responsibility is live; per-actor history pending. */}
      <div className="flex items-start gap-2 text-[11.5px] px-3 py-2 rounded-lg mb-4" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
        <History size={14} className="mt-0.5 flex-shrink-0" />
        <span>Responsibility view — who is accountable at each step (per the role matrix). Actor names and timestamps activate once the append-only audit log is enabled.</span>
      </div>

      <ol className="relative">
        {LIFECYCLE.map((step, i) => {
          const st = STATE[states[step.key]] || STATE.pending;
          const isLast = i === LIFECYCLE.length - 1;
          return (
            <li key={step.key} className="relative flex gap-3 pb-5 last:pb-0">
              {/* connector line */}
              {!isLast && <span className="absolute top-7 bottom-0 w-px" style={{ insetInlineStart: 13, background: COL.border }} />}
              {/* node */}
              <span className="relative z-[1] flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center border-2" style={{ background: st.bg, borderColor: st.color }}>
                <st.Icon size={14} style={{ color: st.color }} />
              </span>
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-semibold" style={{ color: COL.text }}>{step.label}</span>
                  <span className="mono text-[9px] uppercase px-1.5 py-0.5 rounded-full font-bold" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                </div>
                <div className="text-[11.5px] mt-0.5" style={{ color: COL.textDim }}>{step.desc}</div>
                {/* Responsible role + (pending) actor/timestamp */}
                <div className="flex items-center gap-3 mt-1.5 text-[10.5px]" style={{ color: COL.textMute }}>
                  <span className="inline-flex items-center gap-1">
                    <UserRound size={11} />
                    <span className="font-medium" style={{ color: COL.textDim }}>{step.role}</span>
                  </span>
                  <span className="mono">·</span>
                  <span className="italic">actor &amp; time — pending live audit</span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Modal>
  );
}
