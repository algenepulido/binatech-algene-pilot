// ============================================================
// PILOT STARTER ONLY — evaluator controls (TEST BEHAVIOUR, not product UI).
//
// A small panel outside the React root. It shows that everything is
// synthetic, lets an evaluator choose how the synthetic services answer
// (normal / failure / hold), release held operations, see the call log, and
// sign the synthetic reviewer out and back in. It never changes application
// code or fixtures directly. Open it with the thin "STARTER" tab on
// the left edge or Alt+Shift+P.
// ============================================================
import { SCENARIO_KEYS } from './scenarios.js';
import { restartAsSyntheticReviewer } from './browserState.js';

const LABELS = {
  invoiceReads: 'Invoice reads',
  commercialReads: 'Commercial Control reads',
  invoiceWrites: 'Invoice Save / Create',
  progressSubmission: 'Progress-report test service',
};

const CONTROL_STYLE = { background: '#FFFFFF', color: '#111827', border: '1px solid #9CA3AF', borderRadius: '6px', font: '12px/1.2 ui-monospace, Menlo, monospace' };
const BUTTON_STYLE = { ...CONTROL_STYLE, minHeight: '32px', padding: '4px 10px', cursor: 'pointer' };
// Pointer presses on the panel must not move keyboard focus out of the application (e.g. out of an open
// dialog), so focus-return behaviour can still be checked while using these controls.
const keepFocus = (e) => e.preventDefault();

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'style') Object.assign(node.style, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}

export function mountControls(runtime, doc = document) {
  if (doc.getElementById('pilot-starter-controls')) return;
  const { log, scenarios } = runtime;
  const panel = el('aside', {
    id: 'pilot-starter-controls', 'aria-label': 'Pilot starter test controls', 'data-pilot-controls': '',
    style: { position: 'fixed', left: '30px', top: '50%', transform: 'translateY(-50%)', zIndex: 2147483000, width: 'min(360px, calc(100vw - 40px))', maxHeight: '80vh', overflow: 'auto', font: '12px/1.4 ui-monospace, Menlo, monospace', background: '#111827', color: '#F9FAFB', borderRadius: '8px', boxShadow: '0 6px 24px rgba(0,0,0,.35)', padding: '10px' },
  });
  const toggle = el('button', {
    type: 'button', 'aria-expanded': 'false', 'aria-controls': 'pilot-starter-controls',
    // A thin tab on the left edge, vertically centred, so it never covers the app's own corner actions
    // (drawer/modal footers, the phone tab bar, the header).
    style: { position: 'fixed', left: '0', top: '50%', transform: 'translateY(-50%)', zIndex: 2147483001, writingMode: 'vertical-rl', font: '700 8px/1 ui-monospace, Menlo, monospace', letterSpacing: '.06em', padding: '8px 1px', width: '12px', minHeight: '96px', background: '#7C2D12', color: '#FFF', border: 0, borderRadius: '0 4px 4px 0', opacity: '.9', overflow: 'hidden' },
    'aria-label': 'Pilot starter test controls (synthetic data)',
    title: 'Pilot starter test controls (Alt+Shift+P)',
    text: 'STARTER',
  });
  const body = el('div');
  panel.append(
    el('div', { style: { fontWeight: 700, marginBottom: '4px' }, text: 'PILOT STARTER — TEST CONTROLS' }),
    el('div', { style: { color: '#FCD34D', marginBottom: '8px' }, text: 'All data is synthetic. No backend, no real sign-in, nothing leaves this page.' }),
    body,
  );
  panel.hidden = true;
  const setOpen = (open) => { panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); toggle.style.display = open ? 'none' : ''; if (open) render(); };
  toggle.addEventListener('mousedown', keepFocus);
  toggle.addEventListener('click', () => setOpen(true));
  doc.addEventListener('keydown', (e) => { if (e.altKey && e.shiftKey && (e.key === 'P' || e.key === 'p')) setOpen(panel.hidden); });

  function render() {
    if (panel.hidden) return;
    body.replaceChildren();
    for (const key of Object.values(SCENARIO_KEYS)) {
      const id = `pilot-scenario-${key}`;
      const select = el('select', { id, 'data-pilot-scenario': key, style: { ...CONTROL_STYLE, width: '100%', minHeight: '32px', marginBottom: '6px' }, onchange: (e) => scenarios.set(key, e.target.value) },
        scenarios.allowed(key).map((v) => { const o = el('option', { value: v, text: v }); if (scenarios.get(key) === v) o.selected = true; return o; }));
      body.append(el('label', { for: id, style: { display: 'block' }, text: LABELS[key] }), select);
    }
    const held = log.held();
    body.append(el('div', { style: { marginTop: '6px', fontWeight: 700 }, text: `Held operations (${held.length})` }));
    for (const h of held) {
      const outcomes = h.meta?.outcomes || ['release'];
      body.append(el('div', { style: { margin: '4px 0' } }, [
        el('span', { text: `#${h.id} ${h.label} ` }),
        ...outcomes.map((o) => el('button', { type: 'button', 'data-pilot-release': `${h.id}:${o}`, style: { ...BUTTON_STYLE, margin: '2px' }, onmousedown: keepFocus, onclick: () => log.release(h.id, o), text: o })),
      ]));
    }
    const counts = {};
    for (const e of log.entries()) counts[e.kind] = (counts[e.kind] || 0) + 1;
    body.append(el('div', { 'data-pilot-counts': '', style: { marginTop: '8px' }, text: ['read', 'write', 'submission', 'unsupported', 'network-blocked'].map((k) => `${k} ${counts[k] || 0}`).join(' · ') }));
    const recent = log.entries().slice(-12).reverse();
    body.append(el('ol', { reversed: '', style: { paddingInlineStart: '18px', margin: '6px 0', maxHeight: '180px', overflow: 'auto' } },
      recent.map((e) => el('li', { text: summarise(e) }))));
    body.append(el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' } }, [
      el('button', { type: 'button', style: BUTTON_STYLE, onmousedown: keepFocus, onclick: () => restartAsSyntheticReviewer(window), text: 'Restart signed in (reloads, resets fixtures)' }),
      el('button', { type: 'button', style: BUTTON_STYLE, onmousedown: keepFocus, onclick: () => { scenarios.reset(); render(); }, text: 'Reset scenarios' }),
      el('button', { type: 'button', style: BUTTON_STYLE, onmousedown: keepFocus, onclick: () => setOpen(false), text: 'Hide' }),
    ]));
  }
  log.subscribe(render);
  scenarios.subscribe(render);
  doc.body.append(toggle, panel);
}

function summarise(e) {
  switch (e.kind) {
    case 'read': return `read ${e.table} [${(e.filters || []).join(' ')}]${e.scenario && e.scenario !== 'normal' ? ` → ${e.scenario}` : ''}`;
    case 'write': return `write ${e.table}.${e.op} id=${e.id ?? '—'} → ${e.outcome ?? 'pending'}`;
    case 'submission': return `submission ${e.requestId ?? '—'} → ${e.outcome ?? 'pending'}`;
    case 'unsupported': return `UNSUPPORTED ${e.description ?? ''}`.slice(0, 160);
    case 'network-blocked': return `NETWORK BLOCKED ${e.what ?? ''}`.slice(0, 160);
    default: return `${e.kind} ${e.method ?? ''}`;
  }
}
