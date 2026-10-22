import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../native/daymarkBridge', () => ({ isNativeApp: () => false }));

afterEach(() => vi.unstubAllGlobals());

async function page(response: Response | Error, pathname = '/notes', cookie = '', submitForm = true, pendingLogout = false) {
  vi.resetModules();
  let submit: (event: { preventDefault: () => void }) => Promise<void>;
  const elements = {
    'signin-form': { hidden: true, addEventListener: (_name: string, handler: typeof submit) => { submit = handler; } },
    username: { value: 'admin' }, password: { value: 'secret' },
    'signin-error': { textContent: '' }, 'signin-submit': { disabled: false },
  };
  const replace = vi.fn();
  const fetcher = vi.fn(async () => { if (response instanceof Error) throw response; return response; });
  vi.stubGlobal('document', { cookie, getElementById: (id: keyof typeof elements) => elements[id] });
  vi.stubGlobal('navigator', { userAgent: 'Windows NT' });
  const values = new Map([['daymark_install_id', 'inst-existing']]);
  if (pendingLogout) values.set('daymark_logout_pending', '1');
  vi.stubGlobal('localStorage', {
    get length() { return values.size; }, key: (i: number) => [...values.keys()][i],
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key),
  });
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('BroadcastChannel', undefined);
  vi.stubGlobal('indexedDB', { deleteDatabase: () => {
    const request = { onsuccess: () => {} };
    queueMicrotask(() => request.onsuccess());
    return request;
  } });
  vi.stubGlobal('caches', { keys: async () => [] });
  vi.stubGlobal('location', { pathname, href: `https://daymark.test${pathname}?date=today`, replace });
  vi.stubGlobal('fetch', fetcher);
  await import('./main');
  await vi.waitFor(() => expect(elements['signin-form'].hidden).toBe(pendingLogout));
  if (pendingLogout) await vi.waitFor(() => expect(elements['signin-error'].textContent).toContain('finish signing out'));
  expect(values.has('daymark_install_id')).toBe(!pendingLogout);
  if (submitForm) await submit!({ preventDefault: () => {} });
  return { elements, replace, fetcher, submit: () => submit!({ preventDefault: () => {} }) };
}

it.each(['/signin.html', '/notes'])('signs in as a web client and returns to %s', async (pathname) => {
  const { replace, fetcher } = await page(new Response('{}'), pathname);
  const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('/api/auth/login');
  expect(options.method).toBe('POST');
  expect(options.headers).toEqual({ 'Content-Type': 'application/json', 'X-Daymark-Client': 'web' });
  expect(JSON.parse(options.body as string)).toEqual({ username: 'admin', password: 'secret', deviceName: 'Windows browser', platform: 'web', installId: expect.any(String) });
  expect(JSON.parse(options.body as string).installId).toBe('inst-existing');
  expect(replace).toHaveBeenCalledWith(pathname === '/signin.html' ? '/' : 'https://daymark.test/notes?date=today');
});

it.each([
  [401, 'Wrong username or password.'],
  [429, 'Too many failed sign-in attempts. Try again in 15 minutes.'],
])('shows the server error for %s and allows retry', async (status, error) => {
  const result = await page(new Response(JSON.stringify({ error }), { status }));
  expect(result.elements['signin-error'].textContent).toBe(error);
  expect(result.elements['signin-submit'].disabled).toBe(false);
  expect(result.replace).not.toHaveBeenCalled();
});

it('shows a connection error and allows retry when offline', async () => {
  const result = await page(new Error('offline'));
  expect(result.elements['signin-error'].textContent).toBeTruthy();
  expect(result.elements['signin-submit'].disabled).toBe(false);
  expect(result.replace).not.toHaveBeenCalled();
});

it('shows the form offline and retries the session check on online without wiping', async () => {
  const result = await page(new Error('offline'), '/signin.html', 'daymark_signed_in=1', false);
  expect(result.elements['signin-error'].textContent).toContain('offline');
  expect(result.replace).not.toHaveBeenCalled();
  result.fetcher.mockResolvedValue(new Response('{}'));
  window.dispatchEvent(new Event('online'));
  await vi.waitFor(() => expect(result.replace).toHaveBeenCalledWith('/'));
  expect(localStorage.getItem('daymark_install_id')).toBe('inst-existing');
  expect(result.fetcher).toHaveBeenCalledTimes(2);
});

it.each([new Error('offline'), new Response('{}', { status: 503 })])('blocks login while logout is pending, then retries online (%s)', async (logoutFailure) => {
  const result = await page(logoutFailure, '/signin.html', 'daymark_signed_in=1', false, true);
  expect(result.fetcher.mock.calls.map((call) => (call as unknown as [string])[0])).toEqual(['/api/auth/logout']);
  expect(result.fetcher.mock.calls[0]).toEqual(['/api/auth/logout', {
    method: 'POST', headers: { 'X-Daymark-Client': 'web' }, credentials: 'same-origin',
  }]);
  await result.submit();
  expect(result.fetcher).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem('daymark_logout_pending')).toBe('1');
  expect(result.replace).not.toHaveBeenCalled();

  result.fetcher.mockResolvedValue(new Response('{}'));
  window.dispatchEvent(new Event('online'));
  await vi.waitFor(() => expect(result.elements['signin-form'].hidden).toBe(false));
  expect(localStorage.getItem('daymark_logout_pending')).toBeNull();
  await result.submit();
  expect(result.fetcher.mock.calls.map((call) => (call as unknown as [string])[0]))
    .toEqual(['/api/auth/logout', '/api/auth/logout', '/api/auth/login']);
  expect(result.replace).toHaveBeenCalledWith('/');
});

it('keeps login blocked through failed pending-logout retries', async () => {
  const result = await page(new Error('offline'), '/signin.html', '', false, true);
  window.dispatchEvent(new Event('online'));
  await vi.waitFor(() => expect(result.fetcher).toHaveBeenCalledTimes(2));
  expect(result.elements['signin-form'].hidden).toBe(true);
  expect(localStorage.getItem('daymark_logout_pending')).toBe('1');
  await result.submit();
  expect(result.fetcher).toHaveBeenCalledTimes(2);
  expect(result.replace).not.toHaveBeenCalled();
});
