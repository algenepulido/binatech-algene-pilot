import { useState, useMemo, useEffect, useCallback } from 'react';
import { StyledSelect } from '../components/StyledSelect.jsx';
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, Clock, CornerUpLeft, Download, Eye, Hourglass, ShieldCheck, XCircle } from 'lucide-react';
import { Btn, KpiCard, PageHeader, StatusPill } from '../components/primitives.jsx';
import { DOC_LABEL, REQUIRED_DOCS, INVOICE_CATEGORIES, categoryForType } from '../data/documents.js';
import { SUPPLIER_INVOICES } from '../data/finance.js';
import { listSupplierInvoices, updateSupplierInvoiceStatus, updateSupplierInvoiceCategory, returnToSupplier, bookInvoice, toCard } from '../api/supplierInvoices.js';
import { listPurchaseOrders } from '../api/purchaseOrders.js';
import { listDeliveries } from '../api/deliveries.js';
import { listWirs } from '../api/wirs.js';
import { invoicePoLinks, invoiceSdnLinks } from '../api/procurementLinks.js';
import { listInvoiceWirLinks } from '../api/invoiceWirLinks.js';
import { computeInvoiceChain } from '../lib/invoiceChain.js';
import { threePillars } from '../lib/invoiceReadiness.js';
import { evaluatePackage } from '../lib/readinessEngine.js';
import { EvidenceChainModal } from './invoices/EvidenceChainModal.jsx';
import { isSampleProject } from '../lib/currentProject.js';
import { tryAction } from '../lib/actionResult.js';
import { exportSheet } from '../lib/excelExport.js';
import { fmt } from '../lib/format.js';
import { COL } from '../lib/theme.js';

