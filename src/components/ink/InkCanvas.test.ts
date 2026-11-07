// @vitest-environment jsdom
import React, { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InkCanvas, type InkCanvasHandle, type InkCanvasProps } from './InkCanvas';
import { InkPageView } from './InkPageView';
import { HandwrittenNoteView, createHandwrittenNote } from './HandwrittenNoteView';
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
  const { timeStamp, ...pointerExtra } = extra;
  if (timeStamp !== undefined) Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  Object.assign(event, { pointerType: 'pen', pointerId: 1, isPrimary: true, width: 1, height: 1, clientX: 10, clientY: 10, pressure: 0.5, ...pointerExtra });
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

it('collapses transient area eraser pieces at gesture finish and preserves original z-order', () => {
  const original: InkPage = { ...blank(), strokes: Array.from({ length: 40 }, (_, i) => ({ id: 'word-' + i, tool: 'pen', color: '#000', width: 2, createdAt: '2026-10-01', points: encodePoints(Array.from({ length: 60 }, (_, j) => ({ x: 10 + i * 24 + j * 0.35, y: 100 + Math.sin(j) * 2, p: 0.5 }))) })) };
  const { canvas, onChange } = mount({ page: original, tool: 'eraser', width: 8, eraserMode: 'area' });
  pointer(canvas, 'pointerdown', { clientX: 10, clientY: 100 });
  for (let pass = 0; pass < 3; pass++) {
    for (let x = 10; x < 980; x += 4) { pointer(canvas, 'pointermove', { clientX: pass % 2 ? 990 - x : x, clientY: 100 }); const pending = frames.splice(0); for (const frame of pending) act(() => frame(0)); }
  }
  pointer(canvas, 'pointerup', { clientX: 980, clientY: 100 });
  const committed: InkPage = onChange.mock.calls[0][0];
  console.info('Eraser bytes before/after:', JSON.stringify(original).length, JSON.stringify(committed).length);
  expect(JSON.stringify(committed).length).toBeLessThanOrEqual(JSON.stringify(original).length * 2);
  expect(committed.removed.every(id => original.strokes.some(s => s.id === id))).toBe(true);
  expect(committed.strokes.filter(s => !original.strokes.some(o => o.id === s.id)).every(s => s.createdAt === '2026-10-01')).toBe(true);
});

it('draws pen pointerrawupdate samples at once, never redraws them on pointermove, and fills only newer gaps', () => {
  const { canvas, onChange } = mount();
  const live = host.querySelector<HTMLCanvasElement>('[data-ink-live]')!.getContext('2d')!;
  const sample = (clientX: number, timeStamp: number) => ({ clientX, clientY: 10, pressure: 0.5, timeStamp });
  pointer(canvas, 'pointerdown');
  const fills = vi.mocked(live.fill).mock.calls.length;
  pointer(canvas, 'pointerrawupdate', { getCoalescedEvents: () => [sample(15, 1), sample(20, 2)] });
  expect(live.fill).toHaveBeenCalledTimes(fills + 2);
  // The frame-aligned pointermove repeats both samples and adds one raw has not delivered yet.
  pointer(canvas, 'pointermove', { getCoalescedEvents: () => [sample(15, 1), sample(20, 2), sample(25, 3)] });
  expect(live.fill).toHaveBeenCalledTimes(fills + 3);
  pointer(canvas, 'pointerup', { clientX: 30 });
  expect(decodePoints(onChange.mock.calls[0][0].strokes[0].points).map(p => p.x)).toEqual([10, 15, 20, 25, 30]);
});

it('listens to raw updates only during a pen stroke, so hover and touch never draw through them', () => {
  const { canvas, onChange } = mount();
  const live = host.querySelector<HTMLCanvasElement>('[data-ink-live]')!.getContext('2d')!;
  const add = vi.spyOn(canvas, 'addEventListener'), remove = vi.spyOn(canvas, 'removeEventListener');
  pointer(canvas, 'pointerrawupdate', { clientX: 40, buttons: 0, pressure: 0 });
  expect(live.fill).not.toHaveBeenCalled();
  pointer(canvas, 'pointerdown', { pointerType: 'touch', pointerId: 2 });
  pointer(canvas, 'pointerrawupdate', { pointerType: 'touch', pointerId: 2, clientX: 40 });
  expect(add).not.toHaveBeenCalledWith('pointerrawupdate', expect.anything());
  pointer(canvas, 'pointerup', { pointerType: 'touch', pointerId: 2 });
  pointer(canvas, 'pointerdown');
  expect(add).toHaveBeenCalledWith('pointerrawupdate', expect.any(Function));
  pointer(canvas, 'pointerup');
  expect(remove).toHaveBeenCalledWith('pointerrawupdate', add.mock.calls.find(([type]) => type === 'pointerrawupdate')![1]);
  const fills = vi.mocked(live.fill).mock.calls.length;
  pointer(canvas, 'pointerrawupdate', { clientX: 60, buttons: 0, pressure: 0 });
  expect(live.fill).toHaveBeenCalledTimes(fills);
  expect(onChange).toHaveBeenCalledTimes(1);
});

