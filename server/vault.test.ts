import { expect, it } from 'vitest';
import type { DailyDocument } from '../src/types/daymark';
import { FileStore } from './store';
import { isValidEntityValue, VaultQueue, writeEntity } from './vault';

const validDoc: DailyDocument = {
  date: '2026-11-12',
  type: 'daily',
  updatedAt: '2026-11-12T00:00:00Z',
  headings: [],
};

it('VaultQueue runs jobs one at a time in order', async () => {
  const q = new VaultQueue(); const seen: number[] = [];
  await Promise.all([1, 2, 3].map((n) => q.run(async () => { await new Promise(r => setTimeout(r, 5 - n)); seen.push(n); })));
  expect(seen).toEqual([1, 2, 3]);
});

it('a rejected job does not block the next', async () => {
  const q = new VaultQueue();
  await expect(q.run(async () => { throw new Error('x'); })).rejects.toThrow('x');
  await expect(q.run(async () => 7)).resolves.toBe(7);
});

it('writeEntity bumps the revision and records the actor', () => {
  const store = new FileStore('unused');
  writeEntity(store, 'doc:2026-11-12', validDoc, 'actor', '2026-11-12T08:00:00Z');
  expect(store.vault.rev).toBe(1);
  expect(store.vault.entities['doc:2026-11-12']).toEqual({
    rev: 1, value: validDoc, updatedBy: 'actor', updatedAt: '2026-11-12T08:00:00Z',
  });
});

it('isValidEntityValue rejects a doc whose date differs from its key', () => {
  expect(isValidEntityValue('doc:2026-11-12', validDoc)).toBe(true);
  expect(isValidEntityValue('doc:2026-11-12', { ...validDoc, date: '2026-11-13' })).toBe(false);
});
