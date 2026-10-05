// ============================================================
// PILOT STARTER ONLY — network denial, installed BEFORE any provider or
// screen is imported (see src/pilot/main.jsx).
//
// The starter has no backend. Application code that tries to reach one
// (Edge Function fetches, R2 XHR uploads, model downloads …) is refused here
// and logged as "network-blocked". Only same-origin GET/HEAD requests to the
// local dev server (modules and static assets) and Vite's own same-host
// hot-reload socket are allowed. index.html adds a Content-Security-Policy as
// a second layer.
// ============================================================

export class StarterNetworkBlocked extends TypeError {
  constructor(what) {
    super(`PILOT STARTER: network request blocked — ${what}. The starter has no backend; nothing was sent.`);
    this.name = 'StarterNetworkBlocked';
    this.code = 'PILOT_NETWORK_BLOCKED';
  }
}

function resolveUrl(input, base) {
  try {
    const raw = typeof input === 'string' ? input : input?.url ?? String(input);
    return new URL(raw, base);
  } catch {
    return null;
  }
}

/**
 * @param {Window|object} target  the global to guard (window in the browser)
 * @param {{ record(entry): void }} log
 * @returns {() => void} uninstall (tests only)
 */
export function installNetworkGuard(target, log) {
  if (target.__pilotNetworkGuard) return target.__pilotNetworkGuard.uninstall;
  const origin = target.location?.origin;
  const host = target.location?.host;
  const deny = (what, detail) => {
    log.record({ kind: 'network-blocked', what, ...detail });
    return new StarterNetworkBlocked(what);
  };
  const restore = [];
  const swap = (obj, key, value) => {
    if (!obj || !(key in obj)) return;
    const previous = obj[key];
    obj[key] = value;
    restore.push(() => { obj[key] = previous; });
  };

  const realFetch = target.fetch?.bind(target);
  if (realFetch) {
    swap(target, 'fetch', (input, init = {}) => {
      const url = resolveUrl(input, target.location?.href);
      const method = String(init.method || input?.method || 'GET').toUpperCase();
      const sameOrigin = url && (url.protocol === 'blob:' || url.protocol === 'data:' || url.origin === origin);
      if (sameOrigin && (method === 'GET' || method === 'HEAD')) return realFetch(input, init);
      return Promise.reject(deny(`fetch ${method} ${url ? url.href : String(input)}`, { api: 'fetch', method, url: url?.href ?? String(input) }));
    });
  }

  const XHR = target.XMLHttpRequest;
  if (XHR?.prototype?.open) {
    const realOpen = XHR.prototype.open;
    swap(XHR.prototype, 'open', function open(method, url, ...rest) {
      const resolved = resolveUrl(url, target.location?.href);
      const m = String(method || 'GET').toUpperCase();
      if (resolved && resolved.origin === origin && (m === 'GET' || m === 'HEAD')) return realOpen.call(this, method, url, ...rest);
      throw deny(`XMLHttpRequest ${m} ${resolved ? resolved.href : String(url)}`, { api: 'xhr', method: m, url: resolved?.href ?? String(url) });
    });
  }

  const RealWebSocket = target.WebSocket;
  if (RealWebSocket) {
    const Guarded = function WebSocket(url, protocols) {
      const resolved = resolveUrl(url, target.location?.href);
      if (resolved && resolved.host === host && (resolved.protocol === 'ws:' || resolved.protocol === 'wss:')) {
        return protocols === undefined ? new RealWebSocket(url) : new RealWebSocket(url, protocols);
      }
      throw deny(`WebSocket ${resolved ? resolved.href : String(url)}`, { api: 'websocket', url: resolved?.href ?? String(url) });
    };
    Guarded.prototype = RealWebSocket.prototype;
    for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) Guarded[k] = RealWebSocket[k];
    swap(target, 'WebSocket', Guarded);
  }

  const RealEventSource = target.EventSource;
  if (RealEventSource) {
    swap(target, 'EventSource', function EventSource(url) {
      const resolved = resolveUrl(url, target.location?.href);
      throw deny(`EventSource ${resolved ? resolved.href : String(url)}`, { api: 'eventsource', url: resolved?.href ?? String(url) });
    });
  }

  const nav = target.navigator;
  if (nav && typeof nav.sendBeacon === 'function') {
    try {
      Object.defineProperty(nav, 'sendBeacon', {
        configurable: true,
        value: (url) => { deny(`sendBeacon ${String(url)}`, { api: 'beacon', url: String(url) }); return false; },
      });
      restore.push(() => { delete nav.sendBeacon; });
    } catch { /* non-configurable in this environment: CSP still applies */ }
  }

  const uninstall = () => { while (restore.length) restore.pop()(); delete target.__pilotNetworkGuard; };
  target.__pilotNetworkGuard = { uninstall };
  return uninstall;
}