it('commits a highlighter under existing pen ink by repainting only its area', () => {
  const page = blank();
  const pen = (id: string, x: number, y: number) => ({ id, tool: 'pen' as const, color: '#1c1917', width: 4, createdAt: '2026-01-01', points: encodePoints([{ x, y, p: 0.5 }, { x: x + 30, y, p: 0.5 }]) });
  page.strokes.push(pen('crossed', 10, 10), pen('far', 600, 900));
  const draw = vi.spyOn(renderer, 'drawPage');
  const { canvas, onChange } = mount({ page, tool: 'highlighter', color: '#fde047', width: 24 });
  draw.mockClear();
  const committed = host.querySelector('canvas')!.getContext('2d')!;
  const repainted: string[] = [];
  vi.mocked(committed.fill).mockImplementation(function(this: CanvasRenderingContext2D) { repainted.push(String(this.fillStyle)); });
  const clears = vi.mocked(committed.clearRect).mock.calls.length;
  pointer(canvas, 'pointerdown', { clientX: 10, clientY: 10 }); pointer(canvas, 'pointerup', { clientX: 40, clientY: 10 });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(draw).not.toHaveBeenCalled();
  // The new highlighter, then the pen stroke it crosses on top; the distant pen is not repainted.
  expect(repainted).toEqual(['#fde047', '#1c1917']);
  const area = vi.mocked(committed.clearRect).mock.calls.slice(clears).find(([, , w]) => w < 1000)!;
  expect(area[2]).toBeLessThan(200);
});

it('stores every sample once and in time order when pointermove delivers earlier samples after newer raw ones', () => {
  const { canvas, onChange } = mount();
  const sample = (clientX: number, timeStamp: number) => ({ clientX, clientY: 10, pressure: 0.5, timeStamp });
  pointer(canvas, 'pointerdown');
  // The raw listener is attached at pen-down: the first samples only come with the frame's pointermove.
  pointer(canvas, 'pointerrawupdate', { getCoalescedEvents: () => [sample(40, 4)] });
  pointer(canvas, 'pointermove', { getCoalescedEvents: () => [sample(20, 2), sample(30, 3), sample(40, 4)] });
  pointer(canvas, 'pointerrawupdate', { getCoalescedEvents: () => [sample(50, 5), sample(60, 6)] });
  pointer(canvas, 'pointermove', { getCoalescedEvents: () => [sample(50, 5), sample(60, 6)] });
  pointer(canvas, 'pointerup', { clientX: 70 });
  expect(decodePoints(onChange.mock.calls[0][0].strokes[0].points).map(p => p.x)).toEqual([10, 20, 30, 40, 50, 60, 70]);
});

