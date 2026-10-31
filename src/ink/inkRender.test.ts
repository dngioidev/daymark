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
