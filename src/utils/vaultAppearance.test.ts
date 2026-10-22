import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from './defaultData';

vi.mock('../native/daymarkBridge', () => ({ isNativeApp: () => false }));

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe.each(['indexeddb', 'legacy'] as const)('appearance upgrade in %s', (mode) => {
  it.each(['settings', 'daily_docs', 'notes', 'fresh'] as const)('detects %s before filling defaults and saves once', async (key) => {
    vi.resetModules();
    vi.stubGlobal('BroadcastChannel', undefined);
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    vi.stubGlobal('navigator', { storage: {} });
    const { appearance: _appearance, ...older } = DEFAULT_SETTINGS;
    const stored = new Map<string, unknown>(key === 'fresh' ? [] : [[key, key === 'settings' ? older : []]]);
    const legacy = new Map<string, string>();
    if (mode === 'legacy' && key !== 'fresh') legacy.set(`daymark_${key}_v1`, JSON.stringify(stored.get(key)));
    let writes = 0;
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => legacy.get(k) ?? null,
      setItem: (k: string, v: string) => { writes++; legacy.set(k, v); },
    });
    if (mode === 'legacy') {
      vi.stubGlobal('indexedDB', undefined);
      vi.spyOn(console, 'error').mockImplementation(() => {});
    } else {
      const database = { transaction: (_store: string, access: string) => {
        const tx = { oncomplete: () => {}, objectStore: () => ({
          openCursor: () => {
            const entries = [...stored.entries()];
            let i = 0;
            const req: { result: unknown; onsuccess: () => void } = { result: null, onsuccess: () => {} };
            const next = () => queueMicrotask(() => {
              const entry = entries[i++];
              req.result = entry ? { key: entry[0], value: entry[1], continue: next } : null;
              req.onsuccess();
            });
            next();
            return req;
          },
          put: (v: unknown, k: string) => { writes++; stored.set(k, v); },
        }) };
        if (access === 'readwrite') queueMicrotask(() => tx.oncomplete());
        return tx;
      } };
      vi.stubGlobal('indexedDB', { open: () => {
        const req = { result: database, onsuccess: () => {} };
        queueMicrotask(() => req.onsuccess());
        return req;
      } });
    }
    const store = await import('./vaultStore');
    await store.initVaultStore();
    const first = store.loadSettings();
    expect(first.appearance?.theme).toBe(key === 'fresh' ? 'light' : 'dark');
    await Promise.resolve();
    expect(writes).toBe(1);
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    expect(store.loadSettings().appearance?.theme).toBe(first.appearance?.theme);
    await Promise.resolve();
    expect(writes).toBe(1);
    vi.resetModules();
    const reloaded = await import('./vaultStore');
    await reloaded.initVaultStore();
    expect(reloaded.loadSettings().appearance?.theme).toBe(first.appearance?.theme);
    expect(writes).toBe(1);
  });
});