const linePage = () => ({ ...blank(), strokes: [{ id: 'line', tool: 'pen' as const, color: '#1c1917', width: 4, createdAt: '', points: encodePoints([{ x: 30, y: 30, p: 0.5 }, { x: 70, y: 70, p: 0.5 }]) }] });
const lastPage = (onChange: ReturnType<typeof vi.fn>): InkPage => onChange.mock.calls.at(-1)![0];
function loop(canvas: HTMLCanvasElement) {
  pointer(canvas, 'pointerdown', { clientX: 20, clientY: 20 });
  for (const [clientX, clientY] of [[80, 20], [80, 80], [20, 80], [20, 20]]) pointer(canvas, 'pointermove', { clientX, clientY });
  pointer(canvas, 'pointerup', { clientX: 20, clientY: 20 });
}
function box(canvas: HTMLCanvasElement) {
  pointer(canvas, 'pointerdown', { clientX: 100, clientY: 100, timeStamp: performance.now() });
  for (const [clientX, clientY] of [[150, 100], [200, 100], [200, 150], [200, 200], [150, 200], [100, 200], [100, 150], [100, 100]]) {
    pointer(canvas, 'pointermove', { clientX, clientY, timeStamp: performance.now() });
  }
}
it('pen with buttons=3 erases a stroke under it and the next plain stroke draws', () => {
  const { canvas, onChange } = mount({ page: linePage(), eraserMode: 'stroke' });
  pointer(canvas, 'pointerdown', { clientX: 50, clientY: 50, buttons: 3 });
  pointer(canvas, 'pointerup', { clientX: 50, clientY: 50 });
  expect(visibleStrokes(lastPage(onChange))).toHaveLength(0);
  pointer(canvas, 'pointerdown', { buttons: 1 }); pointer(canvas, 'pointerup', { clientX: 25 });
  expect(visibleStrokes(lastPage(onChange))).toHaveLength(1);
});
it('the S Pen button forwarded by the Android app erases while held, then the pen draws again', () => {
  const { canvas, onChange } = mount({ page: linePage(), eraserMode: 'stroke' });
  act(() => { window.dispatchEvent(new CustomEvent('daymark-stylus-button', { detail: { pressed: true } })); });
  pointer(canvas, 'pointerdown', { clientX: 50, clientY: 50, buttons: 1 });
  pointer(canvas, 'pointerup', { clientX: 50, clientY: 50 });
  expect(visibleStrokes(lastPage(onChange))).toHaveLength(0);
  act(() => { window.dispatchEvent(new CustomEvent('daymark-stylus-button', { detail: { pressed: false } })); });
  pointer(canvas, 'pointerdown', { buttons: 1 }); pointer(canvas, 'pointerup', { clientX: 25 });
  expect(visibleStrokes(lastPage(onChange))).toHaveLength(1);
});
const stylusButton = (pressed: boolean) => act(() => { window.dispatchEvent(new CustomEvent('daymark-stylus-button', { detail: { pressed } })); });
it('the forwarded S Pen button erases when the WebView reports the pen as a mouse', () => {
  const { canvas, onChange } = mount({ page: linePage(), eraserMode: 'stroke', allowMouse: false });
  stylusButton(true);
  pointer(canvas, 'pointerdown', { pointerType: 'mouse', clientX: 50, clientY: 50, buttons: 2, button: 2 });
  pointer(canvas, 'pointerup', { pointerType: 'mouse', clientX: 50, clientY: 50, buttons: 0 });
  stylusButton(false);
  expect(visibleStrokes(lastPage(onChange))).toHaveLength(0);
});
it('the forwarded S Pen button still erases when its signal lands just after pointerdown', () => {
  const { canvas, onChange } = mount({ page: linePage(), eraserMode: 'stroke', allowMouse: false });
  pointer(canvas, 'pointerdown', { pointerType: 'mouse', clientX: 50, clientY: 50, buttons: 2, button: 2 });
  stylusButton(true);
  pointer(canvas, 'pointermove', { pointerType: 'mouse', clientX: 50, clientY: 52, buttons: 2 });
  pointer(canvas, 'pointerup', { pointerType: 'mouse', clientX: 50, clientY: 52, buttons: 0 });
  stylusButton(false);
  expect(visibleStrokes(lastPage(onChange))).toHaveLength(0);
});
it('the S Pen button does not open a context menu on the page', () => {
  const { canvas } = mount();
  const menu = new Event('contextmenu', { bubbles: true, cancelable: true });
  canvas.dispatchEvent(menu);
  expect(menu.defaultPrevented).toBe(true);
});
it('a mouse without the forwarded button stays ignored once a pen has been seen', () => {
  const { canvas, onChange } = mount({ page: linePage(), allowMouse: false });
  pointer(canvas, 'pointerdown', { pointerType: 'mouse', buttons: 1 }); pointer(canvas, 'pointermove', { pointerType: 'mouse', buttons: 1, clientX: 40 });
  pointer(canvas, 'pointerup', { pointerType: 'mouse', clientX: 40 });
  expect(onChange).not.toHaveBeenCalled();
});
it('select tool loop then drag moves the strokes; one undo restores', () => {
  const onSelectionChange = vi.fn();
  const { canvas, onChange, ref } = mount({ page: linePage(), tool: 'select', onSelectionChange });
  loop(canvas);
  expect(onSelectionChange).toHaveBeenLastCalledWith(['line']);
  pointer(canvas, 'pointerdown', { clientX: 50, clientY: 50 });
  pointer(canvas, 'pointermove', { clientX: 150, clientY: 150 });
  pointer(canvas, 'pointerup', { clientX: 150, clientY: 150 });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(decodePoints(visibleStrokes(lastPage(onChange))[0].points)[0]).toMatchObject({ x: 130, y: 130 });
  act(() => ref.current!.undo());
  expect(visibleStrokes(lastPage(onChange))).toHaveLength(1);
  expect(decodePoints(visibleStrokes(lastPage(onChange))[0].points)[0]).toMatchObject({ x: 30, y: 30 });
});
it('text tool mouse tap, type hello, blur creates one text box; editing and undo keep one box', () => {
  const { canvas, onChange, ref } = mount({ tool: 'text', textColor: '#44403c' });
  pointer(canvas, 'pointerdown', { pointerType: 'mouse' }); pointer(canvas, 'pointerup', { pointerType: 'mouse' });
  const input = host.querySelector('textarea')!;
  expect(input).not.toBeNull();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 401);
  act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, 'hello'); input.dispatchEvent(new Event('input', { bubbles: true })); input.blur(); });
  expect(lastPage(onChange).strokes.filter(s => !lastPage(onChange).removed.includes(s.id))).toMatchObject([{ text: 'hello', color: '#44403c' }]);
  const text = host.querySelector<HTMLElement>('[data-ink-text]')!;
  pointer(text as HTMLCanvasElement, 'pointerdown', { pointerType: 'mouse' }); pointer(text as HTMLCanvasElement, 'pointerup', { pointerType: 'mouse' });
  const edit = host.querySelector('textarea')!;
  clock.mockReturnValue(Date.now() + 401);
  act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(edit, 'world'); edit.dispatchEvent(new Event('input', { bubbles: true })); edit.blur(); });
  act(() => ref.current!.undo());
  const page = lastPage(onChange);
  expect(page.strokes.filter(s => !page.removed.includes(s.id)).map(s => s.text)).toEqual(['hello']);
});
it('held stroke shaped like a box becomes a 5-point rectangle; undo restores freehand', () => {
  vi.useFakeTimers();
  try {
    const { canvas, onChange, ref } = mount(); box(canvas);
    act(() => vi.advanceTimersByTime(700));
    pointer(canvas, 'pointerup', { clientX: 100, clientY: 100 });
    expect(decodePoints(visibleStrokes(lastPage(onChange))[0].points)).toHaveLength(5);
    act(() => ref.current!.undo());
    expect(decodePoints(visibleStrokes(lastPage(onChange))[0].points).length).toBeGreaterThan(5);
  } finally { vi.useRealTimers(); }
});
it('quick box stroke without hold stays freehand', () => {
  const { canvas, onChange } = mount(); box(canvas);
  pointer(canvas, 'pointerup', { clientX: 100, clientY: 100 });
  expect(decodePoints(visibleStrokes(lastPage(onChange))[0].points).length).toBeGreaterThan(5);
});
it.each(['select'] as const)('finger touch with %s tool does not select or create', tool => {
  const onSelectionChange = vi.fn();
  const { canvas, onChange } = mount({ tool, page: linePage(), onSelectionChange });
  pointer(canvas, 'pointerdown', { pointerType: 'touch' }); pointer(canvas, 'pointerup', { pointerType: 'touch' });
  expect(onChange).not.toHaveBeenCalled(); expect(host.querySelector('textarea')).toBeNull();
  expect(onSelectionChange.mock.calls.flat(2)).not.toContain('line');
});

