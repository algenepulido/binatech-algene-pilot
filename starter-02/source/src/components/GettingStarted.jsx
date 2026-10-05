// ============================================================
// GettingStarted — the new-user path, derived from the project's REAL state
// (src/lib/onboarding.js). Shows the five-step money chain with what's done,
// what's next, and a one-click CTA into the right screen. Disappears on its
// own once the chain is complete; dismissible per project before that.
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Sparkles, X, BookOpen } from 'lucide-react';
import { deriveGettingStarted } from '../lib/onboarding.js';
import { listWorkItems } from '../api/workItems.js';
import { getCurrentProjectId } from '../lib/currentProject.js';
import { COL } from '../lib/theme.js';

const dismissKey = () => `bimqc.gettingstarted.dismissed.${getCurrentProjectId() || 'default'}`;

export function GettingStarted({ lang = 'en', signals, onNavigate, onVisibilityChange }) {
  const ar = lang === 'ar';
  const [dismissed, setDismissed] = useState(() => { try { return !!localStorage.getItem(dismissKey()); } catch { return false; } });
  const [workItemCount, setWorkItemCount] = useState(0);
  useEffect(() => { listWorkItems().then((r) => setWorkItemCount((r || []).length)).catch(() => {}); }, []);

  const gs = useMemo(() => deriveGettingStarted({ ...signals, workItemCount }), [signals, workItemCount]);
  const visible = !dismissed && !gs.completed;
  useEffect(() => { onVisibilityChange?.(visible); }, [visible, onVisibilityChange]);
  if (!visible) return null;

  const dismiss = () => { setDismissed(true); try { localStorage.setItem(dismissKey(), '1'); } catch { /* ignore */ } };

  return (
    <div className="app-rise rounded-2xl border overflow-hidden" style={{ background: COL.surface, borderColor: COL.border, boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
      <div className="px-5 py-4 flex items-center gap-3 border-b" style={{ borderColor: COL.border }}>
        <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: COL.accentBg }}><Sparkles size={17} style={{ color: COL.accent }} /></span>
        <div className="flex-1 min-w-0">
          <div className="display text-[15px] font-bold">{ar ? 'ابدأ هنا — سلسلة المال في خمس خطوات' : 'Start here — the money chain in five steps'}</div>
          <div className="text-[12px] mt-0.5" style={{ color: COL.textDim }}>{ar ? 'من جدول الكميات إلى أول شهادة دفع. يتقدم تلقائيًا مع عملك.' : 'From the BoQ to your first payment certificate. Progress tracks itself as you work.'}</div>
        </div>
        <div className="mono text-[11px] font-bold flex-shrink-0" style={{ color: COL.accent }}>{gs.doneCount}/{gs.total}</div>
        <button onClick={dismiss} className="p-1.5 rounded-full hover:bg-stone-100 flex-shrink-0" style={{ color: COL.textMute }} aria-label={ar ? 'إخفاء' : 'Hide'} title={ar ? 'إخفاء' : 'Hide'}><X size={14} /></button>
      </div>
      {/* progress bar */}
      <div className="h-1 w-full" style={{ background: COL.surfaceAlt }}><div className="h-full transition-all duration-500" style={{ width: `${gs.pct}%`, background: COL.accent }} /></div>

      <div className="px-3 py-2">
        {gs.steps.map((s, i) => {
          const isNext = i === gs.nextIdx;
          return (
            <button key={s.key} onClick={() => onNavigate?.(s.route)} disabled={s.done}
              className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-start transition-colors ${s.done ? '' : 'hover:bg-stone-50'}`}
              style={{ background: isNext ? COL.accentBg : 'transparent', opacity: s.done ? 0.62 : 1 }}>
              <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mono text-[10.5px] font-bold"
                style={{ background: s.done ? '#dcfce7' : isNext ? COL.accent : COL.surfaceAlt, color: s.done ? '#15803d' : isNext ? '#fff' : COL.textMute }}>
                {s.done ? <Check size={13} /> : i + 1}
              </span>
              <span className="flex-1 min-w-0">
                <span className={`block text-[13px] ${isNext ? 'font-bold' : 'font-medium'}`} style={{ color: COL.text, textDecoration: s.done ? 'line-through' : 'none' }}>{s.label[lang] || s.label.en}</span>
                {isNext && <span className="block text-[11.5px] mt-0.5" style={{ color: COL.textDim }}>{s.desc[lang] || s.desc.en}</span>}
              </span>
              {isNext && <span className="inline-flex items-center gap-1 text-[12px] font-bold flex-shrink-0" style={{ color: COL.accent }}>{ar ? 'ابدأ' : 'Go'} <ChevronRight size={13} style={{ transform: ar ? 'scaleX(-1)' : 'none' }} /></span>}
            </button>
          );
        })}
      </div>
      <div className="px-5 py-2.5 border-t flex items-center justify-between" style={{ borderColor: COL.border, background: COL.surfaceAlt }}>
        <span className="text-[11px]" style={{ color: COL.textMute }}>{ar ? 'نموذج BIM اختياري — السلسلة تعمل ببنود العمل وحدها.' : 'A BIM model is optional — the chain runs on work items alone.'}</span>
        <button onClick={() => onNavigate?.('guide')} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: COL.accent }}><BookOpen size={12} /> {ar ? 'الدليل الكامل' : 'Full guide'}</button>
      </div>
    </div>
  );
}
