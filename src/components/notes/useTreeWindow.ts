import { useEffect, useState, type RefObject } from 'react';

/** Disjoint focused row keeps DOM bounded even when the user scrolls far from focus. */
export function treeWindow(count: number, rowHeight: number, scrollTop: number, viewportHeight: number, focusedIndex: number) {
  const virtual = count > 400;
  const start = virtual ? Math.max(0, Math.floor(scrollTop / rowHeight) - 10) : 0;
  const end = virtual ? Math.min(count, Math.ceil((scrollTop + viewportHeight) / rowHeight) + 10) : count;
  const indices = Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i);
  if (virtual && focusedIndex >= 0 && focusedIndex < count && !indices.includes(focusedIndex)) indices.push(focusedIndex);
  indices.sort((a, b) => a - b);
  return { virtual, indices, totalHeight: count * rowHeight };
}

export function useTreeWindow(count: number, rowHeight: number, ref: RefObject<HTMLElement | null>, focusedIndex: number) {
  const [viewport, setViewport] = useState({ top: 0, height: 640 });
  const measure = () => {
    if (ref.current) setViewport({ top: ref.current.scrollTop, height: ref.current.clientHeight || 640 });
  };
  useEffect(() => {
    measure();
    if (!ref.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure); observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  const scrollToIndex = (index: number) => {
    const el = ref.current;
    if (!el || index < 0 || index >= count) return;
    const height = el.clientHeight || 640;
    const top = index * rowHeight;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + rowHeight > el.scrollTop + height) el.scrollTop = top + rowHeight - height;
    measure();
  };
  return { ...treeWindow(count, rowHeight, viewport.top, viewport.height, focusedIndex), onScroll: measure, scrollToIndex };
}
