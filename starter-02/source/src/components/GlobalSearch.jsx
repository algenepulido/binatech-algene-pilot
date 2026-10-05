// ============================================================
// GlobalSearch — looks up records across modules by their number/name
// and navigates to the matching screen. Used in the header.
// ============================================================
import { useState, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { getCurrentProjectId } from '../lib/currentProject.js';
import { COL } from '../lib/theme.js';
// [table, column, route, label]
const SOURCES = [
  ['wirs', 'wir_number', 'wirs', 'WIR'],
  ['ncrs', 'ncr_number', 'ncrs', 'NCR'],
  ['qc_tests', 'qc_number', 'qc', 'QC'],
  ['snags', 'snag_number', 'snagging', 'Snag'],
  ['drawings', 'drawing_number', 'drawings', 'Drawing'],
  ['documents', 'doc_no', 'dms', 'Document'],
  ['ipcs', 'ipc_number', 'ipcs', 'IPC'],
  ['invoices', 'invoice_number', 'invoices', 'Invoice'],
  ['purchase_orders', 'po_number', 'pos', 'PO'],
  ['vendors', 'name', 'pos', 'Vendor'],
];

export function GlobalSearch({ onNavigate, placeholder }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function onChange(v) {
    setQ(v);
    clearTimeout(timer.current);
    if (!isSupabaseConfigured || v.trim().length < 2) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(() => runSearch(v.trim()), 250);
  }

  async function runSearch(term) {
    const queries = SOURCES.map(([table, col, route, label]) =>
      supabase.from(table).select(`id, ${col}`).eq('project_id', getCurrentProjectId()).ilike(col, `%${term}%`).limit(4)
        .then((r) => (r.data || []).map((row) => ({ route, label, text: row[col] })))
        .catch(() => []),
    );
    const all = (await Promise.all(queries)).flat().slice(0, 12);
    setResults(all);
    setOpen(true);
  }

  return (
    <div className="relative hidden md:block" ref={boxRef}>
      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: COL.textMute }} />
      <input
        value={q}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        placeholder={placeholder}
        className="w-72 pl-8 pr-2 py-1.5 text-xs rounded border outline-none focus:border-blue-500"
        style={{ background: COL.bg, borderColor: COL.border, color: COL.text }}
      />
      {open && (
        <div className="absolute z-50 mt-1 w-72 rounded-lg border shadow-lg max-h-80 overflow-y-auto scrollbar" style={{ background: COL.surface, borderColor: COL.border }}>
          {results.length === 0 ? (
            <div className="px-3 py-3 text-xs text-center" style={{ color: COL.textMute }}>No matches</div>
          ) : results.map((r, i) => (
            <button key={i} onClick={() => { onNavigate(r.route); setOpen(false); setQ(''); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-stone-50 border-b last:border-0" style={{ borderColor: COL.border }}>
              <span className="mono text-[9px] px-1.5 py-0.5 rounded font-bold flex-shrink-0" style={{ background: COL.surfaceAlt, color: COL.textDim }}>{r.label}</span>
              <span className="mono text-[11px] truncate" style={{ color: COL.text }}>{r.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
