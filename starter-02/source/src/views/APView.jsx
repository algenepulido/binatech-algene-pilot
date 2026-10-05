import { useState } from 'react';
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, Download, FileCheck, History, Hourglass, Inbox, X, XCircle } from 'lucide-react';
import { Btn, KpiCard, PageHeader, StatusPill } from '../components/primitives.jsx';
import { DOC_LABEL, REQUIRED_DOCS } from '../data/documents.js';
import { SUPPLIER_INVOICES } from '../data/finance.js';
import { fmt, fmtSAR } from '../lib/format.js';
import { SAFETY_COPY } from '../lib/actionSafety.js';
import { COL } from '../lib/theme.js';
import { InvoiceAuditTrail } from './ap/InvoiceAuditTrail.jsx';

// ============================================================
// AP WORKSPACE
// ============================================================
export function APView({ t }) {
  const inbox = SUPPLIER_INVOICES.filter(si => si.status === 'Ready for Accounting' || si.status === 'In Accounting Review');
  const blocked = SUPPLIER_INVOICES.filter(si => si.status === 'Blocked' || si.exceptionNote);
  const [selected, setSelected] = useState(inbox[0] || null);
  const [auditOpen, setAuditOpen] = useState(false);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* No live ERP link exists — the primary was "Post Batch to ERP", which
          claims an integration we don't have. Honest label: it exports a batch
          for the finance team to post into their ERP manually. */}
      <PageHeader title="AP Workspace" subtitle="Inbox for accounting / finance team. Routes only readiness-cleared invoices." actions={<><Btn icon={Download} variant="primary">Export batch for ERP</Btn></>} />
      <div className="mx-6 mt-3 text-xs px-3 py-2 rounded border" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>⚠ Sample figures — this screen needs <b>supplier-invoice records</b>, which the app doesn't capture yet. Numbers below are illustrative, not live.</div>

      {/* Ink "balance" hero — the AP inbox at a glance (same treatment as the dashboard) */}
      <div className="mx-6 mt-4 mb-4 rounded-2xl p-5 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${COL.featA}, ${COL.featB})`, color: '#ffffff', boxShadow: '0 16px 40px -18px rgba(30,64,175,0.55)' }}>
        <div aria-hidden className="absolute pointer-events-none" style={{ top: '-60%', right: '-8%', width: 420, height: 340, background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.14), transparent 65%)' }} />
        <div className="relative flex flex-wrap items-end gap-x-10 gap-y-3">
          <div>
            <div className="text-[11px] font-medium inline-flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.65)' }}><Inbox size={12} /> In AP inbox · {inbox.length} invoice{inbox.length === 1 ? '' : 's'}</div>
            <div className="display font-bold tracking-tight leading-none mt-1.5" style={{ fontSize: 'clamp(26px,3vw,34px)' }}>{fmtSAR(inbox.reduce((s, i) => s + i.amount, 0))}</div>
          </div>
          <div className="pb-0.5">
            <div className="text-[11px] font-medium inline-flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.65)' }}><AlertCircle size={12} /> Blocked / exception</div>
            <div className="display text-[20px] font-bold tracking-tight leading-none mt-1.5" style={{ color: blocked.length > 0 ? '#fca5a5' : '#ffffff' }}>{blocked.length}</div>
          </div>
          <div className="pb-0.5">
            <div className="text-[11px] font-medium inline-flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.65)' }}><Hourglass size={12} /> Avg age in inbox</div>
            <div className="display text-[20px] font-bold tracking-tight leading-none mt-1.5" style={{ color: COL.featGold }}>2.4 days</div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto scrollbar">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 mono text-[10px] uppercase tracking-wider" style={{ background: COL.surfaceAlt, color: COL.textDim }}>
              <tr style={{ borderBottom: `1px solid ${COL.borderStrong}` }}>
                <th className="px-4 py-2 text-left border-e" style={{ borderColor: COL.border }}>Invoice #</th>
                <th className="px-4 py-2 text-left border-e" style={{ borderColor: COL.border }}>Vendor</th>
                <th className="px-4 py-2 text-left border-e" style={{ borderColor: COL.border }}>Type</th>
                <th className="px-4 py-2 text-left border-e" style={{ borderColor: COL.border }}>PO Ref</th>
                <th className="px-4 py-2 text-right border-e" style={{ borderColor: COL.border }}>Net (SAR)</th>
                <th className="px-4 py-2 text-right border-e" style={{ borderColor: COL.border }}>VAT (SAR)</th>
                <th className="px-4 py-2 text-left border-e" style={{ borderColor: COL.border }}>Readiness</th>
                <th className="px-4 py-2 text-left border-e" style={{ borderColor: COL.border }}>Flags</th>
                <th className="px-4 py-2 text-right">Age</th>
              </tr>
            </thead>
            <tbody>
              {[...inbox, ...blocked].map((si, ri) => {
                const valueMismatch = si.exceptionNote?.includes('mismatch');
                const dup = SUPPLIER_INVOICES.filter(x => x.vendor === si.vendor && x.amount === si.amount).length > 1;
                return (
                  <tr key={si.id} onClick={() => setSelected(si)} className="border-b hover:bg-blue-50/40 cursor-pointer" style={{ borderColor: COL.border, background: selected?.id === si.id ? COL.accentBg : (ri % 2 === 1 ? 'rgba(0,0,0,0.012)' : 'transparent') }}>
                    <td className="px-4 py-2.5 mono font-semibold" style={{ color: COL.accent }}>{si.id}</td>
                    <td className="px-4 py-2.5 font-medium">{si.vendorName}</td>
                    <td className="px-4 py-2.5 capitalize" style={{ color: COL.textDim }}>{si.type.replace('-', ' ')}</td>
                    <td className="px-4 py-2.5 mono text-[10px]" style={{ color: COL.textDim }}>{si.poRef || '—'}</td>
                    <td className="px-4 py-2.5 mono text-right font-bold">{fmt(si.amount)}</td>
                    <td className="px-4 py-2.5 mono text-right" style={{ color: COL.textDim }}>{fmt(si.vat)}</td>
                    <td className="px-4 py-2.5"><StatusPill status={si.status} /></td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        {valueMismatch && <span className="mono text-[9px] px-1.5 py-0.5 rounded font-bold flex items-center gap-1" style={{ background: '#fee2e2', color: '#991b1b' }} title="Value mismatch"><AlertTriangle size={9} />MIS</span>}
                        {!si.poRef && <span className="mono text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: '#fef3c7', color: '#b45309' }}>NO PO</span>}
                        {dup && <span className="mono text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: '#fef3c7', color: '#b45309' }}>DUP?</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 mono text-right" style={{ color: si.ageDays > 7 ? '#dc2626' : COL.textDim }}>{si.ageDays}d</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {selected && (
          <aside className="fixed inset-0 z-30 w-full lg:static lg:z-auto lg:w-[400px] border-l flex flex-col lg:flex-shrink-0 overflow-y-auto" style={{ borderColor: COL.border, background: COL.surface }}>
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: COL.border }}>
              <div>
                <div className="mono text-[10px]" style={{ color: COL.textDim }}>AP REVIEW</div>
                <div className="display text-base font-bold mt-1">{selected.id}</div>
                <div className="text-xs mt-0.5" style={{ color: COL.textDim }}>{selected.vendorName}</div>
              </div>
              <button onClick={() => setSelected(null)}><X size={14} /></button>
            </div>
            <div className="p-5 flex-1 overflow-y-auto scrollbar">
              <div className="mono text-[10px] tracking-widest mb-2" style={{ color: COL.textDim }}>READINESS CHECK</div>
              <div className="space-y-1 mb-4">
                {(REQUIRED_DOCS[selected.type] || []).map(d => (
                  <div key={d} className="flex items-center justify-between text-xs py-1 px-2 rounded" style={{ background: selected.docs[d] ? '#f0fdf4' : '#fef2f2' }}>
                    <span style={{ color: COL.text }}>{DOC_LABEL[d]}</span>
                    {selected.docs[d] ? <CheckCircle2 size={14} style={{ color: '#16a34a' }} /> : <XCircle size={14} style={{ color: '#dc2626' }} />}
                  </div>
                ))}
              </div>

              <div className="mono text-[10px] tracking-widest mb-2 mt-4" style={{ color: COL.textDim }}>VALUES</div>
              <div className="space-y-1.5 text-xs mb-4">
                <div className="flex justify-between"><span style={{ color: COL.textDim }}>Net Amount</span><span className="mono font-semibold">SAR {fmt(selected.amount)}</span></div>
                <div className="flex justify-between"><span style={{ color: COL.textDim }}>VAT (15%)</span><span className="mono">SAR {fmt(selected.vat)}</span></div>
                <div className="flex justify-between pt-1.5 border-t" style={{ borderColor: COL.border }}><span className="font-semibold" style={{ color: COL.textDim }}>Gross</span><span className="mono font-bold" style={{ color: COL.accent }}>SAR {fmt(selected.amount + selected.vat)}</span></div>
              </div>

              {selected.exceptionNote && (
                <div className="rounded p-3 mb-4 border-l-4" style={{ background: '#fffbeb', borderColor: '#fcd34d' }}>
                  <div className="mono text-[10px] tracking-widest mb-1" style={{ color: '#92400e' }}>EXCEPTION FLAG</div>
                  <div className="text-[11px]" style={{ color: '#78350f' }}>{selected.exceptionNote}</div>
                </div>
              )}

              <div className="space-y-2">
                {/* Money-moving ERP actions are DISABLED until server-side
                    enforcement exists — they post supplier payment to the ERP.
                    Never render as a live, casual primary button. */}
                {selected.status === 'Ready for Accounting' && <Btn variant="secondary" icon={ArrowRight} size="md" disabled>Post to ERP</Btn>}
                {selected.status === 'In Accounting Review' && <Btn variant="secondary" icon={CheckCircle2} size="md" disabled>Mark as Posted</Btn>}
                {selected.status === 'Blocked' && <Btn variant="secondary" icon={ArrowRight} size="md" disabled>Send Back to Procurement</Btn>}
                {['Ready for Accounting', 'In Accounting Review', 'Blocked'].includes(selected.status) && (
                  <div className="text-[10.5px] leading-snug px-1" style={{ color: COL.textMute }}>{SAFETY_COPY.backendRequired}</div>
                )}
                <Btn variant="secondary" icon={History} size="md" onClick={() => setAuditOpen(true)}>View Audit Trail</Btn>
              </div>
            </div>
          </aside>
        )}
      </div>

      <InvoiceAuditTrail open={auditOpen} invoice={selected} onClose={() => setAuditOpen(false)} />
    </div>
  );
}

