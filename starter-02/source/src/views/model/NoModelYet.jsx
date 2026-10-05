// ============================================================
// NoModelYet — the Model route for a real project that has no IFC model yet.
// A proper workspace entry point, not a blank upload form: two co-equal paths
// (continue without a model · add the BIM model), a model-status block, what an
// upload unlocks, and how the model flows downstream. BIM is optional by design,
// so the no-model path is never secondary or apologetic.
// ============================================================
import { Box, ListTodo, Check } from 'lucide-react';
import { PageHeader, Btn } from '../../components/primitives.jsx';
import { UnlocksRow, FlowStrip } from '../../components/NoModelUi.jsx';
import { ModelUpload } from '../settings/ModelUpload.jsx';
import { MODEL_PAGE, FLOW_STEPS } from './noModelContent.js';
import { COL } from '../../lib/theme.js';

const card = { background: COL.surface, borderColor: COL.border };

export function NoModelYet({ t, lang, onNavigate }) {
  const c = MODEL_PAGE;
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: COL.bg }}>
      <PageHeader title={t?.model || 'Model'} subtitle={c.subtitle} />
      <div className="p-4 sm:p-6">
        <div className="max-w-5xl mx-auto">
          {/* Two-path decision — equal weight, one dominant action each */}
          <div className="grid lg:grid-cols-2 gap-4 sm:gap-5 items-stretch">
            {/* Continue without a model */}
            <section className="rounded-2xl border p-5 sm:p-6 flex flex-col" style={card}>
              <div className="flex items-center gap-2.5 mb-3">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#dcfce7' }}>
                  <ListTodo size={18} style={{ color: '#15803d' }} />
                </span>
                <h2 className="display text-base font-bold" style={{ color: COL.text }}>{c.noModel.header}</h2>
              </div>
              <p className="text-[13px] leading-relaxed mb-4" style={{ color: COL.textDim }}>{c.noModel.description}</p>
              <ul className="space-y-2 mb-5">
                {c.noModel.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-[12.5px]" style={{ color: COL.text }}>
                    <Check size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#15803d' }} />{b}
                  </li>
                ))}
              </ul>
              <div className="mt-auto">
                <Btn icon={ListTodo} variant="primary" size="md" onClick={() => onNavigate?.(c.noModel.ctaRoute)}>{c.noModel.ctaLabel}</Btn>
              </div>
            </section>

            {/* Add the BIM model */}
            <section className="rounded-2xl border p-5 sm:p-6 flex flex-col" style={card}>
              <div className="flex items-center gap-2.5 mb-3">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: COL.accentBg }}>
                  <Box size={18} style={{ color: COL.accent }} />
                </span>
                <h2 className="display text-base font-bold" style={{ color: COL.text }}>{c.upload.header}</h2>
                <span className="ms-auto text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: COL.surfaceAlt, color: COL.textDim }}>Optional</span>
              </div>
              <p className="text-[13px] leading-relaxed mb-4" style={{ color: COL.textDim }}>{c.upload.description}</p>
              <div className="mt-auto"><ModelUpload compact /></div>
            </section>
          </div>

          {/* Status + what it unlocks + downstream flow */}
          <div className="grid lg:grid-cols-2 gap-4 sm:gap-5 mt-4 sm:mt-5">
            <section className="rounded-2xl border p-5" style={card}>
              <div className="display text-sm font-bold mb-3" style={{ color: COL.text }}>{c.status.title}</div>
              <dl className="space-y-2.5">
                {c.status.fields.map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 text-[12.5px]">
                    <dt className="flex-shrink-0" style={{ color: COL.textDim }}>{k}</dt>
                    <dd className="font-medium text-end" style={{ color: COL.text }}>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="rounded-2xl border p-5 flex flex-col gap-4" style={card}>
              <UnlocksRow items={c.unlocks} />
              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: COL.textDim }}>How the model flows downstream</div>
                <FlowStrip steps={FLOW_STEPS} lang={lang} />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
