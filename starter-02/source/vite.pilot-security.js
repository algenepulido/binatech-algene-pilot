// ============================================================
// PILOT STARTER ONLY — Content-Security-Policy for the starter.
//
// The page may load from and talk to its own local server only. There is no
// broad "any WebSocket" permission:
//   • vite dev     → CSP response header on every response; WebSockets only to
//                    the exact host:port that served the page (Vite's hot reload)
//   • vite preview → CSP response header, self only (no hot reload)
//   • vite build   → the same self-only policy as a <meta> tag in dist/index.html
// src/pilot/networkGuard.js is the in-page layer behind this one.
// 'unsafe-inline' is needed for Vite's development preamble and the app's
// inline styles; it adds no remote origin.
// ============================================================

const BASE = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
];

// host or host:port only (IPv4, IPv6 in brackets, or a hostname); anything else gets no WebSocket permission.
const SAFE_HOST = /^(\[[0-9a-fA-F:]+\]|[A-Za-z0-9.-]+)(:\d{1,5})?$/;

export function starterCsp({ webSocketHost = null, secure = false } = {}) {
  const connect = ["'self'"];
  if (webSocketHost && SAFE_HOST.test(webSocketHost)) connect.push(`${secure ? 'wss' : 'ws'}://${webSocketHost}`);
  return [...BASE, `connect-src ${connect.join(' ')}`].join('; ');
}

export function pilotStarterSecurity() {
  return {
    name: 'pilot-starter-security',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const secure = Boolean(server.config.server.https);
        res.setHeader('Content-Security-Policy', starterCsp({ webSocketHost: req.headers.host || null, secure }));
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Content-Security-Policy', starterCsp());
        next();
      });
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (ctx.server) return html; // dev uses the response header (exact host for hot reload)
        return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${starterCsp()}" />`);
      },
    },
  };
}
