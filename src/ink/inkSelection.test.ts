import { describe, expect, it } from 'vitest';
import type { InkPage, InkStroke } from '../types/daymark';
import { decodePoints, encodePoints, mergeInkPage, PAGE_HEIGHT, PAGE_WIDTH } from './inkModel';
import { createTextBox, visibleTextBoxes } from './inkText';
import {
  copyStrokes, deleteStrokes, LASSO_INSIDE_RATIO, lassoSelect, pasteStrokes,
  recolorStrokes, selectionBounds, transformStrokes,
} from './inkSelection';
import type { Loop, Transform } from './inkSelection';

const before = '2026-11-06T01:00:00.000Z';
const now = '2026-11-06T02:00:00.000Z';
const point = (x: number, y = 20, p = 0.5) => ({ x, y, p });
const stroke = (id: string, points = [point(10), point(30, 40)], extra: Partial<InkStroke> = {}): InkStroke => ({
  id, tool: 'pen', color: '#292524', width: 2, points: encodePoints(points), createdAt: before, ...extra,
});
const page = (strokes: InkStroke[] = [], removed: string[] = []): InkPage => ({
  noteId: 'study', page: 0, strokes, removed, updatedAt: before,
});
const box = (id = 'box') => createTextBox('hello', { x: 25, y: 30 }, '#292524', id, before);
const loop: Loop = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
const move: Transform = { dx: 100, dy: 50, scale: 1, originX: 0, originY: 0 };
const freshIds = () => { let id = 0; return () => `new-${++id}`; };
const visible = (p: InkPage) => p.strokes.filter(s => !p.removed.includes(s.id));

describe('lasso selection', () => {
  it('picks a stroke with at least 60% points inside and not one with 40%', () => {
    const original = page([
      stroke('sixty', [point(10), point(20), point(30), point(110), point(120)]),
      stroke('forty', [point(10), point(20), point(110), point(120), point(130)]),
      stroke('gone'),
    ], ['gone']);
    expect(LASSO_INSIDE_RATIO).toBe(0.6);
    expect(lassoSelect(original, loop)).toEqual(['sixty']);
  });

  it('picks a text box whose anchor is inside, including the loop boundary', () => {
    const outside = createTextBox('outside', { x: 200, y: 30 }, '#292524', 'outside', before);
    expect(lassoSelect(page([box(), outside, stroke('edge', [point(0, 50)])]), loop)).toEqual(['box', 'edge']);
  });

  it('uses the even-odd rule for a concave loop in either direction', () => {
    const concave: Loop = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 },
      { x: 40, y: 40 }, { x: 40, y: 100 }, { x: 0, y: 100 }];
    const original = page([stroke('inside', [point(20, 80)]), stroke('notch', [point(80, 80)])]);
    expect(lassoSelect(original, concave)).toEqual(['inside']);
    expect(lassoSelect(original, [...concave].reverse())).toEqual(['inside']);
  });

  it('handles empty strokes and loops with fewer than three vertices', () => {
    expect(lassoSelect(page([stroke('empty', [])]), loop)).toEqual([]);
    expect(lassoSelect(page([stroke('line')]), loop.slice(0, 2))).toEqual([]);
  });

  it('bounds only visible selected geometry, including text anchors', () => {
    const original = page([stroke('line'), box(), stroke('gone', [point(900, 900)])], ['gone']);
    expect(selectionBounds(original, ['line', 'box', 'gone', 'missing'])).toEqual({ minX: 10, minY: 20, maxX: 30, maxY: 40 });
    expect(selectionBounds(original, ['box'])).toEqual({ minX: 25, minY: 30, maxX: 25, maxY: 30 });
    expect(selectionBounds(original, ['gone', 'missing'])).toBeNull();
    expect(selectionBounds(page([stroke('empty', [])]), ['empty'])).toBeNull();
  });
});

