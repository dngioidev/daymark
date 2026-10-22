import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../native/daymarkBridge', () => ({ isNativeApp: () => false }));

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('wipes leftover vault before showing sign-in and keeps pending logout when offline', async () => {
  vi.resetModules();
  vi.stubGlobal('BroadcastChannel', undefined);
  vi.stubGlobal('document', { cookie: '' });
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
  expect(await prepareSignIn()).toBe('logout-pending');
  expect(deleteDatabase).toHaveBeenCalledWith('daymark');
  expect([...values.keys()]).toEqual(['daymark_logout_pending', 'unrelated']);
  expect(deleted).toEqual(['private-cache', 'app']);
  // The queued deletion can finish later, after the blocking tab closes.
  deletion.onsuccess();
  expect(await prepareSignIn()).toBe('ready');
  expect([...values.keys()]).toEqual(['unrelated']);
});

async function sessionPage(response: Response | Error, cookie = 'other=1; daymark_signed_in=1') {
  vi.resetModules();
  const broadcast = vi.fn();
  vi.stubGlobal('BroadcastChannel', class {
    postMessage = broadcast;
    addEventListener() {}
  });
  vi.stubGlobal('document', { cookie });
  const replace = vi.fn();
  vi.stubGlobal('location', { replace });
  const values = new Map([['daymark_notes_v1', 'unsent edit']]);
  vi.stubGlobal('localStorage', {
    get length() { return values.size; }, key: (i: number) => [...values.keys()][i],
    getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => values.delete(key),
  });
  const deleteDatabase = vi.fn(() => {
    const request = { onsuccess: () => {} };
    queueMicrotask(() => request.onsuccess());
    return request;
  });
  vi.stubGlobal('indexedDB', { deleteDatabase });
  vi.stubGlobal('caches', { keys: async () => [] });
  const request = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal('fetch', request);
  const { prepareSignIn } = await import('./startup');
  return { prepareSignIn, values, broadcast, deleteDatabase, replace, request };
}

it('redirects a valid session without wiping or broadcasting to signed-in app tabs', async () => {
  const page = await sessionPage(new Response('{}'));
  await page.prepareSignIn();
  expect(page.request).toHaveBeenCalledWith('/api/auth/refresh', {
    method: 'POST', headers: { 'X-Daymark-Client': 'web' }, credentials: 'same-origin',
  });
  expect(page.replace).toHaveBeenCalledWith('/');
  expect(page.values.get('daymark_notes_v1')).toBe('unsent edit');
  expect(page.deleteDatabase).not.toHaveBeenCalled();
  expect(page.broadcast).not.toHaveBeenCalled();
});

it('wipes and broadcasts only after refresh confirms 401', async () => {
  const page = await sessionPage(new Response(null, { status: 401 }));
  await page.prepareSignIn();
  expect(page.request).toHaveBeenCalledTimes(1);
  expect(page.values.has('daymark_notes_v1')).toBe(false);
  expect(page.deleteDatabase).toHaveBeenCalledWith('daymark');
  expect(page.broadcast).toHaveBeenCalledWith({ type: 'wipe' });
  expect(page.replace).not.toHaveBeenCalled();
});

it.each([new Error('offline'), new Response(null, { status: 503 })])('preserves unsent edits when the session cannot be checked: %s', async (response) => {
  const page = await sessionPage(response);
  await page.prepareSignIn();
  expect(page.values.get('daymark_notes_v1')).toBe('unsent edit');
  expect(page.deleteDatabase).not.toHaveBeenCalled();
  expect(page.broadcast).not.toHaveBeenCalled();
  expect(page.replace).not.toHaveBeenCalled();
});
