import { afterEach, expect, it, vi } from 'vitest';
import { initVaultStore, loadStandaloneNotes, loadSyncState, saveStandaloneNotes, wipeLocalVault } from './vaultStore';
import { SEED_STANDALONE_NOTES } from './defaultData';

afterEach(() => vi.unstubAllGlobals());

it('closes the database before deleting it and removes all vault storage and memory', async () => {
  const events: string[] = [];
  const values = new Map([['daymark_install_id', 'install'], ['daymark_extra', 'value'], ['unrelated', 'keep']]);
  vi.stubGlobal('localStorage', {
    get length() { return values.size; },
    key: (i: number) => [...values.keys()][i],
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
  });
  const database = {
    close: () => events.push('close'),
    transaction: (_store: string, mode: string) => ({ objectStore: () => ({
      openCursor: () => {
        const req = { result: null, onsuccess: () => {} };
        queueMicrotask(() => req.onsuccess());
        return req;
      },
      put: () => { events.push('write'); },
    }),
    set oncomplete(fn: () => void) { if (mode === 'readwrite') queueMicrotask(fn); },
    }),
  };
  vi.stubGlobal('indexedDB', {
    open: () => {
      const req = { result: database, onsuccess: () => {} };
      queueMicrotask(() => req.onsuccess());
      return req;
    },
    deleteDatabase: (name: string) => {
      events.push(`delete:${name}`);
      const req = { onsuccess: () => {} };
      queueMicrotask(() => req.onsuccess());
      return req;
    },
  });
  vi.stubGlobal('navigator', {});
  const deleted: string[] = [];
  vi.stubGlobal('caches', { keys: async () => ['app', 'vault'], delete: async (key: string) => { deleted.push(key); return true; } });
  await initVaultStore();
  saveStandaloneNotes(SEED_STANDALONE_NOTES);
  await wipeLocalVault();
  expect(events).toEqual(['write', 'close', 'delete:daymark']);
  expect([...values.keys()]).toEqual(['unrelated']);
  expect(deleted).toEqual(['app', 'vault']);
  expect(loadStandaloneNotes()).toEqual([]);
  expect(loadSyncState()).toBeNull();
  saveStandaloneNotes(SEED_STANDALONE_NOTES);
  expect(loadStandaloneNotes()).toEqual([]);
  expect([...values.keys()]).toEqual(['unrelated']);
});
