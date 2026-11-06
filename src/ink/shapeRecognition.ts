export type ShapeKind = 'line' | 'arrow' | 'rectangle' | 'ellipse' | 'circle' | 'triangle';
export const HOLD_MS = 500;
export const HOLD_RADIUS = 6;

type XY = { x: number; y: number };
type Point = { x: number; y: number; p: number };
const distance = (a: XY, b: XY): number => Math.hypot(a.x - b.x, a.y - b.y);

export function isHeld(points: { x: number; y: number; t: number }[], now: number): boolean {
  if (!points.length || !Number.isFinite(now)) return false;
  const cutoff = now - HOLD_MS;
  let start = -1;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (![point.x, point.y, point.t].every(Number.isFinite)
      || point.t > now || (i > 0 && point.t < points[i - 1].t)) return false;
    if (point.t <= cutoff) start = i;
  }
  // Include the sample preceding the window: sparse events must not hide a move.
  return start >= 0 && points.slice(start).every(point => distance(point, points.at(-1)!) <= HOLD_RADIUS);
}

function segmentDistance(point: XY, a: XY, b: XY): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0;
  return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
}

// Iterative Ramer–Douglas–Peucker avoids recursion depth limits on long strokes.
function simplify(points: Point[], tolerance: number): Point[] {
  const kept = new Set([0, points.length - 1]);
  const pending = [[0, points.length - 1]];
  while (pending.length) {
    const [start, end] = pending.pop()!;
    let furthest = -1, error = tolerance;
    for (let i = start + 1; i < end; i++) {
      const d = segmentDistance(points[i], points[start], points[end]);
      if (d > error) { error = d; furthest = i; }
    }
    if (furthest >= 0) {
      kept.add(furthest);
      pending.push([start, furthest], [furthest, end]);
    }
  }
  return [...kept].sort((a, b) => a - b).map(i => points[i]);
}

function pathLength(points: XY[]): number {
  return points.slice(1).reduce((sum, point, i) => sum + distance(point, points[i]), 0);
}

function fitsPolyline(input: Point[], output: Point[], tolerance: number): boolean {
  return input.every(point => output.slice(1).some((end, i) => segmentDistance(point, output[i], end) <= tolerance))
    && pathLength(input) <= pathLength(output) * 1.3;
}

