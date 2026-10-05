import { useState, useEffect, useCallback } from 'react';
import { Download, Plus, RotateCcw, FlaskConical } from 'lucide-react';
import { Btn, PageHeader, StatusPill } from '../components/primitives.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { elementByGuid } from '../components/ElementPicker.jsx';
import { QcFormModal } from './qc/QcForm.jsx';
import { QcDetailModal } from './qc/QcDetail.jsx';
import { listQcTests } from '../api/qcTests.js';
import { qcResultLabel } from '../lib/qcStatus.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';
import { usePermissions } from '../lib/usePermissions.jsx';
import { COL } from '../lib/theme.js';
import { exportSheet } from '../lib/excelExport.js';

// ============================================================
// QC VIEW — real CRUD backed by Supabase.
// ============================================================
export function QCView({ t, onSelectElement, setRoute }) {
  const { requireAuth } = useAuth();
  const { can } = usePermissions();
  const canRecord = can('qc.record');
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setTests([]); setLoading(false); return; }
    setLoading(true); setError(null);
    try { setTests(await listQcTests()); }
    catch (err) { setError(err?.message ?? String(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title={t.qc} subtitle="QC test register and lab results"
        actions={<><Btn icon={RotateCcw} onClick={load}>Refresh</Btn><Btn icon={Download} onClick={() => exportSheet({ fileName: 'QC-tests', title: 'QUALITY CONTROL TESTS', rows: tests, columns: [
          { label: 'QC ID', key: 'qc_number', width: 12 },
          { label: 'Element', key: 'element_guid', width: 22 },
          { label: 'Test', key: 'test_name', width: 22 },
          { label: 'Specification', key: 'specification', width: 22 },
          { label: 'Result Value', key: 'result_value', width: 14 },
          { label: 'Pass/Fail', key: 'result', width: 12 },
          { label: 'Lab', key: 'lab', width: 18 },
          { label: 'Date', key: 'test_date', width: 12 },
        ] })}>Export</Btn>{canRecord && <Btn icon={Plus} variant="primary" onClick={() => requireAuth(() => setAddOpen(true))}>{t.addQcTest}</Btn>}</>} />

      {!isSupabaseConfigured && (
        <div className="mx-6 mt-3 text-xs px-3 py-2 rounded border" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>
          Supabase isn't configured. Add your keys to <span className="mono">.env</span> and restart the dev server.
        </div>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-auto scrollbar">
        {loading ? (
          <div className="text-center text-xs py-10" style={{ color: COL.textMute }}>Loading QC tests…</div>
        ) : error ? (
          <div className="mx-6 my-4 text-xs px-3 py-2 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{error}</div>
        ) : tests.length === 0 ? (
          <EmptyState icon={FlaskConical} title="No quality tests yet"
            description="Record quality tests against elements (concrete, compaction, MEP…). An open issue blocks certification until it's resolved."
            steps={['Add a QC test for an element', 'Record the result', 'A failed test flags the element']}
            actions={canRecord ? [{ label: t.addQcTest, icon: Plus, onClick: () => requireAuth(() => setAddOpen(true)) }] : []} />
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 mono" style={{ background: COL.surface, color: COL.textDim }}>
              <tr style={{ borderBottom: `1px solid ${COL.border}` }}>
                <th className="px-4 py-2.5 text-left">QC ID</th>
                <th className="px-4 py-2.5 text-left">Element</th>
                <th className="px-4 py-2.5 text-left">Test</th>
                <th className="px-4 py-2.5 text-left">Specification</th>
                <th className="px-4 py-2.5 text-left">Result Value</th>
                <th className="px-4 py-2.5 text-left">Pass/Fail</th>
                <th className="px-4 py-2.5 text-left">Lab</th>
                <th className="px-4 py-2.5 text-left">Date</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((q) => {
                const el = elementByGuid(q.element_guid);
                return (
                  <tr key={q.id} onClick={() => setDetail(q)} className="border-b hover:bg-stone-50 cursor-pointer" style={{ borderColor: COL.border }}>
                    <td className="px-4 py-2.5 mono font-semibold" style={{ color: COL.accent }}>{q.qc_number}</td>
                    <td className="px-4 py-2.5 mono text-[11px]">
                      {q.element_guid ? (
                        <button onClick={(e) => { e.stopPropagation(); if (el) { onSelectElement(el.id); setRoute('model'); } }} disabled={!el} className="hover:underline disabled:no-underline" style={{ color: el ? COL.accent : COL.textDim }}>{el ? el.id : q.element_guid}</button>
                      ) : <span style={{ color: COL.textMute }}>—</span>}
                    </td>
                    <td className="px-4 py-2.5">{q.test_name}</td>
                    <td className="px-4 py-2.5 mono text-[10px]" style={{ color: COL.textDim }}>{q.specification}</td>
                    <td className="px-4 py-2.5 mono font-semibold" style={{ color: q.result === 'pass' ? '#16a34a' : q.result === 'fail' ? '#dc2626' : COL.textDim }}>{q.result_value}</td>
                    <td className="px-4 py-2.5"><StatusPill status={qcResultLabel(q.result)} /></td>
                    <td className="px-4 py-2.5" style={{ color: COL.textDim }}>{q.lab}</td>
                    <td className="px-4 py-2.5 mono text-[10px]" style={{ color: COL.textDim }}>{q.test_date}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <QcFormModal open={addOpen} initial={null} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); }} />
      <QcDetailModal open={Boolean(detail)} test={detail} onClose={() => setDetail(null)} onChanged={() => { load(); setDetail(null); }} onSelectElement={onSelectElement} setRoute={setRoute} />
    </div>
  );
}