it('notifies clipboard availability on mount, copy, cut and remount', () => {
  const onClipboardChange = vi.fn();
  const { canvas, ref } = mount({ page: linePage(), tool: 'select', onClipboardChange });
  expect(onClipboardChange).toHaveBeenCalledWith(expect.any(Boolean));
  loop(canvas); act(() => ref.current!.copySelection());
  expect(onClipboardChange).toHaveBeenLastCalledWith(true);
  act(() => ref.current!.cutSelection());
  expect(onClipboardChange).toHaveBeenCalledTimes(3);
  expect(host.querySelector('[aria-label="Selection actions"]')).toBeNull();
  act(() => root.unmount()); root = createRoot(host);
  onClipboardChange.mockClear(); mount({ onClipboardChange });
  expect(onClipboardChange).toHaveBeenCalledWith(true);
});

it.each([false, true])('routes Paste after Cut and page navigation through notebook controls (fullScreen=%s)', fullScreen => {
  const note = { ...createHandwrittenNote('', 'lined', ''), id: 'n' };
  const onUpdatePage = vi.fn();
  act(() => root.render(React.createElement(HandwrittenNoteView, { note, pages: [linePage(), { ...blank(), page: 1 }], onUpdatePage, fullScreen })));
  const click = (label: string, scope: ParentNode = host) => act(() => scope.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click());
  click('Select'); loop(host.querySelector('canvas')!);
  click('Cut', host.querySelector('[role=toolbar][aria-label="Selection actions"]')!);
  expect(host.querySelector('[role=toolbar][aria-label="Selection actions"]')).toBeNull();
  click('Next page'); click('Paste', host.querySelector('[aria-label="Writing tools"]')!);
  const pasted = onUpdatePage.mock.calls.at(-1)![0] as InkPage;
  expect(pasted.page).toBe(1); expect(visibleStrokes(pasted)).toHaveLength(1);
  expect(decodePoints(visibleStrokes(pasted)[0].points)[0]).toMatchObject({ x: 50, y: 50 });
});

