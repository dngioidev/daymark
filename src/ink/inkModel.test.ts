import { describe, expect, it, vi } from 'vitest';
import type { InkPage, InkStroke } from '../types/daymark';
import {
  addStroke, decodePoints, encodePoints, eraseArea, eraseStrokes, inkKey,
  isInkEntityKey, mergeInkPage, PAGE_HEIGHT, PAGE_WIDTH, parseInkKey, visibleStrokes,
} from './inkModel';

const before = '2026-11-01T01:00:00.000Z';
const now = '2026-11-01T02:00:00.000Z';
const point = (x: number, y = 100) => ({ x, y, p: 0.5 });
const stroke = (id: string, points = [point(0), point(100)], extra: Partial<InkStroke> = {}): InkStroke => ({
  id, tool: 'pen', color: '#292524', width: 2, points: encodePoints(points), createdAt: before, ...extra,
});
const page = (strokes: InkStroke[] = [], removed: string[] = []): InkPage => ({
  noteId: 'study', page: 0, strokes, removed, updatedAt: before,
});

describe('point codec', () => {
  it('round-trips negative deltas, fractional values, large jumps and 3,000 points without accumulated error', () => {
    const points = Array.from({ length: 3000 }, (_, i) => ({
      x: i % 2 ? 20000.4 - i : -20000.3 + i,
      y: (i * 13.13) % PAGE_HEIGHT,
      p: (i % 1001) / 1000 + 0.0004,
    }));
    const decoded = decodePoints(encodePoints(points));
    expect(decoded).toHaveLength(points.length);
    decoded.forEach((p, i) => {
      expect(Math.abs(p.x - points[i].x)).toBeLessThanOrEqual(1);
      expect(Math.abs(p.y - points[i].y)).toBeLessThanOrEqual(1);
      expect(Math.abs(p.p - points[i].p)).toBeLessThanOrEqual(0.001);
    });
    expect(decodePoints(encodePoints([point(PAGE_WIDTH, PAGE_HEIGHT)]))).toEqual([point(1000, 1414)]);
  });

  it('uses absolute first triples followed by zigzag unsigned LEB128 deltas', () => {
    // (1, 2, 500), then delta (-1, 1, -1).
    expect(encodePoints([{ x: 1, y: 2, p: 0.5 }, { x: 0, y: 3, p: 0.499 }])).toBe('AgToBwECAQ==');
    expect(decodePoints('AgToBwECAQ==')).toEqual([{ x: 1, y: 2, p: 0.5 }, { x: 0, y: 3, p: 0.499 }]);
  });

  it('handles empty input and rejects truncated triples and nonfinite coordinates', () => {
    expect(encodePoints([])).toBe('');
    expect(decodePoints('')).toEqual([]);
    expect(() => decodePoints('gA==')).toThrow();
    expect(() => decodePoints('AA==')).toThrow();
    expect(() => encodePoints([point(Infinity)])).toThrow();
  });
});

describe('ink entity keys', () => {
  it('round-trips nonnegative page indexes', () => {
    expect(inkKey('study', 12)).toBe('ink:study:12');
    expect(parseInkKey(inkKey('study', 0))).toEqual({ noteId: 'study', page: 0 });
    expect(isInkEntityKey('ink:study:12')).toBe(true);
  });
  it.each(['ink:a:b', 'ink::1', 'doc:2026-10-01', 'ink:a:-1', 'ink:a:1.5', 'ink:a:1:2', 'ink:a:9007199254740992'])('rejects %s', key => {
    expect(parseInkKey(key)).toBeNull();
    expect(isInkEntityKey(key)).toBe(false);
  });
});

describe('ink editing', () => {
  it('adds without mutating the page or duplicating a stable id', () => {
    const original = page();
    const added = addStroke(original, stroke('a'), now);
    expect(original.strokes).toEqual([]);
    expect(added.strokes.map(s => s.id)).toEqual(['a']);
    expect(added.updatedAt).toBe(now);
    expect(addStroke(added, stroke('a'), now).strokes).toHaveLength(1);
  });

  it('erases only named ids, records unknown ids and never resurrects tombstoned ids', () => {
    const original = page([stroke('a'), stroke('b')]);
    const erased = eraseStrokes(original, ['a', 'a', 'unknown'], now);
    expect(visibleStrokes(erased).map(s => s.id)).toEqual(['b']);
    expect(erased.removed).toEqual(['a', 'unknown']);
    expect(erased.updatedAt).toBe(now);
    expect(erased.strokes).toEqual(original.strokes);
    expect(original.removed).toEqual([]);
    expect(visibleStrokes(addStroke(erased, stroke('a'), now)).map(s => s.id)).toEqual(['b']);
  });

  it('orders highlighters before pens, then by createdAt with stable id ties', () => {
    const original = page([
      stroke('p2', undefined, { createdAt: now }), stroke('h2', undefined, { tool: 'highlighter', createdAt: now }),
      stroke('p1'), stroke('h1', undefined, { tool: 'highlighter' }), stroke('gone'),
    ], ['gone']);
    expect(visibleStrokes(original).map(s => s.id)).toEqual(['h1', 'h2', 'p1', 'p2']);
    expect(original.strokes[0].id).toBe('p2');
  });

  it('area erase through a horizontal stroke leaves left and right runs and no ink inside the radius', () => {
    const original = page([stroke('line', Array.from({ length: 11 }, (_, i) => point(i * 10)))]);
    let id = 0;
    const erased = eraseArea(original, { x: 50, y: 100 }, 15, () => `piece-${++id}`, now);
    const runs = visibleStrokes(erased).map(s => decodePoints(s.points));
    expect(erased.removed).toEqual(['line']);
    expect(runs).toHaveLength(2);
    expect(runs[0][0].x).toBe(0);
    expect(runs[0].at(-1)!.x).toBe(35);
    expect(runs[1][0].x).toBe(65);
    expect(runs[1].at(-1)!.x).toBe(100);
    expect(runs.flat().every(p => Math.abs(p.x - 50) >= 15)).toBe(true);
    expect(visibleStrokes(erased).every(s => s.color === '#292524' && s.width === 2)).toBe(true);
    expect(erased.updatedAt).toBe(now);
    expect(original.removed).toEqual([]);
  });

  it('cuts a sparse crossing segment even when neither sample is inside', () => {
    let id = 0;
    const erased = eraseArea(page([stroke('sparse')]), { x: 50, y: 100 }, 10, () => `cut-${++id}`, now);
    expect(visibleStrokes(erased).map(s => decodePoints(s.points).map(p => p.x))).toEqual([[0, 40], [60, 100]]);
  });

  it('handles full erasure, isolated points, misses and already removed strokes', () => {
    const original = page([stroke('dot', [point(50)]), stroke('far', [point(500)]), stroke('gone')], ['gone']);
    const erased = eraseArea(original, { x: 50, y: 100 }, 20, () => { throw new Error('no pieces expected'); }, now);
    expect(visibleStrokes(erased).map(s => s.id)).toEqual(['far']);
    expect(erased.removed).toEqual(['gone', 'dot']);
    expect(eraseArea(original, { x: 900, y: 900 }, 10, () => '', now)).toEqual(original);
  });
});

