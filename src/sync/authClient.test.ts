import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../server/app';
import { loadConfig } from '../../server/config';
import { FileStore } from '../../server/store';
import { AuthMode, SessionEndedError, signIn, TokenManager } from './authClient';
import { FetchLike, SyncHttpError } from './syncClient';
import { REFRESH_COOKIE } from './protocol';

const credentials = { username: 'admin', password: 'correct horse battery', deviceName: 'Phone', platform: 'android' };
let dir: string;
let server: Server;
let base: string;
let store: FileStore;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-auth-client-'));
  const config = { ...loadConfig({ NODE_ENV: 'test' }), dataDir: dir, initialPassword: credentials.password };
  store = new FileStore(dir);
  store.init(config.username, config.initialPassword);
  server = createApp(config, store).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(dir, { recursive: true, force: true });
});

// Separate endpoints deliver messages asynchronously and never echo to the sender.
function channels() {
  const peers: EventTarget[] = [];
  return () => {
    const target = new EventTarget();
    peers.push(target);
    return Object.assign(target, {
      postMessage(data: unknown) {
        for (const peer of peers) if (peer !== target) setTimeout(() => peer.dispatchEvent(new MessageEvent('message', { data })), 0);
      },
    }) as unknown as BroadcastChannel;
  };
}
function locks() {
  let queue = Promise.resolve<unknown>(undefined);
  return { request(name: string, callback: () => Promise<unknown>) {
    expect(name).toBe('daymark-refresh');
    const next = queue.then(callback);
    queue = next.catch(() => undefined);
    return next;
  } } as unknown as LockManager;
}

async function session(fetchFn: FetchLike = fetch, mode: AuthMode = 'body') {
  const login = await signIn(fetchFn, base + '/api/sync/', mode, credentials);
  let refreshToken = login.refreshToken;
  const ended = vi.fn();
  const opts = { fetchFn, serverUrl: base, mode, getRefreshToken: () => refreshToken,
    setRefreshToken: (token: string) => { refreshToken = token; }, onSessionEnded: ended, locks: null, channel: null };
  return { login, opts, ended, refreshToken: () => refreshToken };
}

