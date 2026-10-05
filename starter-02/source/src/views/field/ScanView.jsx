// ============================================================
// ScanView — the SCAN destination of Field Mode.
//
// WHAT THIS SCREEN IS: the fastest way to get from "I'm standing in front of
// something" to "here is its record". Today that means search — over WIRs,
// model elements and drawings — so search IS the screen, not a fallback under
// a wall of disabled feature cards.
//
// CAMERA: not available yet, and stated ONCE, in three words. The reasons
// (decoding library, recognition service, backend dependencies) are engineering
// detail and live in docs/ux/FIELD-AI-INTEGRATION.md, not in a site engineer's
// face. Snag classification moved to CAPTURE, where creating a snag actually
// happens.
//
// Bilingual: every string comes from the dictionary, so the Arabic build is not
// half-English.
// ============================================================
import { useState, useMemo, useEffect } from 'react';
import { Search, Camera, X, ClipboardCheck, Box, FileImage } from 'lucide-react';
import { listWirs } from '../../api/wirs.js';
import { listDrawings } from '../../api/drawings.js';
import { useElements } from '../../lib/elements.jsx';
import { resultLabel } from '../../lib/wirStatus.js';
import { StatusPill } from '../../components/primitives.jsx';
import { COL } from '../../lib/theme.js';

/** One tappable result row — 56px, identifier first, state on the end. */
function ResultRow({ icon: Icon, primary, secondary, trailing, onClick }) {
  return (
    <button onClick={onClick}
      className="w-full text-start rounded-xl border px-3 flex items-center gap-2.5 active:bg-blue-50/50"
      style={{ minHeight: 56, borderColor: COL.border, background: COL.surface }}>
      <Icon size={15} className="flex-shrink-0" style={{ color: COL.textDim }} />
      <span className="min-w-0 flex-1">
        <span className="mono text-[13px] font-semibold block truncate" style={{ color: COL.accent }}>{primary}</span>
        {secondary && <span className="text-[12px] block truncate" style={{ color: COL.textDim }}>{secondary}</span>}
      </span>
      {trailing}
    </button>
  );
}

