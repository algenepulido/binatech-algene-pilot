// ============================================================
// AppShell — the signed-in application (dashboard + all modules). Split out
// of App.jsx and lazy-loaded so signed-out visitors only download the
// lightweight public marketing site, not the whole module suite + xlsx.
// ============================================================
import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { subscribeProject, subscribeData, setCurrentProjectId } from './lib/currentProject.js';
import { DEFAULT_PROTECTED_ROUTE, currentHash, navigate, parseRoute, protectedHash } from './lib/routes.js';
import { takePendingInviteToken, clearPendingInvite } from './lib/pendingInvite.js';
import { acceptInvite } from './api/invites.js';
import { getMyRole } from './api/access.js';
import { PermissionProvider } from './lib/usePermissions.jsx';
import { toast } from './components/Toast.jsx';
import { Header } from './components/Header.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { StatusBar } from './components/StatusBar.jsx';
import { T } from './i18n/translations.js';
import { loadCounts, loadFinance, EMPTY_COUNTS } from './lib/stats.js';
import { COL } from './lib/theme.js';
import { APView } from './views/APView.jsx';
import { ApprovalMatrixView } from './views/ApprovalMatrixView.jsx';
import { ApprovalsView } from './views/ApprovalsView.jsx';
import { DMSView } from './views/DMSView.jsx';
import { DashboardView } from './views/DashboardView.jsx';
import { DelayAnalyticsView } from './views/DelayAnalyticsView.jsx';
import { DrawingsView } from './views/DrawingsView.jsx';
import { IPCsView } from './views/IPCsView.jsx';
import { CashflowView } from './views/CashflowView.jsx';
import { InvoicesView } from './views/InvoicesView.jsx';
import { NCRsView } from './views/NCRsView.jsx';
import { POsView } from './views/POsView.jsx';
import { QSView } from './views/QSView.jsx';
import { ElementsRegistryView } from './views/ElementsRegistryView.jsx';
import { WorkItemsView } from './views/WorkItemsView.jsx';
import { ProgressView } from './views/ProgressView.jsx';
import { CommercialHubView } from './views/CommercialHubView.jsx';
import { IpaReconciliationView } from './views/commercial/IpaReconciliationView.jsx';
import { PaymentApplicationWorkspaceView } from './views/commercial/PaymentApplicationWorkspaceView.jsx';
import { EvidencePacksView } from './views/commercial/EvidencePacksView.jsx';
import { CertificationControlRoomView } from './views/commercial/CertificationControlRoomView.jsx';
import { RecoveryQueueView } from './views/commercial/RecoveryQueueView.jsx';
import { CertificationQueueView } from './views/commercial/CertificationQueueView.jsx';
import { ScanView } from './views/field/ScanView.jsx';
import { WorkView } from './views/field/WorkView.jsx';
import { OfflineReferencePack } from './views/field/OfflineReferencePack.jsx';
import { QualityTabs } from './views/QualityTabs.jsx';
import { ReadinessView } from './views/ReadinessView.jsx';
import { ReceivingView } from './views/ReceivingView.jsx';
import { ReportsView } from './views/ReportsView.jsx';
import { SnaggingView } from './views/SnaggingView.jsx';
import { SupplierPortalView } from './views/SupplierPortalView.jsx';
// Lazy-loaded: the 3D viewer pulls in the large three.js library, so it
// only downloads when the Model view is opened (faster initial load).
const ModelView = lazy(() => import('./views/model/ModelRoot.jsx').then((m) => ({ default: m.ModelRoot })));
import { SettingsView } from './views/SettingsView.jsx';
import { ProjectsHome } from './views/projects/ProjectsHome.jsx';
import { TeamAccessView } from './views/TeamAccessView.jsx';
import { GuideView } from './views/GuideView.jsx';
import { Assistant } from './components/Assistant.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { QuickAccess } from './views/QuickAccess.jsx';
import { FieldHome } from './views/field/FieldHome.jsx';
import { MoreView } from './views/field/MoreView.jsx';
import { MobileNav } from './components/MobileNav.jsx';
import { CaptureSheet } from './components/capture/CaptureSheet.jsx';
import { FieldRail } from './components/FieldRail.jsx';
import { FieldSettings } from './views/field/FieldSettings.jsx';
import { PersonaliseActionsSheet } from './views/field/PersonaliseActionsSheet.jsx';
import { DEFAULT_QUICK_ACTIONS, fieldTaskCatalog } from './views/field/fieldTaskCatalog.js';
import { useIsMobile } from './lib/useIsMobile.js';
import { useAuth } from './lib/auth.jsx';
import { can as roleCan, roleLabel } from './lib/permissions.js';
import { getCurrentProjectId } from './lib/currentProject.js';

