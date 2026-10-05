// ============================================================
// BatchSuggestPanel — right-side drawer for the Elements Registry's multi-select
// AI BoQ suggestions. Results are grouped BY ELEMENT (each selected element shows
// its own ranked suggestions). Recommendations only — nothing links until the
// user clicks Link. Every branch is null-safe and failures are shown INLINE
// (never thrown), so this panel can't trip an error boundary.
//   Selection rules (enforced by the registry): 2–10 elements auto-suggest;
//   >10 shows "Select up to 10 elements for AI suggestions" and does NOT call.
// ============================================================
import { useMemo, useState } from 'react';
import { toast } from '../../components/Toast.jsx';
import { X, Check, Sparkles, Loader, AlertTriangle } from 'lucide-react';
import { linkElementBoq } from '../../api/elementBoqLinks.js';
import { COL } from '../../lib/theme.js';

const confStyle = (c) => c === 'high' ? { bg: '#dcfce7', fg: '#15803d' } : c === 'medium' ? { bg: '#fef3c7', fg: '#b45309' } : { bg: COL.surfaceAlt, fg: COL.textMute };
const elLabel = (e) => (e && (e.displayName || e.description || e.name)) || (e && e.guid) || 'Element';

export function BatchSuggestPanel({ pickedElements = [], boqAll = [], batch = {}, onClose, onApplied }) {
  const [applied, setApplied] = useState(() => new Set()); // `${guid}|${lineId}`
  const [busy, setBusy] = useState(false);

  const boqById = useMemo(() => { const m = new Map(); (boqAll || []).forEach((b) => b && m.set(String(b.id), b)); return m; }, [boqAll]);
  const resultByGuid = useMemo(() => { const m = new Map(); (batch.results || []).forEach((r) => r && m.set(r.guid, r)); return m; }, [batch.results]);
  const failedCount = (batch.results || []).filter((r) => r && !r.ok).length;
  const isApplied = (guid, lineId) => applied.has(`${guid}|${lineId}`);

  async function link(guid, lineId) {
    if (!guid || lineId == null) return;
    setBusy(true);
    try { await linkElementBoq(guid, lineId); setApplied((s) => new Set(s).add(`${guid}|${lineId}`)); onApplied?.(); }
    catch (e) { toast.error(e?.message || 'Could not link.'); }
    finally { setBusy(false); }
  }

  // ---- Body by status (all inline, null-safe) ----
  let body;
  if (batch.status === 'oversized') {
    body = (
      <div className="p-4">
        <div className="rounded-lg border px-3 py-5 text-center" style={{ borderColor: COL.border, background: COL.bg }}>
          <AlertTriangle size={18} className="mx-auto mb-1.5" style={{ color: '#b45309' }} />
          <div className="text-[12px] font-semibold" style={{ color: COL.textDim }}>Select up to 10 elements for AI suggestions</div>
          <div className="text-[11px] mt-1" style={{ color: COL.textMute }}>{batch.total} selected — narrow the selection to run suggestions.</div>
        </div>
      </div>
    );
  } else if (batch.status === 'empty') {
    body = <div className="p-4 text-[11px]" style={{ color: COL.textMute }}>No BoQ line items to match against. Create or import a BoQ first.</div>;
  } else if (batch.status === 'error') {
    body = (
      <div className="p-4">
        <div className="text-[11px] inline-flex items-center gap-1.5 px-2.5 py-2 rounded-md" style={{ background: '#fef3c7', color: '#b45309' }}>
          <AlertTriangle size={13} />Suggestions unavailable — try again or select fewer elements.
        </div>
      </div>
    );
  } else if (batch.status === 'loading') {
    body = (
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-[11px]" style={{ color: COL.textDim }}><Loader size={13} className="animate-spin" />AI is finding likely matches… {batch.done || 0}/{batch.total || pickedElements.length}</div>
        {Array.from({ length: Math.min(5, pickedElements.length || 4) }).map((_, i) => <div key={i} className="h-12 rounded-md animate-pulse" style={{ background: COL.surfaceAlt }} />)}
      </div>
    );
  } else {
    // done — one card per selected element, with its ranked suggestions
    body = (
      <div className="p-3 space-y-2.5">
        {failedCount > 0 && (
          <div className="text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded" style={{ background: '#fef3c7', color: '#b45309' }}>
            <AlertTriangle size={11} />Some elements could not be suggested ({failedCount}).
          </div>
        )}
        {pickedElements.map((el) => {
          const res = resultByGuid.get(el.guid);
          const sugg = (res && res.ok && Array.isArray(res.suggestions)) ? res.suggestions : [];
          return (
            <div key={el.guid} className="rounded-md border" style={{ borderColor: COL.border }}>
              {/* Element header */}
              <div className="px-2.5 py-1.5 border-b" style={{ borderColor: COL.border, background: COL.surfaceAlt }}>
                <div className="text-[11px] font-semibold truncate" style={{ color: COL.text }}>{elLabel(el)}</div>
                <div className="mono text-[8.5px] truncate" style={{ color: COL.textMute }}>{el.guid}</div>
              </div>
              {/* Suggestions for this element */}
              <div className="p-1.5 space-y-1">
                {!res || !res.ok ? (
                  <div className="text-[10px] px-1" style={{ color: '#b45309' }}>Suggestions unavailable for this element.</div>
                ) : sugg.length === 0 ? (
                  <div className="text-[10px] px-1" style={{ color: COL.textMute }}>No confident match — link manually.</div>
                ) : sugg.slice(0, 5).map((s) => {
                  const line = boqById.get(String(s.id));
                  if (!line) return null;
                  const c = confStyle(s.confidence);
                  const done = isApplied(el.guid, line.id);
                  return (
                    <div key={`${el.guid}-${line.id}`} className="rounded px-2 py-1.5" style={{ background: COL.surface, border: `1px solid ${COL.border}` }}>
                      <div className="flex items-center gap-1.5">
                        <span className="mono text-[10px] font-semibold" style={{ color: COL.accent }}>{line.code || '(no code)'}</span>
                        <span className="mono text-[8px] uppercase px-1 py-0.5 rounded" style={{ background: c.bg, color: c.fg }}>{s.confidence || '—'}</span>
                        <div className="ms-auto flex-shrink-0">
                          {done ? <span className="text-[9.5px]" style={{ color: '#15803d' }}>linked ✓</span> : (
                            <button onClick={() => link(el.guid, line.id)} disabled={busy} className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-[9.5px] font-medium disabled:opacity-50" style={{ border: `1px solid ${COL.border}`, color: COL.accent }}><Check size={11} />Link</button>
                          )}
                        </div>
                      </div>
                      <div className="text-[10px] truncate mt-0.5" style={{ color: COL.textDim }}>{line.description || ''}</div>
                      {s.reason && <div className="text-[9px] mt-0.5" style={{ color: COL.textMute }}>{s.reason}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.28)' }} onClick={onClose} />
      <div className="fixed top-0 bottom-0 z-50 flex flex-col shadow-2xl" style={{ insetInlineEnd: 0, width: 'min(440px, 96vw)', background: COL.surface }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b flex-shrink-0" style={{ borderColor: COL.border }}>
          <Sparkles size={15} style={{ color: COL.accent }} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold leading-tight">AI suggestions · {pickedElements.length} elements</div>
            <div className="text-[10px]" style={{ color: COL.textMute }}>Grouped by element · recommendations only, nothing links until you click Link</div>
          </div>
          <button onClick={onClose} title="Close" className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-stone-100 flex-shrink-0" style={{ color: COL.textDim }}><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar">{body}</div>
      </div>
    </>
  );
}
