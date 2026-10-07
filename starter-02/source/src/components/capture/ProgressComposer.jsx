// ============================================================
// Progress composer — the reporter's own account of what happened on site.
//
// A progress report is not an inspection, a measurement or an approval. It is
// what the person standing there says, with photos if they have them, and the
// office decides what it is worth. Nothing here certifies anything.
//
// Three things the test service deliberately does not do, so the composer must:
//   * requestId correlates an answer with its request. It is not an idempotency
//     key and the service does not de-duplicate, so a second send while one is
//     pending has to be stopped here.
//   * A failure keeps everything. Retry sends the same report, unchanged.
//   * A late answer is ignored unless it belongs to the submission still on
//     screen and to the project the reporter is still in.
//
// requestId is built without crypto.randomUUID on purpose: on a phone reaching
// the dev server over a LAN address the page is not a secure context and that
// API is absent, which is exactly where this screen is meant to be used.
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, ChevronLeft, Loader2, Trash2 } from 'lucide-react';
import { FIELD } from '../../lib/fieldTokens.js';
import { getCurrentProjectId } from '../../lib/currentProject.js';
import { useProject } from '../../lib/project.jsx';
import { prepareEvidenceImage } from '../../lib/evidenceImagePreparation.js';
import {
  submitProgressReport, FIELD_STATUS_LABELS, REFERENCE_TYPE_LABELS,
  PROGRESS_REPORT_LIMITS, PROGRESS_REFERENCE_FIXTURES, ACK_NOTE,
} from '../../pilot/progressReports.js';

const MB = (n) => `${(n / 1_000_000).toFixed(1)}MB`;
const IMAGE_ERRORS = {
  SOURCE_TOO_LARGE: 'That photo is too large to prepare. Take it again at a smaller size.',
  CANNOT_MEET_SIZE_LIMIT: `That photo cannot be brought under ${MB(PROGRESS_REPORT_LIMITS.maxPhotoBytes)}.`,
  DECODE_FAILED: 'That file could not be read as a photo.',
  ENCODE_FAILED: 'That photo could not be prepared.',
  TIMEOUT: 'Preparing that photo took too long. Try again.',
  ABORTED: 'Preparing that photo stopped before it finished.',
};

