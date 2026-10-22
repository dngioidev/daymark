import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../native/daymarkBridge', () => ({ isNativeApp: () => false }));
afterEach(() => vi.unstubAllGlobals());

it('tells other open tabs to wipe and prevents a peer from saving its old vault again', async () => {
  const peers: { onmessage?: (event: { data: unknown }) => void }[] = [];
  vi.stubGlobal('BroadcastChannel', class {
    onmessage?: (event: { data: unknown }) => void;
    constructor() { peers.push(this); }
    postMessage(data: unknown) {
      for (const peer of peers) if (peer !== this) queueMicrotask(() => peer.onmessage?.({ data }));
    }
  });
  const setItem = vi.fn();
  const replace = vi.fn();
  vi.stubGlobal('location', { replace });
  vi.stubGlobal('localStorage', { length: 0, getItem: () => null, setItem });
  vi.stubGlobal('indexedDB', undefined);
  vi.stubGlobal('caches', { keys: async () => [], delete: async () => true });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    vi.resetModules();
    const first = await import('./vaultStore');
    vi.resetModules();
    const second = await import('./vaultStore');
    await first.initVaultStore();
    await second.initVaultStore();
    await first.wipeLocalVault();
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    second.saveStandaloneNotes([]);
    expect(setItem).not.toHaveBeenCalled();
  } finally { log.mockRestore(); }
});
