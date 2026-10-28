import { describe, expect, it, vi } from 'vitest';
import { isStandaloneNote } from './vaultValidation';
import { DEFAULT_SETTINGS, SEED_STANDALONE_NOTES } from './defaultData';
import { initVaultStore, keepValid, parseVaultMessage, saveSyncState } from './vaultStore';
import type { HabitData } from '../types/daymark';
import { EMPTY_HABITS } from './habits';

vi.mock('../native/daymarkBridge', () => ({ isNativeApp: () => false }));

const habits: HabitData = {
  habits: [{ id: 'read', name: 'Read', order: 0, warnAfterDays: 3, addedOn: '2026-10-24', updatedAt: '2026-10-24T10:00:00Z' }],
  days: [{ date: '2026-10-24', ticks: { read: { done: true, at: '2026-10-24T10:00:00Z' } } }],
};

async function habitStoreTest(run: (env: {
  store: typeof import('./vaultStore'); values: Map<string, string>;
  raw: Map<string, unknown>; messages: unknown[];
  peers: { onmessage?: (event: { data: unknown }) => void }[];
}) => Promise<void>, indexed = false, legacy?: string, legacyKey = 'daymark_habits_v1') {
  vi.resetModules();
  const values = new Map<string, string>(legacy === undefined ? [] : [[legacyKey, legacy]]);
  const raw = new Map<string, unknown>();
  const messages: unknown[] = [];
  const peers: { onmessage?: (event: { data: unknown }) => void }[] = [];
  vi.stubGlobal('BroadcastChannel', class {
    onmessage?: (event: { data: unknown }) => void;
    constructor() { peers.push(this); }
    postMessage(data: unknown) {
      messages.push(data);
      for (const peer of peers) if (peer !== this) peer.onmessage?.({ data });
    }
  });
  vi.stubGlobal('localStorage', {
    get length() { return values.size; }, key: (i: number) => [...values.keys()][i],
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  const database = {
    close: () => {},
    transaction: (_store: string, mode: string) => ({
      objectStore: () => ({
        get: (key: string) => {
          const request = { result: raw.get(key), onsuccess: () => {} };
          queueMicrotask(() => request.onsuccess());
          return request;
        },
        openKeyCursor: () => {
          const keys = [...raw.keys()];
          let index = 0;
          const request: { result: unknown; onsuccess: () => void } = { result: null, onsuccess: () => {} };
          const advance = () => queueMicrotask(() => {
            const key = keys[index++];
            request.result = key ? { key, continue: advance } : null;
            request.onsuccess();
          });
          advance();
          return request;
        },
        openCursor: () => {
          const entries = [...raw.entries()];
          let index = 0;
          const request: { result: unknown; onsuccess: () => void } = { result: null, onsuccess: () => {} };
          const advance = () => queueMicrotask(() => {
            const entry = entries[index++];
            request.result = entry ? { key: entry[0], value: entry[1], continue: advance } : null;
            request.onsuccess();
          });
          advance();
          return request;
        },
        put: (value: unknown, key: string) => raw.set(key, value),
      }),
      set oncomplete(fn: () => void) { if (mode === 'readwrite') queueMicrotask(fn); },
    }),
  };
  vi.stubGlobal('indexedDB', indexed ? {
    open: () => {
      const req = { result: database, onsuccess: () => {} };
      queueMicrotask(() => req.onsuccess());
      return req;
    },
    deleteDatabase: () => {
      raw.clear();
      const req = { onsuccess: () => {} };
      queueMicrotask(() => req.onsuccess());
      return req;
    },
  } : undefined);
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('caches', { keys: async () => [] });
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const store = await import('./vaultStore');
    await store.initVaultStore();
    await run({ store, values, raw, messages, peers });
  } finally { vi.unstubAllGlobals(); errors.mockRestore(); }
}

describe('habit storage', () => {
  it.each([false, true].flatMap(indexed => [
    { indexed, damage: 'day', value: { ...habits, days: [...habits.days, { date: 'broken', ticks: {} }] } },
    { indexed, damage: 'habit', value: { ...habits, habits: [...habits.habits, { id: 'bad' }] } },
    { indexed, damage: 'tick', value: { ...habits, days: [{ ...habits.days[0], ticks: { bad: { done: 'yes' } } }] } },
    { indexed, damage: 'whole value', value: null },
  ]))('recovery persists a habit-only rebase once ($damage, IndexedDB: $indexed)', async ({ indexed, value }) => {
    await habitStoreTest(async ({ store, values, raw }) => {
      const state = { serverUrl: 'https://test', username: 'a', deviceId: 'a', deviceName: 'a',
        lastRev: 42, habitsSynced: true, lastSyncAt: null,
        bases: { habits: JSON.stringify({ habits: habits.habits }),
          'habitday:2026-10-24': JSON.stringify(habits.days[0]), settings: '{}', 'note:keep': '{}' } };
      await store.saveSyncState(state);
      store.loadHabits();
      const expected = { ...state, habitsSynced: false, bases: { settings: '{}', 'note:keep': '{}' } };
      expect(store.loadSyncState()).toEqual(expected);
      await vi.waitFor(() => expect(indexed ? raw.get('sync_state') : JSON.parse(values.get('daymark_sync_state_v1')!)).toEqual(expected));
      await store.saveSyncState(state);
      store.loadHabits();
      expect(store.loadSyncState()).toEqual(state);
    }, indexed, JSON.stringify(value));
  });

  it.each([undefined, JSON.stringify(habits)])('leaves sync state untouched without recovery: %s', async (legacy) => {
    await habitStoreTest(async ({ store, values }) => {
      const state = { serverUrl: 'https://test', username: 'a', deviceId: 'a', deviceName: 'a',
        lastRev: 42, habitsSynced: true, lastSyncAt: null, bases: { habits: '{}' } };
      await store.saveSyncState(state);
      const before = values.get('daymark_sync_state_v1');
      store.loadHabits();
      expect(store.loadSyncState()).toBe(state);
      expect(values.get('daymark_sync_state_v1')).toBe(before);
    }, false, legacy);
  });

  it('keeps valid habits, days and ticks when sibling entries are damaged', async () => {
    const damaged = { habits: [habits.habits[0], { id: 'bad' }], days: [
      { ...habits.days[0], ticks: { ...habits.days[0].ticks, bad: { done: 'yes' } } },
      { date: 'broken', ticks: {} },
    ] };
    await habitStoreTest(async ({ store, values }) => {
      expect(store.loadHabits()).toEqual(habits);
      expect(store.loadHabits()).toBe(store.loadHabits());
      store.saveHabits(store.loadHabits());
      expect(JSON.parse(values.get('daymark_habits_v1')!)).toEqual(damaged);
    }, false, JSON.stringify(damaged));
  });
  it.each(['{bad json', JSON.stringify({ habits: [{ bad: true }], days: 'bad' }), 'null'])('does not overwrite invalid storage or push habit deletions before an edit: %s', async (legacy) => {
    await habitStoreTest(async ({ store, values, messages }) => {
      const loaded = store.loadHabits();
      expect(loaded).toEqual(EMPTY_HABITS);
      store.saveHabits(loaded);
      expect(values.get('daymark_habits_v1')).toBe(legacy);
      expect(messages).toEqual([]);
      const { syncOnce } = await import('../sync/syncClient');
      const sent: { changes: { key: string }[] }[] = [];
      await syncOnce(async (_url, init) => {
        sent.push(JSON.parse(String(init?.body)));
        return Response.json({ rev: 2, entities: [], conflicts: [] });
      }, { docs: [], notes: [], settings: DEFAULT_SETTINGS, habits: loaded, backlog: { items: [] }, notemeta: { folders: [], dismissed: [] } }, {
        serverUrl: 'https://test', username: 'a', deviceId: 'a', deviceName: 'a', lastRev: 1, lastSyncAt: null,
        bases: { habits: JSON.stringify({ habits: habits.habits }), 'habitday:2026-10-24': JSON.stringify(habits.days[0]) },
      }, 'access');
      expect(sent[0].changes.some(c => c.key.startsWith('habit'))).toBe(false);
      store.saveHabits(habits);
      expect(JSON.parse(values.get('daymark_habits_v1')!)).toEqual(habits);
    }, false, legacy);
  });
  it.each([undefined, '{bad json', JSON.stringify({ habits: [], days: 'bad' })])('loadHabits returns EMPTY_HABITS when absent or damaged: %s', async (legacy) => {
    await habitStoreTest(async ({ store }) => expect(store.loadHabits()).toEqual(EMPTY_HABITS), false, legacy);
  });

  it.each([false, true])('saveHabits round-trips and broadcasts (IndexedDB: %s)', async (indexed) => {
    await habitStoreTest(async ({ store, raw, values, messages }) => {
      store.saveHabits(habits);
      expect(store.loadHabits()).toBe(habits);
      expect(messages).toContainEqual({ key: 'habits', value: habits });
      await vi.waitFor(() => expect(indexed ? raw.get('habits') : JSON.parse(values.get('daymark_habits_v1')!)).toEqual(habits));
      vi.resetModules();
      const reloaded = await import('./vaultStore');
      await reloaded.initVaultStore();
      expect(reloaded.loadHabits()).toEqual(habits);
    }, indexed);
  });

  it('parseVaultMessage accepts valid habits and rejects junk', () => {
    expect(parseVaultMessage({ key: 'habits', value: habits })).toEqual({ key: 'habits', value: habits });
    for (const value of [null, [], {}, { ...habits, days: [{ date: 'bad', ticks: {} }] }]) {
      expect(parseVaultMessage({ key: 'habits', value })).toBeNull();
    }
  });

  it('refreshes habits from a peer and avoids rebroadcasting them', async () => {
    await habitStoreTest(async ({ store, peers, messages }) => {
      const received: string[] = [];
      const unsubscribe = store.subscribeExternalChanges((key) => received.push(key));
      peers[0].onmessage?.({ data: { key: 'habits', value: habits } });
      expect(store.loadHabits()).toBe(habits);
      expect(received).toEqual(['habits']);
      store.saveHabits(store.loadHabits());
      expect(messages).toEqual([]);
      unsubscribe();
    });
  });

  it('resets habits to EMPTY_HABITS with the seed vault', async () => {
    await habitStoreTest(async ({ store }) => {
      store.saveHabits(habits);
      expect(store.resetVaultToSeedData().habits).toEqual(EMPTY_HABITS);
      expect(store.loadHabits()).toEqual(EMPTY_HABITS);
    });
  });

  it.each([false, true])('wipe removes habits from memory and persistence (IndexedDB: %s)', async (indexed) => {
    await habitStoreTest(async ({ store, raw, values }) => {
      store.saveHabits(habits);
      await store.wipeLocalVault();
      expect(raw.has('habits')).toBe(false);
      expect(values.has('daymark_habits_v1')).toBe(false);
      expect(store.loadHabits()).toEqual(EMPTY_HABITS);
    }, indexed);
  });

  it('JSON export contains habits', async () => {
    await habitStoreTest(async ({ store }) => {
      let exported: Blob | undefined;
      vi.stubGlobal('URL', { createObjectURL: (blob: Blob) => { exported = blob; return 'blob:test'; }, revokeObjectURL: () => {} });
      vi.stubGlobal('document', { createElement: () => ({ click: () => {} }), body: { appendChild: () => {}, removeChild: () => {} } });
      await store.exportVaultAsJson([], [], DEFAULT_SETTINGS, habits);
      expect(JSON.parse(await exported!.text()).habits).toEqual(habits);
    });
  });

  it('JSON download contains referenced pictures as metadata and base64 alongside habits', async () => {
    await habitStoreTest(async ({ store, raw }) => {
      const id = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
      const meta = { id, mime: 'image/png', bytes: 3, width: 10, height: 20, createdAt: '2026-10-25T00:00:00Z' };
      raw.set(`noteAsset:${id}`, new Blob(['abc'], { type: 'image/png' }));
      raw.set(`noteAssetMeta:${id}`, meta);
      let exported: Blob | undefined;
      vi.stubGlobal('URL', { createObjectURL: (blob: Blob) => { exported = blob; return 'blob:test'; }, revokeObjectURL: () => {} });
      vi.stubGlobal('document', { createElement: () => ({ click: () => {} }), body: { appendChild: () => {}, removeChild: () => {} } });
      const notes = [{ ...SEED_STANDALONE_NOTES[0], content: `![](daymark-asset:${id}.png)` }];
      await store.exportVaultAsJson([], notes, DEFAULT_SETTINGS, habits);
      const backup = JSON.parse(await exported!.text());
      expect(backup.assets).toEqual([{ meta, data: 'YWJj' }]);
      expect(backup.standalone_notes).toEqual(notes);
      expect(backup.habits).toEqual(habits);
    }, true);
  });

  it('vault wipe removes picture bytes, metadata and the pending upload queue', async () => {
    await habitStoreTest(async ({ store, raw }) => {
      await store.kvPutRaw('noteAsset:test', new Blob(['picture']));
      await store.kvPutRaw('noteAssetMeta:test', { id: 'test' });
      await store.kvPutRaw('noteAssetPending', ['test']);
      expect(raw.size).toBeGreaterThanOrEqual(3);
      await store.wipeLocalVault();
      expect([...raw.keys()].filter(key => key.startsWith('noteAsset'))).toEqual([]);
      expect(await store.kvGetRaw('noteAssetPending')).toBeUndefined();
    }, true);
  });
});

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

const backlog = { items: [{ id: 'idea', title: 'Build it', order: 1, createdAt: 'now', updatedAt: 'now' }] };
describe('backlog storage', () => {
  it('loads empty when absent', async () => {
    await habitStoreTest(async ({ store }) => expect(store.loadBacklog()).toEqual({ items: [] }));
  });
  it.each([false, true])('persists, broadcasts and reloads (IndexedDB: %s)', async indexed => {
    await habitStoreTest(async ({ store, raw, values, messages }) => {
      store.saveBacklog(backlog);
      expect(store.loadBacklog()).toBe(backlog);
      expect(messages).toContainEqual({ key: 'backlog', value: backlog });
      await vi.waitFor(() => expect(indexed ? raw.get('backlog') : JSON.parse(values.get('daymark_backlog_v1')!)).toEqual(backlog));
      vi.resetModules();
      const reloaded = await import('./vaultStore');
      await reloaded.initVaultStore();
      expect(reloaded.loadBacklog()).toEqual(backlog);
    }, indexed);
  });
  it.each([false, true].flatMap(indexed => ['{bad json', 'null', JSON.stringify({ items: [...backlog.items, { id: 'bad' }] })].map(legacy => ({ indexed, legacy }))))(
    'preserves damaged storage until edited ($indexed, $legacy)', async ({ indexed, legacy }) => {
      await habitStoreTest(async ({ store, values, raw, messages }) => {
        const before = raw.get('backlog');
        const reported: string[] = [];
        const unsubscribe = store.subscribeStorageErrors(message => reported.push(message));
        const error = vi.spyOn(console, 'error');
        const loaded = store.loadBacklog();
        expect(loaded).toEqual(legacy.startsWith('{"items"') ? backlog : { items: [] });
        expect(store.loadBacklog()).toBe(loaded);
        store.saveBacklog(loaded);
        expect(values.get('daymark_backlog_v1')).toBe(legacy);
        expect(raw.get('backlog')).toEqual(before);
        expect(messages).toEqual([]);
        expect(error).toHaveBeenCalled();
        expect(reported.some(message => /backlog/i.test(message))).toBe(true);
        store.saveBacklog({ items: [...loaded.items, { ...backlog.items[0], id: 'edited' }] });
        const edited = store.loadBacklog();
        await vi.waitFor(() => expect(indexed ? raw.get('backlog') : JSON.parse(values.get('daymark_backlog_v1')!)).toEqual(edited));
        expect(edited.items.at(-1)?.id).toBe('edited');
        unsubscribe();
      }, indexed, legacy, 'daymark_backlog_v1');
    });
  it('refreshes valid peer changes, rejects damage and avoids loops', async () => {
    await habitStoreTest(async ({ store, peers, messages }) => {
      const received: string[] = [];
      store.subscribeExternalChanges(key => received.push(key));
      peers[0].onmessage?.({ data: { key: 'backlog', value: backlog } });
      expect(store.loadBacklog()).toBe(backlog);
      expect(received).toEqual(['backlog']);
      peers[0].onmessage?.({ data: { key: 'backlog', value: { items: [null] } } });
      expect(store.loadBacklog()).toBe(backlog);
      store.saveBacklog(store.loadBacklog());
      expect(messages).toEqual([]);
    });
  });
  it.each([false, true])('reset and wipe clear backlog (IndexedDB: %s)', async indexed => {
    await habitStoreTest(async ({ store, values, raw }) => {
      store.saveBacklog(backlog);
      expect(store.resetVaultToSeedData().backlog).toEqual({ items: [] });
      expect(store.loadBacklog()).toEqual({ items: [] });
      store.saveBacklog(backlog);
      await store.wipeLocalVault();
      expect(store.loadBacklog()).toEqual({ items: [] });
      expect(values.has('daymark_backlog_v1')).toBe(false);
      expect(raw.has('backlog')).toBe(false);
    }, indexed);
  });
  it('JSON backup round-trips backlog and old JSON preserves current data', async () => {
    await habitStoreTest(async ({ store }) => {
      let exported: Blob | undefined;
      vi.stubGlobal('URL', { createObjectURL: (blob: Blob) => { exported = blob; return 'blob:test'; }, revokeObjectURL: () => {} });
      vi.stubGlobal('document', { createElement: () => ({ click: () => {} }), body: { appendChild: () => {}, removeChild: () => {} } });
      store.saveBacklog(backlog);
      await store.exportVaultAsJson([], [], DEFAULT_SETTINGS, habits);
      const parsed = JSON.parse(await exported!.text());
      expect(parsed.backlog).toEqual(backlog);
      const { mergeRestoredBacklog } = await import('./vaultArchive');
      store.saveBacklog(mergeRestoredBacklog({ items: [] }, parsed.backlog));
      expect(store.loadBacklog()).toEqual(backlog);
      expect(mergeRestoredBacklog(backlog, JSON.parse('{}').backlog)).toBe(backlog);
    });
  });
});

it('damaged backlog resets only its sync base and cannot be pushed before backfill', async () => {
  await habitStoreTest(async ({ store, values }) => {
    const { syncOnce, applySyncOutcome } = await import('../sync/syncClient');
    await store.saveSyncState({ serverUrl: 'https://test', username: 'admin', deviceId: 'a', deviceName: 'A', lastRev: 99,
      lastSyncAt: null, habitsSynced: true, backlogSynced: true, bases: { backlog: JSON.stringify(backlog), habits: '{"habits":[]}' } });
    const recovered = store.loadBacklog();
    const { uneditedRecoveredBacklog } = await import('./backlog');
    expect(uneditedRecoveredBacklog.has(recovered)).toBe(true);
    expect(store.loadSyncState()).toMatchObject({ backlogSynced: false, habitsSynced: true, bases: { habits: '{"habits":[]}' } });
    expect(store.loadSyncState()!.bases).not.toHaveProperty('backlog');
    const local = { docs: [], notes: [], settings: DEFAULT_SETTINGS, habits: { habits: [], days: [] }, backlog: recovered, notemeta: { folders: [], dismissed: [] } };
    const requests: { sinceRev: number; changes: { key: string }[] }[] = [];
    const outcome = await syncOnce(async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({ rev: 100, entities: [{ key: 'backlog', rev: 1, value: backlog }], conflicts: [] });
    }, local, store.loadSyncState()!, 'access');
    expect(requests[0].sinceRev).toBe(0);
    expect(requests[0].changes.some(c => c.key === 'backlog')).toBe(false);
    const merged = applySyncOutcome(local, outcome);
    expect(merged.backlog).toEqual(backlog);
    store.saveBacklog(merged.backlog);
    expect(JSON.parse(values.get('daymark_backlog_v1')!)).toEqual(backlog);
  }, false, '{bad json', 'daymark_backlog_v1');
});

