// ============================================================
// PILOT STARTER ONLY — renders the real application shell.
//
// This mirrors the protected branch of the application's own src/main.jsx +
// src/App.jsx: the same fonts and stylesheets, React.StrictMode, the same
// provider order, ProtectedRoute > Suspense > the lazily loaded AppShell, and
// the global toast/confirm hosts. The public marketing site and sign-in pages
// are not part of the starter; after "Log out" a small starter screen offers
// to return to the synthetic session.
// ============================================================
import React, { lazy, Suspense, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from '../lib/auth.jsx';
import { ProjectProvider } from '../lib/project.jsx';
import { ElementsProvider } from '../lib/elements.jsx';
import { AuthModal } from '../components/AuthModal.jsx';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';
import { ProtectedRoute } from '../components/ProtectedRoute.jsx';
import { LoginGate } from '../components/LoginGate.jsx';
import { ToastViewport } from '../components/Toast.jsx';
import { ConfirmHost } from '../components/ConfirmDialog.jsx';
import { restartAsSyntheticReviewer } from './browserState.js';
// Same self-hosted fonts and stylesheet order as src/main.jsx.
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import '@fontsource/familjen-grotesk/500.css';
import '@fontsource/familjen-grotesk/600.css';
import '@fontsource/familjen-grotesk/700.css';
import '../styles/certification-ledger.css';
import '../index.css';

const AppShell = lazy(() => import('../AppShell.jsx'));

function StarterRoot() {
  const [inApp, setInApp] = useState(() => window.location.hash.startsWith('#/app/'));
  useEffect(() => {
    const onHash = () => setInApp(window.location.hash.startsWith('#/app/'));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  if (!inApp) {
    return (
      <main data-pilot-signed-out style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, font: '15px/1.5 system-ui, sans-serif' }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Signed out of the synthetic session</h1>
          <p style={{ margin: '0 0 16px', color: '#475569' }}>This pilot starter has no sign-in pages and no real accounts.</p>
          <button type="button" onClick={() => restartAsSyntheticReviewer(window)} style={{ minHeight: 44, padding: '0 16px', borderRadius: 8, border: '1px solid #0F172A', background: '#0F172A', color: '#fff', fontWeight: 600 }}>
            Return to the starter
          </button>
        </div>
      </main>
    );
  }
  return (
    <ProtectedRoute>
      <Suspense fallback={<LoginGate loading />}><AppShell /></Suspense>
    </ProtectedRoute>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <ProjectProvider>
          <ElementsProvider>
            <StarterRoot />
            <ToastViewport />
            <ConfirmHost />
            <AuthModal />
          </ElementsProvider>
        </ProjectProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
