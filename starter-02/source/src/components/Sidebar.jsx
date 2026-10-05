import { useLayoutEffect, useRef, useState } from 'react';
import { AlertOctagon, BarChart3, Book, Box, Boxes, ChevronDown, FileImage, FileSpreadsheet, FileStack, FileText, Flag, FlaskConical, FolderCheck, Gauge, GitBranch, Grid3x3, HandCoins, Home, Inbox, LayoutDashboard, ListChecks, ListTodo, Radar, Receipt, Scale, Search, Settings, ShieldCheck, ShoppingCart, Timer, Truck, Users, ClipboardCheck, TrendingUp } from 'lucide-react';
import { COL } from '../lib/theme.js';
import { useProject } from '../lib/project.jsx';
import { canView } from '../lib/permissions.js';

// UX-D1 progressive navigation. Six human-facing primary areas plus three
// secondary groups. Grouping is PRESENTATION only: route ids, deep links, the
// canView filter and the badges are exactly the legacy ones. Session-only open
// state (in-memory, NO localStorage): Overview starts open, every other area
// starts collapsed, and the area that owns the active route is always expanded.
const DEFAULT_OPEN = { overview: true };

// The six synthetic/illustrative destinations confirmed at base 5bde9a1e. They
// stay reachable for development review but live behind an explicit Demo
// boundary, and carry a visible Demo label everywhere — including search.
const DEMO_ROUTES = new Set(['evidence-packs', 'payment-applications', 'ipa-reconciliation', 'recovery-queue', 'ap', 'delays']);