export function ScanView({ t = {}, lang = 'en', onNavigate, onOpenWir, onOpenElement, searchState, onSearchStateChange }) {
  const ar = lang === 'ar';
  const [q, setQ] = useState(searchState?.query || '');
  const [scope, setScope] = useState(searchState?.scope || 'all');
  const [wirs, setWirs] = useState([]);
  const [drawings, setDrawings] = useState([]);
  const { elements } = useElements();

  useEffect(() => {
    if (!searchState) return;
    setQ(searchState.query || '');
    setScope(searchState.scope || 'all');
  }, [searchState?.query, searchState?.scope]);

  const updateQuery = (query) => {
    setQ(query);
    onSearchStateChange?.({ query, scope });
  };
  const updateScope = (nextScope) => {
    setScope(nextScope);
    onSearchStateChange?.({ query: q, scope: nextScope });
  };

  useEffect(() => {
    listWirs().then(setWirs).catch(() => setWirs([]));
    listDrawings().then(setDrawings).catch(() => setDrawings([]));
  }, []);

  const needle = q.trim().toLowerCase();
  const match = (hay) => String(hay || '').toLowerCase().includes(needle);

  const wirHits = useMemo(() => wirs.filter((w) => match(`${w.wir_number} ${w.inspection_type || ''} ${w.location || ''}`)), [wirs, needle]);
  const elHits = useMemo(() => (elements || []).filter((e) => match(`${e.id || ''} ${e.name || ''} ${e.guid || ''}`)), [elements, needle]);
  const dwgHits = useMemo(() => drawings.filter((d) => match(`${d.drawing_number || ''} ${d.title || ''} ${d.discipline || ''}`)), [drawings, needle]);

  // With no query the screen still earns its space: the most recent records are
  // usually the ones a field user wants, so they are one tap away.
  const recentWirs = useMemo(() => wirs.slice(0, 5), [wirs]);
  const recentDwgs = useMemo(() => drawings.slice(0, 3), [drawings]);

  const SCOPES = [
    { key: 'all', label: t.scopeAll || 'All' },
    { key: 'wir', label: t.scopeWir || 'WIRs', n: wirs.length },
    { key: 'element', label: t.scopeElement || 'Elements', n: (elements || []).length },
    { key: 'drawing', label: t.scopeDrawing || 'Drawings', n: drawings.length },
  ];
  const show = (kind) => scope === 'all' || scope === kind;

  const searching = needle.length > 0;
  const totalHits = (show('wir') ? wirHits.length : 0) + (show('element') ? elHits.length : 0) + (show('drawing') ? dwgHits.length : 0);

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: COL.bg }} dir={ar ? 'rtl' : 'ltr'}>
      <div className="px-4 pt-4 pb-3">
        <h1 className="display text-[20px] font-bold" style={{ color: COL.text }}>{t.scanTitle || 'Scan'}</h1>
        <p className="text-[12.5px] mt-0.5" style={{ color: COL.textDim }}>{t.scanSub || 'Find a WIR, element or drawing on site.'}</p>
      </div>

      <div className="px-4">
        <div className="relative">
          <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2" style={{ color: COL.textMute }} />
          <input
            value={q} onChange={(e) => updateQuery(e.target.value)} autoComplete="off"
            placeholder={t.scanPlaceholder || 'WIR number, element, drawing, location…'}
            aria-label={t.scanPlaceholder || 'Search'}
            className="w-full ps-9 pe-10 rounded-xl border text-[15px] outline-none focus:border-blue-500"
            style={{ minHeight: 48, background: COL.surface, borderColor: COL.borderStrong, color: COL.text }}
          />
          {q && (
            <button onClick={() => updateQuery('')} aria-label={t.scanClear || 'Clear search'}
              className="absolute end-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-lg"
              style={{ color: COL.textMute }}><X size={16} /></button>
          )}
        </div>

        {/* Compact scopes — narrow the search without leaving the screen. */}
        <div className="flex gap-2 mt-2.5 overflow-x-auto scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
          {SCOPES.map((s) => {
            const on = scope === s.key;
            return (
              <button key={s.key} onClick={() => updateScope(s.key)} aria-pressed={on}
                className="flex-shrink-0 rounded-full px-3 text-[12.5px] font-semibold border"
                style={{ minHeight: 36, background: on ? COL.accent : COL.surface, color: on ? '#fff' : COL.textDim, borderColor: on ? COL.accent : COL.border }}>
                {s.label}{s.n != null && <span className="mono text-[10.5px] opacity-75"> {s.n}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {searching ? (
          totalHits === 0 ? (
            <div className="text-[13px] text-center py-8" style={{ color: COL.textMute }}>
              {t.scanNoMatch || 'No match for'} “{q}”
            </div>
          ) : (
            <>
              {show('wir') && wirHits.length > 0 && (
                <section>
                  <div className="mono text-[10px] tracking-widest mb-1.5" style={{ color: COL.textMute }}>{(t.scopeWir || 'WIRs').toUpperCase()} ({wirHits.length})</div>
                  <div className="space-y-1.5">
                    {wirHits.slice(0, 8).map((w) => (
                      <ResultRow key={w.id} icon={ClipboardCheck} primary={w.wir_number}
                        secondary={[w.inspection_type, w.location].filter(Boolean).join(' · ')}
                        trailing={<StatusPill status={resultLabel(w.result)} />}
                        onClick={() => onOpenWir?.(w)} />
                    ))}
                  </div>
                </section>
              )}
              {show('element') && elHits.length > 0 && (
                <section>
                  <div className="mono text-[10px] tracking-widest mb-1.5" style={{ color: COL.textMute }}>{(t.scopeElement || 'Elements').toUpperCase()} ({elHits.length})</div>
                  <div className="space-y-1.5">
                    {elHits.slice(0, 6).map((e) => (
                      <ResultRow key={e.guid || e.id} icon={Box} primary={e.name || e.id} secondary={e.id || e.guid}
                        onClick={() => onOpenElement?.(e.id || null)} />
                    ))}
                  </div>
                </section>
              )}
              {show('drawing') && dwgHits.length > 0 && (
                <section>
                  <div className="mono text-[10px] tracking-widest mb-1.5" style={{ color: COL.textMute }}>{(t.scopeDrawing || 'Drawings').toUpperCase()} ({dwgHits.length})</div>
                  <div className="space-y-1.5">
                    {dwgHits.slice(0, 6).map((d) => (
                      <ResultRow key={d.id} icon={FileImage} primary={d.drawing_number}
                        secondary={[d.title, d.discipline].filter(Boolean).join(' · ')}
                        onClick={() => onNavigate?.('drawings')} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )
        ) : (
          <>
            {recentWirs.length > 0 && (
              <section>
                <div className="mono text-[10px] tracking-widest mb-1.5" style={{ color: COL.textMute }}>
                  {(t.scanRecent || 'Recent').toUpperCase()} · {(t.scopeWir || 'WIRs').toUpperCase()}
                </div>
                <div className="space-y-1.5">
                  {recentWirs.map((w) => (
                    <ResultRow key={w.id} icon={ClipboardCheck} primary={w.wir_number}
                      secondary={[w.inspection_type, w.location].filter(Boolean).join(' · ')}
                      trailing={<StatusPill status={resultLabel(w.result)} />}
                      onClick={() => onOpenWir?.(w)} />
                  ))}
                </div>
              </section>
            )}
            {recentDwgs.length > 0 && (
              <section>
                <div className="mono text-[10px] tracking-widest mb-1.5" style={{ color: COL.textMute }}>
                  {(t.scanRecent || 'Recent').toUpperCase()} · {(t.scopeDrawing || 'Drawings').toUpperCase()}
                </div>
                <div className="space-y-1.5">
                  {recentDwgs.map((d) => (
                    <ResultRow key={d.id} icon={FileImage} primary={d.drawing_number}
                      secondary={[d.title, d.discipline].filter(Boolean).join(' · ')}
                      onClick={() => onNavigate?.('drawings')} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* Camera: stated once, quietly, with no engineering explanation. */}
        <div className="rounded-xl border px-3 py-2.5 flex items-center gap-2.5" style={{ borderColor: COL.border, background: COL.surfaceAlt }}>
          <Camera size={16} className="flex-shrink-0" style={{ color: COL.textMute }} />
          <span className="text-[13px] font-medium flex-1" style={{ color: COL.textDim }}>{t.scanCamera || 'Camera scanning'}</span>
          <span className="mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: COL.surface, color: COL.textMute, border: `1px solid ${COL.border}` }}>
            {t.scanSoon || 'Coming soon'}
          </span>
        </div>
      </div>
    </div>
  );
}
