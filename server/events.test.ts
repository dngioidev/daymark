import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { signIn } from '../src/sync/authClient';
import { readServerEvents } from '../src/sync/serverEvents';
import { applySyncOutcome, syncOnce, type SyncState, type VaultData } from '../src/sync/syncClient';
import { DEFAULT_SETTINGS } from '../src/utils/defaultData';
import { createApp } from './app';
import { loadConfig } from './config';
import { vaultEventsHandler } from './events';
import { FileStore } from './store';

const PASSWORD = 'correct horse battery';
let dir: string;
let server: Server;
let base: string;
let store: FileStore;
const aborts: AbortController[] = [];

const listen = (app: express.Express) => {
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-events-'));
  store = new FileStore(dir);
  store.init('admin', PASSWORD);
});
afterEach(async () => {
  aborts.splice(0).forEach(a => a.abort());
  await new Promise<void>(r => server.close(() => r()));
  fs.rmSync(dir, { recursive: true, force: true });
});

const emptyVault = (): VaultData => ({ ink: [], docs: [], notes: [], settings: DEFAULT_SETTINGS, habits: { habits: [], days: [] }, backlog: { items: [] }, notemeta: { folders: [], dismissed: [] } });
async function device(name: string) {
  const data = await signIn(fetch, base, 'body', { username: 'admin', password: PASSWORD, deviceName: name, platform: 'test' });
  const state: SyncState & { accessToken: string } = { serverUrl: base, username: data.username, deviceName: name, accessToken: data.accessToken, deviceId: data.device.id, refreshToken: data.refreshToken, lastRev: 0, bases: {}, lastSyncAt: null };
  return { state, local: emptyVault() };
}
type Device = Awaited<ReturnType<typeof device>>;
async function sync(dev: Device) {
  const outcome = await syncOnce(fetch, dev.local, dev.state, dev.state.accessToken);
  dev.local = applySyncOutcome(dev.local, outcome);
  dev.state = { ...outcome.state, accessToken: dev.state.accessToken };
}

/** Collects events from /api/events until aborted. */
function watch(token: string, fetchFn: typeof fetch = fetch) {
  const events: { type: string; rev: number }[] = [];
  const abort = new AbortController();
  aborts.push(abort);
  const done = readServerEvents((url, init) => fetchFn(url, { ...init, headers: { Authorization: `Bearer ${token}` } }), `${base}/api/events`, (type, rev) => events.push({ type, rev }), abort.signal);
  return { events, done, abort };
}
const until = async (check: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise(r => setTimeout(r, 20));
  }
};

it('an open page hears about another device’s change, and not about a no-op sync', async () => {
  const app = express();
  app.use(createApp({ ...loadConfig({ NODE_ENV: 'test' }), dataDir: dir, initialPassword: PASSWORD }, store));
  listen(app);
  const laptop = await device('laptop');
  const phone = await device('phone');
  await sync(phone); // the first sync uploads the phone's default settings
  const stream = watch(laptop.state.accessToken);
  await until(() => stream.events.some(e => e.type === 'ready'));

  await sync(phone); // nothing new to push: the rev does not move
  await new Promise(r => setTimeout(r, 500));
  expect(stream.events.filter(e => e.type === 'changed')).toEqual([]);

  phone.local = { ...phone.local, notes: [{ id: 'note-1', title: 'From the phone', folder: '', content: 'hi', tags: [], createdAt: '2026-11-13T00:00:00Z', updatedAt: '2026-11-13T00:00:00Z', pinned: false }] };
  await sync(phone);
  await until(() => stream.events.some(e => e.type === 'changed'));
  expect(stream.events.find(e => e.type === 'changed')!.rev).toBe(store.vault.rev);
});

it('refuses a stream without a valid sign-in', async () => {
  const app = express();
  app.use(createApp({ ...loadConfig({ NODE_ENV: 'test' }), dataDir: dir, initialPassword: PASSWORD }, store));
  listen(app);
  expect((await fetch(`${base}/api/events`)).status).toBe(401);
  expect((await fetch(`${base}/api/events`, { headers: { Authorization: 'Bearer nope' } })).status).toBe(401);
});

it('coalesces a burst into one event and ends the stream once access lapses', async () => {
  let allowed = true;
  const app = express();
  app.get('/api/events', vaultEventsHandler(store, () => allowed, { heartbeatMs: 100, debounceMs: 50 }));
  listen(app);
  const stream = watch('unused');
  await until(() => stream.events.some(e => e.type === 'ready'));
  for (let i = 0; i < 3; i++) { store.vault.rev++; await store.persist('vault.json'); }
  await until(() => stream.events.some(e => e.type === 'changed'));
  await new Promise(r => setTimeout(r, 150));
  expect(stream.events.filter(e => e.type === 'changed')).toEqual([{ type: 'changed', rev: store.vault.rev }]);
  allowed = false;
  await expect(stream.done).resolves.toBe('ended');
});
