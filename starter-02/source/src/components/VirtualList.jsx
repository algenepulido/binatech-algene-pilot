// ============================================================
// VirtualList — dependency-free fixed-row-height windowing. Renders only the
// rows visible in the scroll viewport (+ overscan), so lists stay smooth with
// tens of thousands of rows. Rows must be exactly `rowHeight` tall.
//   <VirtualList items={rows} rowHeight={36} height={360}
//     renderRow={(item, index) => <div style={{height:36}}>…</div>} />
// ============================================================
import { useState, useCallback, useRef, useEffect } from 'react';

export function VirtualList({ items, rowHeight = 36, height = 360, overscan = 8, renderRow, className = '', style = {}, empty = null }) {
  const [scrollTop, setScrollTop] = useState(0);
  const ref = useRef(null);
  const onScroll = useCallback((e) => setScrollTop(e.currentTarget.scrollTop), []);
  // Reset scroll to top when the underlying list identity changes a lot (filter).
  useEffect(() => { if (ref.current && ref.current.scrollTop > items.length * rowHeight) { ref.current.scrollTop = 0; setScrollTop(0); } }, [items.length, rowHeight]);

  const total = items.length;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visible = Math.ceil(height / rowHeight) + overscan * 2;
  const end = Math.min(total, start + visible);
  const slice = items.slice(start, end);

  return (
    <div ref={ref} onScroll={onScroll} className={`overflow-y-auto scrollbar ${className}`} style={{ height, ...style }}>
      {total === 0 ? empty : (
        <div style={{ height: total * rowHeight, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, insetInlineStart: 0, insetInlineEnd: 0, transform: `translateY(${start * rowHeight}px)` }}>
            {slice.map((it, i) => renderRow(it, start + i))}
          </div>
        </div>
      )}
    </div>
  );
}
