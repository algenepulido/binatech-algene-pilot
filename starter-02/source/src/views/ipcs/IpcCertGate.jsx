import { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, AlertOctagon, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Modal } from '../../components/Modal.jsx';
import { Btn } from '../../components/primitives.jsx';
import { listBoqItems } from '../../api/boqItems.js';
import { listAllLinks } from '../../api/elementBoqLinks.js';
import { loadElementStatusMap } from '../../lib/elementStatus.js';
import { buildLinksByBoq, lineReadiness, boqWaterfall } from '../../lib/boqReadiness.js';
import { evaluateIpcGate, GATE_COPY } from '../../lib/ipcGate.js';
import { usePermissions } from '../../lib/usePermissions.jsx';
import { fmtMoney } from '../../lib/format.js';
import { COL } from '../../lib/theme.js';

// ============================================================
// IpcCertGate — the evidence-based IPC Certification Gate. READ-ONLY: it reads
// the BoQ readiness the IPC view already derives, runs the prerequisite checks,
// and DISABLES the final Certify action until all hard blockers clear + a human
// confirmation. It NEVER certifies or changes money — on confirm it invokes the
// caller's onCertify (the unchanged certify mutation). AI is not involved.
// ============================================================
const CHIP = {
  pass: { bg: '#dcfce7', fg: '#15803d', Icon: CheckCircle2 },
  warn: { bg: '#fef9c3', fg: '#a16207', Icon: AlertOctagon },
  block: { bg: '#fee2e2', fg: '#b91c1c', Icon: XCircle },
  na: { bg: '#f5f5f4', fg: '#57534e', Icon: Clock },
};

function Chip({ status, label }) {
  const c = CHIP[status] || CHIP.na; const I = c.Icon;
  return (
    <span className="mono text-[10px] px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1 whitespace-nowrap" style={{ background: c.bg, color: c.fg }}>
      <I size={11} /> {label}
    </span>
  );
}

function Metric({ label, value, fg }) {
  return (
    <div className="rounded-lg border px-2.5 py-2" style={{ borderColor: COL.border, background: COL.bg }}>
      <div className="text-[9.5px] uppercase tracking-wide" style={{ color: COL.textMute }}>{label}</div>
      <div className="mono text-[13px] font-bold mt-0.5" style={{ color: fg }}>{value}</div>
    </div>
  );
}

export function IpcCertGate({ open, ipc, onClose, onCertify, lang = 'en' }) {
  const L = GATE_COPY[lang] || GATE_COPY.en;
  const { canApprove } = usePermissions();
  const canCertify = canApprove('ipc.certify');
  const [boqItems, setBoqItems] = useState([]);
  const [links, setLinks] = useState([]);
  const [statusMap, setStatusMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    setConfirmed(false); setLoading(true);
    let active = true;
    Promise.all([listBoqItems().catch(() => []), listAllLinks().catch(() => []), loadElementStatusMap().catch(() => ({}))])
      .then(([b, l, s]) => { if (active) { setBoqItems(b); setLinks(l); setStatusMap(s); setLoading(false); } });
    return () => { active = false; };
  }, [open, ipc?.id]);

  const linksByBoq = useMemo(() => buildLinksByBoq(links, boqItems), [links, boqItems]);
  const composition = useMemo(() => {
    const certifiable = [], blocked = [];
    for (const b of boqItems) { const r = lineReadiness(b, linksByBoq, statusMap); if (r.approvedValue > 0.5) certifiable.push({ b, r }); if (r.blockedValue > 0.5) blocked.push({ b, r }); }
    return { certifiable, blocked };
  }, [boqItems, linksByBoq, statusMap]);
  const waterfall = useMemo(() => boqWaterfall(boqItems, linksByBoq, statusMap), [boqItems, linksByBoq, statusMap]);

  const gate = useMemo(() => evaluateIpcGate({
    ipc: ipc || {}, certifiableValue: waterfall.proven, provenValue: waterfall.proven,
    blockedValue: waterfall.blocked, mappedValue: waterfall.mapped,
    provenCount: composition.certifiable.length, blockedCount: composition.blocked.length, canCertify,
  }), [ipc, waterfall, composition, canCertify]);

  if (!ipc) return null;
  const blockers = gate.hardBlockers.length;
  const ready = blockers === 0 && confirmed;
  const tip = blockers > 0 ? L.blockedTip(blockers) : !canCertify ? L.permTip : !confirmed ? L.confirmTip : '';

  return (
    <Modal open={open} onClose={onClose} title={L.title} subtitle={L.subtitle} width={640}
      footer={(
        <>
          <Btn variant="secondary" onClick={onClose}>{L.cancel}</Btn>
          <span title={tip}><Btn variant="primary" icon={ShieldCheck} disabled={!ready} onClick={() => onCertify?.()}>{blockers > 0 ? L.review : L.certify}</Btn></span>
        </>
      )}>
      <div dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        {loading ? <div className="text-center text-xs py-8" style={{ color: COL.textMute }}>…</div> : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <Metric label={L.certifiableLabel} value={fmtMoney(gate.metrics.certifiableValue)} fg="#15803d" />
              <Metric label={L.blockedLinesLabel} value={String(gate.metrics.blockedCount)} fg={gate.metrics.blockedCount > 0 ? '#b91c1c' : COL.text} />
              <Metric label={L.valueAtRiskLabel} value={fmtMoney(gate.metrics.blockedValue)} fg={gate.metrics.blockedValue > 0 ? '#b91c1c' : COL.text} />
            </div>

            <div className="space-y-2">
              {gate.sections.map((s) => (
                <div key={s.id} className="rounded-lg border" style={{ borderColor: COL.border }}>
                  <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: COL.border, background: COL.surfaceAlt }}>
                    <span className="text-[12px] font-semibold" style={{ color: COL.text }}>{L.section[s.id]}</span>
                    <Chip status={s.status} label={L.statusLabel[s.status]} />
                  </div>
                  <div className="px-3 py-1.5 divide-y" style={{ borderColor: COL.border }}>
                    {s.items.map((it) => (
                      <div key={it.key} className="flex items-start justify-between gap-3 py-1.5">
                        <div className="min-w-0">
                          <div className="text-[12px]" style={{ color: COL.text }}>{L.item[it.key]}</div>
                          {it.status === 'na' && L.pendingHint[it.key] && (
                            <div className="text-[10.5px] mt-0.5" style={{ color: COL.textMute }}>{L.pendingHint[it.key]}</div>
                          )}
                        </div>
                        <Chip status={it.status} label={L.statusLabel[it.status]} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-[10.5px] mt-2" style={{ color: COL.textMute }}>{L.pendingNote}</div>

            <label className="flex items-start gap-2 mt-3 p-3 rounded-lg border cursor-pointer" style={{ borderColor: confirmed ? '#86efac' : COL.border, background: confirmed ? '#f0fdf4' : COL.bg }}>
              <input type="checkbox" checked={confirmed} disabled={blockers > 0 || !canCertify} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
              <span className="text-[11.5px] leading-relaxed" style={{ color: COL.text }}>{L.confirm}</span>
            </label>
          </>
        )}
      </div>
    </Modal>
  );
}
