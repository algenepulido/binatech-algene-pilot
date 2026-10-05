// ============================================================
// WirDetailModal — a real WIR as a 6-tab inspection record: Inspection · Commercial
// Linkage · Evidence · NCRs/Holds · Assignment · Audit. Real data + real actions
// (edit/delete/attachments) are preserved. Assignment + audit are DEMO-safe local
// state (the schema has no wir_assignments / audit_events — documented, not faked).
// UX: renders in a right-hand Drawer (docs/ux/UI-UX-OVERHAUL.md) so the WIR table,
// its filters and its scroll position stay alive behind the record. The export
// keeps its historical name; the edit form remains a true Modal.
// SAFETY: WIR approval supports CLAIMABILITY only — it does NOT certify payment value;
// certification stays human-approved + backend-gated (Gate 1). Commercial-quantity
// edits carry an authorized-role cue (RLS is the real boundary).
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { StyledSelect } from '../../components/StyledSelect.jsx';
import { confirmDialog } from '../../components/ConfirmDialog.jsx';
import { Box, Eye, Paperclip, Pencil, Trash2, Upload, ExternalLink, Lock, Send, MessageSquarePlus, ShieldAlert, UserCog } from 'lucide-react';
import { Drawer } from '../../components/Drawer.jsx';
import { EvidencePreview } from '../../components/EvidencePreview.jsx';
import { Btn, StatusPill } from '../../components/primitives.jsx';
import { Select } from '../../components/commercial/Select.jsx';
import { elementByGuid } from '../../components/ElementPicker.jsx';
import { WirFormModal } from './WirForm.jsx';
import { useWirEvidenceImage, describeEvidenceFailure } from './useWirEvidenceImage.js';
import { deleteWir } from '../../api/wirs.js';
import { listAttachments, uploadAttachment, signedUrl, deleteAttachment } from '../../lib/attachments.js';
import { listInvoicesForWir } from '../../api/invoiceWirLinks.js';
import { listInvoices } from '../../api/invoices.js';
import { resultLabel } from '../../lib/wirStatus.js';
import { deriveWirMetadata } from '../../lib/wirMetadata.js';
import { WIR_DOC_TYPES, DEFAULT_WIR_DOC_TYPE, docTypeLabel } from '../../lib/wirDocTypes.js';
import { useAuth } from '../../lib/auth.jsx';
import { useProject } from '../../lib/project.jsx';
import { COL } from '../../lib/theme.js';

const QAQC_TEAMS = ['QA/QC Civil', 'QA/QC Structural', 'QA/QC MEP', 'Survey', 'Commercial / QS Review', 'Consultant reviewer (read-only)'];
const APPROVED = (wir) => /approv|pass|closed/i.test(wir?.result || '');
function Row({ label, children, mono }) {
  return <div className="flex gap-3 py-1.5 border-b" style={{ borderColor: COL.border }}>
    <div className="text-[11px] w-36 shrink-0" style={{ color: COL.textDim }}>{label}</div>
    <div className={`text-xs flex-1 ${mono ? 'mono' : ''}`} style={{ color: COL.text }}>{children || <span style={{ color: COL.textMute }}>—</span>}</div>
  </div>;
}
const TabBtn = ({ active, onClick, children }) => (
  <button role="tab" aria-selected={active} onClick={onClick} className="px-2.5 py-1 rounded-lg text-[11.5px] font-semibold whitespace-nowrap"
    style={active ? { background: COL.accent, color: '#fff' } : { background: COL.surface, color: COL.textDim, border: `1px solid ${COL.border}` }}>{children}</button>
);

