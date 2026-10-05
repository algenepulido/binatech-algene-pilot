import { useState, useEffect, useCallback, useMemo } from 'react';
import { confirmDialog } from '../components/ConfirmDialog.jsx';
import { toast } from '../components/Toast.jsx';
import { isExcelLoadError } from '../lib/loadExcel.js';
import { Download, FileSpreadsheet, Pencil, Plus, Printer, RotateCcw, Trash2, X, Receipt, ShieldCheck, AlertOctagon } from 'lucide-react';
import { Btn, PageHeader, StatusPill, KpiCard } from '../components/primitives.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { Attachments } from '../components/Attachments.jsx';
import { IpcFormModal } from './ipcs/IpcForm.jsx';
import { listInvoices } from '../api/invoices.js';
import { listIpcs, deleteIpc } from '../api/ipcs.js';
import { listBoqItems } from '../api/boqItems.js';
import { listAllLinks } from '../api/elementBoqLinks.js';
import { loadElementStatusMap } from '../lib/elementStatus.js';
import { buildLinksByBoq, lineReadiness, boqWaterfall } from '../lib/boqReadiness.js';
import { getProject } from '../api/projects.js';
import { getCurrentProjectId, isSampleProject } from '../lib/currentProject.js';
import { ipcStatusLabel } from '../lib/ipcStatus.js';
import { paidDateForDisplay, normalizeIpcNumber, normalizeIpcPeriod } from '../lib/ipcDisplay.js';
import { exportIpcWorkbook } from '../lib/ipcExport.js';
import { printIpcCertificate, buildIpcCertificateHtml } from '../lib/ipcPdf.js';
import { Modal } from '../components/Modal.jsx';
import { fmt, fmtMoney, fmtSAR } from '../lib/format.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';
import { usePermissions } from '../lib/usePermissions.jsx';
import { COL } from '../lib/theme.js';
import { exportSheet } from '../lib/excelExport.js';

