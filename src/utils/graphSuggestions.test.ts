import { afterEach, expect, it, vi } from 'vitest';
import { scheduleGraphSuggestions } from './graphSuggestions';
import { graphPerformanceNotes } from './fixtures/graphPerformance';
import { buildNoteIndex } from './noteRelated';
afterEach(() => vi.unstubAllGlobals());
it('computes 1,000 realistic 60-word notes under 2.5s scoring time, with every batch below 100ms', async () => {
  const notes = graphPerformanceNotes(), index = buildNoteIndex(notes);
  let total = 0, max = 0, batches = 0, edgeCount = 0;
  await new Promise<void>(resolve => scheduleGraphSuggestions(notes, index, new Set(), update => {
    total += update.batchMs; max = Math.max(max, update.batchMs); batches++;
    if (!update.pending) { edgeCount = update.edges.length; resolve(); }
  }));
  console.log('Realistic suggestions:', JSON.stringify({ totalMs: total, maxBatchMs: max, batches }));
  expect(edgeCount).toBeGreaterThan(1000); expect(total).toBeLessThan(2500); expect(max).toBeLessThan(100); expect(batches).toBeGreaterThan(1);
}, 10000);
it('yields after a small batch and cancels the next idle callback without publishing stale work', () => {
  const callbacks = new Map<number, IdleRequestCallback>(); let seq = 0;
  vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => { callbacks.set(++seq, callback); return seq; });
  vi.stubGlobal('cancelIdleCallback', (id: number) => callbacks.delete(id));
  const notes = graphPerformanceNotes(100), updates = vi.fn();
  const cancel = scheduleGraphSuggestions(notes, buildNoteIndex(notes), new Set(), updates);
  const callback = callbacks.get(1)!; callbacks.delete(1); callback({ didTimeout: false, timeRemaining: () => 0 });
  expect(updates.mock.lastCall![0].pending).toBe(true); expect(callbacks.size).toBe(1);
  const staleCallback = [...callbacks.values()][0]; const count = updates.mock.calls.length;
  cancel(); expect(callbacks.size).toBe(0);
  staleCallback({ didTimeout: false, timeRemaining: () => 20 }); expect(updates).toHaveBeenCalledTimes(count);
});
it('keeps making bounded progress when a busy, animating page only runs callbacks after their timeout', () => {
  const callbacks = new Map<number, [IdleRequestCallback, IdleRequestOptions | undefined]>(); let seq = 0;
  vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback, options?: IdleRequestOptions) => { callbacks.set(++seq, [callback, options]); return seq; });
  vi.stubGlobal('cancelIdleCallback', (id: number) => callbacks.delete(id));
  const notes = graphPerformanceNotes(100), updates = vi.fn();
  const cancel = scheduleGraphSuggestions(notes, buildNoteIndex(notes), new Set(), updates);
  const [callback, options] = callbacks.get(1)!; callbacks.delete(1);
  // Canvas animation leaves no idle period, so the browser forces the callback at its timeout.
  callback({ didTimeout: true, timeRemaining: () => 0 });
  const first = updates.mock.lastCall![0];
  expect(first.completed).toBeGreaterThan(1); expect(first.batchMs).toBeLessThan(50);
  expect(options?.timeout).toBeLessThanOrEqual(50);
  cancel();
});
