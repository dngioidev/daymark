import { expect, it, vi } from 'vitest';
import type { InkPage } from '../types/daymark';
import { createInkStore } from './inkStore';

const page = (noteId: string, n: number, updatedAt = 'a'): InkPage => ({ noteId, page: n, strokes: [], removed: [], updatedAt });

it('upserts one page, reports additions and notifies subscribers', () => {
  const store = createInkStore([page('a', 0)]);
  const listener = vi.fn();
  const stop = store.subscribe(listener);
  expect(store.upsert(page('a', 0, 'b'))).toBe(false);
  expect(store.upsert(page('a', 1))).toBe(true);
  expect(store.get().map(p => [p.page, p.updatedAt])).toEqual([[0, 'b'], [1, 'a']]);
  expect(listener).toHaveBeenCalledTimes(2);
  const same = store.get()[0];
  expect(store.upsert(same)).toBe(false);
  expect(listener).toHaveBeenCalledTimes(2);
  stop(); store.set([]);
  expect(listener).toHaveBeenCalledTimes(2);
});

it('keeps a note page list identity while only other notes change', () => {
  const store = createInkStore([page('a', 1), page('a', 0), page('b', 0)]);
  const a = store.pagesFor('a');
  expect(a.map(p => p.page)).toEqual([0, 1]);
  store.upsert(page('b', 0, 'later'));
  expect(store.pagesFor('a')).toBe(a);
  store.upsert(page('a', 0, 'later'));
  expect(store.pagesFor('a')).not.toBe(a);
  expect(store.pagesFor('a')[0].updatedAt).toBe('later');
  expect(store.pagesFor('missing')).toEqual([]);
  store.set([page('b', 0)]);
  expect(store.pagesFor('a')).toEqual([]);
});
