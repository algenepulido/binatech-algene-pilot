// ============================================================
// CashflowView — the certified-value S-curve. READ-ONLY presentation: it reads
// the existing IPC history (gross / retention / VAT / net payable, status, date)
// and the BoQ contract value, and plots cumulative certified value over time
// against the contract ceiling. Nothing is recomputed or written back — the
// figures are exactly those the IPC screen already stores. The forward
// projection is a clearly-labelled straight-line illustration, not a commitment.
// Bilingual EN/AR.
// ============================================================
import { useEffect, useMemo, useState, useCallback } from 'react';
import { TrendingUp, RotateCcw, Banknote, Layers, Wallet, PiggyBank } from 'lucide-react';
import { PageHeader, Btn } from '../components/primitives.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { listIpcs } from '../api/ipcs.js';
import { listBoqItems } from '../api/boqItems.js';
import { boqWaterfall } from '../lib/boqReadiness.js';
import { fmtSAR } from '../lib/format.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { COL } from '../lib/theme.js';

const T = {
  en: {
    title: 'Cashflow / S-Curve', subtitle: 'Cumulative certified value over time, against the contract ceiling',
    contract: 'Contract value', certified: 'Certified to date', complete: 'of contract certified',
    retention: 'Retention held', retentionSub: 'withheld across all IPCs', netPayable: 'Net payable to date',
    netSub: 'certified incl. VAT, net of retention', remaining: 'Remaining to certify',
    curveTitle: 'Certified value over time', legendCertified: 'Certified (gross)', legendNet: 'Net of retention',
    legendCeiling: 'Contract ceiling', legendProjection: 'Projection (illustrative)',
    projNote: 'Dashed line: a straight-line projection from the certified pace so far — illustrative only, not a forecast or commitment.',
    projReach: (n) => `At the current pace, ≈${n} more IPC${n === 1 ? '' : 's'} would reach the contract value.`,
    projNeed: 'Add at least two certified IPCs to show a projection.',
    histTitle: 'IPC history', hNo: 'IPC', hPeriod: 'Period', hDate: 'Cert date', hGross: 'Gross', hRet: 'Retention', hNet: 'Net payable', hCum: 'Cumulative', hPct: '% complete',
    emptyTitle: 'No certified IPCs yet', emptyBody: 'Once IPCs are certified, the cumulative certified value plots here against the contract ceiling.',
    loading: 'Loading cashflow…', errTitle: 'Couldn’t load cashflow', retry: 'Retry',
    readonly: 'Read-only — figures come straight from certified IPCs and the BoQ; nothing is recomputed here.',
  },
  ar: {
    title: 'التدفق النقدي / منحنى S', subtitle: 'القيمة المعتمدة التراكمية عبر الزمن مقابل سقف العقد',
    contract: 'قيمة العقد', certified: 'المعتمد حتى الآن', complete: 'من العقد معتمد',
    retention: 'المحتجزات', retentionSub: 'محتجزة عبر كل الشهادات', netPayable: 'صافي المستحق حتى الآن',
    netSub: 'معتمد شامل الضريبة بعد الاستقطاع', remaining: 'المتبقي للاعتماد',
    curveTitle: 'القيمة المعتمدة عبر الزمن', legendCertified: 'المعتمد (إجمالي)', legendNet: 'بعد الاستقطاع',
    legendCeiling: 'سقف العقد', legendProjection: 'إسقاط (توضيحي)',
    projNote: 'الخط المتقطع: إسقاط خطي من وتيرة الاعتماد حتى الآن — للتوضيح فقط، ليس توقعًا أو التزامًا.',
    projReach: (n) => `بالوتيرة الحالية، نحو ${n} شهادة إضافية للوصول إلى قيمة العقد.`,
    projNeed: 'أضف شهادتين معتمدتين على الأقل لعرض الإسقاط.',
    histTitle: 'سجل الشهادات', hNo: 'الشهادة', hPeriod: 'الفترة', hDate: 'تاريخ الاعتماد', hGross: 'الإجمالي', hRet: 'الاستقطاع', hNet: 'الصافي المستحق', hCum: 'التراكمي', hPct: '٪ الإنجاز',
    emptyTitle: 'لا توجد شهادات معتمدة بعد', emptyBody: 'بمجرد اعتماد الشهادات، تُرسم القيمة المعتمدة التراكمية هنا مقابل سقف العقد.',
    loading: 'جارٍ تحميل التدفق النقدي…', errTitle: 'تعذّر تحميل التدفق النقدي', retry: 'إعادة المحاولة',
    readonly: 'للقراءة فقط — الأرقام مأخوذة مباشرة من الشهادات المعتمدة وجدول الكميات؛ لا يُعاد احتسابها هنا.',
  },
};

