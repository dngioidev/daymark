import type { InkPage, InkStroke, InkTool } from '../types/daymark';
import { decodePoints, visibleStrokes } from './inkModel';

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
    if (tool && stroke.tool !== tool) continue;
    let points = cache.get(stroke.id);
    if (!points) { points = decodePoints(stroke.points); cache.set(stroke.id, points); }
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
