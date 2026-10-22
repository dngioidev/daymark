import { afterEach, expect, it, vi } from 'vitest';
import { retryPendingLogout } from './logoutPending';

afterEach(() => vi.unstubAllGlobals());

it('retains pending logout on network and HTTP failures and clears it on success', async () => {
  const values = new Map([['daymark_logout_pending', '1']]);
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => values.delete(key) });
  const request = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(new Response());
  vi.stubGlobal('fetch', request);
  expect(await retryPendingLogout()).toBe(false);
  expect(await retryPendingLogout()).toBe(false);
  expect(values.size).toBe(1);
  expect(await retryPendingLogout()).toBe(true);
  expect(values.size).toBe(0);
  expect(request).toHaveBeenLastCalledWith('/api/auth/logout', { method: 'POST', headers: { 'X-Daymark-Client': 'web' }, credentials: 'same-origin' });
});

it('does not request logout without a pending flag', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null });
  const request = vi.fn();
  vi.stubGlobal('fetch', request);
  expect(await retryPendingLogout()).toBe(true);
  expect(request).not.toHaveBeenCalled();
});
