// ============================================================
// Wordmark — the Bina·Tech typeset mark (Logo System v1.0): Familjen
// Grotesk 700, −0.02em, with the enlarged Certified-Green middot centered
// on x-height. Self-contained inline styles so it renders identically in
// the public site, the auth surfaces and the app shell. The mark stays
// Latin in RTL contexts; where the ground fights the green, use onInk
// (mono paper mark — the dot is never recolored, per the misuse rules).
// ============================================================
export function Wordmark({ size, onInk = false, className = '', style = {} }) {
  const ink = onInk ? '#FAFAF7' : '#16211F';
  const dot = onInk ? '#FAFAF7' : '#1C6B52';
  return (
    <span translate="no" className={className} style={{
      fontFamily: "'Familjen Grotesk','IBM Plex Sans',sans-serif",
      fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1,
      color: ink, ...(size ? { fontSize: size } : {}), ...style,
    }}>
      Bina<span aria-hidden="true" style={{ color: dot, fontSize: '1.05em', lineHeight: 0, margin: '0 0.06em', position: 'relative', top: '-0.028em' }}>•</span>Tech
    </span>
  );
}

// Brand descriptor (Applications v2 text-layer system: one role per string).
export const WORDMARK_DESCRIPTOR = {
  en: 'Construction payment software — GCC',
  ar: 'برمجيات مدفوعات الإنشاءات — الخليج',
};
