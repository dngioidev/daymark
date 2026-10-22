import { afterEach, expect, it, vi } from 'vitest';
import { SEED_STANDALONE_NOTES } from './defaultData';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('closes on version change and asks for reload without clearing memory or dropping writes', async () => {
  vi.resetModules();
  vi.stubGlobal('BroadcastChannel', undefined);
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.stubGlobal('navigator', {});
  const database = { close: vi.fn(), onversionchange: () => {}, transaction: () => ({ objectStore: () => ({ openCursor: () => {
    const request: { result: { key: string; value: unknown; continue: () => void } | null; onsuccess: () => void } = { result: null, onsuccess: () => {} };
    request.result = { key: 'notes', value: SEED_STANDALONE_NOTES, continue: () => {
      request.result = null;
      queueMicrotask(() => request.onsuccess());
    } };
    queueMicrotask(() => request.onsuccess());
    return request;
  } }) }) };
  vi.stubGlobal('indexedDB', { open: () => {
    const request = { result: database, onsuccess: () => {} };
    queueMicrotask(() => request.onsuccess());
    return request;
  } });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const store = await import('./vaultStore');
  await store.initVaultStore();
  database.onversionchange();
  expect(store.loadStandaloneNotes()).toEqual(SEED_STANDALONE_NOTES);
  const edited = SEED_STANDALONE_NOTES.slice(1);
  store.saveStandaloneNotes(edited);
  expect(store.loadStandaloneNotes()).toEqual(edited);
  expect(values.has('daymark_notes_v1')).toBe(true);
  expect(database.close).toHaveBeenCalled();
  expect(log).toHaveBeenCalledWith(expect.stringMatching(/reload/i), undefined);
});
