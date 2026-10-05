// ============================================================
// DocumentsField — Documents on the phone and the field tablet (MOB-UI1).
//
// Presentation only. DMSView still owns the data path (listDocuments, the
// configured gate, requireAuth → DocFormModal, the detail aside); this child
// receives state and handlers and draws the reviewed v4.1 field grammar with
// the existing FIELD tokens: compact title with ONE Upload action, a 48px
// search field, a progressive Type/Status sheet over the real enums, and four
// states that cannot be read as each other — loading (placeholder rows),
// read error (alert + Retry, never an empty claim), a real empty register,
// and the list. Filter choices made in the sheet are pending until Apply;
// dismissing drops them; Clear resets them; applied filters are removable.
//
// The sheet is a real modal (MOB-UI1.1): it is portalled to <body>, every
// other body child is `inert` while it is open (so the bottom nav, the header
// and the list cannot take focus or clicks), Tab/Shift+Tab cycle inside it, and
// Escape / Apply / Close / backdrop return focus to the Filters button only
// after the page is interactive again.
// ============================================================
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, Upload, X } from 'lucide-react';
import { FIELD, MONO } from '../../lib/fieldTokens.js';
import { Surface, Rule, Eyebrow } from '../field/surface.jsx';
import { DOC_STATUS, DOC_TYPES } from '../../data/documents.js';

const control = { minHeight: FIELD.tap, padding: '0 13px', borderRadius: FIELD.rControl, border: `1px solid rgba(22,33,31,.16)`, background: '#FFFFFF', color: FIELD.dim, fontSize: 12.5, fontWeight: 450, fontFamily: 'inherit', cursor: 'pointer' };
const chipStyle = (on) => ({ ...control, borderColor: on ? '#245EA8' : 'rgba(22,33,31,.16)', background: on ? '#EAF1FA' : '#FFFFFF', color: on ? '#245EA8' : FIELD.dim, fontWeight: on ? 600 : 450 });
const mono = { fontFamily: MONO };

