// @vitest-environment jsdom
import React, { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InkCanvas, type InkCanvasHandle, type InkCanvasProps } from './InkCanvas';
import { InkPageView } from './InkPageView';
import { decodePoints, encodePoints, visibleStrokes } from '../../ink/inkModel';
import * as model from '../../ink/inkModel';
import * as renderer from '../../ink/inkRender';
import type { InkPage } from '../../types/daymark';

let host: HTMLDivElement, root: Root;
let frames: FrameRequestCallback[];
let contexts: WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>;
let unsupportedContext: 'throw' | 'null' | undefined;
let unmounted: boolean;
const blank = (): InkPage => ({ noteId: 'n', page: 0, strokes: [], removed: [], updatedAt: '' });
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  frames = [];
  unmounted = false;
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frames.push(fn); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  contexts = new WeakMap();
  unsupportedContext = undefined;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function(this: HTMLCanvasElement, _id: string, options?: unknown) {
    if ((options as { desynchronized?: boolean })?.desynchronized && unsupportedContext) {
      if (unsupportedContext === 'throw') throw new Error('Context options unsupported');
      return null;
    }
    if (!contexts.has(this)) contexts.set(this, { setTransform: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(), arc: vi.fn(), stroke: vi.fn(), save: vi.fn(), rect: vi.fn(), clip: vi.fn(), restore: vi.fn() } as unknown as CanvasRenderingContext2D);
    return contexts.get(this)!;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1000, height: 1414 } as DOMRect);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { if (!unmounted) act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount(extra: Partial<InkCanvasProps> = {}) {
  const onChange = vi.fn(); const ref = createRef<InkCanvasHandle>();
  act(() => root.render(React.createElement(InkCanvas, { page: blank(), paper: 'lined', tool: 'pen', color: '#1c1917', width: 4, eraserMode: 'area', onChange, ...extra, ref })));
  return { canvas: host.querySelector('canvas')!, onChange, ref };
}
function pointer(canvas: HTMLCanvasElement, type: string, extra: Record<string, unknown> = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerType: 'pen', pointerId: 1, isPrimary: true, width: 1, height: 1, clientX: 10, clientY: 10, pressure: 0.5, ...extra });
  act(() => { canvas.dispatchEvent(event); });
}
it('commits exactly once synchronously on pointerup, ignores palm, never commits predictions', () => {
  const { canvas, onChange } = mount();
  pointer(canvas, 'pointerdown');
  pointer(canvas, 'pointerdown', { pointerType: 'touch', pointerId: 2, width: 50 });
  pointer(canvas, 'pointermove', { clientX: 20, getCoalescedEvents: () => [{ clientX: 15, clientY: 10, pressure: 1 }, { clientX: 20, clientY: 10, pressure: 0.5 }], getPredictedEvents: () => [{ clientX: 99, clientY: 10, pressure: 0.5 }] });
  expect(onChange).not.toHaveBeenCalled();
  pointer(canvas, 'pointerup', { clientX: 25 });
  expect(onChange).toHaveBeenCalledTimes(1);
  const page = onChange.mock.calls[0][0];
  expect(page.strokes).toHaveLength(1);
  expect(decodePoints(page.strokes[0].points).map(p => p.x)).toEqual([10, 15, 20, 25]);
});

it('disables native gestures before writable contact and scrolls the nearest ancestor with touch', () => {
  host.style.overflow = 'auto';
  Object.defineProperties(host, { scrollHeight: { value: 2400 }, clientHeight: { value: 500 }, scrollWidth: { value: 2000 }, clientWidth: { value: 600 } });
  host.scrollTop = 100; host.scrollLeft = 80;
  const { canvas, onChange } = mount();
  expect(canvas.style.touchAction).toBe('none');
  pointer(canvas, 'pointerdown', { pointerType: 'touch', clientX: 100, clientY: 100 });
  pointer(canvas, 'pointermove', { pointerType: 'touch', clientX: 70, clientY: 60 });
  pointer(canvas, 'pointerup', { pointerType: 'touch', clientX: 70, clientY: 60 });
  expect(host.scrollTop).toBe(140); expect(host.scrollLeft).toBe(110);
  expect(onChange).not.toHaveBeenCalled();
  pointer(canvas, 'pointerdown'); pointer(canvas, 'pointerup');
  expect(canvas.style.touchAction).toBe('none');
});