// ============================================================
// INVOICE READINESS ENGINE — live once supplier invoices exist; otherwise
// shows clearly-labelled sample data so the screen still demonstrates.
// ============================================================
export function ReadinessView({ t }) {
  const [filter, setFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [live, setLive] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [actionError, setActionError] = useState(null); // last failed write action, shown in a dismissible banner

  const reload = useCallback(() => {
    listSupplierInvoices().then((rows) => { setLive(rows.map(toCard)); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);
  useEffect(() => { reload(); }, [reload]);

  // Procurement evidence chain data (graceful — empty arrays if not provisioned).
  const [proc, setProc] = useState({ pos: [], deliveries: [], wirs: [], poLinks: [], sdnLinks: [], wirLinks: [] });
  const [chainFor, setChainFor] = useState(null); // invoice card whose evidence modal is open
  const loadProc = useCallback(() => {
    Promise.all([
      listPurchaseOrders().catch(() => []), listDeliveries().catch(() => []), listWirs().catch(() => []),
      invoicePoLinks.list().catch(() => []), invoiceSdnLinks.list().catch(() => []), listInvoiceWirLinks().catch(() => []),
    ]).then(([pos, deliveries, wirs, poLinks, sdnLinks, wirLinks]) => setProc({ pos, deliveries, wirs, poLinks, sdnLinks, wirLinks })).catch(() => {});
  }, []);
  useEffect(() => { loadProc(); }, [loadProc]);

  const isLive = live.length > 0;
  const sample = isSampleProject();
  const invoices = isLive ? live : (sample ? SUPPLIER_INVOICES : []);

  // Shared readiness engine per invoice (canonical state, approvals, discrepancy,
  // returned, next owner, days waiting). Reuses the evidence chain + three pillars.
  const AGED_DAYS = 14;
  const evalFor = useCallback((si) => evaluatePackage(si, computeInvoiceChain(si, proc)), [proc]);
  const isMissingProof = (e) => !e.proof.ok && e.state !== 'booked' && e.state !== 'returned';
  const isAged = (e) => e.daysWaiting >= AGED_DAYS && e.state !== 'booked';

  const stateCounts = useMemo(() => {
    const c = { ready: 0, missingProof: 0, pendingApproval: 0, discrepancy: 0, returned: 0, aged: 0 };
    invoices.forEach((si) => {
      const e = evalFor(si);
      if (e.state === 'ready_for_accounting') c.ready++;
      if (e.state === 'pending_approval') c.pendingApproval++;
      if (e.state === 'returned') c.returned++;
      if (e.discrepancy.present) c.discrepancy++;
      if (isMissingProof(e)) c.missingProof++;
      if (isAged(e)) c.aged++;
    });
    return c;
  }, [invoices, evalFor]);

  // Persist an invoice's category (live invoices only; sample data isn't stored).
  const setCategory = useCallback((si, category) => {
    if (!si.rowId) return;
    updateSupplierInvoiceCategory(si.rowId, category).then(reload).catch(() => {});
  }, [reload]);

  const filtered = invoices.filter((si) => {
    if (typeFilter !== 'all' && si.type !== typeFilter) return false;
    if (filter === 'all') return true;
    const e = evalFor(si);
    switch (filter) {
      case 'ready': return e.state === 'ready_for_accounting';
      case 'missing_proof': return isMissingProof(e);
      case 'pending_approval': return e.state === 'pending_approval';
      case 'discrepancy': return e.discrepancy.present;
      case 'returned': return e.state === 'returned';
      case 'aged': return isAged(e);
      default: return true;
    }
  });

  // Write actions surface failures (previously `.catch(() => {})` made a failed
  // write look like a dead button — nothing changed, no message).
  async function runWrite(label, fn) {
    const r = await tryAction(fn);
    setActionError(r.ok ? null : `${label} failed: ${r.error}`);
    if (r.ok) reload();
  }
  async function routeToAp(si) {
    if (!si.rowId) return;
    await runWrite('Route to AP', () => updateSupplierInvoiceStatus(si.rowId, 'In Accounting Review'));
  }
  async function resolve(si) {
    if (!si.rowId) return;
    await runWrite('Resolve', () => updateSupplierInvoiceStatus(si.rowId, 'Pending Docs'));
  }
  // Return a package to the supplier with written comments + required correction.
  async function returnPkg(si) {
    if (!si.rowId) return;
    const reason = window.prompt('Return to supplier — reason / comments for the supplier:');
    if (reason == null || !reason.trim()) return;
    const correction = window.prompt('Required correction (optional — what the supplier must fix):') || '';
    await runWrite('Return to supplier', () => returnToSupplier(si.rowId, { reason, correction }));
  }
  async function bookPkg(si) {
    if (!si.rowId) return;
    await runWrite('Book', () => bookInvoice(si.rowId));
  }

  function exportXlsx() {
    exportSheet({ fileName: 'Invoice-readiness', title: 'INVOICE READINESS ENGINE', rows: filtered, columns: [
      { label: 'Invoice', key: 'id', width: 16 },
      { label: 'Vendor', key: 'vendorName', width: 24 },
      { label: 'Type', key: 'type', width: 16 },
      { label: 'PO Ref', key: 'poRef', width: 14 },
      { label: 'Net (SAR)', key: 'amount', type: 'money', width: 15, total: true },
      { label: 'VAT (SAR)', key: 'vat', type: 'money', width: 14, total: true },
      { label: 'Status', key: 'status', width: 18 },
      { label: 'Submitted', key: 'submitted', width: 14 },
    ] });
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* The title names the domain. 'Invoice Readiness' alone was read as IPC
          certification readiness — a different workflow on a different screen. */}
      <PageHeader title="Supplier Invoice Readiness"
        subtitle="Accounts-payable screening: checks each SUPPLIER invoice against its required documents and approvals before booking. Not IPC certification — for that, see the Certification Queue."
        actions={<Btn icon={Download} onClick={exportXlsx}>Export</Btn>} />

      {loaded && !isLive && sample && (
        <div className="mx-6 mt-3 text-xs px-3 py-2 rounded border" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>⚠ Sample data shown (sample project). Submit an invoice in the <b>Supplier Portal</b> and it appears here live with its document checks.</div>
      )}
      {loaded && !isLive && !sample && (
        <div className="mx-6 mt-3 text-xs px-3 py-2 rounded border" style={{ background: COL.accentBg, color: COL.accent, borderColor: '#bfdbfe' }}>No supplier invoices yet for this project. Submit one in the <b>Supplier Portal</b> — it will appear here with its document checks. (Needs the supplier-invoices SQL from DESIGN_LOG.)</div>
      )}
      {isLive && (
        <div className="mx-6 mt-3 text-xs px-3 py-2 rounded border flex items-center gap-1.5" style={{ background: '#f0fdf4', color: '#15803d', borderColor: '#bbf7d0' }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#16a34a' }} /> Live — {live.length} invoice{live.length === 1 ? '' : 's'} from the Supplier Portal.</div>
      )}
      {actionError && (
        <div className="mx-6 mt-3 text-xs px-3 py-2 rounded border flex items-center gap-2" style={{ background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' }}>
          <XCircle size={13} className="flex-shrink-0" />
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)} className="font-semibold underline">Dismiss</button>
        </div>
      )}

      <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 border-b" style={{ borderColor: COL.border, background: COL.surface }}>
        <KpiCard label="Ready for AP" value={stateCounts.ready} accent="#15803d" icon={ShieldCheck} hint="All three pillars + approvals complete, no discrepancy" />
        <KpiCard label="Blocked · missing proof" value={stateCounts.missingProof} accent="#b45309" icon={Hourglass} hint="Awaiting the category's proof-of-completion document" />
        <KpiCard label="Blocked · missing approval" value={stateCounts.pendingApproval} accent={COL.accent} icon={Clock} hint="Docs complete, awaiting approval" />
        <KpiCard label="Discrepancy" value={stateCounts.discrepancy} accent="#b91c1c" icon={AlertCircle} hint="3-way qty mismatch (over/short)" />
        <KpiCard label="Returned to supplier" value={stateCounts.returned} accent="#9333ea" icon={CornerUpLeft} hint="Sent back with comments, awaiting resubmission" />
        <KpiCard label={`Aged · ${AGED_DAYS}d+`} value={stateCounts.aged} accent="#dc2626" icon={AlertTriangle} hint="Waiting longer than the aging threshold" />
      </div>

      <div className="px-6 py-3 border-b flex items-center gap-2 flex-wrap" style={{ borderColor: COL.border, background: COL.surface }}>
        <span className="mono text-[10px] tracking-widest" style={{ color: COL.textDim }}>FILTER:</span>
        {[['all', 'All'], ['ready', 'Ready'], ['missing_proof', 'Missing proof'], ['pending_approval', 'Missing approval'], ['discrepancy', 'Discrepancy'], ['returned', 'Returned'], ['aged', 'Aged']].map(([f, l]) => (
          <button key={f} onClick={() => setFilter(f)} className="px-3 py-1 text-xs rounded border" style={{ background: filter === f ? COL.accent : COL.surface, color: filter === f ? '#ffffff' : COL.text, borderColor: filter === f ? COL.accent : COL.border }}>{l}</button>
        ))}
        <span className="mono text-[10px] tracking-widest ml-4" style={{ color: COL.textDim }}>TYPE:</span>
        {[['all', 'All'], ['permanent', 'Permanent'], ['non-permanent', 'Non-Perm'], ['subcontract', 'Subcontract'], ['service', 'Service'], ['equipment', 'Equipment'], ['vehicle', 'Vehicle']].map(([f, l]) => (
          <button key={f} onClick={() => setTypeFilter(f)} className="px-3 py-1 text-xs rounded border" style={{ background: typeFilter === f ? COL.accent : COL.surface, color: typeFilter === f ? '#ffffff' : COL.text, borderColor: typeFilter === f ? COL.accent : COL.border }}>{l}</button>
        ))}
        <div className="mono text-[10px] ml-auto" style={{ color: COL.textDim }}>{filtered.length} invoices</div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar p-6 space-y-3" style={{ background: COL.bg }}>
        {filtered.map((si) => { const chain = computeInvoiceChain(si, proc); return <ReadinessCard key={si.id} si={si} chain={chain} ev={evaluatePackage(si, chain)} onRoute={routeToAp} onResolve={resolve} onReturn={returnPkg} onBook={bookPkg} onLinkEvidence={si.rowId ? () => setChainFor(si) : null} onSetCategory={setCategory} />; })}
        {filtered.length === 0 && <div className="text-center py-12 text-sm" style={{ color: COL.textMute }}>No invoices match this filter</div>}
      </div>

      <EvidenceChainModal open={!!chainFor} invoice={chainFor} pos={proc.pos} deliveries={proc.deliveries} wirs={proc.wirs}
        onClose={() => setChainFor(null)} onChanged={loadProc} />
    </div>
  );
}

function ChainChip({ label, state, note }) {
  const C = { ok: ['#dcfce7', '#15803d'], warn: ['#fef3c7', '#b45309'], bad: ['#fee2e2', '#991b1b'], muted: [COL.surfaceAlt, COL.textDim] }[state] || [COL.surfaceAlt, COL.textDim];
  const mark = state === 'ok' ? '✓' : state === 'bad' ? '✕' : state === 'warn' ? '!' : '·';
  return <span title={note} className="mono text-[10px] px-2 py-1 rounded font-medium inline-flex items-center gap-1" style={{ background: C[0], color: C[1] }}>{mark} {label}</span>;
}

export function ReadinessCard({ si, chain, ev, onRoute, onResolve, onReturn, onBook, onLinkEvidence, onSetCategory }) {
  const required = REQUIRED_DOCS[si.type] || [];
  const pillars = ev || threePillars(si, chain);
  const category = pillars.category;
  const stateMeta = ev?.stateMeta;
  const sc = { bar: stateMeta?.color || '#d97706' };

  return (
    <div className="rounded-lg border-y border-r overflow-hidden" style={{ background: COL.surface, borderColor: COL.border, borderInlineStartWidth: 4, borderInlineStartColor: sc.bar, borderInlineStartStyle: 'solid' }}>
      <div className="px-5 py-4 flex flex-col sm:flex-row items-start gap-5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <div className="mono text-sm font-bold" style={{ color: COL.accent }}>{si.id}</div>
            {stateMeta && <span className="mono text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: stateMeta.bg, color: stateMeta.color }}>{stateMeta.label.toUpperCase()}</span>}
            <StatusPill status={si.status} />
            {si.exceptionNote && <span className="mono text-[9px] px-1.5 py-0.5 rounded font-bold flex items-center gap-1" style={{ background: '#fef3c7', color: '#b45309' }}><AlertTriangle size={9} /> EXCEPTION</span>}
            {pillars.held && <span className="mono text-[9px] px-1.5 py-0.5 rounded font-bold flex items-center gap-1" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fcd34d' }}><Hourglass size={9} /> HELD · PENDING PROOF</span>}
            {pillars.ready && <span className="mono text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: '#dcfce7', color: '#15803d' }}>3 PILLARS ✓</span>}
          </div>
          <div className="text-sm font-semibold mb-0.5">{si.vendorName}</div>
          <div className="flex items-center gap-3 mono text-[10px] mb-3 flex-wrap" style={{ color: COL.textDim }}>
            <div className="min-w-[120px]"><StyledSelect ariaLabel="Invoice category" value={category} onChange={(v) => onSetCategory?.(si, v)} disabled={!si.rowId} title={si.rowId ? 'Set invoice category' : 'Category (sample data — not saved)'} options={INVOICE_CATEGORIES.map((c) => ({ value: c, label: c }))} /></div>
            <span>·</span>
            <span>{si.poRef || 'NO PO REF'}</span>
            <span>·</span>
            <span>Submitted {si.submitted}</span>
            <span>·</span>
            <span>Age {si.ageDays}d</span>
            {si.approver && <><span>·</span><span style={{ color: '#d97706' }}>Awaiting: {si.approver}</span></>}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mono text-[10px] tracking-widest" style={{ color: COL.textDim }}>REQUIRED:</span>
            {required.map((d) => {
              const present = si.docs?.[d];
              return (
                <span key={d} className="mono text-[10px] px-2 py-1 rounded font-medium inline-flex items-center gap-1" style={{ background: present ? '#dcfce7' : '#fee2e2', color: present ? '#15803d' : '#991b1b' }}>
                  {present ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                  {DOC_LABEL[d]}
                </span>
              );
            })}
          </div>

          {chain && (
            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              <span className="mono text-[10px] tracking-widest" style={{ color: COL.textDim }}>CHAIN:</span>
              <ChainChip label="PO" state={chain.po.ok ? 'ok' : 'bad'} note={chain.po.note} />
              <ChainChip label="Delivery" state={chain.delivery.ok ? 'ok' : chain.delivery.linked ? 'warn' : 'bad'} note={chain.delivery.note} />
              <ChainChip label="Work (WIR)" state={chain.work.ok ? 'ok' : chain.work.linked ? 'warn' : 'bad'} note={chain.work.note} />
              <ChainChip label={`Qty ${chain.qty.state === 'ok' ? '✓' : chain.qty.state === 'unverified' ? '?' : '⚠'}`} state={chain.qty.state === 'ok' ? 'ok' : chain.qty.state === 'unverified' ? 'muted' : 'warn'} note={chain.qty.msg} />
              {onLinkEvidence && <button type="button" onClick={onLinkEvidence} className="text-[11px] font-semibold ms-1 hover:underline" style={{ color: COL.accent }}>Link evidence</button>}
              {!chain.ready && chain.missing.length > 0 && <span className="text-[10.5px]" style={{ color: '#b45309' }}>· Missing: {chain.missing.join(', ')}</span>}
              {chain.ready && <span className="text-[10.5px] font-medium" style={{ color: '#15803d' }}>· Evidence complete</span>}
            </div>
          )}

          {/* Category-aware three-pillar readiness: Commitment + Proof + Invoice */}
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            <span className="mono text-[10px] tracking-widest" style={{ color: COL.textDim }}>PILLARS · {(category || '').toUpperCase()}:</span>
            <ChainChip label={`Commitment: ${pillars.commitment.label}`} state={pillars.commitment.ok ? 'ok' : 'bad'} note={pillars.commitment.detail} />
            <ChainChip label={`Proof: ${pillars.proof.label}`} state={pillars.proof.ok ? 'ok' : pillars.held ? 'warn' : 'bad'} note={pillars.proof.detail} />
            <ChainChip label="Invoice" state={pillars.invoice.ok ? 'ok' : 'bad'} note={pillars.invoice.detail} />
            {pillars.ready ? <span className="text-[10.5px] font-medium" style={{ color: '#15803d' }}>· Ready — three pillars complete</span>
              : pillars.held ? <span className="text-[10.5px] font-medium" style={{ color: '#b45309' }}>· Held — awaiting {pillars.proof.label}</span>
              : <span className="text-[10.5px]" style={{ color: '#991b1b' }}>· Not ready — missing: {pillars.missing.join(', ')}</span>}
            {/* Materials: surface the full PO↔DN↔Invoice three-way match (flag, never block) */}
            {chain && category === 'Materials' && (
              chain.qty.state === 'over'
                ? <span className="text-[10.5px] font-semibold" style={{ color: '#991b1b' }}>· ⚠ 3-way match: {chain.qty.msg}</span>
                : chain.qty.state === 'short'
                ? <span className="text-[10.5px] font-medium" style={{ color: '#b45309' }}>· ⚠ 3-way match: {chain.qty.msg}</span>
                : chain.qty.state === 'unverified'
                ? <span className="text-[10.5px]" style={{ color: COL.textDim }}>· 3-way match: {chain.qty.msg}</span>
                : <span className="text-[10.5px] font-medium" style={{ color: '#15803d' }}>· 3-way match ✓</span>
            )}
            {chain && category !== 'Materials' && chain.qty.state === 'over' && <span className="text-[10.5px] font-semibold" style={{ color: '#991b1b' }}>· ⚠ {chain.qty.msg}</span>}
          </div>

          {/* Workflow: approvals + discrepancy + next owner + days waiting (from the shared engine) */}
          {ev && (
            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              <span className="mono text-[10px] tracking-widest" style={{ color: COL.textDim }}>WORKFLOW:</span>
              <ChainChip label={`Approvals ${ev.approvals.complete ? '✓' : 'pending'}`} state={ev.approvals.complete ? 'ok' : 'warn'} note={ev.approvals.detail} />
              {ev.discrepancy.present && <ChainChip label={`Discrepancy: ${ev.discrepancy.kind}`} state="bad" note={ev.discrepancy.msg} />}
              <span className="text-[10.5px]" style={{ color: COL.textDim }}>· Next: <b style={{ color: COL.text }}>{ev.nextOwner}</b></span>
              <span className="text-[10.5px] font-medium" style={{ color: ev.daysWaiting >= 14 ? '#b91c1c' : COL.textDim }}>· {ev.daysWaiting}d waiting</span>
            </div>
          )}

          {ev?.returned?.is && (
            <div className="mt-3 text-[11px] px-3 py-2 rounded" style={{ background: '#f3e8ff', color: '#6b21a8', border: '1px solid #d8b4fe' }}>
              <span className="font-semibold">Returned to supplier:</span> {ev.returned.reason || '—'}
              {ev.returned.correction && <div className="mt-0.5"><span className="font-semibold">Required correction:</span> {ev.returned.correction}</div>}
              {ev.returned.count > 0 && <div className="mt-0.5" style={{ color: '#7c3aed' }}>Resubmissions so far: {ev.returned.count}</div>}
            </div>
          )}

          {si.exceptionNote && (
            <div className="mt-3 text-[11px] px-3 py-2 rounded" style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fcd34d' }}>
              <span className="font-semibold">Note:</span> {si.exceptionNote}
            </div>
          )}
        </div>

        <div className="flex sm:flex-col items-end gap-2 flex-shrink-0 w-full sm:w-auto justify-between">
          <div>
            <div className="mono text-[9px] tracking-widest text-end" style={{ color: COL.textDim }}>NET (SAR)</div>
            <div className="mono text-lg font-bold text-end" style={{ color: COL.text }}>{fmt(si.amount)}</div>
            <div className="mono text-[10px] text-end" style={{ color: COL.textDim }}>+ VAT {fmt(si.vat)}</div>
          </div>
          {ev?.state === 'ready_for_accounting' && <Btn variant="primary" icon={ArrowRight} onClick={() => onRoute?.(si)}>Route to AP</Btn>}
          {si.rowId && ev?.state === 'ready_for_accounting' && <Btn variant="secondary" icon={CheckCircle2} onClick={() => onBook?.(si)}>Book</Btn>}
          {si.status === 'Blocked' && <Btn variant="secondary" icon={Eye} onClick={() => onResolve?.(si)}>Resolve</Btn>}
          {si.rowId && ev && ev.state !== 'booked' && ev.state !== 'returned' && <Btn variant="secondary" icon={CornerUpLeft} onClick={() => onReturn?.(si)}>Return</Btn>}
        </div>
      </div>
    </div>
  );
}
