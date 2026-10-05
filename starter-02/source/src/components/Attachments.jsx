// ============================================================
// Attachments — reusable file list + upload/preview/download/delete for any
// record. Pass recordType ('wir' | 'ipc' | 'invoice' | ...) and recordId.
// Writes are gated behind sign-in; downloads/previews use signed URLs.
// Uploads are validated (type + size) with a clear error. PDFs and images can
// be PREVIEWED in-app; other formats offer download.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { Download, Eye, Paperclip, Trash2, Upload } from 'lucide-react';
import { Btn } from './primitives.jsx';
import { Modal } from './Modal.jsx';
import { confirmDialog } from './ConfirmDialog.jsx';
import { listAttachments, uploadAttachment, signedUrl, deleteAttachment } from '../lib/attachments.js';
import { useAuth } from '../lib/auth.jsx';
import { COL } from '../lib/theme.js';

const MAX_ATTACH_BYTES = 25 * 1024 * 1024; // 25 MB
const isImage = (t, name) => /^image\//.test(t || '') || /\.(png|jpe?g|webp|gif)$/i.test(name || '');
const isPdf = (t, name) => /pdf/i.test(t || '') || /\.pdf$/i.test(name || '');

export function Attachments({ recordType, recordId, accept = 'application/pdf,image/*' }) {
  const { requireAuth } = useAuth();
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null); // { url, name, kind }
  const [pvLoading, setPvLoading] = useState(false);
  const fileRef = useRef(null);

  async function refresh() {
    try { setItems(await listAttachments(recordType, recordId)); }
    catch (err) { setError(err?.message ?? String(err)); }
  }

  useEffect(() => {
    if (!recordId) return;
    let active = true;
    listAttachments(recordType, recordId).then((a) => { if (active) setItems(a); }).catch((e) => setError(e.message));
    return () => { active = false; };
  }, [recordType, recordId]);

  // Validate against the `accept` allowlist + a size cap before uploading.
  function validate(file) {
    const okType = accept.split(',').some((a) => {
      const s = a.trim();
      if (!s) return false;
      if (s.endsWith('/*')) return (file.type || '').startsWith(s.slice(0, -1));
      if (s.startsWith('.')) return (file.name || '').toLowerCase().endsWith(s.toLowerCase());
      return file.type === s;
    });
    if (!okType) return `Unsupported file type${file.type ? ` (${file.type})` : ''}.`;
    if (file.size === 0) return 'That file is empty.';
    if (file.size > MAX_ATTACH_BYTES) return 'File is too large (max 25 MB).';
    return null;
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const bad = validate(file);
    if (bad) { setError(bad); return; }
    setError(null); setBusy(true);
    try { await uploadAttachment({ recordType, recordId, file }); await refresh(); }
    catch (err) { setError(err?.message ?? String(err)); }
    finally { setBusy(false); }
  }

  async function download(att) {
    try { window.open(await signedUrl(att.storage_path), '_blank', 'noopener'); }
    catch (err) { setError(err?.message ?? String(err)); }
  }

  async function openPreview(att) {
    const kind = isImage(att.content_type, att.file_name) ? 'image' : isPdf(att.content_type, att.file_name) ? 'pdf' : 'other';
    if (kind === 'other') { download(att); return; }
    setPvLoading(true); setError(null);
    try { const url = await signedUrl(att.storage_path); setPreview({ url, name: att.file_name, kind }); }
    catch (err) { setError(err?.message ?? String(err)); }
    finally { setPvLoading(false); }
  }

  function remove(att) {
    requireAuth(async () => {
      // Evidence deletion is permanent — confirm first (was a one-click Trash icon).
      if (!await confirmDialog({
        title: 'Delete this attachment?',
        message: `“${att.file_name || att.name || 'This file'}” will be permanently removed from the evidence record. This cannot be undone.`,
        confirmLabel: 'Delete', danger: true,
      })) return;
      try { await deleteAttachment(att.id, att.storage_path); await refresh(); }
      catch (err) { setError(err?.message ?? String(err)); }
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold flex items-center gap-1.5" style={{ color: COL.text }}>
          <Paperclip size={13} /> Attachments ({items.length})
        </div>
        <Btn icon={Upload} disabled={busy} onClick={() => requireAuth(() => fileRef.current?.click())}>{busy ? 'Uploading…' : 'Upload'}</Btn>
        <input ref={fileRef} type="file" accept={accept} hidden onChange={onFile} />
      </div>
      {items.length === 0 && <div className="text-[11px] py-2 text-center" style={{ color: COL.textMute }}>No files attached yet.</div>}
      <div className="flex flex-col gap-1.5">
        {items.map((att) => {
          const canPreview = isImage(att.content_type, att.file_name) || isPdf(att.content_type, att.file_name);
          return (
            <div key={att.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded border" style={{ borderColor: COL.border, background: COL.bg }}>
              <Paperclip size={12} style={{ color: COL.textDim }} />
              <span className="text-[11px] flex-1 truncate" style={{ color: COL.text }}>{att.file_name}</span>
              <span className="mono text-[10px]" style={{ color: COL.textMute }}>{att.size != null ? `${Math.max(1, Math.round(att.size / 1024))} KB` : ''}</span>
              {canPreview && <button onClick={() => openPreview(att)} className="p-1 rounded hover:bg-stone-100" title="Preview" style={{ color: COL.accent }} disabled={pvLoading}><Eye size={13} /></button>}
              <button onClick={() => download(att)} className="p-1 rounded hover:bg-stone-100" title="Download" style={{ color: COL.accent }}><Download size={13} /></button>
              <button onClick={() => remove(att)} className="p-1 rounded hover:bg-stone-100" title="Delete" style={{ color: '#b91c1c' }}><Trash2 size={13} /></button>
            </div>
          );
        })}
      </div>
      {error && <div className="text-xs px-2 py-1.5 rounded mt-2" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}

      {preview && (
        <Modal open onClose={() => setPreview(null)} title={preview.name} subtitle="Attachment preview" width={860}
          footer={<><Btn variant="secondary" onClick={() => window.open(preview.url, '_blank', 'noopener')}>Open in new tab</Btn><Btn variant="primary" onClick={() => setPreview(null)}>Close</Btn></>}>
          {preview.kind === 'image'
            ? <img src={preview.url} alt={preview.name} className="max-w-full mx-auto rounded" style={{ maxHeight: '70vh' }} />
            : <iframe src={preview.url} title={preview.name} className="w-full rounded border" style={{ height: '70vh', borderColor: COL.border }} />}
        </Modal>
      )}
    </div>
  );
}
