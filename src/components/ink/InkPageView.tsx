import { useLayoutEffect, useRef } from 'react';
import type { InkPage, StandaloneNote } from '../../types/daymark';
import { PAGE_HEIGHT, PAGE_WIDTH } from '../../ink/inkModel';
import { drawPage, type PointCache } from '../../ink/inkRender';
import { paperStyle, sizeInkSurface } from './inkSurface';

export function InkPageView({ page, paper }: { page: InkPage; paper: StandaloneNote['paper'] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cache = useRef<PointCache>(new Map());
  useLayoutEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const draw = () => {
      const width = canvas.getBoundingClientRect().width;
      sizeInkSurface(canvas, width);
      canvas.style.backgroundSize = `${32 * width / PAGE_WIDTH}px ${32 * width / PAGE_WIDTH}px`;
      ctx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
      drawPage(ctx, page, cache.current);
    };
    const ids = new Set(page.strokes.map(s => s.id));
    for (const id of cache.current.keys()) if (!ids.has(id)) cache.current.delete(id);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(draw);
    observer?.observe(canvas); window.addEventListener('resize', draw); draw();
    return () => { observer?.disconnect(); window.removeEventListener('resize', draw); };
  }, [page]);
  useLayoutEffect(() => {
    const canvas = ref.current!;
    return () => { canvas.width = 0; canvas.height = 0; cache.current.clear(); };
  }, []);
  return <canvas ref={ref} aria-label="Handwritten page" role="img" style={{ display: 'block', width: '100%', aspectRatio: `${PAGE_WIDTH} / ${PAGE_HEIGHT}`, touchAction: 'pan-y', ...paperStyle(paper) }} />;
}
