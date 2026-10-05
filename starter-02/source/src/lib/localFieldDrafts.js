// Local user-created evidence only. Separate from the read-only O1 database.
const DB = 'bimqc-local-field-drafts';
const STORE = 'drafts';
export const LOCAL_DRAFT_SCHEMA = 1;
export const MAX_LOCAL_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const keys = (v, allowed) => v && typeof v === 'object' && Object.keys(v).every((k) => allowed.includes(k));
const text = (v, max = 200) => typeof v === 'string' && v.length > 0 && v.length <= max && v.trim() === v;
// Filenames are user data, kept exactly as the browser reported them (leading/trailing spaces included); only non-empty and bounded.
const filename = (v, max = 1000) => typeof v === 'string' && v.length > 0 && v.length <= max;
const time = (v) => text(v, 40) && !Number.isNaN(Date.parse(v));
const fail = (code = 'storage') => Object.assign(new Error('Local draft unavailable.'), { code });

function scopeKey({ ownerUserScope, projectId, targetWirId } = {}) {
  if (![ownerUserScope, projectId, targetWirId].every((v) => text(v))) throw fail('schema');
  return JSON.stringify([ownerUserScope, projectId, targetWirId]);
}

export function validateLocalDraft(value, scope) {
  const key = scopeKey(scope);
  if (!keys(value, ['key', 'schemaVersion', 'localDraftId', 'ownerUserScope', 'projectId', 'targetWirId', 'createdAtDevice', 'updatedAtDevice', 'noteText', 'attachments'])
    || value.key !== key || value.schemaVersion !== LOCAL_DRAFT_SCHEMA || value.localDraftId !== `local:${key}`
    || value.ownerUserScope !== scope.ownerUserScope || value.projectId !== scope.projectId || value.targetWirId !== scope.targetWirId
    || !time(value.createdAtDevice) || !time(value.updatedAtDevice)
    || typeof value.noteText !== 'string' || value.noteText.length > 10000
    || !Array.isArray(value.attachments) || value.attachments.length > 20) throw fail('schema');
  const ids = new Set();
  let total = 0;
  for (const a of value.attachments) {
    if (!keys(a, ['localAttachmentId', 'filename', 'mimeType', 'size', 'fileAddedAtDevice', 'sha256', 'blob'])
      || !text(a.localAttachmentId) || ids.has(a.localAttachmentId) || !filename(a.filename)
      || !text(a.mimeType) || !/^image\//.test(a.mimeType)
      || !Number.isInteger(a.size) || a.size <= 0 || a.size > MAX_LOCAL_FILE_BYTES
      || !time(a.fileAddedAtDevice) || !/^[a-f0-9]{64}$/.test(a.sha256)
      || !(a.blob instanceof Blob) || a.blob.size !== a.size || a.blob.type !== a.mimeType) throw fail('schema');
    ids.add(a.localAttachmentId);
    total += a.size;
  }
  if (total > MAX_TOTAL_BYTES) throw fail('schema');
  return value;
}

async function digest(blob) {
  try {
    const bytes = blob.arrayBuffer ? await blob.arrayBuffer() : await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(fail());
      reader.readAsArrayBuffer(blob);
    });
    const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), (v) => v.toString(16).padStart(2, '0')).join('');
  } catch { throw fail(); }
}

async function verifyBytes(draft) {
  for (const attachment of draft.attachments) {
    if (await digest(attachment.blob) !== attachment.sha256) throw fail('schema');
  }
  return draft;
}

export async function buildLocalDraft(scope, { noteText, attachments }, previous = null) {
  const key = scopeKey(scope);
  if (previous) validateLocalDraft(previous, scope);
  const now = new Date().toISOString();
  const draft = {
    key, schemaVersion: LOCAL_DRAFT_SCHEMA, localDraftId: `local:${key}`,
    ownerUserScope: scope.ownerUserScope, projectId: scope.projectId, targetWirId: scope.targetWirId,
    createdAtDevice: previous?.createdAtDevice || now, updatedAtDevice: now, noteText,
    attachments: await Promise.all(attachments.map(async (a) => ({
      localAttachmentId: a.localAttachmentId, filename: a.filename, mimeType: a.mimeType,
      size: a.size, fileAddedAtDevice: a.fileAddedAtDevice, blob: a.blob,
      sha256: await digest(a.blob),
    }))),
  };
  return validateLocalDraft(draft, scope);
}

function openDatabase(indexedDb) {
  return new Promise((resolve, reject) => {
    let request;
    let failed = false;
    const rejectOpen = () => { failed = true; reject(fail()); };
    try { request = indexedDb.open(DB, 1); } catch { rejectOpen(); return; }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onerror = rejectOpen;
    request.onblocked = rejectOpen;
    request.onsuccess = () => { if (failed) request.result.close(); else resolve(request.result); };
  });
}

// A single record holds metadata and actual blobs: one transaction replaces all
// or none. Resolve only on transaction completion, never on request success.
async function transact(scope, operation, value, indexedDb, signal) {
  const key = scopeKey(scope);
  if (signal?.aborted) throw fail('stale');
  const db = await openDatabase(indexedDb);
  try {
    if (signal?.aborted) throw fail('stale');
    return await new Promise((resolve, reject) => {
      let tx;
      let result = null;
      let reason;
      const abort = () => {
        reason = fail('stale');
        try { tx.abort(); } catch { /* already settled */ }
      };
      const finish = (callback, payload) => { signal?.removeEventListener('abort', abort); callback(payload); };
      const rejectTransaction = (error) => {
        reason = error;
        try { tx.abort(); } catch { finish(reject, reason); }
      };
      try {
        tx = db.transaction(STORE, operation === 'read' ? 'readonly' : 'readwrite');
        tx.oncomplete = () => finish(resolve, result);
        tx.onabort = tx.onerror = () => finish(reject, reason || fail());
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) { abort(); return; }
        const store = tx.objectStore(STORE);
        const readback = () => {
          const request = store.get(key);
          request.onerror = () => rejectTransaction(fail());
          request.onsuccess = () => {
            try {
              if (operation === 'discard') {
                if (request.result !== undefined) throw fail();
                return;
              }
              result = request.result === undefined && operation === 'read' ? null : validateLocalDraft(request.result, scope);
              if (operation === 'write' && JSON.stringify(result) !== JSON.stringify(value)) throw fail('schema');
            } catch (error) { rejectTransaction(error); }
          };
        };
        if (operation === 'read') readback();
        else {
          const request = operation === 'write' ? store.put(value) : store.delete(key);
          request.onerror = () => rejectTransaction(fail());
          request.onsuccess = () => { try { readback(); } catch { rejectTransaction(fail()); } };
        }
      } catch { if (tx) rejectTransaction(fail()); else finish(reject, fail()); }
    });
  } finally { db.close(); }
}

export async function readLocalDraft(scope, indexedDb = globalThis.indexedDB) {
  const draft = await transact(scope, 'read', null, indexedDb);
  return draft ? verifyBytes(draft) : null;
}

export async function writeLocalDraft(draft, indexedDb = globalThis.indexedDB, { signal } = {}) {
  validateLocalDraft(draft, draft);
  await verifyBytes(draft);
  return transact(draft, 'write', draft, indexedDb, signal);
}

export async function discardLocalDraft(scope, indexedDb = globalThis.indexedDB, { signal } = {}) {
  return transact(scope, 'discard', null, indexedDb, signal);
}
