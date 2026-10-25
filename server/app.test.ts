import fs from 'node:fs';
import express from 'express';
import { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DailyDocument, StandaloneNote, TaskItem } from '../src/types/daymark';
import { DEFAULT_SETTINGS } from '../src/utils/defaultData';
import { performDailyRollover } from '../src/utils/lifecycleEngine';
import { applySyncOutcome, rebaseAfterVaultReplace, SyncState, syncOnce, VaultData } from '../src/sync/syncClient';
import { signIn, TokenManager } from '../src/sync/authClient';
import { checkRefreshToken, createApp } from './app';
import { loadConfig } from './config';
import { FileStore } from './store';
import { hashRefreshToken, parseCookies, signToken, TokenPayload, verifyToken } from './auth';

const PASSWORD = 'correct horse battery';
let dir: string;
let server: Server;
let base: string;
let fileStore: FileStore;

function start(trustProxy = 'loopback', proxyAddress?: string) {
  const config = { ...loadConfig({ NODE_ENV: 'test', DAYMARK_TRUST_PROXY: trustProxy }), dataDir: dir, initialPassword: PASSWORD };
  const store = new FileStore(dir);
  fileStore = store;
  store.init(config.username, config.initialPassword);
  const app = express();
  if (proxyAddress) app.use((req, _res, next) => {
    Object.defineProperty(req.socket, 'remoteAddress', { value: proxyAddress, configurable: true });
    next();
  });
  app.use(createApp(config, store));
  server = app.listen(0);
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

async function connect(name: string): Promise<SyncState & { accessToken: string }> {
  const data = await signIn(fetch, base, 'body', { username: 'admin', password: PASSWORD, deviceName: name, platform: 'test' });
  return { serverUrl: base, username: data.username, deviceName: data.device.name, accessToken: data.accessToken, deviceId: data.device.id, refreshToken: data.refreshToken, lastRev: 0, bases: {}, lastSyncAt: null };
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
const vault = (docs: DailyDocument[], notes: StandaloneNote[] = []): VaultData => ({ docs, notes, settings: DEFAULT_SETTINGS, habits: { habits: [], days: [] } });

describe('habit sync', () => {
  const list = { habits: [{ id: 'water', name: 'Water', order: 1, warnAfterDays: 3, addedOn: '2026-10-24', updatedAt: '2026-10-24T08:00:00Z' }] };
  const ticks = { date: '2026-10-24', ticks: { water: { done: true, at: '2026-10-24T08:00:00Z' } } };
  it('recovers missing days by backfill and never deletes them on the first edit', async () => {
    const a = await connect('A');
    const b = await connect('B');
    const d2 = { ...ticks, date: '2026-10-25' };
    const original = { ...vault([]), habits: { ...list, days: [ticks, d2] } };
    await syncOnce(fetch, original, a, a.accessToken);
    const initial = await syncOnce(fetch, vault([]), b, b.accessToken);
    const localOnly = { ...list.habits[0], id: 'read', name: 'Read' };
    const recoveredDay = { ...ticks, ticks: { ...ticks.ticks, read: { done: true, at: '2026-10-24T09:00:00Z' } } };
    const extraDay = { ...ticks, date: '2026-10-26' };
    const values = new Map<string, string>([
      ['daymark_sync_state_v1', JSON.stringify(initial.state)],
      ['daymark_habits_v1', JSON.stringify({ habits: [...list.habits, localOnly], days: [recoveredDay, { ...d2, ticks: 'damaged' }, extraDay] })],
    ]);
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value) });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const store = await import('../src/utils/vaultStore');
      await store.initVaultStore();
      const recovered = { ...original, habits: store.loadHabits() };
      const requests: { changes: { key: string; value: unknown }[]; sinceRev: number }[] = [];
      const fetcher: typeof fetch = async (url, init) => {
        requests.push(JSON.parse(String(init?.body)));
        return fetch(url, init);
      };
      const backfill = await syncOnce(fetcher, recovered, store.loadSyncState()!, b.accessToken);
      const merged = applySyncOutcome(recovered, backfill);
      expect(requests[0].sinceRev).toBe(0);
      expect(merged.habits.days).toEqual([recoveredDay, d2, extraDay]);
      expect(merged.habits.habits).toContainEqual(localOnly);
      store.saveHabits(merged.habits);
      expect(JSON.parse(values.get('daymark_habits_v1')!)).toEqual(merged.habits);
      const edited = { ...merged, habits: { ...merged.habits, days: merged.habits.days.map(day => day.date === ticks.date
        ? { ...day, ticks: { ...day.ticks, water: { done: false, at: '2026-10-27T08:00:00Z' } } } : day) } };
      await syncOnce(fetcher, edited, backfill.state, b.accessToken);
      expect(requests.flatMap(r => r.changes).filter(c => c.key.startsWith('habit') && c.value === null)).toEqual([]);
      const serverVault = await syncOnce(fetch, vault([]), a, a.accessToken);
      expect(serverVault.serverValues.get('habitday:2026-10-25')).toEqual(d2);
      expect(serverVault.serverValues.get('habitday:2026-10-24')).toMatchObject({ date: ticks.date, ticks: { water: { done: false } } });
      expect(serverVault.serverValues.get('habitday:2026-10-24')).toMatchObject({ ticks: { read: recoveredDay.ticks.read } });
      expect(serverVault.serverValues.get('habitday:2026-10-26')).toEqual(extraDay);
      expect(serverVault.serverValues.get('habits')).toMatchObject({ habits: expect.arrayContaining([localOnly]) });
    } finally {
      errors.mockRestore();
      vi.unstubAllGlobals();
    }
  });
  it('backfills all habit days when a previously synced 1.3.0 device upgrades', async () => {
    const writer = await connect('Writer');
    await post('/api/sync', { sinceRev: 0, features: ['habits'], changes: [
      { key: 'habits', base: null, value: list },
      { key: 'habitday:2026-10-24', base: null, value: ticks },
      { key: 'habitday:2026-10-25', base: null, value: { ...ticks, date: '2026-10-25' } },
    ] }, writer.accessToken);
    const old = await connect('Old client');
    const legacy = await (await post('/api/sync', { sinceRev: 0, changes: [
      { key: 'doc:2026-10-20', base: null, value: day([]) },
    ] }, old.accessToken)).json();
    expect(legacy.entities.every((e: { key: string }) => !e.key.startsWith('habit'))).toBe(true);
    const outcome = await syncOnce(fetch, vault([]), { ...old, lastRev: legacy.rev }, old.accessToken);
    expect(applySyncOutcome(vault([]), outcome).habits.days).toEqual([ticks, { ...ticks, date: '2026-10-25' }]);
    expect(outcome.state.habitsSynced).toBe(true);
  });
  it('old client never sees or deletes habits', async () => {
    const client = await connect('New client');
    const pushed = await post('/api/sync', { sinceRev: 0, features: ['habits'], changes: [
      { key: 'habits', base: null, value: list }, { key: 'habitday:2026-10-24', base: null, value: ticks },
    ] }, client.accessToken);
    expect(pushed.status).toBe(200);
    const old = await connect('Old client');
    const pulled = await (await post('/api/sync', { sinceRev: 0, changes: [] }, old.accessToken)).json();
    expect(pulled.entities).toEqual([]);
    const changed = await post('/api/sync', { sinceRev: pulled.rev, changes: [{ key: 'doc:2026-10-20', base: null, value: day([]) }] }, old.accessToken);
    expect(changed.status).toBe(200);
    expect((await changed.json()).entities.map((e: { key: string }) => e.key)).toEqual(['doc:2026-10-20']);
    const fresh = await (await post('/api/sync', { sinceRev: 0, features: ['habits'], changes: [] }, client.accessToken)).json();
    expect(fresh.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'habits', value: list }), expect.objectContaining({ key: 'habitday:2026-10-24', value: ticks }),
    ]));
    const legacyGet = await fetch(base + '/api/sync?since=0', { headers: { Authorization: `Bearer ${old.accessToken}` } });
    expect((await legacyGet.json()).entities.map((e: { key: string }) => e.key)).toEqual(['doc:2026-10-20']);
  });
  it('habitday value with mismatched date is rejected 400', async () => {
    const client = await connect('Phone');
    const res = await post('/api/sync', { features: ['habits'], changes: [{ key: 'habitday:2026-10-23', base: null, value: ticks }] }, client.accessToken);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid value for habitday:2026-10-23.');
  });
  it.each([
    ['habits', { habits: [{ ...list.habits[0], warnAfterDays: 0 }] }],
    ['habits', { habits: [{ ...list.habits[0], addedOn: 'yesterday' }] }],
    ['habitday:2026-10-24', { ...ticks, ticks: { water: { done: 'yes', at: 'now' } } }],
  ])('rejects malformed %s values', async (key, value) => {
    const client = await connect('Phone');
    const res = await post('/api/sync', { features: ['habits'], changes: [{ key, base: null, value }] }, client.accessToken);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(`Invalid value for ${key}.`);
  });
});

