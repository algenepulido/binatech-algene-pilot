// ============================================================
// CaptureSheet — the approved Field Mode Target C → C2 → D → E flow.
//
// The phone starts in human task language, binds the capture to a real WIR,
// collects evidence through the operating-system camera/library pickers, then
// reviews and uploads through the same project-scoped attachment path used by
// the WIR drawer. Evidence never changes a certified or commercial value.
// ============================================================
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Boxes, Camera, Check, ChevronLeft, ChevronRight, ClipboardCheck,
  FileImage, Flag, HardHat, Image as ImageIcon, Images, Package, Truck, X,
} from 'lucide-react';
import { listWirs } from '../../api/wirs.js';
import { uploadAttachment } from '../../lib/attachments.js';
import { getCurrentProjectId, subscribeProject } from '../../lib/currentProject.js';
import { FIELD, MONO } from '../../lib/fieldTokens.js';
import { useProject } from '../../lib/project.jsx';
import { Surface, Rule, Eyebrow } from '../../views/field/surface.jsx';
import { LocalDraftCapture } from './LocalDraftCapture.jsx';

// Retained as the capture-kind catalogue used elsewhere in the app. The target
// entry screen deliberately exposes only the two user tasks below.
export const CAPTURE_TYPES = [
  { key: 'wir', label: 'Scan a WIR', sub: 'Work inspection request document', icon: ClipboardCheck, tint: '#16211F' },
  { key: 'finished', label: 'Finished works', sub: 'Photo of completed work', icon: HardHat, tint: '#0891b2' },
  { key: 'snag', label: 'Update a snag', sub: 'Defect / punch-list photo', icon: Flag, tint: '#d97706' },
  { key: 'drawing', label: 'Upload a drawing', sub: 'Shop / IFC drawing sheet', icon: FileImage, tint: '#7c3aed' },
  { key: 'sdn', label: 'Delivery note (SDN)', sub: 'Supplier delivery note', icon: Truck, tint: '#0891b2' },
  { key: 'mir', label: 'Material evidence (MIR)', sub: 'Material inspection / receipt', icon: Package, tint: '#b45309' },
  { key: 'photo', label: 'Add photo evidence', sub: 'General site photo', icon: ImageIcon, tint: '#16a34a' },
  { key: 'element', label: 'Link model element', sub: 'Attach evidence to a BIM element · optional', icon: Boxes, tint: '#4f46e5' },
];

export const ENTRY_OPTIONS = [
  { key: 'progress', icon: Camera, labelKey: 'fmWorkProgress', label: 'Work progress', subKey: 'fmWorkProgressSub', sub: 'Photos of what has been built' },
  { key: 'inspection', icon: ClipboardCheck, labelKey: 'fmInspectionRequest', label: 'Inspection request', subKey: 'fmInspectionRequestSub', sub: 'Ask for work to be inspected' },
];

