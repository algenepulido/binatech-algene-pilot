// ============================================================
// EvidencePreview — look at a piece of evidence WITHOUT leaving the record it
// belongs to. Previously the only way to see an attachment was to open a signed
// URL in a new browser tab, which drops the user out of the app entirely and
// loses the WIR / NCR / BoQ context they were reviewing it against.
//
// It layers ABOVE the drawer (z-60 over the drawer's z-50), so the chain
// record → evidence → back stays intact. Escape closes the preview only.
//
// PDFs and images render inline. Anything else is honest about it and offers
// the two explicit actions instead of pretending to preview.
// ============================================================
import { useEffect, useState } from 'react';
import { X, Download, ExternalLink, FileText } from 'lucide-react';
import { COL } from '../lib/theme.js';

const isImage = (name = '', type = '') => /^image\//i.test(type) || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
const isPdf = (name = '', type = '') => /pdf/i.test(type) || /\.pdf$/i.test(name);

export function EvidencePreview({ open, onClose, fileName, contentType, url, loading, error, lang = 'en' }) {
  const ar = lang === 'ar';
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); } };
    // Capture phase: the preview must swallow Escape before the drawer beneath
    // it sees the key, or one press would close both.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);
  useEffect(() => { if (open) setZoom(false); }, [open, url]);

  if (!open) return null;
  const img = isImage(fileName, contentType);
  const pdf = isPdf(fileName, contentType);

  return (
    <>
      <div className="fixed inset-0 z-[60]" style={{ background: 'rgba(13,16,28,0.42)' }} onMouseDown={onClose} data-testid="evidence-preview-backdrop" />
      <div
        role="dialog" aria-modal="true" aria-label={fileName || 'Evidence preview'}
        dir={ar ? 'rtl' : 'ltr'}
        className="fixed z-[61] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col rounded-2xl overflow-hidden"
        style={{ width: 'min(880px, 94vw)', height: 'min(88vh, 900px)', background: COL.surface, border: `1px solid ${COL.border}`, boxShadow: '0 24px 64px -16px rgba(13,16,28,0.45)' }}
      >
        <header className="flex items-center gap-2 px-4 py-3 border-b shrink-0" style={{ borderColor: COL.border }}>
          <FileText size={15} style={{ color: COL.textDim }} className="shrink-0" />
          <div className="text-[13px] font-semibold truncate flex-1" style={{ color: COL.text }}>{fileName || (ar ? 'دليل' : 'Evidence')}</div>
          {url && (
            <>
              <a href={url} target="_blank" rel="noopener noreferrer"
                className="h-7 px-2.5 rounded-full inline-flex items-center gap-1.5 text-[11px] font-semibold border transition-colors hover:bg-stone-100"
                style={{ color: COL.textDim, background: COL.surfaceAlt, borderColor: COL.border }}>
                <ExternalLink size={11} /> {ar ? 'فتح في تبويب' : 'Open in tab'}
              </a>
              <a href={url} download={fileName || true}
                className="h-7 px-2.5 rounded-full inline-flex items-center gap-1.5 text-[11px] font-semibold border transition-colors hover:bg-stone-100"
                style={{ color: COL.textDim, background: COL.surfaceAlt, borderColor: COL.border }}>
                <Download size={11} /> {ar ? 'تنزيل' : 'Download'}
              </a>
            </>
          )}
          <button onClick={onClose} aria-label={ar ? 'إغلاق' : 'Close'}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-stone-100 shrink-0"
            style={{ color: COL.textDim, background: COL.surfaceAlt }}><X size={14} /></button>
        </header>

        <div className="flex-1 overflow-auto scrollbar flex items-center justify-center p-4" style={{ background: COL.bg }}>
          {loading ? (
            <div className="text-[12px]" style={{ color: COL.textMute }}>{ar ? 'جارٍ التحميل…' : 'Loading preview…'}</div>
          ) : error ? (
            <div className="text-[12px] px-3 py-2 rounded-lg" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>
          ) : !url ? (
            <div className="text-[12px]" style={{ color: COL.textMute }}>{ar ? 'لا يمكن عرض هذا الملف.' : 'Nothing to preview.'}</div>
          ) : img ? (
            <img src={url} alt={fileName || 'Evidence'} onClick={() => setZoom((z) => !z)}
              className={zoom ? 'cursor-zoom-out max-w-none' : 'cursor-zoom-in max-w-full max-h-full object-contain'}
              style={zoom ? { width: 'auto' } : undefined} />
          ) : pdf ? (
            <iframe src={url} title={fileName || 'Evidence'} className="w-full h-full rounded-lg" style={{ border: `1px solid ${COL.border}`, background: '#fff' }} />
          ) : (
            <div className="text-center">
              <FileText size={28} style={{ color: COL.textMute }} className="mx-auto mb-2" />
              <div className="text-[12.5px] font-medium" style={{ color: COL.text }}>{fileName}</div>
              <div className="text-[11.5px] mt-1" style={{ color: COL.textMute }}>
                {ar ? 'لا يمكن معاينة هذا النوع هنا — استخدم فتح أو تنزيل.' : "This file type can't be previewed here — use Open in tab or Download."}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
