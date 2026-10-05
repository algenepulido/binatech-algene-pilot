import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { STATUS } from '../data/project.js';
import { COL } from '../lib/theme.js';
import { groupThousands, cleanNumber } from '../lib/format.js';

// ============================================================
// Shared primitives — fintech-grade treatment (2026): soft rounded
// surfaces, pill buttons, stat cards with tinted icon chips, dot status
// pills. Every component keeps its exact API; views inherit the new look
// without changes.
// ============================================================

// Money input that shows thousands separators (1,500,000.00) as you type and
// emits the clean numeric string (no commas) to onChange. Drop-in for amount
// fields; parent keeps the raw string and Number()s it on save.
export function MoneyInput({ value, onChange, placeholder = '0.00', className = '', style, maxDecimals = 2, id }) {
  const display = value === '' || value == null ? '' : groupThousands(value);
  const re = new RegExp(`^\\d*(?:\\.\\d{0,${maxDecimals}})?$`);
  function handle(e) {
    const raw = cleanNumber(e.target.value);
    if (raw === '') { onChange(''); return; }
    if (!re.test(raw)) return; // ignore keystrokes that break the format
    onChange(raw);
  }
  return <input type="text" inputMode="decimal" value={display} onChange={handle} placeholder={placeholder} className={className} style={style} id={id} />;
}

// Status colors shared by StatusPill (kept as data so the mapping is testable).
export const STATUS_PILL_COLORS = {
  Approved: { bg: '#dcfce7', fg: '#15803d' }, Rejected: { bg: '#fee2e2', fg: '#b91c1c' },
  Pending: { bg: '#fef3c7', fg: '#b45309' }, 'In Progress': { bg: '#dbeafe', fg: '#1d4ed8' },
  Pass: { bg: '#dcfce7', fg: '#15803d' }, Fail: { bg: '#fee2e2', fg: '#b91c1c' },
  Open: { bg: '#fee2e2', fg: '#b91c1c' }, Closed: { bg: '#dcfce7', fg: '#15803d' },
  // Certified carries the brand's Certified Green (#1C6B52) — its signature
  // moment; Paid (terminal certified/payment state) matches. Brand rule:
  // green = certified-semantic only (generic Approved/Pass stay their own green).
  Paid: { bg: '#e6f0eb', fg: COL.certified }, Certified: { bg: '#e6f0eb', fg: COL.certified }, Draft: { bg: '#f5f5f4', fg: '#57534e' },
  Cleared: { bg: '#dcfce7', fg: '#15803d' }, Reported: { bg: '#dbeafe', fg: '#1d4ed8' },
  'Awaiting IPC': { bg: '#f5f5f4', fg: '#57534e' }, 'Not Issued': { bg: '#f5f5f4', fg: '#57534e' },
  'Approved with Comments': { bg: '#fef3c7', fg: '#b45309' }, 'Under Review': { bg: '#dbeafe', fg: '#1d4ed8' },
  Critical: { bg: '#fecaca', fg: '#991b1b' }, Major: { bg: '#fee2e2', fg: '#b91c1c' }, Minor: { bg: '#fef3c7', fg: '#b45309' },
};

export function StatusPill({ status, lang = 'en', size = 'sm' }) {
  const c = STATUS_PILL_COLORS[status] || { bg: '#f5f5f4', fg: '#57534e' };
  const px = size === 'lg' ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]';
  return (
    <span className={`mono ${px} rounded-full font-medium whitespace-nowrap inline-flex items-center gap-1.5`} style={{ background: c.bg, color: c.fg }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c.fg, opacity: 0.85 }} />
      {status}
    </span>
  );
}

