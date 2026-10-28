import type { GraphNode, GraphEdge } from './graphData';

/** Seeded force layout with short-range spatial hashing. All tick buffers are
 * reused; spring work is O(edges), repulsion inspects neighbouring grid cells.
 * Cooling and an energy cutoff stop work entirely once the graph settles. */
export function createLayout(nodes: GraphNode[], edges: GraphEdge[], seed = 1) {
  let randomState = seed >>> 0;
  const random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; };
  const n = nodes.length, spread = Math.max(180, Math.sqrt(n) * 30);
  const positions = new Map(nodes.map(node => [node.id, { x: (random() - .5) * spread, y: (random() - .5) * spread }]));
  const points = [...positions.values()], indices = new Map(nodes.map((node, i) => [node.id, i]));
  const springs = edges.flatMap(edge => {
    const a = indices.get(edge.a), b = indices.get(edge.b);
    return a === undefined || b === undefined || a === b ? [] : [{ a, b }];
  });
  const vx = new Float64Array(n), vy = new Float64Array(n), fx = new Float64Array(n), fy = new Float64Array(n);
  const heads = new Int32Array(4096), next = new Int32Array(n), cx = new Int32Array(n), cy = new Int32Array(n);
  const hash = (x: number, y: number) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) & 4095;
  let tick = 0, stopped = n === 0;
  const step = (alpha?: number): number => {
    if (stopped) return 0;
    const heat = alpha ?? Math.pow(.97, tick);
    heads.fill(-1);
    for (let i = 0; i < n; i++) {
      const p = points[i]; fx[i] = -p.x * .0008; fy[i] = -p.y * .0008;
      cx[i] = Math.floor(p.x / 100); cy[i] = Math.floor(p.y / 100);
      const cell = hash(cx[i], cy[i]); next[i] = heads[cell]; heads[cell] = i;
    }
    for (let i = 0; i < n; i++) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const x = cx[i] + dx, y = cy[i] + dy;
      for (let j = heads[hash(x, y)]; j >= 0; j = next[j]) {
        if (j <= i || cx[j] !== x || cy[j] !== y) continue;
        const px = points[i].x - points[j].x || .01, py = points[i].y - points[j].y || .01;
        const squared = px * px + py * py;
        if (squared > 10000) continue;
        const force = 100 / Math.max(20, squared);
        fx[i] += px * force; fy[i] += py * force; fx[j] -= px * force; fy[j] -= py * force;
      }
    }
    for (const { a, b } of springs) {
      const dx = points[b].x - points[a].x, dy = points[b].y - points[a].y;
      const length = Math.max(1, Math.hypot(dx, dy)), force = .035 * (length - 60) / length;
      fx[a] += dx * force; fy[a] += dy * force; fx[b] -= dx * force; fy[b] -= dy * force;
    }
    let energy = 0;
    for (let i = 0; i < n; i++) {
      vx[i] = Math.max(-12, Math.min(12, (vx[i] + fx[i] * heat) * .65));
      vy[i] = Math.max(-12, Math.min(12, (vy[i] + fy[i] * heat) * .65));
      points[i].x += vx[i]; points[i].y += vy[i]; energy += vx[i] * vx[i] + vy[i] * vy[i];
    }
    tick++; energy /= Math.max(1, n);
    if (tick >= 240 || (tick > 30 && energy < .002)) stopped = true;
    return stopped ? 0 : energy;
  };
  return { positions, step, settle(maxTicks = 240) { for (let i = 0; i < maxTicks && !stopped; i++) step(); } };
}
