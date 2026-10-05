// ============================================================
// GuideView — the operating manual of the certification system. One coherent
// read: the rule → one canonical pipeline (BoQ → payment, with a worked example
// inline) → the gates that must hold → who does what. Native React/SVG only;
// bilingual EN/AR + RTL. Content lives in src/lib/guideTourContent.js so EN↔AR
// parity is test-enforced. Thesis: "Nothing is certified until the work is proven."
// ============================================================
import {
  FileSpreadsheet, Grid3x3, ClipboardCheck, FolderCheck, AlertOctagon, Radar, Receipt,
  FileText, Banknote, HardHat, ShieldCheck, Briefcase, Eye, Settings,
  ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, XCircle, Ban,
} from 'lucide-react';
import { PageHeader, Btn } from '../components/primitives.jsx';
import { COL } from '../lib/theme.js';
import { GUIDE_RULE } from '../lib/guideSteps.js';
import {
  TOUR_HEADER, TOUR_CHIPS, TOUR_PIPELINE,
  TOUR_GATES, TOUR_ROLES, TOUR_DONT, TOUR_ACTIONS,
} from '../lib/guideTourContent.js';

const ICON = {
  boq: FileSpreadsheet, workitem: Grid3x3, wir: ClipboardCheck, evidence: FolderCheck,
  ncr: AlertOctagon, queue: Radar, ipc: Receipt, invoice: FileText, payment: Banknote,
  site: HardHat, qaqc: ShieldCheck, qs: FileSpreadsheet, pm: Briefcase, client: Eye, admin: Settings,
};

// Restrained state semantics — green(certified) / amber(review) / red(blocked) / steel(idle).
const STATE = {
  ready:   { c: '#1C6B52', bg: '#e6f0eb', dot: '#1C6B52' },
  pass:    { c: '#1C6B52', bg: '#e6f0eb', dot: '#1C6B52' },
  review:  { c: '#b45309', bg: '#fef3c7', dot: '#b45309' },
  warning: { c: '#b45309', bg: '#fef3c7', dot: '#b45309' },
  blocked: { c: '#B3261E', bg: '#fee2e2', dot: '#B3261E' },
  idle:    { c: '#7C8C89', bg: '#eff2f0', dot: '#a1a1a6' },
};

const RED = '#B3261E';
const RED_INK = '#8a1f18';

const TR = {
  en: {
    theRule: 'The rule', certRule: 'What makes a quantity certifiable', sampleState: 'Sample project state — illustrative',
    pipeline: 'The certification pipeline', pipelineSub: 'One BoQ line, proven end to end', risk: 'Risk if skipped', open: 'Open',
    gates: 'Certification gates', gatesSub: 'Every gate must hold before a line is certifiable',
    dont: 'Do not certify if', pass: 'Pass', warn: 'Warning', block: 'Blocked',
    roles: 'What each role does', enters: 'Enters', approvesL: 'Approves', cannot: 'Control boundary',
    noRoute: 'not available',
  },
  ar: {
    theRule: 'القاعدة', certRule: 'ما الذي يجعل الكمية قابلة للاعتماد', sampleState: 'حالة مشروع تجريبية — توضيحية',
    pipeline: 'خط سير الاعتماد', pipelineSub: 'بند كميات واحد، مُثبت من البداية للنهاية', risk: 'الخطر عند التخطّي', open: 'افتح',
    gates: 'بوابات الاعتماد', gatesSub: 'يجب أن تتوافق كل بوابة قبل أن يصبح البند قابلاً للاعتماد',
    dont: 'لا تعتمد إذا', pass: 'مطابق', warn: 'تحذير', block: 'موقوف',
    roles: 'ماذا يفعل كل دور', enters: 'يُدخل', approvesL: 'يعتمد', cannot: 'حدّ التحكم',
    noRoute: 'غير متاح',
  },
};

function Kicker({ children }) {
  return <div className="mono text-[9.5px] tracking-widest uppercase" style={{ color: COL.textMute }}>{children}</div>;
}
function Card({ children, className = '', style }) {
  return <div className={`rounded-xl border ${className}`} style={{ background: COL.surface, borderColor: COL.border, boxShadow: '0 1px 2px rgba(16,24,40,0.04)', ...style }}>{children}</div>;
}

