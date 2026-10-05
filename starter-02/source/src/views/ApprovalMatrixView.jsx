import { useState, useEffect, useCallback, useMemo } from 'react';
import { StyledSelect } from '../components/StyledSelect.jsx';
import { ArrowRight, Plus, Check } from 'lucide-react';
import { Btn, PageHeader } from '../components/primitives.jsx';
import { Modal } from '../components/Modal.jsx';
import { APPROVAL_MATRIX } from '../data/finance.js';
import { listDelegations, createDelegation } from '../api/delegations.js';
import { listSupplierInvoices } from '../api/supplierInvoices.js';
import { COL } from '../lib/theme.js';
import { useProject } from '../lib/project.jsx';

const TIERS = ['T1', 'T2', 'T3', 'T4', 'SC', 'EX'];

// ============================================================
// APPROVAL MATRIX / DELEGATION — authority tiers (configuration) plus LIVE
// delegations (persisted) and a routing audit derived from real invoices.
// ============================================================
export function ApprovalMatrixView({ t }) {
  const { project } = useProject();
  const [delegations, setDelegations] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ tier: 'T3', from_role: '', to_role: '', start_date: '', end_date: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const reload = useCallback(() => {
    listDelegations().then(setDelegations).catch(() => {});
    listSupplierInvoices().then(setInvoices).catch(() => {});
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function addDelegation() {
    if (!form.from_role.trim() || !form.to_role.trim()) { setErr('Enter both the delegating and receiving roles.'); return; }
    if (form.start_date && form.end_date && form.end_date < form.start_date) { setErr('End date can’t be before the start date.'); return; }
    setBusy(true); setErr('');
    try {
      await createDelegation(form);
      setShowAdd(false); setForm({ tier: 'T3', from_role: '', to_role: '', start_date: '', end_date: '' });
      reload();
    } catch (e) {
      setErr(/relation|does not exist|approval_delegations/i.test(e?.message || '') ? 'Delegations table isn’t set up yet — run the SQL in DESIGN_LOG (section C).' : (e?.message || 'Could not add delegation.'));
    } finally { setBusy(false); }
  }

  const delegByTier = useMemo(() => {
    const m = {};
    delegations.forEach((d) => { if (!m[d.tier]) m[d.tier] = d; });
    return m;
  }, [delegations]);

  // Routing audit derived from live invoice statuses (sample if none).
  const audit = useMemo(() => {
    if (!invoices.length) return [
      { from: 'AP Inbox', to: 'Posted', count: 28 },
      { from: 'PM Approval', to: 'Procurement Signoff', count: 24 },
      { from: 'Blocked', to: 'Resolved → Procurement', count: 6 },
      { from: 'Pending QC', to: 'QC Approved', count: 31 },
      { from: 'Same-Day SDN flagged', to: 'Same-day approved', count: 9 },
    ];
    const by = (pred) => invoices.filter(pred).length;
    return [
      { from: 'Paid / posted', to: 'Posted', count: by((i) => i.status === 'Paid') },
      { from: 'Ready', to: 'Routed to AP', count: by((i) => i.status === 'Ready for Accounting') },
      { from: 'In AP review', to: 'Processing', count: by((i) => i.status === 'In Accounting Review') },
      { from: 'Pending docs/approval', to: 'Awaiting', count: by((i) => i.status === 'Pending Docs' || /pending/i.test(i.status)) },
      { from: 'Blocked', to: 'Exception → Procurement', count: by((i) => i.status === 'Blocked') },
    ];
  }, [invoices]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title="Approval Matrix / Delegation" subtitle="Authority thresholds, primary and backup approvers, active delegations" actions={<Btn icon={Plus} variant="primary" onClick={() => setShowAdd(true)}>Add Delegation</Btn>} />
      {/* Honesty: delegations are live records; the routing audit is only live
          when real invoice activity exists — otherwise it renders sample rows
          (see `audit` above), and this banner must say so. */}
      <div className="mx-6 mt-3 text-xs px-3 py-2 rounded border" style={{ background: COL.accentBg, color: COL.accent, borderColor: '#bfdbfe' }}>{invoices.length ? t.matrixAuditLive : t.matrixAuditSample}</div>

      <div className="flex-1 overflow-y-auto scrollbar p-6 space-y-5" style={{ background: COL.bg }}>
        <div className="rounded-2xl border overflow-x-auto" style={{ background: COL.surface, borderColor: COL.border, boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
          <div className="px-5 py-3 border-b" style={{ borderColor: COL.border }}>
            <div className="display text-base font-bold">Authority Matrix</div>
            <div className="text-xs mt-0.5" style={{ color: COL.textDim }}>Project: {project.code} · {project.contractor}</div>
          </div>
          <table className="w-full text-xs" style={{ minWidth: 720 }}>
            <thead className="mono text-[10px] uppercase tracking-wider" style={{ color: COL.textDim, background: COL.surfaceAlt }}>
              <tr style={{ borderBottom: `1px solid ${COL.borderStrong}` }}>
                {['Tier', 'Threshold', 'Invoice Types', 'Primary Approver', 'Backup Approver', 'Delegation'].map((h) => <th key={h} className="px-5 py-2 text-start border-e" style={{ borderColor: COL.border }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {APPROVAL_MATRIX.map((m) => {
                const d = delegByTier[m.tier];
                return (
                  <tr key={m.tier} className="border-b" style={{ borderColor: COL.border }}>
                    <td className="px-5 py-3"><span className="mono text-[10.5px] font-bold px-2.5 py-1 rounded-full" style={{ background: COL.accentBg, color: COL.accent }}>{m.tier}</span></td>
                    <td className="px-5 py-3 font-medium">{m.threshold}</td>
                    <td className="px-5 py-3" style={{ color: COL.textDim }}>{m.types}</td>
                    <td className="px-5 py-3">{m.primary}</td>
                    <td className="px-5 py-3" style={{ color: COL.textDim }}>{m.backup}</td>
                    <td className="px-5 py-3">{d ? <span className="mono text-[10px] px-2 py-1 rounded-full font-medium" style={{ background: '#fef3c7', color: '#b45309' }}>{d.from_role} → {d.to_role}</span> : <span className="mono text-[10px]" style={{ color: COL.textMute }}>—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border p-5" style={{ background: COL.surface, borderColor: COL.border, boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
            <div className="display text-base font-bold mb-3">Active Delegations</div>
            <div className="space-y-2">
              {delegations.length === 0 && (
                <div className="p-4 rounded border text-[12px] text-center" style={{ background: COL.bg, borderColor: COL.border, color: COL.textMute }}>No active delegations. Use “Add Delegation” to create one.</div>
              )}
              {delegations.map((d) => (
                <div key={d.id} className="p-3.5 rounded-xl border" style={{ background: '#fffbeb', borderColor: '#fcd34d' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">{d.from_role} → {d.to_role}</div>
                      <div className="text-[11px] mt-0.5" style={{ color: COL.textDim }}>Tier {d.tier} delegated{d.end_date ? ` until ${d.end_date}` : ''}</div>
                    </div>
                    <span className="mono text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: '#fef3c7', color: '#b45309' }}>{d.start_date}{d.end_date ? ` → ${String(d.end_date).slice(5)}` : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border p-5" style={{ background: COL.surface, borderColor: COL.border, boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
            <div className="display text-base font-bold mb-3">Routing Audit {invoices.length ? '(live)' : '(Last 30d · sample)'}</div>
            <div className="space-y-2 text-xs">
              {audit.map((r, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-xl border gap-2" style={{ background: COL.bg, borderColor: COL.border }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate" style={{ color: COL.textDim }}>{r.from}</span>
                    <ArrowRight size={11} className="flex-shrink-0" style={{ color: COL.textMute }} />
                    <span className="font-medium truncate">{r.to}</span>
                  </div>
                  <span className="mono text-[11px] font-bold flex-shrink-0 px-2 py-0.5 rounded-full" style={{ background: COL.accentBg, color: COL.accent }}>{r.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add delegation" subtitle="Temporarily hand approval authority to another role" width={460}
        footer={<><Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn><Btn variant="primary" icon={Check} onClick={addDelegation}>{busy ? 'Saving…' : 'Add delegation'}</Btn></>}>
        <div className="space-y-3.5">
          <div>
            <label className="block text-[12px] font-semibold mb-1.5" style={{ color: COL.text }}>Tier</label>
            <StyledSelect ariaLabel="Tier" value={form.tier} onChange={(v) => setForm((f) => ({ ...f, tier: v }))} options={TIERS.map((tt) => ({ value: tt, label: tt }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold mb-1.5" style={{ color: COL.text }}>Delegating role</label>
              <input value={form.from_role} onChange={(e) => setForm((f) => ({ ...f, from_role: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" placeholder="e.g. PD Synthetic Approver" style={{ background: COL.surface, borderColor: COL.borderStrong }} />
            </div>
            <div>
              <label className="block text-[12px] font-semibold mb-1.5" style={{ color: COL.text }}>Receiving role</label>
              <input value={form.to_role} onChange={(e) => setForm((f) => ({ ...f, to_role: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" placeholder="e.g. Snr PM" style={{ background: COL.surface, borderColor: COL.borderStrong }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold mb-1.5" style={{ color: COL.text }}>Start date</label>
              <input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ background: COL.surface, borderColor: COL.borderStrong }} />
              <div className="text-[10.5px] mt-1" style={{ color: COL.textMute }}>Leave blank to start today.</div>
            </div>
            <div>
              <label className="block text-[12px] font-semibold mb-1.5" style={{ color: COL.text }}>End date (optional)</label>
              <input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ background: COL.surface, borderColor: COL.borderStrong }} />
              <div className="text-[10.5px] mt-1" style={{ color: COL.textMute }}>Cover ends after this day.</div>
            </div>
          </div>
          {err && <div className="text-[12px] px-3 py-2 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{err}</div>}
        </div>
      </Modal>
    </div>
  );
}
