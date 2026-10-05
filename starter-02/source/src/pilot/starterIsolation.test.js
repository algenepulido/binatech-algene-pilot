// ============================================================
// PILOT STARTER — isolation smoke tests. These protect the starter itself
// (synthetic boundary, network denial, Content-Security-Policy, bootstrap
// order). They say nothing about the pilot assignment.
// ============================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createPilotRuntime } from './runtime.js';
import { StarterUnsupportedOperation } from './adapters/strictSupabase.js';
import { installNetworkGuard, StarterNetworkBlocked } from './networkGuard.js';
import { starterCsp } from '../../vite.pilot-security.js';
import { INVOICE_IDS, PROJECT_P, PROJECT_Q } from './fixtures/data.js';
import { supabase as appClient, isSupabaseConfigured } from '../lib/supabase.js';

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const fresh = () => createPilotRuntime({ storage: null });

describe('the application boundary (src/lib/supabase.js)', () => {
  it('exports the synthetic client as configured, and no shipped file imports the real SDK', () => {
    expect(isSupabaseConfigured).toBe(true);
    expect(appClient).toBe(globalThis.__pilotStarter.client);
    const offenders = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(m?jsx?)$/.test(e.name) && !e.name.includes('.test.') && /from\s+['"]@supabase\/supabase-js['"]/.test(fs.readFileSync(p, 'utf8'))) offenders.push(p);
      }
    };
    walk(path.join(ROOT, 'src'));
    expect(offenders).toEqual([]);
  });
});

