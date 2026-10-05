// ============================================================
// InvoiceWirLinks — from an invoice, link the WIR(s) that evidence the billed
// work, and unlink them. Parallel evidence link only; does NOT touch the
// element->BOQ->IPC certification computation.
// ============================================================
import { useEffect, useState, useCallback } from 'react';
import { ClipboardCheck, Plus, X } from 'lucide-react';
import { listWirs } from '../api/wirs.js';
import { listWirsForInvoice, linkInvoiceWir, unlinkInvoiceWir } from '../api/invoiceWirLinks.js';
import { resultLabel } from '../lib/wirStatus.js';
import { useAuth } from '../lib/auth.jsx';
import { COL } from '../lib/theme.js';

export function InvoiceWirLinks({ invoiceId }) {
  const { requireAuth } = useAuth();
  const [wirs, setWirs] = useState([]);
  const [linked, setLinked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');

  const reload = useCallback(() => { if (invoiceId) listWirsForInvoice(invoiceId).then(setLinked).catch(() => setLinked([])); }, [invoiceId]);
  useEffect(() => { listWirs().then(setWirs).catch(() => setWirs([])); reload(); }, [reload]);

  const linkedSet = new Set(linked);
  const linkedWirs = wirs.filter((w) => linkedSet.has(w.id));
  const s = q.trim().toLowerCase();
  const available = wirs.filter((w) => !linkedSet.has(w.id) && (!s || `${w.wir_number} ${w.inspection_type || ''}`.toLowerCase().includes(s)));

  async function add(id) { setBusy(true); setError(''); try { await linkInvoiceWir(invoiceId, id); reload(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function remove(id) { setBusy(true); setError(''); try { await unlinkInvoiceWir(invoiceId, id); reload(); } catch (e) { setError(e.message); } finally { setBusy(false); } }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold flex items-center gap-1.5" style={{ color: COL.text }}><ClipboardCheck size={13} /> Evidence WIRs ({linkedWirs.length})</div>
        <button onClick={() => requireAuth(() => setAdding((a) => !a))} className="text-[11px] px-2 py-0.5 rounded border font-medium" style={{ borderColor: COL.borderStrong, color: COL.accent }}>+ Link WIR</button>
      </div>
      {linkedWirs.length === 0 ? <div className="text-[11px] py-1" style={{ color: COL.textMute }}>No WIRs linked. Link the inspection(s) that prove the work being billed.</div>
        : <div className="flex flex-wrap gap-1.5">{linkedWirs.map((w) => (
          <span key={w.id} className="inline-flex items-center gap-1.5 ps-2 pe-1 py-1 rounded-lg text-[11px]" style={{ background: COL.bg, border: `1px solid ${COL.border}` }}>
            <span className="mono font-semibold" style={{ color: COL.accent }}>{w.wir_number}</span>
            <span style={{ color: COL.textMute }}>{resultLabel(w.result)}</span>
            <button onClick={() => remove(w.id)} disabled={busy} className="w-4 h-4 rounded flex items-center justify-center hover:bg-red-50" style={{ color: '#b91c1c' }} aria-label="Unlink"><X size={11} /></button>
          </span>
        ))}</div>}
      {adding && (
        <div className="mt-2 border rounded-lg" style={{ borderColor: COL.border }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search WIRs…" className="w-full px-2.5 py-1.5 text-[11px] border-b outline-none" style={{ borderColor: COL.border, background: COL.surface }} />
          <div className="max-h-44 overflow-y-auto p-1">
            {available.length === 0 ? <div className="text-[11px] p-2 text-center" style={{ color: COL.textMute }}>No matching WIRs.</div>
              : available.slice(0, 50).map((w) => (
                <button key={w.id} onClick={() => add(w.id)} disabled={busy} className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-stone-50 text-start">
                  <Plus size={12} style={{ color: COL.accent }} className="flex-shrink-0" />
                  <span className="mono text-[11px] font-semibold flex-shrink-0" style={{ color: COL.accent }}>{w.wir_number}</span>
                  <span className="text-[11px] flex-1 truncate" style={{ color: COL.text }}>{w.inspection_type || ''}</span>
                  <span className="mono text-[9px] flex-shrink-0" style={{ color: COL.textMute }}>{resultLabel(w.result)}</span>
                </button>
              ))}
          </div>
        </div>
      )}
      {error && <div className="text-[11px] px-2 py-1 rounded mt-1" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}
    </div>
  );
}
