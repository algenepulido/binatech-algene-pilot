import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAuth } from '../../lib/auth.jsx';
import { getCurrentProjectId, subscribeProject } from '../../lib/currentProject.js';
import { listWirs } from '../../api/wirs.js';
import { FIELD } from '../../lib/fieldTokens.js';
import { T } from '../../i18n/translations.js';
import { buildLocalDraft, readLocalDraft, writeLocalDraft, discardLocalDraft, MAX_LOCAL_FILE_BYTES } from '../../lib/localFieldDrafts.js';

const control = { minHeight: 48, padding: '10px 14px', borderRadius: FIELD.rControl, fontSize: 15, overflowWrap: 'anywhere' };
const primary = { ...control, background: FIELD.ink, color: FIELD.onDark, fontWeight: 600 };

export function LocalDraftCapture({ lang = 'en' }) {
  const { user, isAuthenticated } = useAuth();
  const projectId = useSyncExternalStore(subscribeProject, getCurrentProjectId, getCurrentProjectId);
  const copy = T[lang === 'ar' ? 'ar' : 'en'].localDraft;
  const ownerUserScope = isAuthenticated && typeof user?.id === 'string' ? user.id : '';
  // Keyed lifetimes discard in-memory content in the first render of a new
  // identity/project; persisted drafts are never a source of authorization.
  return <section data-local-draft-panel dir={lang === 'ar' ? 'rtl' : 'ltr'} className="overflow-y-auto" style={{ padding: '24px 20px', color: FIELD.ink }}>
    <h1 style={{ fontSize: 27, fontWeight: 600, marginBottom: 8 }}>{copy.title}</h1>
    <p style={{ fontSize: 14, color: FIELD.mute, lineHeight: 1.5, marginBottom: 20 }}>{copy.intro}</p>
    {ownerUserScope && projectId
      ? <ScopedTargets key={JSON.stringify([ownerUserScope, projectId])} scope={{ ownerUserScope, projectId }} copy={copy} />
      : <p role="status" data-local-state="checking">{copy.checking}</p>}
    <details style={{ marginTop: 24, color: FIELD.mute, fontSize: 12, lineHeight: 1.5 }}>
      <summary style={{ ...control, cursor: 'pointer' }}>{copy.limitsTitle}</summary>
      <p>{copy.limits}</p>
    </details>
  </section>;
}

function ScopedTargets({ scope, copy }) {
  const [read, setRead] = useState({ status: 'checking', rows: [] });
  const [target, setTarget] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    setRead({ status: 'checking', rows: [] });
    setTarget('');
    listWirs(scope.projectId).then((rows) => {
      if (!alive) return;
      if (!Array.isArray(rows)) throw new Error('Invalid inspection list');
      const matching = rows.filter((row) => typeof row?.id === 'string' && row.id.trim() && row.project_id === scope.projectId);
      setRead({ status: 'ready', rows: matching });
      setTarget(matching[0]?.id || '');
    }).catch(() => { if (alive) setRead({ status: 'error', rows: [] }); });
    return () => { alive = false; };
  }, [scope.ownerUserScope, scope.projectId, retry]);
  const selected = read.status === 'ready' ? read.rows.find((row) => row.id === target) : null;
  return <>
    {read.status === 'checking' && <p role="status" data-local-state="checking">{copy.checking}</p>}
    {read.status === 'error' && <div role="alert"><p>{copy.targetError}</p><button style={control} onClick={() => setRetry((v) => v + 1)}>{copy.retry}</button></div>}
    {read.status === 'ready' && !read.rows.length && <p role="status">{copy.empty}</p>}
    {read.status === 'ready' && !!read.rows.length && <label style={{ display: 'block', marginBottom: 18 }}>{copy.target}
      <select data-local-target value={target} onChange={(e) => setTarget(e.target.value)} style={{ ...control, display: 'block', width: '100%', background: FIELD.surface, marginTop: 6 }}>
        {read.rows.map((row) => <option key={row.id} value={row.id}>{row.wir_number || row.id}</option>)}
      </select>
    </label>}
    {selected && <DraftEditor key={selected.id} scope={{ ...scope, targetWirId: selected.id }} copy={copy} />}
  </>;
}

