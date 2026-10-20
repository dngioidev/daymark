import fs from 'node:fs';
import { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DailyDocument, StandaloneNote, TaskItem } from '../src/types/daymark';
import { DEFAULT_SETTINGS } from '../src/utils/defaultData';
import { applySyncOutcome, login, SyncState, syncOnce, VaultData } from '../src/sync/syncClient';
import { createApp } from './app';
import { loadConfig } from './config';
import { FileStore } from './store';

const PASSWORD = 'correct horse battery';
let dir: string;
let server: Server;
let base: string;

function start() {
  const config = { ...loadConfig({ NODE_ENV: 'test' }), dataDir: dir, initialPassword: PASSWORD };
  const store = new FileStore(dir);
  store.init(config.username, config.initialPassword);
  server = createApp(config, store).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
const stop = () => new Promise<void>((r) => server.close(() => r()));

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-test-'));
  start();
});
afterEach(async () => {
  await stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

const post = (url: string, body: unknown, token?: string) =>
  fetch(base + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

async function connect(name: string): Promise<SyncState> {
  const s = await login(fetch, base, { username: 'admin', password: PASSWORD, deviceName: name, platform: 'test' });
  return { ...s, lastRev: 0, bases: {}, lastSyncAt: null };
}

const task = (id: string, status = 'in-progress'): TaskItem => ({
  id,
  title: `Task ${id}`,
  status,
  createdDate: '2026-10-20',
  originalNoteDate: '2026-10-20',
  heading: 'Work',
  order: 1,
  historyLog: [],
});
const day = (items: TaskItem[]): DailyDocument => ({
  date: '2026-10-20',
  type: 'daily',
  updatedAt: '2026-10-20T00:00:00Z',
  headings: [{ name: 'Work', items, notesContent: '' }],
});
const note = (id: string, content: string): StandaloneNote => ({
  id,
  title: `Note ${id}`,
  folder: 'General',
  content,
  tags: [],
  createdAt: '2026-10-20T00:00:00Z',
  updatedAt: '2026-10-20T00:00:00Z',
});
const vault = (docs: DailyDocument[], notes: StandaloneNote[] = []): VaultData => ({ docs, notes, settings: DEFAULT_SETTINGS });

/** Simulates one device: its vault plus sync state. */
async function sync(device: { vault: VaultData; state: SyncState }) {
  const outcome = await syncOnce(fetch, device.vault, device.state);
  device.vault = applySyncOutcome(device.vault, outcome);
  device.state = outcome.state;
  return outcome;
}
const statuses = (v: VaultData) => v.docs.flatMap((d) => d.headings.flatMap((h) => h.items.map((t) => `${t.id}:${t.status}`))).sort();

describe('auth', () => {
  it('serves health without auth and leaks no account details', async () => {
    const res = await (await fetch(`${base}/api/health`)).json();
    expect(res.status).toBe('ok');
    expect(JSON.stringify(res)).not.toContain('admin');
  });

  it('rejects unauthenticated and forged requests', async () => {
    expect((await fetch(`${base}/api/sync`)).status).toBe(401);
    expect((await fetch(`${base}/api/devices`)).status).toBe(401);
    expect((await fetch(`${base}/api/devices`, { headers: { Authorization: 'Bearer session-token-123' } })).status).toBe(401);
  });

  it('rejects a wrong password and rate-limits repeated failures', async () => {
    expect((await post('/api/auth/login', { username: 'admin', password: 'nope' })).status).toBe(401);
    for (let i = 0; i < 10; i++) await post('/api/auth/login', { username: 'admin', password: 'nope' });
    expect((await post('/api/auth/login', { username: 'admin', password: PASSWORD })).status).toBe(429);
  });

  it('disconnecting a device revokes its token', async () => {
    const a = await connect('Phone');
    const b = await connect('Laptop');
    const del = await fetch(`${base}/api/devices/${a.deviceId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${b.token}` } });
    expect(del.status).toBe(200);
    expect((await fetch(`${base}/api/sync`, { headers: { Authorization: `Bearer ${a.token}` } })).status).toBe(401);
  });

  it('changing the password signs out other devices', async () => {
    const a = await connect('Phone');
    const b = await connect('Laptop');
    const res = await post('/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'a much better one' }, b.token);
    expect(res.status).toBe(200);
    const { token } = await res.json();
    expect((await fetch(`${base}/api/sync`, { headers: { Authorization: `Bearer ${a.token}` } })).status).toBe(401);
    expect((await fetch(`${base}/api/sync`, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);
  });

  it('rejects weak new passwords', async () => {
    const a = await connect('Phone');
    const res = await post('/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'short' }, a.token);
    expect(res.status).toBe(400);
  });
});

describe('sync between two devices', () => {
  it('converges edits made on both devices without losing data', async () => {
    const phone = { vault: vault([day([task('a'), task('b')])]), state: await connect('Phone') };
    const laptop = { vault: vault([]), state: await connect('Laptop') };
    await sync(phone);
    await sync(laptop);
    expect(statuses(laptop.vault)).toEqual(['a:in-progress', 'b:in-progress']);

    // Offline edits on both devices to different tasks of the same day
    phone.vault = vault([day([task('a', 'done'), task('b')])]);
    laptop.vault = vault([day([task('a'), task('b', 'blocked'), task('c')])]);
    await sync(phone);
    await sync(laptop);
    await sync(phone);
    expect(statuses(phone.vault)).toEqual(['a:done', 'b:blocked', 'c:in-progress']);
    expect(statuses(laptop.vault)).toEqual(statuses(phone.vault));
  });

  it('propagates deletions and keeps a conflict copy for diverged notes', async () => {
    const phone = { vault: vault([], [note('n1', 'v1'), note('n2', 'keep')]), state: await connect('Phone') };
    const laptop = { vault: vault([]), state: await connect('Laptop') };
    await sync(phone);
    await sync(laptop);

    phone.vault = vault([], [note('n1', 'phone edit')]); // also deletes n2
    laptop.vault = vault([], [note('n1', 'laptop edit'), note('n2', 'keep')]);
    await sync(phone);
    const outcome = await sync(laptop);
    expect(outcome.conflicts).toHaveLength(1);
    await sync(phone);

    const contents = (v: VaultData) => v.notes.map((n) => n.content).sort();
    expect(contents(laptop.vault)).toEqual(['laptop edit', 'phone edit']);
    expect(contents(phone.vault)).toEqual(contents(laptop.vault));
  });

  it('does not sync the device-local sync config', async () => {
    const phone = { vault: vault([]), state: await connect('Phone') };
    phone.vault.settings = { ...DEFAULT_SETTINGS, syncConfig: { ...DEFAULT_SETTINGS.syncConfig, serverUrl: 'http://phone-only' } };
    await sync(phone);
    const laptop = { vault: vault([]), state: await connect('Laptop') };
    await sync(laptop);
    expect(laptop.vault.settings.syncConfig.serverUrl).toBe(DEFAULT_SETTINGS.syncConfig.serverUrl);
  });

  it('keeps data across a server restart', async () => {
    const phone = { vault: vault([day([task('a')])]), state: await connect('Phone') };
    await sync(phone);
    await stop();
    start();
    const laptop = { vault: vault([]), state: await connect('Laptop') };
    await sync(laptop);
    expect(statuses(laptop.vault)).toEqual(['a:in-progress']);
  });

  it('rejects invalid entity keys', async () => {
    const a = await connect('Phone');
    const res = await post('/api/sync', { sinceRev: 0, changes: [{ key: '__proto__', base: null, value: {} }] }, a.token);
    expect(res.status).toBe(400);
  });
});

describe('data files', () => {
  it.skipIf(process.platform === 'win32')('are written owner-only', () => {
    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
    expect(fs.statSync(path.join(dir, 'auth.json')).mode & 0o777).toBe(0o600);
  });
});