/** Simulates one device: its vault plus sync state. */
async function sync(device: { vault: VaultData; state: SyncState }) {
  const manager = new TokenManager({ fetchFn: fetch, serverUrl: device.state.serverUrl, mode: 'body',
    getRefreshToken: () => device.state.refreshToken,
    setRefreshToken: (token) => { device.state.refreshToken = token; }, onSessionEnded: () => {}, locks: null, channel: null });
  const outcome = await syncOnce(fetch, device.vault, device.state, await manager.getAccessToken());
  device.vault = applySyncOutcome(device.vault, outcome);
  device.state = outcome.state;
  return outcome;
}
const statuses = (v: VaultData) => v.docs.flatMap((d) => d.headings.flatMap((h) => h.items.map((t) => `${t.id}:${t.status}`))).sort();

describe('auth', () => {
  const webLogin = (headers: Record<string, string> = {}) => fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Daymark-Client': 'web', ...headers },
    body: JSON.stringify({ username: 'admin', password: PASSWORD, deviceName: 'Browser', platform: 'web' }),
  });
  const webRefresh = (cookie: string, header = true) => fetch(`${base}/api/auth/refresh`, {
    method: 'POST', headers: { Cookie: cookie, ...(header ? { 'X-Daymark-Client': 'web' } : {}) },
  });

  it('trusts a configured Docker proxy for Secure cookies and per-client login limits', async () => {
    await stop();
    start('uniquelocal', '172.18.0.2');
    const forwarded = { 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '203.0.113.10' };
    const login = await webLogin(forwarded);
    expect(login.status).toBe(200);
    expect(login.headers.getSetCookie().every((cookie) => cookie.includes('; Secure'))).toBe(true);
    for (let i = 0; i < 10; i++) {
      const bad = await fetch(base + '/api/auth/login', { method: 'POST', headers: { ...forwarded, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'wrong', password: 'wrong' }) });
      expect(bad.status).toBe(401);
    }
    expect((await webLogin(forwarded)).status).toBe(429);
    expect((await webLogin({ ...forwarded, 'X-Forwarded-For': '203.0.113.11' })).status).toBe(200);
  });

  it('does not clear cookies or revoke the cookie session on a headerless logout', async () => {
    const login = await webLogin();
    const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const response = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: '' });
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect((await webRefresh(cookie)).status).toBe(200);
  });

  it('revokes refresh sessions durably when auth.json is deleted and the account recreated', async () => {
    const session = await connect('Phone');
    await stop();
    fs.unlinkSync(path.join(dir, 'auth.json'));
    start();
    expect(fileStore.devices.every((d) => d.revoked && d.refreshHash === null && d.refreshExpiresAt === null && d.retiredRefreshHashes.length === 0)).toBe(true);
    expect((await post('/api/auth/refresh', { refreshToken: session.refreshToken })).status).toBe(401);
    await stop();
    start();
    expect((await post('/api/auth/refresh', { refreshToken: session.refreshToken })).status).toBe(401);
  });

  it('login returns a 15-minute access token and a refresh token', async () => {
    const res = await post('/api/auth/login', { username: 'admin', password: PASSWORD });
    const data = await res.json();
    expect(data.expiresIn).toBe(900);
    expect(data.refreshToken).toMatch(new RegExp(`^${data.device.id}\\.[A-Za-z0-9_-]{43}$`));
    const payload = JSON.parse(Buffer.from(data.accessToken.split('.')[0], 'base64url').toString());
    expect(payload.typ).toBe('access');
    expect(payload.exp - Math.floor(Date.now() / 1000)).toBeGreaterThanOrEqual(899);
    expect(payload.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(900);
  });

  it('refresh rotates: new pair works, old refresh token is retired', async () => {
    const a = await connect('Phone');
    const res = await post('/api/auth/refresh', { refreshToken: a.refreshToken });
    expect(res.status).toBe(200);
    const pair = await res.json();
    expect(pair.refreshToken).not.toBe(a.refreshToken);
    expect((await fetch(`${base}/api/devices`, { headers: { Authorization: `Bearer ${pair.accessToken}` } })).status).toBe(200);
    expect((await post('/api/auth/refresh', { refreshToken: pair.refreshToken })).status).toBe(200);
  });

  it('checks refresh credentials read-only and preserves them across restart', async () => {
    const a = await connect('Phone');
    const before = JSON.stringify(fileStore.devices);
    const device = checkRefreshToken(fileStore, a.refreshToken!);
    expect(device?.id).toBe(a.deviceId);
    expect(checkRefreshToken(fileStore, a.refreshToken!, Date.now() + 30 * 86400000)).toBeNull();
    expect(checkRefreshToken(fileStore, `${a.deviceId}.wrong`)).toBeNull();
    expect(JSON.stringify(fileStore.devices)).toBe(before);
    expect(device?.refreshHash).toMatch(/^[a-f0-9]{64}$/);
    const persisted = fs.readFileSync(path.join(dir, 'devices.json'), 'utf8');
    expect(persisted).not.toContain(a.refreshToken);
    await stop();
    start();
    expect(checkRefreshToken(fileStore, a.refreshToken!)?.id).toBe(a.deviceId);
    expect((await post('/api/auth/refresh', { refreshToken: a.refreshToken })).status).toBe(200);
  });

  it('caps retired hashes at 50 newest entries and persists reuse revocation', async () => {
    const a = await connect('Phone');
    const device = fileStore.devices[0];
    device.retiredRefreshHashes = Array.from({ length: 50 }, (_, i) => `old-${i}`);
    expect((await post('/api/auth/refresh', { refreshToken: a.refreshToken })).status).toBe(200);
    expect(device.retiredRefreshHashes).toHaveLength(50);
    expect(device.retiredRefreshHashes[0]).toBe('old-1');
    expect(device.retiredRefreshHashes[49]).toBe(hashRefreshToken(a.refreshToken!));
    expect((await post('/api/auth/refresh', { refreshToken: a.refreshToken })).status).toBe(401);
    await stop();
    start();
    expect(fileStore.devices[0].revoked).toBe(true);
    expect(fileStore.log.some((entry) => entry.action === 'refresh_reuse')).toBe(true);
  });

  it('reusing a retired refresh token revokes the device', async () => {
    const a = await connect('Phone');
    const first = await post('/api/auth/refresh', { refreshToken: a.refreshToken });
    expect(first.status).toBe(200);
    const pair = await first.json();
    expect((await post('/api/auth/refresh', { refreshToken: a.refreshToken })).status).toBe(401);
    expect((await post('/api/auth/refresh', { refreshToken: pair.refreshToken })).status).toBe(401);
    expect((await fetch(`${base}/api/devices`, { headers: { Authorization: `Bearer ${pair.accessToken}` } })).status).toBe(401);
    expect(fileStore.log.some((entry) => entry.action === 'refresh_reuse')).toBe(true);
  });

  it('refresh token expires after 30 days without use', async () => {
    const a = await connect('Phone');
    const device = fileStore.devices.find((d) => d.id === a.deviceId)!;
    expect(Date.parse(device.refreshExpiresAt!) - Date.now()).toBeGreaterThan(29 * 86400000);
    device.refreshExpiresAt = new Date(Date.now() - 1).toISOString();
    expect((await post('/api/auth/refresh', { refreshToken: a.refreshToken })).status).toBe(401);
  });

  it('web login sets HttpOnly refresh and readable marker cookies', async () => {
    const res = await webLogin();
    const cookies = res.headers.getSetCookie();
    expect(cookies.find((c) => c.startsWith('daymark_refresh='))).toMatch(/HttpOnly/);
    for (const cookie of cookies) {
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('Max-Age=2592000');
    }
    expect(cookies.find((c) => c.startsWith('daymark_signed_in=1'))).not.toContain('HttpOnly');
    expect(await res.json()).not.toHaveProperty('refreshToken');
  });

  it('web refresh needs the client header', async () => {
    const res = await webLogin();
    const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    expect((await webRefresh(cookie, false)).status).toBe(401);
    const refreshed = await webRefresh(cookie);
    expect(refreshed.status).toBe(200);
    expect(refreshed.headers.getSetCookie()).toHaveLength(2);
    expect(await refreshed.json()).not.toHaveProperty('refreshToken');
  });

  it('web logout needs the client header to revoke the cookie session', async () => {
    const res = await webLogin();
    const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
    expect(fileStore.devices[0].revoked).toBe(false);
    const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie, 'X-Daymark-Client': 'web' } });
    expect(logout.status).toBe(200);
    expect(logout.headers.getSetCookie()).toHaveLength(2);
    expect((await webRefresh(cookie)).status).toBe(401);
  });

  it('access tokens expire at the 15-minute boundary', async () => {
    const a = await connect('Phone');
    const payload = verifyToken(a.accessToken, fileStore.auth.secret)!;
    expect(verifyToken(a.accessToken, fileStore.auth.secret, payload.exp * 1000 - 1)).not.toBeNull();
    expect(verifyToken(a.accessToken, fileStore.auth.secret, payload.exp * 1000)).toBeNull();
  });

  it('parses cookies without crashing on malformed values', () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('other=a%20b; daymark_refresh=dev.abc=; broken=%ZZ; ignored')).toEqual({ other: 'a b', daymark_refresh: 'dev.abc=' });
  });

  it('omits Secure on plain HTTP, sets it behind an HTTPS proxy', async () => {
    expect((await webLogin()).headers.get('set-cookie')).not.toContain('Secure');
    const res = await webLogin({ 'X-Forwarded-Proto': 'https' });
    expect(res.headers.getSetCookie()).toHaveLength(2);
    for (const cookie of res.headers.getSetCookie()) expect(cookie).toContain('Secure');
  });

  it('cookie alone does not authorise data routes', async () => {
    const res = await webLogin();
    expect((await fetch(`${base}/api/devices`, { headers: { Cookie: res.headers.get('set-cookie')! } })).status).toBe(401);
  });

  it('body logout revokes the device without touching cookies', async () => {
    const a = await connect('Phone');
    const res = await post('/api/auth/logout', { refreshToken: a.refreshToken });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.getSetCookie()).toEqual([]);
    expect((await post('/api/auth/refresh', { refreshToken: a.refreshToken })).status).toBe(401);
    expect((await fetch(`${base}/api/devices`, { headers: { Authorization: `Bearer ${a.accessToken}` } })).status).toBe(401);
    expect((await post('/api/auth/logout', { refreshToken: a.refreshToken })).status).toBe(200);
  });

  it('web logout revokes the cookie session and clears both cookies', async () => {
    const login = await webLogin();
    const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const res = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: cookie, 'X-Daymark-Client': 'web' } });
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()).toHaveLength(2);
    for (const cleared of res.headers.getSetCookie()) expect(cleared).toContain('Max-Age=0');
    expect((await webRefresh(cookie)).status).toBe(401);
  });

  it('rejects pre-upgrade tokens', async () => {
    const a = await connect('Phone');
    const token = signToken({ sub: 'admin', did: a.deviceId, ver: fileStore.auth.tokenVersion, exp: Math.floor(Date.now() / 1000) + 900 } as TokenPayload, fileStore.auth.secret);
    expect((await fetch(`${base}/api/devices`, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(401);
  });

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
    const del = await fetch(`${base}/api/devices/${a.deviceId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${b.accessToken}` } });
    expect(del.status).toBe(200);
    expect((await fetch(`${base}/api/sync`, { headers: { Authorization: `Bearer ${a.accessToken}` } })).status).toBe(401);
    expect((await post('/api/auth/refresh', { refreshToken: a.refreshToken })).status).toBe(401);
  });

  it('changing the password signs out every device including this one', async () => {
    const a = await connect('Phone');
    const b = await connect('Laptop');
    const res = await post('/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'a much better one' }, b.accessToken);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect((await fetch(`${base}/api/sync`, { headers: { Authorization: `Bearer ${a.accessToken}` } })).status).toBe(401);
    expect((await fetch(`${base}/api/sync`, { headers: { Authorization: `Bearer ${b.accessToken}` } })).status).toBe(401);
    for (const device of [a, b]) expect((await post('/api/auth/refresh', { refreshToken: device.refreshToken })).status).toBe(401);
    expect(fileStore.devices.every((d) => d.revoked)).toBe(true);
  });

  it('a repeat sign-in from the same install does not add a duplicate device', async () => {
    const creds = { username: 'admin', password: PASSWORD, deviceName: 'Phone', platform: 'android', installId: 'install-abc12345' };
    const first = await signIn(fetch, base, 'body', creds);
    const second = await signIn(fetch, base, 'body', { ...creds, deviceName: 'Pixel' });
    expect(second.device.id).toBe(first.device.id);
    const other = await connect('Laptop');
    const res = await (await fetch(`${base}/api/devices`, { headers: { Authorization: `Bearer ${other.accessToken}` } })).json();
    expect(res.devices.map((d: { name: string }) => d.name).sort()).toEqual(['Laptop', 'Pixel']);
  });

  it('rejects weak new passwords', async () => {
    const a = await connect('Phone');
    const res = await post('/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'short' }, a.accessToken);
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

  it('restoring a backup on a synced device merges instead of deleting server data', async () => {
    const phone = { vault: vault([day([task('a')])], [note('n1', 'one'), note('n2', 'two')]), state: await connect('Phone') };
    const laptop = { vault: vault([]), state: await connect('Laptop') };
    await sync(phone);
    await sync(laptop);

    // The phone restores an older backup that only has n3
    phone.vault = vault([], [note('n3', 'from backup')]);
    phone.state = { ...phone.state, ...rebaseAfterVaultReplace(phone.state) };
    await sync(phone);
    await sync(laptop);

    const ids = (v: VaultData) => v.notes.map((n) => n.id).sort();
    expect(ids(laptop.vault)).toEqual(['n1', 'n2', 'n3']);
    expect(ids(phone.vault)).toEqual(['n1', 'n2', 'n3']);
    expect(statuses(laptop.vault)).toEqual(['a:in-progress']);
  });

  it('does not sync the device-local sync config', async () => {
    const phone = { vault: vault([]), state: await connect('Phone') };
    phone.vault.settings = { ...DEFAULT_SETTINGS, syncConfig: { ...DEFAULT_SETTINGS.syncConfig, serverUrl: 'http://phone-only' } };
    await sync(phone);
    const laptop = { vault: vault([]), state: await connect('Laptop') };
    await sync(laptop);
    expect(laptop.vault.settings.syncConfig.serverUrl).toBe(DEFAULT_SETTINGS.syncConfig.serverUrl);
  });

  it('a newly connected device adopts the existing settings', async () => {
    const laptop = { vault: vault([]), state: await connect('Laptop') };
    laptop.vault.settings = { ...DEFAULT_SETTINGS, defaultHeadings: ['Deep work', 'Admin'] };
    await sync(laptop);
    const phone = { vault: vault([]), state: await connect('Phone') };
    await sync(phone);
    await sync(laptop);
    expect(phone.vault.settings.defaultHeadings).toEqual(['Deep work', 'Admin']);
    expect(laptop.vault.settings.defaultHeadings).toEqual(['Deep work', 'Admin']);
  });

  it('two devices that each roll over the same day do not conflict', async () => {
    const laptop = { vault: vault([day([task('a')])]), state: await connect('Laptop') };
    await sync(laptop);
    const phone = { vault: vault([]), state: await connect('Phone') };
    await sync(phone);
    const roll = (v: VaultData): VaultData => ({
      ...v,
      docs: performDailyRollover('2026-10-21', v.docs, DEFAULT_SETTINGS.statuses).updatedDocs,
    });
    laptop.vault = roll(laptop.vault);
    phone.vault = roll(phone.vault);
    expect((await sync(laptop)).conflicts).toEqual([]);
    expect((await sync(phone)).conflicts).toEqual([]);
    await sync(laptop);
    const today = (v: VaultData) => v.docs.find((d) => d.date === '2026-10-21')!.headings.flatMap((h) => h.items);
    expect(today(laptop.vault)).toHaveLength(1);
    expect(today(phone.vault)).toHaveLength(1);
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
    const res = await post('/api/sync', { sinceRev: 0, changes: [{ key: '__proto__', base: null, value: {} }] }, a.accessToken);
    expect(res.status).toBe(400);
  });
});

describe('sync validation', () => {
  it.each(['GET', 'POST'])('omits corrupt stored values on a pull-only %s without deleting them', async (method) => {
    const a = await connect('Fresh device');
    const corrupt = { rev: 1, value: { date: '2026-10-20', headings: 'broken' }, updatedBy: a.deviceId, updatedAt: '2026-10-20T00:00:00Z' };
    fileStore.vault.rev = 2;
    fileStore.vault.entities['doc:2026-10-20'] = corrupt;
    fileStore.vault.entities['note:good'] = { rev: 2, value: note('good', 'Keep this note'), updatedBy: a.deviceId, updatedAt: '2026-10-20T00:00:00Z' };
    const res = method === 'GET'
      ? await fetch(base + '/api/sync?since=0', { headers: { Authorization: `Bearer ${a.accessToken}` } })
      : await post('/api/sync', { sinceRev: 0, changes: [] }, a.accessToken);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entities.map((e: { key: string }) => e.key)).toEqual(['note:good']);
    expect(fileStore.vault.entities['doc:2026-10-20']).toEqual(corrupt);
    const repaired = await post('/api/sync', { sinceRev: body.rev, changes: [{ key: 'doc:2026-10-20', base: null, value: day([task('a')]) }] }, a.accessToken);
    expect(repaired.status).toBe(200);
    expect((await repaired.json()).entities).toContainEqual(expect.objectContaining({ key: 'doc:2026-10-20', value: day([task('a')]) }));
  });
  const dailyNotes = async (token: string) =>
    (await (await fetch(`${base}/api/server/stats`, { headers: { Authorization: `Bearer ${token}` } })).json()).dailyNotes;

  it('rejects a doc without headings with 400 and stores nothing', async () => {
    const a = await connect('Phone');
    const res = await post('/api/sync', { sinceRev: 0, changes: [{ key: 'doc:2026-10-20', base: null, value: { date: '2026-10-20', junk: true } }] }, a.accessToken);
    expect(res.status).toBe(400);
    expect(await dailyNotes(a.accessToken)).toBe(0);
  });

  it('rejects a doc whose date does not match its key', async () => {
    const a = await connect('Phone');
    const res = await post('/api/sync', { sinceRev: 0, changes: [{ key: 'doc:2026-01-01', base: null, value: day([]) }] }, a.accessToken);
    expect(res.status).toBe(400);
    expect(await dailyNotes(a.accessToken)).toBe(0);
  });

  it('rejects a note whose id does not match its key', async () => {
    const a = await connect('Phone');
    const res = await post('/api/sync', { sinceRev: 0, changes: [{ key: 'note:other', base: null, value: note('n1', 'x') }] }, a.accessToken);
    expect(res.status).toBe(400);
  });

  it('is atomic: one bad change rejects the whole request', async () => {
    const a = await connect('Phone');
    const changes = [
      { key: 'doc:2026-10-20', base: null, value: day([task('a')]) },
      { key: 'doc:2026-10-21', base: null, value: { date: '2026-10-21' } },
    ];
    const res = await post('/api/sync', { sinceRev: 0, changes }, a.accessToken);
    expect(res.status).toBe(400);
    expect(await dailyNotes(a.accessToken)).toBe(0);
  });

  it('repairs a corrupt stored entity instead of failing every sync', async () => {
    const a = await connect('Phone');
    fileStore.vault.rev += 1;
    fileStore.vault.entities['doc:2026-10-20'] = { rev: fileStore.vault.rev, value: { junk: true }, updatedBy: 'x', updatedAt: '2026-10-20T00:00:00Z' };
    const res = await post('/api/sync', { sinceRev: 0, changes: [{ key: 'doc:2026-10-20', base: null, value: day([task('a')]) }] }, a.accessToken);
    expect(res.status).toBe(200);
    expect(fileStore.vault.entities['doc:2026-10-20'].value).toEqual(day([task('a')]));
  });
});

describe('data files', () => {
  it('loads pre-upgrade devices without refresh credentials', async () => {
    await connect('Phone');
    const legacy = fileStore.devices.map(({ refreshHash, refreshExpiresAt, retiredRefreshHashes, ...device }) => device);
    await stop();
    fs.writeFileSync(path.join(dir, 'devices.json'), JSON.stringify(legacy));
    start();
    expect(fileStore.devices[0].refreshHash).toBeNull();
    expect(fileStore.devices[0].refreshExpiresAt).toBeNull();
    expect(fileStore.devices[0].retiredRefreshHashes).toEqual([]);
  });
  it.skipIf(process.platform === 'win32')('are written owner-only', () => {
    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
    expect(fs.statSync(path.join(dir, 'auth.json')).mode & 0o777).toBe(0o600);
  });
});

describe('note assets', () => {
  const bytes = Buffer.from('abc');
  const id = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  const assetRequest = (method: string, target: string, token?: string, body?: unknown) => fetch(base + '/api/assets' + target, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  it('requires auth for all asset endpoints', async () => {
    for (const [method, target] of [['GET', ''], ['GET', '/' + id], ['PUT', '/' + id], ['DELETE', '/' + id]]) {
      expect((await assetRequest(method, target)).status).toBe(401);
    }
  });
  it('PUT rejects mismatched hash, invalid mime, invalid id and malformed base64', async () => {
    const { accessToken } = await connect('assets');
    for (const [target, body] of [
      ['0'.repeat(64), { mime: 'image/png', data: bytes.toString('base64') }],
      [id, { mime: 'text/html', data: bytes.toString('base64') }],
      ['bad', { mime: 'image/png', data: bytes.toString('base64') }],
      [id, { mime: 'image/png', data: 'YWJj!!' }],
    ] as const) expect((await assetRequest('PUT', '/' + target, accessToken, body)).status).toBe(400);
  });
  it('PUT then GET returns the bytes; repeated PUT is idempotent; list and delete work', async () => {
    const { accessToken } = await connect('assets');
    const body = { mime: 'image/png', data: bytes.toString('base64') };
    expect((await assetRequest('PUT', '/' + id, accessToken, body)).ok).toBe(true);
    const first = await (await assetRequest('GET', '', accessToken)).json();
    expect(first).toEqual([expect.objectContaining({ id, mime: 'image/png', bytes: 3 })]);
    await assetRequest('PUT', '/' + id, accessToken, body);
    expect(await (await assetRequest('GET', '', accessToken)).json()).toEqual(first);
    const response = await assetRequest('GET', '/' + id, accessToken);
    expect(response.headers.get('content-type')).toContain('image/png');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect((await assetRequest('DELETE', '/' + id, accessToken)).ok).toBe(true);
    expect((await assetRequest('GET', '/' + id, accessToken)).status).toBe(404);
    expect(await (await assetRequest('GET', '', accessToken)).json()).toEqual([]);
  });
  it('rejects >1.5MB decoded assets', async () => {
    const { accessToken } = await connect('assets');
    expect((await assetRequest('PUT', '/' + id, accessToken, {
      mime: 'image/png', data: Buffer.alloc(1.5 * 1024 * 1024 + 1).toString('base64'),
    })).status).toBe(413);
  });
});

// Asset hardening regressions use the existing per-test temporary data directory.
describe('note asset hardening', () => {
  const id = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  const request = (method: string, target: string, token: string) => fetch(base + '/api/assets' + target, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(method === 'PUT' ? { body: JSON.stringify({ mime: 'image/png', data: 'YWJj' }) } : {}),
  });
  it('GET sets nosniff and rejects an encoded traversal id', async () => {
    const { accessToken } = await connect('assets');
    await request('PUT', '/' + id, accessToken);
    const response = await request('GET', '/' + id, accessToken);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect((await request('GET', '/..%2F..%2Fauth.json', accessToken)).status).toBe(400);
  });
  it('lists healthy assets even when another metadata file is corrupt or unreadable', async () => {
    const { accessToken } = await connect('assets');
    await request('PUT', '/' + id, accessToken);
    const other = '0'.repeat(64);
    fs.writeFileSync(path.join(dir, 'assets', other), 'broken');
    fs.writeFileSync(path.join(dir, 'assets', other + '.json'), '{bad json');
    const unreadable = '1'.repeat(64);
    fs.writeFileSync(path.join(dir, 'assets', unreadable), 'unreadable');
    fs.mkdirSync(path.join(dir, 'assets', unreadable + '.json'));
    const response = await request('GET', '', accessToken);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([expect.objectContaining({ id })]);
  });
  it('publishes each asset file with a private temp file and atomic rename', async () => {
    const { accessToken } = await connect('assets');
    const writes = vi.spyOn(fs, 'writeFileSync');
    const renames = vi.spyOn(fs, 'renameSync');
    const mkdir = vi.spyOn(fs, 'mkdirSync');
    try {
      expect((await request('PUT', '/' + id, accessToken)).status).toBe(200);
      for (const name of [id, id + '.json']) {
        const target = path.join(dir, 'assets', name);
        const rename = renames.mock.calls.find(([, to]) => to === target);
        expect(rename).toBeDefined();
        expect(rename![0]).not.toBe(target);
        const write = writes.mock.calls.find(([to]) => to === rename![0]);
        expect(write?.[2]).toEqual(expect.objectContaining({ mode: 0o600 }));
      }
      expect(mkdir).toHaveBeenCalledWith(path.join(dir, 'assets'), expect.objectContaining({ mode: 0o700 }));
    } finally { writes.mockRestore(); renames.mockRestore(); mkdir.mockRestore(); }
  });
});
