import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { InkPage, InkStroke, InkTool, StandaloneNote } from '../../types/daymark';
import { addStroke, collapseInkGesture, decodePoints, encodePoints, eraseArea, eraseStrokes, PAGE_HEIGHT, PAGE_WIDTH, visibleStrokes } from '../../ink/inkModel';
import { drawPage, drawStroke, insertedStrokes, redrawInserted, touchesStroke, type InkPoint, type PointCache } from '../../ink/inkRender';
import { classifyPointer, isPenEraserButton } from '../../ink/pointerPolicy';
import { isStylusButtonHeld } from '../../ink/stylusButton';
import { copyStrokes, deleteStrokes, lassoSelect, pasteStrokes, recolorStrokes, selectionBounds, transformStrokes, type Loop } from '../../ink/inkSelection';
import { createTextBox, replaceTextBox, textBoxAnchor, visibleTextBoxes } from '../../ink/inkText';
import { isHeld, recognizeShape } from '../../ink/shapeRecognition';
import { InkSelectionLayer } from './InkSelectionLayer';
import { InkTextLayer, type TextDraft } from './InkTextLayer';
import { InkPageView } from './InkPageView';
import { paperStyle, sizeInkSurface, startFingerScroll } from './inkSurface';

export type EraserMode = 'area' | 'stroke';
export type InkCanvasTool = InkTool | 'eraser' | 'select' | 'text';
let inkClipboard: InkStroke[] = [];
const clipboardListeners = new Set<() => void>();
// Single-point text anchors (and horizontal/vertical ink) still need a draggable interior.
function canvasSelectionBounds(page: InkPage, ids: string[]) {
  const bounds = selectionBounds(page, ids);
  if (!bounds) return null;
  if (bounds.minX === bounds.maxX) { bounds.minX -= 12; bounds.maxX += 12; }
  if (bounds.minY === bounds.maxY) { bounds.minY -= 12; bounds.maxY += 12; }
  return bounds;
}
export interface InkCanvasProps {
  page: InkPage;
  paper: StandaloneNote['paper'];
  tool: InkCanvasTool;
  textColor?: string;
  onSelectionChange?: (ids: string[]) => void;
  onClipboardChange?: (hasClip: boolean) => void;
  color: string;
  width: number;
  eraserMode?: EraserMode;
  onChange: (page: InkPage) => void;
  readOnly?: boolean;
  allowMouse?: boolean;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
}
export interface InkCanvasHandle {
  undo(): void; redo(): void;
  deleteSelection(): void; recolorSelection(color: string): void; copySelection(): void;
  cutSelection(): void; paste(): void; duplicateSelection(): void;
}
const emptyHandle: InkCanvasHandle = { undo() {}, redo() {}, deleteSelection() {}, recolorSelection() {}, copySelection() {}, cutSelection() {}, paste() {}, duplicateSelection() {} };
const forwardHandle = (get: () => InkCanvasHandle | null): InkCanvasHandle => ({
  undo: () => get()?.undo(), redo: () => get()?.redo(), deleteSelection: () => get()?.deleteSelection(),
  recolorSelection: color => get()?.recolorSelection(color), copySelection: () => get()?.copySelection(),
  cutSelection: () => get()?.cutSelection(), paste: () => get()?.paste(), duplicateSelection: () => get()?.duplicateSelection(),
});
type Change = { before: InkPage; after: InkPage };
type Live = { id: number; points: InkPoint[]; predictions: InkPoint[]; tool: InkTool | 'eraser'; color: string; width: number; eraserMode: EraserMode;
  temporaryErase: boolean; shape?: InkPoint[]; shapeLength?: number;
  /** Pen/highlighter style for drawStroke, built once per stroke instead of per segment. */
  style: { tool: InkTool; color: string; width: number };
  /** Sample time of each point (parallel to `points`) and the samples already taken (see `take`). */
  times: number[]; seen: Set<string> };
type Sample = Pick<PointerEvent, 'clientX' | 'clientY' | 'pressure' | 'timeStamp'>;
/** Benchmarks (scripts/ink-app-bench.mjs) may set this to time each synchronous segment draw. */
const drawProbe = () => (globalThis as { __daymarkInkDrawn?: () => void }).__daymarkInkDrawn?.();

