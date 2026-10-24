import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedVault, resetServerVault } from './server-session.mjs';

// Exercise the seeding transaction without starting a server or browser.
async function seeded(options) {
  const values = new Map([['habits', 'existing']]);
  const previous = globalThis.indexedDB;
  globalThis.indexedDB = {
    open() {
      const request = {};
      request.result = {
        transaction() {
          const tx = { objectStore: () => ({ put: (value, key) => values.set(key, value) }) };
          queueMicrotask(() => tx.oncomplete());
          return tx;
        },
        close() {},
      };
      queueMicrotask(() => request.onsuccess());
      return request;
    },
  };
  try {
    await seedVault({ route: async () => {}, goto: async () => {}, unroute: async () => {},
      evaluate: async (fn, arg) => fn(arg) }, 'http://seed.test', options);
    return values;
  } finally { globalThis.indexedDB = previous; }
}

test('seedVault writes provided HabitData to kv habits', async () => {
  const habits = { habits: [{ id: 'read', name: 'Read', order: 0, warnAfterDays: 3, addedOn: '2026-10-24', updatedAt: '2026-10-24T08:00:00Z' }],
    days: [{ date: '2026-10-24', ticks: { read: { done: true, at: '2026-10-24T08:00:00Z' } } }] };
  assert.deepEqual((await seeded({ habits })).get('habits'), habits);
});

test('seedVault leaves habits untouched when omitted and supports an explicit empty seed', async () => {
  assert.equal((await seeded({})).get('habits'), 'existing');
  const empty = { habits: [], days: [] };
  assert.deepEqual((await seeded({ habits: empty })).get('habits'), empty);
});

test('resetServerVault reads and deletes every live entity with habits support', async () => {
  const entities = [
    { key: 'habits', value: { habits: [] } },
    { key: 'habitday:2026-10-24', value: { date: '2026-10-24', ticks: {} } },
    { key: 'doc:2026-10-24', value: { date: '2026-10-24' } },
    { key: 'note:deleted', value: null },
  ];
  const calls = [];
  const context = { request: {
    get: async () => { throw new Error('reset must negotiate habits via POST'); },
    post: async (url, options) => {
      calls.push({ url, ...options });
      return { ok: () => true, json: async () => ({ entities }) };
    },
  } };
  await resetServerVault(context, 'http://reset.test', 'test-token');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'http://reset.test/api/sync');
  assert.deepEqual(calls[0].data, { sinceRev: 0, changes: [], features: ['habits'] });
  assert.deepEqual(calls[1].data, { sinceRev: 0, features: ['habits'], changes: entities.slice(0, 3)
    .map(({ key, value }) => ({ key, base: value, value: null })) });
});
