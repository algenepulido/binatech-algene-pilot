import { Home, ListTodo, Search, Menu, Plus } from 'lucide-react';
import { FIELD } from '../lib/fieldTokens.js';
import { phoneTabFor } from './MobileNav.jsx';

export function FieldRail({ t = {}, route, onNavigate, onCapture, canCapture = true }) {
  const items = [
    { route: 'quick', label: t.mNavHome || 'Home', icon: Home },
    { route: 'work', label: t.mNavWork || 'Work', icon: ListTodo },
    { capture: true, label: t.mNavCapture || 'Capture', icon: Plus },
    { route: 'scan', label: t.mNavFind || 'Find', icon: Search },
    { route: 'more', label: t.mNavMore || 'More', icon: Menu },
  ];
  return <nav data-field-rail className="flex-none flex flex-col" style={{ width: 104, background: FIELD.surface, borderInlineEnd: `1px solid ${FIELD.hair}`, padding: '22px 0', gap: 4 }}>
    {items.map((item) => { const Icon = item.icon; const active = !!item.route && phoneTabFor(route) === item.route; const disabled = item.capture && !canCapture; return <button key={item.label} disabled={disabled} onClick={() => item.capture ? onCapture?.() : onNavigate?.(item.route)} aria-current={active ? 'page' : undefined} className="flex flex-col items-center justify-center gap-1.5" style={{ minHeight: 70, borderRadius: 0, color: active ? FIELD.ink : FIELD.faint, opacity: disabled ? .4 : 1 }}><span className="flex items-center justify-center" style={item.capture ? { width: 38, height: 38, borderRadius: FIELD.rControl, background: canCapture ? FIELD.ink : FIELD.hair, color: FIELD.onDark } : undefined}><Icon size={item.capture ? 21 : 22} /></span><span style={{ fontSize: 11, fontWeight: active || item.capture ? 600 : 450 }}>{item.label}</span></button>; })}
  </nav>;
}