const initialContext = { zone: '', gridline: '', activity: '' };
const fileKey = (file) => `${file.name}:${file.size}:${file.lastModified}`;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export function CaptureSheet({ open, onClose, onNavigate, t = {}, lang = 'en', linkedWir = null, canCapture = true }) {
  const ar = lang === 'ar';
  const eligible = open && canCapture;
  const Back = ar ? ChevronRight : ChevronLeft;
  const { project } = useProject();
  const libraryRef = useRef(null);
  const cameraRef = useRef(null);
  const previewUrls = useRef(new Set());
  const linkedWirAtOpen = useRef(null);
  const uploadSequence = useRef(0);
  const readProjectId = useRef(getCurrentProjectId());
  const committedEligibility = useRef(eligible);
  const openingSession = eligible && !committedEligibility.current;
  const [step, setStep] = useState('entry');
  const [wirsRead, setWirsRead] = useState({ projectId: null, status: 'idle', rows: [] });
  const [wirsRetry, setWirsRetry] = useState(0);
  const [wirId, setWirId] = useState('');
  const [context, setContext] = useState(initialContext);
  const [contextProjectId, setContextProjectId] = useState(null);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [attachmentTarget, setAttachmentTarget] = useState(null);
  const [savedTarget, setSavedTarget] = useState(null);
  const captureDraftActive = useRef(false);
  captureDraftActive.current = files.length > 0 || !!attachmentTarget || ['evidence', 'review', 'saving', 'saved'].includes(step);

  useLayoutEffect(() => {
    committedEligibility.current = eligible;
  }, [eligible]);

  const readMatchesProject = wirsRead.projectId === getCurrentProjectId();
  const wirs = readMatchesProject ? wirsRead.rows : [];
  const wirsStatus = readMatchesProject ? wirsRead.status : 'loading';
  const wirsLoading = wirsStatus === 'loading' || wirsStatus === 'idle';
  const selectedWir = wirs.find((w) => String(w.id) === String(wirId)) || null;
  const activeAttachmentTarget = attachmentTarget?.projectId === getCurrentProjectId() ? attachmentTarget : null;
  const activeSavedTarget = savedTarget?.projectId === getCurrentProjectId() ? savedTarget : null;
  const reviewTarget = activeAttachmentTarget || selectedWir;
  const renderContext = contextProjectId === getCurrentProjectId() ? context : initialContext;
  const draftStep = ['evidence', 'review', 'saving', 'saved'].includes(step);
  const renderStep = draftStep && (
    openingSession
    || contextProjectId !== getCurrentProjectId()
    || (step === 'saved' && !activeSavedTarget)
  ) ? 'entry' : step;
  const projectLabel = [project?.name, project?.code].filter(Boolean).join(' · ') || (t.fmProject || 'Project');
  const wirsCopy = ar ? {
    loading: 'جارٍ تحميل طلبات الفحص…',
    empty: 'لا توجد طلبات فحص لهذا المشروع.',
    errorTitle: 'تعذّر تحميل طلبات الفحص.',
    errorBody: 'تحقق من اتصالك وحاول مرة أخرى.',
    retry: 'إعادة المحاولة',
  } : {
    loading: 'Loading inspections…',
    empty: 'No inspections found for this project.',
    errorTitle: 'Couldn’t load inspections.',
    errorBody: 'Check your connection and try again.',
    retry: 'Retry',
  };

  function bindWir(wir) {
    if (!wir) return;
    setWirId(String(wir.id));
    setContextProjectId(getCurrentProjectId());
    setContext((current) => ({
      zone: wir.location || current.zone,
      gridline: current.gridline,
      activity: wir.inspection_type || current.activity,
    }));
  }

  useEffect(() => {
    if (!open || !canCapture) return undefined;
    uploadSequence.current += 1;
    for (const url of previewUrls.current) URL.revokeObjectURL?.(url);
    previewUrls.current.clear();
    setStep('entry'); setFiles([]); setError(''); setContext(initialContext);
    setAttachmentTarget(null); setSavedTarget(null);
    setContextProjectId(getCurrentProjectId());
    setWirId('');
    linkedWirAtOpen.current = linkedWir;
    return () => {
      uploadSequence.current += 1;
      for (const url of previewUrls.current) URL.revokeObjectURL?.(url);
      previewUrls.current.clear();
    };
  // linkedWir is intentionally sampled when the sheet opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canCapture]);

  useEffect(() => {
    if (!open || !canCapture) return undefined;
    let alive = true;
    let requestSequence = 0;

    const loadWirs = (projectId) => {
      const requestId = ++requestSequence;
      const projectChanged = readProjectId.current !== projectId;
      readProjectId.current = projectId;
      if (projectChanged) {
        uploadSequence.current += 1;
        if (captureDraftActive.current) setStep('entry');
        setFiles([]); setError('');
        setAttachmentTarget(null); setSavedTarget(null);
      }
      setWirsRead({ projectId, status: 'loading', rows: [] });
      setWirId('');
      setContext(initialContext);
      setContextProjectId(projectId);
      listWirs(projectId).then((rows) => {
        if (!alive || requestId !== requestSequence) return;
        const next = Array.isArray(rows) ? rows : [];
        setWirsRead({ projectId, status: 'success', rows: next });
        const linked = next.find((wir) => String(wir.id) === String(linkedWirAtOpen.current?.id));
        bindWir(linked || next[0]);
      }).catch(() => {
        if (!alive || requestId !== requestSequence) return;
        setWirsRead({ projectId, status: 'error', rows: [] });
      });
    };

    loadWirs(getCurrentProjectId());
    const unsubscribe = subscribeProject(loadWirs);
    return () => {
      alive = false;
      requestSequence += 1;
      unsubscribe();
    };
  // bindWir and linkedWir are intentionally sampled through linkedWirAtOpen.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canCapture, wirsRetry]);

  useEffect(() => {
    if (!open || !canCapture) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape' && step !== 'saving') onClose?.(); };
    document.addEventListener('keydown', closeOnEscape);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previous;
    };
  }, [open, canCapture, onClose, step]);

  if (!open || !canCapture) return null;

  function addFiles(list) {
    const candidates = [...(list || [])];
    const incoming = candidates.filter((file) => file?.size > 0 && file.size <= MAX_IMAGE_BYTES && /^image\//.test(file.type || ''));
    setFiles((current) => {
      const known = new Set(current.map((item) => item.key));
      return [...current, ...incoming.filter((file) => !known.has(fileKey(file))).map((file) => {
        const preview = URL.createObjectURL?.(file) || null;
        if (preview) previewUrls.current.add(preview);
        return { key: fileKey(file), file, preview, status: 'pending' };
      })];
    });
    const oversized = candidates.some((file) => file?.size > MAX_IMAGE_BYTES);
    setError(oversized
      ? (t.fmImageTooLarge || 'Each image must be 25 MB or smaller.')
      : (incoming.length ? '' : (t.fmImageOnly || 'Choose a non-empty image.')));
  }

  function onPicked(event) {
    addFiles(event.target.files);
    event.target.value = '';
  }

  function goBack() {
    if (step === 'saving') return;
    if (step === 'context') setStep('entry');
    else if (step === 'evidence') setStep('context');
    else if (step === 'review' || step === 'saving') setStep('evidence');
    else onClose?.();
    setError('');
  }

  async function saveEvidence() {
    const target = activeAttachmentTarget || (selectedWir ? {
      id: selectedWir.id,
      wir_number: selectedWir.wir_number || selectedWir.id,
      projectId: getCurrentProjectId(),
    } : null);
    if (!target || !files.length || step === 'saving') return;
    const operationId = ++uploadSequence.current;
    if (!activeAttachmentTarget) setAttachmentTarget(target);
    setStep('saving'); setError('');
    const failed = [];
    for (const item of files) {
      if (item.status === 'uploaded') continue;
      try {
        await uploadAttachment({ recordType: 'wir', recordId: target.id, file: item.file });
        if (operationId !== uploadSequence.current || getCurrentProjectId() !== target.projectId) return;
        setFiles((current) => current.map((x) => x.key === item.key ? { ...x, status: 'uploaded', error: null } : x));
      } catch (uploadError) {
        if (operationId !== uploadSequence.current || getCurrentProjectId() !== target.projectId) return;
        failed.push(item.key);
        setFiles((current) => current.map((x) => x.key === item.key
          ? { ...x, status: 'error', error: uploadError?.message || String(uploadError) } : x));
      }
    }
    if (operationId !== uploadSequence.current || getCurrentProjectId() !== target.projectId) return;
    if (failed.length) {
      setError(t.fmUploadFailed || 'Attachment wasn’t completed for all files. Retry failed files.');
      setStep('review');
    } else {
      setSavedTarget(target);
      setStep('saved');
    }
  }

  const headerTitle = {
    local: t.localDraft?.title || (ar ? 'مسودة محلية' : 'Local draft'),
    entry: t.mNavCapture || 'Capture',
    context: t.fmWorkProgress || 'Work progress',
    evidence: t.fmEvidence || 'Evidence',
    review: t.fmReview || 'Review',
    saving: t.fmReview || 'Review',
    saved: t.fmEvidenceSaved || 'Evidence uploaded',
  }[renderStep];

  return (
    <div className="fixed inset-0 z-[90] flex flex-col justify-end" role="dialog" aria-modal="true"
      aria-label={t.mNavCapture || 'Capture'} dir={ar ? 'rtl' : 'ltr'}>
      <div className="absolute inset-0 bg-black/45" onClick={renderStep === 'saving' ? undefined : onClose} />
      <div className="relative max-h-[96vh] flex flex-col" style={{ background: renderStep === 'evidence' ? FIELD.camera : FIELD.page, borderRadius: '20px 20px 0 0', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center gap-2 flex-none" style={{ minHeight: 58, padding: '4px 12px 6px', background: renderStep === 'evidence' ? FIELD.ink : FIELD.surface, color: renderStep === 'evidence' ? FIELD.onDark : FIELD.ink }}>
          {renderStep === 'entry' ? <span className="w-12" /> : (
            <button onClick={goBack} disabled={renderStep === 'saving'} aria-label={t.back || 'Back'} className="flex items-center justify-center" style={{ width: 48, height: 48, borderRadius: FIELD.rControl, opacity: renderStep === 'saving' ? .4 : 1 }}>
              <Back size={21} />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 16, fontWeight: 600 }}>{headerTitle}</div>
            {renderStep === 'evidence' && <div dir="ltr" className="truncate" style={{ fontFamily: MONO, fontSize: 11.5, opacity: .65 }}>
              {[renderContext.zone, renderContext.gridline, renderContext.activity].filter(Boolean).join(' · ')}
            </div>}
          </div>
          <button onClick={onClose} disabled={renderStep === 'saving'} aria-label={t.cancel || 'Cancel'} className="flex items-center justify-center" style={{ minWidth: 48, height: 48, padding: '0 8px', borderRadius: FIELD.rControl, fontSize: 15, opacity: renderStep === 'saving' ? .4 : 1 }}>
            {renderStep === 'entry' ? (t.cancel || 'Cancel') : <X size={20} />}
          </button>
        </div>
        <div style={{ height: 1, background: renderStep === 'evidence' ? 'rgba(250,250,247,.12)' : FIELD.hair }} />

        {renderStep === 'entry' && (
          <div className="overflow-y-auto" style={{ padding: '28px 20px 30px' }}>
            <h1 style={{ fontSize: 31, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1.2, margin: '0 0 6px' }}>{t.fmWhatRecording || 'What are you recording?'}</h1>
            <div style={{ fontSize: 14.5, color: FIELD.mute, marginBottom: 26 }}>{projectLabel}</div>
            <div className="flex flex-col" style={{ gap: 12 }}>
              {ENTRY_OPTIONS.map((option) => {
                const Icon = option.icon;
                return <button key={option.key} data-capture-option onClick={() => {
                  if (option.key === 'inspection') { onNavigate?.('wirs'); onClose?.(); }
                  else setStep('context');
                }} className="w-full text-start flex items-center" style={{ background: FIELD.surface, borderRadius: FIELD.rSurface, border: 0, minHeight: 92, padding: 20, gap: 16 }}>
                  <span className="flex items-center justify-center flex-none" style={{ width: 44, height: 44, borderRadius: FIELD.rControl, background: FIELD.ink, color: FIELD.onDark }}><Icon size={22} /></span>
                  <span className="flex-1 min-w-0"><span className="block" style={{ fontSize: 18, fontWeight: 600 }}>{t[option.labelKey] || option.label}</span><span className="block" style={{ fontSize: 13.5, color: FIELD.mute, marginTop: 3 }}>{t[option.subKey] || option.sub}</span></span>
                </button>;
              })}
            </div>
            <Rule />
            <button data-local-draft-entry onClick={() => setStep('local')} style={{ minHeight: 48, marginTop: 18, padding: '10px 16px', borderRadius: FIELD.rControl, background: FIELD.ink, color: FIELD.onDark, fontSize: 15, fontWeight: 600 }}>{t.localDraft?.title || (ar ? 'مسودة محلية' : 'Local draft')}</button>
            <p style={{ marginTop: 8, fontSize: 13.5, color: FIELD.mute }}>{t.localDraft?.entryHint || (ar ? 'ملاحظات وصور محفوظة في هذا المتصفح فقط.' : 'Notes and photos saved in this browser only.')}</p>
          </div>
        )}

        {renderStep === 'local' && <LocalDraftCapture lang={lang} />}

        {renderStep === 'context' && (
          <div className="overflow-y-auto" style={{ padding: '28px 20px 28px', color: FIELD.ink }}>
            <h1 style={{ fontSize: 29, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1.2, margin: '0 0 24px' }}>{t.fmWhereAndWhat || 'Where and what'}</h1>
            <Surface style={{ marginBottom: 20 }}>
              <label className="flex items-center gap-3" style={{ minHeight: 66, padding: '10px 17px' }}><span style={{ width: 76, color: FIELD.mute, fontSize: 13.5 }}>{t.fmLinkedWir || 'WIR'}</span><select data-context-wir value={wirId} onChange={(event) => bindWir(wirs.find((w) => String(w.id) === event.target.value))} disabled={wirsStatus !== 'success' || !wirs.length || !!activeAttachmentTarget} className="flex-1 min-w-0 bg-transparent outline-none" style={{ minHeight: 44, fontSize: 16, fontWeight: 500 }}><option value="">{wirsLoading ? (t.loading || 'Loading…') : (t.fmChooseWir || 'Choose a WIR')}</option>{wirs.map((wir) => <option key={wir.id} value={wir.id}>{wir.wir_number || wir.id}</option>)}</select></label>
              <Rule />
              {[['zone', t.fmZone || 'Zone'], ['gridline', t.fmGridline || 'Gridline'], ['activity', t.fmActivity || 'Activity']].map(([key, label]) => <div key={key}><label className="flex items-center gap-3" style={{ minHeight: 66, padding: '10px 17px' }}><span style={{ width: 76, color: FIELD.mute, fontSize: 13.5 }}>{label}</span><input data-context-field={key} value={renderContext[key]} onChange={(event) => { setContextProjectId(getCurrentProjectId()); setContext((current) => ({ ...current, [key]: event.target.value })); }} className="flex-1 min-w-0 bg-transparent outline-none" dir={key === 'gridline' ? 'ltr' : undefined} style={{ minHeight: 44, fontSize: 16, fontWeight: 500 }} /></label>{key !== 'activity' && <Rule />}</div>)}
            </Surface>
            <div style={{ color: FIELD.mute, fontSize: 13.5, lineHeight: 1.5, margin: '-8px 3px 18px' }}>{t.fmContextLocalOnly || 'Reference only. Zone, gridline and activity are not uploaded.'}</div>
            {wirsLoading && <div role="status" style={{ color: FIELD.mute, fontSize: 13.5, margin: '-8px 3px 18px' }}>{wirsCopy.loading}</div>}
            {wirsStatus === 'success' && !wirs.length && <div role="status" style={{ color: FIELD.mute, fontSize: 13.5, margin: '-8px 3px 18px' }}>{wirsCopy.empty}</div>}
            {wirsStatus === 'error' && <div role="alert" style={{ color: FIELD.fail, fontSize: 13.5, lineHeight: 1.5, margin: '-8px 3px 18px' }}><strong className="block" style={{ fontWeight: 600 }}>{wirsCopy.errorTitle}</strong><span className="block">{wirsCopy.errorBody}</span><button type="button" onClick={() => setWirsRetry((value) => value + 1)} className="font-semibold underline" style={{ marginTop: 8 }}>{wirsCopy.retry}</button></div>}
            <Eyebrow>{t.fmLinkedWork || 'Linked work'}</Eyebrow>
            <Surface style={{ minHeight: 72, padding: '15px 17px', marginBottom: 24 }}>
              {selectedWir ? <div className="flex items-center gap-3"><span className="flex-1 min-w-0"><span className="block truncate" style={{ fontSize: 15.5, fontWeight: 500 }}>{selectedWir.inspection_type || renderContext.activity || (t.fmWorkProgress || 'Work progress')}</span><span className="block" dir="ltr" style={{ fontFamily: MONO, fontSize: 12, color: FIELD.mute, marginTop: 3 }}>{selectedWir.wir_number || selectedWir.id}</span></span><span className="flex items-center justify-center" style={{ width: 22, height: 22, borderRadius: 11, background: FIELD.ink, color: FIELD.onDark }}><Check size={13} /></span></div> : <span style={{ color: FIELD.mute }}>{t.fmChooseWirFirst || 'Choose a WIR to bind this evidence.'}</span>}
            </Surface>
            <button onClick={() => setStep('evidence')} disabled={!selectedWir || !renderContext.activity} className="w-full flex items-center justify-center" style={{ minHeight: 54, borderRadius: FIELD.rControl, background: FIELD.ink, color: FIELD.onDark, fontSize: 16, fontWeight: 600, opacity: (!selectedWir || !renderContext.activity) ? .45 : 1 }}>{t.fmAddEvidence || 'Add evidence'}</button>
          </div>
        )}

        {renderStep === 'evidence' && (
          <div className="flex-1 min-h-[520px] flex flex-col" style={{ color: FIELD.onDark }}>
            <div className="flex-1 relative flex items-center justify-center" style={{ background: FIELD.camera, minHeight: 310 }}>
              <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', opacity: .42 }}>{files.length ? (t.fmEvidenceSelected || 'Evidence selected') : (t.fmCameraPrompt || 'Use camera or photo library')}</div>
              {!!files.length && <div className="absolute flex gap-2" style={{ insetInlineStart: 20, bottom: 20 }}>{files.slice(0, 3).map((item) => <span key={item.key} title={item.file.name} className="flex items-center justify-center overflow-hidden" style={{ width: 52, height: 52, borderRadius: FIELD.rControl, background: 'rgba(250,250,247,.16)' }}>{item.preview ? <img src={item.preview} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={20} />}</span>)}</div>}
            </div>
            <div className="flex items-center justify-between gap-5" style={{ padding: '24px 20px 0' }}>
              <button onClick={() => libraryRef.current?.click()} aria-label={t.fmPhotoLibrary || 'Photo library'} className="flex items-center justify-center" style={{ width: 56, height: 56, borderRadius: FIELD.rControl, background: 'rgba(250,250,247,.12)' }}><Images size={22} /></button>
              <button onClick={() => cameraRef.current?.click()} aria-label={t.fmTakePhoto || 'Take photo'} className="flex items-center justify-center" style={{ width: 82, height: 82, borderRadius: 41, background: FIELD.onDark, color: FIELD.ink }}><Camera size={28} /></button>
              <button onClick={() => setStep('review')} disabled={!files.length} aria-label={t.done || 'Done'} className="flex items-center justify-center" style={{ width: 56, height: 56, borderRadius: FIELD.rControl, background: 'rgba(250,250,247,.12)', opacity: files.length ? 1 : .35 }}><Check size={22} /></button>
              <input data-library-input ref={libraryRef} hidden type="file" accept="image/*" multiple onChange={onPicked} />
              <input data-camera-input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" multiple onChange={onPicked} />
            </div>
            <div className="text-center" style={{ padding: '16px 20px 20px', fontSize: 13.5, opacity: .58 }}>{(t.fmPhotosSelected || '{n} photo(s) selected on this device').replace('{n}', files.length)}</div>
            {error && <div role="alert" style={{ padding: '0 20px 18px', color: '#fecaca', textAlign: 'center' }}>{error}</div>}
          </div>
        )}

        {(renderStep === 'review' || renderStep === 'saving') && (
          <div className="overflow-y-auto" style={{ padding: '26px 20px 28px', color: FIELD.ink }}>
            <h1 style={{ fontSize: 29, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1.2, margin: '0 0 20px' }}>{t.fmThisWillBeSaved || 'Files to upload'}</h1>
            <div className="flex gap-2 overflow-hidden" style={{ marginBottom: 20 }}>{files.slice(0, 4).map((item) => <span key={item.key} title={item.file.name} className="flex items-center justify-center flex-none overflow-hidden" style={{ width: 74, height: 74, borderRadius: FIELD.rControl, background: item.status === 'error' ? 'rgba(140,47,38,.14)' : 'rgba(22,33,31,.1)', color: item.status === 'error' ? FIELD.fail : FIELD.mute }}>{item.preview ? <img src={item.preview} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={22} />}</span>)}</div>
            <Surface>
              <div className="flex items-baseline gap-3" style={{ padding: '13px 17px' }}><span style={{ width: 84, fontSize: 13.5, color: FIELD.mute }}>{t.fmLinkedTo || 'Linked to'}</span><span dir="ltr" className="flex-1" style={{ fontFamily: MONO, fontSize: 15, fontWeight: 500, lineHeight: 1.4 }}>{reviewTarget?.wir_number || reviewTarget?.id || '—'}</span></div>
            </Surface>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: FIELD.dim, margin: '18px 3px 20px' }}>{t.fmEvidenceTruth || 'Only evidence files and the inspection link are uploaded. Reference edits are not saved. Certified value is unchanged.'}</p>
            {error && <div role="alert" style={{ color: FIELD.fail, fontSize: 13.5, marginBottom: 12 }}>{error}</div>}
            <button onClick={saveEvidence} disabled={renderStep === 'saving'} className="w-full flex items-center justify-center" style={{ minHeight: 54, borderRadius: FIELD.rControl, background: FIELD.ink, color: FIELD.onDark, fontSize: 16, fontWeight: 600, opacity: renderStep === 'saving' ? .6 : 1 }}>{renderStep === 'saving' ? (t.fmUploading || 'Uploading…') : (t.fmSaveToWir || 'Upload evidence')}</button>
          </div>
        )}

        {renderStep === 'saved' && <div className="flex flex-col items-center text-center" style={{ padding: '44px 24px 48px', color: FIELD.ink }}><span className="flex items-center justify-center" style={{ width: 56, height: 56, borderRadius: 28, background: FIELD.ink, color: FIELD.onDark, marginBottom: 14 }}><Check size={27} /></span><h1 style={{ fontSize: 25, fontWeight: 600, margin: '0 0 8px' }}>{t.fmEvidenceSaved || 'Evidence uploaded'}</h1><p style={{ color: FIELD.mute, margin: '0 0 22px' }}>{(t.fmEvidenceSavedSub || 'Uploaded and linked to {wir}. Certified value is unchanged.').replace('{wir}', activeSavedTarget.wir_number || activeSavedTarget.id)}</p><button onClick={onClose} style={{ minHeight: 48, minWidth: 120, borderRadius: FIELD.rControl, background: FIELD.ink, color: FIELD.onDark, fontWeight: 600 }}>{t.done || 'Done'}</button></div>}
      </div>
    </div>
  );
}