function DraftEditor({ scope, copy }) {
  const [state, setState] = useState('checking');
  const [knownGood, setKnownGood] = useState(null);
  const [noteText, setNote] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [retry, setRetry] = useState(0);
  const mounted = useRef(false);
  const operation = useRef(null);
  const busy = useRef(false);
  const library = useRef(null);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; operation.current?.abort(); };
  }, []);
  useEffect(() => {
    let alive = true;
    setState('checking'); setError('');
    readLocalDraft(scope).then((draft) => {
      if (!alive) return;
      setKnownGood(draft); setNote(draft?.noteText || ''); setAttachments(draft?.attachments || []);
      setDirty(false); setState('ready');
    }).catch(() => { if (alive) { setState('error'); setError('storageError'); } });
    return () => { alive = false; };
  }, [scope.ownerUserScope, scope.projectId, scope.targetWirId, retry]);

  function addFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    const next = [...attachments];
    for (const file of files) {
      if (!file.size || file.size > MAX_LOCAL_FILE_BYTES || !/^image\//.test(file.type)) { setError('fileError'); return; }
      next.push({ localAttachmentId: crypto.randomUUID(), filename: file.name, mimeType: file.type, size: file.size, fileAddedAtDevice: new Date().toISOString(), blob: file });
    }
    if (next.length > 20 || next.reduce((sum, item) => sum + item.size, 0) > 100 * 1024 * 1024) { setError('fileError'); return; }
    setAttachments(next); setDirty(true); setError('');
  }

  async function save() {
    if (busy.current || state !== 'ready') return;
    busy.current = true;
    const controller = new AbortController();
    operation.current = controller;
    setState('saving'); setError(''); setConfirmDiscard(false);
    try {
      const draft = await buildLocalDraft(scope, { noteText, attachments }, knownGood);
      if (!mounted.current || controller.signal.aborted) return;
      const saved = await writeLocalDraft(draft, globalThis.indexedDB, { signal: controller.signal });
      if (!mounted.current || controller.signal.aborted) return;
      setKnownGood(saved); setAttachments(saved.attachments); setDirty(false);
    } catch {
      if (mounted.current && !controller.signal.aborted) setError('saveError');
    } finally {
      busy.current = false;
      if (mounted.current && !controller.signal.aborted) setState('ready');
    }
  }

  async function discard() {
    if (busy.current || !confirmDiscard) return;
    busy.current = true;
    const controller = new AbortController();
    operation.current = controller;
    setState('discarding'); setError('');
    try {
      await discardLocalDraft(scope, globalThis.indexedDB, { signal: controller.signal });
      if (!mounted.current || controller.signal.aborted) return;
      setKnownGood(null); setNote(''); setAttachments([]); setDirty(false); setConfirmDiscard(false); setState('ready');
    } catch {
      if (mounted.current && !controller.signal.aborted) { setError('storageError'); setState(knownGood ? 'ready' : 'error'); }
    } finally { busy.current = false; }
  }

  const pending = state === 'saving' || state === 'discarding';
  return <div data-local-state={error ? 'error' : state}>
    {state === 'checking' ? <p role="status">{copy.checking}</p> : <>
      {error && <div role="alert" style={{ color: FIELD.fail, marginBottom: 14 }}>{copy[error]}</div>}
      {state === 'error' ? <button style={control} onClick={() => setRetry((v) => v + 1)}>{copy.retry}</button> : <>
        <label style={{ display: 'block', fontSize: 15 }}>{copy.note}
          <textarea data-local-note value={noteText} disabled={pending} maxLength={10000} onChange={(e) => { setNote(e.target.value); setDirty(true); }} style={{ display: 'block', width: '100%', minHeight: 110, padding: 12, marginTop: 6, borderRadius: FIELD.rControl, background: FIELD.surface, fontSize: 16, resize: 'vertical' }} />
        </label>
        <div style={{ marginTop: 16 }}>
          <button style={control} disabled={pending} onClick={() => library.current?.click()}>{copy.addPhotos}</button>
          <input data-local-library-input ref={library} hidden type="file" accept="image/*" multiple disabled={pending} onChange={addFiles} />
        </div>
        <ul style={{ margin: '8px 0 16px', padding: 0, listStyle: 'none' }}>
          {attachments.map((item) => <li key={item.localAttachmentId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: `1px solid ${FIELD.rule}` }}>
            <div style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', fontSize: 14 }}>{item.filename}<small style={{ display: 'block', color: FIELD.mute }}>{item.mimeType} · {item.size} B<br />{copy.fileAdded}: {item.fileAddedAtDevice}</small></div>
            <button aria-label={`${copy.remove}: ${item.filename}`} disabled={pending} style={control} onClick={() => { setAttachments((rows) => rows.filter((row) => row.localAttachmentId !== item.localAttachmentId)); setDirty(true); }}>{copy.remove}</button>
          </li>)}
        </ul>
        <p role="status" style={{ fontSize: 13, color: FIELD.mute, marginBottom: 12 }}>{pending ? copy.working : dirty ? copy.unsaved : knownGood ? copy.saved : copy.notSaved}</p>
        {knownGood && <p style={{ fontSize: 12, color: FIELD.mute, overflowWrap: 'anywhere', marginBottom: 16 }}>{copy.created}: {knownGood.createdAtDevice}<br />{copy.updated}: {knownGood.updatedAtDevice}</p>}
        <button data-local-save style={{ ...primary, width: '100%', opacity: pending ? .6 : 1 }} disabled={pending || (!noteText.trim() && !attachments.length)} onClick={save}>{copy.save}</button>
      </>}
      {(knownGood || dirty || state === 'error') && <button data-local-discard style={{ ...control, marginTop: 10, color: FIELD.fail }} disabled={pending} onClick={() => setConfirmDiscard(true)}>{copy.discard}</button>}
      {confirmDiscard && <div role="alertdialog" aria-label={copy.discard} style={{ marginTop: 14, padding: 16, background: FIELD.surface, borderRadius: FIELD.rSurface }}>
        <p style={{ fontSize: 14, marginBottom: 12 }}>{copy.discardConfirm}</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button data-local-confirm-discard style={primary} disabled={pending} onClick={discard}>{copy.confirm}</button><button style={control} disabled={pending} onClick={() => setConfirmDiscard(false)}>{copy.keep}</button></div>
      </div>}
    </>}
  </div>;
}
