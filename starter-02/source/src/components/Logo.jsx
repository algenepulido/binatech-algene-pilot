// ============================================================
// Logo — the BinaTech brand mark (Logo System v1.0, mark 2C "the chain"):
// the compressed payment chain in an ink rounded tile, final dot always
// Certified Green. Pure inline SVG so it stays crisp at any size
// (16px favicon → 56px splash). Matches public/favicon.svg.
//   <Logo size={32} />                 // mark only
//   <Logo size={32} withWordmark />    // mark + Bina·Tech + descriptor
// ============================================================
import { Wordmark, WORDMARK_DESCRIPTOR } from './Wordmark.jsx';

export const LOGO_TAGLINE = WORDMARK_DESCRIPTOR.en;

export function LogoMark({ size = 32, className = '', animated = false }) {
  return (
    <svg viewBox="0 0 56 56" width={size} height={size} role="img" aria-label="BinaTech" className={`flex-shrink-0 ${animated ? 'logo-animated' : ''} ${className}`}>
      <rect x="2" y="2" width="52" height="52" rx="13" fill="#16211F" />
      <circle cx="13.5" cy="28" r="4.4" fill="#FAFAF7" className="logo-blk-bot" />
      <circle cx="23.5" cy="28" r="4.4" fill="#FAFAF7" className="logo-blk-mid" />
      <circle cx="33.5" cy="28" r="4.4" fill="#FAFAF7" className="logo-blk-top" />
      <circle cx="43.5" cy="28" r="4.4" fill="#1C6B52" />
    </svg>
  );
}

// `dark` flips the wordmark for ink/dark chrome (additive — default unchanged).
export function Logo({ size = 32, withWordmark = false, tagline = LOGO_TAGLINE, className = '', markClassName = '', dark = false }) {
  if (!withWordmark) return <LogoMark size={size} className={className} />;
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} className={markClassName} />
      <span className="flex flex-col items-start text-start leading-none">
        <Wordmark size={16} onInk={dark} />
        {tagline ? <span className="mono text-[9px] tracking-wide mt-1 leading-none hidden sm:block" style={{ color: dark ? 'rgba(250,250,247,0.55)' : '#43544F' }}>{tagline}</span> : null}
      </span>
    </span>
  );
}