describe('lossless page merge', () => {
  it('unions both additions, base-only strokes and removals from either side, commutatively and idempotently', () => {
    const base = page([stroke('base'), stroke('left-removed'), stroke('right-removed')]);
    const ours = page([stroke('ours'), stroke('left-removed')], ['left-removed']);
    const theirs = { ...page([stroke('theirs'), stroke('right-removed')], ['right-removed']), updatedAt: now };
    const merged = mergeInkPage(base, ours, theirs)!;
    expect(visibleStrokes(merged).map(s => s.id)).toEqual(['base', 'ours', 'theirs']);
    expect(merged.strokes).toHaveLength(5);
    expect(merged.removed).toEqual(['left-removed', 'right-removed']);
    expect(merged.updatedAt).toBe(now);
    expect(mergeInkPage(base, theirs, ours)).toEqual(merged);
    expect(mergeInkPage(base, merged, merged)).toEqual(merged);
    expect(ours.strokes).toHaveLength(2);
  });

  it('returns null only when both sides are null and preserves a surviving side with base tombstones', () => {
    const base = page([stroke('base')], ['old-removal']);
    expect(mergeInkPage(base, null, null)).toBeNull();
    const merged = mergeInkPage(base, null, page([stroke('new')]))!;
    expect(merged.strokes.map(s => s.id)).toEqual(['base', 'new']);
    expect(merged.removed).toEqual(['old-removal']);
    expect(mergeInkPage(base, page([stroke('new')]), null)).toEqual(merged);
  });

  it('resolves duplicate ids deterministically without duplicate records', () => {
    const a = page([stroke('same')]);
    const b = page([stroke('same', undefined, { color: '#ffffff' })]);
    const merged = mergeInkPage(null, a, b)!;
    expect(merged.strokes).toHaveLength(1);
    expect(mergeInkPage(null, b, a)).toEqual(merged);
  });
});

it('serializes 2,000 strokes x 60 points below 1,000,000 bytes with realistic writing paths (0..8 unit random-walk steps)', () => {
  let seed = 14;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  const strokes = Array.from({ length: 2000 }, (_, i) => {
    let x = 200 + i % 500;
    let y = 200 + i % 900;
    const points = Array.from({ length: 60 }, () => {
      x = Math.max(0, Math.min(PAGE_WIDTH, x + random() % 17 - 8));
      y = Math.max(0, Math.min(PAGE_HEIGHT, y + random() % 17 - 8));
      return { x, y, p: 0.5 + (random() % 41 - 20) / 1000 };
    });
    return stroke(`stroke-${i.toString().padStart(6, '0')}`, points);
  });
  const bytes = new TextEncoder().encode(JSON.stringify(page(strokes))).length;
  expect(bytes).toBeLessThan(1_000_000);
  console.info(`Ink page fixture: ${bytes} bytes`);
});

it('reuses stroke bounds so miss-only sweeps do not decode any points again', () => {
  const original = page([stroke('cached-bounds')]);
  eraseArea(original, { x: 900, y: 900 }, 3, () => '', now);
  const decode = vi.spyOn(globalThis, 'atob');
  try {
    for (let i = 0; i < 10; i++) eraseArea(original, { x: 900 + i, y: 900 }, 3, () => '', now);
    expect(decode).not.toHaveBeenCalled();
  } finally { decode.mockRestore(); }
});

it('keeps surviving area-eraser pieces in their original layer below later pen strokes', () => {
  const original = page([stroke('old'), stroke('later', [point(0, 105), point(100, 105)], { createdAt: now })]);
  let id = 0;
  const erased = eraseArea(original, { x: 50, y: 100 }, 3, () => 'piece-' + ++id, '2026-11-02');
  const visible = visibleStrokes(erased);
  expect(visible.map(s => s.id)).toEqual(['piece-1', 'piece-2', 'later']);
  expect(visible.slice(0, 2).map(s => s.createdAt)).toEqual([before, before]);
});
