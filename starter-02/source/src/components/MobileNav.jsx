// ============================================================
// MobileNav — the bottom bar shown only on phones (<768px, the app's
// useIsMobile boundary; md:hidden below mirrors it in CSS).
//
// Destinations follow the approved Field Mode Target recommendation
// (§12, "Navigation comparison"): Variant A, with Find holding the fifth slot
// until Drafts has an implementation.
//
//     Home · Work · Capture · Find · More
//
// Why not Drafts as drawn: the design's own §13 classifies local draft
// measurements and the offline queue as Planned, and its rule is that a
// destination which no action in the product can fill must not ship. Find is
// the interim occupant because reaching a record someone else raised is a live
// task today. One destination changes on a known trigger; four never move.
//
// Capture is an inline filled mark in a wider cell — never a floating orb, and
// never raised above the bar. RTL-correct via logical properties.
// ============================================================
import { LayoutGrid, ListTodo, Search, Menu, Plus } from 'lucide-react';
import { COL } from '../lib/theme.js';
import { FIELD } from '../lib/fieldTokens.js';

// MOB-UI1 — route FAMILIES own the active tab. A destination opened from a tab
// keeps that tab current (Documents lives under More, an inspection opened
// from Work keeps Work). Presentation only: route ids and permission gates are
// unchanged, and a route no tab owns simply lights nothing.
export const PHONE_TAB_ROUTES = {
  quick: ['quick', 'home'],
  work: ['work', 'wirs', 'qc', 'ncrs', 'snagging'],
  scan: ['scan', 'model', 'registry'],
  more: ['more', 'dms', 'drawings', 'settings', 'guide'],
};
export function phoneTabFor(route) {
  for (const [tab, routes] of Object.entries(PHONE_TAB_ROUTES)) if (routes.includes(route)) return tab;
  return null;
}

export function MobileNav({ t = {}, route, onNavigate, onCapture, counts = {}, canCapture = true }) {
  // Two destinations each side of Capture. `scan` is the existing find-a-record
  // surface (search over WIRs, elements and drawings) — the design's "Find".
  const left = [
    { key: 'quick', label: t.mNavHome || 'Home', icon: LayoutGrid, route: 'quick' },
    { key: 'work', label: t.mNavWork || 'Work', icon: ListTodo, route: 'work', n: counts.openWirs || 0 },
  ];
  const right = [
    { key: 'scan', label: t.mNavFind || 'Find', icon: Search, route: 'scan' },
    { key: 'more', label: t.mNavMore || 'More', icon: Menu, route: 'more' },
  ];

  const Tab = (it) => {
    const Icon = it.icon;
    const active = phoneTabFor(route) === it.route;
    return (
      <button key={it.key} onClick={() => onNavigate?.(it.route)}
        className="flex-1 flex flex-col items-center justify-center gap-1 relative active:bg-black/[0.06]"
        style={{ color: active ? COL.blueHi : COL.inkMute, minHeight: 56, borderRadius: 0 }}
        aria-label={it.label} aria-current={active ? 'page' : undefined}>
        <Icon size={21} />
        <span className="text-[10.5px]" style={{ fontWeight: active ? 600 : 450 }}>{it.label}</span>
        {it.n > 0 && (
          <span className="absolute top-1.5 ms-5 w-4 h-4 rounded-full text-[8px] font-bold text-white flex items-center justify-center" style={{ background: FIELD.fail }}>{it.n > 9 ? '9+' : it.n}</span>
        )}
      </button>
    );
  };

  return (
    <nav className="md:hidden relative flex-shrink-0 border-t flex items-stretch" style={{ background: COL.ink, borderColor: COL.inkBorder, paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {left.map(Tab)}

      {/* Capture — a wider cell carrying an inline filled mark. The design draws
          the mark at 34px/10px radius and lifts it 3px; it ships flush at the
          8px control radius, because "inline, not a floating orb" is the owner's
          standing rule and a raised mark is what that rule names. */}
      <div className="flex-1 flex items-center justify-center relative px-1.5" style={{ minWidth: 76 }}>
        <button onClick={onCapture} disabled={!canCapture} aria-disabled={!canCapture} aria-label={t.mNavCapture || 'Capture'}
          className="w-full flex flex-col items-center justify-center gap-1 active:brightness-95 transition-[filter]"
          style={{ minHeight: 48, minWidth: 64, borderRadius: 0, marginTop: 0, background: 'transparent', color: COL.inkText }}>
          <span data-capture-mark
            className="flex items-center justify-center"
            style={{ width: 34, height: 34, borderRadius: FIELD.rControl, background: canCapture ? COL.accent : 'rgba(255,255,255,.12)', color: canCapture ? '#fff' : COL.inkMute }}>
            <Plus size={19} />
          </span>
          <span className="text-[10.5px] font-semibold">{t.mNavCapture || 'Capture'}</span>
        </button>
      </div>

      {right.map(Tab)}
    </nav>
  );
}