it('uses CSS pixel tap tolerance at tablet scale while a touch drag scrolls', () => {
  vi.mocked(HTMLCanvasElement.prototype.getBoundingClientRect).mockReturnValue({ left: 0, top: 0, width: 500, height: 707 } as DOMRect);
  host.style.overflow = 'auto'; Object.defineProperties(host, { scrollHeight: { value: 2400 }, clientHeight: { value: 500 } }); host.scrollTop = 100;
  const { canvas } = mount({ tool: 'text' });
  pointer(canvas, 'pointerdown', { pointerType: 'touch', width: 30, height: 30 });
  pointer(canvas, 'pointerup', { pointerType: 'touch', clientX: 16, width: 30, height: 30 });
  expect(host.querySelector('textarea')).not.toBeNull();
  pointer(canvas, 'pointerdown', { pointerType: 'touch' });
  pointer(canvas, 'pointermove', { pointerType: 'touch', clientY: 40 });
  expect(host.scrollTop).toBe(70);
  pointer(canvas, 'pointerup', { pointerType: 'touch', clientY: 40 });
});

it.each(['pen', 'mouse', 'touch'])('focuses a draft during %s pointerup and guards early blur', pointerType => {
  const { canvas, onChange } = mount({ tool: 'text' });
  pointer(canvas, 'pointerdown', { pointerType });
  let focusedDuringUp = false;
  canvas.addEventListener('pointerup', () => { focusedDuringUp = !!host.querySelector('textarea') && document.activeElement === host.querySelector('textarea'); });
  pointer(canvas, 'pointerup', { pointerType });
  expect(focusedDuringUp).toBe(true);
  const input = host.querySelector('textarea')!;
  act(() => input.blur());
  expect(host.querySelector('textarea')).toBe(input);
  expect(document.activeElement).toBe(input);
  expect(onChange).not.toHaveBeenCalled();
  const later = Date.now() + 401; vi.spyOn(Date, 'now').mockReturnValue(later);
  act(() => { input.value = 'Tablet text'; input.blur(); });
  expect(lastPage(onChange).strokes.at(-1)?.text).toBe('Tablet text');
});

it('typed text saves even when the box loses focus right away', () => {
  const { canvas, onChange } = mount({ tool: 'text' });
  pointer(canvas, 'pointerdown', { pointerType: 'mouse' }); pointer(canvas, 'pointerup', { pointerType: 'mouse' });
  const input = host.querySelector('textarea')!;
  act(() => { input.value = 'Quick'; input.blur(); });
  expect(lastPage(onChange).strokes.at(-1)?.text).toBe('Quick');
});

