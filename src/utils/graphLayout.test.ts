import { expect, it } from 'vitest';
import { createLayout } from './graphLayout';
import type { GraphNode, GraphEdge } from './graphData';
const nodes = (count: number): GraphNode[] => Array.from({ length: count }, (_, i) => ({ id: String(i), title: String(i), folder: '', tags: [], degree: 0 }));
it('is seeded, finite, and pulls connected nodes closer than isolated nodes', () => {
  const source = nodes(10), edges: GraphEdge[] = [{ a: '0', b: '1', kind: 'link' }];
  const a = createLayout(source, edges, 42), b = createLayout(source, edges, 42);
  a.settle(); b.settle(); expect(a.positions).toEqual(b.positions);
  const distance = (x: string, y: string) => Math.hypot(a.positions.get(x)!.x - a.positions.get(y)!.x, a.positions.get(x)!.y - a.positions.get(y)!.y);
  expect(distance('0', '1')).toBeLessThan(distance('0', '9'));
  for (const p of a.positions.values()) { expect(Number.isFinite(p.x)).toBe(true); expect(Number.isFinite(p.y)).toBe(true); }
  expect(Number.isFinite(a.step())).toBe(true);
});
it('settles 1,000 nodes / 2,000 edges under a generous 5 second CI budget', () => {
  const source = nodes(1000);
  const edges: GraphEdge[] = Array.from({ length: 2000 }, (_, i) => ({ a: String(i % 1000), b: String((i + (i < 1000 ? 1 : 17)) % 1000), kind: 'link' }));
  const start = performance.now(); const layout = createLayout(source, edges); layout.settle();
  expect(performance.now() - start).toBeLessThan(5000);
  expect(layout.positions.size).toBe(1000);
  for (const p of layout.positions.values()) expect(Number.isFinite(p.x + p.y)).toBe(true);
}, 10000);
