// ============================================================
// ElementDetailInspector — a right-side, full-height slide-over opened from the
// Elements Registry. Two-column on desktop:
//   LEFT  "IFC Element" — visual/identity context (read-only model data + any
//          user-added metadata). Phase-1 preview is a compact placeholder + an
//          "Open in Model" deep-link (a live embedded canvas is phase 2; see
//          note in the registry commit — a second viewer would fight the shared
//          parsed-geometry cache).
//   RIGHT "BoQ Link"    — linked BoQ line(s) with value, AI suggestions, and
//          link/unlink actions. Reuses the existing linking + suggest APIs.
// Narrow widths collapse the two columns into tabs.
// Additive only — no certification/recertify logic here.
// ============================================================
import { useEffect, useMemo, useState, useCallback } from 'react';
import { toast } from '../../components/Toast.jsx';
import { X, Box, Sparkles, Check, Link2, ExternalLink, Lock, Pencil } from 'lucide-react';
import { useElements } from '../../lib/elements.jsx';
import { listLinksForElement, linkElementBoq, unlinkElementBoq } from '../../api/elementBoqLinks.js';
import { listBoqItems, isBoqLineItem, updateBoqItem } from '../../api/boqItems.js';
import { suggestBoqLinks } from '../../lib/boqSuggest.js';
import { valueElementOnLine } from '../../lib/quantity.js';
import { normalizeStorey } from '../../lib/storey.js';
import { fmt } from '../../lib/format.js';
import { COL } from '../../lib/theme.js';
import { LinkBoard } from '../model/LinkBoard.jsx';
import { getAnnotation, upsertAnnotation } from '../../api/elementAnnotations.js';
import { updateElementUserMeta } from '../../api/models.js';

const num = (n) => Math.round((Number(n) || 0) * 100) / 100;
const typeShort = (t) => (t || '').replace(/^Ifc/, '') || '—';

// One inline-editable annotation field. Click to edit, Enter/blur saves, Escape
// cancels. Shows a subtle "Saved" flash for ~1.5s. Pure user metadata — it never
// touches IFC native data.
function AnnoField({ label, value, multiline, onSave, saved }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => { if (!editing) setDraft(value ?? ''); }, [value, editing]);
  const commit = () => { setEditing(false); if ((draft ?? '').trim() !== (value ?? '').trim()) onSave((draft ?? '').trim()); };
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <div className="py-1">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px]" style={{ color: COL.textDim }}>{label}</span>
        {saved && <span className="text-[9px]" style={{ color: '#15803d' }}>Saved</span>}
      </div>
      {editing ? (
        <Tag autoFocus rows={multiline ? 2 : undefined} value={draft} onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false); } else if (e.key === 'Enter' && !(multiline && e.shiftKey)) { e.preventDefault(); commit(); } }}
          className="w-full resize-none px-2 py-1 text-[11px] rounded border outline-none focus:border-blue-500" style={{ borderColor: COL.border, background: COL.surface, color: COL.text }} />
      ) : (
        <button onClick={() => setEditing(true)} className="w-full text-start px-2 py-1 rounded text-[11px] hover:bg-stone-50" style={{ border: `1px dashed ${COL.border}`, color: value ? COL.text : COL.textMute }}>
          {value || 'Add a display name or notes'}
        </button>
      )}
    </div>
  );
}
const confStyle = (c) => c === 'high' ? { bg: '#dcfce7', fg: '#15803d' } : c === 'medium' ? { bg: '#fef3c7', fg: '#b45309' } : { bg: COL.surfaceAlt, fg: COL.textMute };

const Def = ({ k, v }) => (
  <div className="flex justify-between gap-3 py-1"><span style={{ color: COL.textDim }}>{k}</span><span className="mono text-[11px]" style={{ color: COL.text, textAlign: 'end', wordBreak: 'break-all' }}>{v || '—'}</span></div>
);

