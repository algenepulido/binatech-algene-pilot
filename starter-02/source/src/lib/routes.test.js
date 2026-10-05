import { describe, it, expect, beforeEach } from 'vitest';
import {
  AUTH_ROUTES, DEFAULT_PROTECTED_ROUTE, PROTECTED_PREFIX, PROTECTED_ROUTE_IDS, PUBLIC_ROUTES,
  classifyRoute, clearIntendedRoute, isKnownRoute, parseRoute, protectedHash,
  rememberIntendedRoute, takeIntendedRoute,
} from './routes.js';

beforeEach(() => clearIntendedRoute());

describe('routes — every route in the app is classified (no unknowns)', () => {
  it('classifies all 10 public routes as public', () => {
    expect(PUBLIC_ROUTES).toHaveLength(10);
    PUBLIC_ROUTES.forEach((h) => expect(classifyRoute(h)).toBe('public'));
  });

  it('classifies both auth routes as auth', () => {
    expect(AUTH_ROUTES).toEqual(['#/sign-in', '#/accept-invite']);
    AUTH_ROUTES.forEach((h) => expect(classifyRoute(h)).toBe('auth'));
  });

  it('classifies all 39 protected route families as protected', () => {
    expect(PROTECTED_ROUTE_IDS).toHaveLength(39);
    PROTECTED_ROUTE_IDS.forEach((id) => {
      const hash = protectedHash(id);
      expect(classifyRoute(hash)).toBe('protected');
      expect(parseRoute(hash).routeId).toBe(id);
    });
  });

  it('covers the named protected families explicitly', () => {
    ['dashboard', 'wirs', 'qs', 'ipcs', 'certification-control-room', 'certqueue', 'evidence-packs',
      'reports', 'settings', 'team', 'ipa-reconciliation', 'recovery-queue', 'model', 'more']
      .forEach((id) => {
        expect(PROTECTED_ROUTE_IDS).toContain(id);
        expect(classifyRoute(protectedHash(id))).toBe('protected');
      });
  });

  it('knows every route it ships, and nothing is left unclassified', () => {
    [...PUBLIC_ROUTES, ...AUTH_ROUTES, ...PROTECTED_ROUTE_IDS.map((i) => protectedHash(i))]
      .forEach((h) => {
        expect(isKnownRoute(h)).toBe(true);
        expect(['public', 'auth', 'protected']).toContain(classifyRoute(h));
      });
  });

  it('never lets a protected namespace fall through to public', () => {
    // An unrecognised app route must stay PROTECTED (never leak to marketing)
    // and resolve to the default page.
    const r = parseRoute(`${PROTECTED_PREFIX}not-a-real-page`);
    expect(r.kind).toBe('protected');
    expect(r.routeId).toBe(DEFAULT_PROTECTED_ROUTE);
    expect(isKnownRoute(`${PROTECTED_PREFIX}not-a-real-page`)).toBe(false);
  });

  it('resolves an unrecognised non-app hash to the public home', () => {
    ['#/nonsense', '#/wirs', '', '#', 'garbage'].forEach((h) => {
      const r = parseRoute(h);
      expect(r.kind).toBe('public');
      expect(r.path).toBe('#/');
    });
  });

  it('does not collide: no protected hash equals a public or auth route', () => {
    const taken = new Set([...PUBLIC_ROUTES, ...AUTH_ROUTES]);
    PROTECTED_ROUTE_IDS.forEach((id) => expect(taken.has(protectedHash(id))).toBe(false));
  });
});

describe('routes — deep links with query strings and record identifiers', () => {
  it('preserves a query string and a record identifier', () => {
    const r = parseRoute('#/app/wirs?id=WIR-2481&tab=evidence');
    expect(r.kind).toBe('protected');
    expect(r.routeId).toBe('wirs');
    expect(r.query).toBe('id=WIR-2481&tab=evidence');
  });

  it('builds a hash with a query', () => {
    expect(protectedHash('ipcs', 'period=IPC-07')).toBe('#/app/ipcs?period=IPC-07');
    expect(protectedHash('ipcs', '?period=IPC-07')).toBe('#/app/ipcs?period=IPC-07');
  });

  it('falls back to the default page for an unknown id', () => {
    expect(protectedHash('nope')).toBe(`${PROTECTED_PREFIX}${DEFAULT_PROTECTED_ROUTE}`);
  });

  it('tolerates a trailing slash', () => {
    expect(parseRoute('#/app/wirs/').routeId).toBe('wirs');
  });
});

describe('routes — intended destination (memory only, never authorization)', () => {
  it('remembers and restores a protected deep link exactly once', () => {
    rememberIntendedRoute('#/app/ipcs?period=IPC-07');
    expect(takeIntendedRoute()).toBe('#/app/ipcs?period=IPC-07');
    expect(takeIntendedRoute()).toBeNull();          // consumed
  });

  it('ignores public and auth routes', () => {
    rememberIntendedRoute('#/sign-in');
    rememberIntendedRoute('#/how-it-works');
    expect(takeIntendedRoute()).toBeNull();
  });

  it('rejects every external or scheme-bearing redirect target', () => {
    [
      'https://evil.example/steal',
      'http://evil.example/steal',
      '//evil.example/steal',
      'javascript:alert(1)',
      '#/sign-in?next=https://evil.example/steal',
    ].forEach((target) => rememberIntendedRoute(target));
    expect(takeIntendedRoute()).toBeNull();
  });

  it('does not bother remembering the bare default page', () => {
    rememberIntendedRoute(protectedHash(DEFAULT_PROTECTED_ROUTE));
    expect(takeIntendedRoute()).toBeNull();
  });

  it('can be cleared (used on sign-out)', () => {
    rememberIntendedRoute('#/app/team');
    clearIntendedRoute();
    expect(takeIntendedRoute()).toBeNull();
  });
});

describe('routes — no dead navigation targets in the app', () => {
  it('every setRoute()/onNavigate() literal in src/ resolves to a real protected route', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      return /\.(jsx?|)$/.test(e.name) && /\.(js|jsx)$/.test(e.name) && !e.name.includes('.test.') ? [p] : [];
    });
    const offenders = [];
    walk('src').forEach((file) => {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/(?:setRoute|onNavigate)\(\s*'([a-z0-9-]+)'/g)) {
        if (!PROTECTED_ROUTE_IDS.includes(m[1])) offenders.push(`${file} → '${m[1]}'`);
      }
    });
    // A navigation that points at a non-existent route silently dead-ends.
    expect(offenders).toEqual([]);
  });
});