export function DocumentsField({
  t, lang = 'en', configured = true, loading, error, docs, list, q, onSearch, filter, statusFilter, onFilters, onRetry, onUpload, onSelect, selectedId, onBack,
}) {
  const ar = lang === 'ar';
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pending, setPending] = useState({ type: 'all', status: 'all' });
  const filtersButton = useRef(null);
  const sheetRef = useRef(null);
  const sheetTitle = useId();
  const [host] = useState(() => (typeof document === 'undefined' ? null : document.createElement('div')));
  const restoreFocus = useRef(false);

  const active = [filter !== 'all' && { key: `type:${filter}`, label: `${t.type}: ${DOC_TYPES[filter]?.label ?? filter}`, clear: () => onFilters({ type: 'all', status: statusFilter }) },
    statusFilter !== 'all' && { key: `status:${statusFilter}`, label: `${t.status}: ${DOC_STATUS[statusFilter]?.label ?? statusFilter}`, clear: () => onFilters({ type: filter, status: 'all' }) }].filter(Boolean);
  const state = !configured ? 'unavailable' : loading ? 'loading' : error ? 'error' : docs.length === 0 ? 'empty' : list.length === 0 ? 'filtered-empty' : 'list';

  const openSheet = () => { setPending({ type: filter, status: statusFilter }); setSheetOpen(true); };
  const closeSheet = () => { restoreFocus.current = true; setSheetOpen(false); };
  const applySheet = () => { onFilters(pending); closeSheet(); };
  // Modal lifetime: mount the portal host, make every other body child inert, focus the sheet.
  // Cleanup (before the restore effect below runs) lifts inert and removes the host.
  useLayoutEffect(() => {
    if (!sheetOpen || !host) return undefined;
    document.body.appendChild(host);
    const made = [];
    for (const node of document.body.children) {
      if (node === host || node.tagName === 'SCRIPT' || node.tagName === 'STYLE' || node.hasAttribute('inert')) continue;
      node.setAttribute('inert', ''); made.push(node);
    }
    sheetRef.current?.focus();
    return () => { for (const node of made) node.removeAttribute('inert'); host.remove(); };
  }, [sheetOpen, host]);
  useEffect(() => {
    if (sheetOpen || !restoreFocus.current) return;
    restoreFocus.current = false;
    filtersButton.current?.focus();
  }, [sheetOpen]);
  const onSheetKeyDown = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeSheet(); return; }
    if (e.key !== 'Tab') return;
    const items = [...sheetRef.current.querySelectorAll(FOCUSABLE)];
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0]; const last = items[items.length - 1]; const current = document.activeElement;
    const outside = !sheetRef.current.contains(current) || current === sheetRef.current;
    if (e.shiftKey && (current === first || outside)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (current === last || outside)) { e.preventDefault(); first.focus(); }
  };

  const count = list.length === 1 ? t.one : t.many.replace('{n}', String(list.length));

  return (
    <div data-documents-field data-documents-state={state} dir={ar ? 'rtl' : 'ltr'} className="flex-1 flex flex-col overflow-hidden" style={{ background: FIELD.page, color: FIELD.ink }}>
      {/* Compact header: back to More, title, the ONE upload action. */}
      <div className="flex-none" style={{ background: FIELD.surface, padding: '6px 14px 12px' }}>
        <div className="flex items-center gap-2" style={{ minHeight: 44 }}>
          <button type="button" onClick={onBack} aria-label={t.back} className="flex-none flex items-center justify-center" style={{ minWidth: 44, minHeight: 44, borderRadius: FIELD.rControl, background: 'transparent', border: 0, color: FIELD.ink }}>
            {ar ? <ChevronRight size={22} /> : <ChevronLeft size={22} />}
          </button>
          <h1 className="flex-1 min-w-0 truncate" style={{ fontSize: 27, fontWeight: 600, letterSpacing: '-.02em', margin: 0 }}>{t.title}</h1>
          <button type="button" data-documents-upload onClick={onUpload} className="flex-none flex items-center gap-2"
            style={{ minHeight: FIELD.tapPrimary, padding: '0 15px', borderRadius: FIELD.rControl, border: 0, background: FIELD.ink, color: FIELD.onDark, fontSize: 15, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
            <Upload size={17} /> {t.upload}
          </button>
        </div>
        <label className="flex items-center gap-2.5" style={{ minHeight: 48, background: '#FFFFFF', border: '1px solid rgba(22,33,31,.16)', borderRadius: FIELD.rControl, padding: '0 13px', marginTop: 8 }}>
          <Search size={16} className="flex-none" style={{ color: FIELD.mute }} />
          <input type="search" role="searchbox" value={q} onChange={(e) => onSearch(e.target.value)} placeholder={t.search} aria-label={t.search}
            className="flex-1 min-w-0 bg-transparent outline-none" style={{ fontSize: 16, minHeight: 46, border: 0, color: FIELD.ink }} />
        </label>
        <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 8 }}>
          <button ref={filtersButton} type="button" onClick={openSheet} aria-haspopup="dialog" aria-expanded={sheetOpen} className="flex items-center gap-1.5" style={{ ...chipStyle(active.length > 0), fontSize: 13 }}>
            <SlidersHorizontal size={15} /> {t.filters}{active.length ? ` · ${active.length}` : ''}
          </button>
          {active.map((a) => (
            <span key={a.key} data-active-filter={a.key} className="flex items-center gap-1" style={{ ...chipStyle(true), paddingInlineEnd: 4 }}>
              {a.label}
              <button type="button" onClick={a.clear} aria-label={`${t.remove}: ${a.label}`} className="flex items-center justify-center" style={{ minWidth: 32, minHeight: 32, border: 0, background: 'transparent', color: '#245EA8', borderRadius: FIELD.rControl, cursor: 'pointer' }}><X size={14} /></button>
            </span>
          ))}
          {state === 'list' && <span data-doc-count className="ms-auto" dir="ltr" style={{ ...mono, fontSize: 11.5, color: FIELD.mute }}>{count}</span>}
        </div>
      </div>
      <div className="flex-none" style={{ height: 1, background: FIELD.hair }} />

      <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ padding: '16px 14px 24px' }}>
        {state === 'unavailable' && <p role="status" style={{ fontSize: 13.5, color: FIELD.dim, lineHeight: 1.55, padding: '6px 4px' }}>{t.notConfigured}</p>}

        {state === 'loading' && (
          <Surface aria-busy="true">
            <p role="status" style={{ fontSize: 13, color: FIELD.mute, padding: '14px 15px 4px' }}>{t.loading}</p>
            {[0, 1, 2].map((i) => (
              <div key={i} data-doc-skeleton style={{ padding: '12px 15px', display: 'grid', gap: 7 }}>
                <div style={{ height: 12, width: `${34 - i * 6}%`, borderRadius: 8, background: '#E9EAEE' }} />
                <div style={{ height: 14, width: `${84 - i * 9}%`, borderRadius: 8, background: '#E9EAEE' }} />
              </div>
            ))}
          </Surface>
        )}

        {state === 'error' && (
          <Surface role="alert" style={{ padding: '16px 15px' }}>
            <Eyebrow tone={FIELD.fail}>{t.errorTitle}</Eyebrow>
            <p style={{ fontSize: 13.5, color: FIELD.ink, margin: '0 0 4px', overflowWrap: 'anywhere' }}>{error}</p>
            <p style={{ fontSize: 12.5, color: FIELD.mute, margin: '0 0 14px' }}>{t.errorHint}</p>
            <button type="button" onClick={onRetry} style={{ ...control, minHeight: FIELD.tapPrimary, color: FIELD.ink, fontSize: 15, fontWeight: 500, borderColor: 'rgba(22,33,31,.2)' }}>{t.retry}</button>
          </Surface>
        )}

        {state === 'empty' && (
          <Surface style={{ padding: '18px 15px' }}>
            <p style={{ fontSize: 15, fontWeight: 500, margin: '0 0 4px' }}>{t.empty}</p>
            <p style={{ fontSize: 13, color: FIELD.mute, margin: 0, lineHeight: 1.55 }}>{t.emptyHint}</p>
          </Surface>
        )}

        {state === 'filtered-empty' && (
          <Surface style={{ padding: '18px 15px' }}>
            <p style={{ fontSize: 13.5, color: FIELD.dim, margin: '0 0 14px', lineHeight: 1.55 }}>{t.noMatch}</p>
            <button type="button" onClick={() => { onSearch(''); onFilters({ type: 'all', status: 'all' }); }} style={{ ...control, minHeight: FIELD.tapPrimary, color: FIELD.ink, fontSize: 15, fontWeight: 500 }}>{t.clearFilters}</button>
          </Surface>
        )}

        {state === 'list' && (
          <Surface style={{ padding: '3px 0' }}>
            {list.map((d, i) => {
              const status = DOC_STATUS[d.status]; const type = DOC_TYPES[d.type];
              return (
                <div key={d.id}>
                  {i > 0 && <Rule inset={15} />}
                  <button type="button" data-doc-row onClick={() => onSelect(d)} aria-current={selectedId === d.id ? 'true' : undefined}
                    className="w-full flex items-center gap-3 text-start" style={{ minHeight: 60, padding: '10px 15px', border: 0, background: selectedId === d.id ? '#EAF1FA' : 'transparent', color: 'inherit', fontFamily: 'inherit', cursor: 'pointer' }}>
                    <span className="flex-none" style={{ width: 9, height: 9, background: status?.color || FIELD.ink }} />
                    <span className="flex-1 min-w-0">
                      <span className="block" dir="ltr" style={{ ...mono, fontSize: 11, color: FIELD.mute, unicodeBidi: 'isolate', textAlign: ar ? 'right' : 'left' }}>{d.doc_no}</span>
                      <span className="block truncate" style={{ fontSize: 14.5, fontWeight: 500, lineHeight: 1.3, marginTop: 1 }}>{d.title}</span>
                      <span className="block truncate" style={{ fontSize: 12, color: FIELD.mute, marginTop: 2 }}>{[type?.label ?? d.type, d.rev != null && `${t.rev} ${d.rev}`, d.doc_date].filter(Boolean).join(' · ')}</span>
                      <span className="block" style={{ ...mono, fontSize: 10, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', whiteSpace: 'nowrap', marginTop: 3, color: status?.color || FIELD.ink }}>{status?.label ?? d.status}</span>
                    </span>
                    <span className="flex-none" style={{ color: FIELD.faint, fontSize: 18, transform: ar ? 'scaleX(-1)' : 'none' }}>›</span>
                  </button>
                </div>
              );
            })}
          </Surface>
        )}
      </div>

      {/* Progressive filter sheet: choices are pending until Apply. Portalled to <body>; see the modal lifetime above. */}
      {sheetOpen && host && createPortal(
        <div data-filter-backdrop className="fixed inset-0 z-40 flex items-end" style={{ background: 'rgba(22,33,31,.28)' }} onMouseDown={(e) => { if (e.target === e.currentTarget) closeSheet(); }}>
          <div ref={sheetRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={sheetTitle} dir={ar ? 'rtl' : 'ltr'} onKeyDown={onSheetKeyDown}
            className="w-full outline-none" style={{ background: FIELD.surface, borderRadius: `${FIELD.rSurface}px ${FIELD.rSurface}px 0 0`, padding: '10px 16px calc(16px + env(safe-area-inset-bottom))', maxHeight: '80dvh', overflowY: 'auto' }}>
            <div className="flex justify-center" style={{ paddingBottom: 6 }}><div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(22,33,31,.16)' }} /></div>
            <div className="flex items-center" style={{ minHeight: 44, marginBottom: 6 }}>
              <h2 id={sheetTitle} className="flex-1" style={{ fontSize: 19, fontWeight: 600, margin: 0 }}>{t.filters}</h2>
              <button type="button" onClick={closeSheet} aria-label={t.close} className="flex items-center justify-center" style={{ minWidth: 44, minHeight: 44, border: 0, background: 'transparent', color: FIELD.ink, borderRadius: FIELD.rControl, cursor: 'pointer' }}><X size={20} /></button>
            </div>
            {[['type', t.type, DOC_TYPES], ['status', t.status, DOC_STATUS]].map(([key, label, ENUM]) => (
              <div key={key} data-filter-group={key} style={{ marginBottom: 14 }}>
                <Eyebrow style={{ marginBottom: 6 }}>{label}</Eyebrow>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" aria-pressed={pending[key] === 'all'} onClick={() => setPending((p) => ({ ...p, [key]: 'all' }))} style={chipStyle(pending[key] === 'all')}>{t.all}</button>
                  {Object.keys(ENUM).map((k) => (
                    <button key={k} type="button" aria-pressed={pending[key] === k} onClick={() => setPending((p) => ({ ...p, [key]: p[key] === k ? 'all' : k }))} style={chipStyle(pending[key] === k)}>{ENUM[k].label}</button>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex gap-2.5" style={{ marginTop: 4 }}>
              <button type="button" onClick={() => setPending({ type: 'all', status: 'all' })} style={{ ...control, minHeight: FIELD.tapPrimary, flex: 1, color: FIELD.ink, fontSize: 15, fontWeight: 500, borderColor: 'rgba(22,33,31,.2)' }}>{t.clear}</button>
              <button type="button" onClick={applySheet} style={{ minHeight: FIELD.tapPrimary, flex: 2, padding: '0 15px', borderRadius: FIELD.rControl, border: 0, background: FIELD.ink, color: FIELD.onDark, fontSize: 15, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>{t.apply}</button>
            </div>
          </div>
        </div>, host)}
    </div>
  );
}
