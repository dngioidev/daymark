import { describe, expect, it, vi } from 'vitest';
import type { InkPage, InkStroke } from '../types/daymark';
import { isInkPage } from '../utils/vaultValidation';
import { legacyEraseArea, legacyIsInkPage, legacyMergeInkPage } from './fixtures/legacyInk111';
import { decodePoints, encodePoints, eraseArea, eraseStrokes, visibleStrokes } from './inkModel';
import { drawPage, touchesStroke } from './inkRender';
import { createTextBox, isTextBox, replaceTextBox, TEXT_BOX_MAX, textBoxAnchor, visibleTextBoxes } from './inkText';

const before = '2026-11-06T01:00:00.000Z';
const now = '2026-11-06T02:00:00.000Z';
const anchor = { x: 100, y: 200 };
const page = (strokes: InkStroke[] = [], removed: string[] = []): InkPage => ({
  noteId: 'study', page: 0, strokes, removed, updatedAt: before,
});
const ink: InkStroke = {
  id: 'ink', tool: 'pen', color: '#292524', width: 2,
  points: encodePoints([{ ...anchor, p: 0.5 }]), createdAt: before,
};
const box = () => createTextBox('hello\nworld', anchor, '#292524', 'box', before);

describe('text boxes in ink pages', () => {
  it('stores a text box as one pen point at its anchor', () => {
    const s = box();
    expect(s).toMatchObject({ id: 'box', text: 'hello\nworld', tool: 'pen', width: 1, color: '#292524', createdAt: before });
    expect(decodePoints(s.points)).toEqual([{ x: 100, y: 200, p: 0.5 }]);
    expect(textBoxAnchor(s)).toEqual({ x: 100, y: 200 });
    expect(isTextBox(s)).toBe(true);
    expect(isTextBox({ ...s, text: '' })).toBe(true);
    expect(isTextBox(ink)).toBe(false);
  });

  it('a text box survives a 1.11 merge', () => {
    const withBox = page([box()]);
    const merged = legacyMergeInkPage(page(), withBox, page([ink]))!;
    expect(merged.strokes).toHaveLength(2);
    expect(merged.strokes.find(s => s.id === 'box')).toMatchObject({ text: 'hello\nworld' });
    expect(legacyMergeInkPage(page(), page([ink]), withBox)).toEqual(merged);
  });

  it('a 1.11 device accepts a page with a text box', () => {
    expect(legacyIsInkPage(page([box()]))).toBe(true);
  });

  it('1.11 area erase never duplicates a text box', () => {
    const newId = vi.fn(() => 'piece');
    const erased = legacyEraseArea(page([box()]), anchor, 10, newId, now);
    expect(erased.strokes).toHaveLength(1);
    expect(erased.strokes[0]).toMatchObject({ id: 'box', text: 'hello\nworld' });
    expect(newId).not.toHaveBeenCalled();
  });

  it('replaceTextBox tombstones the old id and adds one new box', () => {
    const original = page([ink, box()]);
    const changed = replaceTextBox(original, 'box', { text: 'edited', at: { x: 300, y: 400 }, color: '#ffffff' }, 'next', now);
    expect(changed.removed).toEqual(['box']);
    expect(changed.updatedAt).toBe(now);
    expect(changed.strokes).toHaveLength(3);
    expect(visibleTextBoxes(changed)).toEqual([expect.objectContaining({ id: 'next', text: 'edited', color: '#ffffff' })]);
    expect(textBoxAnchor(visibleTextBoxes(changed)[0])).toEqual({ x: 300, y: 400 });
    expect(original.removed).toEqual([]);
    expect(original.strokes[1].text).toBe('hello\nworld');
  });

  it('preserves omitted text-box fields when replacing', () => {
    const changed = replaceTextBox(page([box()]), 'box', { color: '#ffffff' }, 'next', now);
    expect(visibleTextBoxes(changed)[0]).toMatchObject({ id: 'next', text: 'hello\nworld', width: 1 });
    expect(textBoxAnchor(visibleTextBoxes(changed)[0])).toEqual(anchor);
  });

  it('empty text deletes the box', () => {
    const changed = replaceTextBox(page([box()]), 'box', { text: '' }, 'unused', now);
    expect(changed.removed).toEqual(['box']);
    expect(changed.strokes).toHaveLength(1);
    expect(visibleTextBoxes(changed)).toEqual([]);
    expect(changed.updatedAt).toBe(now);
  });

  it('does not replace a missing, removed or non-text stroke', () => {
    for (const original of [page(), page([box()], ['box']), page([{ ...ink, id: 'box' }])]) {
      expect(replaceTextBox(original, 'box', { text: 'edited' }, 'next', now)).toBe(original);
    }
  });

  it('eraseArea and whole-stroke erase leave text boxes alone', () => {
    const original = page([ink, box()]);
    const erased = eraseArea(original, anchor, 10, () => 'piece', now);
    expect(erased.removed).toEqual(['ink']);
    expect(visibleTextBoxes(erased)).toEqual([box()]);
    // Same hit-testing path as InkCanvas's whole-stroke eraser.
    const ids = visibleStrokes(original).filter(s => touchesStroke(decodePoints(s.points), { ...anchor, p: 0.5 }, 10)).map(s => s.id);
    expect(ids).toEqual(['ink']);
    expect(visibleTextBoxes(eraseStrokes(original, ids, now))).toEqual([box()]);
    expect(visibleStrokes(page([box()]))).toEqual([]);
  });

  it('isInkPage rejects text: 5 and text longer than TEXT_BOX_MAX', () => {
    expect(isInkPage(page([ink]))).toBe(true);
    expect(isInkPage(page([box()]))).toBe(true);
    expect(isInkPage(page([{ ...box(), text: 'x'.repeat(TEXT_BOX_MAX) }]))).toBe(true);
    expect(isInkPage({ ...page(), strokes: [{ ...ink, text: 5 }] })).toBe(false);
    expect(isInkPage(page([{ ...box(), text: 'x'.repeat(TEXT_BOX_MAX + 1) }]))).toBe(false);
  });

  it('drawPage does not draw text boxes', () => {
    const ctx = { beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fill: vi.fn() };
    drawPage(ctx as unknown as CanvasRenderingContext2D, page([box()]), new Map());
    for (const spy of Object.values(ctx)) expect(spy).not.toHaveBeenCalled();
    drawPage(ctx as unknown as CanvasRenderingContext2D, page([box(), ink]), new Map());
    expect(ctx.beginPath).toHaveBeenCalledTimes(1);
    expect(ctx.fill).toHaveBeenCalledTimes(1);
  });
});
