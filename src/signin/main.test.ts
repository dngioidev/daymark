import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

async function page(response: Response | Error, pathname = '/notes') {
  vi.resetModules();
  let submit: (event: { preventDefault: () => void }) => Promise<void>;
  const elements = {
    'signin-form': { addEventListener: (_name: string, handler: typeof submit) => { submit = handler; } },
    username: { value: 'admin' }, password: { value: 'secret' },
    'signin-error': { textContent: '' }, 'signin-submit': { disabled: false },
  };
  const replace = vi.fn();
  const fetcher = vi.fn(async () => { if (response instanceof Error) throw response; return response; });
  vi.stubGlobal('document', { getElementById: (id: keyof typeof elements) => elements[id] });
  vi.stubGlobal('navigator', { userAgent: 'Windows NT' });
  vi.stubGlobal('localStorage', { getItem: () => 'inst-existing' });
  vi.stubGlobal('location', { pathname, href: `https://daymark.test${pathname}?date=today`, replace });
  vi.stubGlobal('fetch', fetcher);
  await import('./main');
  await submit!({ preventDefault: () => {} });
  return { elements, replace, fetcher };
}

it.each(['/signin.html', '/notes'])('signs in as a web client and returns to %s', async (pathname) => {
  const { replace, fetcher } = await page(new Response('{}'), pathname);
  const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('/api/auth/login');
  expect(options.method).toBe('POST');
  expect(options.headers).toEqual({ 'Content-Type': 'application/json', 'X-Daymark-Client': 'web' });
  expect(JSON.parse(options.body as string)).toEqual({ username: 'admin', password: 'secret', deviceName: 'Windows browser', platform: 'web', installId: 'inst-existing' });
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
