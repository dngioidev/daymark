import { describe, expect, it, vi } from 'vitest';
import { isStandaloneNote } from './vaultValidation';
import { DEFAULT_SETTINGS, SEED_STANDALONE_NOTES } from './defaultData';
import { initVaultStore, keepValid, parseVaultMessage, saveSyncState } from './vaultStore';

vi.mock('../native/daymarkBridge', () => ({ isNativeApp: () => false }));

describe('keepValid (load-time filter)', () => {
  it('returns the same array when nothing is dropped', () => {
    const notes: unknown[] = [...SEED_STANDALONE_NOTES];
    expect(keepValid(notes, isStandaloneNote, 'note')).toBe(notes);
  });

  it('drops damaged entries, keeps valid ones and reports the count', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const notes: unknown[] = [SEED_STANDALONE_NOTES[0], { foo: 1 }];
    const result = keepValid(notes, isStandaloneNote, 'note');
    expect(result).toEqual([SEED_STANDALONE_NOTES[0]]);
    expect(result).not.toBe(notes);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('1 damaged note'));
    spy.mockRestore();
  });
});

describe('parseVaultMessage (cross-tab messages)', () => {
  it('accepts arrays for docs and notes and objects for settings', () => {
    expect(parseVaultMessage({ key: 'daily_docs', value: [] })).toEqual({ key: 'daily_docs', value: [] });
    expect(parseVaultMessage({ key: 'notes', value: [] })).toEqual({ key: 'notes', value: [] });
    expect(parseVaultMessage({ key: 'settings', value: DEFAULT_SETTINGS })).toEqual({ key: 'settings', value: DEFAULT_SETTINGS });
  });

  it('ignores unknown keys and wrongly shaped values', () => {
    expect(parseVaultMessage({ key: 'sync_state', value: {} })).toBeNull();
    expect(parseVaultMessage({ key: 'daily_docs', value: {} })).toBeNull();
    expect(parseVaultMessage({ key: 'settings', value: [] })).toBeNull();
    expect(parseVaultMessage({ key: 'settings', value: {} })).toBeNull();
    expect(parseVaultMessage({ key: 'settings', value: null })).toBeNull();
    expect(parseVaultMessage(null)).toBeNull();
    expect(parseVaultMessage('x')).toBeNull();
  });
});

describe('sync credential persistence', () => {
  it('resolves only after the IndexedDB transaction completes and propagates write failures', async () => {
    const writes: { oncomplete?: () => void; onerror?: () => void; error?: Error }[] = [];
    const database = {
      transaction: (_store: string, mode: string) => {
        if (mode === 'readonly') return { objectStore: () => ({ openCursor: () => {
          const cursor = { result: null, onsuccess: () => {} };
          queueMicrotask(() => cursor.onsuccess());
          return cursor;
        } }) };
        const tx: { objectStore: () => { put: ReturnType<typeof vi.fn> }; oncomplete?: () => void;
          onerror?: () => void; error?: Error } = { objectStore: () => ({ put: vi.fn() }) };
        writes.push(tx);
        return tx;
      },
    };
    vi.stubGlobal('indexedDB', { open: () => {
      const request = { result: database, onsuccess: () => {} };
      queueMicrotask(() => request.onsuccess());
      return request;
    } });
    vi.stubGlobal('navigator', { storage: { persist: async () => true } });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await initVaultStore();
      const state = { serverUrl: 'http://localhost', username: 'admin', deviceId: 'test', deviceName: 'Phone',
        refreshToken: 'test-credential', lastRev: 0, bases: {}, lastSyncAt: null };
      let resolved = false;
      const pending = saveSyncState(state).then(() => { resolved = true; });
      await Promise.resolve();
      expect(writes).toHaveLength(1);
      expect(resolved).toBe(false);
      writes[0].oncomplete!();
      await pending;
      expect(resolved).toBe(true);

      const failed = saveSyncState({ ...state, lastRev: 1 });
      const rejection = expect(failed).rejects.toThrow('write failed');
      await Promise.resolve();
      writes[1].error = new Error('write failed');
      writes[1].onerror!();
      await rejection;
    } finally {
      vi.unstubAllGlobals();
      errors.mockRestore();
    }
  });
});

it('allows writes and another wipe after a failed deletion', async () => {
  vi.resetModules();
  vi.stubGlobal('BroadcastChannel', undefined);
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    get length() { return values.size; }, key: (i: number) => [...values.keys()][i],
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  let fail = true;
  const deletion = vi.fn(() => {
    const request = { error: new Error('delete failed'), onerror: () => {}, onsuccess: () => {} };
    queueMicrotask(() => fail ? request.onerror() : request.onsuccess());
    return request;
  });
  vi.stubGlobal('indexedDB', { deleteDatabase: deletion });
  try {
    const store = await import('./vaultStore');
    await expect(store.wipeLocalVault()).rejects.toThrow('delete failed');
    await store.saveSyncState(null);
    expect(values.get('daymark_sync_state_v1')).toBe('null');
    fail = false;
    await store.wipeLocalVault();
    expect(deletion).toHaveBeenCalledTimes(2);
    expect(values.size).toBe(0);
  } finally { vi.unstubAllGlobals(); }
});