const type = (input: HTMLTextAreaElement, text: string) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
it.each(['pen', 'touch'])('typed text saves when a %s tap opens the next box without a blur', pointerType => {
  const { canvas, onChange } = mount({ tool: 'text' });
  pointer(canvas, 'pointerdown', { pointerType }); pointer(canvas, 'pointerup', { pointerType });
  type(host.querySelector('textarea')!, 'First');
  // Android keeps focus on the box when the pen taps the canvas (pointerdown is prevented).
  pointer(canvas, 'pointerdown', { pointerType, clientX: 300, clientY: 300 }); pointer(canvas, 'pointerup', { pointerType, clientX: 300, clientY: 300 });
  expect(lastPage(onChange).strokes.map(s => s.text)).toEqual(['First']);
  expect(host.querySelector('textarea')?.value).toBe('');
});
it('typed text saves when the canvas unmounts, such as leaving full screen', () => {
  const { canvas, onChange } = mount({ tool: 'text' });
  pointer(canvas, 'pointerdown'); pointer(canvas, 'pointerup');
  type(host.querySelector('textarea')!, 'Kept');
  act(() => root.unmount()); unmounted = true;
  expect(lastPage(onChange).strokes.map(s => s.text)).toEqual(['Kept']);
});
it('typed text saves when another tool is picked while the box is open', () => {
  const { canvas, onChange } = mount({ tool: 'text' });
  pointer(canvas, 'pointerdown'); pointer(canvas, 'pointerup');
  type(host.querySelector('textarea')!, 'Switch');
  mount({ tool: 'pen', onChange });
  expect(onChange.mock.calls.at(-1)![0].strokes.map((s: { text?: string }) => s.text)).toEqual(['Switch']);
  expect(host.querySelector('textarea')).toBeNull();
});

it.each(['pen', 'mouse', 'touch'])('edits an existing box with %s', pointerType => {
  const page = { ...blank(), strokes: [{ id: 'text', tool: 'pen' as const, width: 1, color: '#1c1917', createdAt: '', text: 'hello', points: encodePoints([{ x: 50, y: 50, p: 0.5 }]) }] };
  mount({ page, tool: 'text' });
  const box = host.querySelector('[data-ink-text]') as HTMLCanvasElement;
  pointer(box, 'pointerdown', { pointerType }); pointer(box, 'pointerup', { pointerType });
  expect(host.querySelector('textarea')?.value).toBe('hello');
  expect(document.activeElement).toBe(host.querySelector('textarea'));
});

it.each([{ width: 31 }, { isPrimary: false }, { drag: true }, { cancel: true }])('rejects non-tap touch text placement %j', options => {
  const { canvas } = mount({ tool: 'text' });
  const e = { pointerType: 'touch', ...options };
  pointer(canvas, 'pointerdown', e);
  if (options.drag) { pointer(canvas, 'pointermove', { ...e, clientY: 40 }); pointer(canvas, 'pointermove', e); }
  if (options.cancel) pointer(canvas, 'pointercancel', e);
  pointer(canvas, 'pointerup', e);
  expect(host.querySelector('textarea')).toBeNull();
});

