import express from 'express';
import fs from 'node:fs';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { REFRESH_COOKIE, SIGNED_IN_COOKIE, WEB_CLIENT_HEADER } from '../src/sync/protocol';
import { createApp } from './app';
import { parseCookies } from './auth';
import { loadConfig } from './config';
import { createSiteGate } from './gate';
import { FileStore } from './store';

const PASSWORD = 'correct horse battery';
const SIGNIN = '<html>Sign in</html>';
let dir: string;
let server: Server;
let base: string;
let store: FileStore;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-gate-'));
  store = new FileStore(dir);
  store.init('admin', PASSWORD);
  const app = express();
  app.use(createSiteGate(store, () => SIGNIN));
  app.get('*', (_req, res) => res.send('APP'));
  app.post('*', (_req, res) => res.send('POST'));
  app.use(createApp(loadConfig({ NODE_ENV: 'test' }), store));
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(dir, { recursive: true, force: true });
});

async function loginCookie() {
  // Use the real web login to obtain the HttpOnly credential.
  const api = createApp(loadConfig({ NODE_ENV: 'test' }), store).listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${(api.address() as AddressInfo).port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [WEB_CLIENT_HEADER]: 'web' },
      body: JSON.stringify({ username: 'admin', password: PASSWORD, deviceName: 'Browser', platform: 'web' }),
    });
    expect(response.status).toBe(200);
    const cookies = parseCookies(response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; '));
    return `${REFRESH_COOKIE}=${encodeURIComponent(cookies[REFRESH_COOKIE])}`;
  } finally {
    await new Promise<void>((resolve) => api.close(() => resolve()));
  }
}

it.each(['/', '/notes', '/index.html', '/notes?date=2026-10-22'])('signed-out page request gets the sign-in page with 401: %s', async (url) => {
  const response = await fetch(base + url);
  expect(response.status).toBe(401);
  expect(await response.text()).toBe(SIGNIN);
  expect(response.headers.get('X-Daymark-Sign-In')).toBe('1');
  expect(response.headers.get('Content-Type')).toContain('text/html');
});

it('sign-in page is 401 and uncacheable', async () => {
  expect((await fetch(base + '/')).headers.get('Cache-Control')).toBe('no-store');
});

it('marks the public sign-in page so navigation cannot cache it as the app shell', async () => {
  const response = await fetch(base + '/signin.html');
  expect(response.status).toBe(200);
  expect(response.headers.get('X-Daymark-Sign-In')).toBe('1');
});

it.each(['/assets/x.js', '/sw.js', '/manifest.json', '/icons/icon-192.png', '/signin.html', '/api/health', '/api/notes.html'])('static assets, explicit sign-in and API routes are not gated: %s', async (url) => {
  const response = await fetch(base + url);
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('APP');
});

it('valid refresh cookie lets the app through without rotating it', async () => {
  const cookie = await loginCookie();
  const before = JSON.stringify(store.devices);
  const response = await fetch(base + '/', { headers: { Cookie: cookie } });
  expect(await response.text()).toBe('APP');
  expect(JSON.stringify(store.devices)).toBe(before);
});

it.each(['revoked', 'expired', 'invalid', 'hint-only'])('%s cookie gets the sign-in page', async (state) => {
  let cookie = await loginCookie();
  if (state === 'revoked') store.devices[0].revoked = true;
  if (state === 'expired') store.devices[0].refreshExpiresAt = new Date(0).toISOString();
  if (state === 'invalid') cookie = `${REFRESH_COOKIE}=wrong`;
  if (state === 'hint-only') cookie = `${SIGNED_IN_COOKIE}=1`;
  expect((await fetch(base + '/', { headers: { Cookie: cookie } })).status).toBe(401);
});

it('gates HEAD pages without a response body', async () => {
  const response = await fetch(base + '/notes', { method: 'HEAD' });
  expect(response.status).toBe(401);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.text()).toBe('');
});

it('does not gate other methods', async () => {
  const response = await fetch(base + '/notes', { method: 'POST' });
  expect(await response.text()).toBe('POST');
});