it('keeps native touch scrolling on readOnly canvas', () => {
  const { canvas, onChange } = mount({ readOnly: true });
  expect(['pan-y', 'auto']).toContain(canvas.style.touchAction);
  pointer(canvas, 'pointerdown', { pointerType: 'touch' });
  pointer(canvas, 'pointermove', { pointerType: 'touch', clientY: 100 });
  expect(onChange).not.toHaveBeenCalled();
});

it.each(['view', 'readOnly', 'editor'] as const)('bounds %s canvas allocations and releases all pixel buffers on unmount', mode => {
  const create = vi.spyOn(document, 'createElement');
  if (mode === 'view') act(() => root.render(React.createElement(InkPageView, { page: blank(), paper: 'lined' })));
  else mount({ readOnly: mode === 'readOnly' });
  const canvases = create.mock.results.map(r => r.value).filter((v): v is HTMLCanvasElement => v instanceof HTMLCanvasElement);
  if (mode !== 'editor') expect(canvases).toHaveLength(1);
  else { expect(canvases.length).toBeLessThanOrEqual(3); expect(canvases).toHaveLength(2); }
  expect(canvases.length).toBeGreaterThan(0);
  act(() => root.unmount()); unmounted = true;
  for (const canvas of canvases) { expect(canvas.width).toBe(0); expect(canvas.height).toBe(0); }
});
it('commits the in-progress stroke on pagehide, including cancellation and unmount safety', () => {
  const { canvas, onChange } = mount();
  pointer(canvas, 'pointerdown');
  act(() => window.dispatchEvent(new Event('pagehide')));
  expect(onChange).toHaveBeenCalledTimes(1);
  pointer(canvas, 'pointerup');
  expect(onChange).toHaveBeenCalledTimes(1);
});
it.each([{ readOnly: true }, {}, { allowMouse: true }])('respects readOnly and touch/mouse policy %j', props => {
  const { canvas, onChange } = mount(props);
  for (const pointerType of ['touch', 'mouse']) { pointer(canvas, 'pointerdown', { pointerType }); pointer(canvas, 'pointerup', { pointerType }); }
  expect(onChange).toHaveBeenCalledTimes('allowMouse' in props ? 1 : 0);
  if ('readOnly' in props) { pointer(canvas, 'pointerdown'); pointer(canvas, 'pointerup'); expect(onChange).not.toHaveBeenCalled(); }
});
it.each(['area', 'stroke'] as const)('erases using model %s and undo/redo restores visible ink', eraserMode => {
  const page = blank(); page.strokes.push({ id: 'original', tool: 'pen', color: '#1c1917', width: 4, createdAt: '', points: encodePoints([{ x: 0, y: 10, p: 0.5 }, { x: 100, y: 10, p: 0.5 }]) });
  const spy = vi.spyOn(model, eraserMode === 'area' ? 'eraseArea' : 'eraseStrokes');
  const { canvas, onChange, ref } = mount({ page, tool: 'eraser', eraserMode, width: 20 });
  pointer(canvas, 'pointerdown', { clientX: 50 }); pointer(canvas, 'pointerup', { clientX: 50 });
  expect(spy).toHaveBeenCalled();
  const erased = onChange.mock.calls.at(-1)![0];
  expect(erased.removed).toContain('original');
  act(() => ref.current!.undo());
  const restored = visibleStrokes(onChange.mock.calls.at(-1)![0]);
  expect(restored).toHaveLength(1);
  expect(restored[0].createdAt).toBe(page.strokes[0].createdAt);
  act(() => ref.current!.redo());
  expect(visibleStrokes(onChange.mock.calls.at(-1)![0])).toHaveLength(eraserMode === 'area' ? 2 : 0);
});