it('ends temporary erasing on button release during contact; hover never erases', () => {
  const { canvas, onChange } = mount({ page: linePage(), eraserMode: 'stroke' });
  pointer(canvas, 'pointermove', { buttons: 3, pressure: 0, clientX: 50, clientY: 50 });
  expect(onChange).not.toHaveBeenCalled();
  pointer(canvas, 'pointerdown', { buttons: 3, clientX: 50, clientY: 50 });
  pointer(canvas, 'pointermove', { buttons: 1, clientX: 60, clientY: 60 });
  expect(onChange).toHaveBeenCalledTimes(1);
  pointer(canvas, 'pointerup', { buttons: 0 });
  pointer(canvas, 'pointerdown', { buttons: 1 }); pointer(canvas, 'pointerup', { clientX: 25 });
  expect(visibleStrokes(lastPage(onChange))).toHaveLength(1);
});
it('selection corner resize locks aspect ratio and is one undo step', () => {
  const { canvas, onChange, ref } = mount({ page: linePage(), tool: 'select' }); loop(canvas);
  pointer(canvas, 'pointerdown', { clientX: 70, clientY: 70 });
  pointer(canvas, 'pointermove', { clientX: 110, clientY: 110 });
  pointer(canvas, 'pointerup', { clientX: 110, clientY: 110 });
  expect(onChange).toHaveBeenCalledTimes(1);
  const stroke = visibleStrokes(lastPage(onChange))[0];
  expect(decodePoints(stroke.points)).toMatchObject([{ x: 30, y: 30 }, { x: 110, y: 110 }]);
  expect(stroke.width).toBe(8);
  act(() => ref.current!.undo());
  expect(visibleStrokes(lastPage(onChange))[0].width).toBe(4);
});
it('selection recolor, delete and duplicate each undo without duplicates', () => {
  const { canvas, onChange, ref } = mount({ page: linePage(), tool: 'select' }); loop(canvas);
  act(() => ref.current!.recolorSelection('#78716c'));
  expect(visibleStrokes(lastPage(onChange))[0].color).toBe('#78716c');
  act(() => ref.current!.undo());
  expect(visibleStrokes(lastPage(onChange))[0].color).toBe('#1c1917');
  loop(canvas); act(() => ref.current!.duplicateSelection());
  expect(visibleStrokes(lastPage(onChange))).toHaveLength(2);
  act(() => ref.current!.undo()); expect(visibleStrokes(lastPage(onChange))).toHaveLength(1);
  loop(canvas); act(() => ref.current!.deleteSelection());
  expect(visibleStrokes(lastPage(onChange))).toHaveLength(0);
  act(() => ref.current!.undo()); expect(visibleStrokes(lastPage(onChange))).toHaveLength(1);
});
it('device clipboard survives a page change; cut and paste are undoable', () => {
  const { canvas, onChange, ref } = mount({ page: linePage(), tool: 'select' }); loop(canvas);
  act(() => ref.current!.cutSelection()); expect(visibleStrokes(lastPage(onChange))).toHaveLength(0);
  const next = { ...blank(), page: 1 };
  act(() => root.render(React.createElement(InkCanvas, { page: next, paper: 'lined', tool: 'select', color: '#1c1917', width: 4, onChange, ref })));
  act(() => ref.current!.paste());
  expect(lastPage(onChange).page).toBe(1);
  expect(decodePoints(visibleStrokes(lastPage(onChange))[0].points)[0]).toMatchObject({ x: 50, y: 50 });
  act(() => ref.current!.undo()); expect(visibleStrokes(lastPage(onChange))).toHaveLength(0);
});
it('undoing snap then drawing removes the whole stroke; redo restores the shape', () => {
  vi.useFakeTimers();
  try {
    const { canvas, onChange, ref } = mount(); box(canvas); act(() => vi.advanceTimersByTime(700));
    pointer(canvas, 'pointerup', { clientX: 100, clientY: 100 });
    act(() => ref.current!.undo()); act(() => ref.current!.undo());
    expect(visibleStrokes(lastPage(onChange))).toHaveLength(0);
    act(() => ref.current!.redo()); act(() => ref.current!.redo());
    expect(visibleStrokes(lastPage(onChange))).toHaveLength(1);
    expect(decodePoints(visibleStrokes(lastPage(onChange))[0].points)).toHaveLength(5);
  } finally { vi.useRealTimers(); }
});
it('text drag returning to its start does not place a box; empty blur cancels a tap', () => {
  const { canvas, onChange } = mount({ tool: 'text' });
  pointer(canvas, 'pointerdown'); pointer(canvas, 'pointermove', { clientX: 100 }); pointer(canvas, 'pointerup');
  expect(host.querySelector('textarea')).toBeNull();
  pointer(canvas, 'pointerdown'); pointer(canvas, 'pointerup');
  expect(host.querySelector('textarea')).not.toBeNull();
  act(() => host.querySelector('textarea')!.blur());
  expect(onChange).not.toHaveBeenCalled();
});

it('select moves a text-only selection and undo restores its text and anchor', () => {
  const page = { ...blank(), strokes: [{ id: 'text', tool: 'pen' as const, width: 1, color: '#1c1917', createdAt: '', text: 'hello', points: encodePoints([{ x: 50, y: 50, p: 0.5 }]) }] };
  const { canvas, onChange, ref } = mount({ page, tool: 'select' }); loop(canvas);
  pointer(canvas, 'pointerdown', { clientX: 50, clientY: 50 });
  pointer(canvas, 'pointermove', { clientX: 150, clientY: 150 }); pointer(canvas, 'pointerup', { clientX: 150, clientY: 150 });
  let visible = lastPage(onChange).strokes.filter(s => !lastPage(onChange).removed.includes(s.id));
  expect(visible).toHaveLength(1); expect(visible[0].text).toBe('hello');
  expect(decodePoints(visible[0].points)[0]).toMatchObject({ x: 150, y: 150 });
  act(() => ref.current!.undo());
  visible = lastPage(onChange).strokes.filter(s => !lastPage(onChange).removed.includes(s.id));
  expect(visible).toHaveLength(1); expect(visible[0].text).toBe('hello');
  expect(decodePoints(visible[0].points)[0]).toMatchObject({ x: 50, y: 50 });
});
