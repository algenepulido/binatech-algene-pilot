export const fmt = (n) => new Intl.NumberFormat('en-US').format(Math.round(n || 0));
export const fmtSAR = (n) => `SAR ${fmt(n)}`;

// Scale-aware money label for KPI cards and summaries. Tables keep full
// precision; cards read at a glance: "SAR 0", "SAR 30,468", "SAR 1.28M",
// "SAR 30.47M", "SAR 305M". Never "SAR 0K" and never a bare dash for a
// genuine zero — a CFO must be able to tell "zero" from "didn't load".
export function fmtMoney(v) {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const m = n / 1_000_000;
    return `SAR ${abs >= 100_000_000 ? fmt(m) : m.toFixed(2)}M`;
  }
  return `SAR ${fmt(n)}`;
}

// Group an integer/decimal string with thousands commas, preserving an
// optional decimal part and a leading minus. Used by money inputs.
export function groupThousands(value) {
  if (value === '' || value == null) return '';
  const s = String(value);
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const [int, dec] = body.split('.');
  const grouped = (int || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + (dec != null ? `${grouped}.${dec}` : grouped);
}

// Strip grouping commas / spaces back to a clean numeric string.
export const cleanNumber = (s) => String(s ?? '').replace(/[,\s]/g, '');

// ── Commercial table formatting ─────────────────────────────
// QS work is comparative: figures are read down a column, so quantities need
// one consistent decimal treatment and money needs full precision (never the
// abbreviated "1.28M" form used on summary cards). A true zero prints "0", an
// absent value prints an em dash — a commercial manager must be able to tell
// "measured as nothing" from "we don't hold this".

/** Quantity with up to 2dp, trailing zeros trimmed. 96 → "96", 96.5 → "96.5". */
export function fmtQty(n) {
  if (n == null || n === '' || isNaN(Number(n))) return '—';
  const v = Math.round(Number(n) * 100) / 100;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(v);
}

/** Full-precision money for table cells: 49920 → "49,920". No scaling. */
export function fmtAmount(n) {
  if (n == null || n === '' || isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(Number(n)));
}

/** Rate keeps 2dp because unit rates are frequently fractional. */
export function fmtRate(n) {
  if (n == null || n === '' || isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n));
}
