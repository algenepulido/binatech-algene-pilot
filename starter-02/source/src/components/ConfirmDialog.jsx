// ============================================================
// confirmDialog — a promise-based replacement for window.confirm(). Call it
// from anywhere and await the boolean:
//   if (!(await confirmDialog('Delete this?'))) return;
// or with options: confirmDialog({ title, message, confirmLabel, danger }).
// A single <ConfirmHost/> mounted at the app root renders the modal and
// resolves the promise. Destructive wording auto-styles the confirm button red.
// Esc / backdrop / Cancel / Close resolve false. Presentation only.
// Keyboard: the dialog takes focus on open — the confirm button for ordinary
// wording, Cancel for destructive wording (never the destructive button) —
// keeps Tab inside itself, owns Escape while it is in front (a Drawer beneath
// stays open), and gives focus back to the control that asked.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal.jsx';
import { COL } from '../lib/theme.js';

let host = null; // the single mounted ConfirmHost's setter

function normalize(opts) {
  return typeof opts === 'string' ? { message: opts } : (opts || {});
}

export function confirmDialog(opts) {
  const o = normalize(opts);
  return new Promise((resolve) => {
    // Fallback to the native dialog if the host isn't mounted (e.g. SSR) so a
    // confirm is never silently skipped.
    if (!host) { resolve(typeof window !== 'undefined' ? window.confirm(o.message || 'Are you sure?') : false); return; }
    host({ ...o, resolve });
  });
}

const btnBase = 'px-4 py-2 rounded-full font-semibold text-[13px] transition-all duration-150 hover:brightness-[1.04] active:scale-[0.97]';

export function ConfirmHost() {
  const [req, setReq] = useState(null);
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  useEffect(() => { host = setReq; return () => { if (host === setReq) host = null; }; }, []);

  const settle = (val) => { const r = req; setReq(null); r?.resolve(val); };
  const danger = req ? (req.danger ?? /\b(delete|remove|revoke|permanently|cannot be undone)\b/i.test(req.message || '')) : false;

  return (
    <Modal
      open={!!req}
      onClose={() => settle(false)}
      title={req?.title || 'Please confirm'}
      width={440}
      manageFocus
      initialFocusRef={danger ? cancelRef : confirmRef}
      footer={req ? (
        <>
          <button ref={cancelRef} type="button" onClick={() => settle(false)} className={btnBase}
            style={{ background: COL.surface, color: COL.text, border: `1px solid ${COL.borderStrong}` }}>
            {req.cancelLabel || 'Cancel'}
          </button>
          <button ref={confirmRef} type="button" onClick={() => settle(true)} className={btnBase}
            style={{ background: danger ? COL.brandDanger : COL.accent, color: '#fff' }}>
            {req.confirmLabel || (danger ? 'Delete' : 'Confirm')}
          </button>
        </>
      ) : null}
    >
      {req && <div className="text-[13.5px] leading-relaxed whitespace-pre-line" style={{ color: COL.text }}>{req.message}</div>}
    </Modal>
  );
}
