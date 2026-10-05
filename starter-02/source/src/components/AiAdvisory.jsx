import { Sparkles, ShieldAlert, ShieldCheck, Info } from 'lucide-react';
import { AI_ADVISORY_COPY } from '../lib/commercialStatus.js';
import { COL } from '../lib/theme.js';

// ============================================================
// AiAdvisory — the AI-advisory boundary affordance. Wrap any AI suggestion so
// it is visibly labeled as advice a human must approve. Enforces the invariant
// that AI suggests/flags/explains but NEVER certifies, approves, or moves money.
//   variant 'banner' = full-width generic note (default)
//   variant 'inline' = small chip to tag an inline suggestion
//   variant 'panel'  = page-aware panel driven by commercialAdvisoryEngine's
//                      advisorySummary() — shows blocker counts, top blockers,
//                      blocked value, next action, incomplete-data honesty.
// ============================================================
export function AiAdvisory({ lang = 'en', variant = 'banner', summary = null, pageName = '', children }) {
  const ar = lang === 'ar';
  const c = AI_ADVISORY_COPY[ar ? 'ar' : 'en'];

  if (variant === 'inline') {
    return (
      <span className="inline-flex items-center gap-1 mono text-[9.5px] px-1.5 py-0.5 rounded-full" style={{ background: '#ede9fe', color: '#6d28d9' }} title={c.note}>
        <Sparkles size={10} /> {c.label}
      </span>
    );
  }

  if (variant === 'panel' && summary) {
    const { blockerCount, warningCount, topBlockers, blockedValue, nextAction, incomplete, clean } = summary;
    const hasIssues = blockerCount > 0 || warningCount > 0;
    const Icon = blockerCount > 0 ? ShieldAlert : clean ? ShieldCheck : Info;
    const accent = blockerCount > 0 ? COL.blocked : warningCount > 0 ? COL.pending : COL.accent;
    const softBg = blockerCount > 0 ? COL.blockedSoft : warningCount > 0 ? COL.pendingSoft : COL.accentBg;
    const reminder = ar
      ? 'استشاري فقط. يلزم اعتماد تجاري بشري قبل الاعتماد أو الدفع.'
      : 'AI advisory only. Human commercial approval is required before certification or payment.';

    // Headline summary — never claims "all clear" if checks are incomplete.
    const headline = blockerCount > 0
      ? (ar ? `${blockerCount} بند محظور قبل الاعتماد.` : `${blockerCount} item${blockerCount > 1 ? 's' : ''} blocked before certification.`)
      : warningCount > 0
        ? (ar ? `${warningCount} تنبيه قبل الاعتماد.` : `${warningCount} warning${warningCount > 1 ? 's' : ''} before certification.`)
        : (ar ? 'لا توجد معوّقات من السجلات المتاحة.' : 'No blockers detected from available records.');

    return (
      <div role="note" className="rounded-xl border overflow-hidden" style={{ borderColor: COL.border, background: COL.surface }}>
        <div className="flex items-start gap-2.5 p-3" style={{ background: softBg }}>
          <Icon size={16} className="flex-shrink-0 mt-0.5" style={{ color: accent }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="mono text-[9.5px] tracking-[0.1em] uppercase" style={{ color: accent }}>{ar ? 'استشارة الذكاء' : 'AI advisory'}{pageName ? ` · ${pageName}` : ''}</span>
            </div>
            <div className="text-[13px] font-semibold mt-0.5" style={{ color: COL.text }}>{headline}</div>
            {blockedValue ? (
              <div className="text-[11.5px] mt-0.5" dir="ltr" style={{ color: COL.blocked, textAlign: ar ? 'right' : 'left' }}>{ar ? 'قيمة محظورة: ' : 'Blocked value: '}SAR {Number(blockedValue).toLocaleString('en-US')}</div>
            ) : null}
          </div>
        </div>

        {hasIssues && topBlockers && topBlockers.length > 0 && (
          <ul className="px-3 py-2 space-y-1.5 border-t" style={{ borderColor: COL.border }}>
            {topBlockers.map((b) => (
              <li key={b.id} className="flex items-start gap-2 text-[12.5px]" style={{ color: COL.text }}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: b.severity === 'warning' ? COL.pending : COL.blocked }} />
                <span><span className="font-medium">{b.title}.</span> <span style={{ color: COL.textDim }}>{b.message}</span></span>
              </li>
            ))}
          </ul>
        )}

        <div className="px-3 py-2 border-t text-[12px]" style={{ borderColor: COL.border, color: COL.textDim }}>
          <span className="font-medium" style={{ color: COL.text }}>{ar ? 'الإجراء التالي: ' : 'Next: '}</span>{nextAction}
        </div>

        {incomplete && incomplete.length > 0 && (
          <div className="px-3 py-2 border-t text-[11.5px]" style={{ borderColor: COL.border, color: COL.textMute, background: COL.bg }}>
            {ar ? 'قد تكون بعض الفحوصات غير مكتملة بسبب بيانات ناقصة: ' : 'Some checks may be incomplete because data is missing: '}
            {incomplete.slice(0, 2).join(' ')}
          </div>
        )}

        <div className="px-3 py-2 border-t flex items-center gap-1.5 text-[11px]" style={{ borderColor: COL.border, color: COL.textMute }}>
          <Sparkles size={11} /> {reminder}
        </div>
        {children && <div className="px-3 py-2 border-t text-[12.5px]" style={{ borderColor: COL.border, color: COL.text }}>{children}</div>}
      </div>
    );
  }

  // default 'banner'
  return (
    <div role="note" className="rounded-xl border p-3 flex items-start gap-2.5" style={{ background: '#faf5ff', borderColor: '#e9d5ff' }}>
      <Sparkles size={15} className="flex-shrink-0 mt-0.5" style={{ color: '#7c3aed' }} />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] leading-relaxed" style={{ color: '#6d28d9' }}>{c.note}</div>
        {children && <div className="mt-1.5 text-[12.5px]" style={{ color: COL.text }}>{children}</div>}
      </div>
    </div>
  );
}
