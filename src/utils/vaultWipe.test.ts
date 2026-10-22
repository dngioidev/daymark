import { afterEach, expect, it, vi } from 'vitest';
import { initVaultStore, kvGetRaw, kvPutRaw, loadStandaloneNotes, loadSyncState, saveStandaloneNotes, wipeLocalVault } from './vaultStore';
import { SEED_STANDALONE_NOTES } from './defaultData';

afterEach(() => vi.unstubAllGlobals());

it('closes the database before deleting it and removes all vault storage and memory', async () => {
  const events: string[] = [];
  const raw = new Map<string, unknown>();
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
      put: (value: unknown, key: string) => { raw.set(key, value); events.push('write'); },
      get: (key: string) => {
        const req = { result: raw.get(key), onsuccess: () => {} };
        queueMicrotask(() => req.onsuccess());
        return req;
      },
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
      raw.clear();
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
  await kvPutRaw('bgPhoto:0', new Blob(['photo']));
  await kvPutRaw('bgMeta', [{ slot: 0 }]);
  await kvPutRaw('ui:bgSlot', 0);
  expect(await kvGetRaw('bgPhoto:0')).toBeInstanceOf(Blob);
  await wipeLocalVault();
  expect(raw.size).toBe(0);
  expect(await kvGetRaw('bgMeta')).toBeUndefined();
  expect(await kvGetRaw('ui:bgSlot')).toBeUndefined();
  expect(events).toEqual(['write', 'write', 'write', 'write', 'close', 'delete:daymark']);
  expect([...values.keys()]).toEqual(['unrelated']);
  expect(deleted).toEqual(['app', 'vault']);
  expect(loadStandaloneNotes()).toEqual([]);
  expect(loadSyncState()).toBeNull();
  saveStandaloneNotes(SEED_STANDALONE_NOTES);
  expect(loadStandaloneNotes()).toEqual([]);
  expect([...values.keys()]).toEqual(['unrelated']);
});
