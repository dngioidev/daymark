import { afterEach, expect, it, vi } from 'vitest';
import { initVaultStore, isPhotoStorageAvailable, kvGetRaw, kvPutRaw, kvDeleteRaw } from './vaultStore';
afterEach(() => vi.unstubAllGlobals());
it('skips photo blob values during hydration but reads and mutates them through raw helpers', async () => {
  const values = new Map<string, unknown>([['bgPhoto:0', new Blob(['full'])], ['bgThumb:0', new Blob(['thumb'])], ['bgMeta', []]]);
  const database = {
    transaction: (_name: string, mode: string) => {
      const tx = { oncomplete: () => {}, objectStore: () => ({
        openCursor: () => {
          const keys = [...values.keys()]; let index = 0;
          const req: { result: unknown; onsuccess: () => void } = { result: null, onsuccess: () => {} };
          const advance = () => queueMicrotask(() => {
            const key = keys[index++];
            req.result = key === undefined ? null : { key, get value() { if (key.startsWith('bgPhoto:') || key.startsWith('bgThumb:')) throw new Error('Blob loaded at startup'); return values.get(key); }, continue: advance };
            req.onsuccess();
          }); advance(); return req;
        },
        get: (key: string) => { const req = { result: values.get(key), onsuccess: () => {} }; queueMicrotask(() => req.onsuccess()); return req; },
        put: (value: unknown, key: string) => { values.set(key, value); },
        delete: (key: string) => { values.delete(key); },
      }) };
      if (mode === 'readwrite') queueMicrotask(() => tx.oncomplete());
      return tx;
    },
  };
  vi.stubGlobal('indexedDB', { open: () => { const req = { result: database, onsuccess: () => {} }; queueMicrotask(() => req.onsuccess()); return req; } });
  vi.stubGlobal('navigator', {}); vi.stubGlobal('localStorage', { getItem: () => null });
  await initVaultStore();
  expect(isPhotoStorageAvailable()).toBe(true);
  expect(await kvGetRaw('bgPhoto:0')).toBeInstanceOf(Blob);
  await kvPutRaw('ui:bgSlot', 0); expect(await kvGetRaw('ui:bgSlot')).toBe(0);
  await kvDeleteRaw('bgThumb:0'); expect(await kvGetRaw('bgThumb:0')).toBeUndefined();
});

it('disables raw photos in localStorage fallback mode', async () => {
  vi.stubGlobal('indexedDB', undefined);
  vi.stubGlobal('localStorage', { getItem: () => null });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await initVaultStore();
  expect(isPhotoStorageAvailable()).toBe(false);
  expect(await kvGetRaw('bgPhoto:0')).toBeUndefined();
  await expect(kvPutRaw('bgPhoto:0', new Blob(['full']))).rejects.toThrow('Photos need browser storage');
  vi.restoreAllMocks();
});
