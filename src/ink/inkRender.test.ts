import { expect, it, vi } from 'vitest';
import { drawPage, strokeOutline } from './inkRender';
import { encodePoints } from './inkModel';
import type { InkPage } from '../types/daymark';

it('scales pen width from 0.5 to 1.5 and keeps highlighter width constant', () => {
  const span = (p: number, tool: 'pen' | 'highlighter') => {
    const polygon = strokeOutline([{ x: 0, y: 0, p }, { x: 20, y: 0, p }], 10, tool);
    return Math.max(...polygon.map(p => p.y)) - Math.min(...polygon.map(p => p.y));
  };
  expect(span(0, 'pen')).toBe(5);
  expect(span(1, 'pen')).toBe(15);
  expect(span(0, 'highlighter')).toBe(10);
  expect(span(1, 'highlighter')).toBe(10);
});

it('draws highlighters at 35% before opaque pens and caches decoded points', () => {
  const fills: [string, number][] = [];
  const ctx = { beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fillStyle: '', globalAlpha: 1,
    fill(this: { fillStyle: string; globalAlpha: number }) { fills.push([this.fillStyle, this.globalAlpha]); } } as unknown as CanvasRenderingContext2D;
  const page: InkPage = { noteId: 'n', page: 0, removed: [], updatedAt: '', strokes: ['pen', 'highlighter'].map((tool, i) => ({
    id: String(i), tool: tool as 'pen' | 'highlighter', color: tool, width: 4,
    points: encodePoints([{ x: 1, y: 1, p: 0.5 }]), createdAt: '',
  })) };
  const cache = new Map();
  drawPage(ctx, page, cache);
  expect(fills).toEqual([['highlighter', 0.35], ['pen', 1]]);
  const decoded = cache.get('0');
  drawPage(ctx, page, cache);
  expect(cache.get('0')).toBe(decoded);
});

const stroke = (id: string, tool: 'pen' | 'highlighter', x: number, y: number, createdAt = '') => ({
  id, tool, color: id, width: 4, createdAt, points: encodePoints([{ x, y, p: 0.5 }, { x: x + 20, y, p: 0.5 }]),
});

it('finds strokes inserted in canonical order and rejects any other change', async () => {
  const { insertedStrokes } = await import('./inkRender');
  const [a, b, c, h] = [stroke('a', 'pen', 0, 0), stroke('b', 'pen', 0, 10), stroke('c', 'pen', 0, 20), stroke('h', 'highlighter', 0, 0)];
  expect(insertedStrokes([a, b], [h, a, b])).toEqual([h]);
  expect(insertedStrokes([a, b], [a, c, b])).toEqual([c]);
  expect(insertedStrokes([a, b], [a, b])).toEqual([]);
  expect(insertedStrokes([a, b], [b, a])).toBeNull();
  expect(insertedStrokes([a, b], [a])).toBeNull();
  expect(insertedStrokes([a, b], [a, { ...b }])).toBeNull();
  expect(insertedStrokes([], Array.from({ length: 9 }, (_, i) => stroke(String(i), 'pen', 0, i)))).toBeNull();
});

it('repaints only the inserted area, snapped to device pixels, in canonical order', async () => {
  const { redrawInserted } = await import('./inkRender');
  const fills: string[] = [];
  const ctx = { save: vi.fn(), restore: vi.fn(), rect: vi.fn(), clip: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fillStyle: '', globalAlpha: 1,
    fill(this: { fillStyle: string }) { fills.push(this.fillStyle); } } as unknown as CanvasRenderingContext2D;
  const highlight = stroke('highlight', 'highlighter', 100, 100, '2');
  const under = stroke('under', 'pen', 105, 101, '1'), far = stroke('far', 'pen', 600, 900, '1');
  redrawInserted(ctx, [highlight, under, far], [highlight], new Map(), 0.462);
  // The highlighter then the pen it crosses; the distant pen keeps its pixels.
  expect(fills).toEqual(['highlight', 'under']);
  const [x, y, w, h] = vi.mocked(ctx.clearRect).mock.calls[0];
  for (const v of [x, y, x + w, y + h]) expect(Math.abs(v * 0.462 - Math.round(v * 0.462))).toBeLessThan(1e-9);
  expect(x).toBeLessThanOrEqual(100 - 4); expect(x + w).toBeGreaterThanOrEqual(120 + 4);
  expect(ctx.clip).toHaveBeenCalled(); expect(ctx.restore).toHaveBeenCalled();
});

it('snaps the repaint area to whole device pixels on each axis with its own scale', async () => {
  const { redrawInserted } = await import('./inkRender');
  const ctx = { save: vi.fn(), restore: vi.fn(), rect: vi.fn(), clip: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(), fillStyle: '', globalAlpha: 1 } as unknown as CanvasRenderingContext2D;
  // A 924 x 1306 px backing store: x and y scales differ after rounding (0.924 vs 0.92362...).
  const kx = 924 / 1000, ky = 1306 / 1414;
  redrawInserted(ctx, [stroke('h', 'highlighter', 333.3, 777.7)], [stroke('h', 'highlighter', 333.3, 777.7)], new Map(), kx, ky);
  const [x, y, w, h] = vi.mocked(ctx.clearRect).mock.calls[0];
  const whole = (v: number, k: number) => Math.abs(v * k - Math.round(v * k)) < 1e-9;
  expect(whole(x, kx) && whole(x + w, kx)).toBe(true);
  expect(whole(y, ky) && whole(y + h, ky)).toBe(true);
  expect(vi.mocked(ctx.rect).mock.calls[0]).toEqual([x, y, w, h]);
});