export function Sidebar({ route, setRoute, t, counts, role, open, forceDrawer = false, overlay = false, onClose }) {
  const { project } = useProject();
  const [q, setQ] = useState('');
  const [openState, setOpenState] = useState({ ...DEFAULT_OPEN });

  // MOBILE-A11Y-1 — while the sidebar is an overlay drawer (phone/tablet) AND
  // closed, it sits translated offscreen. Its controls must then be unreachable
  // (native `inert` + aria-hidden on the <aside> only) and focus must never be
  // stranded inside it. The static desktop sidebar (overlay=false) is never
  // touched, whatever the overlay-open flag says.
  const asideRef = useRef(null);
  const openerRef = useRef(null);
  const hidden = overlay && !open;
  useLayoutEffect(() => {
    if (!overlay || !open) return;
    // Remember the real opener: whatever had focus when the drawer opened, as
    // long as it is outside the drawer (no label lookup, no synthetic target).
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement && active !== document.body && !asideRef.current?.contains(active) ? active : null;
  }, [overlay, open]);
  useLayoutEffect(() => {
    // Runs synchronously after the inert attribute lands, before the browser's
    // own focus fixup: if the drawer just hid a focused control, hand focus back.
    if (hidden) leaveHiddenSidebar(asideRef.current, openerRef.current);
  }, [hidden]);

  // `match` lets a row stay active for sibling routes (WIRs owns the consolidated 'qc' tab).
  const areas = [
    { gid: 'overview', tier: 'primary', icon: LayoutDashboard, label: t.navOverview || 'Overview', items: [
      { id: 'home', label: t.projects || 'Projects', icon: Home },
      { id: 'dashboard', label: t.dashboard, icon: LayoutDashboard },
      // Cross-cutting action queue — keeps its inbox badge.
      { id: 'approvals', label: t.approvals, icon: Inbox, badge: counts.pendingApprovals, badgeColor: '#d97706' },
    ]},
    // Prove the work: inspections with contextual QC, then the two distinct issue types, then work scopes.
    { gid: 'sitework', tier: 'primary', icon: ClipboardCheck, label: t.navSiteWork || 'Site Work', items: [
      { id: 'wirs', label: t.wirsQc || 'WIRs / QC', icon: ClipboardCheck, badge: counts.openWirs, match: ['wirs', 'qc'] },
      { id: 'ncrs', label: t.ncrs, icon: AlertOctagon, badge: counts.openNcrs, badgeColor: '#dc2626' },
      { id: 'snagging', label: t.snagging || 'Snagging', icon: Flag, badge: counts.openSnags, badgeColor: '#dc2626' },
      { id: 'workitems', label: t.workItems || 'Work Items', icon: ListTodo },
    ]},
    // Contract baseline and location progress first; the BIM-optional specialist views last.
    { gid: 'boq', tier: 'primary', icon: FileSpreadsheet, label: t.navBoqProgress || 'BoQ & Progress', items: [
      { id: 'qs', label: t.qs, icon: FileSpreadsheet },
      { id: 'progress', label: t.progress || 'Progress', icon: Grid3x3 },
      { id: 'model', label: t.model, icon: Box },
      { id: 'registry', label: t.registry || 'Elements Registry', icon: Boxes },
    ]},
    { gid: 'commercial', tier: 'primary', icon: Receipt, label: t.grpCommercial || 'Commercial', items: [
      // ACC-R0: Commercial Control (existing `commercialhub`) is the area's landing, so it leads; Control Room is retained next.
      { id: 'commercialhub', label: t.commercialHub || 'Commercial Control', icon: Gauge },
      { id: 'certification-control-room', label: t.controlRoom || 'Control Room', icon: Radar },
      { id: 'certqueue', label: t.certQueue || 'Certification Queue', icon: ClipboardCheck },
      { id: 'ipcs', label: t.ipcs, icon: Receipt },
      { id: 'invoices', label: t.clientInvoices || 'Client Invoices', icon: FileText },
    ]},
    { gid: 'documents', tier: 'primary', icon: FileText, label: t.navDocuments || 'Documents', items: [
      { id: 'drawings', label: t.drawings, icon: FileImage, badge: counts.drawingsPending },
      { id: 'dms', label: t.dms || 'Documents (DMS)', icon: FileText, badge: counts.docsPending, badgeColor: '#d97706' },
    ]},
    { gid: 'reports', tier: 'primary', icon: BarChart3, label: t.navReports || 'Reports', items: [
      { id: 'reports', label: t.reports, icon: BarChart3 },
      { id: 'cashflow', label: t.cashflow || 'Cashflow / S-Curve', icon: TrendingUp },
    ]},
    { gid: 'procurement', tier: 'secondary', icon: ShoppingCart, label: t.grpProcurement || 'Procurement', items: [
      { id: 'pos', label: t.pos || 'POs & Contracts', icon: ShoppingCart },
      { id: 'receiving', label: t.receiving || 'Delivery Notes (SDN)', icon: Truck, badge: counts.pendingSdn, badgeColor: '#d97706' },
      // 'Readiness' alone is ambiguous next to certification readiness: this screen is about SUPPLIER invoices.
      { id: 'readiness', label: t.invoiceReadiness || 'Supplier Invoice Readiness', icon: ListChecks, badge: counts.readyForAp, badgeColor: COL.gold },
      { id: 'portal', label: t.supplierPortal || 'Supplier Portal', icon: Users },
    ]},
    // Approval Matrix mixes real configuration with sample history, so it stays here — not blanket Demo.
    { gid: 'admin', tier: 'secondary', icon: Settings, label: t.navAdmin || 'Settings & Admin', items: [
      { id: 'matrix', label: t.matrix || 'Approval Matrix', icon: GitBranch },
      { id: 'team', label: t.team || 'Team & Access', icon: ShieldCheck },
      { id: 'settings', label: t.projectSettings || 'Project Settings', icon: Settings },
      { id: 'guide', label: t.guide || 'Guided Tour', icon: Book },
    ]},
    { gid: 'demo', tier: 'secondary', icon: FlaskConical, label: t.navDemo || 'Demo', hint: t.navDemoHint || 'Sample data for review — not project records.', items: [
      { id: 'evidence-packs', label: t.evidencePacks || 'Evidence Packs', icon: FolderCheck },
      { id: 'payment-applications', label: t.paymentApplications || 'Payment Applications', icon: FileStack },
      { id: 'ipa-reconciliation', label: t.ipaReconciliation || 'IPA Reconciliation', icon: Scale },
      { id: 'recovery-queue', label: t.recoveryQueue || 'Recovery Queue', icon: HandCoins },
      { id: 'ap', label: t.ap || 'AP Workspace', icon: Inbox, badge: counts.readyForAp, badgeColor: COL.gold },
      { id: 'delays', label: t.delays || 'Delay Analytics', icon: Timer },
    ]},
  ].map((g) => ({ ...g, items: g.items.map((it) => ({ ...it, demo: DEMO_ROUTES.has(it.id), areaLabel: g.label })) }));

  const isActive = (it) => route === it.id || (it.match && it.match.includes(route));
  // The section holding the active page is always expanded, so the current page
  // stays visible/highlighted; other sections toggle freely.
  const sectionHasActive = (g) => g.items.some(isActive);
  const isOpen = (g) => sectionHasActive(g) || (openState[g.gid] ?? !!DEFAULT_OPEN[g.gid]);
  // Toggle from what is CURRENTLY shown, so the first click on a default-open area collapses it.
  const toggle = (gid) => setOpenState((s) => ({ ...s, [gid]: !(s[gid] ?? !!DEFAULT_OPEN[gid]) }));
  const go = (id) => { setRoute(id); onClose?.(); };

  // Functional colour: blue = current selection, amber = Demo / attention. Colour is always
  // paired with text. 8px corners. Overlay drawer controls meet the 44px touch target.
  const rowMinHeight = overlay ? 44 : 34;
  const DemoTag = () => (
    <span data-demo-tag className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ background: '#ffffff', color: '#9A651A', border: '1px solid #D9B978' }}>{t.demoTag || 'Demo'}</span>
  );
  const NavItem = (it, { context = false } = {}) => {
    const Icon = it.icon;
    const active = isActive(it);
    return (
      <button key={it.id} data-route={it.id} aria-current={active ? 'page' : undefined} onClick={() => go(it.id)}
        className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 text-[13px] rounded-lg text-start transition-colors ${active ? '' : 'hover:bg-black/[0.04]'}`}
        style={{ minHeight: rowMinHeight, background: active ? COL.blueSoft : 'transparent', color: active ? COL.inkText : COL.inkDim, fontWeight: active ? 600 : 400 }}>
        <Icon size={14} className="flex-shrink-0" style={{ color: active ? COL.blueHi : COL.inkMute }} />
        {/* Labels wrap rather than truncate: a clipped "Evidence P…" defeats the point of a clearer IA. */}
        <span className="flex-1 min-w-0 leading-snug break-words">{it.label}</span>
        {context && <span data-area-context className="text-[10px] flex-shrink-0 truncate max-w-[84px]" style={{ color: COL.inkDim }}>{it.areaLabel}</span>}
        {it.demo && <DemoTag />}
        {it.badge != null && it.badge > 0 && (
          <span data-badge className="mono text-[9px] px-1.5 rounded font-bold flex-shrink-0" style={{ background: it.badgeColor || COL.blueHi, color: '#ffffff' }}>{it.badge}</span>
        )}
      </button>
    );
  };

  // Jump filter — flatten everything and match by label (so any module is one
  // keystroke away, even inside a collapsed group). No routes hidden.
  const query = q.trim().toLowerCase();
  // QC lives inside the WIRs surface; expose it as a search-only alias so
  // typing "QC" jumps straight to the QC tab (without a separate tree row).
  const searchExtra = [{ id: 'qc', label: 'QC tests', icon: FlaskConical }];
  // Role gating — hide modules this role can't see (RLS is the real boundary;
  // this keeps the nav honest and uncluttered). Empty groups drop out entirely.
  const vAreas = areas.map((g) => ({ ...g, items: g.items.filter((it) => canView(role, it.id)) })).filter((g) => g.items.length);
  const vSearchExtra = searchExtra.filter((it) => canView(role, it.id));
  const allItems = [...vAreas.flatMap((g) => g.items), ...vSearchExtra];
  const filtered = query ? allItems.filter((it) => it.label.toLowerCase().includes(query)) : null;

  return (
    <aside ref={asideRef} inert={hidden ? '' : undefined} aria-hidden={hidden ? 'true' : undefined} onFocusCapture={hidden ? () => leaveHiddenSidebar(asideRef.current, openerRef.current) : undefined} className={`fixed inset-y-0 left-0 z-40 w-60 border-r flex flex-col transition-transform duration-200 ${forceDrawer ? '' : 'lg:static lg:z-auto lg:w-56 lg:flex-shrink-0 lg:translate-x-0'} ${open ? 'translate-x-0' : '-translate-x-full'}`} style={{ borderColor: COL.inkBorder, background: COL.ink }}>
      <div className="flex-1 overflow-y-auto py-3 px-2 scrollbar-ink">
        {/* Jump filter */}
        <div className="relative px-1 mb-2">
          <Search size={13} className="absolute start-3 top-1/2 -translate-y-1/2" style={{ color: COL.inkMute }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.jumpTo || 'Jump to…'} className="w-full ps-8 pe-2 py-1.5 text-[12px] rounded-lg border outline-none transition-colors" style={{ background: COL.inkAlt, borderColor: COL.inkBorder, color: COL.inkText }} onFocus={(e) => { e.target.style.borderColor = COL.blueHi; }} onBlur={(e) => { e.target.style.borderColor = COL.inkBorder; }} />
        </div>

        {filtered ? (
          <div className="space-y-0.5">
            {filtered.length === 0 && <div className="px-2.5 py-3 text-[12px]" style={{ color: COL.inkMute }}>{t.noMatches || 'No matches.'}</div>}
            {filtered.map((it) => NavItem(it, { context: true }))}
          </div>
        ) : (
          <>
            {vAreas.map((g, idx) => {
              const openG = isOpen(g);
              const activeSection = sectionHasActive(g);
              const AreaIcon = g.icon;
              // Sample (Demo) rows never raise an operational-looking count on a collapsed heading.
              const attention = g.items.reduce((sum, it) => sum + (!it.demo && it.badge > 0 ? it.badge : 0), 0);
              const firstSecondary = g.tier === 'secondary' && vAreas[idx - 1]?.tier !== 'secondary';
              const panelId = `sidebar-area-${g.gid}`;
              return (
                <div key={g.gid} className={idx === 0 ? '' : 'mt-1'}>
                  {firstSecondary && (
                    <div data-nav-more className="mt-3 mb-1 pt-3 px-2.5 border-t text-[10px] font-semibold uppercase tracking-wider" style={{ borderColor: COL.inkBorder, color: COL.inkDim }}>{t.navMore || 'More'}</div>
                  )}
                  <button data-nav-area={g.gid} data-nav-tier={g.tier} data-active-area={activeSection ? 'true' : undefined} onClick={() => toggle(g.gid)} aria-expanded={openG} aria-controls={panelId}
                    className="w-full flex items-center gap-2.5 px-2.5 rounded-lg text-start hover:bg-black/[0.04] transition-colors"
                    style={{ minHeight: rowMinHeight, color: activeSection ? COL.inkText : COL.inkDim }}>
                    <AreaIcon size={15} className="flex-shrink-0" style={{ color: activeSection ? COL.blueHi : COL.inkMute }} />
                    <span className={`flex-1 min-w-0 truncate ${g.tier === 'primary' ? 'text-[13px] font-semibold' : 'text-[12.5px] font-medium'}`}>{g.label}</span>
                    {!openG && attention > 0 && (
                      <span data-area-badge aria-label={(t.navAttention || '{n} need attention').replace('{n}', attention)} className="mono text-[9px] px-1.5 rounded font-bold flex-shrink-0" style={{ background: '#9A651A', color: '#ffffff' }}>{attention}</span>
                    )}
                    <ChevronDown size={12} className="flex-shrink-0" style={{ color: COL.inkMute, transform: openG ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
                  </button>
                  {openG && (
                    <div id={panelId} className="space-y-0.5 mt-0.5 ms-3 ps-2 border-s" style={{ borderColor: COL.inkBorder }}>
                      {g.hint && <div className="px-2.5 py-1 text-[11px] leading-snug" style={{ color: '#9A651A' }}>{g.hint}</div>}
                      {g.items.map((it) => NavItem(it))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
      {/* Footer project metadata — intentionally light so it doesn't compete with the nav. */}
      <div className="px-3 py-2.5 border-t mono text-[9px] space-y-0.5 opacity-70" style={{ borderColor: COL.inkBorder, color: COL.inkMute }}>
        <div className="flex justify-between gap-2"><span>{t.contractor}</span><span className="truncate" style={{ color: COL.inkMute }}>{project.contractor}</span></div>
        <div className="flex justify-between gap-2"><span>{t.consultant}</span><span className="truncate" style={{ color: COL.inkMute }}>{project.consultant}</span></div>
        <div className="flex justify-between gap-2"><span>{t.lastSync}</span><span style={{ color: COL.inkMute }}>08:42</span></div>
      </div>
    </aside>
  );
}

// MOBILE-A11Y-1 helpers. A usable restoration target is connected, enabled and
// not inside any hidden/inert subtree; where the document has layout it must
// also have a box (jsdom has no layout, so geometry is only consulted when the
// body itself has a width).
function isUsableTarget(el) {
  if (!(el instanceof HTMLElement) || !el.isConnected || el === document.body) return false;
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return false;
  if (el.closest('[inert],[hidden],[aria-hidden="true"]')) return false;
  const hasLayout = document.body.getBoundingClientRect().width > 0;
  return !hasLayout || el.getClientRects().length > 0;
}

// Move focus out of a hidden drawer: to the recorded opener when it is still
// usable, otherwise to the app's content landmark (#main-content, tabIndex -1),
// otherwise simply blur. Focus that is already outside the drawer is left alone.
function leaveHiddenSidebar(aside, opener) {
  if (!aside || typeof document === 'undefined') return;
  const active = document.activeElement;
  if (!active || !aside.contains(active)) return;
  if (isUsableTarget(opener)) { opener.focus(); return; }
  const main = document.getElementById('main-content');
  if (isUsableTarget(main)) { main.focus(); return; }
  if (active instanceof HTMLElement) active.blur();
}
