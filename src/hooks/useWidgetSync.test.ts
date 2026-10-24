import { afterEach, expect, it, vi } from 'vitest';
import { resolveAppearance } from '../utils/appearance';
import { DEFAULT_APPEARANCE } from '../utils/defaultData';
import { EMPTY_HABITS } from '../utils/habits';
import type { HabitData } from '../types/daymark';
import { useWidgetSync } from './useWidgetSync';

const { effects, consume, colors, taskSnapshot, habitSnapshot, state, refs } = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[], consume: vi.fn(), colors: vi.fn(),
  taskSnapshot: vi.fn(), habitSnapshot: vi.fn(), state: { ready: 0, cursor: 0 }, refs: [] as { current: unknown }[],
}));
vi.mock('react', () => ({
  useRef: (current: unknown) => refs[state.cursor++] ?? (refs[state.cursor - 1] = { current }),
  useState: () => [state.ready, (value: number) => { state.ready = value; }],
  useEffect: (effect: () => void) => effects.push(effect),
}));
vi.mock('../native/daymarkBridge', () => ({ isNativeApp: () => true, consumeWidgetActions: consume, setAppColors: colors, pushWidgetSnapshot: taskSnapshot, setHabitSnapshot: habitSnapshot }));

const appearance = resolveAppearance({ ...DEFAULT_APPEARANCE, theme: 'dark' }, null);
function surfaces() {
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
}
afterEach(() => { effects.length = 0; state.ready = 0; state.cursor = 0; refs.length = 0; vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('opens the requested widget editor and sends opaque resolved app colours', async () => {
  surfaces();
  consume.mockResolvedValue([{ type: 'configure', widgetId: 42 }, { type: 'capture' }, { type: 'toggle', taskId: 'a' }]);
  const configure = vi.fn(), capture = vi.fn(), toggle = vi.fn();
  useWidgetSync('2026-10-23', undefined, toggle, capture, configure, appearance, EMPTY_HABITS, vi.fn(), vi.fn());
  const cleanup = effects.map((effect) => effect());
  await vi.waitFor(() => expect(configure).toHaveBeenCalledExactlyOnceWith(42));
  expect(capture).toHaveBeenCalledOnce();
  expect(toggle).toHaveBeenCalledExactlyOnceWith('a');
  expect(colors).toHaveBeenCalledExactlyOnceWith({ headerBg: '#0c0a09', headerText: appearance.headerText, accent: '#f59e0b', dark: true });
  cleanup.forEach((fn) => fn?.());
});

it('applies habit actions functionally in queue order and opens habits', async () => {
  surfaces();
  const at = '2026-10-21T10:00:00.000Z';
  let current: HabitData = { habits: [{ id: 'read', name: 'Read', order: 0, addedOn: '2026-10-01', warnAfterDays: 3, updatedAt: at }], days: [] };
  const updates: ((value: HabitData) => HabitData)[] = [];
  const change = (update: HabitData | ((value: HabitData) => HabitData)) => {
    expect(typeof update).toBe('function');
    if (typeof update === 'function') updates.push(update);
  };
  const open = vi.fn();
  consume.mockResolvedValue([
    { type: 'habit', habitId: 'read', date: '2026-10-20', done: true, at },
    { type: 'habit', habitId: 'read', date: '2026-10-20', done: false, at: '2026-10-21T11:00:00.000Z' },
    { type: 'habits' },
  ]);
  useWidgetSync('2026-10-21', undefined, vi.fn(), vi.fn(), vi.fn(), appearance, current, change, open);
  const cleanup = effects.map((effect) => effect());
  await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
  expect(updates).toHaveLength(2);
  // React can defer functional updaters until after the entire queue is dispatched.
  for (const update of updates) current = update(current);
  expect(current.days).toEqual([{ date: '2026-10-20', ticks: { read: { done: false, at: '2026-10-21T11:00:00.000Z' } } }]);
  cleanup.forEach((fn) => fn?.());
});

it('waits for pending actions before debouncing both snapshots by 300ms', async () => {
  vi.useFakeTimers();
  surfaces();
  let resolve!: (actions: []) => void;
  consume.mockReturnValue(new Promise<[]>((done) => { resolve = done; }));
  const render = () => useWidgetSync('2026-10-21', undefined, vi.fn(), vi.fn(), vi.fn(), appearance, EMPTY_HABITS, vi.fn(), vi.fn());
  render();
  const cleanup = effects.map((effect) => effect());
  await vi.advanceTimersByTimeAsync(1000);
  expect(taskSnapshot).not.toHaveBeenCalled();
  expect(habitSnapshot).not.toHaveBeenCalled();
  resolve([]);
  await vi.advanceTimersByTimeAsync(0);
  // Simulate the committed render after consumption has finished.
  effects.length = 0;
  state.cursor = 0;
  render();
  const snapshotCleanup = effects.at(-1)!();
  await vi.advanceTimersByTimeAsync(299);
  expect(habitSnapshot).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(habitSnapshot).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ date: '2026-10-21', habits: [] }));
  expect(taskSnapshot).toHaveBeenCalledOnce();
  snapshotCleanup?.();
  cleanup.forEach((fn) => fn?.());
});


it('invalidates an older snapshot timer when resume actions finish before React commits', async () => {
  vi.useFakeTimers();
  surfaces();
  consume.mockResolvedValue([]);
  const render = () => useWidgetSync('2026-10-21', undefined, vi.fn(), vi.fn(), vi.fn(), appearance, EMPTY_HABITS, vi.fn(), vi.fn());
  render();
  const cleanup = effects.map((effect) => effect());
  await vi.advanceTimersByTimeAsync(0);
  const focus = vi.mocked(window.addEventListener).mock.calls.find(([event]) => event === 'focus')![1] as () => Promise<void>;
  effects.length = 0;
  state.cursor = 0;
  render();
  const snapshotCleanup = effects.at(-1)!();
  // A resume starts after scheduling, then completes before the next committed render.
  await focus();
  await vi.advanceTimersByTimeAsync(300);
  expect(habitSnapshot).not.toHaveBeenCalled();
  expect(taskSnapshot).not.toHaveBeenCalled();
  snapshotCleanup?.();
  cleanup.forEach((fn) => fn?.());
});
