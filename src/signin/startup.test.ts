import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('wipes leftover vault before showing sign-in and keeps pending logout when offline', async () => {
  vi.resetModules();
  vi.stubGlobal('BroadcastChannel', undefined);
  const values = new Map([['daymark_notes_v1', 'private'], ['daymark_logout_pending', '1'], ['unrelated', 'keep']]);
  vi.stubGlobal('localStorage', {
    get length() { return values.size; }, key: (i: number) => [...values.keys()][i],
    getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => values.delete(key),
  });
  let deletion!: { onblocked: () => void; onsuccess: () => void };
  const deleteDatabase = vi.fn(() => {
    deletion = { onblocked: () => {}, onsuccess: () => {} };
    queueMicrotask(() => deletion.onblocked());
    return deletion;
  });
  vi.stubGlobal('indexedDB', { deleteDatabase });
  const deleted: string[] = [];
  vi.stubGlobal('caches', { keys: async () => ['private-cache', 'app'], delete: async (key: string) => { deleted.push(key); return true; } });
  const request = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(new Response());
  vi.stubGlobal('fetch', request);
  const { prepareSignIn } = await import('./startup');
  expect(await prepareSignIn()).toBe(false);
  expect(deleteDatabase).toHaveBeenCalledWith('daymark');
  expect([...values.keys()]).toEqual(['daymark_logout_pending', 'unrelated']);
  expect(deleted).toEqual(['private-cache', 'app']);
  // The queued deletion can finish later, after the blocking tab closes.
  deletion.onsuccess();
  expect(await prepareSignIn()).toBe(true);
  expect([...values.keys()]).toEqual(['unrelated']);
});
