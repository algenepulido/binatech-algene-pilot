import { useState, useEffect, useCallback, useRef } from 'react';
import { StyledSelect } from '../components/StyledSelect.jsx';
import { AlertCircle, ArrowUpRight, Building2, Check, CornerUpLeft, Eye, Upload } from 'lucide-react';
import { Btn, MoneyInput, PageHeader, StatusPill } from '../components/primitives.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { SUPPLIER_INVOICES, VENDORS } from '../data/finance.js';
import { listSupplierInvoices, createSupplierInvoice, updateSupplierInvoiceCategory, resubmitInvoice, toCard } from '../api/supplierInvoices.js';
import { listVendors } from '../api/vendors.js';
import { INVOICE_CATEGORIES, CATEGORY_REQUIREMENTS, categoryForType } from '../data/documents.js';
import { evaluatePackage } from '../lib/readinessEngine.js';
import { isSampleProject } from '../lib/currentProject.js';
import { tryAction } from '../lib/actionResult.js';
import { uploadAttachment } from '../lib/attachments.js';
import { fmt } from '../lib/format.js';
import { COL } from '../lib/theme.js';

// Map a category's proof requirement → the doc key + label the readiness engine reads.
const PROOF_DOC = {
  delivery:       { key: 'signedDn',                     label: 'Signed Delivery Note' },
  paymentCert:    { key: 'paymentCert',                  label: 'Approved IPC' },
  serviceApproval:{ key: 'paymentCertOrServiceApproval', label: 'Certificate of Progress' },
  timesheet:      { key: 'timesheet',                    label: 'Approved Timesheet' },
};

// The three-pillar upload tiles required for a given category (commitment + proof + invoice).
function categoryDocs(category) {
  const req = CATEGORY_REQUIREMENTS[category] || CATEGORY_REQUIREMENTS.Materials;
  const proof = PROOF_DOC[req.proofSource] || { key: 'signedDn', label: req.proof };
  return [
    { key: req.commitmentDocKey, label: req.commitment, pillar: 'Commitment' },
    { key: proof.key,            label: proof.label,     pillar: 'Proof' },
    { key: 'supplierInvoice',    label: 'Tax Invoice',   pillar: 'Invoice' },
  ];
}

// A real file picker tile: opens the file dialog, shows the chosen filename,
// and lets the vendor replace/remove it.
function UploadTile({ label, file, onPick }) {
  const ref = useRef(null);
  const on = !!file;
  return (
    <div className="relative">
      <input ref={ref} type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }} />
      <button onClick={() => ref.current?.click()} className="w-full rounded border-2 py-4 px-2 text-xs flex flex-col items-center gap-1 transition" style={{ borderStyle: on ? 'solid' : 'dashed', borderColor: on ? '#16a34a' : COL.borderStrong, background: on ? '#f0fdf4' : COL.surface, color: on ? '#15803d' : COL.textDim }}>
        {on ? <Check size={14} /> : <Upload size={14} />}
        <span className="font-medium">{label}</span>
        {on && <span className="mono text-[9px] truncate max-w-full" title={file.name}>{file.name}</span>}
      </button>
      {on && <button onClick={() => onPick(null)} className="absolute top-1 end-1 text-[10px] px-1 rounded" style={{ color: COL.textMute }} title="Remove">✕</button>}
    </div>
  );
}

