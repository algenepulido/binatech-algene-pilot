// Tiny matchMedia hook — true on phone-sized viewports. Drives the simplified
// mobile "Quick Access" experience without affecting desktop.
import { useState, useEffect } from 'react';

export function useIsMobile(maxWidth = 767) {
  const query = `(max-width:${maxWidth}px)`;
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const fn = () => setMobile(m.matches);
    fn();
    m.addEventListener?.('change', fn);
    return () => m.removeEventListener?.('change', fn);
  }, [query]);
  return mobile;
}