export function StatusBadge({ status, lang = 'en' }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <span className="mono text-[10px] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1" style={{ background: s.bg, color: s.color }}>
      <Icon size={9} />{lang === 'ar' ? s.labelAr : s.label}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 px-4 sm:px-6 py-4 border-b" style={{ borderColor: COL.border, background: COL.surface }}>
      <div className="min-w-0">
        <div className="display text-xl sm:text-[22px] font-bold tracking-tight" style={{ color: COL.text, letterSpacing: '-0.015em' }}>{title}</div>
        {subtitle && <div className="text-[13px] mt-0.5" style={{ color: COL.textDim }}>{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

// Stat card — tinted icon chip, big display number, optional trend pill and
// progress bar. Same API as before (label, value, accent, hint, icon,
// progress, trend).
export function KpiCard({ label, value, accent = COL.text, hint, icon: Icon, progress, trend }) {
  return (
    <div className="rounded-2xl border p-4 relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(16,24,40,0.18)]"
      style={{ background: COL.surface, borderColor: COL.border, boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
      <div className="flex items-start justify-between mb-2.5">
        <div className="text-[11px] font-medium" style={{ color: COL.textDim }}>{label}</div>
        {Icon && (
          <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 -mt-1 -me-1" style={{ background: `${accent === COL.text ? COL.accent : accent}14` }}>
            <Icon size={14} style={{ color: accent === COL.text ? COL.accent : accent }} />
          </span>
        )}
      </div>
      <div className="display text-[22px] font-bold tracking-tight leading-none" style={{ color: accent }}>{value}</div>
      {hint && <div className="text-[11px] mt-1.5" style={{ color: COL.textDim }}>{hint}</div>}
      {trend != null && (
        <span className="inline-flex items-center gap-0.5 text-[10px] mt-2 mono px-1.5 py-0.5 rounded-full font-semibold" style={{ background: trend > 0 ? '#dcfce7' : '#fee2e2', color: trend > 0 ? '#15803d' : '#b91c1c' }}>
          {trend > 0 ? <ArrowUpRight size={10} /> : <ChevronDown size={10} />} {Math.abs(trend)}% vs last
        </span>
      )}
      {progress != null && <div className="absolute bottom-0 left-0 h-1 rounded-e-full" style={{ width: `${progress}%`, background: accent }} />}
    </div>
  );
}

export function Btn({ children, variant = 'secondary', icon: Icon, onClick, size = 'sm', disabled = false }) {
  const sizes = { sm: 'px-3.5 py-1.5 text-xs', md: 'px-5 py-2 text-sm' };
  // Geometry lives in the style object, not in a Tailwind class, for two
  // reasons: it is the one place every CTA in the app inherits from, and a
  // class-based radius is invisible to getComputedStyle, so the control
  // language could never be asserted as behaviour. Restrained rectangles —
  // the approved Field Mode target uses no pill or orb anywhere. Circles stay
  // for semantically circular marks (status dots, count badges, avatars).
  // Touch: 44px minimum, 48px for the larger primary field actions.
  const geometry = { sm: { minHeight: 44, borderRadius: 8 }, md: { minHeight: 48, borderRadius: 8 } };
  const variants = {
    primary: { background: COL.accent, color: '#ffffff', boxShadow: '0 1px 2px rgba(29,78,216,0.30), 0 4px 12px -4px rgba(29,78,216,0.40)' },
    secondary: { background: COL.surface, color: COL.text, border: `1px solid ${COL.borderStrong}`, boxShadow: '0 1px 1px rgba(0,0,0,0.03)' },
    ghost: { background: 'transparent', color: COL.textDim },
    // Destructive/irreversible actions — quiet by default (outline, not a filled
    // red block competing with the primary), turns solid red on hover so it
    // reads as dangerous without shouting. Pair with a confirmDialog.
    danger: { background: COL.surface, color: '#b3261e', border: '1px solid rgba(179,38,30,0.35)' },
  };
  const danger = variant === 'danger';
  return (
    <button onClick={onClick} disabled={disabled}
      className={`${sizes[size]} font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all duration-150 hover:-translate-y-px active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none ${danger ? 'hover:!bg-[#b3261e] hover:!text-white hover:!border-[#b3261e]' : 'hover:brightness-[1.04]'}`}
      style={{ ...geometry[size], ...variants[variant] }}>
      {Icon && <Icon size={size === 'md' ? 15 : 13} />}
      {children}
    </button>
  );
}

export function MiniStat({ label, value, hint, warn }) {
  return (
    <div className="rounded-xl p-2.5" style={{ background: warn ? '#fef9c3' : COL.bg, border: `1px solid ${COL.border}` }}>
      <div className="text-[9.5px] font-medium tracking-wide" style={{ color: COL.textDim }}>{label.toUpperCase()}</div>
      <div className="mono text-sm font-bold mt-0.5" style={{ color: warn ? '#a16207' : COL.text }}>{value}</div>
      {hint && <div className="mono text-[9px] mt-0.5" style={{ color: COL.textDim }}>{hint}</div>}
    </div>
  );
}

export function Empty({ label }) { return <div className="py-10 text-center text-[11px]" style={{ color: COL.textMute }}>{label}</div>; }