it('draws pen segments synchronously, batches predicted tails, and never rebuilds or decodes committed ink during moves', () => {
  const page = blank();
  page.strokes.push({ id: 'cached', tool: 'pen', color: '#1c1917', width: 4, createdAt: '', points: encodePoints([{ x: 30, y: 30, p: 0.5 }]) });
  const decode = vi.spyOn(model, 'decodePoints');
  const { canvas, onChange } = mount({ page });
  const liveCanvas = host.querySelector<HTMLCanvasElement>('[data-ink-live]')!;
  expect(liveCanvas).not.toBeNull();
  const context = liveCanvas.getContext('2d')!;
  expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d', { desynchronized: true, alpha: true });
  const initialDecodes = decode.mock.calls.length;
  const flush = () => { const pending = frames.splice(0); act(() => { for (const fn of pending) fn(0); }); };
  flush();
  const fills = vi.mocked(context.fill).mock.calls.length;
  const drawn = vi.fn(), framed = vi.fn();
  canvas.addEventListener('inkdraw', drawn); canvas.addEventListener('inkframe', framed);
  pointer(canvas, 'pointerdown');
  const afterDown = vi.mocked(context.lineTo).mock.calls.length;
  pointer(canvas, 'pointermove', { clientX: 20, getCoalescedEvents: () => [{ clientX: 15, clientY: 10, pressure: 0 }, { clientX: 20, clientY: 10, pressure: 1 }] });
  expect(vi.mocked(context.lineTo).mock.calls.length).toBeGreaterThan(afterDown);
  expect(context.fill).toHaveBeenCalledTimes(fills + 3);
  expect(drawn).toHaveBeenCalledTimes(1);
  expect(framed).not.toHaveBeenCalled();
  for (let i = 0; i < 100; i++) pointer(canvas, 'pointermove', { clientX: i });
  expect(frames).toHaveLength(1);
  expect(context.fill).toHaveBeenCalledTimes(fills + 103);
  expect(onChange).not.toHaveBeenCalled();
  flush();
  expect(context.fill).toHaveBeenCalledTimes(fills + 103);
  expect(decode).toHaveBeenCalledTimes(initialDecodes);
  expect(canvas.style.touchAction).toBe('none');
  pointer(canvas, 'pointerup');
  expect(canvas.style.touchAction).toBe('none');
});

it.each(['throw', 'null'] as const)('falls back to normal live 2d context when desynchronized options %s', failure => {
  unsupportedContext = failure;
  const { canvas, onChange } = mount();
  const live = host.querySelector<HTMLCanvasElement>('[data-ink-live]')!;
  pointer(canvas, 'pointerdown'); pointer(canvas, 'pointermove');
  expect(live.getContext('2d')!.fill).toHaveBeenCalled();
  pointer(canvas, 'pointerup');
  expect(onChange).toHaveBeenCalledTimes(1);
});

it.each(['pen', 'highlighter'] as const)('draws %s on move before any rAF callback runs', tool => {
  const { canvas, onChange } = mount({ tool });
  const live = host.querySelector<HTMLCanvasElement>('[data-ink-live]')!;
  const context = live.getContext('2d')!;
  pointer(canvas, 'pointerdown');
  vi.mocked(context.lineTo).mockClear();
  pointer(canvas, 'pointermove', { clientX: 20 });
  expect(context.lineTo).toHaveBeenCalled();
  expect(frames).toHaveLength(1);
  expect(live.style.opacity).toBe(tool === 'highlighter' ? '0.35' : '1');
  expect(live.style.zIndex).toBe(tool === 'highlighter' ? '0' : '2');
  expect(onChange).not.toHaveBeenCalled();
});

it('clears only the predicted region and restores actual ink on the shared live canvas', () => {
  const { canvas, onChange } = mount();
  const actual = host.querySelector<HTMLCanvasElement>('[data-ink-live]')!.getContext('2d')!;
  const flush = () => { const pending = frames.splice(0); act(() => { for (const fn of pending) fn(0); }); };
  flush(); pointer(canvas, 'pointerdown');
  pointer(canvas, 'pointermove', { clientX: 20, getPredictedEvents: () => [{ clientX: 99, clientY: 10, pressure: 0.5 }] });
  const actualFills = vi.mocked(actual.fill).mock.calls.length;
  const actualClears = vi.mocked(actual.clearRect).mock.calls.length;
  flush();
  expect(actual.fill).toHaveBeenCalledTimes(actualFills + 1);
  expect(actual.clearRect).toHaveBeenCalledTimes(actualClears);
  pointer(canvas, 'pointermove', { clientX: 30 }); flush();
  expect(actual.clip).toHaveBeenCalled();
  const clear = vi.mocked(actual.clearRect).mock.calls.at(-1)!;
  expect(clear[2]).toBeLessThan(1000); expect(clear[3]).toBeLessThan(1414);
  expect(vi.mocked(actual.fill).mock.calls.length).toBeGreaterThan(actualFills + 2);
  pointer(canvas, 'pointerup', { clientX: 40 });
  expect(decodePoints(onChange.mock.calls[0][0].strokes[0].points).map(p => p.x)).toEqual([10, 20, 30, 40]);
});