export function ElementDetailInspector({ element, onClose, onOpenInModel, onChanged }) {
  const guid = element?.guid;
  const { elements, byGuid, reload: reloadElements } = useElements();
  // Full element (display name / ifc name / material / zone / notes / quantities).
  const el = useMemo(() => byGuid?.(guid) || element || {}, [byGuid, guid, element]);

  const [links, setLinks] = useState([]);
  const [boqAll, setBoqAll] = useState([]);
  const [suggest, setSuggest] = useState({ loading: false, items: null, unavailable: false });
  const [linkManual, setLinkManual] = useState(false);
  const [tab, setTab] = useState('ifc'); // narrow-width only: 'ifc' | 'boq'
  const [anno, setAnno] = useState(null);       // element_annotations row (user metadata)
  const [savedField, setSavedField] = useState(null);

  // Load this element's user annotations (additive table; null if none/absent).
  useEffect(() => { let live = true; setAnno(null); if (guid) getAnnotation(guid).then((a) => { if (live) setAnno(a); }); return () => { live = false; }; }, [guid]);
  async function saveAnno(field, value) {
    try {
      const row = await upsertAnnotation(guid, { [field]: value });
      setAnno(row); setSavedField(field); setTimeout(() => setSavedField((f) => (f === field ? null : f)), 1500);
    } catch (e) { toast.error(e?.message || 'Could not save annotation.'); }
  }
  // Display name is the ONE annotation that must replace the shown IFC name
  // everywhere, so it lives on the canonical model_elements.user_display_name
  // store (read across the Model view, registry table, link picker) — not the
  // separate annotations table. The raw IFC name/GUID stay read-only.
  const flash = (field) => { setSavedField(field); setTimeout(() => setSavedField((f) => (f === field ? null : f)), 1500); };
  async function saveDisplayName(value) {
    try {
      await updateElementUserMeta(guid, { user_display_name: (value ?? '').trim() || null });
      flash('display_name');
      reloadElements?.(); // shared elements context → Model view + this inspector update
      onChanged?.();      // refresh the registry table (loadElementRegistry)
    } catch (e) { toast.error(e?.message || 'Could not save the display name.'); }
  }

  const reloadLinks = useCallback(() => {
    if (!guid) return;
    Promise.all([listLinksForElement(guid).catch(() => []), listBoqItems().catch(() => [])])
      .then(([ls, bs]) => { setLinks(ls); setBoqAll(bs); });
  }, [guid]);
  // Fresh load whenever the selected element changes (also resets suggestions).
  useEffect(() => { setSuggest({ loading: false, items: null, unavailable: false }); reloadLinks(); }, [guid, reloadLinks]);

  // Esc closes.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const linkedLines = useMemo(() => {
    const byId = new Map(boqAll.map((b) => [b.id, b]));
    const out = [], seen = new Set();
    links.forEach((l) => { const b = byId.get(l.boq_item_id); if (b && !seen.has(b.id)) { seen.add(b.id); out.push({ ...b, _legacy: false }); } });
    boqAll.forEach((b) => { if (b.element_id === guid && !seen.has(b.id)) { seen.add(b.id); out.push({ ...b, _legacy: true }); } });
    return out;
  }, [links, boqAll, guid]);

  async function unlink(line) {
    try {
      if (line._legacy) await updateBoqItem(line.id, { element_id: null });
      else await unlinkElementBoq(guid, line.id);
      reloadLinks(); onChanged?.();
    } catch (e) { toast.error(e.message); }
  }
  async function fetchSuggestions() {
    setSuggest({ loading: true, items: null, unavailable: false });
    const linkedIds = new Set(linkedLines.map((l) => l.id));
    const candidates = boqAll.filter((b) => isBoqLineItem(b) && !linkedIds.has(b.id));
    const res = await suggestBoqLinks(el, candidates);
    if (!res.ok) { setSuggest({ loading: false, items: null, unavailable: true }); return; }
    const byId = new Map(boqAll.map((b) => [String(b.id), b]));
    const items = res.suggestions.map((s) => ({ line: byId.get(String(s.id)), confidence: s.confidence, reason: s.reason })).filter((s) => s.line && !linkedIds.has(s.line.id));
    setSuggest({ loading: false, items, unavailable: false });
  }
  async function accept(line) {
    try { await linkElementBoq(guid, line.id); setSuggest((s) => ({ ...s, items: (s.items || []).filter((it) => it.line.id !== line.id) })); reloadLinks(); onChanged?.(); }
    catch (e) { toast.error(e.message); }
  }
  const dismiss = (line) => setSuggest((s) => ({ ...s, items: (s.items || []).filter((it) => it.line.id !== line.id) }));

  if (!element) return null;
  // Records-summary strip colour (honest: not certification status, just records).
  const stripColor = element.ncrOpen > 0 ? '#dc2626' : element.wir > 0 ? '#15803d' : COL.borderStrong;

  // ---- Left pane: IFC Element -------------------------------------------------
  const ifcPane = (
    <div className="p-4 space-y-4">
      {/* Compact visual preview (phase 1 placeholder) */}
      <div className="rounded-lg overflow-hidden border" style={{ borderColor: COL.border }}>
        <div className="h-1.5" style={{ background: stripColor }} />
        <div className="flex flex-col items-center justify-center gap-2 py-7" style={{ background: COL.bg }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: COL.surface, border: `1px solid ${COL.border}` }}>
            <Box size={22} style={{ color: COL.accent }} />
          </div>
          <div className="text-[11px] font-semibold" style={{ color: COL.text }}>{typeShort(el.type)}</div>
          <button onClick={() => onOpenInModel?.(guid)} className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md border text-[11px] font-medium hover:bg-stone-50" style={{ borderColor: COL.borderStrong, color: COL.accent }}>
            <ExternalLink size={12} /> Open in Model
          </button>
        </div>
      </div>

      {/* From model · read only */}
      <div>
        <div className="flex items-center gap-1.5 mb-2"><Lock size={10} style={{ color: COL.textMute }} /><span className="mono text-[10px] tracking-widest" style={{ color: COL.textMute }}>FROM MODEL · READ-ONLY</span></div>
        <Def k="IFC Name" v={el.ifcName || el.name} />
        <Def k="IFC Type" v={typeShort(el.type)} />
        <Def k="Level" v={el.level ? normalizeStorey(el.level) : '—'} />
        <Def k="IFC GUID" v={el.guid} />
        <div className="mt-1.5 text-[9.5px]" style={{ color: COL.textMute }}>Base quantities (from IFC where available)</div>
        <Def k="Volume" v={el.volume != null ? `${num(el.volume)} m³` : '—'} />
        <Def k="Area" v={el.area != null ? `${num(el.area)} m²` : '—'} />
        <Def k="Length" v={el.length != null ? `${num(el.length)} m` : '—'} />
      </div>

      {/* Your annotations — editable user metadata (separate additive table) */}
      <div className="pt-3 border-t" style={{ borderColor: COL.border }}>
        <div className="flex items-center gap-1.5 mb-1.5"><Pencil size={10} style={{ color: COL.accent }} /><span className="mono text-[10px] tracking-widest" style={{ color: COL.accent }}>YOUR ANNOTATIONS</span></div>
        {/* Canonical display name (falls back to any legacy annotation value so it
            isn't lost; re-saving migrates it to the shown store). */}
        <AnnoField label="Display name (shown in place of the IFC name)" value={el.displayName ?? anno?.display_name} onSave={saveDisplayName} saved={savedField === 'display_name'} />
        {el.ifcName && <div className="text-[9.5px] -mt-0.5 mb-1 ps-2" style={{ color: COL.textMute }}>IFC name: <span className="mono">{el.ifcName}</span></div>}
        <AnnoField label="Description" value={anno?.description} multiline onSave={(v) => saveAnno('description', v)} saved={savedField === 'description'} />
        <AnnoField label="Material tag" value={anno?.material_tag} onSave={(v) => saveAnno('material_tag', v)} saved={savedField === 'material_tag'} />
        <AnnoField label="Package label" value={anno?.package_label} onSave={(v) => saveAnno('package_label', v)} saved={savedField === 'package_label'} />
        <AnnoField label="Notes" value={anno?.notes} multiline onSave={(v) => saveAnno('notes', v)} saved={savedField === 'notes'} />
        <div className="text-[9.5px] mt-1" style={{ color: COL.textMute }}>Your metadata — added alongside the IFC data, which stays read-only.</div>
      </div>
    </div>
  );

  // ---- Right pane: BoQ Link ---------------------------------------------------
  const boqPane = (
    <div className="p-4 space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-semibold" style={{ color: COL.text }}>Linked BoQ</span>
          <span className="mono text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: COL.surfaceAlt, color: COL.textDim }}>{linkedLines.length}</span>
        </div>
        {linkedLines.length === 0 ? (
          <div className="rounded-lg border px-3 py-5 text-center" style={{ borderColor: COL.border, background: COL.bg }}>
            <Link2 size={18} className="mx-auto mb-1.5" style={{ color: COL.textMute }} />
            <div className="text-[12px] font-semibold" style={{ color: COL.textDim }}>No BoQ item linked yet</div>
            <div className="flex items-center justify-center gap-2 mt-2.5">
              {!suggest.unavailable && <button onClick={fetchSuggestions} disabled={suggest.loading} className="inline-flex items-center gap-1 h-7 px-3 rounded-md text-[11px] font-medium text-white disabled:opacity-50" style={{ background: COL.accent }}><Sparkles size={12} />{suggest.loading ? 'Suggesting…' : 'Suggest matches'}</button>}
              <button onClick={() => setLinkManual(true)} className="inline-flex items-center gap-1 h-7 px-3 rounded-md border text-[11px] font-medium" style={{ borderColor: COL.borderStrong, color: COL.text }}>Link manually</button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {linkedLines.map((line) => {
              const v = valueElementOnLine(el, line);
              return (
                <div key={line.id} className="rounded-md border px-2.5 py-2" style={{ borderColor: COL.border, background: COL.surface }}>
                  <div className="flex items-center gap-2">
                    <span className="mono text-[11px] font-semibold" style={{ color: COL.accent }}>{line.code || '(no code)'}</span>
                    <span className="mono text-[8px] uppercase px-1 py-0.5 rounded" style={{ background: '#dcfce7', color: '#15803d' }}>Linked</span>
                    <button onClick={() => unlink(line)} title="Unlink" className="ms-auto p-0.5 rounded hover:bg-stone-100" style={{ color: '#b91c1c' }}><X size={13} /></button>
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: COL.text }}>{line.description || ''}</div>
                  <div className="flex items-center gap-3 mt-1 mono text-[10px]" style={{ color: COL.textDim }}>
                    <span>Unit: {line.unit || '—'}</span>
                    {line.rate ? <span>Rate: SAR {fmt(line.rate)}</span> : null}
                    {Number(line.approved_qty) > 0 ? <span>Approved: {num(line.approved_qty)}</span> : null}
                  </div>
                  {v.ok && !v.count ? (
                    <div className="mono text-[10px] mt-1" style={{ color: '#15803d' }}>{num(v.qty)} {v.unit} × SAR {fmt(v.rate)}/{v.unit} = <b>SAR {fmt(v.value)}</b></div>
                  ) : v.ok && v.count ? (
                    <div className="mono text-[10px] mt-1" style={{ color: '#15803d' }}>SAR {fmt(v.value)} (per {v.unit})</div>
                  ) : (
                    <div className="text-[9.5px] mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded" style={{ background: '#fef3c7', color: '#b45309' }}>⚠ {v.reason}</div>
                  )}
                </div>
              );
            })}
            <div className="flex items-center gap-2 pt-0.5">
              {!suggest.unavailable && <button onClick={fetchSuggestions} disabled={suggest.loading} className="inline-flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium hover:bg-stone-100 disabled:opacity-50" style={{ color: COL.accent }}><Sparkles size={11} />{suggest.loading ? 'Suggesting…' : 'Suggest more'}</button>}
              <button onClick={() => setLinkManual(true)} className="h-6 px-2 rounded border text-[10px] font-medium" style={{ borderColor: COL.border, color: COL.text }}>Link manually</button>
            </div>
          </div>
        )}
      </div>

      {/* AI suggestions */}
      {Array.isArray(suggest.items) && (
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles size={11} style={{ color: suggest.items.length ? COL.accent : COL.textMute }} />
            <span className="text-[11px] font-semibold" style={{ color: COL.text }}>Suggested links</span>
            {suggest.items.length > 0 && <span className="mono text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: COL.accentBg, color: COL.accent }}>{suggest.items.length}</span>}
            <span className="ms-auto mono text-[8px] tracking-wide" style={{ color: COL.textMute }}>HIGH·MED·LOW</span>
          </div>
          {suggest.items.length === 0 ? (
            <div className="text-[10px]" style={{ color: COL.textMute }}>No suggestions for this element — link manually.</div>
          ) : (
            <div className="space-y-1.5">
              {suggest.items.map((s) => { const c = confStyle(s.confidence); return (
                <div key={s.line.id} className="rounded-md px-2.5 py-2" style={{ background: COL.surfaceAlt }}>
                  <div className="flex items-center gap-1.5">
                    <span className="mono text-[10px] font-semibold" style={{ color: COL.accent }}>{s.line.code || '(no code)'}</span>
                    <span className="mono text-[8px] uppercase px-1 py-0.5 rounded" style={{ background: c.bg, color: c.fg }}>{s.confidence || '—'}</span>
                    <div className="ms-auto flex items-center gap-0.5">
                      <button onClick={() => accept(s.line)} title="Confirm link" className="p-0.5 rounded hover:bg-green-100" style={{ color: '#15803d' }}><Check size={13} /></button>
                      <button onClick={() => dismiss(s.line)} title="Dismiss" className="p-0.5 rounded hover:bg-stone-200" style={{ color: COL.textMute }}><X size={12} /></button>
                    </div>
                  </div>
                  <div className="text-[10px] truncate mt-0.5" style={{ color: COL.text }}>{s.line.description || ''}</div>
                  {s.reason && <div className="text-[9px] mt-0.5" style={{ color: COL.textMute }}>{s.reason}</div>}
                </div>
              ); })}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* backdrop — click-outside closes */}
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.28)' }} onClick={onClose} />
      <div className="fixed top-0 bottom-0 z-50 flex flex-col shadow-2xl" style={{ insetInlineEnd: 0, width: 'min(960px, 96vw)', background: COL.surface }}>
        {/* sticky header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b flex-shrink-0" style={{ borderColor: COL.border, background: COL.surface }}>
          <div className="min-w-0 flex-1">
            <div className="text-[10px]" style={{ color: COL.textMute }}>Element</div>
            <div className="display text-[14px] font-bold truncate leading-tight">{el.name || el.ifcName || 'Element'}</div>
            <div className="mono text-[9px] truncate" style={{ color: COL.textMute }}>{el.guid}</div>
          </div>
          <button onClick={() => onOpenInModel?.(guid)} className="hidden sm:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] font-medium hover:bg-stone-50" style={{ borderColor: COL.border, color: COL.text }}><ExternalLink size={12} />Open in Model</button>
          <button onClick={onClose} title="Close (Esc)" className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-stone-100 flex-shrink-0" style={{ color: COL.textDim }}><X size={18} /></button>
        </div>

        {/* narrow-width tab switch */}
        <div className="flex lg:hidden border-b flex-shrink-0" style={{ borderColor: COL.border }}>
          {[['ifc', 'IFC Element'], ['boq', 'BoQ Link']].map(([v, label]) => (
            <button key={v} onClick={() => setTab(v)} className="flex-1 py-2 text-[11px] font-semibold" style={{ color: tab === v ? COL.accent : COL.textDim, borderBottom: tab === v ? `2px solid ${COL.accent}` : '2px solid transparent' }}>{label}</button>
          ))}
        </div>

        {/* body — dual pane on lg, single (tabbed) below */}
        <div className="flex-1 flex min-h-0">
          <div className={`${tab === 'ifc' ? 'flex' : 'hidden'} lg:flex flex-col min-h-0 overflow-y-auto scrollbar lg:border-e`} style={{ width: '100%', borderColor: COL.border, flexBasis: '45%' }}>
            <div className="hidden lg:block px-4 pt-3 mono text-[10px] tracking-widest" style={{ color: COL.textMute }}>IFC ELEMENT</div>
            {ifcPane}
          </div>
          <div className={`${tab === 'boq' ? 'flex' : 'hidden'} lg:flex flex-col min-h-0 overflow-y-auto scrollbar`} style={{ width: '100%', flexBasis: '55%', background: COL.bg }}>
            <div className="hidden lg:block px-4 pt-3 mono text-[10px] tracking-widest" style={{ color: COL.textMute }}>BOQ LINK</div>
            {boqPane}
          </div>
        </div>
      </div>

      {/* Manual linking reuses the existing LinkBoard modal */}
      {linkManual && (
        <LinkBoard elements={elements} boqAll={boqAll} initialElements={[guid]}
          onClose={() => setLinkManual(false)} onChanged={() => { reloadLinks(); onChanged?.(); }} />
      )}
    </>
  );
}
