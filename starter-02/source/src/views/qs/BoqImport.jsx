// ============================================================
// BoqImportModal — upload an Excel BOQ, structure it (AI if the Edge
// Function is deployed, otherwise an automatic heuristic), PREVIEW &
// edit, then save into boq_items only on confirmation.
// ============================================================
import { useRef, useState } from 'react';
import { Check, Sparkles, Upload, Trash2 } from 'lucide-react';
import { Modal } from '../../components/Modal.jsx';
import { Btn } from '../../components/primitives.jsx';
import { parseXlsx, heuristicMap, aiParse, lineConfidence } from '../../lib/boqImport.js';
import { createBoqItem } from '../../api/boqItems.js';
import { fmt } from '../../lib/format.js';
import { COL } from '../../lib/theme.js';

const cell = { width: '100%', padding: '4px 6px', fontSize: 11, borderRadius: 4, border: `1px solid ${COL.border}`, background: COL.bg, color: COL.text, outline: 'none' };

export function BoqImportModal({ open, onClose, onImported }) {
  const [phase, setPhase] = useState('idle'); // idle | parsing | preview | saving | done
  const [rows, setRows] = useState([]);
  const [source, setSource] = useState('');
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(0);
  const fileRef = useRef(null);

  function reset() { setPhase('idle'); setRows([]); setError(null); setSaved(0); setSource(''); }

  async function onFile(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setError(null); setPhase('parsing'); setRows([]);
    try {
      const raw = await parseXlsx(file);
      let mapped, src;
      // Prefer the AI parser (parse-boq Edge Function); fall back to the local
      // heuristic only if AI is unavailable (function not deployed, no API key,
      // not signed in, or a parse error).
      try {
        mapped = await aiParse(raw);
        src = 'Parsed with AI ✨';
      } catch (aiErr) {
        console.info('BoQ import: AI parser unavailable, using heuristic —', aiErr?.message || aiErr);
        const h = heuristicMap(raw);
        if (!h.ok) throw new Error('Could not detect BOQ columns. Ensure the sheet has headers like Code, Description, Unit, Qty, Rate.');
        mapped = h.rows; src = 'Parsed (heuristic fallback)';
      }
      if (!mapped.length) throw new Error('No BOQ rows found in the sheet.');
      setRows(mapped); setSource(src); setPhase('preview');
    } catch (err) { setError(err?.message ?? String(err)); setPhase('idle'); }
  }

  const upd = (i, f, v) => setRows((rs) => rs.map((r, idx) => idx === i ? { ...r, [f]: (f === 'qty' || f === 'rate') ? (Number(v) || 0) : v } : r));
  const del = (i) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  async function confirmImport() {
    setPhase('saving'); setError(null);
    let includeSection = true, n = 0;
    try {
      // Only real priced LINE items are saved. Section/division headers and
      // notes/PDF references are excluded (kept for grouping/totals, not stored
      // as priced BoQ lines). The user has reviewed/edited the Type column.
      for (const r of rows.filter((x) => x.kind === 'line' && x.included !== false)) {
        // Store the real code, or null when genuinely absent — NEVER the literal
        // "(no code)" (which used to break the summary-row filter and show up as
        // a fake code everywhere). Missing codes can be backfilled in QS/BoQ.
        const base = { code: (r.code ?? '').toString().trim() || null, description: r.description, unit: r.unit, qty: r.qty, rate: r.rate, approved_qty: 0, position: r.position };
        const payload = includeSection ? { ...base, section: r.section } : base;
        try { await createBoqItem(payload); }
        catch (e) {
          if (includeSection && /section/i.test(e.message || '')) { includeSection = false; await createBoqItem(base); }
          else throw e;
        }
        n++;
      }
      setSaved(n); setPhase('done'); onImported?.();
    } catch (err) { setError(`Saved ${n} of ${rows.length}, then: ${err?.message ?? err}`); setPhase('preview'); }
  }

  const lineRows = rows.filter((r) => r.kind === 'line');
  const importRows = lineRows.filter((r) => r.included !== false); // unchecked rows are skipped
  const nHeaders = rows.filter((r) => r.kind === 'section').length;
  const nNotes = rows.filter((r) => r.kind === 'note').length;
  const total = importRows.reduce((s, r) => s + ((Number(r.qty) || 0) * (Number(r.rate) || 0)), 0);
  const KIND_STYLE = { line: { bg: '#f0fdf4', color: '#15803d' }, section: { bg: '#eff6ff', color: '#1d4ed8' }, note: { bg: '#f5f5f4', color: '#78716c' } };
  const CONF_STYLE = { high: { bg: '#dcfce7', color: '#15803d' }, medium: { bg: '#fef3c7', color: '#b45309' }, low: { bg: '#f5f5f4', color: '#78716c' } };
  // Structured grouping by section (for the preview summary).
  const sectionGroups = (() => {
    const m = new Map();
    importRows.forEach((r) => { const s = (r.section || '').trim() || 'Unsectioned'; const g = m.get(s) || { n: 0, total: 0 }; g.n++; g.total += (Number(r.qty) || 0) * (Number(r.rate) || 0); m.set(s, g); });
    return [...m.entries()];
  })();

  return (
    <Modal open={open} onClose={() => { reset(); onClose?.(); }} title="Import BOQ from Excel" subtitle="AI-assisted — review before it saves" width={860}
      footer={
        phase === 'preview' ? <><Btn variant="secondary" onClick={() => { reset(); onClose?.(); }}>Cancel</Btn><Btn variant="primary" icon={Check} onClick={confirmImport}>Import {importRows.length} line items</Btn></>
          : phase === 'done' ? <Btn variant="primary" onClick={() => { reset(); onClose?.(); }}>Done</Btn>
            : <Btn variant="secondary" onClick={() => { reset(); onClose?.(); }}>Close</Btn>
      }>
      {phase === 'idle' && (
        <div className="text-center py-8">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={onFile} />
          <Btn icon={Upload} variant="primary" onClick={() => fileRef.current?.click()}>Choose .xlsx file</Btn>
          <div className="text-xs mt-3" style={{ color: COL.textDim }}>Any layout — we detect the columns (Code, Description, Unit, Qty, Rate, Amount, Section). You'll review the rows before anything is saved.</div>
          {error && <div className="text-xs mt-3 px-2 py-1.5 rounded inline-block" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}
        </div>
      )}
      {phase === 'parsing' && <div className="text-center py-10 text-sm" style={{ color: COL.accent }}><Sparkles size={18} className="inline mr-2" />Reading the spreadsheet…</div>}
      {phase === 'saving' && <div className="text-center py-10 text-sm" style={{ color: COL.accent }}>Saving rows…</div>}
      {phase === 'done' && <div className="text-center py-10 text-sm" style={{ color: '#15803d' }}><Check size={18} className="inline mr-2" />Imported {saved} BOQ rows into the project.</div>}

      {phase === 'preview' && (
        <div>
          <div className="flex items-center justify-between mb-2 text-xs flex-wrap gap-1">
            <span style={{ color: COL.textDim }}><b style={{ color: source.startsWith('Parsed with AI') ? '#7c3aed' : COL.textDim }}>{source}</b> · <span style={{ color: '#15803d' }}>{lineRows.length} line items</span> · <span style={{ color: '#1d4ed8' }}>{nHeaders} headers</span> · <span style={{ color: '#78716c' }}>{nNotes} notes</span> excluded · total <span className="mono">SAR {fmt(total)}</span></span>
            <span style={{ color: COL.textMute }}>Only <b>line items</b> are saved. Fix the <b>Type</b>, code or qty/rate below if a row is misclassified, then Import.</span>
          </div>
          {error && <div className="text-xs mb-2 px-2 py-1.5 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>}
          {/* Structured grouping by section — overview before committing */}
          {sectionGroups.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {sectionGroups.map(([s, g]) => (
                <span key={s} className="text-[10.5px] px-2 py-1 rounded-full" style={{ background: COL.surfaceAlt, color: COL.textDim }}>
                  <b style={{ color: '#1d4ed8' }}>{s}</b> · {g.n} item{g.n === 1 ? '' : 's'} · <span className="mono">SAR {fmt(g.total)}</span>
                </span>
              ))}
            </div>
          )}
          <div className="border rounded overflow-auto scrollbar" style={{ borderColor: COL.border, maxHeight: '50vh' }}>
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 mono" style={{ background: COL.surfaceAlt, color: COL.textDim }}>
                <tr>{['✓', 'Type', 'Section', 'Code', 'Description', 'Unit', 'Qty', 'Rate', 'Amount', 'Conf', ''].map((h) => <th key={h} className="px-2 py-1.5 text-left">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r, i) => { const conf = r.kind === 'line' ? lineConfidence(r) : null; return (
                  <tr key={i} className="border-t" style={{ borderColor: COL.border, opacity: r.kind === 'line' ? (r.included === false ? 0.5 : 1) : 0.6 }}>
                    <td className="px-1 py-1 text-center">
                      <input type="checkbox" checked={r.kind === 'line' && r.included !== false} disabled={r.kind !== 'line'} onChange={(e) => upd(i, 'included', e.target.checked)} title={r.kind === 'line' ? 'Include in import' : 'Only line items import'} className="accent-blue-700" />
                    </td>
                    <td className="px-1 py-1">
                      <select value={r.kind || 'line'} onChange={(e) => upd(i, 'kind', e.target.value)} className="mono" style={{ ...cell, width: 78, ...(KIND_STYLE[r.kind] ? { background: KIND_STYLE[r.kind].bg, color: KIND_STYLE[r.kind].color } : {}) }}>
                        <option value="line">Line</option>
                        <option value="section">Header</option>
                        <option value="note">Note</option>
                      </select>
                    </td>
                    <td className="px-1 py-1"><input style={cell} value={r.section || ''} onChange={(e) => upd(i, 'section', e.target.value)} /></td>
                    <td className="px-1 py-1"><input style={{ ...cell, width: 70 }} className="mono" value={r.code || ''} onChange={(e) => upd(i, 'code', e.target.value)} /></td>
                    <td className="px-1 py-1"><input style={cell} value={r.description || ''} onChange={(e) => upd(i, 'description', e.target.value)} /></td>
                    <td className="px-1 py-1"><input style={{ ...cell, width: 50 }} value={r.unit || ''} onChange={(e) => upd(i, 'unit', e.target.value)} /></td>
                    <td className="px-1 py-1"><input style={{ ...cell, width: 64 }} className="mono text-right" value={r.qty} onChange={(e) => upd(i, 'qty', e.target.value)} /></td>
                    <td className="px-1 py-1"><input style={{ ...cell, width: 72 }} className="mono text-right" value={r.rate} onChange={(e) => upd(i, 'rate', e.target.value)} /></td>
                    <td className="px-2 py-1 mono text-right" style={{ color: COL.textDim }}>{fmt((Number(r.qty) || 0) * (Number(r.rate) || 0))}</td>
                    <td className="px-1 py-1">{conf && <span className="mono text-[8.5px] uppercase px-1 py-0.5 rounded" style={{ background: CONF_STYLE[conf].bg, color: CONF_STYLE[conf].color }}>{conf}</span>}</td>
                    <td className="px-1 py-1 text-center"><button onClick={() => del(i)} style={{ color: '#b91c1c' }}><Trash2 size={12} /></button></td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
