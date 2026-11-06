// Frozen 1.11 implementation from git 2c84344. Keep function bodies verbatim.
import type { InkPage, InkStroke } from '../../types/daymark';

export const PAGE_WIDTH = 1000;
export const PAGE_HEIGHT = 1414;

type Point = { x: number; y: number; p: number };
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

// Base64 of zigzag unsigned LEB128 triples: rounded x, y, pressure*1000.
// The first triple is absolute; later triples are deltas of the rounded values.
export function encodePoints(points: Point[]): string {
  const bytes: number[] = [];
  const previous = [0, 0, 0];
  for (const point of points) {
    const values = [Math.round(point.x), Math.round(point.y), Math.round(point.p * 1000)];
    values.forEach((value, axis) => {
      const delta = value - previous[axis];
      let unsigned = delta < 0 ? -delta * 2 - 1 : delta * 2;
      if (!Number.isSafeInteger(value) || !Number.isSafeInteger(unsigned)) {
        throw new RangeError('Ink coordinate exceeds safe varint range');
      }
      do {
        const byte = unsigned % 128;
        unsigned = Math.floor(unsigned / 128);
        bytes.push(byte + (unsigned ? 128 : 0));
      } while (unsigned);
      previous[axis] = value;
    });
  }
  return btoa(bytes.map(byte => String.fromCharCode(byte)).join(''));
}

export function decodePoints(s: string): Point[] {
  const bytes = atob(s);
  const points: Point[] = [];
  const previous = [0, 0, 0];
  let offset = 0;
  while (offset < bytes.length) {
    for (let axis = 0; axis < 3; axis++) {
      let unsigned = 0;
      let scale = 1;
      let byte: number;
      do {
        if (offset >= bytes.length) throw new Error('Truncated ink point');
        byte = bytes.charCodeAt(offset++);
        unsigned += (byte & 127) * scale;
        if (!Number.isSafeInteger(unsigned) || scale > 2 ** 49) throw new RangeError('Ink varint exceeds safe range');
        scale *= 128;
      } while (byte & 128);
      previous[axis] += unsigned % 2 ? -(unsigned + 1) / 2 : unsigned / 2;
      if (!Number.isSafeInteger(previous[axis])) throw new RangeError('Ink coordinate exceeds safe range');
    }
    points.push({ x: previous[0], y: previous[1], p: previous[2] / 1000 });
  }
  return points;
}

type StrokeGeometry = { points: Point[]; minX: number; minY: number; maxX: number; maxY: number };
// Immutable stroke objects own their cache lifetime; ids alone can collide across devices.
const geometry = new WeakMap<InkStroke, StrokeGeometry>();
export function cacheStrokeGeometry(stroke: InkStroke, points: Point[]): StrokeGeometry {
  const cached = geometry.get(stroke);
  if (cached) return cached;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const value = { points, minX, minY, maxX, maxY };
  geometry.set(stroke, value);
  return value;
}

export function eraseArea(page: InkPage, center: { x: number; y: number }, radius: number, newId: () => string, now: string): InkPage {
  if (!Number.isFinite(radius) || radius <= 0) return page;
  const removed = new Set(page.removed);
  const pieces: InkStroke[] = [];
  let changed = false;
  const distanceSquared = (p: Point) => (p.x - center.x) ** 2 + (p.y - center.y) ** 2;
  const radiusSquared = radius ** 2;
  for (const stroke of page.strokes) {
    if (removed.has(stroke.id)) continue;
    const bounds = geometry.get(stroke) ?? cacheStrokeGeometry(stroke, decodePoints(stroke.points));
    // Rendering primes bounds/points; all later miss-only sweeps stop here without decoding.
    const { minX, minY, maxX, maxY } = bounds;
    if (maxX < center.x - radius || minX > center.x + radius || maxY < center.y - radius || minY > center.y + radius) continue;
    const points = bounds.points;
    const runs: Point[][] = [];
    let run: Point[] = [];
    let hit = false;
    const flush = () => { if (run.length) runs.push(run); run = []; };
    if (points.length === 1) {
      hit = distanceSquared(points[0]) <= radiusSquared;
    }
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      const cuts = [0, 1];
      if (lengthSquared > 0) {
        const dot = (a.x - center.x) * dx + (a.y - center.y) * dy;
        const discriminant = dot * dot - lengthSquared * (distanceSquared(a) - radiusSquared);
        if (discriminant > 0) {
          const root = Math.sqrt(discriminant);
          for (const t of [(-dot - root) / lengthSquared, (-dot + root) / lengthSquared]) {
            if (t > 0 && t < 1) cuts.push(t);
          }
        }
      }
      cuts.sort((x, y) => x - y);
      const at = (t: number): Point => ({ x: a.x + dx * t, y: a.y + dy * t, p: a.p + (b.p - a.p) * t });
      for (let j = 1; j < cuts.length; j++) {
        if (distanceSquared(at((cuts[j - 1] + cuts[j]) / 2)) < radiusSquared) {
          hit = true;
          flush();
        } else {
          if (!run.length) run.push(at(cuts[j - 1]));
          run.push(at(cuts[j]));
        }
      }
    }
    flush();
    if (!hit) continue;
    changed = true;
    removed.add(stroke.id);
    for (const surviving of runs) {
      pieces.push({ ...stroke, id: newId(), points: encodePoints(surviving), createdAt: stroke.createdAt });
    }
  }
  return changed ? { ...page, strokes: [...page.strokes, ...pieces], removed: [...removed], updatedAt: now } : page;
}

// Stable ids identify immutable strokes. Deterministically resolve malformed id
// collisions so argument order cannot change the merged page.
const strokeValue = (s: InkStroke): string => JSON.stringify([s.tool, s.color, s.width, s.points, s.createdAt]);

export function mergeInkPage(base: InkPage | null, ours: InkPage | null, theirs: InkPage | null): InkPage | null {
  if (!ours && !theirs) return null;
  const pages = [base, ours, theirs].filter((page): page is InkPage => page !== null);
  const strokes = new Map<string, InkStroke>();
  const removed = new Set<string>();
  let updatedAt = '';
  for (const page of pages) {
    if (page.updatedAt > updatedAt) updatedAt = page.updatedAt;
    for (const id of page.removed) removed.add(id);
    for (const stroke of page.strokes) {
      const existing = strokes.get(stroke.id);
      if (!existing || strokeValue(stroke) > strokeValue(existing)) strokes.set(stroke.id, stroke);
    }
  }
  const identity = ours ?? theirs!;
  return {
    noteId: identity.noteId, page: identity.page,
    strokes: [...strokes.values()].sort((a, b) => compare(a.id, b.id)),
    removed: [...removed].sort(compare), updatedAt,
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';

export function isInkPage(value: unknown): value is InkPage {
  if (!isObject(value) || !isString(value.noteId) || !/^[\w.-]{1,200}$/.test(value.noteId) ||
    !Number.isSafeInteger(value.page) || (value.page as number) < 0 || !isString(value.updatedAt) ||
    !Array.isArray(value.removed) || !value.removed.every(isString) || !Array.isArray(value.strokes)) return false;
  return value.strokes.every(s => isObject(s) && isString(s.id) &&
    (s.tool === 'pen' || s.tool === 'highlighter') && isString(s.color) &&
    typeof s.width === 'number' && Number.isFinite(s.width) && s.width > 0 &&
    isString(s.createdAt) && isString(s.points) && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s.points));
}


export { mergeInkPage as legacyMergeInkPage, isInkPage as legacyIsInkPage, eraseArea as legacyEraseArea };
