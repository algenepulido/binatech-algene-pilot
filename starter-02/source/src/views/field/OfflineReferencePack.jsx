import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { listWirs } from '../../api/wirs.js';
import { getProject } from '../../api/projects.js';
import { getCurrentProjectId, subscribeProject } from '../../lib/currentProject.js';
import { FIELD, MONO } from '../../lib/fieldTokens.js';
import { buildOfflineReferencePack, writeOfflineReferencePack } from '../../lib/offlineReferencePack.js';

function failure(code) {
  const error = new Error('Offline reference operation failed.');
  error.code = code;
  return error;
}

export function OfflineReferencePack({ isAuthenticated, userId, projectId, t = {}, lang = 'en' }) {
  const ar = lang === 'ar';
  const canonicalProjectId = getCurrentProjectId();
  const scopeMatches = Boolean(isAuthenticated && userId && projectId && projectId === canonicalProjectId);
  const scope = scopeMatches ? `${userId}::${canonicalProjectId}` : '';
  const [scopeVersion, setScopeVersion] = useState(0);
  const [choices, setChoices] = useState({ scope: '', loading: true, rows: [], error: null });
  const [selectedWirId, setSelectedWirId] = useState('');
  const [result, setResult] = useState({ scope: '', status: 'idle', pack: null, error: null });
  const generation = useRef(1);
  const committedScope = useRef(scope);
  const inFlight = useRef(null);

  useEffect(() => subscribeProject(() => setScopeVersion((value) => value + 1)), []);
  useLayoutEffect(() => {
    const changed = committedScope.current !== scope;
    inFlight.current?.controller.abort();
    committedScope.current = scope;
    generation.current += 1;
    inFlight.current = null;
    if (changed) {
      setSelectedWirId('');
      setResult({ scope: '', status: 'idle', pack: null, error: null });
    }
    return () => {
      inFlight.current?.controller.abort();
      generation.current += 1;
      committedScope.current = '';
      inFlight.current = null;
    };
  }, [scope]);
  useEffect(() => {
    if (!scope) return undefined;
    let active = true;
    setChoices({ scope, loading: true, rows: [], error: null });
    listWirs(canonicalProjectId).then(
      (rows) => {
        if (!active) return;
        const scoped = Array.isArray(rows)
          ? rows.filter((row) => typeof row?.id === 'string' && row.id.trim() && row.project_id === canonicalProjectId)
          : [];
        setChoices({ scope, loading: false, rows: scoped, error: null });
      },
      () => { if (active) setChoices({ scope, loading: false, rows: [], error: true }); },
    );
    return () => { active = false; };
  }, [scope, canonicalProjectId, scopeVersion]);

  const eligible = Boolean(scope && committedScope.current === scope);
  const visible = eligible && choices.scope === scope ? choices : { loading: true, rows: [], error: null };
  const activeResult = eligible && result.scope === scope ? result : { status: 'idle', pack: null, error: null };
  const selectedAvailable = visible.rows.some((row) => row?.id === selectedWirId && row?.project_id === canonicalProjectId);
  const state = !scope ? 'unavailable'
    : activeResult.status === 'downloading' ? 'downloading'
      : activeResult.pack ? (activeResult.error ? 'error' : 'downloaded')
        : activeResult.error || visible.error ? 'error'
          : visible.loading ? 'loading'
            : visible.rows.length === 0 ? 'unavailable' : 'not-downloaded';

  const download = async () => {
    if (!eligible || !selectedAvailable || inFlight.current) return;
    const token = {};
    const controller = new AbortController();
    inFlight.current = { token, controller };
    const captured = { scope, userScope: userId, projectId: canonicalProjectId, wirId: selectedWirId, generation: generation.current };
    const previousPack = activeResult.pack;
    setResult({ scope, status: 'downloading', pack: previousPack, error: null });
    try {
      let project;
      let rows;
      try { [project, rows] = await Promise.all([getProject(captured.projectId), listWirs(captured.projectId)]); }
      catch { throw failure('source'); }
      if (!project || project.id !== captured.projectId || !Array.isArray(rows)) throw failure('schema');
      const wir = rows.find((row) => row?.id === captured.wirId && row?.project_id === captured.projectId);
      if (!wir) throw failure('schema');
      const pack = buildOfflineReferencePack({ userScope: captured.userScope, project, wir });
      if (generation.current !== captured.generation || committedScope.current !== captured.scope) return;
      const verified = await writeOfflineReferencePack(pack, globalThis.indexedDB, { signal: controller.signal });
      if (generation.current !== captured.generation || committedScope.current !== captured.scope) return;
      setResult({ scope: captured.scope, status: 'downloaded', pack: verified, error: null });
    } catch (error) {
      if (generation.current !== captured.generation || committedScope.current !== captured.scope) return;
      setResult({ scope: captured.scope, status: 'error', pack: previousPack, error: error?.code || 'schema' });
    } finally {
      if (inFlight.current?.token === token) inFlight.current = null;
    }
  };

  const subtitle = !eligible
    ? (t.offlineReferenceUnverified || 'Offline reference unavailable until your account can be verified.')
    : activeResult.pack
      ? (t.offlineReferenceAvailable || 'Available on this screen if your connection drops.')
      : (!visible.loading && !visible.error && visible.rows.length === 0)
        ? (t.offlineReferenceEmpty || 'No WIR is available to download for this project.')
        : (t.offlineReferenceWarmOnly || 'Available only while this Work screen stays open.');

  const failureCopy = activeResult.pack
    ? activeResult.error === 'storage'
      ? (t.offlineReferenceStorageOldKept || 'This device couldn’t store the new download. Your previous download is still available.')
      : activeResult.error === 'source'
        ? (t.offlineReferenceSourceOldKept || 'Project records couldn’t be read. Your previous download is still available.')
        : (t.offlineReferenceInvalidOldKept || 'The new reference data was invalid. Your previous download is still available.')
    : activeResult.error === 'storage'
      ? (t.offlineReferenceStorageFailed || 'This device couldn’t store the reference. Try again.')
      : activeResult.error === 'source'
        ? (t.offlineReferenceSourceFailed || 'Project records couldn’t be read. Try again online.')
        : (t.offlineReferenceInvalidFailed || 'The reference data was invalid and wasn’t stored.');

  return (
    <section data-offline-reference-pack="" data-state={state} dir={ar ? 'rtl' : 'ltr'}
      className="flex-none" style={{ background: FIELD.surface, borderTop: `1px solid ${FIELD.hair}`, padding: '12px 20px 14px' }}>
      <div className="flex items-center gap-3">
        <Download aria-hidden="true" size={18} style={{ color: FIELD.ink }} />
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>{t.offlineReferenceTitle || 'Offline reference'}</div>
          <div style={{ color: FIELD.mute, fontSize: 12.5 }}>
            {subtitle}
          </div>
        </div>
        <button type="button" onClick={download}
          disabled={!scope || activeResult.status === 'downloading' || visible.loading || visible.error || !selectedAvailable}
          style={{ minHeight: 48, padding: '0 14px', borderRadius: 8, background: FIELD.ink, color: FIELD.surface, fontSize: 13.5, fontWeight: 600 }}>
          {activeResult.status === 'downloading'
            ? (t.offlineReferenceDownloading || 'Downloading…')
            : activeResult.pack
              ? (t.offlineReferenceDownloadAgain || 'Download again')
              : (t.offlineReferenceDownload || 'Download for offline')}
        </button>
      </div>
      {!activeResult.pack && (
        <div data-offline-reference-disclosure="" style={{ marginTop: 7, color: FIELD.mute, fontSize: 11.5 }}>
          {t.offlineReferenceDisclosure || 'One selected WIR is downloaded as a limited, read-only reference that may be stale. No changes or offline submissions are sent.'}
        </div>
      )}
      {activeResult.error && (
        <div role="alert" style={{ marginTop: 8, color: FIELD.fail, fontSize: 12.5 }}>
          {failureCopy}
        </div>
      )}
      {!activeResult.error && visible.error && (
        <div role="alert" style={{ marginTop: 8, color: FIELD.fail, fontSize: 12.5 }}>
          {t.offlineReferenceUnverified || 'Offline reference unavailable until your account can be verified.'}
        </div>
      )}
      {activeResult.pack && (
        <div data-offline-reference-record="" style={{ marginTop: 10, padding: '10px 12px', background: FIELD.page, borderRadius: 10 }}>
          <div style={{ color: FIELD.mute, fontSize: 11.5 }}>{activeResult.pack.project.name}</div>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600 }}>{activeResult.pack.wir.number}</div>
          <div style={{ marginTop: 2, fontSize: 13.5 }}>{activeResult.pack.wir.description || activeResult.pack.project.name}</div>
          <div style={{ marginTop: 3, color: FIELD.mute, fontSize: 12.5 }}>
            {[activeResult.pack.wir.location, activeResult.pack.wir.zone, activeResult.pack.wir.level].filter(Boolean).join(' · ')}
          </div>
          <div style={{ marginTop: 3, color: FIELD.mute, fontFamily: MONO, fontSize: 11.5 }}>
            {[activeResult.pack.wir.status, activeResult.pack.wir.workItemId].filter(Boolean).join(' · ')}
          </div>
          <div style={{ marginTop: 5, color: FIELD.mute, fontSize: 11.5 }}>
            {t.offlineReferenceStale || 'Downloaded to this browser for offline reference. It may be stale.'}
          </div>
          <div style={{ marginTop: 5, color: FIELD.mute, fontSize: 11.5 }}>
            {(t.offlineReferenceDownloadedAt || 'Downloaded on this device {time}').replace('{time}', new Date(activeResult.pack.downloadedAtDevice).toLocaleString(lang))}
          </div>
          <div style={{ marginTop: 3, color: FIELD.mute, fontSize: 11.5 }}>
            {t.offlineReferenceReadOnly || 'Read-only reference. No changes are sent.'}
          </div>
        </div>
      )}
      {visible.rows.length > 0 && (
        <label className="block" style={{ marginTop: 10, fontSize: 12.5, color: FIELD.mute }}>
          <span>{t.offlineReferenceChoose || 'Reference WIR'}</span>
          <select aria-label={t.offlineReferenceChoose || 'Reference WIR'} value={selectedWirId} onChange={(event) => setSelectedWirId(event.target.value)}
            style={{ display: 'block', width: '100%', minHeight: 48, marginTop: 4, padding: '0 10px', border: `1px solid ${FIELD.hair}`, borderRadius: 8, background: FIELD.page, color: FIELD.ink, fontFamily: MONO }}>
            <option value="" disabled>{t.offlineReferenceChoosePrompt || 'Choose one WIR'}</option>
            {visible.rows.map((wir) => <option key={wir.id} value={wir.id}>{wir.wir_number || wir.id}</option>)}
          </select>
        </label>
      )}
    </section>
  );
}