let requestSeq = 0;
const newRequestId = () => `pr-${Date.now().toString(36)}-${(requestSeq += 1).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const refOptions = (projectId) => {
  const out = [{ key: 'none', label: 'None', value: null }];
  for (const type of ['area', 'work_item']) {
    for (const f of PROGRESS_REFERENCE_FIXTURES[type] ?? []) {
      if (f.projectId !== projectId) continue;
      out.push({ key: `${type}:${f.id}`, label: `${REFERENCE_TYPE_LABELS[type]} · ${f.id}`, value: { type, id: f.id } });
    }
  }
  return out;
};

const Label = ({ children, hint }) => (
  <div style={{ marginBottom: 8 }}>
    <div style={{ fontSize: 13, fontWeight: 600, color: FIELD.inkSoft }}>{children}</div>
    {hint && <div style={{ fontSize: 12.5, color: FIELD.mute, marginTop: 2 }}>{hint}</div>}
  </div>
);
const Card = ({ children, style }) => (
  <div style={{ background: FIELD.surface, borderRadius: 14, padding: 16, marginBottom: 16, ...style }}>{children}</div>
);
const Primary = ({ children, ...rest }) => (
  <button type="button" {...rest} style={{ width: '100%', minHeight: 52, borderRadius: 12, background: FIELD.ink, color: FIELD.onDark, fontSize: 16, fontWeight: 600, opacity: rest.disabled ? 0.45 : 1, ...rest.style }}>{children}</button>
);
const Secondary = ({ children, ...rest }) => (
  <button type="button" {...rest} style={{ width: '100%', minHeight: 48, borderRadius: 12, background: 'transparent', border: `1px solid ${FIELD.mute}`, color: FIELD.ink, fontSize: 15, fontWeight: 600, marginTop: 10, opacity: rest.disabled ? 0.45 : 1, ...rest.style }}>{children}</button>
);

export function ProgressComposer({ onDone }) {
  // The id is what the service is given. The reporter is shown the name, because a
  // UUID tells a site engineer nothing about which project they are standing on.
  const projectId = getCurrentProjectId();
  const { project } = useProject();
  const projectLabel = project?.name || projectId;
  const options = useMemo(() => refOptions(projectId), [projectId]);

  const [step, setStep] = useState('compose');      // compose · review · sending · error · ack
  const [refKey, setRefKey] = useState('none');     // the frames open on None
  const [description, setDescription] = useState('');
  const [fieldStatus, setFieldStatus] = useState(null);  // nothing pre-selected
  const [blockerNote, setBlockerNote] = useState('');
  const [photos, setPhotos] = useState([]);         // { id, candidate, name }
  const [photoMessage, setPhotoMessage] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [failure, setFailure] = useState('');

  const fileRef = useRef(null);
  const sendingRef = useRef(false);                 // the guard the service does not provide
  const liveRef = useRef(true);
  useEffect(() => { liveRef.current = true; return () => { liveRef.current = false; }; }, []);
  // One id for one report. A retry is that report sent again; an edited report is
  // a different report and gets a different id rather than inheriting one silently.
  const requestIdRef = useRef(null);
  const signedRef = useRef(null);
  const slotsRef = useRef(0);
  const photosRef = useRef(photos);
  useEffect(() => { photosRef.current = photos; }, [photos]);

  const reference = options.find((o) => o.key === refKey)?.value ?? null;
  const preparing = photos.some((p) => p.preparing);
  const ready = description.trim().length > 0 && fieldStatus !== null && !preparing;

  // A photo takes its slot when it is picked, not when it finishes preparing.
  // Counted on a ref so several quick picks cannot all read the same stale length,
  // and held as a visible row so the limit, the removal and the review all see the
  // same report. Nothing can arrive late into a report that has already been read.
  const addPhoto = useCallback(async (file) => {
    if (!file) return;
    if (slotsRef.current >= PROGRESS_REPORT_LIMITS.maxPhotos) {
      setPhotoMessage(`${PROGRESS_REPORT_LIMITS.maxPhotos} photos is the most a report carries.`);
      return;
    }
    slotsRef.current += 1;
    const slot = newRequestId();
    const pickedProject = projectId;
    setPhotos((list) => [...list, { id: slot, candidate: null, name: file.name || 'photo', preparing: true }]);
    setPhotoMessage('');

    let prepared;
    try { prepared = await prepareEvidenceImage(file); }
    catch { prepared = { ok: false, error: { code: 'ENCODE_FAILED' } }; }

    const drop = () => { slotsRef.current = Math.max(0, slotsRef.current - 1); setPhotos((l) => l.filter((x) => x.id !== slot)); };
    // gone screen, abandoned slot, or a different project: the result belongs to none of them
    if (!liveRef.current) return;
    if (pickedProject !== getCurrentProjectId()) { drop(); return; }
    if (!photosRef.current.some((x) => x.id === slot)) { slotsRef.current = Math.max(0, slotsRef.current - 1); return; }
    if (!prepared.ok) {
      drop();
      setPhotoMessage(IMAGE_ERRORS[prepared.error?.code] ?? 'That photo could not be prepared.');
      return;
    }
    setPhotos((l) => l.map((x) => (x.id === slot ? { ...x, candidate: prepared.candidate, preparing: false } : x)));
  }, [projectId]);

  const send = useCallback(async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    const sentProject = projectId;
    const sig = JSON.stringify([reference, description, fieldStatus, blockerNote.trim() || null,
      photos.map((x) => `${x.name}:${x.candidate?.size ?? 0}`)]);
    if (requestIdRef.current === null || signedRef.current !== sig) {
      requestIdRef.current = newRequestId();      // a different report, not a retry of the last one
      signedRef.current = sig;
    }
    const id = requestIdRef.current;
    setFailure('');
    setStep('sending');
    try {
      const answer = await submitProgressReport({
        requestId: id,
        projectId: sentProject,
        reference,
        description,
        fieldStatus,
        blockerNote: blockerNote.trim() ? blockerNote : null,
        photos: photos.map((p) => p.candidate),
      });
      // A late answer belongs to the request that asked and to the project it was
      // sent from. Anything else is dropped rather than shown to the wrong reporter.
      if (!liveRef.current || answer.requestId !== requestIdRef.current || sentProject !== getCurrentProjectId()) return;
      setReceipt(answer.receipt);
      setStep('ack');
    } catch (err) {
      if (!liveRef.current || sentProject !== getCurrentProjectId()) return;
      setFailure(err?.code === 'SIMULATED_FAILURE'
        ? 'Not sent. The test service refused this one.'
        : `Not sent. ${err?.message ?? 'The test service could not take this report.'}`);
      setStep('error');
    } finally {
      sendingRef.current = false;
    }
  }, [projectId, reference, description, fieldStatus, blockerNote, photos]);

  const busy = step === 'sending';

  if (step === 'ack') {
    return (
      <div style={{ padding: '28px 20px', color: FIELD.ink }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Check size={22} /><h1 style={{ fontSize: 26, fontWeight: 600, margin: 0 }}>Sent</h1>
        </div>
        <Card>
          <p data-ack-note style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{ACK_NOTE}</p>
          {receipt?.id && <p style={{ margin: '10px 0 0', fontSize: 13, color: FIELD.mute }}>Receipt {receipt.id} · {receipt.photoCount} photo{receipt.photoCount === 1 ? '' : 's'}</p>}
        </Card>
        <Primary data-progress-done onClick={() => onDone?.()}>Done</Primary>
      </div>
    );
  }

  if (step === 'review' || step === 'sending' || step === 'error') {
    const chosen = options.find((o) => o.key === refKey);
    return (
      <div style={{ padding: '28px 20px', color: FIELD.ink }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, margin: '0 0 6px' }}>Check before sending</h1>
        <p style={{ fontSize: 13.5, color: FIELD.mute, margin: '0 0 20px' }}>This is exactly what goes to the test service.</p>

        {failure && <Card data-progress-error style={{ background: '#FDECEC' }}><p style={{ margin: 0, fontSize: 15 }}>{failure}</p><p style={{ margin: '6px 0 0', fontSize: 13, color: FIELD.mute }}>Everything you entered is still here.</p></Card>}

        <Card>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 14px', fontSize: 14.5 }}>
            <dt style={{ color: FIELD.mute }}>Project</dt><dd style={{ margin: 0 }}>{projectLabel}</dd>
            <dt style={{ color: FIELD.mute }}>Reference</dt><dd style={{ margin: 0 }}>{chosen?.label ?? 'None'}</dd>
            <dt style={{ color: FIELD.mute }}>Status</dt><dd style={{ margin: 0 }}>{FIELD_STATUS_LABELS[fieldStatus]}</dd>
            <dt style={{ color: FIELD.mute }}>Description</dt><dd style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{description}</dd>
            {blockerNote.trim() && <><dt style={{ color: FIELD.mute }}>Blocker</dt><dd style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{blockerNote}</dd></>}
            <dt style={{ color: FIELD.mute }}>Photos</dt><dd style={{ margin: 0 }}>{photos.length === 0 ? 'None' : photos.map((p) => `${p.name} (${MB(p.candidate.size)})`).join(', ')}</dd>
          </dl>
        </Card>

        <Primary data-progress-send onClick={send} disabled={busy}>
          {busy ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Loader2 size={16} /> Sending…</span> : (step === 'error' ? 'Retry' : 'Send to test service')}
        </Primary>
        <Secondary data-progress-back onClick={() => setStep('compose')} disabled={busy}><ChevronLeft size={15} style={{ verticalAlign: '-2px' }} /> Back to edit</Secondary>
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 20px', color: FIELD.ink }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, margin: '0 0 6px' }}>Report progress</h1>
      <p style={{ fontSize: 13.5, color: FIELD.mute, margin: '0 0 20px' }}>Your account of the work. It does not approve or certify anything.</p>

      <Card>
        <Label hint="Taken from the project you are in.">Project</Label>
        <div data-progress-project style={{ fontSize: 15, fontWeight: 600 }}>{projectLabel}</div>
      </Card>

      <Card>
        <Label hint="Optional. A report does not need one.">Reference</Label>
        <select data-progress-reference value={refKey} onChange={(e) => setRefKey(e.target.value)} aria-label="Reference"
          style={{ width: '100%', minHeight: 48, borderRadius: 10, border: `1px solid ${FIELD.mute}`, background: '#fff', color: FIELD.ink, fontSize: 15, padding: '0 12px' }}>
          {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </Card>

      <Card>
        <Label hint="Sent exactly as you type it.">Description</Label>
        <textarea data-progress-description value={description} onChange={(e) => setDescription(e.target.value)} rows={4} aria-label="Description"
          placeholder="What happened on site" style={{ width: '100%', borderRadius: 10, border: `1px solid ${FIELD.mute}`, padding: 12, fontSize: 15.5, lineHeight: 1.45, color: FIELD.ink, background: '#fff' }} />
      </Card>

      <Card>
        <Label hint="Your statement, not an inspection result.">Status</Label>
        <div style={{ display: 'grid', gap: 8 }}>
          {Object.entries(FIELD_STATUS_LABELS).map(([value, label]) => (
            <button key={value} type="button" data-progress-status={value} aria-pressed={fieldStatus === value} onClick={() => setFieldStatus(value)}
              style={{ minHeight: 48, borderRadius: 10, textAlign: 'start', padding: '0 14px', fontSize: 15.5, fontWeight: 600,
                border: `1px solid ${fieldStatus === value ? FIELD.ink : FIELD.mute}`,
                background: fieldStatus === value ? FIELD.ink : 'transparent',
                color: fieldStatus === value ? FIELD.onDark : FIELD.ink }}>{label}</button>
          ))}
        </div>
      </Card>

      <Card>
        <Label hint="Optional, whatever the status.">Blocker note</Label>
        <textarea data-progress-blocker value={blockerNote} onChange={(e) => setBlockerNote(e.target.value)} rows={2} aria-label="Blocker note"
          placeholder="What is holding it up" style={{ width: '100%', borderRadius: 10, border: `1px solid ${FIELD.mute}`, padding: 12, fontSize: 15.5, lineHeight: 1.45, color: FIELD.ink, background: '#fff' }} />
      </Card>

      <Card>
        <Label hint={`Up to ${PROGRESS_REPORT_LIMITS.maxPhotos}, each under ${MB(PROGRESS_REPORT_LIMITS.maxPhotoBytes)} once prepared.`}>Photos</Label>
        <input ref={fileRef} data-progress-photo-input type="file" accept="image/jpeg,image/png" style={{ display: 'none' }}
          onChange={(e) => { addPhoto(e.target.files?.[0]); e.target.value = ''; }} />
        {photos.map((p) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, borderTop: `1px solid ${FIELD.page}`, paddingTop: 8, marginTop: 8 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
            <span data-progress-photo-state={p.preparing ? 'preparing' : 'ready'} style={{ fontSize: 13, color: FIELD.mute }}>{p.preparing ? 'preparing…' : MB(p.candidate.size)}</span>
            <button type="button" data-progress-remove-photo={p.id} aria-label={`Remove ${p.name}`} onClick={() => { slotsRef.current = Math.max(0, slotsRef.current - 1); setPhotos((l) => l.filter((x) => x.id !== p.id)); }}
              style={{ minHeight: 44, minWidth: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: FIELD.ink }}><Trash2 size={17} /></button>
          </div>
        ))}
        <Secondary data-progress-add-photo onClick={() => fileRef.current?.click()} disabled={photos.length >= PROGRESS_REPORT_LIMITS.maxPhotos}>
          <Camera size={16} style={{ verticalAlign: '-3px', marginInlineEnd: 6 }} />Add a photo
        </Secondary>
        {photoMessage && <p data-progress-photo-message style={{ margin: '10px 0 0', fontSize: 13.5, color: FIELD.mute }}>{photoMessage}</p>}
      </Card>

      <Primary data-progress-review onClick={() => setStep('review')} disabled={!ready}>Review</Primary>
      {!ready && <p data-progress-not-ready style={{ margin: '10px 0 0', fontSize: 13.5, color: FIELD.mute }}>{preparing ? 'One photo is still being prepared. Review opens when it is ready.' : 'A description and a status are needed before you can review it.'}</p>}
    </div>
  );
}
