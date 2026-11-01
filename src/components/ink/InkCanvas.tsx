import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import type { InkPage, InkStroke, InkTool, StandaloneNote } from '../../types/daymark';
import { addStroke, collapseInkGesture, decodePoints, encodePoints, eraseArea, eraseStrokes, PAGE_HEIGHT, PAGE_WIDTH, visibleStrokes } from '../../ink/inkModel';
import { drawPage, drawStroke, touchesStroke, type InkPoint, type PointCache } from '../../ink/inkRender';
import { classifyPointer } from '../../ink/pointerPolicy';
import { InkPageView } from './InkPageView';
import { paperStyle, sizeInkSurface, startFingerScroll } from './inkSurface';

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
  const editor = useRef<InkCanvasHandle>(null);
  useImperativeHandle(ref, () => ({ undo: () => editor.current?.undo(), redo: () => editor.current?.redo() }), []);
  return props.readOnly ? <InkPageView page={props.page} paper={props.paper} /> : <WritableInkCanvas {...props} ref={editor} />;
});

const WritableInkCanvas = forwardRef<InkCanvasHandle, InkCanvasProps>(function WritableInkCanvas(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
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
    if (!ctx || !liveCtx) return () => { canvas.width = canvas.height = liveCanvas.width = liveCanvas.height = 0; };
    const actualCtx = liveCtx;
    let page = latest.current.page;
    let live: Live | null = null;
    let frame = 0;
    let rect = canvas.getBoundingClientRect();
    let scale = 1;
    const cache: PointCache = new Map();
    let rendered: InkStroke[] = [];
    let touch: ReturnType<typeof startFingerScroll> | null = null;
    type Bounds = { x: number; y: number; width: number; height: number };
    let decoration: Bounds | null = null;
    let preview: InkPage | null = null;
    let previewBase: InkPage | null = null;
    let previewProcessed = 0;
    let previewCache: PointCache = new Map();
    let previewDirty = false;
    const undo: Change[] = [], redo: Change[] = [];
    const historyChanged = () => latest.current.onHistoryChange?.(undo.length > 0, redo.length > 0);
    const clearDecoration = () => {
      if (!decoration) return;
      const bounds = decoration; decoration = null;
      actualCtx.save(); actualCtx.beginPath(); actualCtx.rect(bounds.x, bounds.y, bounds.width, bounds.height); actualCtx.clip();
      actualCtx.clearRect(bounds.x, bounds.y, bounds.width, bounds.height);
      // Restore only actual segments intersecting the old tail, never the entire stroke.
      if (live && live.tool !== 'eraser') {
        const margin = live.width * 0.75;
        for (let i = 0; i < live.points.length; i++) {
          const a = live.points[Math.max(0, i - 1)], b = live.points[i];
          if (Math.max(a.x, b.x) + margin < bounds.x || Math.min(a.x, b.x) - margin > bounds.x + bounds.width
            || Math.max(a.y, b.y) + margin < bounds.y || Math.min(a.y, b.y) - margin > bounds.y + bounds.height) continue;
          drawStroke(actualCtx, i ? [a, b] : [b], { ...live, tool: live.tool }, 1);
        }
      }
      actualCtx.restore();
    };
    const paint = () => {
      frame = 0;
      clearDecoration();
      if (live?.tool === 'eraser') {
        updatePreview();
        if (previewDirty && preview) {
          ctx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
          drawPage(ctx, preview, previewCache);
          previewDirty = false;
        }
        const center = live.points.at(-1)!;
        const radius = Math.max(1, live.width / 2), margin = 2 / scale;
        actualCtx.globalAlpha = 1; actualCtx.strokeStyle = '#78716c'; actualCtx.lineWidth = 1 / scale;
        actualCtx.beginPath(); actualCtx.arc(center.x, center.y, radius, 0, Math.PI * 2); actualCtx.stroke();
        decoration = { x: center.x - radius - margin, y: center.y - radius - margin, width: (radius + margin) * 2, height: (radius + margin) * 2 };
      } else if (live && live.predictions.length) {
        // Only the predicted tail is cleared/redrawn in rAF; actual ink is synchronous.
        const points = [live.points.at(-1)!, ...live.predictions];
        drawStroke(actualCtx, points, { ...live, tool: live.tool }, 1);
        const margin = live.width * 0.75 + 2 / scale;
        const xs = points.map(p => p.x), ys = points.map(p => p.y);
        decoration = { x: Math.min(...xs) - margin, y: Math.min(...ys) - margin, width: Math.max(...xs) - Math.min(...xs) + margin * 2, height: Math.max(...ys) - Math.min(...ys) + margin * 2 };
      }
      // Separate diagnostic from synchronous inkdraw: this is the next rAF, not scanout.
      if (import.meta.env.DEV) canvas.dispatchEvent(new CustomEvent('inkframe', { detail: performance.now() }));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
    const rebuild = (force = false) => {
      const visible = visibleStrokes(page);
      const append = !force && rendered.length <= visible.length && rendered.every((s, index) => s === visible[index]);
      if (!append) ctx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
      drawPage(ctx, { ...page, strokes: append ? visible.slice(rendered.length) : visible, removed: [] }, cache);
      rendered = visible;
      const ids = new Set(page.strokes.map(s => s.id));
      for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id);
      schedule();
    };
    const resize = () => {
      rect = canvas.getBoundingClientRect();
      scale = Math.max(1, rect.width) / PAGE_WIDTH;
      const resized = [canvas, liveCanvas].map(layer => sizeInkSurface(layer, rect.width)).some(Boolean);
      canvas.parentElement!.style.backgroundSize = `${32 * scale}px ${32 * scale}px`;
      if (!resized) return;
      decoration = null;
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
      touch = null;
      if (!live) return;
      updatePreview();
      const stroke = live; live = null;
      if (canvas.hasPointerCapture?.(stroke.id)) canvas.releasePointerCapture(stroke.id);
      const now = new Date().toISOString();
      let next = page;
      if (stroke.tool !== 'eraser') {
        const ink: InkStroke = { id: crypto.randomUUID(), tool: stroke.tool, color: stroke.color, width: stroke.width, points: encodePoints(stroke.points), createdAt: now };
        next = addStroke(page, ink, now);
      } else {
        next = collapseInkGesture(page, preview!);
        // Reuse decoded preview pieces when they become committed strokes.
        for (const [id, points] of previewCache) cache.set(id, points);
      }
      record(next);
      actualCtx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
      decoration = null;
      preview = null; previewBase = null; previewCache.clear();
      schedule();
    };
    const down = (e: PointerEvent) => {
      const p = latest.current;
      const action = classifyPointer({ penActive: !!live, allowMouse: p.allowMouse }, e).action;
      if (action === 'scroll' && !touch) {
        touch = startFingerScroll(canvas, e);
        e.preventDefault(); canvas.setPointerCapture?.(e.pointerId); return;
      }
      if (live || action !== 'draw') return;
      touch = null;
      e.preventDefault(); rect = canvas.getBoundingClientRect(); scale = Math.max(1, rect.width) / PAGE_WIDTH;
      live = { id: e.pointerId, points: [point(e)], predictions: [], tool: p.tool, color: p.color, width: p.width, eraserMode: p.eraserMode ?? 'area' };
      // Composite live highlighters once, avoiding darker overlaps between segments.
      liveCanvas.style.opacity = p.tool === 'highlighter' ? '0.35' : '1';
      liveCanvas.style.zIndex = p.tool === 'highlighter' ? '0' : '2';
      if (live.tool !== 'eraser') drawStroke(actualCtx, live.points, { ...live, tool: live.tool }, 1);
      canvas.setPointerCapture?.(e.pointerId); schedule();
    };
    const move = (e: PointerEvent) => {
      if (touch?.id === e.pointerId) {
        if (classifyPointer({ penActive: !!live }, e).action !== 'scroll') { touch = null; return; }
        e.preventDefault(); touch.move(e); return;
      }
      if (!live || live.id !== e.pointerId) return;
      e.preventDefault();
      clearDecoration();
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
      if (touch?.id === e.pointerId) { touch = null; return; }
      if (!live || live.id !== e.pointerId) return;
      live.points.push(point(e)); finish();
    };
    const cancel = (e: PointerEvent) => { if (touch?.id === e.pointerId) touch = null; if (live?.id === e.pointerId) finish(); };
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
      canvas.width = canvas.height = liveCanvas.width = liveCanvas.height = 0;
      cache.clear(); previewCache.clear();
    };
  }, []);

  const overlay = { position: 'absolute' as const, inset: 0, width: '100%', height: '100%', pointerEvents: 'none' as const };
  return <div style={{ position: 'relative', isolation: 'isolate', ...paperStyle(props.paper) }}>
    <canvas ref={canvasRef} aria-label="Handwritten page" role="img" style={{ position: 'relative', zIndex: 1, display: 'block', width: '100%', aspectRatio: `${PAGE_WIDTH} / ${PAGE_HEIGHT}`, touchAction: 'none' }} />
    <canvas ref={liveRef} data-ink-live aria-hidden="true" style={overlay} />
  </div>;
});
