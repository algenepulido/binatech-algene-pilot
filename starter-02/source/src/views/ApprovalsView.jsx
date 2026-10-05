import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from '../components/Toast.jsx';
import { AlertOctagon, CheckCircle2, ClipboardCheck, FileImage, Receipt, XCircle } from 'lucide-react';
import { Btn, PageHeader, StatusPill } from '../components/primitives.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { confirmDialog } from '../components/ConfirmDialog.jsx';
import { SAFETY_COPY } from '../lib/actionSafety.js';
import { supabase } from '../lib/supabase.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { recertifyAll } from '../lib/recertify.js';
import { notifyDataChanged, getCurrentProjectId } from '../lib/currentProject.js';
import { approveWithAudit, actingOnBehalfOf, approvalAge } from '../lib/approvalAudit.js';
import { getProjectSettings } from '../api/projectSettings.js';
import { useAuth } from '../lib/auth.jsx';
import { fmt, fmtMoney } from '../lib/format.js';
import { ncrSeverityLabel } from '../lib/ncrStatus.js';
import { COL } from '../lib/theme.js';
import { IpcCertGate } from './ipcs/IpcCertGate.jsx';
import { listBoqItems, isBoqLineItem } from '../api/boqItems.js';
import { listAllLinks } from '../api/elementBoqLinks.js';
import { loadElementStatusMap } from '../lib/elementStatus.js';
import { buildLinksByBoq, boqWaterfall, lineReadiness } from '../lib/boqReadiness.js';

