import { Check, ChevronDown, ChevronUp, X } from 'lucide-react';
import { FIELD } from '../../lib/fieldTokens.js';
import { Rule, Surface } from './surface.jsx';
import { validQuickActionKeys } from './fieldTaskCatalog.js';

export function PersonaliseActionsSheet({ open, t = {}, lang = 'en', catalogue = [], value = [], onCancel, onSave }) {
  if (!open) return null;
  const ar = lang === 'ar';
  const chosen = validQuickActionKeys(value, catalogue);
  const chosenSet = new Set(chosen);
  const set = (next) => onSave?.(validQuickActionKeys(next, catalogue), false);
  const toggle = (key) => chosenSet.has(key)
    ? set(chosen.filter((item) => item !== key))
    : chosen.length < 4 && set([...chosen, key]);
  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= chosen.length) return;
    const next = [...chosen]; [next[index], next[target]] = [next[target], next[index]]; set(next);
  };

  return <div className="fixed inset-0 z-[95] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={t.fmPersonalise || 'Quick actions'} dir={ar ? 'rtl' : 'ltr'}>
    <button className="absolute inset-0 bg-black/45" aria-label={t.cancel || 'Cancel'} onClick={onCancel} />
    <section className="relative overflow-y-auto" style={{ maxHeight: '92vh', background: FIELD.page, borderRadius: '20px 20px 0 0', paddingBottom: 'calc(24px + env(safe-area-inset-bottom))', color: FIELD.ink }}>
      <div className="flex items-center gap-2" style={{ minHeight: 58, padding: '4px 12px' }}>
        <button onClick={onCancel} className="flex items-center justify-center" style={{ width: 48, height: 48, borderRadius: FIELD.rControl }} aria-label={t.cancel || 'Cancel'}><X size={19} /></button>
        <h1 className="flex-1 text-center" style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{t.fmPersonalise || 'Quick actions'}</h1>
        <button onClick={() => onSave?.(chosen, true)} className="flex items-center justify-center" style={{ minWidth: 48, height: 48, borderRadius: FIELD.rControl, fontWeight: 600 }}>{t.fmSave || 'Save'}</button>
      </div>
      <div style={{ height: 1, background: FIELD.hair }} />
      <div style={{ padding: '18px 20px 0' }}>
        <p style={{ color: FIELD.mute, fontSize: 13.5, margin: '0 0 14px' }}>{(t.fmChosen || '{n} of 4 chosen · use arrows to reorder').replace('{n}', chosen.length)}</p>
        <Surface style={{ marginBottom: 20 }}>
          {chosen.map((key, index) => {
            const task = catalogue.find((item) => item.key === key); if (!task) return null;
            return <div key={key}>{index > 0 && <Rule inset={17} />}<div className="flex items-center gap-2" style={{ minHeight: 62, padding: '7px 11px 7px 17px' }}><span className="flex-1" style={{ fontSize: 15.5, fontWeight: 500 }}>{task.label}</span><button onClick={() => move(index, -1)} disabled={index === 0} aria-label={`${t.fmMoveUp || 'Move up'} ${task.label}`} style={{ width: 44, height: 44, borderRadius: FIELD.rControl, opacity: index === 0 ? .25 : 1 }}><ChevronUp size={18} /></button><button onClick={() => move(index, 1)} disabled={index === chosen.length - 1} aria-label={`${t.fmMoveDown || 'Move down'} ${task.label}`} style={{ width: 44, height: 44, borderRadius: FIELD.rControl, opacity: index === chosen.length - 1 ? .25 : 1 }}><ChevronDown size={18} /></button><button onClick={() => toggle(key)} aria-label={`${t.fmRemove || 'Remove'} ${task.label}`} style={{ width: 44, height: 44, borderRadius: FIELD.rControl, color: FIELD.fail }}><X size={18} /></button></div></div>;
          })}
        </Surface>
        {chosen.length < 4 && <><div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.11em', textTransform: 'uppercase', color: FIELD.mute, marginBottom: 10 }}>{t.fmAddOneMore || 'Add one more'}</div>
        <Surface>{catalogue.filter((task) => !chosenSet.has(task.key)).map((task, index) => <div key={task.key}>{index > 0 && <Rule />}<button onClick={() => toggle(task.key)} className="w-full text-start flex items-center gap-3" style={{ minHeight: 62, padding: '0 17px', borderRadius: 0 }}><span className="flex-1" style={{ fontSize: 15.5 }}>{task.label}</span><span className="flex items-center justify-center" style={{ width: 24, height: 24, borderRadius: 12, boxShadow: 'inset 0 0 0 1.5px rgba(22,33,31,.26)' }}><Check size={13} style={{ opacity: 0 }} /></span></button></div>)}</Surface></>}
        <p style={{ fontSize: 13, color: FIELD.mute, lineHeight: 1.5, margin: '16px 3px 0' }}>{t.fmAuthorityTruth || 'Only tasks already permitted for this project appear here. Pinning changes reach, never authority.'}</p>
      </div>
    </section>
  </div>;
}
