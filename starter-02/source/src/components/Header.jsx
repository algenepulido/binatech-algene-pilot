import { Globe, LogIn, LogOut } from 'lucide-react';
import { COL } from '../lib/theme.js';
import { useAuth } from '../lib/auth.jsx';
import { Logo, LogoMark } from './Logo.jsx';
import { GlobalSearch } from './GlobalSearch.jsx';
import { ProjectSwitcher } from './ProjectSwitcher.jsx';
import { NotificationsBell } from './NotificationsBell.jsx';
import { useIsMobile } from '../lib/useIsMobile.js';

export function Header({ t, lang, setLang, route, setRoute, counts = {} }) {
  const { user, openAuth, signOut } = useAuth();
  const isPhone = useIsMobile();

  if (isPhone) {
    return (
      <header className="flex flex-none items-center border-b px-2 py-1.5" style={{ borderColor: COL.inkBorder, background: COL.ink }}>
        <div className="flex w-full min-w-0 items-center gap-1.5">
          <div data-phone-project-slot="" className="min-w-0 flex-1" style={{ minWidth: 0, flex: '1 1 auto' }}>
            <ProjectSwitcher lang={lang} onGoHome={() => setRoute('home')} phone />
          </div>
          <button
            onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
            data-phone-shell-control=""
            aria-label={lang === 'en' ? 'Switch language to Arabic' : 'Switch language to English'}
            className="flex flex-none items-center justify-center rounded border text-[11px] font-semibold hover:bg-black/[0.045]"
            style={{ background: 'transparent', borderColor: COL.inkBorderHi, color: COL.inkText, minWidth: 44, minHeight: 44 }}
          >
            {lang === 'en' ? 'AR' : 'EN'}
          </button>
          <NotificationsBell counts={counts} onNavigate={setRoute} phone />
        </div>
      </header>
    );
  }

  // Tablet + desktop header. Width budget (ACC-R0.1): the right-hand controls never shrink, so at 768px the left
  // group used to be squeezed below the width of the brand wordmark alone — the project slot collapsed to 0 while its
  // button still painted ~224px wide, straight across the search box and the language button, and took their clicks.
  // So: the left group takes whatever is left (flex-1), the project slot CAPS its button to that space (the label
  // truncates instead of overflowing), and below lg the brand is the compact mark, the search box is narrower and
  // "Sign out" is icon-only. Every action stays present; from lg up nothing changes but the cap.
  return (
    <header className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b" style={{ borderColor: COL.inkBorder, background: COL.ink }}>
      <div className="flex flex-1 items-center gap-3 lg:gap-6 min-w-0">
        <button onClick={() => setRoute('home')} className="flex items-center group flex-shrink-0" title="Projects home">
          <span data-brand="wordmark" className="hidden lg:inline-flex"><Logo size={32} withWordmark dark tagline={t.tagline} markClassName="transition-transform group-hover:scale-105" /></span>
          <span data-brand="mark" className="lg:hidden"><LogoMark size={32} className="transition-transform group-hover:scale-105" /></span>
        </button>
        <div className="h-7 w-px hidden sm:block flex-shrink-0" style={{ background: COL.inkBorder }} />
        <div data-header-project-slot="" className="min-w-0 flex-1 [&>div>button]:max-w-full"><ProjectSwitcher lang={lang} onGoHome={() => setRoute('home')} /></div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
        <div data-header-search="" className="max-lg:[&_input]:w-44"><GlobalSearch onNavigate={setRoute} placeholder={t.search} /></div>
        <button onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} className="px-2.5 py-1.5 text-[11px] rounded border font-medium flex items-center gap-1.5 hover:bg-black/[0.045]" style={{ background: 'transparent', borderColor: COL.inkBorderHi, color: COL.inkText }}>
          <Globe size={12} /> {lang === 'en' ? 'العربية' : 'EN'}
        </button>
        <NotificationsBell counts={counts} onNavigate={setRoute} />
        {user ? (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold uppercase flex-shrink-0" style={{ background: COL.blueSoft, color: COL.blueHi, border: `1px solid ${COL.inkBorder}` }} title={user.email}>
              {(user.email?.[0] ?? 'U')}
            </div>
            <button onClick={() => signOut()} className="px-2 sm:px-2.5 py-1.5 text-[11px] rounded border font-medium flex items-center gap-1.5 hover:bg-black/[0.045] flex-shrink-0" style={{ background: 'transparent', borderColor: COL.inkBorderHi, color: COL.inkText }} title="Sign out">
              <LogOut size={12} /> <span className="hidden lg:inline">Sign out</span>
            </button>
          </div>
        ) : (
          <button onClick={openAuth} className="px-2.5 py-1.5 text-[11px] rounded border font-medium flex items-center gap-1.5 hover:bg-black/[0.045]" style={{ background: 'transparent', borderColor: COL.inkBorderHi, color: COL.inkText }}>
            <LogIn size={12} /> Sign in
          </button>
        )}
      </div>
    </header>
  );
}
