import fs from 'node:fs';
import vm from 'node:vm';
import { expect, it } from 'vitest';

function worker(fetchResponse: () => Promise<Response>, cached?: Response) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const stored = new Map<string, Response>();
  const cache = {
    put: async (key: string, response: Response) => { stored.set(key, response); },
    match: async () => cached,
    add: async () => {},
  };
  vm.runInNewContext(fs.readFileSync('public/sw.js', 'utf8'), {
    self: { addEventListener: (name: string, handler: (event: unknown) => void) => { handlers[name] = handler; }, location: { origin: 'https://daymark.test' }, skipWaiting: async () => {} },
    caches: { open: async () => cache },
    fetch: fetchResponse, URL, Response,
  });
  return {
    stored,
    install: () => new Promise<void>((resolve, reject) => handlers.install({ waitUntil: (work: Promise<void>) => work.then(resolve, reject) })),
    navigate: () => new Promise<Response>((resolve, reject) => handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://daymark.test/notes' }, respondWith: (work: Promise<Response>) => work.then(resolve, reject) })),
  };
}

it('does not install a 401 sign-in response as the offline shell', async () => {
  const sw = worker(async () => new Response('SIGNIN', { status: 401 }));
  await sw.install();
  expect(sw.stored.has('/')).toBe(false);
});

it('installs a successful shell', async () => {
  const sw = worker(async () => new Response('APP'));
  await sw.install();
  expect(await sw.stored.get('/')?.text()).toBe('APP');
});

it.each([401, 200])('does not replace a cached shell with a marked sign-in response (%s)', async (status) => {
  const sw = worker(async () => new Response('SIGNIN', { status, headers: { 'X-Daymark-Sign-In': '1' } }), new Response('APP'));
  const response = await sw.navigate();
  expect(response.status).toBe(status);
  expect(await response.text()).toBe('SIGNIN');
  expect(sw.stored.has('/')).toBe(false);
});

it('uses the cached shell only when fetch throws', async () => {
  const sw = worker(async () => { throw new Error('offline'); }, new Response('APP'));
  expect(await (await sw.navigate()).text()).toBe('APP');
});

it('returns HTTP failures without falling back to the cached shell', async () => {
  const sw = worker(async () => new Response('unavailable', { status: 503 }), new Response('APP'));
  expect((await sw.navigate()).status).toBe(503);
  expect(sw.stored.has('/')).toBe(false);
});

it('caches successful app navigation', async () => {
  const sw = worker(async () => new Response('APP'));
  expect(await (await sw.navigate()).text()).toBe('APP');
  expect(await sw.stored.get('/')?.text()).toBe('APP');
});
