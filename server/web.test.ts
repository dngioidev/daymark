import fs from 'node:fs';
import { request, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { REFRESH_COOKIE, WEB_CLIENT_HEADER } from '../src/sync/protocol';
import { createApp } from './app';
import { parseCookies } from './auth';
import { loadConfig } from './config';
import { mountProductionWeb } from './gate';
import { FileStore } from './store';

const SIGNIN = '<html>Sign in</html>';
const APP = '<html>Private app shell</html>';
const BYPASSES = ['/foo.bar', '/notes.', '/index.htm%6c', '/INDEX.HTML', '/Index.html', '/%2e/index.html'];
let dir: string;
let server: Server;
let store: FileStore;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-web-'));
  store = new FileStore(path.join(dir, 'data'));
  store.init('admin', 'correct horse battery');
  const dist = path.join(dir, 'dist');
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(dist, 'nested'));
  fs.writeFileSync(path.join(dist, 'index.html'), APP);
  fs.writeFileSync(path.join(dist, 'signin.html'), SIGNIN);
  fs.writeFileSync(path.join(dist, 'other.htm'), '<html>Other HTML</html>');
  fs.writeFileSync(path.join(dist, 'other.html'), '<html>Other HTML</html>');
  fs.writeFileSync(path.join(dist, 'nested/index.html'), '<html>Directory HTML</html>');
  fs.writeFileSync(path.join(dist, 'assets/x.js'), 'asset contents');
  fs.writeFileSync(path.join(dist, 'sw.js'), 'worker contents');
  const app = createApp(loadConfig({ NODE_ENV: 'test' }), store);
  mountProductionWeb(app, store, dist);
  server = app.listen(0);
});

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(dir, { recursive: true, force: true });
});

// Preserve encoded dot segments; fetch normalizes them before making a request.
function get(url: string, cookie?: string, method = 'GET') {
  return new Promise<{ status: number; headers: Record<string, unknown>; body: string }>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: (server.address() as AddressInfo).port,
      path: url, method, headers: cookie ? { Cookie: cookie } : {} }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function loginCookie() {
  const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [WEB_CLIENT_HEADER]: 'web' },
    body: JSON.stringify({ username: 'admin', password: 'correct horse battery', deviceName: 'Browser', platform: 'web' }),
  });
  expect(response.status).toBe(200);
  const cookies = parseCookies(response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; '));
  return `${REFRESH_COOKIE}=${encodeURIComponent(cookies[REFRESH_COOKIE])}`;
}

it.each(['/', '/notes', ...BYPASSES, '/other.htm', '/other.html', '/nested/', '/missing.js'])('production denies signed-out shell requests: %s', async (url) => {
  const response = await get(url);
  expect(response.status).toBe(401);
  expect(response.body).toBe(SIGNIN);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['x-daymark-sign-in']).toBe('1');
});

it.each([['/assets/x.js', 'asset contents'], ['/sw.js', 'worker contents']])('production serves real public assets: %s', async (url, body) => {
  const response = await get(url);
  expect(response.status).toBe(200);
  expect(response.body).toBe(body);
  expect(response.headers['cache-control']).toBe(url.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
});

it('production serves and marks the public sign-in page', async () => {
  const response = await get('/signin.html');
  expect(response.status).toBe(200);
  expect(response.body).toBe(SIGNIN);
  expect(response.headers['x-daymark-sign-in']).toBe('1');
});

it('production serves HTML only through the authenticated shell handler', async () => {
  const cookie = await loginCookie();
  const before = JSON.stringify(store.devices);
  for (const url of ['/', ...BYPASSES, '/other.htm', '/other.html', '/nested/']) {
    const response = await get(url, cookie);
    expect(response.status, url).toBe(200);
    expect(response.body, url).toBe(APP);
  }
  expect(JSON.stringify(store.devices)).toBe(before);
});

it.each(['invalid', 'revoked', 'expired'])('production catch-all rejects %s refresh cookies', async (state) => {
  let cookie = await loginCookie();
  if (state === 'invalid') cookie = `${REFRESH_COOKIE}=wrong`;
  if (state === 'revoked') store.devices[0].revoked = true;
  if (state === 'expired') store.devices[0].refreshExpiresAt = new Date(0).toISOString();
  expect((await get('/foo.bar', cookie)).status).toBe(401);
});

it('production catch-all gates HEAD without sending a body', async () => {
  const response = await get('/foo.bar', undefined, 'HEAD');
  expect(response.status).toBe(401);
  expect(response.headers['x-daymark-sign-in']).toBe('1');
  expect(response.body).toBe('');
});