export function GuideView({ lang = 'en', onNavigate }) {
  const ar = lang === 'ar';
  const L = TR[lang] || TR.en;
  const g = (o) => (o ? o[lang] : '');
  const Flow = ar ? ArrowLeft : ArrowRight;
  const rule = GUIDE_RULE[lang];

  return (
    <div className="flex-1 flex flex-col overflow-hidden" dir={ar ? 'rtl' : 'ltr'}>
      <PageHeader title={g(TOUR_HEADER.title)} subtitle={g(TOUR_HEADER.subtitle)} />

      <div className="flex-1 overflow-y-auto scrollbar" style={{ background: COL.bg }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-6">

          {/* 1 · The rule — mechanic + thesis, with the sample state + quick jumps */}
          <div className="grid lg:grid-cols-[1fr_20rem] gap-4 items-stretch">
            <Card className="p-4 flex flex-col">
              <Kicker>{L.certRule}</Kicker>
              <p className="text-[13.5px] leading-relaxed mt-1.5" style={{ color: COL.text }}>{g(TOUR_HEADER.rule)}</p>
              <div className="mt-3 pt-3 border-t" style={{ borderColor: COL.border }}>
                <Kicker>{L.sampleState}</Kicker>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {TOUR_CHIPS.map((c) => {
                    const s = STATE[c.state];
                    return (
                      <span key={c.key} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border" style={{ background: s.bg, borderColor: s.c + '33', color: s.c }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />{g(c.label)}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-auto pt-3.5">
                {TOUR_ACTIONS.map((a) => {
                  const Ic = ICON[a.icon];
                  return a.route
                    ? <Btn key={a.label.en} variant="secondary" icon={Ic} onClick={() => onNavigate?.(a.route)}>{g(a.label)}</Btn>
                    : <Btn key={a.label.en} variant="secondary" icon={Ic} disabled>{g(a.label)} · {L.noRoute}</Btn>;
                })}
              </div>
            </Card>
            {/* Thesis — the product truth, given weight */}
            <Card className="p-4 flex flex-col justify-center" style={{ background: COL.brandInk, borderColor: COL.brandInk }}>
              <div className="mono text-[9.5px] tracking-widest uppercase mb-1.5" style={{ color: 'rgba(250,250,247,0.5)' }}>{L.theRule}</div>
              <p className="display text-[17px] font-bold leading-snug" style={{ color: '#FAFAF7' }}>{g(TOUR_HEADER.thesis)}</p>
              <p className="text-[11.5px] leading-relaxed mt-2" style={{ color: 'rgba(250,250,247,0.66)' }}>{rule.body}</p>
            </Card>
          </div>

          {/* 2 · The pipeline — ONE canonical spine (does + risk + worked example inline) */}
          <div>
            <div className="flex items-baseline justify-between mb-2 gap-3 flex-wrap">
              <Kicker>{L.pipeline}</Kicker>
              <span className="text-[11px]" style={{ color: COL.textMute }}>{L.pipelineSub}</span>
            </div>
            <Card className="overflow-hidden">
              {TOUR_PIPELINE.map((s, i) => {
                const Ic = ICON[s.icon]; const st = STATE[s.state];
                const last = i === TOUR_PIPELINE.length - 1;
                return (
                  <div key={s.num} className="flex gap-3 sm:gap-4 px-3 sm:px-4 py-3" style={{ borderTop: i ? `1px solid ${COL.border}` : 'none' }}>
                    {/* left rail — number, icon, connecting spine */}
                    <div className="flex flex-col items-center flex-shrink-0" style={{ width: 32 }}>
                      <span className="mono text-[9px] font-bold mb-1" style={{ color: COL.textMute }}>{s.num}</span>
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: st.bg }}><Ic size={15} style={{ color: st.c }} /></span>
                      {!last && <span className="flex-1 w-px mt-1" style={{ background: COL.border, minHeight: 10 }} />}
                    </div>
                    {/* body */}
                    <div className="flex-1 min-w-0 pb-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        {s.route ? (
                          <button onClick={() => onNavigate?.(s.route)} className="group inline-flex items-center gap-1 text-[13.5px] font-bold hover:underline" style={{ color: COL.text }}>
                            {g(s.name)}<Flow size={12} className="opacity-40 group-hover:opacity-100 transition" style={{ color: COL.accent }} />
                          </button>
                        ) : (
                          <span className="text-[13.5px] font-bold" style={{ color: COL.text }}>{g(s.name)}</span>
                        )}
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: st.dot }} />
                        <span className="ms-auto mono text-[10.5px] px-1.5 py-0.5 rounded border flex-shrink-0" style={{ background: st.bg, borderColor: st.c + '2e', color: st.c }}>{g(s.example)}</span>
                      </div>
                      <p className="text-[12px] leading-relaxed mt-1" style={{ color: COL.textDim }}>{g(s.does)}</p>
                      <div className="flex items-center justify-between gap-2 flex-wrap mt-1.5">
                        <span className="inline-flex items-center gap-1.5 text-[10.5px]" style={{ color: RED_INK }}>
                          <AlertTriangle size={11} className="flex-shrink-0" style={{ color: RED }} />
                          <span><span className="mono uppercase tracking-wide me-1 text-[8px]" style={{ color: RED }}>{L.risk}</span>{g(s.risk)}</span>
                        </span>
                        <span className="mono text-[9.5px] px-1.5 py-0.5 rounded border" style={{ background: COL.bg, borderColor: COL.border, color: COL.textMute }}>{g(s.module)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </Card>
          </div>

          {/* 3 · Gates (what must hold) + the inverse (do not certify if) */}
          <div className="grid lg:grid-cols-[1fr_18rem] gap-4 items-start">
            <Card className="p-4">
              <Kicker>{L.gates}</Kicker>
              <div className="text-[11px] mb-3 mt-0.5" style={{ color: COL.textMute }}>{L.gatesSub}</div>
              <div className="space-y-1.5">
                {TOUR_GATES.map((gate, i) => {
                  const s = STATE[gate.state];
                  const GateIc = gate.state === 'pass' ? CheckCircle2 : gate.state === 'warning' ? AlertTriangle : XCircle;
                  const stateLabel = gate.state === 'pass' ? L.pass : gate.state === 'warning' ? L.warn : L.block;
                  return (
                    <div key={i} className="flex items-center gap-2.5 rounded-lg border px-2.5 py-2" style={{ borderColor: COL.border, background: COL.bg }}>
                      <GateIc size={15} className="flex-shrink-0" style={{ color: s.c }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold" style={{ color: COL.text }}>{g(gate.gate)}</div>
                        <div className="text-[10.5px]" style={{ color: COL.textMute }}>{g(gate.reason)} · <span className="mono">{gate.module}</span></div>
                      </div>
                      <span className="mono text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase flex-shrink-0" style={{ background: s.bg, color: s.c }}>{stateLabel}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 pt-3 border-t text-[11px] flex items-center gap-1.5" style={{ borderColor: COL.border, color: COL.textMute }}>
                <ShieldCheck size={12} style={{ color: '#1C6B52' }} />{g(TOUR_HEADER.boundaryNote)}
              </div>
            </Card>
            {/* Do not certify if — the inverse, kept tight */}
            <Card className="p-4" style={{ borderColor: '#fecaca', background: '#fef7f6' }}>
              <div className="flex items-center gap-2 mb-2.5">
                <Ban size={15} style={{ color: RED }} />
                <span className="display text-[13.5px] font-bold" style={{ color: RED_INK }}>{L.dont}…</span>
              </div>
              <div className="space-y-1.5">
                {TOUR_DONT.map((d, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11.5px]" style={{ color: '#7a1a14' }}>
                    <XCircle size={12} className="flex-shrink-0 mt-0.5" style={{ color: RED }} />{g(d)}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* 4 · Roles */}
          <div>
            <Kicker>{L.roles}</Kicker>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-2">
              {TOUR_ROLES.map((r) => {
                const Ic = ICON[r.icon];
                return (
                  <Card key={r.role.en} className="p-3.5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: COL.surfaceAlt }}><Ic size={14} style={{ color: COL.text }} /></span>
                      <span className="text-[13px] font-bold" style={{ color: COL.text }}>{g(r.role)}</span>
                    </div>
                    <div className="space-y-1.5">
                      {[[L.enters, r.enters, COL.textDim], [L.approvesL, r.approves, '#1C6B52'], [L.cannot, r.cannot, RED_INK]].map(([lab, val, c], k) => (
                        <div key={k} className="flex gap-2">
                          <span className="mono text-[8px] tracking-widest uppercase pt-0.5 w-16 flex-shrink-0" style={{ color: COL.textMute }}>{lab}</span>
                          <span className="text-[11px] leading-tight" style={{ color: c }}>{g(val)}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