export default function AppShell() {
  const [lang, setLang] = useState('en');
  // The open page is addressable: it comes FROM the URL (`#/app/<id>`), so deep
  // links, reloads and back/forward all work. `setRoute(id)` keeps its old
  // signature for every caller — it just navigates instead of holding hidden state.
  const [route, setRouteState] = useState(() => parseRoute(currentHash()).routeId || DEFAULT_PROTECTED_ROUTE);
  useEffect(() => {
    const onHash = () => {
      const { kind, routeId } = parseRoute(currentHash());
      if (kind === 'protected' && routeId) setRouteState(routeId);
    };
    window.addEventListener('hashchange', onHash);
    onHash();                                   // adopt the deep link on mount
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const setRoute = useCallback((id) => {
    setRouteState(id);                          // render immediately…
    navigate(protectedHash(id));                // …and keep the URL authoritative
  }, []);
  // A commercial exception tile can carry its filter into the Certification
  // Queue, so "SAR 18.3M blocked" lands on exactly those lines instead of a
  // full list the user has to re-filter by hand.
  const [certFilter, setCertFilter] = useState('all');
  // A WIR chosen from Scan/Work, handed to the WIRs screen so it opens directly.
  const [fieldWir, setFieldWir] = useState(null);
  const goCommercial = (routeId, filter) => { if (filter) setCertFilter(filter); setRoute(routeId); };
  const [selectedElementId, setSelectedElementId] = useState('WIN-G02');
  // Find owns an explicit transition intent. Keep its lightweight search state
  // in the shell so browser Back remounts the same query/scope, and replace
  // (including clearing) any older model selection before opening the receiver.
  const [findState, setFindState] = useState({ query: '', scope: 'all' });
  const [modelSelectionIntent, setModelSelectionIntent] = useState(null);
  const openElementFromFind = useCallback((id) => {
    const selectedId = id || null;
    setSelectedElementId(selectedId);
    setModelSelectionIntent((previous) => ({
      source: 'find',
      id: selectedId,
      sequence: (previous?.sequence || 0) + 1,
    }));
    setRoute('model');
  }, [setRoute]);
  useEffect(() => {
    if (route !== 'model') setModelSelectionIntent(null);
  }, [route]);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [personaliseOpen, setPersonaliseOpen] = useState(false);
  const isPhone = useIsMobile();
  // Device contract (#208): phone <768, tablet 768–1023, desktop from 1024.
  // Tablet ends at 1023 so the JS boundary agrees with Tailwind `lg:` (>=1024).
  const isFieldWidth = useIsMobile(1023);
  const isTablet = isFieldWidth && !isPhone;

  const t = T[lang];
  const rtl = lang === 'ar';

  // Live project numbers from the database (badges, status bar, dashboard).
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const { user, isAuthenticated } = useAuth();
  const firstName = useMemo(() => {
    const full = user?.user_metadata?.full_name || user?.user_metadata?.name || '';
    const src = full || String(user?.email || '').split('@')[0] || '';
    return src.trim().split(/[\s._-]+/)[0] || '';
  }, [user]);
  const [finance, setFinance] = useState({ total: 0, approvedValue: 0, pendingValue: 0, blockedValue: 0, certifiedIpc: 0 });

  // The signed-in user's functional role on the open project — drives which
  // modules/actions the UI offers (RLS is the real enforcement). null = loading.
  const [role, setRole] = useState(null);
  const [quickActionKeys, setQuickActionKeys] = useState(DEFAULT_QUICK_ACTIONS);

  // Reload live numbers (badges, status bar, dashboard) for the open project.
  const refresh = useCallback(() => {
    loadCounts().then(setCounts).catch(() => {});
    loadFinance().then(setFinance).catch(() => {});
    getMyRole().then(setRole).catch(() => setRole(null));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  // Recompute AND remount the routed views when the open project changes, so
  // every tab re-scopes to the new project (not just the ones that subscribe).
  const [pkey, setPkey] = useState(0);
  useEffect(() => {
    const key = `bimqc.field.quickActions.${getCurrentProjectId()}.${role || 'loading'}`;
    try { setQuickActionKeys(JSON.parse(localStorage.getItem(key)) || DEFAULT_QUICK_ACTIONS); }
    catch { setQuickActionKeys(DEFAULT_QUICK_ACTIONS); }
  }, [role, pkey]);
  const saveQuickActions = useCallback((keys, close = true) => {
    setQuickActionKeys(keys);
    try { localStorage.setItem(`bimqc.field.quickActions.${getCurrentProjectId()}.${role || 'loading'}`, JSON.stringify(keys)); } catch { /* storage unavailable */ }
    if (close) setPersonaliseOpen(false);
  }, [role]);
  useEffect(() => subscribeProject(() => {
    refresh();
    setSelectedElementId('WIN-G02');
    setModelSelectionIntent(null);
    setFindState({ query: '', scope: 'all' });
    setPkey((k) => k + 1);
  }), [refresh]);
  // Data changed in a view (e.g. new BoQ links) → refresh global counts/status
  // bar WITHOUT remounting the open view (so the linking board stays open).
  useEffect(() => subscribeData(() => { refresh(); }), [refresh]);

  // Redeem a pending invite link once on entry. A signed-in visitor who opened
  // …/#/accept-invite?token=… (directly or after signing up) is added to the
  // project, switched into it, and dropped on its dashboard.
  useEffect(() => {
    const token = takePendingInviteToken();
    if (!token) return;
    let cancelled = false;
    acceptInvite(token).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setCurrentProjectId(res.project_id);
        setRoute('dashboard');
        toast.success(`You’ve joined ${res.project_name || 'the project'} as ${res.role}.`);
      } else if (res.provisioned === false) {
        toast.info('Invites aren’t fully set up yet. Ask your admin to finish setup.');
      } else if (res.error) {
        toast.error(res.error);
      }
      clearPendingInvite();
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <PermissionProvider role={role}>
    <div dir={rtl ? 'rtl' : 'ltr'} className="w-full flex flex-col" style={{ height: '100dvh', minHeight: 0, overflow: 'hidden', background: COL.bg, color: COL.text, fontFamily: '"Inter", system-ui, -apple-system, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Funnel+Sans:wght@400;500;600;700&family=Funnel+Display:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500;600&family=Cairo:wght@400;500;600;700&display=swap');
        .mono { font-family: 'JetBrains Mono', monospace; }
        .display { font-family: 'Funnel Display', 'Cairo', sans-serif; }
        [dir="rtl"] { font-family: 'Cairo', 'Funnel Sans', sans-serif; }
        [dir="rtl"] .display { font-family: 'Cairo', sans-serif; }
        .scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .scrollbar::-webkit-scrollbar-track { background: transparent; }
        .scrollbar::-webkit-scrollbar-thumb { background: #d6d3c4; border-radius: 3px; }
        .scrollbar::-webkit-scrollbar-thumb:hover { background: #b8b4a3; }
        @keyframes modalPop { from { opacity: 0; transform: translateY(10px) scale(0.97); } to { opacity: 1; transform: none; } }
        .modal-pop { animation: modalPop 0.22s cubic-bezier(0.22, 1, 0.36, 1) both; }
        @media (prefers-reduced-motion: reduce) { .modal-pop { animation: none; } }
        .scrollbar-ink { overflow-y: auto; }
        .scrollbar-ink::-webkit-scrollbar { width: 6px; height: 6px; }
        .scrollbar-ink::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-ink::-webkit-scrollbar-thumb { background: rgba(90,100,120,0.22); border-radius: 3px; }
        .scrollbar-ink::-webkit-scrollbar-thumb:hover { background: rgba(90,100,120,0.4); }
      `}</style>

      <a href="#main-content" className="skip-link">{lang === 'ar' ? 'تخطَّ إلى المحتوى' : 'Skip to content'}</a>
      <Header t={t} lang={lang} setLang={setLang} route={route} setRoute={setRoute} counts={counts} />
      <div data-app-content="" className="flex-1 flex overflow-hidden relative min-h-0" style={{ minHeight: 0, overflow: 'hidden' }}>
        {/* MOB-UI1: the six-area Sidebar is desktop chrome. Below 1024 it is not
            mounted at all — the phone bar and the field rail own navigation. */}
        {!isFieldWidth && <Sidebar route={route} setRoute={setRoute} t={t} counts={counts} role={role} open={false} />}
        {isTablet && <FieldRail t={t} route={route} onNavigate={setRoute} onCapture={() => { if (roleCan(role, 'wir.edit')) setCaptureOpen(true); }} canCapture={roleCan(role, 'wir.edit')} />}
        <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col overflow-hidden outline-none min-h-0">
        <Suspense key={pkey} fallback={<div className="flex-1 flex items-center justify-center text-xs" style={{ color: COL.textMute }}>Loading…</div>}>
        <ErrorBoundary key={`eb-${route}-${pkey}`} compact>
        {route === 'home' && <ProjectsHome t={t} onOpenProject={() => { setRoute(isFieldWidth ? 'quick' : 'dashboard'); refresh(); }} onNavigate={setRoute} />}
        {/* Field Home implements the approved phone frame A and the 1024x768
            frame T composition. Wider desktop keeps the full Quick Access. */}
        {route === 'more' && (
          <MoreView t={t} lang={lang} role={role} onNavigate={setRoute}
            onCapture={() => setCaptureOpen(true)} onPersonalise={() => setPersonaliseOpen(true)} />)}
        {route === 'quick' && (isFieldWidth
          ? <FieldHome t={t} lang={lang} userName={firstName} role={roleLabel(role, lang)} permissionRole={role}
              onNavigate={setRoute} onCapture={() => setCaptureOpen(true)}
              onOpenWir={(w) => { setFieldWir(w); setRoute('wirs'); }} quickActionKeys={quickActionKeys} tablet={isTablet} />
          : <QuickAccess counts={counts} onNavigate={setRoute} />)}
        {/* Field Mode destinations. Both open a WIR by handing it to the WIRs
            screen, so the field user lands in the same record UI (and the same
            mobile bottom-sheet drawer) as everywhere else. */}
        {route === 'scan' && <ScanView t={t} lang={lang} onNavigate={setRoute}
          searchState={findState} onSearchStateChange={setFindState} onOpenElement={openElementFromFind}
          onOpenWir={(w) => { setFieldWir(w); setRoute('wirs'); }} />}
        {route === 'work' && <>
          <WorkView key={`work-${user?.id || 'signed-out'}`} t={t} lang={lang} role={role} onNavigate={setRoute} onOpenWir={(w) => { setFieldWir(w); setRoute('wirs'); }} />
          <OfflineReferencePack isAuthenticated={isAuthenticated} userId={user?.id || null}
            projectId={getCurrentProjectId()} t={t} lang={lang} />
        </>}
        {route === 'guide' && <GuideView t={t} lang={lang} onNavigate={setRoute} />}
        {route === 'dashboard' && <DashboardView t={t} lang={lang} finance={finance} counts={counts} onNavigate={setRoute} />}
        {route === 'model' && <ModelView t={t} lang={lang} selectedId={selectedElementId}
          selectionIntent={modelSelectionIntent} setSelectedId={setSelectedElementId} onNavigate={setRoute} />}
        {route === 'registry' && <ElementsRegistryView t={t} lang={lang} onNavigate={setRoute} onOpenInModel={(guid) => { setSelectedElementId(guid); setRoute('model'); }} />}
        {route === 'workitems' && <WorkItemsView t={t} lang={lang} onNavigate={setRoute} />}
        {route === 'progress' && <ProgressView t={t} />}
        {route === 'commercialhub' && <CommercialHubView t={t} lang={lang} onNavigate={goCommercial} />}
        {route === 'certification-control-room' && <CertificationControlRoomView lang={lang} onNavigate={goCommercial} />}
        {route === 'certqueue' && <CertificationQueueView key={`cq-${certFilter}`} lang={lang} onNavigate={setRoute} initialFilter={certFilter} />}
        {route === 'recovery-queue' && <RecoveryQueueView lang={lang} />}
        {route === 'drawings' && <DrawingsView t={t} />}
        {route === 'dms' && <DMSView t={t} lang={lang} field={isFieldWidth} onBack={() => setRoute('more')} />}
        {route === 'evidence-packs' && <EvidencePacksView lang={lang} onNavigate={setRoute} />}
        {(route === 'wirs' || route === 'qc') && <QualityTabs tab={route} setRoute={setRoute} t={t} lang={lang} onSelectElement={setSelectedElementId} openWir={fieldWir} onOpenedWir={() => setFieldWir(null)} />}
        {route === 'ncrs' && <NCRsView t={t} onSelectElement={setSelectedElementId} setRoute={setRoute} />}
        {route === 'snagging' && <SnaggingView t={t} onSelectElement={setSelectedElementId} setRoute={setRoute} />}
        {route === 'qs' && <QSView t={t} />}
        {route === 'approvals' && <ApprovalsView t={t} lang={lang} />}
        {route === 'ipcs' && <IPCsView t={t} lang={lang} finance={finance} />}
        {route === 'cashflow' && <CashflowView t={t} lang={lang} />}
        {route === 'invoices' && <InvoicesView t={t} />}
        {route === 'ipa-reconciliation' && <IpaReconciliationView lang={lang} />}
        {route === 'payment-applications' && <PaymentApplicationWorkspaceView lang={lang} onNavigate={setRoute} />}
        {route === 'pos' && <POsView t={t} />}
        {route === 'receiving' && <ReceivingView t={t} />}
        {route === 'readiness' && <ReadinessView t={t} />}
        {route === 'portal' && <SupplierPortalView t={t} />}
        {route === 'ap' && <APView t={t} />}
        {route === 'matrix' && <ApprovalMatrixView t={t} />}
        {route === 'delays' && <DelayAnalyticsView t={t} />}
        {route === 'reports' && <ReportsView t={t} />}
        {route === 'settings' && (isFieldWidth
          ? <FieldSettings lang={lang} setLang={setLang} role={role} onBack={() => setRoute('more')} />
          : <SettingsView lang={lang} onNavigate={setRoute} />)}
        {route === 'team' && <TeamAccessView t={t} lang={lang} />}
        </ErrorBoundary>
        </Suspense>
        </main>
      </div>
      {!isFieldWidth && <div className="hidden lg:block"><StatusBar t={t} counts={counts} /></div>}
      {/* Phone only: the JS gate and the bar's md:hidden agree on 768 (#208). */}
      {isPhone && <MobileNav t={t} route={route} counts={counts} onNavigate={setRoute} onCapture={() => { if (roleCan(role, 'wir.edit')) setCaptureOpen(true); }} canCapture={roleCan(role, 'wir.edit')} />}
      <CaptureSheet open={captureOpen} onClose={() => setCaptureOpen(false)} onNavigate={setRoute} t={t} lang={lang} canCapture={roleCan(role, 'wir.edit')} />
      <PersonaliseActionsSheet open={personaliseOpen} t={t} lang={lang}
        catalogue={fieldTaskCatalog({ t, role, onNavigate: setRoute, onCapture: () => setCaptureOpen(true) })}
        value={quickActionKeys} onCancel={() => setPersonaliseOpen(false)} onSave={saveQuickActions} />
      {!isFieldWidth && <div className="hidden lg:block"><Assistant lang={lang} route={route} /></div>}
    </div>
    </PermissionProvider>
  );
}
