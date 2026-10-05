// ============================================================
// Routes — the SINGLE source of truth for how a URL maps to one of the three
// application shells. Before this existed, protected pages were plain React
// state inside AppShell with no URL at all, so `#/wirs` signed-out fell through
// to the marketing homepage and signed-in silently ignored the hash.
//
//   public     → marketing / informational pages (render immediately)
//   auth       → sign-in, invite acceptance (render immediately)
//   protected  → the signed-in application, behind ONE route boundary
//
// Protected routes are namespaced under `#/app/<id>` so they can never collide
// with a marketing route, and so a deep link is unambiguous.
// Pure module: no React, no Supabase, no storage — deterministically testable.
// ============================================================

/** Marketing / informational routes (PublicSite ROUTES). */
export const PUBLIC_ROUTES = [
  '#/', '#/see-the-system', '#/how-it-works', '#/tour', '#/solutions',
  '#/products', '#/security', '#/about', '#/contact', '#/calculator',
];

/**
 * Authentication routes. They must render immediately and stay usable during an
 * auth outage. Password recovery is handled inside the auth dialog (AuthModal),
 * not on its own route, so it inherits this behaviour.
 */
export const AUTH_ROUTES = ['#/sign-in', '#/accept-invite'];

/**
 * Every protected route id — mirrors the AppShell view switch exactly. Kept here
 * so the boundary, the router and the tests all read the same list.
 */
export const PROTECTED_ROUTE_IDS = [
  'home', 'quick', 'guide', 'dashboard', 'approvals',
  // certification chain
  'wirs', 'qc', 'ncrs', 'snagging', 'evidence-packs', 'certification-control-room',
  // 'certqueue' is the line-level certification workspace the Control Room
  // navigates into; the Control Room stays the executive overview.
  'certqueue',
  // Field Mode destinations (phone bottom navigation).
  'scan', 'work', 'more',
  'recovery-queue', 'ipa-reconciliation',
  // commercial — 'payment-applications' is the IPA workspace (the application
  // package); 'ipcs' remains the certification-outcome register. Two objects.
  'payment-applications',
  'qs', 'progress', 'commercialhub', 'ipcs', 'cashflow', 'invoices', 'readiness',
  // procurement
  'pos', 'receiving', 'portal', 'ap',
  // model / records
  'model', 'registry', 'workitems', 'drawings', 'dms',
  // insights / admin
  'reports', 'delays', 'matrix', 'team', 'settings',
];

export const DEFAULT_PROTECTED_ROUTE = 'home';
export const PROTECTED_PREFIX = '#/app/';
export const SIGN_IN_ROUTE = '#/sign-in';
export const PUBLIC_HOME = '#/';

/** Build the hash for a protected route id (optionally with a query string). */
export function protectedHash(routeId, query = '') {
  const id = PROTECTED_ROUTE_IDS.includes(routeId) ? routeId : DEFAULT_PROTECTED_ROUTE;
  const q = query ? (query.startsWith('?') ? query : `?${query}`) : '';
  return `${PROTECTED_PREFIX}${id}${q}`;
}

/**
 * Parse a hash into { kind, routeId, query, path }.
 *
 * `kind` is always one of 'public' | 'auth' | 'protected' — there is no
 * 'unknown' outcome, because an unrecognised URL must resolve somewhere
 * deterministic. An unrecognised `#/app/*` stays PROTECTED (it must never fall
 * back to marketing) and resolves to the default protected route; anything else
 * unrecognised resolves to the public home.
 */
export function parseRoute(hash) {
  const raw = String(hash || PUBLIC_HOME) || PUBLIC_HOME;
  const withHash = raw.startsWith('#') ? raw : `#${raw.startsWith('/') ? '' : '/'}${raw}`;
  const [path, ...rest] = withHash.split('?');
  const query = rest.length ? rest.join('?') : '';

  if (path.startsWith(PROTECTED_PREFIX)) {
    const id = path.slice(PROTECTED_PREFIX.length).replace(/\/+$/, '');
    return {
      kind: 'protected',
      routeId: PROTECTED_ROUTE_IDS.includes(id) ? id : DEFAULT_PROTECTED_ROUTE,
      query,
      path,
    };
  }
  if (AUTH_ROUTES.includes(path)) return { kind: 'auth', routeId: null, query, path };
  if (PUBLIC_ROUTES.includes(path)) return { kind: 'public', routeId: null, query, path };
  // Unrecognised → public home. Never protected, so it can never leak app data.
  return { kind: 'public', routeId: null, query, path: PUBLIC_HOME };
}

export const classifyRoute = (hash) => parseRoute(hash).kind;

/** True when the hash is one this application explicitly knows about. */
export function isKnownRoute(hash) {
  const [path] = String(hash || '').split('?');
  if (PUBLIC_ROUTES.includes(path) || AUTH_ROUTES.includes(path)) return true;
  if (path.startsWith(PROTECTED_PREFIX)) {
    return PROTECTED_ROUTE_IDS.includes(path.slice(PROTECTED_PREFIX.length).replace(/\/+$/, ''));
  }
  return false;
}

// ── Intended destination ────────────────────────────────────
// When an unauthenticated visitor opens a protected deep link we remember it in
// MEMORY only (no storage heuristics) and restore it once auth succeeds, so the
// deep link survives sign-in without ever influencing authorization.
let pendingProtectedHash = null;

export function rememberIntendedRoute(hash) {
  const { kind, routeId, query } = parseRoute(hash);
  if (kind !== 'protected') return;
  if (routeId === DEFAULT_PROTECTED_ROUTE && !query) return; // nothing worth restoring
  pendingProtectedHash = protectedHash(routeId, query);
}

export function takeIntendedRoute() {
  const v = pendingProtectedHash;
  pendingProtectedHash = null;
  return v;
}

export const clearIntendedRoute = () => { pendingProtectedHash = null; };

/**
 * Navigate by hash (no-op outside a browser).
 *
 * `replace` is reserved for routing a blocked protected URL to sign-in. It
 * keeps Back useful: the browser returns to the page before the attempted deep
 * link instead of bouncing between that link and sign-in forever.
 */
export function navigate(hash, { replace = false } = {}) {
  if (typeof window === 'undefined') return;
  if (window.location.hash === hash) return;
  if (replace && window.history?.replaceState) {
    window.history.replaceState(null, '', hash);
    const event = typeof HashChangeEvent === 'function'
      ? new HashChangeEvent('hashchange')
      : new Event('hashchange');
    window.dispatchEvent(event);
    return;
  }
  window.location.hash = hash;
}

export function currentHash() {
  if (typeof window === 'undefined') return PUBLIC_HOME;
  return window.location.hash || PUBLIC_HOME;
}
