import type { InkPage, InkStroke } from '../types/daymark';
import { cacheStrokeGeometry, decodePoints, encodePoints, eraseStrokes, PAGE_HEIGHT, PAGE_WIDTH } from './inkModel';
import { clampBoxWidth, clampTextSize, isTextBox, textBoxBounds, TEXT_SIZE } from './inkText';

export type Loop = { x: number; y: number }[];
export const LASSO_INSIDE_RATIO = 0.6; // share of a stroke's points inside the loop
export type Transform = { dx: number; dy: number; scale: number; originX: number; originY: number };

function selectedStrokes(page: InkPage, ids: string[]): InkStroke[] {
  const selected = new Set(ids);
  const removed = new Set(page.removed);
  return page.strokes.filter(s => selected.has(s.id) && !removed.has(s.id));
}

function strokeGeometry(stroke: InkStroke) {
  return cacheStrokeGeometry(stroke, decodePoints(stroke.points));
}

// Even-odd ray casting works for concave loops too. Points on an edge are inside.
function insideLoop(point: { x: number; y: number }, loop: Loop): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[j], b = loop[i];
    const cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x);
    if (cross === 0 && point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x)
      && point.y >= Math.min(a.y, b.y) && point.y <= Math.max(a.y, b.y)) return true;
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function lassoSelect(page: InkPage, loop: Loop): string[] {
  if (loop.length < 3) return [];
  const removed = new Set(page.removed);
  return page.strokes.filter(stroke => {
    if (removed.has(stroke.id)) return false;
    const { points } = strokeGeometry(stroke);
    if (!points.length) return false;
    if (isTextBox(stroke)) return insideLoop(points[0], loop);
    return points.filter(point => insideLoop(point, loop)).length / points.length >= LASSO_INSIDE_RATIO;
  }).map(s => s.id);
}

export function selectionBounds(page: InkPage, ids: string[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const stroke of selectedStrokes(page, ids)) {
    const geometry = strokeGeometry(stroke);
    if (!geometry.points.length) continue;
    const bounds = isTextBox(stroke) ? textBoxBounds(stroke) : geometry;
    minX = Math.min(minX, bounds.minX); minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX); maxY = Math.max(maxY, bounds.maxY);
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

function transformedStroke(stroke: InkStroke, t: Transform, id: string): InkStroke {
  const points = strokeGeometry(stroke).points.map(point => ({
    x: Math.max(0, Math.min(PAGE_WIDTH, t.originX + (point.x - t.originX) * t.scale + t.dx)),
    y: Math.max(0, Math.min(PAGE_HEIGHT, t.originY + (point.y - t.originY) * t.scale + t.dy)),
    p: point.p,
  }));
  if (!isTextBox(stroke)) return { ...stroke, id, points: encodePoints(points), width: stroke.width * t.scale };
  const next: InkStroke = { ...stroke, id, points: encodePoints(points), width: 1 };
  if (stroke.fontSize !== undefined || t.scale !== 1) next.fontSize = clampTextSize((stroke.fontSize ?? TEXT_SIZE) * t.scale);
  if (stroke.boxWidth !== undefined) next.boxWidth = clampBoxWidth(stroke.boxWidth * t.scale, points[0].x);
  return next;
}

function replaceStrokes(page: InkPage, ids: string[], replace: (stroke: InkStroke) => InkStroke, now: string): { page: InkPage; ids: string[] } {
  const originals = selectedStrokes(page, ids);
  if (!originals.length) return { page, ids: [] };
  const replacements = originals.map(replace);
  const removed = eraseStrokes(page, originals.map(s => s.id), now);
  return { page: { ...removed, strokes: [...page.strokes, ...replacements] }, ids: replacements.map(s => s.id) };
}

export function transformStrokes(page: InkPage, ids: string[], t: Transform, newId: () => string, now: string): { page: InkPage; ids: string[] } {
  return replaceStrokes(page, ids, stroke => transformedStroke(stroke, t, newId()), now);
}

export function recolorStrokes(page: InkPage, ids: string[], color: string, newId: () => string, now: string): { page: InkPage; ids: string[] } {
  return replaceStrokes(page, ids, stroke => ({ ...stroke, id: newId(), color }), now);
}

export function deleteStrokes(page: InkPage, ids: string[], now: string): InkPage {
  const selected = selectedStrokes(page, ids);
  return selected.length ? eraseStrokes(page, selected.map(s => s.id), now) : page;
}

export function copyStrokes(page: InkPage, ids: string[]): InkStroke[] {
  // InkStroke fields are primitives, including the encoded points string.
  return selectedStrokes(page, ids).map(stroke => ({ ...stroke }));
}

export function pasteStrokes(page: InkPage, clip: InkStroke[], offset: { dx: number; dy: number }, newId: () => string, now: string): { page: InkPage; ids: string[] } {
  if (!clip.length) return { page, ids: [] };
  const t: Transform = { ...offset, scale: 1, originX: 0, originY: 0 };
  const strokes = clip.map(stroke => transformedStroke(stroke, t, newId()));
  return { page: { ...page, strokes: [...page.strokes, ...strokes], updatedAt: now }, ids: strokes.map(s => s.id) };
}