it('preserves partial ink on pointercancel and ignores further moves/up', () => {
  const { canvas, onChange } = mount();
  pointer(canvas, 'pointerdown'); pointer(canvas, 'pointermove', { clientX: 40 });
  pointer(canvas, 'pointercancel'); pointer(canvas, 'pointerup');
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(decodePoints(onChange.mock.calls[0][0].strokes[0].points).map(p => p.x)).toEqual([10, 40]);
});

it.each([2, 4])('bounds backing pixels at DPR 2 for device DPR %s and uses scaled CSS paper', dpr => {
  vi.stubGlobal('devicePixelRatio', dpr);
  const { canvas } = mount({ paper: 'grid' });
  expect(canvas.width).toBe(2000); expect(canvas.height).toBe(2828);
  expect(canvas.parentElement!.style.backgroundSize).toBe('32px 32px');
  expect(canvas.parentElement!.style.backgroundImage).toContain('to right');
});

it('appends a committed pen to its cached layer without repainting existing strokes', () => {
  const page = blank();
  page.strokes.push({ id: 'cached', tool: 'pen', color: '#1c1917', width: 4, createdAt: '', points: encodePoints([{ x: 30, y: 30, p: 0.5 }]) });
  const draw = vi.spyOn(renderer, 'drawPage');
  const { canvas } = mount({ page });
  draw.mockClear();
  pointer(canvas, 'pointerdown'); pointer(canvas, 'pointerup');
  expect(draw.mock.calls.flatMap(call => visibleStrokes(call[1])).map(s => s.id)).not.toContain('cached');
});

it.each(['stroke', 'area'] as const)('previews %s erasure and cursor before pointerup, then publishes once', eraserMode => {
  const page = blank();
  page.strokes.push({ id: 'hit', tool: 'pen', color: '#b91c1c', width: 4, createdAt: '', points: encodePoints([{ x: 0, y: 10, p: 0.5 }, { x: 100, y: 10, p: 0.5 }]) });
  const draw = vi.spyOn(renderer, 'drawPage');
  const { canvas, onChange } = mount({ page, tool: 'eraser', width: 20, eraserMode });
  const flush = () => { const pending = frames.splice(0); act(() => { for (const fn of pending) fn(0); }); };
  flush(); draw.mockClear();
  pointer(canvas, 'pointerdown', { clientX: 50, clientY: 40 });
  pointer(canvas, 'pointermove', { clientX: 50, clientY: 10 });
  expect(draw).not.toHaveBeenCalled();
  flush();
  expect(draw).toHaveBeenCalled();
  const preview = draw.mock.calls.at(-1)![1];
  expect(preview.removed).toContain('hit');
  const remaining = visibleStrokes(preview);
  expect(remaining).toHaveLength(eraserMode === 'stroke' ? 0 : 2);
  expect(remaining.some(s => s.id === 'hit')).toBe(false);
  expect(onChange).not.toHaveBeenCalled();
  const tail = host.querySelector<HTMLCanvasElement>('[data-ink-live]')!.getContext('2d')!;
  expect(tail.arc).toHaveBeenLastCalledWith(50, 10, 10, 0, Math.PI * 2);
  pointer(canvas, 'pointerup', { clientX: 50 });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(page.removed).toEqual([]);
  expect(visibleStrokes(onChange.mock.calls[0][0])).toHaveLength(eraserMode === 'stroke' ? 0 : 2);
});