export function recognizeShape(points: { x: number; y: number; p: number }[]): { kind: ShapeKind; points: { x: number; y: number; p: number }[] } | null {
  if (points.length < 2 || points.some(point => ![point.x, point.y, point.p].every(Number.isFinite))) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
  }
  const width = maxX - minX, height = maxY - minY;
  const diagonal = Math.hypot(width, height);
  if (diagonal < 20) return null;
  const tolerance = Math.max(6, diagonal * 0.035);
  const pressures = points.map(point => point.p).sort((a, b) => a - b);
  const middle = Math.floor(pressures.length / 2);
  const pressure = pressures.length % 2 ? pressures[middle] : (pressures[middle - 1] + pressures[middle]) / 2;
  const clean = (point: XY): Point => ({ x: point.x, y: point.y, p: pressure });
  const result = (kind: ShapeKind, output: XY[]) => ({ kind, points: output.map(clean) });
  const first = points[0], last = points.at(-1)!;
  const simple = simplify(points, tolerance);

  if (distance(first, last) > Math.max(10, diagonal * 0.12)) {
    if (simple.length === 2 && fitsPolyline(points, simple, tolerance)) return result('line', [first, last]);

    // A single-stroke arrow retraces the tip while drawing its two wings;
    // the final held point is the tip, never the start of the shaft.
    const shaft = distance(first, last);
    if (simple.length >= 5 && simple.length <= 6 && distance(simple[1], last) <= tolerance) {
      const ux = (last.x - first.x) / shaft, uy = (last.y - first.y) / shaft;
      const wings = simple.slice(2, -1).filter(point => distance(point, last) > tolerance);
      if (wings.length === 2) {
        const offsets = wings.map(point => ({
          back: (last.x - point.x) * ux + (last.y - point.y) * uy,
          side: (point.x - last.x) * -uy + (point.y - last.y) * ux,
        }));
        if (offsets[0].side * offsets[1].side < 0 && offsets.every(o =>
          o.back >= shaft * 0.06 && o.back <= shaft * 0.4
          && Math.abs(o.side) >= o.back * 0.25 && Math.abs(o.side) <= o.back * 2)) {
          const back = (offsets[0].back + offsets[1].back) / 2;
          const side = (Math.abs(offsets[0].side) + Math.abs(offsets[1].side)) / 2;
          const wing = (sign: number) => ({ x: last.x - ux * back - uy * side * sign, y: last.y - uy * back + ux * side * sign });
          const output = [first, last, wing(Math.sign(offsets[0].side)), last, wing(Math.sign(offsets[1].side)), last].map(clean);
          if (fitsPolyline(points, output, tolerance)) return result('arrow', output);
        }
      }
    }
    return null;
  }

  const closed = [...points.slice(0, -1), first];
  const corners = simplify(closed, tolerance).slice(0, -1);
  // A closed stroke may start halfway along an edge rather than at a corner.
  for (let i = corners.length - 1; i >= 0 && corners.length > 2; i--) {
    if (segmentDistance(corners[i], corners[(i + corners.length - 1) % corners.length], corners[(i + 1) % corners.length]) <= tolerance) corners.splice(i, 1);
  }
  const polygon = [...corners, corners[0]];
  const area = Math.abs(corners.reduce((sum, a, i) => {
    const b = corners[(i + 1) % corners.length];
    return sum + a.x * b.y - b.x * a.y;
  }, 0)) / 2;
  if (area < width * height * 0.15 || width < 12 || height < 12) return null;

  if (corners.length === 3 && fitsPolyline(points, polygon, tolerance)) return result('triangle', polygon);
  if (corners.length === 4 && corners.every((point, i) => {
    const a = corners[(i + 3) % 4], b = corners[(i + 1) % 4];
    const dot = (a.x - point.x) * (b.x - point.x) + (a.y - point.y) * (b.y - point.y);
    return Math.abs(dot) / (distance(a, point) * distance(b, point)) < 0.25;
  }) && fitsPolyline(points, polygon, tolerance)) {
    // Use perpendicular axes from the first edge, preserving clearly rotated boxes.
    const a = corners[0], b = corners[1];
    const length = distance(a, b);
    let ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
    if (Math.abs(uy) < 0.15) { ux = Math.sign(ux); uy = 0; }
    else if (Math.abs(ux) < 0.15) { ux = 0; uy = Math.sign(uy); }
    const along = corners.map(p => p.x * ux + p.y * uy);
    const across = corners.map(p => -p.x * uy + p.y * ux);
    const lo = Math.min(...along), hi = Math.max(...along), top = Math.min(...across), bottom = Math.max(...across);
    const box = [[lo, top], [hi, top], [hi, bottom], [lo, bottom], [lo, top]];
    return result('rectangle', box.map(([u, v]) => ({ x: u * ux - v * uy, y: u * uy + v * ux })));
  }

  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const rx = width / 2, ry = height / 2;
  let squaredError = 0, travel = 0, turn = 0;
  let previousAngle = Math.atan2((first.y - cy) / ry, (first.x - cx) / rx);
  for (const point of points) {
    const x = (point.x - cx) / rx, y = (point.y - cy) / ry;
    const error = Math.abs(Math.hypot(x, y) - 1);
    if (error > 0.18) return null;
    squaredError += error * error;
    const angle = Math.atan2(y, x);
    const delta = Math.atan2(Math.sin(angle - previousAngle), Math.cos(angle - previousAngle));
    travel += Math.abs(delta); turn += delta; previousAngle = angle;
  }
  if (Math.sqrt(squaredError / points.length) > 0.08 || Math.abs(turn) < Math.PI * 1.8 || travel > Math.PI * 2.6) return null;
  const round = Math.max(rx, ry) / Math.min(rx, ry) <= 1.15;
  const radiusX = round ? (rx + ry) / 2 : rx, radiusY = round ? (rx + ry) / 2 : ry;
  const startAngle = Math.atan2((first.y - cy) / ry, (first.x - cx) / rx);
  const output = Array.from({ length: 64 }, (_, i) => {
    const angle = startAngle + Math.sign(turn) * i * Math.PI * 2 / 63;
    return { x: cx + radiusX * Math.cos(angle), y: cy + radiusY * Math.sin(angle) };
  });
  output[63] = { ...output[0] };
  return result(round ? 'circle' : 'ellipse', output);
}