describe('TokenManager', () => {
  it('body mode: getAccessToken refreshes and rotates the stored refresh token', async () => {
    const s = await session();
    const manager = new TokenManager(s.opts);
    const token = await manager.getAccessToken();
    expect(s.refreshToken()).not.toBe(s.login.refreshToken);
    expect((await fetch(base + '/api/devices', { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);
    const rotated = s.refreshToken();
    expect(await manager.getAccessToken()).toBe(token);
    expect(s.refreshToken()).toBe(rotated);
  });

  it.each([
    { count: 1, mode: 'body' as const },
    { count: 2, mode: 'body' as const },
    { count: 2, mode: 'cookie' as const },
  ])('$mode mode: shares one refresh across concurrent callers on $count manager(s)', async ({ count, mode }) => {
    let refreshes = 0;
    let cookie = '';
    const fetchFn: FetchLike = async (url, init) => {
      if (url.endsWith('/refresh')) refreshes++;
      const headers = new Headers(init?.headers);
      if (cookie) headers.set('Cookie', cookie);
      const res = await fetch(url, { ...init, headers });
      const refresh = res.headers.getSetCookie().find((value) => value.startsWith(REFRESH_COOKIE + '='));
      if (refresh) cookie = refresh.split(';')[0];
      return res;
    };
    const s = await session(fetchFn, mode);
    const channel = channels();
    const lock = locks();
    const managers = Array.from({ length: count }, () => new TokenManager({ ...s.opts,
      locks: count === 1 ? null : lock, channel: count === 1 ? null : channel() }));
    const tokens = await Promise.all(managers.flatMap((manager) => Array.from({ length: 5 }, () => manager.getAccessToken())));
    expect(new Set(tokens).size).toBe(1);
    expect(refreshes).toBe(1);
    expect(store.devices.every((device) => !device.revoked)).toBe(true);
    expect(store.devices[0].retiredRefreshHashes).toHaveLength(1);
  });

  it('asks a tab already holding a valid token before refreshing', async () => {
    let refreshes = 0;
    const s = await session((url, init) => { if (url.endsWith('/refresh')) refreshes++; return fetch(url, init); });
    const channel = channels();
    const lock = locks();
    const first = new TokenManager({ ...s.opts, locks: lock, channel: channel() });
    const token = await first.getAccessToken();
    const second = new TokenManager({ ...s.opts, locks: lock, channel: channel() });
    expect(await second.getAccessToken()).toBe(token);
    expect(refreshes).toBe(1);
  });

  it('refreshes at the 60 second boundary', async () => {
    let refreshes = 0;
    const s = await session((url, init) => { if (url.endsWith('/refresh')) refreshes++; return fetch(url, init); });
    const manager = new TokenManager(s.opts);
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    await manager.getAccessToken();
    clock.mockReturnValue(now + 839_999);
    await manager.getAccessToken();
    expect(refreshes).toBe(1);
    clock.mockReturnValue(now + 840_000);
    await manager.getAccessToken();
    expect(refreshes).toBe(2);
  });

  it('authFetch retries once after a 401', async () => {
    let refreshes = 0;
    let requests = 0;
    const s = await session((url, init) => {
      if (url.endsWith('/refresh')) refreshes++;
      if (url.endsWith('/devices')) {
        const headers = new Headers(init?.headers);
        expect(headers.get('Authorization')).toMatch(/^Bearer /);
        expect(headers.get('X-Test')).toBe('kept');
        if (++requests === 1) return Promise.resolve(new Response(null, { status: 401 }));
      }
      return fetch(url, init);
    });
    const manager = new TokenManager(s.opts);
    await manager.getAccessToken();
    expect((await manager.authFetch('/api/devices', { headers: new Headers({ 'X-Test': 'kept' }) })).status).toBe(200);
    expect(refreshes).toBe(2);
    expect(requests).toBe(2);
  });

  it('does not retry a second 401', async () => {
    let requests = 0;
    const s = await session((url, init) => {
      if (url.endsWith('/devices')) { requests++; return Promise.resolve(new Response(null, { status: 401 })); }
      return fetch(url, init);
    });
    expect((await new TokenManager(s.opts).authFetch('/api/devices')).status).toBe(401);
    expect(requests).toBe(2);
  });

  it('refresh 401 calls onSessionEnded and throws SessionEndedError', async () => {
    const s = await session();
    store.devices[0].revoked = true;
    await expect(new TokenManager(s.opts).getAccessToken()).rejects.toBeInstanceOf(SessionEndedError);
    expect(s.ended).toHaveBeenCalledTimes(1);
  });

  it('network failure keeps the session', async () => {
    const s = await session();
    let offline = true;
    const manager = new TokenManager({ ...s.opts, fetchFn: async (url, init) => {
      if (offline) throw new TypeError('offline');
      return fetch(url, init);
    } });
    await expect(manager.getAccessToken()).rejects.toMatchObject({ status: 0 });
    await expect(manager.getAccessToken()).rejects.toBeInstanceOf(SyncHttpError);
    expect(s.ended).not.toHaveBeenCalled();
    expect(s.refreshToken()).toBe(s.login.refreshToken);
    expect(store.devices[0].revoked).toBe(false);
    offline = false;
    expect(await manager.getAccessToken()).toBeTruthy();
    expect(s.refreshToken()).not.toBe(s.login.refreshToken);
    expect(s.ended).not.toHaveBeenCalled();
  });

  it('ignores malformed and nearly expired peer tokens', async () => {
    const s = await session();
    const channel = channels();
    const responder = channel();
    responder.addEventListener('message', (event: MessageEvent) => {
      if (event.data.type !== 'need-token') return;
      responder.postMessage({ type: 'token', accessToken: 'stale', expiresAt: Date.now() + 60_000 });
      responder.postMessage({ type: 'token', accessToken: 123, expiresAt: Date.now() + 900_000 });
    });
    const manager = new TokenManager({ ...s.opts, locks: locks(), channel: channel() });
    expect((await manager.authFetch('/api/devices')).status).toBe(200);
    expect(store.devices[0].retiredRefreshHashes).toHaveLength(1);
  });

  it('signOut waits for an in-flight rotation before revoking the session', async () => {
    const s = await session();
    const manager = new TokenManager(s.opts);
    const pending = manager.getAccessToken();
    await manager.signOut();
    await pending;
    expect(store.devices[0].revoked).toBe(true);
    await expect(manager.getAccessToken()).rejects.toBeInstanceOf(SessionEndedError);
  });

  it('signOut blocks new refresh work before waiting for logout', async () => {
    const s = await session();
    let refresh: Promise<Response> | undefined;
    const manager = new TokenManager({ ...s.opts, fetchFn: async (url, init) => {
      if (url.endsWith('/refresh')) {
        refresh = fetch(url, init);
        return refresh;
      }
      if (url.endsWith('/logout')) await refresh;
      return fetch(url, init);
    } });
    const signingOut = manager.signOut();
    const results = await Promise.allSettled([signingOut, manager.getAccessToken()]);
    expect(store.devices[0].revoked).toBe(true);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1]).toMatchObject({ status: 'rejected', reason: expect.any(SessionEndedError) });
  });

  it.each(['cookie', 'body'] as const)('%s mode signs in, refreshes and signs out with the right credentials', async (mode) => {
    let cookie = '';
    const fetchFn: FetchLike = async (url, init) => {
      const headers = new Headers(init?.headers);
      if (mode === 'cookie') {
        expect(init?.credentials).toBe('same-origin');
        expect(headers.get('X-Daymark-Client')).toBe('web');
        if (cookie) headers.set('Cookie', cookie);
        if (!url.endsWith('/login')) expect(init?.body).toBeUndefined();
      } else {
        expect(headers.has('X-Daymark-Client')).toBe(false);
        if (!url.endsWith('/login')) expect(JSON.parse(init!.body as string).refreshToken).toBeTruthy();
      }
      const res = await fetch(url, { ...init, headers });
      const refresh = res.headers.getSetCookie().find((value) => value.startsWith(REFRESH_COOKIE + '='));
      if (refresh) cookie = refresh.split(';')[0];
      return res;
    };
    const s = await session(fetchFn, mode);
    if (mode === 'cookie') expect(s.login.refreshToken).toBeUndefined();
    const manager = new TokenManager(s.opts);
    await manager.getAccessToken();
    await manager.signOut();
    expect(store.devices[0].revoked).toBe(true);
    await expect(manager.getAccessToken()).rejects.toBeInstanceOf(SessionEndedError);
  });
});