// ============================================================
// APPROVALS VIEW — live action queue for the consultant.
// Approve/Reject genuinely update the record's status.
// ============================================================
export function ApprovalsView({ t, lang = 'en' }) {
  const { requireAuth } = useAuth();
  const [tab, setTab] = useState('wirs');
  const [data, setData] = useState({ wirs: [], ncrs: [], drawings: [], ipcs: [] });
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState(3);      // escalation: business days before flag
  const [onBehalfOf, setOnBehalfOf] = useState(null); // delegator id if I'm covering someone
  const [gateIpc, setGateIpc] = useState(null);       // IPC whose certification gate is open
  // Project BoQ readiness backing IPC certification (read-only summary for the card).
  const [ipcRead, setIpcRead] = useState({ certifiable: 0, blockedValue: 0, blockedCount: 0 });

  // Oldest-first so the longest-waiting (and escalated) items surface at the top.
  const byAge = (a, b) => new Date(a.queued_at || a.created_at || 0) - new Date(b.queued_at || b.created_at || 0);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    // Scope every queue to the OPEN project. This was hardcoded to the sample
    // project id once, which made the queue read empty ("all caught up")
    // while the sidebar badge counted the real project's pending work.
    const PID = getCurrentProjectId();
    const [wirs, ncrs, drawings, ipcs, settings, obo, boqItems, allLinks, smap] = await Promise.all([
      supabase.from('wirs').select('*').eq('project_id', PID).in('result', ['pending', 'in_progress']).order('created_at', { ascending: false }),
      supabase.from('ncrs').select('*').eq('project_id', PID).eq('status', 'open').order('created_at', { ascending: false }),
      supabase.from('drawings').select('*').eq('project_id', PID).eq('status', 'Under Review').order('created_at', { ascending: false }),
      supabase.from('ipcs').select('*').eq('project_id', PID).in('status', ['draft', 'submitted']).order('created_at', { ascending: false }),
      getProjectSettings().catch(() => null),
      actingOnBehalfOf(PID).catch(() => null),
      listBoqItems().catch(() => []),
      listAllLinks().catch(() => []),
      loadElementStatusMap().catch(() => ({})),
    ]);
    setThreshold(Number(settings?.escalation_days_threshold) || 3);
    setOnBehalfOf(obo);
    setData({
      wirs: (wirs.data || []).sort(byAge), ncrs: (ncrs.data || []).sort(byAge),
      drawings: (drawings.data || []).sort(byAge), ipcs: (ipcs.data || []).sort(byAge),
    });
    // Read-only BoQ readiness backing IPC certification (same lineReadiness QS uses).
    const liByBoq = buildLinksByBoq(allLinks, boqItems);
    const wf = boqWaterfall(boqItems, liByBoq, smap);
    let bc = 0;
    for (const b of boqItems) { if (!isBoqLineItem(b)) continue; if (lineReadiness(b, liByBoq, smap).blockedValue > 0.5) bc++; }
    setIpcRead({ certifiable: wf.certifiable, blockedValue: wf.blocked, blockedCount: bc });
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Reject returns the item to its submitter and is not casually reversible —
  // confirm first (Certify already routes through IpcCertGate; Reject didn't).
  function confirmReject(table, id, patch, label) {
    requireAuth(async () => {
      const ok = await confirmDialog({
        title: `Reject ${label}?`,
        message: `This returns the item to its submitter for rework.\n\n${SAFETY_COPY.certPaymentGated}`,
        confirmLabel: 'Reject', danger: true,
      });
      if (ok) act(table, id, patch);
    });
  }

  const acting = useRef(new Set()); // guard against double-click duplicate updates
  function act(table, id, patch) {
    requireAuth(async () => {
      const k = `${table}:${id}`;
      if (acting.current.has(k)) return;
      acting.current.add(k);
      try {
        // Records who/when/on-behalf-of additively; strips + retries if the
        // audit columns aren't migrated, so the transition always goes through.
        await approveWithAudit(table, id, patch, { onBehalfOf });
        // Approving/closing a WIR or NCR from the queue must flow into
        // certification (same as saving the form does), else approved_qty/IPC
        // wouldn't update. Drawings/IPCs don't affect certification.
        if (table === 'wirs' || table === 'ncrs') { await recertifyAll(); notifyDataChanged(); }
        load();
      } catch (e) { toast.error(e.message); }
      finally { acting.current.delete(k); }
    });
  }

  const tabs = [
    { id: 'wirs', label: 'WIRs', count: data.wirs.length, icon: ClipboardCheck },
    { id: 'ncrs', label: 'NCRs', count: data.ncrs.length, icon: AlertOctagon },
    { id: 'drawings', label: 'Drawings', count: data.drawings.length, icon: FileImage },
    { id: 'ipcs', label: 'IPCs', count: data.ipcs.length, icon: Receipt },
  ];

  const current = data[tab] || [];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title={t.approvals} subtitle="Live action queue — Approve/Reject updates the record" />
      <div className="flex border-b overflow-x-auto" style={{ borderColor: COL.border, background: COL.surface }}>
        {tabs.map((tb) => {
          const Icon = tb.icon; const active = tab === tb.id;
          return (
            <button key={tb.id} onClick={() => setTab(tb.id)} className="px-5 py-3 text-sm font-medium flex items-center gap-2 whitespace-nowrap" style={{ color: active ? COL.accent : COL.textDim, borderBottom: active ? `2px solid ${COL.accent}` : '2px solid transparent', background: active ? COL.bg : 'transparent' }}>
              <Icon size={14} /> {tb.label}
              {tb.count > 0 && <span className="mono text-[10px] px-1.5 rounded font-bold text-white" style={{ background: COL.accent }}>{tb.count}</span>}
            </button>
          );
        })}
      </div>
      {(onBehalfOf || (data[tab] || []).some((r) => approvalAge(r, threshold).escalated)) && (
        <div className="px-6 py-2 border-b flex flex-wrap items-center gap-3 text-[11px]" style={{ borderColor: COL.border, background: COL.bg }}>
          {onBehalfOf && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-medium" style={{ background: COL.accentBg, color: COL.accent }}>
              Delegate mode — your approvals here are recorded on behalf of the delegating approver
            </span>
          )}
          {(() => { const esc = (data[tab] || []).filter((r) => approvalAge(r, threshold).escalated).length; return esc > 0 ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-semibold" style={{ background: '#fef2f2', color: '#b91c1c' }}>{esc} escalated — waiting &gt; {threshold} day{threshold === 1 ? '' : 's'}</span>
          ) : null; })()}
          <span style={{ color: COL.textMute }}>Oldest first</span>
        </div>
      )}
      <div className="flex-1 overflow-y-auto scrollbar p-6 space-y-2">
        {loading ? <div className="text-center text-xs py-10" style={{ color: COL.textMute }}>Loading…</div>
          : current.length === 0 ? <EmptyState mode="all-clear" icon={CheckCircle2} title="You're all caught up"
              description="Nothing in this queue is awaiting action right now."
              note="Items appear here automatically when work elsewhere needs sign-off — approving them updates their source records." />
          : (
            <>
              {tab === 'wirs' && current.map((w) => (
                <ApprovalCard key={w.id} age={approvalAge(w, threshold)} id={w.wir_number} title={w.inspection_type || 'Inspection'} desc={`${w.element_guid || '—'} · ${w.drawing_ref || ''}`} meta={`${w.inspector_name || ''} · ${w.inspection_date || ''}`}
                  onApprove={() => act('wirs', w.id, { result: 'approved' })} onReject={() => confirmReject('wirs', w.id, { result: 'rejected' }, w.wir_number)} />
              ))}
              {tab === 'ncrs' && current.map((n) => (
                <ApprovalCard key={n.id} age={approvalAge(n, threshold)} id={n.ncr_number} title={`${ncrSeverityLabel(n.severity)} NCR`} desc={(n.description || '').slice(0, 90)} meta={`${n.raised_by || ''} · ${n.ncr_date || ''}`} severity={ncrSeverityLabel(n.severity)}
                  approveLabel="Close" onApprove={() => act('ncrs', n.id, { status: 'closed' })} />
              ))}
              {tab === 'drawings' && current.map((d) => (
                <ApprovalCard key={d.id} age={approvalAge(d, threshold)} id={`${d.drawing_number} REV ${d.rev || ''}`} title={d.title || ''} desc={`${d.discipline || ''} · ${d.size_text || ''}`} meta={`${d.submitted_by || ''} · ${d.drawing_date || ''}`}
                  onApprove={() => act('drawings', d.id, { status: 'Approved' })} onReject={() => confirmReject('drawings', d.id, { status: 'Rejected' }, `${d.drawing_number} REV ${d.rev || ''}`)} />
              ))}
              {tab === 'ipcs' && current.map((i) => (
                <ApprovalCard key={i.id} age={approvalAge(i, threshold)} id={i.ipc_number} title={`IPC · ${i.period || ''}`} desc={`Net SAR ${fmt(i.net_payable)}`} meta={`Gross SAR ${fmt(i.gross_amount)}`}
                  approveLabel={ipcRead.blockedCount > 0 ? (lang === 'ar' ? 'مراجعة بوابة الاعتماد' : 'Review Gate') : (lang === 'ar' ? 'اعتماد' : 'Certify')}
                  extra={<IpcReadiness r={ipcRead} lang={lang} />}
                  onApprove={() => setGateIpc(i)} onReject={() => confirmReject('ipcs', i.id, { status: 'rejected' }, i.ipc_number)} />
              ))}
            </>
          )}
      </div>

      {/* Certification gate — wraps the UNCHANGED certify mutation. On confirm it
          calls the same act('ipcs', id, { status:'certified' }) as before. */}
      <IpcCertGate open={!!gateIpc} ipc={gateIpc} lang={lang} onClose={() => setGateIpc(null)}
        onCertify={() => { const i = gateIpc; setGateIpc(null); if (i) act('ipcs', i.id, { status: 'certified' }); }} />
    </div>
  );
}