// ============================================================
// IPCs VIEW — real CRUD backed by Supabase (same template as WIRs).
// ============================================================
export function IPCsView({ t, lang = 'en' }) {
  const { requireAuth } = useAuth();
  const { can } = usePermissions();
  const canCompose = can('ipc.compose');
  // Demo-only sales banner (sales talking-point, not a product surface). Session-
  // only dismiss — state resets on reload so it reappears next visit. Sample
  // villa = the demo project; never shown on real projects.
  const [demoBannerOpen, setDemoBannerOpen] = useState(true);
  const showDemoBanner = isSampleProject() && demoBannerOpen;
  const [ipcs, setIpcs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null); // ipc being edited, or null

  // BoQ readiness, so the IPC screen can show what's certifiable / blocked and
  // compose a certificate from approved value (read-only).
  // Downstream billing. The ONLY link the schema provides is invoices.ipc_ref,
  // a TEXT column matched by certificate number — there is no foreign key from
  // an invoice to an IPC. Surfaced as the soft match it is, never as provenance.
  const [invoices, setInvoices] = useState([]);
  const [boqItems, setBoqItems] = useState([]);
  const [allLinks, setAllLinks] = useState([]);
  const [statusMap, setStatusMap] = useState({});

  useEffect(() => { listInvoices().then(setInvoices).catch(() => setInvoices([])); }, []);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setIpcs([]); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      setIpcs(await listIpcs());
      listBoqItems().then(setBoqItems).catch(() => setBoqItems([]));
      listAllLinks().then(setAllLinks).catch(() => setAllLinks([]));
      loadElementStatusMap().then(setStatusMap).catch(() => setStatusMap({}));
    }
    catch (err) { setError(err?.message ?? String(err)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const linksByBoq = useMemo(() => buildLinksByBoq(allLinks, boqItems), [allLinks, boqItems]);
  const waterfall = useMemo(() => boqWaterfall(boqItems, linksByBoq, statusMap), [boqItems, linksByBoq, statusMap]);
  // Lines that compose / are excluded from a certificate, with their readiness.
  const composition = useMemo(() => {
    const certifiable = [], blocked = [];
    for (const b of boqItems) {
      const r = lineReadiness(b, linksByBoq, statusMap);
      if (r.approvedValue > 0.5) certifiable.push({ b, r });
      if (r.blockedValue > 0.5) blocked.push({ b, r });
    }
    certifiable.sort((x, y) => y.r.approvedValue - x.r.approvedValue);
    blocked.sort((x, y) => y.r.blockedValue - x.r.blockedValue);
    return { certifiable, blocked };
  }, [boqItems, linksByBoq, statusMap]);
  // Cumulative certified to date (from certified/paid IPCs).
  const cumulativeCertified = useMemo(() => ipcs.filter((p) => p.status === 'certified' || p.status === 'paid').reduce((s, p) => s + Number(p.gross_amount || 0), 0), [ipcs]);

  // Per-certificate PREVIOUS and CUMULATIVE, derived only from IPC HEADERS —
  // the one certified position the database can actually prove. Ordered by
  // certification date (falling back to the number) because certificates are a
  // chronological series, not a list. Only certified/paid certificates count
  // toward a position; a draft has not certified anything.
  const positionByIpc = useMemo(() => {
    const counted = ipcs
      .filter((p) => p.status === 'certified' || p.status === 'paid')
      .slice()
      .sort((a, b) => String(a.cert_date || '').localeCompare(String(b.cert_date || ''))
        || String(a.ipc_number || '').localeCompare(String(b.ipc_number || '')));
    const map = {}; let running = 0;
    for (const p of counted) {
      const gross = Number(p.gross_amount || 0);
      map[p.id] = { previous: running, current: gross, cumulative: running + gross };
      running += gross;
    }
    // A draft certifies nothing: its "previous" is the whole certified position
    // to date and its cumulative is unknown until it is certified.
    for (const p of ipcs) if (!map[p.id]) map[p.id] = { previous: running, current: Number(p.gross_amount || 0), cumulative: null };
    return map;
  }, [ipcs]);

  function onDelete(ipc) {
    requireAuth(async () => {
      if (!await confirmDialog(`Delete ${ipc.ipc_number}?`)) return;
      try { await deleteIpc(ipc.id); setSelected(null); load(); }
      catch (err) { setError(err?.message ?? String(err)); }
    });
  }

  // Build the certificate context (project + line rows + first-cert flag) used by
  // BOTH the PDF export and the pre-Excel preview. READ-ONLY: totals come straight
  // off the IPC record (gross/retention/vat/net); line rows come from the same
  // composition (lineReadiness) the panel already shows. Nothing is recomputed.
  const buildCertContext = useCallback(async (ipc) => {
    const project = await getProject(getCurrentProjectId()).catch(() => ({}));
    const lines = composition.certifiable.map(({ b, r }) => ({
      code: b.code, description: b.description, unit: b.unit,
      contractQty: r.contractQty, approvedQty: r.approvedQty, rate: r.rate, approvedValue: r.approvedValue,
    }));
    // First certificate (no prior certified/paid IPC) ⇒ per-line this-period == cumulative.
    const priorCertified = ipcs.filter((p) => (p.status === 'certified' || p.status === 'paid') && p.id !== ipc.id);
    return { ipc, project: project || {}, lines, firstCertificate: priorCertified.length === 0, lang };
  }, [composition, ipcs, lang]);

  // Export a print-ready IPC certificate PDF.
  const [pdfBusy, setPdfBusy] = useState(false);
  async function onExportPdf(ipc) {
    setPdfBusy(true);
    try { printIpcCertificate(await buildCertContext(ipc)); }
    catch (err) { setError(err?.message ?? String(err)); }
    finally { setPdfBusy(false); }
  }

  // Pre-Excel PREVIEW: render the same certificate (same figures as the PDF/Excel)
  // in a modal so the user can review header, line items and gross/retention/VAT/
  // net BEFORE downloading the workbook. The actual export is unchanged.
  const [preview, setPreview] = useState(null); // { ipc, html } | null
  const [previewBusy, setPreviewBusy] = useState(false);
  async function openExcelPreview(ipc) {
    setPreviewBusy(true);
    try {
      const ctx = await buildCertContext(ipc);
      setPreview({ ipc, html: buildIpcCertificateHtml(ctx) });
    } catch (err) {
      setError(err?.message ?? String(err));
    } finally {
      setPreviewBusy(false);
    }
  }

  const [exporting, setExporting] = useState(false);
  async function onExportExcel(ipc) {
    setExporting(true);
    try {
      const [project, boqItems] = await Promise.all([
        getProject(getCurrentProjectId()).catch(() => ({})),
        listBoqItems().catch(() => []),
      ]);
      const prevIpcs = ipcs.filter((p) => p.id !== ipc.id);
      await exportIpcWorkbook({ ipc, project: project || {}, boqItems: boqItems || [], prevIpcs });
    } catch (err) {
      // A failed export must NOT replace the page content with a raw error.
      // Show a friendly toast; a stale-chunk load error is separately handled
      // by the global reload prompt (App.jsx vite:preloadError).
      toast.error(isExcelLoadError(err) ? 'Couldn’t load the Excel exporter. Reload the page and try again.' : (err?.message || 'Could not export this IPC.'));
    } finally {
      setExporting(false);
    }
  }

  // "Export All" — the IPC register as a flat sheet. Same resilient loader, same
  // friendly-failure handling (never a raw module-fetch error).
  async function onExportAll() {
    try {
      await exportSheet({ fileName: 'IPCs', title: 'INTERIM PAYMENT CERTIFICATES', rows: ipcs, columns: [
        { label: 'IPC No', key: 'ipc_number', width: 12 },
        { label: 'Period', key: 'period', width: 14 },
        { label: 'Status', key: 'status', width: 12 },
        { label: 'Gross', key: 'gross_amount', type: 'money', width: 15, total: true },
        { label: 'Retention', key: 'retention', type: 'money', width: 14, total: true },
        { label: 'VAT', key: 'vat', type: 'money', width: 14, total: true },
        { label: 'Net Payable', key: 'net_payable', type: 'money', width: 16, total: true },
        { label: 'Cert Date', key: 'cert_date', width: 12 },
        { label: 'Paid Date', key: 'paid_date', width: 12 },
      ] });
    } catch (err) {
      toast.error(isExcelLoadError(err) ? 'Couldn’t load the Excel exporter. Reload the page and try again.' : (err?.message || 'Could not export.'));
    }
  }

  const rows = [
    ['Gross Value', selected?.gross_amount, COL.text, true],
    ['Less: Retention (10%)', selected ? -selected.retention : 0, '#dc2626'],
    ['Subtotal', selected ? selected.gross_amount - selected.retention : 0, COL.text],
    ['VAT (15%)', selected?.vat, COL.text],
    ['NET PAYABLE', selected?.net_payable, COL.accent, true],
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {showDemoBanner && (
        <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="flex items-start gap-2 px-5 py-2.5 border-b text-[12px] leading-relaxed" style={{ background: '#fef3c7', borderColor: '#fde68a', color: '#92400e' }}>
          <AlertOctagon size={15} className="flex-shrink-0 mt-0.5" />
          <span className="flex-1">
            {lang === 'ar'
              ? 'وضع العرض: يعرض هذا المشروع 717 ألف ريال متعاقد عليها، و306 ألف ريال معتمدة (43% مكتمل). يستغرق اعتماد الـ IPC في المتوسط 28 يوماً ضمن سير العمل اليدوي — أي 411 ألف ريال معطّلة. يربط BIM QC كل عنصر معتمد بتقرير الفحص (WIR) قبل إصدار الـ IPC.'
              : 'Demo mode: This project shows SAR 717K contracted, SAR 306K certified (43% complete). Average IPC approval takes 28 days on manual workflows — that’s SAR 411K held up. BIM QC links every certified element to its WIR before the IPC is generated.'}
          </span>
          <button onClick={() => setDemoBannerOpen(false)} title="Dismiss" className="flex-shrink-0 p-0.5 rounded hover:bg-amber-200" style={{ color: '#92400e' }}><X size={15} /></button>
        </div>
      )}
      <PageHeader
        title={t.ipcs}
        subtitle="Interim Payment Certificates"
        actions={
          <>
            <Btn icon={RotateCcw} onClick={load}>Refresh</Btn>
            <Btn icon={Download} onClick={onExportAll}>Export All</Btn>
            {canCompose && <Btn icon={Plus} variant="primary" onClick={() => requireAuth(() => { setEditing(null); setFormOpen(true); })}>Draft New IPC</Btn>}
          </>
        }
      />

      {!isSupabaseConfigured && (
        <div className="mx-6 mt-3 text-xs px-3 py-2 rounded border" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>
          Supabase isn't configured. Add your keys to <span className="mono">.env</span> and restart the dev server.
        </div>
      )}

      {boqItems.length > 0 && (
        <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-3 gap-3 border-b" style={{ borderColor: COL.border, background: COL.surface }}>
          <KpiCard label="Certifiable this period" value={fmtMoney(waterfall.certifiable)} accent="#15803d" hint="approved value from the BoQ" />
          <KpiCard label="Blocked (deferred)" value={fmtMoney(waterfall.blocked)} accent={waterfall.blocked > 0 ? '#dc2626' : undefined} hint={waterfall.blocked > 0 ? 'held by open NCRs' : 'nothing held by NCRs'} />
          <KpiCard label="Cumulative certified" value={fmtMoney(cumulativeCertified)} accent={COL.accent} hint={`${ipcs.length} certificate${ipcs.length === 1 ? '' : 's'}`} />
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto overflow-x-auto scrollbar">
          {loading ? (
            <div className="text-center text-xs py-10" style={{ color: COL.textMute }}>Loading IPCs…</div>
          ) : error ? (
            <div className="mx-6 my-4 text-xs px-3 py-2 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>
          ) : ipcs.length === 0 ? (
            <EmptyState icon={Receipt} title="No payment certificates yet"
              description="Interim Payment Certificates pull certified value from your BoQ. Generate one each period once work is inspected and certified."
              steps={['Certify work via WIRs', 'Draft an IPC — it pulls billable value', 'Export the certificate workbook']}
              actions={canCompose ? [{ label: 'Draft New IPC', icon: Plus, onClick: () => requireAuth(() => { setEditing(null); setFormOpen(true); }) }] : []} />
          ) : (
            <>
            {/* Mobile: card list — key figures legible, no squished table */}
            <div className="lg:hidden p-3 space-y-2">
              {ipcs.map((ipc) => (
                <button key={ipc.id} onClick={() => setSelected(ipc)} className="w-full text-start rounded-xl border p-3 active:bg-blue-50/50" style={{ borderColor: COL.border, background: COL.surface }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="mono font-semibold text-[13px]" style={{ color: COL.accent }}>{normalizeIpcNumber(ipc.ipc_number)}</span>
                    <StatusPill status={ipcStatusLabel(ipc.status)} />
                  </div>
                  <div className="flex items-end justify-between gap-2 mt-1.5">
                    <div className="text-[11px]" style={{ color: COL.textDim }}>{normalizeIpcPeriod(ipc.period) || '—'} <span className="mono">{ipc.cert_date || ''}</span></div>
                    <div className="text-end">
                      <div className="text-[9px] mono uppercase tracking-wide" style={{ color: COL.textMute }}>Net payable</div>
                      <div className="mono font-bold text-[14px]" style={{ color: COL.accent }}>{fmtSAR(ipc.net_payable)}</div>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-1.5 mono text-[10px]" style={{ color: COL.textDim }}>
                    <span>Gross {fmt(ipc.gross_amount)}</span><span>Ret ({fmt(ipc.retention)})</span><span>VAT +{fmt(ipc.vat)}</span>
                  </div>
                </button>
              ))}
            </div>
            {/* Desktop: full table */}
            <div className="hidden lg:block">
            <table className="w-full text-xs">
              <thead className="sticky top-0 mono" style={{ background: COL.surface, color: COL.textDim }}>
                <tr style={{ borderBottom: `1px solid ${COL.border}` }}>
                  <th className="px-4 py-2.5 text-left">IPC #</th>
                  <th className="px-4 py-2.5 text-left">Period</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                  <th className="px-4 py-2.5 text-right">Gross</th>
                  <th className="px-4 py-2.5 text-right">Retention</th>
                  <th className="px-4 py-2.5 text-right">VAT</th>
                  <th className="px-4 py-2.5 text-right">Net Payable</th>
                  <th className="px-4 py-2.5 text-right" title="Project-level cumulative certified gross, from IPC headers">Cumulative certified</th>
                  <th className="px-4 py-2.5 text-left">Cert Date</th>
                  <th className="px-4 py-2.5 text-left">Paid Date</th>
                </tr>
              </thead>
              <tbody>
                {ipcs.map((ipc) => { const paidDisp = paidDateForDisplay(ipc); return (
                  <tr key={ipc.id} onClick={() => setSelected(ipc)} className="border-b hover:bg-stone-50 cursor-pointer" style={{ borderColor: COL.border, background: selected?.id === ipc.id ? COL.accentBg : 'transparent' }}>
                    <td className="px-4 py-2.5 mono font-semibold" style={{ color: COL.accent }}>{normalizeIpcNumber(ipc.ipc_number)}</td>
                    <td className="px-4 py-2.5">{normalizeIpcPeriod(ipc.period)}</td>
                    <td className="px-4 py-2.5"><StatusPill status={ipcStatusLabel(ipc.status)} /></td>
                    <td className="px-4 py-2.5 mono text-right font-semibold">{fmt(ipc.gross_amount)}</td>
                    <td className="px-4 py-2.5 mono text-right" style={{ color: COL.textDim }}>({fmt(ipc.retention)})</td>
                    <td className="px-4 py-2.5 mono text-right" style={{ color: COL.textDim }}>+{fmt(ipc.vat)}</td>
                    <td className="px-4 py-2.5 mono text-right font-bold" style={{ color: COL.accent }}>{fmt(ipc.net_payable)}</td>
                    <td className="px-4 py-2.5 mono text-right" style={{ color: positionByIpc[ipc.id]?.cumulative == null ? COL.textMute : COL.text }}>
                      {positionByIpc[ipc.id]?.cumulative == null ? '—' : fmt(positionByIpc[ipc.id].cumulative)}
                    </td>
                    <td className="px-4 py-2.5 mono text-[10px]" style={{ color: COL.textDim }}>{ipc.cert_date || '—'}</td>
                    <td className="px-4 py-2.5 mono text-[10px]" style={{ color: paidDisp ? '#16a34a' : COL.textDim }}>{paidDisp || '—'}</td>
                  </tr>
                ); })}
              </tbody>
            </table>
            </div>
            </>
          )}
        </div>

        {selected && (
          <aside className="fixed inset-0 z-30 w-full lg:static lg:z-auto lg:w-[420px] border-l flex flex-col lg:flex-shrink-0" style={{ borderColor: COL.border, background: COL.surface }}>
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: COL.border }}>
              <div>
                <div className="mono text-[10px]" style={{ color: COL.textDim }}>IPC DETAIL</div>
                <div className="display text-base font-bold mt-1">{normalizeIpcNumber(selected.ipc_number)} · {normalizeIpcPeriod(selected.period)}</div>
              </div>
              <button onClick={() => setSelected(null)}><X size={14} /></button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar p-5">
              <div className="flex items-center gap-2 mb-3"><StatusPill status={ipcStatusLabel(selected.status)} size="lg" /></div>

              {/* A payment certificate reads as three separate positions.
                  Blending them is how commercial disputes start, so PREVIOUS,
                  CURRENT PERIOD and CUMULATIVE are visually distinct blocks —
                  and every one of them is header-level, project-level money,
                  labelled as such, because no line-level ledger exists. */}
              {(() => {
                const pos = positionByIpc[selected.id] || { previous: 0, current: 0, cumulative: null };
                const isDraft = !(selected.status === 'certified' || selected.status === 'paid');
                return (
                  <div className="mb-4">
                    <div className="rounded-lg border px-3 py-2 mb-2" style={{ borderColor: COL.border, background: COL.surfaceAlt }}>
                      <div className="mono text-[9.5px] tracking-widest" style={{ color: COL.textMute }}>PREVIOUSLY CERTIFIED · PROJECT LEVEL</div>
                      <div className="mono text-[15px] font-bold mt-0.5" style={{ color: COL.text }}>SAR {fmt(pos.previous)}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: COL.textMute }}>gross of certificates certified before this one</div>
                    </div>

                    <div className="rounded-lg border px-3 py-2.5 mb-2" style={{ borderColor: COL.accent, background: COL.accentBg }}>
                      <div className="mono text-[9.5px] tracking-widest mb-1.5" style={{ color: COL.accent }}>THIS CERTIFICATE · {normalizeIpcPeriod(selected.period) || '—'}</div>
                      <div className="space-y-1.5 text-xs">
                        {rows.map(([label, amt, color, big], i) => (
                          <div key={i} className="flex justify-between items-baseline" style={{ paddingTop: big && i > 0 ? 6 : 0, borderTop: big && i > 0 ? `1px solid ${COL.border}` : 'none' }}>
                            <span className={big ? 'font-semibold' : ''} style={{ color: COL.textDim }}>{label}</span>
                            <span className={`mono ${big ? 'font-bold text-sm' : ''}`} style={{ color }}>SAR {fmt(amt)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-lg border px-3 py-2" style={{ borderColor: COL.border, background: COL.surfaceAlt }}>
                      <div className="mono text-[9.5px] tracking-widest" style={{ color: COL.textMute }}>CUMULATIVE CERTIFIED · PROJECT LEVEL</div>
                      {pos.cumulative == null ? (
                        <>
                          <div className="mono text-[15px] font-bold mt-0.5" style={{ color: COL.textMute }}>—</div>
                          <div className="text-[10px] mt-0.5" style={{ color: COL.textMute }}>this certificate is not certified yet, so it does not move the certified position</div>
                        </>
                      ) : (
                        <>
                          <div className="mono text-[15px] font-bold mt-0.5" style={{ color: COL.certified || '#15803d' }}>SAR {fmt(pos.cumulative)}</div>
                          <div className="text-[10px] mt-0.5" style={{ color: COL.textMute }}>previous + this certificate&apos;s gross</div>
                        </>
                      )}
                    </div>

                    <div className="text-[10px] mt-2 leading-relaxed" style={{ color: COL.textMute }}>
                      All three figures are <b>project-level</b>, summed from IPC headers. They carry no BoQ-line provenance — see line certification history below.
                    </div>
                    {isDraft && <div className="text-[10px] mt-1" style={{ color: '#b45309' }}>Draft certificate — figures become part of the certified position only once it is certified.</div>}
                  </div>
                );
              })()}

              {/* ── Downstream billing ─────────────────────────────────
                  Matched on invoices.ipc_ref (text) against the certificate
                  number. That is the only relationship the schema offers; it is
                  not a foreign key, so the match is stated rather than implied. */}
              {(() => {
                const num = String(selected.ipc_number || '').trim().toLowerCase();
                const linked = invoices.filter((iv) => String(iv.ipc_ref || '').trim().toLowerCase() === num);
                return (
                  <div className="mb-4">
                    <div className="mono text-[10px] tracking-widest mb-2" style={{ color: COL.textMute }}>DOWNSTREAM BILLING</div>
                    {linked.length === 0 ? (
                      <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: COL.border, background: COL.surfaceAlt }}>
                        <div className="text-[12px] font-medium" style={{ color: COL.text }}>No invoice references this certificate.</div>
                        <div className="text-[11px] mt-1" style={{ color: COL.textDim }}>
                          Invoices point at a certificate through <span className="mono">ipc_ref</span>, a free-text field — nothing has been raised against <span className="mono">{normalizeIpcNumber(selected.ipc_number)}</span> yet.
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border divide-y overflow-hidden" style={{ borderColor: COL.border }}>
                        {linked.map((iv) => (
                          <div key={iv.id} className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="mono text-[11.5px] font-semibold" style={{ color: COL.accent }}>{iv.invoice_number}</span>
                              <span className="mono text-[11.5px] ms-auto font-bold" style={{ color: COL.text }}>SAR {fmt(iv.amount)}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-[10.5px]" style={{ color: COL.textDim }}>
                              <span>Payment: <b style={{ color: iv.payment_status === 'Paid' ? '#15803d' : iv.payment_status === 'Overdue' ? '#b91c1c' : COL.textDim }}>{iv.payment_status}</b></span>
                              <span>ZATCA: <b style={{ color: COL.textDim }}>{iv.zatca_status}</b></span>
                              {iv.paid_date && <span className="mono">paid {iv.paid_date}</span>}
                            </div>
                          </div>
                        ))}
                        <div className="px-3 py-1.5 text-[10px]" style={{ background: COL.surfaceAlt, color: COL.textMute }}>
                          Matched by certificate number (<span className="mono">ipc_ref</span>) — a text match, not a database relationship.
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              {selected.notes && <div className="text-xs mb-4" style={{ color: COL.textDim }}>{selected.notes}</div>}

              {/* LINE CERTIFICATION HISTORY.
                  A certified certificate's line composition is frozen at
                  certification time — and the database has no ipc_lines ledger
                  to freeze it in. Deriving it from today's boq_items.approved_qty
                  would present CURRENT readiness as THIS certificate's historical
                  composition, which is wrong for a document someone was paid
                  against. So a certified/paid IPC states the gap once, plainly,
                  instead of showing a plausible-looking but unsourced breakdown.
                  A DRAFT is different: current eligibility genuinely is "what
                  could go into this certificate", so it keeps the breakdown —
                  labelled as eligibility, not as certified composition. */}
              {(selected.status === 'certified' || selected.status === 'paid') ? (
                <div className="mb-4">
                  <div className="mono text-[10px] tracking-widest mb-2" style={{ color: COL.textMute }}>LINE CERTIFICATION HISTORY</div>
                  <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: COL.border, background: COL.surfaceAlt }}>
                    <div className="text-[12px] font-medium" style={{ color: COL.text }}>Not available in the current certification engine.</div>
                    <div className="text-[11px] mt-1 leading-relaxed" style={{ color: COL.textDim }}>
                      This certificate records header totals only. Per-line certified quantities are not stored, so the BoQ lines behind it cannot be shown without inventing them.
                    </div>
                    <div className="mono text-[9.5px] mt-2" style={{ color: COL.textMute }}>BACKEND DEPENDENCY · ipc_lines + certification provenance</div>
                  </div>
                </div>
              ) : (
              <div className="mb-4">
                <div className="flex items-center gap-1.5 mb-2"><ShieldCheck size={13} style={{ color: '#15803d' }} /><span className="mono text-[10px] tracking-widest" style={{ color: COL.textMute }}>ELIGIBLE TO INCLUDE — CURRENT READINESS ({composition.certifiable.length})</span></div>
                {composition.certifiable.length === 0 ? <div className="text-[11.5px]" style={{ color: COL.textMute }}>No approved BoQ value yet — certify work via WIRs.</div> : (
                  <div className="rounded-lg border divide-y" style={{ borderColor: COL.border }}>
                    {composition.certifiable.slice(0, 30).map(({ b, r }) => (
                      <div key={b.id} className="flex items-center gap-2 px-3 py-1.5 text-[11.5px]">
                        <span className="mono font-semibold flex-shrink-0" style={{ color: COL.accent, minWidth: 52 }}>{b.code || '—'}</span>
                        <span className="flex-1 truncate" title={b.description} style={{ color: COL.text }}>{b.description}</span>
                        <span className="mono font-semibold flex-shrink-0" style={{ color: '#15803d' }}>{fmt(r.approvedValue)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {composition.blocked.length > 0 && (
                  <>
                    <div className="flex items-center gap-1.5 mt-3 mb-2"><AlertOctagon size={13} style={{ color: '#dc2626' }} /><span className="mono text-[10px] tracking-widest" style={{ color: COL.textMute }}>EXCLUDED / BLOCKED ({composition.blocked.length})</span></div>
                    <div className="rounded-lg border divide-y" style={{ borderColor: '#fecaca' }}>
                      {composition.blocked.slice(0, 20).map(({ b, r }) => (
                        <div key={b.id} className="flex items-center gap-2 px-3 py-1.5 text-[11.5px]" style={{ background: '#fef2f2' }}>
                          <span className="mono font-semibold flex-shrink-0" style={{ color: '#991b1b', minWidth: 52 }}>{b.code || '—'}</span>
                          <span className="flex-1 truncate" title={b.description} style={{ color: COL.text }}>{b.description}</span>
                          <span className="mono font-semibold flex-shrink-0" style={{ color: '#dc2626' }}>{fmt(r.blockedValue)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-[10px] mt-1.5" style={{ color: '#b45309' }}>Deferred pending NCR closure — re-appears once the blocker is cleared.</div>
                  </>
                )}
                <div className="text-[10px] mt-2" style={{ color: COL.textMute }}>Current eligibility, not certified composition — it moves as WIRs are approved. Frozen per-IPC line snapshots need the ipc_lines ledger.</div>
              </div>
              )}

              <div className="flex flex-wrap items-center gap-2 mb-2">
                {/* One primary (Export PDF is the routine action); Edit is a
                    secondary edit and Delete is demoted to the danger variant so
                    three buttons don't all read as equally important. */}
                {canCompose && <Btn icon={Pencil} onClick={() => requireAuth(() => { setEditing(selected); setFormOpen(true); })}>Edit</Btn>}
                <Btn icon={Printer} variant="primary" onClick={() => onExportPdf(selected)} disabled={pdfBusy}>{pdfBusy ? 'Preparing…' : 'Export PDF'}</Btn>
                <Btn icon={FileSpreadsheet} onClick={() => openExcelPreview(selected)} disabled={previewBusy || exporting}>{previewBusy ? 'Preparing…' : exporting ? 'Exporting…' : 'Preview & export (Excel)'}</Btn>
                <Btn icon={Trash2} variant="danger" onClick={() => onDelete(selected)}>Delete</Btn>
              </div>
              <div className="text-[10px] mb-4" style={{ color: COL.textMute }}>
                Exports the full payment certificate workbook (Summary + App A–F) with figures pulled from this project's BoQ.
              </div>

              <div className="border-t pt-4" style={{ borderColor: COL.border }}>
                <Attachments recordType="ipc" recordId={selected.id} />
              </div>
            </div>
          </aside>
        )}
      </div>

      <IpcFormModal
        open={formOpen}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(saved) => { setFormOpen(false); load(); if (selected && saved?.id === selected.id) setSelected(saved); }}
      />

      {/* Pre-export preview — review the certificate before downloading the .xlsx.
          The iframe renders the exact same certificate HTML used for the PDF
          (header, line items, gross/retention/VAT/net). Sandboxed; read-only. */}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview ? `Preview — ${normalizeIpcNumber(preview.ipc.ipc_number)}` : 'Preview'}
        subtitle="Review the certificate before exporting to Excel"
        width={820}
        footer={(
          <>
            <Btn variant="secondary" onClick={() => setPreview(null)}>Close</Btn>
            <Btn variant="primary" icon={FileSpreadsheet} disabled={exporting}
              onClick={async () => { const ipc = preview?.ipc; setPreview(null); if (ipc) await onExportExcel(ipc); }}>
              {exporting ? 'Exporting…' : 'Download Excel'}
            </Btn>
          </>
        )}
      >
        {preview && (
          <iframe title="IPC certificate preview" srcDoc={preview.html} sandbox=""
            style={{ width: '100%', height: '60vh', border: `1px solid ${COL.border}`, borderRadius: 8, background: '#fff' }} />
        )}
      </Modal>
    </div>
  );
}
