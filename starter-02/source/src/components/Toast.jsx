// ============================================================
// Toast — a small, branded notification system that replaces the browser's
// window.alert(). Two ways in:
//   • imperative singleton: `toast.error('…')` / `toast.success('…')` —
//     works ANYWHERE, including plain (non-React) modules like the exporters.
//   • <ToastViewport /> mounted once at the app root renders the stack.
// Porcelain-styled, RTL-correct (logical properties), auto-dismissing,
// dismissible, portalled above everything. Presentation only.
// ============================================================
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { COL } from '../lib/theme.js';

// ── singleton bus ──────────────────────────────────────────────────────────
const listeners = new Set();
let seq = 0;
function emit(t) { for (const l of listeners) l(t); }
function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export const toast = {
  show: ({ type = 'info', message, duration }) => {
    const text = String(message ?? '').trim();
    if (!text) return;
    emit({ id: ++seq, type, message: text, duration });
  },
  success: (message, opts) => toast.show({ ...opts, type: 'success', message }),
  error: (message, opts) => toast.show({ ...opts, type: 'error', message }),
  info: (message, opts) => toast.show({ ...opts, type: 'info', message }),
};

const STYLE = {
  success: { color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0', Icon: CheckCircle2 },
  error: { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca', Icon: AlertCircle },
  info: { color: COL.accent, bg: COL.accentBg, border: COL.border, Icon: Info },
};

function ToastCard({ item, onClose }) {
  const s = STYLE[item.type] || STYLE.info;
  return (
    <div role="status" aria-live="polite" className="modal-pop flex items-start gap-2.5 rounded-xl border shadow-lg px-3.5 py-3 pointer-events-auto"
      style={{ background: s.bg, borderColor: s.border, color: COL.text, minWidth: 280, maxWidth: 380 }}>
      <s.Icon size={17} style={{ color: s.color, marginTop: 1, flexShrink: 0 }} />
      <div className="flex-1 text-[13px] leading-snug" style={{ color: COL.text }}>{item.message}</div>
      <button onClick={onClose} aria-label="Dismiss" className="flex-shrink-0 p-0.5 rounded hover:bg-black/[0.06]" style={{ color: COL.textMute }}>
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastViewport() {
  const [items, setItems] = useState([]);
  useEffect(() => subscribe((t) => {
    setItems((arr) => [...arr, t]);
    const dur = t.duration ?? (t.type === 'error' ? 6000 : 4000);
    setTimeout(() => setItems((arr) => arr.filter((x) => x.id !== t.id)), dur);
  }), []);
  const dismiss = (id) => setItems((arr) => arr.filter((x) => x.id !== id));
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed z-[100] flex flex-col gap-2 pointer-events-none" style={{ insetInlineEnd: 16, bottom: 16 }}>
      {items.map((item) => <ToastCard key={item.id} item={item} onClose={() => dismiss(item.id)} />)}
    </div>,
    document.body,
  );
}