export const InkCanvas = forwardRef<InkCanvasHandle, InkCanvasProps>(function InkCanvas(props, ref) {
  const editor = useRef<InkCanvasHandle>(null);
  useLayoutEffect(() => {
    const notify = () => props.onClipboardChange?.(inkClipboard.length > 0);
    clipboardListeners.add(notify); notify();
    return () => { clipboardListeners.delete(notify); };
  }, [props.onClipboardChange]);
  useImperativeHandle(ref, () => forwardHandle(() => editor.current), []);
  return props.readOnly ? <InkPageView page={props.page} paper={props.paper} /> : <WritableInkCanvas {...props} ref={editor} />;
});

const WritableInkCanvas = forwardRef<InkCanvasHandle, InkCanvasProps>(function WritableInkCanvas(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  const api = useRef<InkCanvasHandle>(emptyHandle);
  const [view, setView] = useState<{ page: InkPage; ids: string[]; loop: Loop; scale: number }>({ page: props.page, ids: [], loop: [], scale: 1 });
  const [draft, setDraft] = useState<TextDraft | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [hasClip, setHasClip] = useState(inkClipboard.length > 0);
  useLayoutEffect(() => {
    const notify = () => setHasClip(inkClipboard.length > 0);
    clipboardListeners.add(notify); notify();
    return () => { clipboardListeners.delete(notify); };
  }, []);
  const textApi = useRef({ edit: (_id: string) => {}, commit: (_draft: TextDraft, _text: string) => {}, type: (_draft: TextDraft, _text: string) => {}, resize: (_draft: TextDraft, _width: number) => {} });
  const synchronize = useRef<() => void>(() => {});
  useImperativeHandle(ref, () => forwardHandle(() => api.current), []);
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
    let lastIncoming = page;
    let live: Live | null = null;
    let frame = 0;
    let rect = canvas.getBoundingClientRect();
    let scale = 1;
    let holdTimer: ReturnType<typeof setInterval> | undefined;
    let ids: string[] = [];
    let draftBox: TextDraft | null = null;
    let draftText = '';
    let draftCreated = 0;
    let draftSeq = 0;
    // Saves the open box. Android often never blurs it (a pen tap on the canvas keeps focus, and
    // leaving full screen or turning the page unmounts it), so every exit path comes through here.
    const saveDraft = (text = textarea.current?.value ?? draftText) => {
      const box = draftBox; if (!box) return;
      draftBox = null;
      const now = new Date().toISOString();
      if (box.id) {
        const old = visibleTextBoxes(page).find(s => s.id === box.id);
        if (text !== box.text || box.boxWidth !== old?.boxWidth) record(replaceTextBox(page, box.id, { text, boxWidth: box.boxWidth }, uuid(), now));
      } else if (text) record(addStroke(page, createTextBox(text, box, box.color, uuid(), now, { fontSize: box.fontSize, boxWidth: box.boxWidth }), now));
    };
    const openDraft = (box: TextDraft) => {
      saveDraft();
      draftBox = { ...box, seq: ++draftSeq }; draftText = box.text; draftCreated = Date.now();
      flushSync(() => setDraft(draftBox));
      textarea.current?.focus();
    };
    type Gesture = { id: number; start: InkPoint; end: InkPoint; loop: Loop; mode: 'lasso' | 'move' | 'resize' | 'text'; origin?: InkPoint; moved?: boolean };
    let gesture: Gesture | null = null;
    const refresh = (loop: Loop = []) => setView({ page, ids: [...ids], loop: [...loop], scale });
    const select = (next: string[]) => { ids = next; latest.current.onSelectionChange?.([...ids]); refresh(); };
    const uuid = () => crypto.randomUUID();
    const cache: PointCache = new Map();
    let rendered: InkStroke[] = [];
    let touch: (ReturnType<typeof startFingerScroll> & { tap?: { x: number; y: number; moved: boolean } }) | null = null;
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
          drawStroke(actualCtx, i ? [a, b] : [b], live.style, 1);
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
        drawStroke(actualCtx, points, live.style, 1);
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
      // A new highlighter sorts under existing pen ink: repaint just its area, not the page.
      const inserted = append || force ? null : insertedStrokes(rendered, visible);
      if (inserted) redrawInserted(ctx, visible, inserted, cache, canvas.width / PAGE_WIDTH, canvas.height / PAGE_HEIGHT);
      else {
        if (!append) ctx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
        drawPage(ctx, { ...page, strokes: append ? visible.slice(rendered.length) : visible, removed: [] }, cache);
      }
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
      refresh();
      if (!resized) return;
      decoration = null;
      rebuild(true);
      // Resizing clears all backing pixels; replay actual segments only in this case.
      if (live && live.tool !== 'eraser') {
        drawStroke(actualCtx, live.points.slice(0, 1), live.style, 1);
        for (let i = 1; i < live.points.length; i++) drawStroke(actualCtx, live.points.slice(i - 1, i + 1), live.style, 1);
      }
      if (live?.tool === 'eraser') previewDirty = true;
    };
    const publish = (next: InkPage) => { page = next; rebuild(); refresh(); latest.current.onChange(next); };
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
      const before = [...visibleStrokes(change.before), ...visibleTextBoxes(change.before)];
      const after = [...visibleStrokes(change.after), ...visibleTextBoxes(change.after)];
      const beforeIds = new Set(before.map(s => s.id)), afterIds = new Set(after.map(s => s.id));
      let next = eraseStrokes(page, after.filter(s => !beforeIds.has(s.id)).map(s => s.id), now);
      const restored = new Map<string, InkStroke>();
      for (const stroke of before) if (!afterIds.has(stroke.id)) {
        const replacement = { ...stroke, id: uuid() }; restored.set(stroke.id, replacement);
        next = addStroke(next, replacement, now);
      }
      // Older undo/redo entries must follow restored ids without removing sync tombstones.
      const remap = (snapshot: InkPage): InkPage => ({ ...snapshot,
        strokes: snapshot.strokes.map(s => restored.get(s.id) ?? s),
        removed: snapshot.removed.map(id => restored.get(id)?.id ?? id),
      });
      if (restored.size) for (const entry of [...from, ...to]) {
        entry.before = remap(entry.before); entry.after = remap(entry.after);
      }
      to.push({ before: page, after: next }); publish(next); select([]); historyChanged();
    };
    const applySelection = (result: { page: InkPage; ids: string[] }) => { record(result.page); select(result.ids); };
    const removeSelection = () => { record(deleteStrokes(page, ids, new Date().toISOString())); select([]); };
    const copySelection = () => {
      inkClipboard = copyStrokes(page, ids);
      clipboardListeners.forEach(notify => notify());
    };
    api.current = {
      undo: () => reverse(undo, redo), redo: () => reverse(redo, undo), deleteSelection: removeSelection,
      recolorSelection: color => applySelection(recolorStrokes(page, ids, color, uuid, new Date().toISOString())),
      copySelection,
      cutSelection: () => { copySelection(); removeSelection(); },
      paste: () => applySelection(pasteStrokes(page, inkClipboard, { dx: 20, dy: 20 }, uuid, new Date().toISOString())),
      duplicateSelection: () => applySelection(pasteStrokes(page, copyStrokes(page, ids), { dx: 20, dy: 20 }, uuid, new Date().toISOString())),
    };
    textApi.current = {
      edit: id => {
        const box = visibleTextBoxes(page).find(s => s.id === id); if (!box) return;
        openDraft({ id, ...textBoxAnchor(box), text: box.text!, color: box.color, fontSize: box.fontSize, boxWidth: box.boxWidth });
      },
      commit: (box, text) => {
        // A blur from a box that was already saved and replaced must not touch the new one.
        if (!draftBox || box.seq !== draftBox.seq) return;
        if (!text && Date.now() - draftCreated < 400) { textarea.current?.focus(); return; }
        saveDraft(text); setDraft(null);
      },
      type: (box, text) => { if (box.seq === draftBox?.seq) draftText = text; },
      resize: (box, boxWidth) => {
        if (!draftBox || box.seq !== draftBox.seq || boxWidth === draftBox.boxWidth) return;
        draftBox = { ...draftBox, boxWidth }; setDraft(draftBox);
      },
    };
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
      if (holdTimer !== undefined) { clearInterval(holdTimer); holdTimer = undefined; }
      if (!live) return;
      updatePreview();
      const stroke = live; live = null;
      canvas.removeEventListener('pointerrawupdate', raw);
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
      if (stroke.shape && stroke.shapeLength === stroke.points.length) {
        const freehand = next.strokes.at(-1)!;
        record(addStroke(eraseStrokes(page, [freehand.id], now), { ...freehand, id: uuid(), points: encodePoints(stroke.shape) }, now));
      }
      actualCtx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
      decoration = null;
      preview = null; previewBase = null; previewCache.clear();
      schedule();
    };
    // The Android app forwards the S Pen button separately because its WebView drops it from pointer
    // events, and Chrome may report a pen with its button held as a mouse, so both count while held.
    const forwardedErase = (e: PointerEvent) => isStylusButtonHeld() && (e.pointerType === 'pen' || e.pointerType === 'mouse');
    const penErases = (e: PointerEvent) => (e.pointerType === 'pen' && isPenEraserButton(e)) || forwardedErase(e);
    const down = (e: PointerEvent) => {
      const p = latest.current;
      const classified = classifyPointer({ penActive: !!live, allowMouse: p.allowMouse || p.tool === 'text' }, e).action;
      const action = classified !== 'scroll' && penErases(e) ? 'erase' : classified;
      if (action === 'scroll' && !touch) {
        touch = startFingerScroll(canvas, e);
        if (p.tool === 'text' && !gesture) {
          rect = canvas.getBoundingClientRect(); scale = Math.max(1, rect.width) / PAGE_WIDTH;
          touch.tap = { x: e.clientX, y: e.clientY, moved: false };
        }
        e.preventDefault(); canvas.setPointerCapture?.(e.pointerId); return;
      }
      if (live || gesture || (action !== 'draw' && action !== 'erase')) return;
      if (e.pointerType === 'pen' && e.buttons === 0 && e.pressure === 0) return;
      if (action === 'draw' && (p.tool === 'select' || p.tool === 'text')) {
        e.preventDefault(); rect = canvas.getBoundingClientRect(); scale = Math.max(1, rect.width) / PAGE_WIDTH;
        const at = point(e), bounds = canvasSelectionBounds(page, ids);
        let mode: Gesture['mode'] = p.tool === 'text' ? 'text' : 'lasso';
        let origin: InkPoint | undefined;
        if (p.tool === 'select' && bounds) {
          const corners = [bounds.minX, bounds.maxX].flatMap(x => [bounds.minY, bounds.maxY].map(y => ({ x, y, p: 0.5 })));
          const corner = corners.find(c => Math.hypot(c.x - at.x, c.y - at.y) <= 10 / scale);
          if (corner) { mode = 'resize'; origin = { x: corner.x === bounds.minX ? bounds.maxX : bounds.minX, y: corner.y === bounds.minY ? bounds.maxY : bounds.minY, p: 0.5 }; }
          else if (at.x >= bounds.minX && at.x <= bounds.maxX && at.y >= bounds.minY && at.y <= bounds.maxY) mode = 'move';
        }
        if (mode === 'lasso') select([]);
        gesture = { id: e.pointerId, start: at, end: at, loop: [at], mode, origin };
        canvas.setPointerCapture?.(e.pointerId); return;
      }
      touch = null;
      e.preventDefault(); rect = canvas.getBoundingClientRect(); scale = Math.max(1, rect.width) / PAGE_WIDTH;
      const tool = action === 'erase' ? 'eraser' : p.tool as InkTool | 'eraser';
      live = { id: e.pointerId, points: [point(e)], predictions: [], tool, temporaryErase: action === 'erase', color: p.color, width: p.width, eraserMode: p.eraserMode ?? 'area',
        style: { tool: tool === 'eraser' ? 'pen' : tool, color: p.color, width: p.width }, times: [Number.isFinite(e.timeStamp) ? e.timeStamp : -Infinity], seen: new Set() };
      // Raw updates arrive as soon as the pen moves, not aligned to the next frame like pointermove.
      // Listened to only during a stroke, so S Pen hover does not get a second event stream.
      canvas.addEventListener('pointerrawupdate', raw);
      // Composite live highlighters once, avoiding darker overlaps between segments.
      liveCanvas.style.opacity = p.tool === 'highlighter' ? '0.35' : '1';
      liveCanvas.style.zIndex = p.tool === 'highlighter' ? '0' : '2';
      if (live.tool !== 'eraser') drawStroke(actualCtx, live.points, live.style, 1);
      canvas.setPointerCapture?.(e.pointerId); schedule();
      if (tool !== 'eraser') holdTimer = setInterval(() => {
        if (!live || live.shapeLength === live.points.length) return;
        if (live.shape) { live.shape = undefined; actualCtx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT); drawStroke(actualCtx, live.points, live.style, 1); }
        // Reuse the existing sample timestamps; recognition never runs in pointermove/rawupdate.
        const samples = live.points.map((p, i) => ({ x: p.x, y: p.y, t: live!.times[i] }));
        if (!isHeld(samples, performance.now())) return;
        const shape = recognizeShape(live.points); if (!shape) return;
        clearDecoration(); live.predictions = []; live.shape = shape.points; live.shapeLength = live.points.length;
        actualCtx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT); drawStroke(actualCtx, shape.points, live.style, 1);
      }, 100);
    };
    const switchButton = (e: PointerEvent): boolean => {
      if (!live || live.id !== e.pointerId || (e.pointerType !== 'pen' && e.pointerType !== 'mouse')) return false;
      const erase = penErases(e);
      if (live.temporaryErase && !erase) { finish(); return true; }
      if (erase && live.tool !== 'eraser') { finish(); down(e); return true; }
      return false;
    };
    const move = (e: PointerEvent) => {
      if (gesture?.id === e.pointerId) {
        e.preventDefault(); gesture.end = point(e);
        if (Math.hypot(gesture.end.x - gesture.start.x, gesture.end.y - gesture.start.y) > 6) gesture.moved = true;
        if (gesture.mode === 'lasso') { gesture.loop.push(gesture.end); refresh(gesture.loop); }
        return;
      }
      if (touch?.id === e.pointerId) {
        if (classifyPointer({ penActive: !!live }, e).action !== 'scroll') { touch = null; return; }
        if (touch.tap && Math.hypot(e.clientX - touch.tap.x, e.clientY - touch.tap.y) > 6) touch.tap.moved = true;
        e.preventDefault(); touch.move(e); return;
      }
      // The forwarded button can land just after pointerdown, which was then ignored as a mouse.
      if (!live && !gesture && e.buttons !== 0 && forwardedErase(e)) { down(e); return; }
      if (!live || live.id !== e.pointerId) return;
      e.preventDefault();
      if (switchButton(e)) return;
      append(e);
      live.predictions = (e.getPredictedEvents?.() ?? []).map(point);
      schedule();
    };
    // pointerrawupdate and pointermove both deliver every sample, and either may come first (raw is
    // only listened to from pen-down, so a stroke's first samples can arrive by pointermove after a
    // newer raw one). Each sample (time + position) is stored once; a late one is inserted in time
    // order, so the committed stroke has every sample in order. Returns where it was stored, or -1.
    const take = (current: Live, sample: Sample): number => {
      const at = sample.timeStamp;
      if (Number.isFinite(at)) {
        const key = `${at},${sample.clientX},${sample.clientY},${sample.pressure}`;
        if (current.seen.has(key)) return -1;
        current.seen.add(key);
      }
      const time = Number.isFinite(at) ? at : Infinity;
      let index = current.points.length;
      // The eraser sweeps points in arrival order, so it only ever appends.
      if (current.tool !== 'eraser') while (index > 1 && current.times[index - 1] > time) index--;
      current.points.splice(index, 0, point(sample));
      current.times.splice(index, 0, Number.isFinite(at) ? at : current.times[index - 1] ?? -Infinity);
      return index;
    };
    const append = (e: PointerEvent) => {
      const current = live!;
      const coalesced = e.getCoalescedEvents?.();
      let drawn = false;
      for (const sample of (coalesced?.length ? coalesced : [e]) as Sample[]) {
        const index = take(current, sample);
        if (index < 0) continue;
        if (!drawn) { clearDecoration(); drawn = true; }
        if (current.tool === 'eraser') continue;
        const points = current.points;
        drawStroke(actualCtx, [points[index - 1], points[index]], current.style, 1);
        // A late sample also joins the newer point after it.
        if (index + 1 < points.length) drawStroke(actualCtx, [points[index], points[index + 1]], current.style, 1);
      }
      if (!drawn || current.tool === 'eraser') return;
      // Signal only after this event's actual segments have been drawn, never at receipt.
      drawProbe();
      if (import.meta.env.DEV) canvas.dispatchEvent(new CustomEvent('inkdraw', { detail: performance.now() }));
    };
    const raw = (e: Event) => {
      const event = e as PointerEvent;
      if (!live || live.id !== event.pointerId || (event.pointerType !== 'pen' && event.pointerType !== 'mouse')) return;
      if (switchButton(event)) return;
      append(event);
      if (live.tool === 'eraser') schedule();
    };
    const up = (e: PointerEvent) => {
      if (gesture?.id === e.pointerId) {
        const g = gesture; gesture = null; g.end = point(e);
        if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        if (g.mode === 'lasso') select(lassoSelect(page, [...g.loop, g.end]));
        else if (g.mode === 'text') {
          if (!g.moved && Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y) <= 6) {
            openDraft({ x: g.start.x, y: g.start.y, text: '', color: latest.current.textColor ?? latest.current.color });
          }
        } else {
          const dx = g.end.x - g.start.x, dy = g.end.y - g.start.y;
          if (dx || dy) {
            const origin = g.origin ?? g.start;
            const vx = g.start.x - origin.x, vy = g.start.y - origin.y;
            const factor = g.mode === 'resize' ? Math.max(0.01, ((g.end.x - origin.x) * vx + (g.end.y - origin.y) * vy) / (vx * vx + vy * vy || 1)) : 1;
            applySelection(transformStrokes(page, ids, { dx: g.mode === 'move' ? dx : 0, dy: g.mode === 'move' ? dy : 0, scale: factor, originX: origin.x, originY: origin.y }, uuid, new Date().toISOString()));
          }
        }
        return;
      }
      if (touch?.id === e.pointerId) {
        const tap = touch.tap; touch = null;
        if (tap && !tap.moved && latest.current.tool === 'text' && classifyPointer({ penActive: !!live }, e).action === 'scroll'
          && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) <= 6) {
          const at = point({ clientX: tap.x, clientY: tap.y, pressure: 0.5 });
          openDraft({ x: at.x, y: at.y, text: '', color: latest.current.textColor ?? latest.current.color });
        }
        return;
      }
      if (!live || live.id !== e.pointerId) return;
      if (!live.shape || live.shapeLength !== live.points.length) { live.points.push(point(e)); live.times.push(Infinity); }
      finish();
    };
    const cancel = (e: PointerEvent) => { if (gesture?.id === e.pointerId) { gesture = null; refresh(); } if (touch?.id === e.pointerId) touch = null; if (live?.id === e.pointerId) finish(); };
    synchronize.current = () => {
      const incoming = latest.current.page;
      if (incoming !== lastIncoming) {
        lastIncoming = incoming;
        if (incoming.noteId !== page.noteId || incoming.page !== page.page) {
          finish(); gesture = null; saveDraft(); setDraft(null); select([]); undo.length = 0; redo.length = 0; cache.clear(); historyChanged();
        }
        const changed = incoming.strokes !== page.strokes || incoming.removed !== page.removed;
        page = incoming; if (changed) { rebuild(); refresh(); }
      }
      if (latest.current.readOnly) finish();
      if (draftBox && latest.current.tool !== 'text') { saveDraft(); setDraft(null); }
    };
    // A pen side button can arrive as a right click; never open a menu or start a text selection.
    const noMenu = (e: Event) => e.preventDefault();
    canvas.addEventListener('contextmenu', noMenu);
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
      gesture = null; finish(); saveDraft(); if (frame) cancelAnimationFrame(frame);
      observer?.disconnect(); window.removeEventListener('resize', resize); window.removeEventListener('pagehide', finish);
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel); canvas.removeEventListener('lostpointercapture', cancel); canvas.removeEventListener('contextmenu', noMenu);
      synchronize.current = () => {}; api.current = emptyHandle; textApi.current = { edit() {}, commit() {}, type() {}, resize() {} };
      canvas.width = canvas.height = liveCanvas.width = liveCanvas.height = 0;
      cache.clear(); previewCache.clear();
    };
  }, []);

  const overlay = { position: 'absolute' as const, inset: 0, width: '100%', height: '100%', pointerEvents: 'none' as const };
  return <div style={{ position: 'relative', isolation: 'isolate', ...paperStyle(props.paper) }}>
    <canvas ref={canvasRef} aria-label="Handwritten page" role="img" style={{ position: 'relative', zIndex: 1, display: 'block', width: '100%', aspectRatio: `${PAGE_WIDTH} / ${PAGE_HEIGHT}`, touchAction: 'none' }} />
    <canvas ref={liveRef} data-ink-live aria-hidden="true" style={overlay} />
    <InkTextLayer textareaRef={textarea} page={view.page} draft={draft} scale={view.scale} editing={props.tool === 'text'} onEdit={id => textApi.current.edit(id)} onCommit={(box, text) => textApi.current.commit(box, text)} onType={(box, text) => textApi.current.type(box, text)} onResize={(box, width) => textApi.current.resize(box, width)} />
    {props.tool === 'select' && <InkSelectionLayer hasClip={hasClip} scale={view.scale} bounds={canvasSelectionBounds(view.page, view.ids)} loop={view.loop}
      onDelete={() => api.current.deleteSelection()} onCopy={() => api.current.copySelection()} onCut={() => api.current.cutSelection()}
      onPaste={() => api.current.paste()} onDuplicate={() => api.current.duplicateSelection()} onRecolor={color => api.current.recolorSelection(color)} />}
  </div>;
});
