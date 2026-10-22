import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../utils/defaultData';
import { useInstantSettings } from './useInstantSettings';

// Same DOM-free hook harness used by useSync.test.ts, with effect dependency tracking.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], index: 0, effects: [] as (() => void)[] }));
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const i = hooks.index++;
    if (!(i in hooks.slots)) hooks.slots[i] = initial;
    return [hooks.slots[i], (v: unknown) => { hooks.slots[i] = typeof v === 'function' ? v(hooks.slots[i]) : v; }];
  },
  useRef: (initial: unknown) => {
    const i = hooks.index++;
    if (!(i in hooks.slots)) hooks.slots[i] = { current: initial };
    return hooks.slots[i];
  },
  useEffect: (fn: () => void, deps: unknown[]) => {
    const i = hooks.index++;
    const previous = hooks.slots[i] as unknown[] | undefined;
    if (!previous || deps.some((d, n) => !Object.is(d, previous[n]))) hooks.effects.push(fn);
    hooks.slots[i] = deps;
  },
}));
beforeEach(() => { hooks.slots = []; vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());
it('keeps invalid drafts out of persistence, discards them on close, and shows Saved for 1.5 seconds', () => {
  let settings = DEFAULT_SETTINGS;
  let open = true;
  const changes: typeof settings[] = [];
  const render = () => {
    hooks.index = 0; hooks.effects = [];
    const h = useInstantSettings(settings, (next) => { settings = next; changes.push(next); }, open);
    hooks.effects.forEach((effect) => effect());
    return h;
  };
  render();
  let h = render();
  h.setDraft({ ...settings, agingThresholds: { ...settings.agingThresholds, criticalDays: 1 } });
  h = render();
  expect(h.commit()).toBe(false);
  expect(changes).toHaveLength(0);
  expect(render().error).toContain('"Urgent after"');
  open = false; render(); open = true; render();
  expect(render().draft.agingThresholds.criticalDays).toBe(7);
  h = render();
  h.commit({ ...settings, agingThresholds: { ...settings.agingThresholds, criticalDays: 10 } });
  render();
  expect(changes).toHaveLength(1);
  expect(render().saved).toBe(true);
  vi.advanceTimersByTime(1499);
  expect(render().saved).toBe(true);
  vi.advanceTimersByTime(1);
  expect(render().saved).toBe(false);
});