describe('selection edits', () => {
  it('transform tombstones originals and adds the same count of new strokes without mutation', () => {
    const original = page([stroke('line', undefined, { tool: 'highlighter' }), box(), stroke('other'), stroke('gone')], ['gone']);
    const snapshot = structuredClone(original);
    const result = transformStrokes(original, ['line', 'box', 'line', 'gone', 'missing'], move, freshIds(), now);
    expect(result.ids).toEqual(['new-1', 'new-2']);
    expect(result.page.removed).toEqual(['gone', 'line', 'box']);
    expect(result.page.strokes).toHaveLength(6);
    expect(visible(result.page).map(s => s.id)).toEqual(['other', 'new-1', 'new-2']);
    expect(result.page.strokes[4]).toEqual({ ...original.strokes[0], id: 'new-1', points: encodePoints([point(110, 70), point(130, 90)]) });
    expect(result.page.updatedAt).toBe(now);
    expect(original).toEqual(snapshot);
  });

  it('scale 2 around origin doubles distances from origin and scales ink width', () => {
    const result = transformStrokes(page([stroke('line', [point(20, 30, 0.3), point(40, 50, 0.8)])]), ['line'],
      { dx: 5, dy: 7, scale: 2, originX: 10, originY: 20 }, freshIds(), now);
    const transformed = visible(result.page)[0];
    expect(decodePoints(transformed.points)).toEqual([point(35, 47, 0.3), point(75, 87, 0.8)]);
    expect(transformed.width).toBe(4);
  });

  it('transform keeps text and createdAt while text width stays 1', () => {
    const result = transformStrokes(page([box()]), ['box'], { ...move, scale: 2 }, freshIds(), now);
    expect(visibleTextBoxes(result.page)).toEqual([{ ...box(), id: 'new-1', points: encodePoints([point(150, 110)]) }]);
  });

  it('recolor changes color only on replacements of visible selected strokes', () => {
    const original = page([stroke('line'), box(), stroke('gone')], ['gone']);
    const result = recolorStrokes(original, ['line', 'box', 'gone', 'missing'], '#ffffff', freshIds(), now);
    expect(result.ids).toEqual(['new-1', 'new-2']);
    expect(visible(result.page)).toEqual([
      { ...original.strokes[0], id: 'new-1', color: '#ffffff' },
      { ...original.strokes[1], id: 'new-2', color: '#ffffff' },
    ]);
    expect(result.page.removed).toEqual(['gone', 'line', 'box']);
    expect(result.page.updatedAt).toBe(now);
    expect(original.strokes[0].color).toBe('#292524');
  });

  it('delete tombstones selected ink and text without deleting stroke records', () => {
    const original = page([stroke('line'), box(), stroke('other')]);
    const deleted = deleteStrokes(original, ['line', 'box', 'line'], now);
    expect(deleted.removed).toEqual(['line', 'box']);
    expect(deleted.strokes).toEqual(original.strokes);
    expect(visible(deleted).map(s => s.id)).toEqual(['other']);
    expect(deleted.updatedAt).toBe(now);
    expect(original.removed).toEqual([]);
  });

  it('copy produces detached visible strokes, including text', () => {
    const original = page([stroke('line'), box(), stroke('gone')], ['gone']);
    const clip = copyStrokes(original, ['line', 'box', 'gone', 'missing', 'line']);
    expect(clip).toEqual(original.strokes.slice(0, 2));
    clip[0].color = '#ffffff';
    clip[1].text = 'edited';
    expect(original.strokes[0].color).toBe('#292524');
    expect(original.strokes[1].text).toBe('hello');
  });

  it('paste adds new ids and offsets while leaving the clip and destination untouched', () => {
    const clip = [stroke('line'), box()];
    const snapshot = structuredClone(clip);
    const original = page([stroke('existing')]);
    const result = pasteStrokes(original, clip, { dx: 100, dy: 50 }, freshIds(), now);
    expect(result.ids).toEqual(['new-1', 'new-2']);
    expect(result.page.strokes).toEqual([original.strokes[0],
      { ...clip[0], id: 'new-1', points: encodePoints([point(110, 70), point(130, 90)]) },
      { ...clip[1], id: 'new-2', points: encodePoints([point(125, 80)]) },
    ]);
    expect(result.page.removed).toEqual([]);
    expect(result.page.updatedAt).toBe(now);
    result.page.strokes[2].text = 'changed';
    expect(clip).toEqual(snapshot);
    expect(original.strokes).toHaveLength(1);
  });

  it('two devices moving the same strokes merge to both results, nothing lost', () => {
    const base = page([stroke('line'), box()]);
    const a = transformStrokes(base, ['line', 'box'], move, (() => { let i = 0; return () => `a-${++i}`; })(), now);
    const b = transformStrokes(base, ['line', 'box'], { ...move, dx: 200 }, (() => { let i = 0; return () => `b-${++i}`; })(), now);
    const merged = mergeInkPage(base, a.page, b.page)!;
    expect(visible(merged).map(s => s.id)).toEqual(['a-1', 'a-2', 'b-1', 'b-2']);
    expect(visibleTextBoxes(merged).map(s => s.text)).toEqual(['hello', 'hello']);
    expect(mergeInkPage(base, b.page, a.page)).toEqual(merged);
  });

  it('inverse edit restores a moved text box with no visible duplicate', () => {
    const original = page([box()]);
    const saved = copyStrokes(original, ['box']);
    const moved = transformStrokes(original, ['box'], move, () => 'moved', now);
    const undone = pasteStrokes(deleteStrokes(moved.page, moved.ids, now), saved, { dx: 0, dy: 0 }, () => 'restored', now);
    expect(visibleTextBoxes(undone.page)).toEqual([{ ...box(), id: 'restored' }]);
  });

  it('transform and paste clamp coordinates to every page edge', () => {
    const original = page([stroke('line', [point(0, 0), point(PAGE_WIDTH, PAGE_HEIGHT)])]);
    const transformed = transformStrokes(original, ['line'], { ...move, dx: -50, dy: -70, scale: 2 }, freshIds(), now);
    expect(decodePoints(visible(transformed.page)[0].points)).toEqual([point(0, 0), point(PAGE_WIDTH, PAGE_HEIGHT)]);
    const pasted = pasteStrokes(page(), original.strokes, { dx: PAGE_WIDTH, dy: PAGE_HEIGHT }, freshIds(), now);
    expect(decodePoints(pasted.page.strokes[0].points)).toEqual([point(PAGE_WIDTH, PAGE_HEIGHT), point(PAGE_WIDTH, PAGE_HEIGHT)]);
  });

  it('empty or stale selections are no-ops and allocate no ids', () => {
    const original = page([stroke('gone')], ['gone']);
    const newId = () => { throw new Error('no ids should be allocated'); };
    expect(transformStrokes(original, ['gone', 'missing'], move, newId, now)).toEqual({ page: original, ids: [] });
    expect(recolorStrokes(original, [], '#ffffff', newId, now)).toEqual({ page: original, ids: [] });
    expect(deleteStrokes(original, ['gone', 'missing'], now)).toBe(original);
    expect(pasteStrokes(original, [], { dx: 0, dy: 0 }, newId, now)).toEqual({ page: original, ids: [] });
  });
});
