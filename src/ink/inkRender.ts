import type { InkPage, InkStroke, InkTool } from '../types/daymark';
import { cacheStrokeGeometry, decodePoints, visibleStrokes } from './inkModel';
import { isTextBox } from './inkText';

export type InkPoint = ReturnType<typeof decodePoints>[number];
export type PointCache = Map<string, InkPoint[]>;

/** A filled ribbon with averaged tangents and round caps, including single-point taps. */
export function strokeOutline(points: readonly InkPoint[], width: number, tool: InkTool): { x: number; y: number }[] {
  if (!points.length) return [];
  const radius = (p: InkPoint) => Math.max(0, width) * (tool === 'pen' ? 0.5 + Math.max(0, Math.min(1, p.p)) : 1) / 2;
  const cap = (p: InkPoint, angle: number, from: number, to: number) => Array.from({ length: 13 }, (_, i) => {
    const a = angle + from + (to - from) * i / 12;
    return { x: p.x + Math.cos(a) * radius(p), y: p.y + Math.sin(a) * radius(p) };
  });
  if (points.length === 1) return cap(points[0], 0, 0, Math.PI * 2);
  const angles = points.map((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    return Math.atan2(b.y - a.y, b.x - a.x);
  });
  const side = (sign: number) => points.map((p, i) => ({ x: p.x - Math.sin(angles[i]) * radius(p) * sign, y: p.y + Math.cos(angles[i]) * radius(p) * sign }));
  return [...side(1), ...cap(points.at(-1)!, angles.at(-1)!, Math.PI / 2, -Math.PI / 2), ...side(-1).reverse(), ...cap(points[0], angles[0], -Math.PI / 2, -Math.PI * 1.5)];
}

export function drawStroke(ctx: CanvasRenderingContext2D, points: readonly InkPoint[], stroke: Pick<InkStroke, 'tool' | 'width' | 'color'>, opacity = stroke.tool === 'highlighter' ? 0.35 : 1) {
  const outline = strokeOutline(points, stroke.width, stroke.tool);
  if (!outline.length) return;
  ctx.globalAlpha = opacity;
  ctx.fillStyle = stroke.color;
  ctx.beginPath(); ctx.moveTo(outline[0].x, outline[0].y);
  for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i].x, outline[i].y);
  ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
}

export function drawPage(ctx: CanvasRenderingContext2D, page: InkPage, cache: PointCache, tool?: InkTool) {
  for (const stroke of visibleStrokes(page)) {
    if (isTextBox(stroke)) continue;
    if (tool && stroke.tool !== tool) continue;
    let points = cache.get(stroke.id);
    if (!points) { points = decodePoints(stroke.points); cache.set(stroke.id, points); }
    cacheStrokeGeometry(stroke, points);
    drawStroke(ctx, points, stroke);
  }
}

/** Distance to segments (not just sampled vertices), used by the whole-stroke eraser. */
export function touchesStroke(points: readonly InkPoint[], center: InkPoint, radius: number): boolean {
  return points.some((b, i) => {
    const a = points[Math.max(0, i - 1)];
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((center.x - a.x) * dx + (center.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return (a.x + t * dx - center.x) ** 2 + (a.y + t * dy - center.y) ** 2 <= radius ** 2;
  });
}

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/** Strokes inserted into `before` to give `after` (same objects, same relative order), or null if anything else changed. */
export function insertedStrokes(before: readonly InkStroke[], after: readonly InkStroke[], limit = 8): InkStroke[] | null {
  if (after.length < before.length || after.length - before.length > limit) return null;
  const inserted: InkStroke[] = [];
  let kept = 0;
  for (const stroke of after) {
    if (kept < before.length && before[kept] === stroke) kept++;
    else inserted.push(stroke);
  }
  return kept === before.length ? inserted : null;
}

function strokeBounds(stroke: InkStroke, cache: PointCache): Bounds {
  let points = cache.get(stroke.id);
  if (!points) { points = decodePoints(stroke.points); cache.set(stroke.id, points); }
  const { minX, minY, maxX, maxY } = cacheStrokeGeometry(stroke, points);
  // The widest pen radius (full pressure) plus a pixel of antialiasing.
  const pad = Math.max(0, stroke.width) * 0.75 + 1;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

/**
 * Repaints only the area of the `inserted` strokes, in the page's canonical order (`visible`):
 * highlighters stay under pen ink without redrawing the whole page. The area is snapped to whole
 * device pixels on each axis (`pixelsX`/`pixelsY` per page unit, which differ after the backing
 * store is rounded), so its pixels equal a full redraw and the rest are untouched.
 */
export function redrawInserted(ctx: CanvasRenderingContext2D, visible: readonly InkStroke[], inserted: readonly InkStroke[], cache: PointCache, pixelsX: number, pixelsY = pixelsX) {
  if (!inserted.length) return;
  const area = inserted.map(stroke => strokeBounds(stroke, cache)).reduce((a, b) => ({
    minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY),
  }));
  const kx = pixelsX > 0 ? pixelsX : 1, ky = pixelsY > 0 ? pixelsY : 1;
  const x0 = Math.floor(area.minX * kx) / kx, y0 = Math.floor(area.minY * ky) / ky;
  const x1 = Math.ceil(area.maxX * kx) / kx, y1 = Math.ceil(area.maxY * ky) / ky;
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
  ctx.clearRect(x0, y0, x1 - x0, y1 - y0);
  for (const stroke of visible) {
    const b = strokeBounds(stroke, cache);
    if (b.maxX < x0 || b.minX > x1 || b.maxY < y0 || b.minY > y1) continue;
    drawStroke(ctx, cache.get(stroke.id)!, stroke);
  }
  ctx.restore();
}