const CERTIFIED = new Set(['certified', 'paid']);

export function CashflowView({ t: _t, lang = 'en' }) {
  const t = T[lang] || T.en;
  const ar = lang === 'ar';
  const [ipcs, setIpcs] = useState([]);
  const [boq, setBoq] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setIpcs([]); setBoq([]); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const [ips, items] = await Promise.all([listIpcs(), listBoqItems()]);
      setIpcs(ips || []); setBoq(items || []);
    } catch (e) { setError(e?.message ?? String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Contract ceiling = sum of real BoQ line values (qty × rate). boqWaterfall
  // with empty link/status maps yields the contract total without any cert logic.
  const contract = useMemo(() => boqWaterfall(boq, {}, {}).contract || 0, [boq]);

  // Realized curve = certified/paid IPCs in date order. cert_date drives the
  // sequence; created_at is the fallback so undated IPCs still order sensibly.
  const series = useMemo(() => {
    const certified = (ipcs || [])
      .filter((p) => CERTIFIED.has((p.status || '').toLowerCase()))
      .sort((a, b) => String(a.cert_date || a.created_at || '').localeCompare(String(b.cert_date || b.created_at || '')));
    let cumGross = 0, cumRet = 0, cumNet = 0;
    return certified.map((p) => {
      const gross = Number(p.gross_amount || 0);
      const ret = Number(p.retention || 0);
      const net = Number(p.net_payable || 0);
      cumGross += gross; cumRet += ret; cumNet += net;
      return { ipc: p, gross, ret, net, cumGross, cumRet, cumNet, cumNetOfRet: cumGross - cumRet };
    });
  }, [ipcs]);

  const last = series[series.length - 1];
  const certifiedToDate = last?.cumGross || 0;
  const retentionHeld = last?.cumRet || 0;
  const netToDate = last?.cumNet || 0;
  const pctComplete = contract > 0 ? Math.min(100, (certifiedToDate / contract) * 100) : 0;
  const remaining = Math.max(0, contract - certifiedToDate);

  // Forward projection — straight line from the average per-IPC increment. Pure
  // illustration; never written anywhere. Needs ≥2 points to have a slope.
  const projection = useMemo(() => {
    if (series.length < 2 || contract <= 0 || certifiedToDate >= contract) return null;
    const avg = certifiedToDate / series.length;
    if (avg <= 0) return null;
    const steps = Math.ceil((contract - certifiedToDate) / avg);
    const pts = [];
    let val = certifiedToDate;
    for (let i = 1; i <= steps; i++) { val = Math.min(contract, val + avg); pts.push(val); }
    return { steps, pts };
  }, [series, contract, certifiedToDate]);

  const kpis = [
    { icon: Layers, label: t.contract, value: fmtSAR(contract), color: COL.text },
    { icon: TrendingUp, label: t.certified, value: fmtSAR(certifiedToDate), color: COL.accent, pct: pctComplete },
    { icon: PiggyBank, label: t.retention, value: fmtSAR(retentionHeld), sub: t.retentionSub, color: COL.gold },
    { icon: Wallet, label: t.netPayable, value: fmtSAR(netToDate), sub: t.netSub, color: '#15803d' },
    { icon: Banknote, label: t.remaining, value: fmtSAR(remaining), color: COL.textDim },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title={t.title} subtitle={t.subtitle}
        actions={<Btn icon={RotateCcw} onClick={load}>{t.retry}</Btn>} />

      <div className="flex-1 overflow-y-auto scrollbar" dir={ar ? 'rtl' : 'ltr'}>
        {loading ? (
          <div className="flex items-center justify-center py-20 text-xs" style={{ color: COL.textMute }}>{t.loading}</div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="text-sm font-semibold" style={{ color: '#b91c1c' }}>{t.errTitle}</div>
            <div className="text-xs max-w-md text-center" style={{ color: COL.textMute }}>{error}</div>
            <Btn icon={RotateCcw} onClick={load}>{t.retry}</Btn>
          </div>
        ) : series.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={TrendingUp} title={t.emptyTitle} description={t.emptyBody} />
          </div>
        ) : (
          <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {kpis.map((k) => (
                <div key={k.label} className="rounded-xl border p-3.5" style={{ borderColor: COL.border, background: COL.surface }}>
                  <div className="flex items-center gap-1.5 mb-1.5"><k.icon size={13} style={{ color: k.color }} /><span className="text-[11px]" style={{ color: COL.textDim }}>{k.label}</span></div>
                  <div className="mono text-[17px] font-bold leading-tight" style={{ color: k.color }}>{k.value}</div>
                  {k.pct != null && (
                    <div className="mt-2">
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: COL.surfaceAlt }}>
                        <div className="h-full rounded-full" style={{ width: `${k.pct}%`, background: COL.accent, transition: 'width .5s cubic-bezier(0.16,1,0.3,1)' }} />
                      </div>
                      <div className="text-[10px] mt-1" style={{ color: COL.textMute }}>{k.pct.toFixed(1)}% {t.complete}</div>
                    </div>
                  )}
                  {k.sub && <div className="text-[10px] mt-1" style={{ color: COL.textMute }}>{k.sub}</div>}
                </div>
              ))}
            </div>

            {/* S-curve chart */}
            <div className="rounded-xl border p-4 sm:p-5" style={{ borderColor: COL.border, background: COL.surface }}>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <div className="text-[13px] font-semibold" style={{ color: COL.text }}>{t.curveTitle}</div>
                <div className="flex flex-wrap items-center gap-3 text-[10.5px]" style={{ color: COL.textDim }}>
                  <Legend swatch={<span className="inline-block w-3 h-[3px] rounded" style={{ background: COL.accent }} />} label={t.legendCertified} />
                  <Legend swatch={<span className="inline-block w-3 h-[3px] rounded" style={{ background: '#15803d' }} />} label={t.legendNet} />
                  <Legend swatch={<span className="inline-block w-3 h-0 border-t-2 border-dashed" style={{ borderColor: COL.gold }} />} label={t.legendCeiling} />
                  {projection && <Legend swatch={<span className="inline-block w-3 h-0 border-t-2 border-dashed" style={{ borderColor: COL.accent }} />} label={t.legendProjection} />}
                </div>
              </div>
              <SCurve series={series} contract={contract} projection={projection} ar={ar} />
              <div className="mt-3 text-[11px]" style={{ color: COL.textMute }}>
                {projection ? `${t.projReach(projection.steps)} ` : `${t.projNeed} `}{t.projNote}
              </div>
            </div>

            {/* IPC history table */}
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: COL.border }}>
              <div className="px-4 py-2.5 border-b text-[12px] font-semibold" style={{ borderColor: COL.border, background: COL.surfaceAlt, color: COL.text }}>{t.histTitle}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]" style={{ minWidth: 720 }}>
                  <thead>
                    <tr className="mono text-[10px] uppercase tracking-wide" style={{ color: COL.textDim, background: COL.surface }}>
                      {[t.hNo, t.hPeriod, t.hDate, t.hGross, t.hRet, t.hNet, t.hCum, t.hPct].map((h, i) => (
                        <th key={h} className={`px-3 py-2 ${i >= 3 ? 'text-end' : 'text-start'} whitespace-nowrap`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {series.map((r) => {
                      const pct = contract > 0 ? Math.min(100, (r.cumGross / contract) * 100) : 0;
                      return (
                        <tr key={r.ipc.id} className="border-t" style={{ borderColor: COL.border }}>
                          <td className="px-3 py-2 mono font-semibold" style={{ color: COL.accent }}>{r.ipc.ipc_number || '—'}</td>
                          <td className="px-3 py-2" style={{ color: COL.textDim }}>{r.ipc.period || '—'}</td>
                          <td className="px-3 py-2 mono text-[10.5px]" style={{ color: COL.textDim }}>{r.ipc.cert_date || '—'}</td>
                          <td className="px-3 py-2 mono text-end">{fmtSAR(r.gross)}</td>
                          <td className="px-3 py-2 mono text-end" style={{ color: COL.gold }}>{fmtSAR(r.ret)}</td>
                          <td className="px-3 py-2 mono text-end" style={{ color: '#15803d' }}>{fmtSAR(r.net)}</td>
                          <td className="px-3 py-2 mono text-end font-semibold">{fmtSAR(r.cumGross)}</td>
                          <td className="px-3 py-2 mono text-end" style={{ color: COL.textDim }}>{pct.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="text-[11px] flex items-center gap-1.5" style={{ color: COL.textMute }}>
              <Banknote size={12} /> {t.readonly}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const Legend = ({ swatch, label }) => (
  <span className="inline-flex items-center gap-1.5">{swatch}{label}</span>
);

// Hand-built S-curve SVG (no chart dependency). X is the IPC sequence (each
// certified IPC is one step, labelled below); Y is cumulative value 0..ceiling.
function SCurve({ series, contract, projection, ar }) {
  const W = 800, H = 320, padL = 8, padR = 8, padT = 12, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const realN = series.length;
  const totalSteps = realN - 1 + (projection ? projection.pts.length : 0);
  const maxX = Math.max(1, totalSteps);
  const yMax = Math.max(contract, series[realN - 1]?.cumGross || 0) * 1.06 || 1;

  const x = (i) => padL + (maxX === 0 ? 0 : (i / maxX) * plotW);
  const y = (v) => padT + plotH - (v / yMax) * plotH;
  // RTL: mirror the x-axis so the curve still reads left-old → right-new visually
  // matching the reading direction.
  const fx = (i) => (ar ? padL + plotW - (x(i) - padL) : x(i));

  const grossPts = series.map((r, i) => [fx(i), y(r.cumGross)]);
  const netPts = series.map((r, i) => [fx(i), y(r.cumNetOfRet)]);
  const line = (pts) => pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const area = (pts) => `${line(pts)} L${pts[pts.length - 1][0].toFixed(1)},${y(0).toFixed(1)} L${pts[0][0].toFixed(1)},${y(0).toFixed(1)} Z`;

  const projPts = projection ? projection.pts.map((v, k) => [fx(realN - 1 + 1 + k), y(v)]) : [];
  const projLine = projection ? line([[fx(realN - 1), y(series[realN - 1].cumGross)], ...projPts]) : '';

  const ceilingY = y(contract);
  const gridYs = [0.25, 0.5, 0.75, 1].map((f) => padT + plotH - f * plotH);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ maxHeight: 340 }} role="img" aria-label="Cumulative certified value S-curve">
      <defs>
        <linearGradient id="cfArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={COL.accent} stopOpacity="0.18" />
          <stop offset="100%" stopColor={COL.accent} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {/* horizontal gridlines */}
      {gridYs.map((gy, i) => <line key={i} x1={padL} y1={gy} x2={W - padR} y2={gy} stroke={COL.border} strokeWidth="1" />)}
      {/* contract ceiling */}
      <line x1={padL} y1={ceilingY} x2={W - padR} y2={ceilingY} stroke={COL.gold} strokeWidth="1.5" strokeDasharray="6 4" />
      {/* gross area + line */}
      {grossPts.length > 1 && <path d={area(grossPts)} fill="url(#cfArea)" />}
      {netPts.length > 1 && <path d={line(netPts)} fill="none" stroke="#15803d" strokeWidth="1.6" strokeOpacity="0.85" />}
      {grossPts.length > 1 && <path d={line(grossPts)} fill="none" stroke={COL.accent} strokeWidth="2.4" />}
      {/* projection */}
      {projLine && <path d={projLine} fill="none" stroke={COL.accent} strokeWidth="2" strokeDasharray="5 5" strokeOpacity="0.6" />}
      {/* Single certified IPC: make the lone data point legible — a dashed drop
          line to the baseline, a larger node and its value — so the chart isn't
          near-empty. (The "add a second IPC to see a projection" guidance stays
          below the chart, unchanged.) */}
      {grossPts.length === 1 && (() => { const [px, py] = grossPts[0]; return (
        <g>
          <line x1={px} y1={py} x2={px} y2={y(0)} stroke={COL.accent} strokeWidth="1.5" strokeDasharray="3 3" strokeOpacity="0.5" />
          <circle cx={px} cy={py} r="6" fill="#fff" stroke={COL.accent} strokeWidth="3" />
          <text x={px} y={py - 12} textAnchor="middle" fontSize="11" fontWeight="700" fill={COL.accent} className="mono">{fmtSAR(series[0].cumGross)}</text>
        </g>
      ); })()}
      {/* points (multi-point series) */}
      {grossPts.length > 1 && grossPts.map(([px, py], i) => <circle key={i} cx={px} cy={py} r="3.5" fill="#fff" stroke={COL.accent} strokeWidth="2" />)}
      {/* x labels: IPC numbers */}
      {series.map((r, i) => (
        <text key={i} x={fx(i)} y={H - 9} textAnchor="middle" fontSize="9" fill={COL.textMute} className="mono">{r.ipc.ipc_number || `#${i + 1}`}</text>
      ))}
    </svg>
  );
}