// Read-only commercial-readiness summary shown on each IPC approval card.
function IpcReadiness({ r, lang }) {
  const ar = lang === 'ar';
  return (
    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] mono">
      <span className="px-1.5 py-0.5 rounded" style={{ background: '#dcfce7', color: '#15803d' }}>{ar ? 'قابلة للاعتماد' : 'certifiable'} {fmtMoney(r.certifiable)}</span>
      {r.blockedCount > 0
        ? <span className="px-1.5 py-0.5 rounded" style={{ background: '#fee2e2', color: '#b91c1c' }}>{r.blockedCount} {ar ? 'موقوف · ' : 'blocked · '}{fmtMoney(r.blockedValue)} {ar ? 'معرّض للخطر' : 'at risk'}</span>
        : <span className="px-1.5 py-0.5 rounded" style={{ background: '#f5f5f4', color: '#57534e' }}>{ar ? 'لا عوائق' : 'no blockers'}</span>}
    </div>
  );
}

export function ApprovalCard({ id, title, desc, meta, severity, age, onApprove, onReject, approveLabel = 'Approve', extra }) {
  return (
    <div className="rounded-lg border p-4 flex items-start gap-4 hover:bg-stone-50" style={{ background: COL.surface, borderColor: age?.escalated ? '#fecaca' : COL.border }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <div className="mono text-[11px] font-semibold" style={{ color: COL.accent }}>{id}</div>
          {severity && <StatusPill status={severity} />}
          {age && (age.escalated
            ? <span className="mono text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: '#fef2f2', color: '#b91c1c' }}>ESCALATED · {age.days}d</span>
            : age.days > 0 ? <span className="mono text-[9px] px-1.5 py-0.5 rounded" style={{ background: COL.surfaceAlt, color: COL.textDim }}>{age.days}d waiting</span> : null)}
        </div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs mt-0.5" style={{ color: COL.textDim }}>{desc}</div>
        <div className="mono text-[10px] mt-1.5" style={{ color: COL.textMute }}>{meta}</div>
        {extra}
      </div>
      <div className="flex flex-col gap-1.5 flex-shrink-0">
        {onApprove && <Btn variant="primary" icon={CheckCircle2} onClick={onApprove}>{approveLabel}</Btn>}
        {onReject && <Btn variant="secondary" icon={XCircle} onClick={onReject}>Reject</Btn>}
      </div>
    </div>
  );
}
