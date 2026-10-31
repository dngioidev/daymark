import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import type { InkPage, InkStroke, InkTool, StandaloneNote } from '../../types/daymark';
import { addStroke, decodePoints, encodePoints, eraseArea, eraseStrokes, PAGE_HEIGHT, PAGE_WIDTH, visibleStrokes } from '../../ink/inkModel';
import { drawPage, drawStroke, touchesStroke, type InkPoint, type PointCache } from '../../ink/inkRender';
import { classifyPointer } from '../../ink/pointerPolicy';

export type EraserMode = 'area' | 'stroke';
export interface InkCanvasProps {
  page: InkPage;
  paper: StandaloneNote['paper'];
  tool: InkTool | 'eraser';
  color: string;
  width: number;
  eraserMode?: EraserMode;
  onChange: (page: InkPage) => void;
  readOnly?: boolean;
  allowMouse?: boolean;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
}
export interface InkCanvasHandle { undo(): void; redo(): void }
type Change = { before: InkPage; after: InkPage };
type Live = { id: number; points: InkPoint[]; predictions: InkPoint[]; tool: InkCanvasProps['tool']; color: string; width: number; eraserMode: EraserMode };

export const InkCanvas = forwardRef<InkCanvasHandle, InkCanvasProps>(function InkCanvas(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const tailRef = useRef<HTMLCanvasElement>(null);
  const penRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  const api = useRef<InkCanvasHandle>({ undo() {}, redo() {} });
  const synchronize = useRef<() => void>(() => {});
  useImperativeHandle(ref, () => ({ undo: () => api.current.undo(), redo: () => api.current.redo() }), []);
  useLayoutEffect(() => { latest.current = props; synchronize.current(); });

  useLayoutEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d');
    const liveCanvas = liveRef.current!;
    let liveCtx: CanvasRenderingContext2D | null = null;
    try { liveCtx = liveCanvas.getContext('2d', { desynchronized: true, alpha: true }); } catch { /* Older WebViews can reject context options. */ }
    liveCtx ??= liveCanvas.getContext('2d');
    const tailCanvas = tailRef.current!, penCanvas = penRef.current!;
    const tailCtx = tailCanvas.getContext('2d'), penCtx = penCanvas.getContext('2d');
    if (!ctx || !liveCtx || !tailCtx || !penCtx) return;
    const actualCtx = liveCtx;
    const layers = [document.createElement('canvas'), document.createElement('canvas')];
    const contexts = layers.map(layer => layer.getContext('2d')!);
    let page = latest.current.page;
    let live: Live | null = null;
    let frame = 0;
    let rect = canvas.getBoundingClientRect();
    let scale = 1;
    const cache: PointCache = new Map();
    const rendered: InkStroke[][] = [[], []];
    let preview: InkPage | null = null;
    let previewBase: InkPage | null = null;
    let previewProcessed = 0;
    let previewCache: PointCache = new Map();
    let previewDirty = false;
    const undo: Change[] = [], redo: Change[] = [];
    const historyChanged = () => latest.current.onHistoryChange?.(undo.length > 0, redo.length > 0);
    const present = () => {
      ctx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
      penCtx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
      ctx.drawImage(layers[0], 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
      (live?.tool === 'highlighter' ? penCtx : ctx).drawImage(layers[1], 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    };
    const paint = () => {
      frame = 0;
      tailCtx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
      if (live?.tool === 'eraser') {
        updatePreview();
        if (previewDirty && preview) {
          ctx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
          penCtx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
          drawPage(ctx, preview, previewCache);
          previewDirty = false;
        }
        const center = live.points.at(-1)!;
        tailCtx.globalAlpha = 1; tailCtx.strokeStyle = '#78716c'; tailCtx.lineWidth = 1 / scale;
        tailCtx.beginPath(); tailCtx.arc(center.x, center.y, Math.max(1, live.width / 2), 0, Math.PI * 2); tailCtx.stroke();
      } else if (live && live.predictions.length) {
        // Only the predicted tail is cleared/redrawn in rAF; actual ink is synchronous.
        drawStroke(tailCtx, [live.points.at(-1)!, ...live.predictions], { ...live, tool: live.tool }, 1);
      }
      // Separate diagnostic from synchronous inkdraw: this is the next rAF, not scanout.
      if (import.meta.env.DEV) canvas.dispatchEvent(new CustomEvent('inkframe', { detail: performance.now() }));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
    const rebuild = (force = false) => {
      const visible = visibleStrokes(page);
      contexts.forEach((context, i) => {
        const strokes = visible.filter(s => s.tool === (i === 0 ? 'highlighter' : 'pen'));
        const previous = rendered[i];
        const append = !force && previous.length <= strokes.length && previous.every((s, index) => s === strokes[index]);
        if (!append) context.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
        drawPage(context, { ...page, strokes: append ? strokes.slice(previous.length) : strokes, removed: [] }, cache);
        rendered[i] = strokes;
      });
      const ids = new Set(page.strokes.map(s => s.id));
      for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id);
      present();
      schedule();
    };
    const resize = () => {
      rect = canvas.getBoundingClientRect();
      scale = Math.max(1, rect.width) / PAGE_WIDTH;
      const dpr = window.devicePixelRatio || 1;
      for (const layer of [canvas, liveCanvas, tailCanvas, penCanvas, ...layers]) {
        layer.width = Math.max(1, Math.round(rect.width * dpr));
        layer.height = Math.max(1, Math.round(rect.width * PAGE_HEIGHT / PAGE_WIDTH * dpr));
        layer.getContext('2d')!.setTransform(layer.width / PAGE_WIDTH, 0, 0, layer.height / PAGE_HEIGHT, 0, 0);
      }
      canvas.style.backgroundSize = `${32 * scale}px ${32 * scale}px`;
      rebuild(true);
      // Resizing clears all backing pixels; replay actual segments only in this case.
      if (live && live.tool !== 'eraser') {
        drawStroke(actualCtx, live.points.slice(0, 1), { ...live, tool: live.tool }, 1);
        for (let i = 1; i < live.points.length; i++) drawStroke(actualCtx, live.points.slice(i - 1, i + 1), { ...live, tool: live.tool }, 1);
      }
      if (live?.tool === 'eraser') previewDirty = true;
    };
    const publish = (next: InkPage) => { page = next; rebuild(); latest.current.onChange(next); };
    const record = (next: InkPage) => {
      if (next === page) return;
      undo.push({ before: page, after: next }); redo.length = 0;
      publish(next); historyChanged();
    };
    // Undo is an inverse edit, retaining removal records for sync. Restored ink gets new ids.
    const reverse = (from: Change[], to: Change[]) => {
      if (latest.current.readOnly || live) return;
      const change = from.pop(); if (!change) return;
      const now = new Date().toISOString();
      const before = visibleStrokes(change.before), after = visibleStrokes(change.after);
      const beforeIds = new Set(before.map(s => s.id)), afterIds = new Set(after.map(s => s.id));
      let next = eraseStrokes(page, after.filter(s => !beforeIds.has(s.id)).map(s => s.id), now);
      for (const stroke of before) if (!afterIds.has(stroke.id)) next = addStroke(next, { ...stroke, id: crypto.randomUUID() }, now);
      to.push({ before: page, after: next }); publish(next); historyChanged();
    };
    api.current = { undo: () => reverse(undo, redo), redo: () => reverse(redo, undo) };
    const point = (e: Pick<PointerEvent, 'clientX' | 'clientY' | 'pressure'>): InkPoint => ({
      x: Math.max(0, Math.min(PAGE_WIDTH, (e.clientX - rect.left) / scale)),
      y: Math.max(0, Math.min(PAGE_HEIGHT, (e.clientY - rect.top) / scale)),
      p: Number.isFinite(e.pressure) ? e.pressure : 0.5,
    });
    const updatePreview = () => {
      if (!live || live.tool !== 'eraser') return;
      if (previewBase !== page) {
        previewBase = page; preview = page; previewProcessed = 0;
        previewCache = new Map(cache); previewDirty = true;
      }
      const radius = Math.max(1, live.width / 2), now = new Date().toISOString();
      const sweep: InkPoint[] = [];
      for (let i = previewProcessed; i < live.points.length; i++) {
        const a = live.points[Math.max(0, i - 1)], b = live.points[i];
        const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / radius));
        for (let j = 1; j <= steps; j++) sweep.push({ x: a.x + (b.x - a.x) * j / steps, y: a.y + (b.y - a.y) * j / steps, p: 0.5 });
      }
      previewProcessed = live.points.length;
      if (!sweep.length) return;
      let next = preview!;
      if (live.eraserMode === 'area') {
        for (const center of sweep) next = eraseArea(next, center, radius, () => crypto.randomUUID(), now);
      } else {
        const ids = visibleStrokes(next).filter(s => {
          let points = previewCache.get(s.id);
          if (!points) { points = decodePoints(s.points); previewCache.set(s.id, points); }
          return sweep.some(center => touchesStroke(points!, center, radius + s.width / 2));
        }).map(s => s.id);
        if (ids.length) next = eraseStrokes(next, ids, now);
      }
      if (next !== preview) { preview = next; previewDirty = true; }
    };
    const finish = () => {
      if (!live) return;
      updatePreview();
      const stroke = live; live = null;
      canvas.style.touchAction = 'pan-y';
      if (canvas.hasPointerCapture?.(stroke.id)) canvas.releasePointerCapture(stroke.id);
      const now = new Date().toISOString();
      let next = page;
      if (stroke.tool !== 'eraser') {
        const ink: InkStroke = { id: crypto.randomUUID(), tool: stroke.tool, color: stroke.color, width: stroke.width, points: encodePoints(stroke.points), createdAt: now };
        next = addStroke(page, ink, now);
      } else {
        next = preview!;
        // Reuse decoded preview pieces when they become committed strokes.
        for (const [id, points] of previewCache) cache.set(id, points);
      }
      record(next); present();
      actualCtx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
      tailCtx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
      preview = null; previewBase = null; previewCache.clear();
      schedule();
    };
    const down = (e: PointerEvent) => {
      const p = latest.current;
      if (p.readOnly || live || classifyPointer({ penActive: false, allowMouse: p.allowMouse }, e).action !== 'draw') return;
      e.preventDefault(); rect = canvas.getBoundingClientRect(); scale = Math.max(1, rect.width) / PAGE_WIDTH;
      live = { id: e.pointerId, points: [point(e)], predictions: [], tool: p.tool, color: p.color, width: p.width, eraserMode: p.eraserMode ?? 'area' };
      // Composite live highlighters once, avoiding darker overlaps between segments.
      liveCanvas.style.opacity = tailCanvas.style.opacity = p.tool === 'highlighter' ? '0.35' : '1';
      present();
      if (live.tool !== 'eraser') drawStroke(actualCtx, live.points, { ...live, tool: live.tool }, 1);
      canvas.style.touchAction = 'none';
      canvas.setPointerCapture?.(e.pointerId); schedule();
    };
    const move = (e: PointerEvent) => {
      if (!live || live.id !== e.pointerId) return;
      e.preventDefault();
      const samples = e.getCoalescedEvents?.();
      for (const sample of samples?.length ? samples : [e]) {
        const previous = live.points.at(-1)!, next = point(sample);
        live.points.push(next);
        if (live.tool !== 'eraser') drawStroke(actualCtx, [previous, next], { ...live, tool: live.tool }, 1);
      }
      // Signal only after this event's actual segments have been drawn, never at receipt.
      if (import.meta.env.DEV && live.tool !== 'eraser') canvas.dispatchEvent(new CustomEvent('inkdraw', { detail: performance.now() }));
      live.predictions = (e.getPredictedEvents?.() ?? []).map(point);
      schedule();
    };
    const up = (e: PointerEvent) => {
      if (!live || live.id !== e.pointerId) return;
      live.points.push(point(e)); finish();
    };
    const cancel = (e: PointerEvent) => { if (live?.id === e.pointerId) finish(); };
    synchronize.current = () => {
      const incoming = latest.current.page;
      if (incoming !== page) {
        if (incoming.noteId !== page.noteId || incoming.page !== page.page) {
          finish(); undo.length = 0; redo.length = 0; cache.clear(); historyChanged();
        }
        const changed = incoming.strokes !== page.strokes || incoming.removed !== page.removed;
        page = incoming; if (changed) rebuild();
      }
      if (latest.current.readOnly) finish();
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', cancel);
    canvas.addEventListener('lostpointercapture', cancel);
    window.addEventListener('pagehide', finish);
    window.addEventListener('resize', resize);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(canvas); resize();
    return () => {
      finish(); if (frame) cancelAnimationFrame(frame);
      observer?.disconnect(); window.removeEventListener('resize', resize); window.removeEventListener('pagehide', finish);
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel); canvas.removeEventListener('lostpointercapture', cancel);
      synchronize.current = () => {};
    };
  }, []);

  const line = 'linear-gradient(to bottom, #d6d3d1 1px, transparent 1px)';
  const overlay = { position: 'absolute' as const, inset: 0, width: '100%', height: '100%', pointerEvents: 'none' as const };
  return <div style={{ position: 'relative' }}>
    <canvas ref={canvasRef} aria-label="Handwritten page" role="img" style={{ display: 'block', width: '100%', aspectRatio: `${PAGE_WIDTH} / ${PAGE_HEIGHT}`, touchAction: 'pan-y', backgroundColor: '#fafaf9', backgroundImage: props.paper === 'grid' ? `${line}, linear-gradient(to right, #d6d3d1 1px, transparent 1px)` : props.paper === 'lined' ? line : undefined }} />
    <canvas ref={liveRef} data-ink-live aria-hidden="true" style={overlay} />
    <canvas ref={tailRef} data-ink-tail aria-hidden="true" style={overlay} />
    <canvas ref={penRef} aria-hidden="true" style={overlay} />
  </div>;
});