const notemeta = { folders: [{ path: 'Tech/Java', updatedAt: 'now' }, { path: 'Gone', updatedAt: 'now', removed: true }], dismissed: [{ key: 'a|b', at: 'now', restored: true }] };
describe('notemeta storage', () => {
  it('loads empty when absent', async () => {
    await habitStoreTest(async ({ store }) => expect(store.loadNoteMeta()).toEqual({ folders: [], dismissed: [] }));
  });
  it.each([false, true])('persists, broadcasts and reloads (IndexedDB: %s)', async indexed => {
    await habitStoreTest(async ({ store, raw, values, messages }) => {
      store.saveNoteMeta(notemeta);
      expect(store.loadNoteMeta()).toBe(notemeta);
      expect(messages).toContainEqual({ key: 'notemeta', value: notemeta });
      await vi.waitFor(() => expect(indexed ? raw.get('notemeta') : JSON.parse(values.get('daymark_notemeta_v1')!)).toEqual(notemeta));
      vi.resetModules();
      const reloaded = await import('./vaultStore');
      await reloaded.initVaultStore();
      expect(reloaded.loadNoteMeta()).toEqual(notemeta);
    }, indexed);
  });
  it.each([false, true].flatMap(indexed => ['{bad json', 'null',
    JSON.stringify({ ...notemeta, folders: [...notemeta.folders, { path: 1 }] }),
    JSON.stringify({ ...notemeta, dismissed: [...notemeta.dismissed, { key: false }] }),
  ].map(legacy => ({ indexed, legacy }))))(
    'preserves damaged storage until edited ($indexed, $legacy)', async ({ indexed, legacy }) => {
      await habitStoreTest(async ({ store, values, raw, messages }) => {
        const before = raw.get('notemeta');
        const reported: string[] = [];
        const unsubscribe = store.subscribeStorageErrors(message => reported.push(message));
        const error = vi.spyOn(console, 'error');
        const loaded = store.loadNoteMeta();
        expect(loaded).toEqual(legacy.startsWith('{"folders"') ? notemeta : { folders: [], dismissed: [] });
        expect(store.loadNoteMeta()).toBe(loaded);
        const { uneditedRecoveredNoteMeta } = await import('./noteFolders');
        expect(uneditedRecoveredNoteMeta.has(loaded)).toBe(true);
        store.saveNoteMeta(loaded);
        expect(values.get('daymark_notemeta_v1')).toBe(legacy);
        expect(raw.get('notemeta')).toEqual(before);
        expect(messages).toEqual([]);
        expect(error).toHaveBeenCalled();
        expect(reported.some(message => /note metadata/i.test(message))).toBe(true);
        store.saveNoteMeta({ ...loaded, folders: [...loaded.folders, { path: 'edited', updatedAt: 'now' }] });
        const edited = store.loadNoteMeta();
        await vi.waitFor(() => expect(indexed ? raw.get('notemeta') : JSON.parse(values.get('daymark_notemeta_v1')!)).toEqual(edited));
        expect(edited.folders.at(-1)?.path).toBe('edited');
        unsubscribe();
      }, indexed, legacy, 'daymark_notemeta_v1');
    });
  it('refreshes valid peer changes, rejects damage and avoids loops', async () => {
    await habitStoreTest(async ({ store, peers, messages }) => {
      const received: string[] = [];
      store.subscribeExternalChanges(key => received.push(key));
      peers[0].onmessage?.({ data: { key: 'notemeta', value: notemeta } });
      expect(store.loadNoteMeta()).toBe(notemeta);
      expect(received).toEqual(['notemeta']);
      peers[0].onmessage?.({ data: { key: 'notemeta', value: { folders: [null], dismissed: [] } } });
      expect(store.loadNoteMeta()).toBe(notemeta);
      store.saveNoteMeta(store.loadNoteMeta());
      expect(messages).toEqual([]);
    });
  });
  it.each([false, true])('reset and wipe clear notemeta (IndexedDB: %s)', async indexed => {
    await habitStoreTest(async ({ store, values, raw }) => {
      store.saveNoteMeta(notemeta);
      expect(store.resetVaultToSeedData().notemeta).toEqual({ folders: [], dismissed: [] });
      expect(store.loadNoteMeta()).toEqual({ folders: [], dismissed: [] });
      store.saveNoteMeta(notemeta);
      await store.wipeLocalVault();
      expect(store.loadNoteMeta()).toEqual({ folders: [], dismissed: [] });
      expect(values.has('daymark_notemeta_v1')).toBe(false);
      expect(raw.has('notemeta')).toBe(false);
    }, indexed);
  });
  it('JSON backup round-trips notemeta and old JSON preserves current data', async () => {
    await habitStoreTest(async ({ store }) => {
      let exported: Blob | undefined;
      vi.stubGlobal('URL', { createObjectURL: (blob: Blob) => { exported = blob; return 'blob:test'; }, revokeObjectURL: () => {} });
      vi.stubGlobal('document', { createElement: () => ({ click: () => {} }), body: { appendChild: () => {}, removeChild: () => {} } });
      store.saveNoteMeta(notemeta);
      await store.exportVaultAsJson([], [], DEFAULT_SETTINGS, habits);
      const parsed = JSON.parse(await exported!.text());
      expect(parsed.notemeta).toEqual(notemeta);
      const { mergeRestoredNoteMeta } = await import('./vaultArchive');
      store.saveNoteMeta(mergeRestoredNoteMeta({ folders: [], dismissed: [] }, parsed.notemeta));
      expect(store.loadNoteMeta()).toEqual(notemeta);
      expect(mergeRestoredNoteMeta(notemeta, JSON.parse('{}').notemeta)).toBe(notemeta);
    });
  });
  it('ZIP download defaults to the persisted note metadata', async () => {
    await habitStoreTest(async ({ store }) => {
      let exported: Blob | undefined;
      vi.stubGlobal('URL', { createObjectURL: (blob: Blob) => { exported = blob; return 'blob:test'; }, revokeObjectURL: () => {} });
      vi.stubGlobal('document', { createElement: () => ({ click: () => {} }), body: { appendChild: () => {}, removeChild: () => {} } });
      store.saveNoteMeta(notemeta);
      await store.exportVaultAsZip([], [], DEFAULT_SETTINGS, habits);
      const { importVaultFromZip } = await import('./vaultArchive');
      expect((await importVaultFromZip(await exported!.arrayBuffer())).notemeta).toEqual(notemeta);
    });
  });
});

it('damaged NoteMeta resets only its sync bookkeeping', async () => {
  await habitStoreTest(async ({ store }) => {
    await store.saveSyncState({ serverUrl: 'https://test', username: 'admin', deviceId: 'a', deviceName: 'A', lastRev: 99,
      lastSyncAt: null, habitsSynced: true, backlogSynced: true, notemetaSynced: true,
      bases: { notemeta: JSON.stringify(notemeta), backlog: JSON.stringify(backlog), habits: '{"habits":[]}' } });
    store.loadNoteMeta();
    const state = store.loadSyncState()!;
    expect(state).toMatchObject({ notemetaSynced: false, backlogSynced: true, habitsSynced: true, lastRev: 99 });
    expect(state.bases).toEqual({ backlog: JSON.stringify(backlog), habits: '{"habits":[]}' });
  }, false, '{bad json', 'daymark_notemeta_v1');
});