describe('strict synthetic client', () => {
  it('rejects (never returns []) for a table outside the policy, and logs it', async () => {
    const rt = fresh();
    await expect(rt.client.from('purchase_requests').select('*').eq('project_id', PROJECT_P)).rejects.toBeInstanceOf(StarterUnsupportedOperation);
    expect(rt.log.ofKind('unsupported').at(-1).description).toMatch(/purchase_requests/);
  });

  it('rejects unsupported operators, unknown fields, row reads of count-only tables, storage, functions and rpc', async () => {
    const rt = fresh();
    await expect(rt.client.from('invoices').select('*').ilike('invoice_number', '%A%')).rejects.toBeInstanceOf(StarterUnsupportedOperation);
    await expect(rt.client.from('invoices').select('invoice_number, notes').eq('project_id', PROJECT_P)).rejects.toBeInstanceOf(StarterUnsupportedOperation);
    await expect(rt.client.from('snags').select('*').eq('project_id', PROJECT_P)).rejects.toBeInstanceOf(StarterUnsupportedOperation);
    await expect(rt.client.storage.from('attachments').upload('x', new Blob(['x']))).rejects.toBeInstanceOf(StarterUnsupportedOperation);
    await expect(rt.client.functions.invoke('extract-invoice', { body: {} })).rejects.toBeInstanceOf(StarterUnsupportedOperation);
    await expect(rt.client.rpc('record_project_id', {})).rejects.toBeInstanceOf(StarterUnsupportedOperation);
    expect(() => rt.client.channel('x')).toThrow(StarterUnsupportedOperation);
    for (const e of rt.log.ofKind('unsupported')) expect(e.description, 'no text the app could mistake for a missing table/column').not.toMatch(/\bcolumn\b|relation|does not exist/i);
  });

  it('serves head counts for count-only badge tables without rows', async () => {
    const rt = fresh();
    const res = await rt.client.from('snags').select('*', { count: 'exact', head: true }).eq('project_id', PROJECT_P).in('status', ['open']);
    expect(res).toMatchObject({ data: null, count: 0, error: null });
  });

  it('orders like PostgREST: issue_date desc with nulls last, then created_at desc — Project Q never leaks into P', async () => {
    const rt = fresh();
    const { data } = await rt.client.from('invoices').select('*').eq('project_id', PROJECT_P)
      .order('issue_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
    expect(data.map((r) => r.id)).toEqual([INVOICE_IDS.B, INVOICE_IDS.A, INVOICE_IDS.Z]);
    expect(data.some((r) => r.project_id === PROJECT_Q)).toBe(false);
  });

  it('answers invoice_wir_links with the simulated unavailable-table response (42P01) — not supported by this starter', async () => {
    const rt = fresh();
    const res = await rt.client.from('invoice_wir_links').select('wir_id').eq('invoice_id', INVOICE_IDS.A);
    expect(res.error).toMatchObject({ code: '42P01' });
    expect(res.data).toBeNull();
  });

  it('synthetic auth is a labelled test session and refuses real credential operations', async () => {
    const rt = fresh();
    const { data } = await rt.client.auth.getSession();
    expect(data.session.access_token).toMatch(/NOT-A-CREDENTIAL/);
    await expect(rt.client.auth.signInWithPassword({ email: 'x@example.invalid', password: 'x' })).rejects.toBeInstanceOf(StarterUnsupportedOperation);
  });
});

describe('invoice write controllers (in-memory, inspectable)', () => {
  const update = (rt, id, payload) => rt.client.from('invoices').update(payload).eq('id', id).select().single();

  it('success: logs the exact id and payload, changes only that fixture row and returns it', async () => {
    const rt = fresh();
    const res = await update(rt, INVOICE_IDS.A, { amount: 1 });
    expect(res.error).toBeNull();
    expect(res.data).toMatchObject({ id: INVOICE_IDS.A, amount: 1 });
    expect(rt.store.invoices.find((r) => r.id === INVOICE_IDS.B).amount).toBe(13700);
    expect(rt.log.ofKind('write').at(-1)).toMatchObject({ op: 'update', id: INVOICE_IDS.A, payload: { amount: 1 }, outcome: 'success' });
  });

  it('failure: returns an error and changes nothing', async () => {
    const rt = fresh();
    rt.scenarios.set('invoiceWrites', 'failure');
    const res = await update(rt, INVOICE_IDS.A, { amount: 2 });
    expect(res.data).toBeNull();
    expect(res.error.code).toBe('PILOT_WRITE_FAILURE');
    expect(res.error.message).not.toMatch(/column|element_guid|wir_number/i);
    expect(rt.store.invoices.find((r) => r.id === INVOICE_IDS.A).amount).toBe(48250.5);
  });

  it('hold: stays pending until an evaluator releases it, in either direction', async () => {
    const rt = fresh();
    rt.scenarios.set('invoiceWrites', 'hold');
    let settled = false;
    const pending = update(rt, INVOICE_IDS.B, { amount: 3 }).then((r) => { settled = true; return r; });
    await new Promise((r) => setTimeout(r, 10));
    expect(settled).toBe(false);
    expect(rt.log.held()).toHaveLength(1);
    rt.log.release(rt.log.held()[0].id, 'failure');
    expect((await pending).error.code).toBe('PILOT_WRITE_FAILURE');
  });

  it('enforces the baseline-compatible CHECK vocabulary', async () => {
    const rt = fresh();
    const res = await update(rt, INVOICE_IDS.A, { zatca_status: 'Draft' });
    expect(res.error.code).toBe('23514');
  });
});

describe('network guard', () => {
  let uninstall = null;
  afterEach(() => { uninstall?.(); uninstall = null; });

  it('refuses cross-origin fetch/XHR/WebSocket/beacon and logs them; same-origin GET is allowed', async () => {
    const rt = fresh();
    const target = {
      location: new URL('http://127.0.0.1:5173/#/app/invoices'),
      fetch: vi.fn(async () => 'ok'),
      XMLHttpRequest: class { open() { return 'opened'; } },
      WebSocket: class { constructor(url) { this.url = url; } },
      navigator: { sendBeacon: () => true },
    };
    target.location.host = '127.0.0.1:5173';
    uninstall = installNetworkGuard(target, rt.log);
    await expect(target.fetch('https://pilot-starter.invalid/functions/v1/extract-invoice', { method: 'POST' })).rejects.toBeInstanceOf(StarterNetworkBlocked);
    await expect(target.fetch('/src/main.jsx')).resolves.toBe('ok');
    await expect(target.fetch('/anything', { method: 'POST' })).rejects.toBeInstanceOf(StarterNetworkBlocked);
    expect(() => new target.XMLHttpRequest().open('PUT', 'https://bucket.example.invalid/x')).toThrow(StarterNetworkBlocked);
    expect(() => new target.WebSocket('ws://evil.example.invalid/')).toThrow(StarterNetworkBlocked);
    expect(new target.WebSocket('ws://127.0.0.1:5173/?token=x').url).toContain('127.0.0.1:5173');
    expect(target.navigator.sendBeacon('https://analytics.example.invalid/')).toBe(false);
    expect(rt.log.ofKind('network-blocked').length).toBe(5);
  });
});

describe('Content-Security-Policy (vite.pilot-security.js)', () => {
  it('allows WebSockets only to the exact serving host, never a bare scheme', () => {
    const dev = starterCsp({ webSocketHost: '192.168.1.20:5173' });
    expect(dev).toMatch(/connect-src 'self' ws:\/\/192\.168\.1\.20:5173(;|$)/);
    expect(dev).not.toMatch(/\bws:(\s|;|$)|\bwss:(\s|;|$)/);
    expect(starterCsp()).toMatch(/connect-src 'self'(;|$)/);
    expect(starterCsp({ webSocketHost: 'evil.example ws:' })).toMatch(/connect-src 'self'(;|$)/);
    for (const csp of [dev, starterCsp()]) {
      expect(csp).toMatch(/default-src 'self'/);
      expect(csp).toMatch(/worker-src 'self' blob:/);
      expect(csp).not.toMatch(/https?:/);
    }
  });

  it('index.html carries no broad policy of its own and loads the starter entry', () => {
    const html = read('index.html');
    expect(html).not.toMatch(/http-equiv="Content-Security-Policy"/);
    expect(html).toMatch(/src="\/src\/pilot\/main\.jsx"/);
    expect(html).not.toMatch(/https?:\/\//);
  });
});

describe('evaluator controls panel', () => {
  it('is legible and never takes keyboard focus from the application on pointer use', async () => {
    const { mountControls } = await import('./controls.js');
    const rt = fresh();
    mountControls(rt, document);
    const toggle = document.querySelector('[aria-controls="pilot-starter-controls"]');
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    toggle.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    toggle.click();
    const panel = document.getElementById('pilot-starter-controls');
    expect(panel.hidden).toBe(false);
    for (const select of panel.querySelectorAll('select')) {
      expect(select.style.color).not.toBe('');
      expect(select.style.background).not.toBe('');
    }
    for (const button of panel.querySelectorAll('button')) {
      const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      button.dispatchEvent(e);
      expect(e.defaultPrevented, button.textContent).toBe(true);
    }
    expect(toggle.getAttribute('aria-label')).toMatch(/test controls/i);
    expect(parseInt(toggle.style.width, 10)).toBeLessThanOrEqual(12);
  });
});

describe('bootstrap order', () => {
  it('installs isolation before the application is imported', () => {
    const main = read('src/pilot/main.jsx');
    const staticImports = [...main.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    expect(staticImports).toEqual(['./runtime.js', './networkGuard.js', './browserState.js', './controls.js']);
    const guardAt = main.indexOf('installNetworkGuard(window');
    const appAt = main.indexOf("import('./mountApp.jsx')");
    expect(guardAt).toBeGreaterThan(-1);
    expect(appAt).toBeGreaterThan(guardAt);
    const runtime = read('src/pilot/runtime.js');
    expect(runtime).not.toMatch(/from '\.\.\/(lib|api|views|components)\//);
  });
});
