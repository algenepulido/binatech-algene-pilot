const DB_NAME = 'bimqc-offline-reference';
const DB_VERSION = 1;
const STORE = 'reference-packs';
export const OFFLINE_REFERENCE_SCHEMA = 1;

const text = (value) => typeof value === 'string' ? value.trim() : '';
const limited = (value, max) => text(value).slice(0, max);
const onlyKeys = (value, allowed) => value && typeof value === 'object'
  && Object.keys(value).every((key) => allowed.includes(key));
const validText = (value, max, required = false) => typeof value === 'string'
  && value.length <= max && (!required || value.trim().length > 0);

export class OfflineReferenceError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const invalid = () => new OfflineReferenceError('schema', 'Offline reference is unavailable.');
const storageFailure = () => new OfflineReferenceError('storage', 'Offline storage is unavailable.');
const staleFailure = () => new OfflineReferenceError('stale', 'Offline reference operation is no longer current.');

function packKey(userScope, projectId) {
  return `${userScope}\u0000${projectId}`;
}

export function buildOfflineReferencePack({ userScope, project, wir, downloadedAtDevice = new Date().toISOString() }) {
  const owner = text(userScope);
  const projectId = text(project?.id);
  const wirId = text(wir?.id);
  const projectName = text(project?.name);
  if (!owner || owner.length > 200 || !projectId || projectId.length > 200 || !projectName || projectName.length > 200
    || !wirId || wirId.length > 200 || text(wir?.project_id) !== projectId) {
    throw invalid();
  }
  const pack = {
    key: packKey(owner, projectId),
    schema: OFFLINE_REFERENCE_SCHEMA,
    userScope: owner,
    projectId,
    downloadedAtDevice,
    project: { id: projectId, name: projectName },
    scope: { kind: 'wir', wirId },
    wir: {
      id: wirId,
      number: limited(wir.wir_number, 200) || wirId,
      description: limited(text(wir.inspection_type) || text(wir.description), 500),
      status: limited(text(wir.result) || text(wir.status), 100),
      workItemId: limited(wir.work_item_id, 200),
      location: limited(wir.location, 200),
      zone: limited(text(wir.zone) || text(wir.scope_zone), 200),
      level: limited(wir.level, 200),
    },
  };
  return validateOfflineReferencePack(pack, { userScope: owner, projectId });
}

export function validateOfflineReferencePack(value, { userScope, projectId } = {}) {
  const owner = text(userScope);
  const project = text(projectId);
  if (!onlyKeys(value, ['key', 'schema', 'userScope', 'projectId', 'downloadedAtDevice', 'project', 'scope', 'wir'])
    || value.schema !== OFFLINE_REFERENCE_SCHEMA
    || !validText(value.key, 401, true)
    || !validText(value.userScope, 200, true)
    || !validText(value.projectId, 200, true)
    || !validText(value.downloadedAtDevice, 40, true)
    || Number.isNaN(Date.parse(value.downloadedAtDevice))
    || text(value.userScope) !== owner
    || text(value.projectId) !== project
    || value.key !== packKey(owner, project)
    || !onlyKeys(value.project, ['id', 'name'])
    || !validText(value.project.id, 200, true)
    || !validText(value.project.name, 200, true)
    || text(value.project.id) !== project
    || !onlyKeys(value.scope, ['kind', 'wirId'])
    || value.scope.kind !== 'wir'
    || !validText(value.scope.wirId, 200, true)
    || !onlyKeys(value.wir, ['id', 'number', 'description', 'status', 'workItemId', 'location', 'zone', 'level'])
    || !validText(value.wir.id, 200, true)
    || !validText(value.wir.number, 200, true)
    || !validText(value.wir.description, 500)
    || !validText(value.wir.status, 100)
    || !validText(value.wir.workItemId, 200)
    || !validText(value.wir.location, 200)
    || !validText(value.wir.zone, 200)
    || !validText(value.wir.level, 200)
    || JSON.stringify(value).length > 4096
    || text(value.wir.id) !== text(value.scope.wirId)) {
    throw invalid();
  }
  return value;
}

function openDatabase(indexedDb = globalThis.indexedDB) {
  if (!indexedDb?.open) return Promise.reject(storageFailure());
  return new Promise((resolve, reject) => {
    let request;
    try { request = indexedDb.open(DB_NAME, DB_VERSION); }
    catch { reject(storageFailure()); return; }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(storageFailure());
    request.onblocked = () => reject(storageFailure());
  });
}

export async function writeOfflineReferencePack(pack, indexedDb = globalThis.indexedDB, { signal } = {}) {
  validateOfflineReferencePack(pack, { userScope: pack?.userScope, projectId: pack?.projectId });
  if (signal?.aborted) throw staleFailure();
  const db = await openDatabase(indexedDb);
  try {
    if (signal?.aborted) throw staleFailure();
    return await new Promise((resolve, reject) => {
      let tx;
      let verified;
      let transactionFailure;
      let settled = false;
      const removeAbort = () => signal?.removeEventListener?.('abort', abort);
      const rejectOnce = (error) => {
        if (settled) return;
        settled = true;
        removeAbort();
        reject(error);
      };
      const abortWith = (error) => {
        transactionFailure = error;
        try { tx?.abort(); } catch { rejectOnce(error); }
      };
      const abort = () => abortWith(staleFailure());
      try {
        tx = db.transaction(STORE, 'readwrite');
        tx.oncomplete = () => {
          if (settled) return;
          settled = true;
          removeAbort();
          if (verified) resolve(verified);
          else reject(transactionFailure || storageFailure());
        };
        tx.onerror = () => rejectOnce(signal?.aborted ? staleFailure() : transactionFailure || storageFailure());
        tx.onabort = () => rejectOnce(signal?.aborted ? staleFailure() : transactionFailure || storageFailure());
        signal?.addEventListener?.('abort', abort, { once: true });
        if (signal?.aborted) { abort(); return; }
        const store = tx.objectStore(STORE);
        const write = store.put(pack);
        write.onerror = () => abortWith(storageFailure());
        write.onsuccess = () => {
          let readback;
          try { readback = store.get(pack.key); }
          catch { abortWith(storageFailure()); return; }
          readback.onerror = () => abortWith(storageFailure());
          readback.onsuccess = () => {
            try {
              const candidate = validateOfflineReferencePack(readback.result, {
                userScope: pack.userScope,
                projectId: pack.projectId,
              });
              if (JSON.stringify(candidate) !== JSON.stringify(pack)) throw invalid();
              verified = candidate;
            } catch (error) {
              abortWith(error instanceof OfflineReferenceError ? error : invalid());
            }
          };
        };
      } catch {
        rejectOnce(signal?.aborted ? staleFailure() : storageFailure());
      }
    });
  } finally {
    db.close();
  }
}

export async function readOfflineReferencePack({ userScope, projectId }, indexedDb = globalThis.indexedDB) {
  const owner = text(userScope);
  const project = text(projectId);
  if (!owner || !project) throw invalid();
  const db = await openDatabase(indexedDb);
  try {
    const value = await new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE, 'readonly');
        const request = tx.objectStore(STORE).get(packKey(owner, project));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(storageFailure());
      } catch { reject(storageFailure()); }
    });
    return validateOfflineReferencePack(value, { userScope: owner, projectId: project });
  } finally {
    db.close();
  }
}
