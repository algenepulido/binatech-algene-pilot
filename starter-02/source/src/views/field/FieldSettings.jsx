import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { useAuth } from '../../lib/auth.jsx';
import { roleLabel } from '../../lib/permissions.js';
import { useProject } from '../../lib/project.jsx';
import { FIELD } from '../../lib/fieldTokens.js';
import { Rule, Surface } from './surface.jsx';

export function FieldSettings({ lang = 'en', setLang, role, onBack }) {
  const ar = lang === 'ar'; const Back = ar ? ChevronRight : ChevronLeft;
  const { user, signOut } = useAuth(); const { project } = useProject();
  const name = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || '—';
  const company = user?.user_metadata?.company_name || user?.user_metadata?.company || project?.contractor || '—';
  const L = ar ? { title: 'الإعدادات', role: 'الدور', company: 'الشركة', roleTruth: 'الدور خاص بكل مشروع وقد يختلف في مشروع آخر.', language: 'اللغة', dates: 'التواريخ', gregorian: 'ميلادي', logout: 'تسجيل الخروج' }
    : { title: 'Settings', role: 'Role', company: 'Company', roleTruth: 'Role is per project and can differ elsewhere.', language: 'Language', dates: 'Dates', gregorian: 'Gregorian', logout: 'Log out' };
  return <div className="flex-1 flex flex-col overflow-hidden" dir={ar ? 'rtl' : 'ltr'} style={{ background: FIELD.page, color: FIELD.ink }}>
    <header className="flex items-center gap-2" style={{ minHeight: 58, padding: '4px 12px', background: FIELD.surface }}><button onClick={onBack} aria-label={ar ? 'رجوع' : 'Back'} className="flex items-center justify-center" style={{ width: 48, height: 48, borderRadius: FIELD.rControl }}><Back size={20} /></button><h1 style={{ flex: 1, fontSize: 16, fontWeight: 600, margin: 0 }}>{L.title}</h1></header>
    <div style={{ height: 1, background: FIELD.hair }} />
    <div className="flex-1 overflow-y-auto" style={{ padding: '24px 20px 32px' }}>
      <Surface style={{ padding: 20, marginBottom: 22 }}><h2 style={{ fontSize: 19, fontWeight: 600, margin: '0 0 12px' }}>{name}</h2><div className="flex gap-3" style={{ marginBottom: 8 }}><span style={{ width: 74, color: FIELD.mute, fontSize: 13.5 }}>{L.role}</span><span style={{ fontSize: 15 }}>{roleLabel(role, lang)}</span></div><div className="flex gap-3"><span style={{ width: 74, color: FIELD.mute, fontSize: 13.5 }}>{L.company}</span><span style={{ fontSize: 15 }}>{company}</span></div><p style={{ color: FIELD.mute, fontSize: 13, lineHeight: 1.5, margin: '14px 0 0' }}>{L.roleTruth}</p></Surface>
      <Surface style={{ marginBottom: 22 }}><div className="flex items-center gap-3" style={{ minHeight: 62, padding: '11px 17px' }}><span className="flex-1" style={{ fontSize: 15.5, fontWeight: 500 }}>{L.language}</span><span className="flex overflow-hidden" style={{ borderRadius: FIELD.rControl, boxShadow: 'inset 0 0 0 1px rgba(22,33,31,.14)' }}><button onClick={() => setLang?.('en')} aria-pressed={lang === 'en'} style={{ minHeight: 38, padding: '0 15px', background: lang === 'en' ? FIELD.ink : 'transparent', color: lang === 'en' ? FIELD.onDark : FIELD.dim, borderRadius: 0, fontSize: 14 }}>EN</button><button onClick={() => setLang?.('ar')} aria-pressed={lang === 'ar'} style={{ minHeight: 38, padding: '0 15px', background: lang === 'ar' ? FIELD.ink : 'transparent', color: lang === 'ar' ? FIELD.onDark : FIELD.dim, borderRadius: 0, fontSize: 14 }}>AR</button></span></div><Rule /><div className="flex items-center" style={{ minHeight: 62, padding: '11px 17px' }}><span className="flex-1"><span className="block" style={{ fontSize: 15.5, fontWeight: 500 }}>{L.dates}</span><span className="block" style={{ fontSize: 13, color: FIELD.mute }}>{L.gregorian}</span></span></div></Surface>
      <Surface><button onClick={() => signOut()} className="w-full text-start flex items-center gap-3" style={{ minHeight: 62, padding: '0 17px', borderRadius: 0 }}><span className="flex-1" style={{ fontSize: 15.5, fontWeight: 500 }}>{L.logout}</span><LogOut size={18} /></button></Surface>
    </div>
  </div>;
}