// ============================================================
// SUPPLIER / SUBCONTRACTOR PORTAL — submit real invoices; they flow into
// the Invoice Readiness Engine. Falls back to sample submissions if none yet.
// ============================================================
export function SupplierPortalView({ t }) {
  const [vendors, setVendors] = useState([]);
  const [vLoaded, setVLoaded] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState('');
  useEffect(() => {
    listVendors().then((rows) => {
      const mapped = (rows || []).map((v) => ({ id: v.id, name: v.name || v.vendor_code, category: v.category || '—', type: v.type || 'permanent', vatNo: v.vat_no || '—', paymentTerms: v.payment_terms || '—' }));
      // Real vendors when present; demo vendors only on the sample project; otherwise prompt to add vendors.
      const list = mapped.length ? mapped : (isSampleProject() ? VENDORS : []);
      setVendors(list);
      setSelectedVendor((cur) => cur || list[0]?.id || '');
      setVLoaded(true);
    }).catch(() => { setVendors(isSampleProject() ? VENDORS : []); setVLoaded(true); });
  }, []);
  const vendor = vendors.find((v) => v.id === selectedVendor);

  const [poRef, setPoRef] = useState('');
  const [invNo, setInvNo] = useState('');
  const [net, setNet] = useState('');
  const [files, setFiles] = useState({}); // docKey -> File
  const [category, setCategory] = useState('Materials');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [live, setLive] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false); // submissions fetch failed (≠ "no submissions")

  // Default the category from the selected vendor's type whenever it changes.
  useEffect(() => { if (vendor?.type) setCategory(categoryForType(vendor.type)); }, [vendor?.type]);

  const tiles = categoryDocs(category);
  const req = CATEGORY_REQUIREMENTS[category] || CATEGORY_REQUIREMENTS.Materials;
  const missingItems = tiles.filter((d) => !files[d.key]); // category docs not yet attached

  const reload = useCallback(() => {
    listSupplierInvoices()
      .then((rows) => { setLive(rows.map(toCard)); setLoadError(false); setLoaded(true); })
      .catch(() => { setLoadError(true); setLoaded(true); }); // a failed load is not "no submissions"
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const liveForVendor = live.filter((i) => i.vendor === selectedVendor);
  const sampleForVendor = SUPPLIER_INVOICES.filter((si) => si.vendor === selectedVendor);
  const isLive = live.length > 0;
  const vendorInvoices = isLive ? liveForVendor : sampleForVendor;

  function resetForm() { setPoRef(''); setInvNo(''); setNet(''); setFiles({}); }

  async function submit() {
    const amount = Number(net) || 0;
    if (!amount) { setMsg({ kind: 'err', text: 'Enter a net amount.' }); return; }
    setBusy(true); setMsg(null);
    // Which documents were attached (drives the readiness checks).
    const docs = {};
    Object.entries(files).forEach(([k, f]) => { if (f) docs[k] = true; });
    try {
      const created = await createSupplierInvoice({
        vendor_id: vendor.id, vendor_name: vendor.name, inv_type: vendor.type,
        po_ref: poRef, invoice_number: invNo, net_amount: amount, docs,
      });
      // Persist the chosen category (additive, graceful if column not migrated).
      await updateSupplierInvoiceCategory(created.id, category).catch(() => {});
      // Store the actual files against the new invoice (best-effort).
      let fileNote = '';
      const chosen = Object.entries(files).filter(([, f]) => f);
      if (chosen.length) {
        try {
          for (const [, f] of chosen) await uploadAttachment({ recordType: 'supplier_invoice', recordId: created.id, file: f });
        } catch { fileNote = ' (record saved; file storage unavailable)'; }
      }
      const stillMissing = tiles.filter((d) => !files[d.key]);
      const missNote = stillMissing.length ? ` Still missing for ${category}: ${stillMissing.map((d) => d.label).join(', ')}.` : '';
      setMsg({ kind: 'ok', text: `Submitted ${created.si_number} — now visible in Invoice Readiness as “${created.status}”.${fileNote}${missNote}` });
      resetForm();
      reload();
    } catch (e) {
      setMsg({ kind: 'err', text: /relation|does not exist|supplier_invoices/i.test(e?.message || '') ? 'Supplier-invoices table isn’t set up yet — run the SQL in DESIGN_LOG (section C), then submit.' : (e?.message || 'Could not submit.') });
    } finally { setBusy(false); }
  }

  // Supplier resubmits a returned package after correcting it. Success message
  // only on actual success — previously a failed resubmit still showed
  // "Resubmitted ✓" (the error was swallowed), so the supplier believed it went
  // back to the reviewer when nothing changed.
  async function resubmit(si) {
    if (!si.rowId) return;
    const r = await tryAction(() => resubmitInvoice(si.rowId, { count: si.resubmissionCount }));
    if (!r.ok) { setMsg({ kind: 'err', text: `Could not resubmit ${si.id}: ${r.error}` }); return; }
    setMsg({ kind: 'ok', text: `Resubmitted ${si.id} — back with the reviewer.` });
    reload();
  }

  const outstanding = vendorInvoices.filter((i) => i.status !== 'Paid').reduce((s, i) => s + i.amount, 0);

  if (!vendor) {
    return (
      <div className="flex-1 flex flex-col">
        <PageHeader title="Supplier / Subcontractor Portal" subtitle="Submit invoices with their documents — they flow into the Invoice Readiness Engine" />
        <div className="flex-1 flex items-center justify-center">
          {!vLoaded ? <span className="text-sm" style={{ color: COL.textMute }}>Loading vendors…</span> : (
            <EmptyState icon={Building2} title="No suppliers yet"
              description="Suppliers and subcontractors submit their invoices and supporting documents here — each is auto-checked for completeness before it reaches the Invoice Readiness Engine."
              note="Add vendors under POs & Contracts → Vendors, then they can submit invoices here." />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title="Supplier / Subcontractor Portal" subtitle="Submit invoices with their documents — they flow into the Invoice Readiness Engine" actions={<>
        <div className="min-w-[180px]"><StyledSelect ariaLabel="Vendor" value={selectedVendor} onChange={setSelectedVendor} options={vendors.map((v) => ({ value: v.id, label: v.name }))} /></div>
        <Btn variant="primary" icon={Eye}>Preview as Vendor</Btn>
      </>} />

      <div className="flex-1 overflow-y-auto scrollbar p-6" style={{ background: COL.bg }}>
        <div className="max-w-5xl mx-auto space-y-4">
          {/* Vendor banner */}
          <div className="rounded-lg border p-5 flex flex-col sm:flex-row sm:items-center gap-4" style={{ background: COL.surface, borderColor: COL.border }}>
            <div className="w-14 h-14 rounded flex items-center justify-center flex-shrink-0" style={{ background: COL.accentBg }}>
              <Building2 size={24} style={{ color: COL.accent }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="display text-xl font-bold">{vendor.name}</div>
              <div className="flex items-center gap-3 text-xs mt-1 flex-wrap" style={{ color: COL.textDim }}>
                <span>{vendor.id}</span><span>·</span><span>{vendor.category}</span><span>·</span>
                <span className="mono">VAT {vendor.vatNo}</span><span>·</span><span>Payment Terms: {vendor.paymentTerms}</span>
              </div>
            </div>
            <div className="text-end">
              <div className="mono text-[9px] tracking-widest" style={{ color: COL.textDim }}>OUTSTANDING</div>
              <div className="mono text-xl font-bold" style={{ color: COL.accent }}>{fmt(outstanding)} SAR</div>
            </div>
          </div>

          {/* Submit invoice */}
          <div className="rounded-lg border p-5" style={{ background: COL.surface, borderColor: COL.border }}>
            <div className="display text-base font-bold mb-3">Submit New Invoice</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <div className="mono text-[10px] tracking-widest mb-1" style={{ color: COL.textDim }}>CATEGORY</div>
                <StyledSelect ariaLabel="Category" value={category} onChange={setCategory} options={INVOICE_CATEGORIES.map((c) => ({ value: c, label: c }))} />
              </div>
              <div>
                <div className="mono text-[10px] tracking-widest mb-1" style={{ color: COL.textDim }}>{req.commitment.toUpperCase()} REF</div>
                <input value={poRef} onChange={(e) => setPoRef(e.target.value)} className="w-full px-3 py-2 text-sm rounded border outline-none" placeholder={`Link to ${req.commitment}`} style={{ background: COL.bg, borderColor: COL.border }} />
              </div>
              <div>
                <div className="mono text-[10px] tracking-widest mb-1" style={{ color: COL.textDim }}>INVOICE #</div>
                <input value={invNo} onChange={(e) => setInvNo(e.target.value)} className="w-full px-3 py-2 text-sm rounded border outline-none" placeholder="Your invoice number" style={{ background: COL.bg, borderColor: COL.border }} />
              </div>
              <div>
                <div className="mono text-[10px] tracking-widest mb-1" style={{ color: COL.textDim }}>NET AMOUNT (SAR)</div>
                <MoneyInput value={net} onChange={setNet} className="w-full px-3 py-2 text-sm rounded border outline-none mono" placeholder="0.00" style={{ background: COL.bg, borderColor: COL.border, color: COL.text }} />
              </div>
            </div>
            <div className="mono text-[10px] tracking-widest mb-1.5" style={{ color: COL.textDim }}>REQUIRED FOR {category.toUpperCase()} — THREE PILLARS</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
              {tiles.map((d) => (
                <div key={d.key}>
                  <div className="mono text-[9px] tracking-widest mb-1" style={{ color: COL.textMute }}>{d.pillar.toUpperCase()}</div>
                  <UploadTile label={d.label} file={files[d.key]} onPick={(f) => setFiles((p) => ({ ...p, [d.key]: f }))} />
                </div>
              ))}
            </div>
            {missingItems.length > 0 ? (
              <div className="flex items-start gap-2 text-[11px] p-2 rounded" style={{ background: '#fef3c7', color: '#92400e' }}>
                <AlertCircle size={12} className="mt-0.5 flex-shrink-0" /> <span>Still missing before this package is payable: <b>{missingItems.map((d) => d.label).join(', ')}</b>. You can submit now — it will sit in Invoice Readiness as “Missing docs / Held” until complete.</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[11px] p-2 rounded" style={{ background: '#dcfce7', color: '#15803d' }}>
                <Check size={12} /> All three pillars attached for {category}.
              </div>
            )}
            {msg && <div className="mt-3 text-[12px] px-3 py-2 rounded" style={{ background: msg.kind === 'ok' ? '#dcfce7' : '#fee2e2', color: msg.kind === 'ok' ? '#15803d' : '#b91c1c' }}>{msg.text}</div>}
            <div className="mt-3 flex gap-2 justify-end">
              <Btn variant="secondary" onClick={resetForm}>Clear</Btn>
              <Btn variant="primary" icon={ArrowUpRight} onClick={submit}>{busy ? 'Submitting…' : 'Submit Invoice'}</Btn>
            </div>
          </div>

          {/* Submissions */}
          <div className="rounded-lg border" style={{ background: COL.surface, borderColor: COL.border }}>
            <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: COL.border }}>
              <div className="display text-base font-bold">My Submissions</div>
              <span className="mono text-[10px]" style={{ color: COL.textDim }}>{vendorInvoices.length} invoices{loaded && !isLive ? ' · sample' : ''}</span>
            </div>
            {vendorInvoices.length === 0 && (loadError ? (
              <div className="px-5 py-8 text-center text-xs" style={{ color: '#b91c1c' }}>
                Couldn’t load this vendor’s submissions.{' '}
                <button onClick={reload} className="font-semibold underline">Retry</button>
              </div>
            ) : (
              <div className="px-5 py-8 text-center text-xs" style={{ color: COL.textMute }}>No submissions yet for this vendor. Submit one above.</div>
            ))}
            {vendorInvoices.map((si) => { const ev = evaluatePackage(si, null); return (
              <div key={si.id} className="px-5 py-3 border-b last:border-b-0 flex items-start gap-4" style={{ borderColor: COL.border }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="mono text-[11px] font-semibold" style={{ color: COL.accent }}>{si.id}</span>
                    <StatusPill status={si.status} />
                    {ev.stateMeta && <span className="mono text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: ev.stateMeta.bg, color: ev.stateMeta.color }}>{ev.stateMeta.label.toUpperCase()}</span>}
                  </div>
                  <div className="text-[11px]" style={{ color: COL.textDim }}>{si.category || 'Materials'} · {si.poRef || 'No PO ref'} · Submitted {si.submitted} · Age {si.ageDays}d</div>
                  {ev.returned.is && (
                    <div className="mt-1.5 text-[11px] px-3 py-2 rounded" style={{ background: '#f3e8ff', color: '#6b21a8', border: '1px solid #d8b4fe' }}>
                      <span className="font-semibold">Returned to you:</span> {ev.returned.reason || '—'}
                      {ev.returned.correction && <div className="mt-0.5"><span className="font-semibold">Please fix:</span> {ev.returned.correction}</div>}
                    </div>
                  )}
                  {si.exceptionNote && <div className="text-[11px] mt-1" style={{ color: '#dc2626' }}>⚠ {si.exceptionNote}</div>}
                  {si.approver && !ev.returned.is && <div className="text-[11px] mt-0.5" style={{ color: '#d97706' }}>Currently awaiting: {si.approver}</div>}
                </div>
                <div className="text-end flex-shrink-0 flex flex-col items-end gap-1.5">
                  <div className="mono text-sm font-bold">{fmt(si.amount)}</div>
                  <div className="mono text-[10px]" style={{ color: COL.textDim }}>SAR + VAT</div>
                  {ev.returned.is && si.rowId && <Btn variant="primary" icon={CornerUpLeft} onClick={() => resubmit(si)}>Resubmit</Btn>}
                </div>
              </div>
            ); })}
          </div>
        </div>
      </div>
    </div>
  );
}