export function WirDetailModal({ open, wir, onClose, onChanged, onSelectElement, setRoute, lang = 'en' }) {
  const ar = lang === 'ar';
  const { user, requireAuth } = useAuth();
  const { project } = useProject();
  const [editing, setEditing] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [linkedInvoices, setLinkedInvoices] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [docType, setDocType] = useState(DEFAULT_WIR_DOC_TYPE);
  const [tab, setTab] = useState('inspection');
  // Demo-safe assignment (no wir_assignments table yet — documented).
  const [team, setTeam] = useState(APPROVED(wir) ? 'QA/QC Civil' : 'QA/QC Civil');
  const [submitted, setSubmitted] = useState(false);
  // Evidence is inspected IN CONTEXT: a preview panel over this drawer, not a
  // new browser tab that drops the reviewer out of the WIR they are judging.
  // "Open in tab" and "Download" remain, as explicit choices inside the panel.
  const [preview, setPreview] = useState(null); // { att, url, loading, error }
  const fileRef = useRef(null);
  // EVIDENCE-IMG-1B: an image is prepared (1A), shown for review and explicitly
  // confirmed before the existing upload path runs. Documents keep the immediate path.
  // Refreshed rows are applied only if the drawer still shows the WIR they were fetched for.
  const wirIdRef = useRef(wir?.id); wirIdRef.current = wir?.id;
  const refreshAttachments = async () => { const id = wir?.id; const rows = await listAttachments('wir', id); if (wirIdRef.current === id) setAttachments(rows); };
  const evidenceImage = useWirEvidenceImage({ active: open, wirId: wir?.id, projectId: project?.id, userId: user?.id, docType, onUploaded: refreshAttachments });

  useEffect(() => { setTab('inspection'); setSubmitted(false); }, [wir?.id]);
  useEffect(() => {
    if (!open || !wir?.id) return;
    let active = true;
    listAttachments('wir', wir.id).then((a) => { if (active) setAttachments(a); }).catch((e) => setError(e.message));
    Promise.all([listInvoicesForWir(wir.id), listInvoices()])
      .then(([ids, invs]) => { if (!active) return; const set = new Set(ids); setLinkedInvoices(invs.filter((i) => set.has(i.id))); })
      .catch(() => active && setLinkedInvoices([]));
    return () => { active = false; };
  }, [open, wir?.id]);

  if (!wir) return null;
  const el = elementByGuid(wir.element_guid);
  const demo = !!wir.__demo; // frontend preview WIR — read-only, never write to the DB against its fake id
  function onPickFile() { if (demo) return; requireAuth(() => fileRef.current?.click()); }
  async function onFileChange(e) {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    setError(null);
    if (evidenceImage.select(file)) return;            // image: prepare → review → explicit confirm (EVIDENCE-IMG-1B)
    setBusy(true);
    try { await uploadAttachment({ recordType: 'wir', recordId: wir.id, file, documentType: docType }); await refreshAttachments(); }
    catch (err) { setError(err?.message ?? String(err)); } finally { setBusy(false); }
  }
  async function onPreview(att) {
    setPreview({ att, url: null, loading: true, error: null });
    try {
      const url = await signedUrl(att.storage_path);
      setPreview((p) => (p && p.att.id === att.id ? { ...p, url, loading: false } : p));
    } catch (err) {
      const msg = err?.message ?? String(err);
      setPreview((p) => (p && p.att.id === att.id ? { ...p, loading: false, error: msg } : p));
    }
  }
  function onDeleteAttachment(att) { requireAuth(async () => { try { await deleteAttachment(att.id, att.storage_path); await refreshAttachments(); } catch (err) { setError(err?.message ?? String(err)); } }); }
  function onDeleteWir() { if (demo) return; requireAuth(async () => { if (!await confirmDialog(`Delete ${wir.wir_number}? This cannot be undone.`)) return; try { await deleteWir(wir.id); onChanged?.(); onClose?.(); } catch (err) { setError(err?.message ?? String(err)); } }); }
  function openInModel() { if (!el) return; onSelectElement?.(el.id); setRoute?.('model'); onClose?.(); }
  const go = (r) => { setRoute?.(r); onClose?.(); };
  const ev = evidenceImage;
  const evidenceLocked = ev.busy || !!ev.candidate;   // a reviewed image freezes the document type until confirmed or discarded
  const bytesLabel = (n) => (typeof n === 'number' ? `${n.toLocaleString('en-US')} B` : '—');
  const dims = (w, h) => (w && h ? `${w}×${h}` : '—');

  const TABS = [['inspection', ar ? 'الفحص' : 'Inspection'], ['commercial', ar ? 'تجاري' : 'Commercial'], ['evidence', ar ? 'الأدلة' : 'Evidence'], ['ncrs', 'NCRs'], ['assignment', ar ? 'الإسناد' : 'Assignment'], ['audit', ar ? 'التدقيق' : 'Audit']];
  const PermCue = ({ children }) => <div className="text-[10.5px] flex items-start gap-1.5" style={{ color: COL.textMute }}><Lock size={11} className="shrink-0 mt-0.5" /> {children}</div>;

  return (
    <>
      <Drawer open={open && !editing} onClose={onClose} title={wir.wir_number} subtitle={wir.inspection_type || 'Work Inspection Request'} width={600}
        footer={demo
          ? <><span className="me-auto text-[11px]" style={{ color: COL.textMute }}>{ar ? 'معاينة توضيحية — للقراءة فقط' : 'Demo preview — read-only'}</span><Btn variant="secondary" onClick={onClose}>Done</Btn></>
          : <><span className="me-auto"><Btn variant="secondary" icon={Trash2} onClick={onDeleteWir}>Delete</Btn></span><Btn variant="secondary" onClick={onClose}>Done</Btn><Btn variant="primary" icon={Pencil} onClick={() => requireAuth(() => setEditing(true))}>Edit</Btn></>}>
        {demo && <div className="mb-3 rounded-lg px-3 py-1.5 text-[11px] flex items-center gap-2" style={{ background: COL.pendingSoft, color: COL.pending }}><span className="mono text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: COL.pending, color: '#fff' }}>DEMO</span>{ar ? 'معاينة للقراءة فقط — غير محفوظة في قاعدة البيانات.' : 'Read-only preview — not saved to the database. Raise a real WIR to edit.'}</div>}
        <div className="flex items-center gap-2 mb-3"><StatusPill status={resultLabel(wir.result)} size="lg" />{wir.inspection_date && <span className="mono text-[11px]" style={{ color: COL.textDim }}>{wir.inspection_date}</span>}</div>

        <div className="flex gap-1 overflow-x-auto scrollbar mb-3" role="tablist">{TABS.map(([k, lbl]) => <TabBtn key={k} active={tab === k} onClick={() => setTab(k)}>{lbl}</TabBtn>)}</div>

        {tab === 'inspection' && (<div>
          <Row label={ar ? 'النوع' : 'Inspection type'}>{wir.inspection_type}</Row>
          <Row label={ar ? 'التخصص' : 'Discipline'}>{/concrete|barrier|structural|civil/i.test(wir.inspection_type || '') ? 'Structural / Civil' : wir.discipline || '—'}</Row>
          <Row label={ar ? 'تاريخ الإصدار' : 'Date issued'} mono>{wir.inspection_date}</Row>
          <Row label={ar ? 'تاريخ الفحص المطلوب' : 'Requested inspection'} mono>{wir.requested_date || wir.inspection_date}</Row>
          <Row label={ar ? 'الموقع / WBS' : 'Location / WBS'}>{wir.location || (el ? `${el.id} · ${el.name}` : 'Link S2 / parapet zone')}</Row>
          <Row label={ar ? 'مرجع المخطط' : 'Drawing ref'} mono>{wir.drawing_ref}</Row>
          <Row label={ar ? 'العنصر' : 'Linked element'}>{wir.element_guid ? <button onClick={openInModel} disabled={!el} className="mono inline-flex items-center gap-1.5 hover:underline disabled:no-underline" style={{ color: el ? COL.accent : COL.textDim }}><Box size={12} /> {el ? `${el.id} · ${el.name}` : wir.element_guid}{el && <span className="text-[10px]">(model)</span>}</button> : null}</Row>
          <Row label={ar ? 'بواسطة' : 'Issued by'}>{wir.inspector_name || (user?.email ?? '—')}</Row>
          <Row label={ar ? 'الشركة' : 'Issuer company'}>{project?.contractor || '—'}</Row>
          <Row label={ar ? 'ملاحظات' : 'Remarks'}>{wir.remarks}</Row>
          <div className="flex flex-wrap gap-2 mt-3">
            {!demo && <Btn icon={Pencil} variant="secondary" onClick={() => requireAuth(() => setEditing(true))}>{ar ? 'تعديل المسوّدة' : 'Edit draft'}</Btn>}
            {!demo && !APPROVED(wir) && <Btn icon={Send} variant="secondary" onClick={() => setSubmitted(true)}>{ar ? 'إرسال للفحص' : 'Submit for inspection'}</Btn>}
            <Btn icon={MessageSquarePlus} variant="secondary" onClick={() => setTab('audit')}>{ar ? 'إضافة تعليق' : 'Add comment'}</Btn>
          </div>
          {submitted && <div className="text-[11px] mt-2 rounded-lg px-2 py-1.5" style={{ background: COL.pendingSoft, color: COL.pending }}>{ar ? 'أُرسل للفحص (عرض).' : 'Submitted for inspection (demo).'}</div>}
        </div>)}

        {tab === 'commercial' && (<div className="space-y-3">
          <div className="rounded-lg border overflow-hidden" style={{ borderColor: COL.border }}>
            {deriveWirMetadata(wir, lang).map((m, idx) => (
              <div key={idx} className="flex gap-3 px-3 py-1.5 border-b last:border-b-0" style={{ borderColor: COL.border }}>
                <div className="text-[11px] w-36 shrink-0" style={{ color: COL.textDim }}>{m.label}</div>
                <div className="text-xs flex-1 flex items-center gap-2 flex-wrap" style={{ color: m.value === '—' ? COL.textMute : COL.text }}><span>{m.value}</span>{m.illustrative && <span className="text-[9px] px-1 py-0.5 rounded-full" style={{ background: COL.pendingSoft, color: COL.pending }}>{ar ? 'توضيحي' : 'illustrative'}</span>}</div>
              </div>
            ))}
          </div>
          <Row label={ar ? 'حالة قائمة الاعتماد' : 'Certification queue status'}>{APPROVED(wir) ? (ar ? 'قابل للاعتماد (مراجعة بشرية)' : 'Certifiable — pending human review') : (ar ? 'لم يُعتمد بعد' : 'Not yet approved')}</Row>
          <Row label={ar ? 'أثر جاهزية IPC' : 'IPC readiness impact'}>{APPROVED(wir) ? (ar ? 'يدعم الجاهزية' : 'Supports readiness') : (ar ? 'لا يدعم حتى الاعتماد' : 'No impact until approved')}</Row>
          <div className="rounded-lg px-3 py-2 text-[11.5px] flex items-start gap-2" style={{ background: COL.accentBg, color: COL.accent }}><ShieldAlert size={14} className="shrink-0 mt-0.5" /> {ar ? 'اعتماد طلب الفحص يدعم القابلية للمطالبة. لا يعتمد قيمة الدفع.' : 'WIR approval supports claimability. It does not certify payment value.'}</div>
          <div className="flex flex-wrap gap-2">
            <Btn icon={ExternalLink} variant="secondary" onClick={() => go('qs')}>{ar ? 'فتح بند الكميات' : 'Open BOQ line'}</Btn>
            {/* Two fixes in one row. 'certqueue' is now a real route, so the
                Control-Room fallback is gone; and the button that used to read
                "IPC Readiness" pointed at route 'readiness' — the supplier
                INVOICE readiness screen (procurement/AP), a different workflow.
                IPC readiness for a WIR means "does this inspection make BoQ
                value eligible", which is the Certification Queue. */}
            <Btn icon={ExternalLink} variant="secondary" onClick={() => go('certqueue')}>{ar ? 'قائمة الاعتماد' : 'Certification Queue'}</Btn>
            <Btn icon={ExternalLink} variant="secondary" onClick={() => go('certification-control-room')}>{ar ? 'غرفة التحكم' : 'Control Room'}</Btn>
          </div>
          <PermCue>{ar ? 'تحديث الكمية المعتمدة / القابلية للمطالبة يتطلب صلاحية تجارية/QS — عبر التعديل، ومحمي بـ RLS.' : 'Updating approved quantity / claimability requires a Commercial/QS role — via Edit, and enforced by RLS.'}</PermCue>
        </div>)}

        {tab === 'evidence' && (<div>
          {/* Field capture. On a phone this is the whole job: pick the type,
              hit a full-width Upload, and SEE what happened. The controls stack
              instead of squeezing onto one line, and the busy/error states live
              here next to the list rather than at the bottom of a scrolling
              drawer where a site engineer would never find them. */}
          <div className="mb-2">
            <div className="text-xs font-semibold flex items-center gap-1.5 mb-2" style={{ color: COL.text }}><Paperclip size={13} /> {ar ? 'المرفقات' : 'Attachments'} ({attachments.length})</div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex-1 sm:flex-none sm:min-w-[150px]"><StyledSelect value={docType} onChange={setDocType} disabled={busy || evidenceLocked} ariaLabel="Document type" options={WIR_DOC_TYPES.map((d) => ({ value: d.value, label: ar ? d.ar : d.en }))} /></div>
              <button type="button" onClick={onPickFile} disabled={busy || ev.busy || demo}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] sm:text-[12px] font-semibold border disabled:opacity-50 disabled:pointer-events-none active:scale-[0.99]"
                style={{ minHeight: 44, background: COL.accent, color: '#fff', borderColor: COL.accent }}>
                <Upload size={15} />{busy ? (ar ? 'جارٍ الرفع…' : 'Uploading…') : (ar ? 'رفع دليل' : 'Upload evidence')}
              </button>
            </div>
            <input ref={fileRef} type="file" accept="application/pdf,image/*" hidden onChange={onFileChange} />
            {ev.phase !== 'idle' && (
              <div data-evidence-review data-evidence-phase={ev.phase} dir={ar ? 'rtl' : 'ltr'} className="mt-2 rounded-lg border p-3 text-[12px]" style={{ borderColor: COL.border, background: COL.surface, color: COL.text }}>
                {ev.phase === 'preparing' && (
                  <div className="flex items-center gap-2" role="status" aria-live="polite">
                    <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin shrink-0" style={{ color: COL.accent }} />
                    <span>{ar ? 'جارٍ تجهيز الصورة…' : 'Preparing image…'}</span>
                    <span className="flex-1 truncate" style={{ color: COL.textDim }}>{ev.fileName}</span>
                    <button type="button" onClick={ev.cancel} className="rounded-md border px-2.5 text-[11.5px] font-semibold" style={{ minHeight: 36, borderColor: COL.border }}>{ar ? 'إلغاء' : 'Cancel'}</button>
                  </div>
                )}
                {(ev.phase === 'review' || ev.phase === 'uploading' || ev.phase === 'upload-failed') && (
                  <div>
                    <div className="font-semibold mb-2">{ar ? 'راجع قبل الرفع' : 'Review before upload'}</div>
                    <div className="rounded-md overflow-hidden flex items-center justify-center" style={{ background: COL.bg, minHeight: 120 }}>
                      <img data-evidence-preview src={ev.previewUrl} alt={ev.fileName || ''}
                        onLoad={(e) => ev.previewLoaded(e.currentTarget.getAttribute('src'), e.currentTarget.naturalWidth)}
                        onError={(e) => ev.previewFailed(e.currentTarget.getAttribute('src'))}
                        className="max-w-full max-h-[48vh] object-contain" />
                    </div>
                    <dl className="grid gap-x-3 gap-y-1 mt-2 text-[11.5px]" style={{ gridTemplateColumns: 'auto 1fr' }}>
                      <dt style={{ color: COL.textDim }}>{ar ? 'الملف' : 'File'}</dt><dd className="truncate">{ev.fileName}</dd>
                      <dt style={{ color: COL.textDim }}>{ar ? 'الأصل' : 'Original'}</dt><dd>{bytesLabel(ev.metadata?.originalBytes)} · {dims(ev.metadata?.originalWidth, ev.metadata?.originalHeight)}</dd>
                      <dt style={{ color: COL.textDim }}>{ar ? 'المُجهَّز' : 'Prepared'}</dt>
                      <dd>{bytesLabel(ev.metadata?.resultBytes)} · {dims(ev.metadata?.width, ev.metadata?.height)} · {ev.metadata?.transformed
                        ? ((ev.metadata?.operations || []).includes('resize') ? (ar ? 'تم تغيير الحجم وإعادة الترميز' : 'Resized and re-encoded') : (ar ? 'أُعيد ترميزها' : 'Re-encoded'))
                        : (ar ? 'دون تغيير' : 'Unchanged')}</dd>
                    </dl>
                    {ev.phase === 'review' && !ev.previewSeen && (
                      <div className="mt-2 text-[11px]" role="status" aria-live="polite" style={{ color: COL.textMute }}>{ar ? 'جارٍ تحميل المعاينة… يمكن التأكيد بعد ظهور الصورة.' : 'Loading preview… you can confirm once the image is showing.'}</div>
                    )}
                    {ev.phase === 'uploading' && (
                      <div className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2" role="status" aria-live="polite" style={{ background: COL.accentBg, color: COL.accent }}>
                        <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                        <span>{ar ? 'جارٍ رفع الملف — لا تغلق هذه الشاشة.' : 'Uploading — keep this open until it finishes.'}</span>
                      </div>
                    )}
                    {ev.phase === 'upload-failed' && (
                      <div className="mt-2 rounded-lg px-3 py-2" role="alert" style={{ background: '#fee2e2', color: '#b91c1c' }}><span>{(ar ? 'فشل الرفع: ' : 'Upload failed: ') + ev.error}</span></div>
                    )}
                    {ev.phase !== 'uploading' && (
                      <div className="flex flex-col sm:flex-row gap-2 mt-3">
                        {ev.phase === 'review' && (
                          <button type="button" onClick={ev.confirm} disabled={!ev.previewSeen} aria-disabled={!ev.previewSeen} className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] sm:text-[12px] font-semibold border disabled:opacity-50 disabled:pointer-events-none active:scale-[0.99]" style={{ minHeight: 44, background: COL.accent, color: '#fff', borderColor: COL.accent }}>
                            <Upload size={15} />{ar ? 'تأكيد الرفع' : 'Confirm upload'}
                          </button>
                        )}
                        {ev.phase === 'upload-failed' && (
                          <button type="button" onClick={ev.retryUpload} className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] sm:text-[12px] font-semibold border active:scale-[0.99]" style={{ minHeight: 44, background: COL.accent, color: '#fff', borderColor: COL.accent }}>
                            <Upload size={15} />{ar ? 'إعادة محاولة الرفع' : 'Retry upload'}
                          </button>
                        )}
                        <button type="button" onClick={ev.discard} className="w-full sm:w-auto inline-flex items-center justify-center rounded-lg px-3 text-[13px] sm:text-[12px] font-semibold border" style={{ minHeight: 44, borderColor: COL.border, color: COL.textDim, background: COL.surface }}>{ar ? 'تجاهل' : 'Discard'}</button>
                      </div>
                    )}
                  </div>
                )}
                {ev.phase === 'failed' && (
                  <div role="alert">
                    <div className="font-semibold" style={{ color: '#b91c1c' }}>{ev.code === 'PREVIEW_UNAVAILABLE' ? (ar ? 'لا يمكن تأكيد هذه الصورة' : "This image can't be confirmed") : (ar ? 'تعذّر تجهيز هذه الصورة' : "This image can't be prepared")}</div>
                    <div className="mt-1" style={{ color: COL.textDim }}>{describeEvidenceFailure(ev.code, lang)}</div>
                    <div className="mt-1 text-[11px]" style={{ color: COL.textMute }}>{ar ? 'لم يُرفع أي شيء.' : 'Nothing was uploaded.'}</div>
                    <button type="button" onClick={() => { ev.discard(); onPickFile(); }} className="mt-2 w-full sm:w-auto rounded-lg px-3 text-[12px] font-semibold border" style={{ minHeight: 40, borderColor: COL.border, background: COL.surface }}>{ar ? 'اختر ملفًا آخر' : 'Choose another file'}</button>
                  </div>
                )}
                {ev.phase === 'stale' && (
                  <div role="alert">
                    <span>{ar ? 'تغيّر طلب الفحص أو المشروع أثناء المراجعة — اختر الملف من جديد.' : 'The WIR or project changed while this image was under review — choose the file again.'}</span>
                    <button type="button" onClick={() => { ev.discard(); onPickFile(); }} className="mt-2 block w-full sm:w-auto rounded-lg px-3 text-[12px] font-semibold border" style={{ minHeight: 40, borderColor: COL.border, background: COL.surface }}>{ar ? 'اختر ملفًا آخر' : 'Choose another file'}</button>
                  </div>
                )}
                {ev.phase === 'refreshing' && (
                  <div className="flex items-center gap-2" role="status" aria-live="polite">
                    <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin shrink-0" style={{ color: COL.accent }} />
                    <span>{ar ? `تم رفع ${ev.fileName}. جارٍ تحديث القائمة…` : `Uploaded ${ev.fileName}. Refreshing the list…`}</span>
                  </div>
                )}
                {ev.phase === 'refresh-failed' && (
                  <div role="alert">
                    <span style={{ color: COL.certified }}>{ar ? `تم رفع ${ev.fileName}.` : `Uploaded ${ev.fileName}.`}</span>{' '}
                    <span style={{ color: '#b91c1c' }}>{(ar ? 'تعذّر تحديث القائمة: ' : 'The list could not be refreshed: ') + ev.error}</span>
                    <div className="flex gap-2 mt-2">
                      <button type="button" onClick={ev.retryRefresh} className="w-full sm:w-auto rounded-lg px-3 text-[12px] font-semibold border" style={{ minHeight: 40, borderColor: COL.border, background: COL.surface }}>{ar ? 'إعادة تحديث القائمة' : 'Retry refresh'}</button>
                    </div>
                  </div>
                )}
                {ev.phase === 'done' && (
                  <div className="flex items-center gap-2" role="status" aria-live="polite">
                    <span className="flex-1" style={{ color: COL.certified }}>{ar ? `تم رفع ${ev.fileName}.` : `Uploaded ${ev.fileName}.`}</span>
                    <button type="button" onClick={ev.discard} aria-label={ar ? 'إخفاء' : 'Dismiss'} className="w-8 h-8 rounded hover:bg-stone-100" style={{ color: COL.textDim }}>×</button>
                  </div>
                )}
              </div>
            )}
            {busy && (
              <div className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-[12px]" role="status" aria-live="polite" style={{ background: COL.accentBg, color: COL.accent }}>
                <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                {ar ? 'جارٍ رفع الملف — لا تغلق هذه الشاشة.' : 'Uploading — keep this open until it finishes.'}
              </div>
            )}
            {error && (
              <div className="mt-2 rounded-lg px-3 py-2 text-[12px]" role="alert" style={{ background: '#fee2e2', color: '#b91c1c' }}>
                {ar ? 'فشل الرفع: ' : 'Upload failed: '}{error}
              </div>
            )}
          </div>
          {attachments.length === 0 && <div className="text-[11px] py-2 text-center" style={{ color: COL.textMute }}>{ar ? 'لا مرفقات.' : 'No files attached yet.'}</div>}
          <div className="flex flex-col gap-1.5">{attachments.map((att) => (
            <div key={att.id} onClick={() => onPreview(att)} className="flex items-center gap-2 px-2.5 rounded border cursor-pointer hover:bg-stone-50" style={{ borderColor: COL.border, background: COL.bg, minHeight: 48 }}>
              <Paperclip size={13} style={{ color: COL.textDim }} className="shrink-0" /><span className="text-[12px] flex-1 truncate" style={{ color: COL.text }}>{att.file_name}</span>
              {docTypeLabel(att.document_type, lang) && <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded-full border" style={{ borderColor: COL.border, background: COL.surface, color: COL.textDim }}>{docTypeLabel(att.document_type, lang)}</span>}
              <button onClick={(e) => { e.stopPropagation(); onPreview(att); }} title={ar ? 'معاينة' : 'Preview'} aria-label={`${ar ? 'معاينة' : 'Preview'} ${att.file_name}`} className="w-11 h-11 sm:w-8 sm:h-8 shrink-0 flex items-center justify-center rounded hover:bg-stone-100" style={{ color: COL.accent }}><Eye size={15} /></button>
              <button onClick={(e) => { e.stopPropagation(); onDeleteAttachment(att); }} title={ar ? 'حذف' : 'Delete'} aria-label={`${ar ? 'حذف' : 'Delete'} ${att.file_name}`} className="w-11 h-11 sm:w-8 sm:h-8 shrink-0 flex items-center justify-center rounded hover:bg-stone-100" style={{ color: '#b91c1c' }}><Trash2 size={15} /></button>
            </div>
          ))}</div>
          {/* 'evidence' was never routed — the live register is 'evidence-packs'. */}
          <div className="flex flex-wrap gap-2 mt-3"><Btn icon={ExternalLink} variant="secondary" onClick={() => go('evidence-packs')}>{ar ? 'سجل الأدلة' : 'Open Evidence Register'}</Btn><Btn icon={Send} variant="secondary" onClick={() => go('evidence-packs')}>{ar ? 'طلب أدلة ناقصة' : 'Request missing evidence'}</Btn></div>
        </div>)}

        {tab === 'ncrs' && (<div className="space-y-3">
          <Row label={ar ? 'حالة NCR' : 'NCR status'}>{/clear|no/i.test(wir.ncr_status || 'clear') ? <span style={{ color: COL.certified }}>{ar ? 'سليم — لا إيقاف' : 'Clear — no hold'}</span> : <span style={{ color: COL.blocked }}>{wir.ncr_status}</span>}</Row>
          <Row label={ar ? 'محظور من الاعتماد؟' : 'Blocked from certification?'}>{/clear|no/i.test(wir.ncr_status || 'clear') ? (ar ? 'لا' : 'No') : (ar ? 'نعم — NCR مفتوح' : 'Yes — open NCR')}</Row>
          <div className="flex flex-wrap gap-2"><Btn icon={ExternalLink} variant="secondary" onClick={() => go('ncrs')}>{ar ? 'فتح NCRs' : 'Open NCRs'}</Btn></div>
          <PermCue>{ar ? 'إنشاء إيقاف NCR يتطلب صلاحية QA/QC.' : 'Creating an NCR hold requires a QA/QC role.'}</PermCue>
        </div>)}

        {tab === 'assignment' && (<div className="space-y-3">
          <div><div className="text-[11px] mb-1" style={{ color: COL.textDim }}>{ar ? 'فريق QA/QC المسند' : 'Assigned QA/QC team'}</div>
            <Select value={team} options={QAQC_TEAMS.map((t) => ({ value: t, label: t }))} ariaLabel="Assigned team" onChange={setTeam} dir={ar ? 'rtl' : 'ltr'} /></div>
          <Row label={ar ? 'المراجع' : 'Assigned reviewer'}>{wir.inspector_name || 'QA/QC Engineer'}</Row>
          <Row label={ar ? 'أُسند بواسطة' : 'Assigned by'}>QA/QC Manager</Row>
          <Row label={ar ? 'تاريخ الإسناد' : 'Assigned date'} mono>{wir.inspection_date || '—'}</Row>
          <Row label={ar ? 'مراجع الاستشاري' : 'Consultant reviewer'}>{project?.consultant || 'Resident Engineer'}</Row>
          <Row label={ar ? 'مالك التصعيد' : 'Escalation owner'}>Project Manager</Row>
          <div className="flex flex-wrap gap-2"><Btn icon={UserCog} variant="secondary" onClick={() => {}}>{ar ? 'طلب مراجعة تجارية' : 'Request commercial review'}</Btn><Btn icon={UserCog} variant="secondary" onClick={() => {}}>{ar ? 'طلب مراجعة الاستشاري' : 'Request consultant review'}</Btn></div>
          <PermCue>{ar ? 'الإسناد يتطلب مدير QA/QC / مدير فني. عرض توضيحي — يلزم جدول wir_assignments للإنتاج.' : 'Assignment requires QA/QC Manager / Technical Manager. Demo only — production needs a wir_assignments table.'}</PermCue>
        </div>)}

        {tab === 'audit' && (<div className="rounded-lg border p-3 space-y-1.5 text-[11.5px]" style={{ borderColor: COL.border }}>
          {[['Created', wir.inspector_name || 'Site Engineer', wir.inspection_date], ['Assigned to ' + team, 'QA/QC Manager', wir.inspection_date], ['Submitted for inspection', wir.inspector_name || 'Site Engineer', wir.inspection_date], APPROVED(wir) && ['Approved', project?.consultant || 'Resident Engineer', wir.inspection_date], wir.boq_item_id && ['Linked to BOQ', 'Commercial', wir.inspection_date], attachments.length && [`Evidence added (${attachments.length})`, wir.inspector_name || 'QA/QC', wir.inspection_date]].filter(Boolean).map(([a, who, when], i) => (
            <div key={i} className="flex justify-between gap-2"><span style={{ color: COL.text }}>{a}</span><span style={{ color: COL.textMute }} className="mono">{who} · {when || '—'}</span></div>
          ))}
          <div className="text-[10px] pt-1" style={{ color: COL.textMute }}>{ar ? 'سجل عرض — يلزم جدول audit_events للإنتاج.' : 'Demo log — production needs the audit_events table.'}</div>
        </div>)}

        {/* Non-evidence errors only — upload failures now surface in the
            Evidence tab itself, where the action was taken. */}
        {error && tab !== 'evidence' && <div className="text-xs px-2 py-1.5 rounded mt-3" role="alert" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}
        {!user && <div className="text-[11px] mt-3" style={{ color: COL.textDim }}>{ar ? 'سجّل الدخول للتعديل.' : 'Sign in to edit this WIR or manage attachments.'}</div>}
      </Drawer>

      <WirFormModal open={open && editing} initial={wir} onClose={() => setEditing(false)} onSaved={(saved) => { setEditing(false); onChanged?.(saved); }} />

      <EvidencePreview open={!!preview} lang={lang} onClose={() => setPreview(null)}
        fileName={preview?.att?.file_name} contentType={preview?.att?.content_type}
        url={preview?.url} loading={preview?.loading} error={preview?.error} />
    </>
  );
}
