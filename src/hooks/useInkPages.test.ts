import { beforeEach, expect, it, vi } from 'vitest';
import type { InkPage } from '../types/daymark';
const state = vi.hoisted(() => ({ slots: [] as unknown[], index: 0, effects: [] as (() => unknown)[], saved: [] as InkPage[][] }));
vi.mock('react', () => ({
  useState: (initial: unknown) => { const i = state.index++; if (!(i in state.slots)) state.slots[i] = typeof initial === 'function' ? initial() : initial;
    return [state.slots[i], (value: unknown) => { state.slots[i] = typeof value === 'function' ? value(state.slots[i]) : value; }]; },
  useEffect: (fn: () => unknown) => state.effects.push(fn),
  useCallback: (fn: unknown) => fn,
}));
vi.mock('../utils/vaultStore', () => ({ readInkPages: () => [{ noteId: 'study', page: 0, strokes: [], removed: [], updatedAt: 'now' }], saveInkPages: (pages: InkPage[]) => state.saved.push(pages) }));
import { useInkPages } from './useInkPages';
const render = () => { state.index = 0; return useInkPages(); };
beforeEach(() => { state.slots = []; state.effects = []; state.saved = []; });
it('starts with hydrated ink and updates just one page while retaining other notes', () => {
  let api = render();
  expect(api.inkPagesForNote('study')).toHaveLength(1);
  api.updateInkPage({ noteId: 'other', page: 0, strokes: [], removed: [], updatedAt: 'now' });
  api.updateInkPage({ noteId: 'study', page: 0, strokes: [], removed: ['erased'], updatedAt: 'later' });
  api = render();
  expect(api.ink).toHaveLength(2);
  expect(api.inkPagesForNote('study')[0].removed).toEqual(['erased']);
  for (const effect of state.effects) effect();
  expect(state.saved.at(-1)).toEqual(api.ink);
});
