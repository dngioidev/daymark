import type { InkPage, InkStroke } from '../types/daymark';

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

export function inkKey(noteId: string, page: number): string {
  return `ink:${noteId}:${page}`;
}

export function parseInkKey(key: string): { noteId: string; page: number } | null {
  const match = /^ink:([^:]+):(\d+)$/.exec(key);
  if (!match) return null;
  const page = Number(match[2]);
  return Number.isSafeInteger(page) ? { noteId: match[1], page } : null;
}

export function isInkEntityKey(key: string): boolean {
  return parseInkKey(key) !== null;
}

export function addStroke(page: InkPage, stroke: InkStroke, now: string): InkPage {
  if (page.strokes.some(existing => existing.id === stroke.id)) return page;
  return { ...page, strokes: [...page.strokes, stroke], updatedAt: now };
}

export function eraseStrokes(page: InkPage, ids: string[], now: string): InkPage {
  return { ...page, removed: [...new Set([...page.removed, ...ids])], updatedAt: now };
}

export function visibleStrokes(page: InkPage): InkStroke[] {
  const removed = new Set(page.removed);
  return page.strokes.filter(stroke => !removed.has(stroke.id)).sort((a, b) =>
    Number(a.tool === 'pen') - Number(b.tool === 'pen') || compare(a.createdAt, b.createdAt) || compare(a.id, b.id));
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
    const points = decodePoints(stroke.points);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    // Broad phase: miss the bounding box, skip all segment intersection work.
    if (maxX < center.x - radius || minX > center.x + radius || maxY < center.y - radius || minY > center.y + radius) continue;
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
      pieces.push({ ...stroke, id: newId(), points: encodePoints(surviving), createdAt: now });
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
