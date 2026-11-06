import { describe, expect, it } from 'vitest';
import { HOLD_MS, HOLD_RADIUS, isHeld, recognizeShape } from './shapeRecognition';

type Point = { x: number; y: number; p: number };
type XY = [number, number];

function polyline(vertices: XY[], samples = 20): Point[] {
  return vertices.slice(1).flatMap(([x, y], i) => Array.from({ length: samples }, (_, j) => ({
    x: vertices[i][0] + (x - vertices[i][0]) * j / samples,
    y: vertices[i][1] + (y - vertices[i][1]) * j / samples,
    p: 0.5,
  }))).concat([{ x: vertices.at(-1)![0], y: vertices.at(-1)![1], p: 0.5 }]);
}

function loop(rx: number, ry: number): Point[] {
  return Array.from({ length: 129 }, (_, i) => ({
    x: 400 + rx * Math.cos(i * Math.PI / 64),
    y: 400 + ry * Math.sin(i * Math.PI / 64), p: 0.5,
  }));
}

function jitter(points: Point[], seed: number): Point[] {
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32 * 6 - 3;
  };
  return points.map(point => ({ ...point, x: point.x + random(), y: point.y + random() }));
}

describe.each([1, 17, 2026])('shape recognition with seeded jitter %i', seed => {
  it('cleans a straight line to two points', () => {
    const input = jitter(polyline([[100, 120], [420, 280]]), seed);
    const result = recognizeShape(input);
    expect(result?.kind).toBe('line');
    expect(result?.points).toHaveLength(2);
    expect(result?.points[0]).toEqual(input[0]);
    expect(result?.points[1]).toEqual(input.at(-1));
  });

  it('recognizes a shaft ending in a ^ head with its tip at the last point', () => {
    const input = jitter(polyline([[100, 300], [400, 300], [350, 270], [400, 300], [350, 330], [400, 300]]), seed);
    const result = recognizeShape(input);
    expect(result?.kind).toBe('arrow');
    expect(result?.points.at(-1)).toEqual(input.at(-1));
    expect(result?.points).toHaveLength(6);
    expect(result?.points[1]).toEqual(result?.points.at(-1));
    expect(result?.points[3]).toEqual(result?.points.at(-1));
    expect(result!.points[2].y).toBeLessThan(result!.points[1].y);
    expect(result!.points[4].y).toBeGreaterThan(result!.points[1].y);
  });

  it('recognizes an axis-aligned box as a closed five-point rectangle', () => {
    const result = recognizeShape(jitter(polyline([[100, 100], [400, 100], [400, 300], [100, 300], [100, 100]]), seed));
    expect(result?.kind).toBe('rectangle');
    expect(result?.points).toHaveLength(5);
    expect(result?.points[0]).toEqual(result?.points[4]);
    for (let i = 1; i < 5; i++) {
      const a = result!.points[i - 1], b = result!.points[i];
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }
  });

  it('recognizes a round loop as a 64-point circle', () => {
    const result = recognizeShape(jitter(loop(100, 100), seed));
    expect(result?.kind).toBe('circle');
    expect(result?.points).toHaveLength(64);
    expect(result?.points[0]).toEqual(result?.points.at(-1));
    const radii = result!.points.map(p => Math.hypot(p.x - 400, p.y - 400));
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(6);
  });

  it('recognizes a wide loop as a 64-point ellipse', () => {
    const result = recognizeShape(jitter(loop(180, 80), seed));
    expect(result?.kind).toBe('ellipse');
    expect(result?.points).toHaveLength(64);
    expect(result?.points[0]).toEqual(result?.points.at(-1));
  });

  it('recognizes a three-corner loop as a closed four-point triangle', () => {
    const result = recognizeShape(jitter(polyline([[250, 100], [420, 400], [100, 400], [250, 100]]), seed));
    expect(result?.kind).toBe('triangle');
    expect(result?.points).toHaveLength(4);
    expect(result?.points[0]).toEqual(result?.points[3]);
  });

  it('leaves a zig-zag scribble freehand', () => {
    expect(recognizeShape(jitter(polyline([[100, 100], [150, 300], [200, 100], [250, 300], [300, 100], [350, 300]]), seed))).toBeNull();
  });

  it('leaves a single-stroke handwritten word sample freehand', () => {
    // Cursive "hi": ascender, arch, connecting stroke and final upstroke.
    expect(recognizeShape(jitter(polyline([[100, 300], [120, 120], [140, 100], [145, 160], [110, 300], [150, 220], [180, 220], [180, 300], [210, 280], [225, 230], [215, 300], [250, 275]]), seed))).toBeNull();
  });
});

describe('shape output safety', () => {
  it('uses the median pressure on every output point without mutating the input', () => {
    const input = polyline([[100, 100], [400, 100]], 4).map((p, i) => ({ ...p, p: [0.1, 0.9, 0.7, 0.3, 0.5][i] }));
    const before = structuredClone(input);
    expect(recognizeShape(input)?.points.map(p => p.p)).toEqual([0.5, 0.5]);
    expect(input).toEqual(before);
  });

  it('averages the middle pressures for an even sample count', () => {
    expect(recognizeShape([{ x: 0, y: 0, p: 0.2 }, { x: 100, y: 100, p: 0.8 }])?.points.map(p => p.p)).toEqual([0.5, 0.5]);
  });

  it('rejects empty, single-point, stationary and nonfinite strokes', () => {
    for (const input of [[], [{ x: 1, y: 1, p: 0.5 }], polyline([[1, 1], [1, 1]]), [{ x: 0, y: 0, p: 0.5 }, { x: Infinity, y: 1, p: 0.5 }]]) {
      expect(recognizeShape(input)).toBeNull();
    }
  });

  it('does not mistake a retraced line for a closed shape', () => {
    expect(recognizeShape(polyline([[100, 100], [400, 100], [100, 100]]))).toBeNull();
  });
});

describe('draw-and-hold timing', () => {
  it('exports the required timing and drift constants', () => {
    expect(HOLD_MS).toBe(500);
    expect(HOLD_RADIUS).toBe(6);
  });

  it('accepts a last 500 ms within six units, ignoring the earlier drawing', () => {
    expect(isHeld([{ x: 0, y: 0, t: 0 }, { x: 100, y: 100, t: 100 }, { x: 103, y: 104, t: 350 }, { x: 100, y: 100, t: 600 }], 600)).toBe(true);
  });

  it('accepts a hold without repeated stationary pointer events', () => {
    const input = [{ x: 0, y: 0, t: 0 }, { x: 100, y: 100, t: 100 }];
    expect(isHeld(input, 599)).toBe(false);
    expect(isHeld(input, 600)).toBe(true);
  });

  it('rejects a slow continuous move even when each individual step is small', () => {
    const input = Array.from({ length: 11 }, (_, i) => ({ x: i * 2, y: 0, t: i * 50 }));
    expect(isHeld(input, 500)).toBe(false);
  });

  it('rejects movement inside a window whose preceding sample is outside it', () => {
    expect(isHeld([{ x: 0, y: 0, t: 0 }, { x: 100, y: 0, t: 200 }], 600)).toBe(false);
  });

  it('requires a complete hold interval and valid samples', () => {
    expect(isHeld([], 1000)).toBe(false);
    expect(isHeld([{ x: 1, y: 1, t: 100 }], 599)).toBe(false);
    expect(isHeld([{ x: 1, y: 1, t: 100 }], 600)).toBe(true);
    expect(isHeld([{ x: 1, y: 1, t: 100 }], 99)).toBe(false);
  });
});
