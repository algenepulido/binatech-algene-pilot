// ============================================================
// EvidenceChainModal — link a supplier invoice to its supporting procurement
// chain: PO, delivery/SDN, and WIR(s). Bidirectional by nature (the links are
// queryable from either side). Writes go through the graceful link APIs; if a
// link table isn't provisioned the call throws a clear "run the SQL" message.
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { Modal } from '../../components/Modal.jsx';
import { Btn } from '../../components/primitives.jsx';
import { COL } from '../../lib/theme.js';
import { invoicePoLinks, invoiceSdnLinks } from '../../api/procurementLinks.js';
import { listWirsForInvoice, linkInvoiceWir, unlinkInvoiceWir } from '../../api/invoiceWirLinks.js';

function Section({ title, items, linkedIds, labelOf, onToggle }) {
  return (
    <div>
      <div className="mono text-[10px] tracking-widest mb-1.5" style={{ color: COL.textMute }}>{title}</div>
      <div className="rounded-lg border max-h-40 overflow-y-auto scrollbar" style={{ borderColor: COL.border }}>
        {items.length === 0 && <div className="px-3 py-3 text-[12px]" style={{ color: COL.textMute }}>None available for this project.</div>}
        {items.map((it) => {
          const on = linkedIds.has(it.id);
          return (
            <button key={it.id} type="button" onClick={() => onToggle(it.id, on)} className="w-full flex items-center justify-between gap-2 px-3 py-2 text-start border-b last:border-0 hover:bg-stone-50" style={{ borderColor: COL.border, background: on ? COL.accentBg : 'transparent' }}>
              <span className="text-[12.5px] truncate" style={{ color: on ? COL.accent : COL.text }}>{labelOf(it)}</span>
              <span className="text-[11px] font-semibold flex-shrink-0 ms-2" style={{ color: on ? COL.accent : COL.textMute }}>{on ? 'Linked ✓' : 'Link +'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function EvidenceChainModal({ open, invoice, pos = [], deliveries = [], wirs = [], onClose, onChanged }) {
  const invId = invoice?.rowId;
  const [poSet, setPoSet] = useState(new Set());
  const [dnSet, setDnSet] = useState(new Set());
  const [wirSet, setWirSet] = useState(new Set());
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!invId) return;
    try {
      const [p, d, w] = await Promise.all([invoicePoLinks.forA(invId), invoiceSdnLinks.forA(invId), listWirsForInvoice(invId)]);
      setPoSet(new Set(p)); setDnSet(new Set(d)); setWirSet(new Set(w));
    } catch (e) { setErr(e?.message || String(e)); }
  }, [invId]);
  useEffect(() => { if (open) { setErr(''); load(); } }, [open, load]);

  const mkToggle = (api, set, setFn) => async (id, on) => {
    setErr('');
    try {
      if (on) await api.unlink(invId, id); else await api.link(invId, id);
      const n = new Set(set); if (on) n.delete(id); else n.add(id); setFn(n); onChanged?.();
    } catch (e) { setErr(e?.message || String(e)); }
  };
  const toggleWir = async (id, on) => {
    setErr('');
    try {
      if (on) await unlinkInvoiceWir(invId, id); else await linkInvoiceWir(invId, id);
      const n = new Set(wirSet); if (on) n.delete(id); else n.add(id); setWirSet(n); onChanged?.();
    } catch (e) { setErr(e?.message || String(e)); }
  };

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={`Evidence chain · ${invoice?.id || ''}`} subtitle="Link the PO, delivery and inspection that support this invoice" width={560}
      footer={<Btn variant="primary" onClick={onClose}>Done</Btn>}>
      <div className="space-y-4">
        {err && <div className="text-xs px-2 py-1.5 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{err}</div>}
        <Section title="PURCHASE ORDER" items={pos} linkedIds={poSet}
          labelOf={(p) => `${p.po_number || (p.id || '').slice(0, 8)} · ${p.vendor_name || p.description || ''}`}
          onToggle={mkToggle(invoicePoLinks, poSet, setPoSet)} />
        <Section title="DELIVERY / SDN" items={deliveries} linkedIds={dnSet}
          labelOf={(d) => `${d.dn_number || (d.id || '').slice(0, 8)} · ${d.status || ''}`}
          onToggle={mkToggle(invoiceSdnLinks, dnSet, setDnSet)} />
        <Section title="WORK INSPECTION (WIR)" items={wirs} linkedIds={wirSet}
          labelOf={(w) => `${w.wir_number || (w.id || '').slice(0, 8)} · ${w.inspection_type || ''} · ${w.result || ''}`}
          onToggle={toggleWir} />
      </div>
    </Modal>
  );
}
