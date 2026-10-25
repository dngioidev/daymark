import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, SEED_STANDALONE_NOTES } from '../utils/defaultData';
import { canonicalJson, toSyncedSettings } from '../sync/merge';
import { useSync } from './useSync';
import { loadSyncState, markOnboarded, saveSyncState, wipeLocalVault } from '../utils/vaultStore';
import { getHostMode } from '../utils/hostMode';
import { SessionEndedError } from '../sync/authClient';
import { VaultData } from '../sync/syncClient';

// Run the hook's async actions without introducing a DOM dependency.
const assetKv = vi.hoisted(() => new Map<string, unknown>());
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], index: 0, effects: [] as (() => unknown)[] }));
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const i = hooks.index++;
    if (!(i in hooks.slots)) hooks.slots[i] = typeof initial === 'function' ? initial() : initial;
    return [hooks.slots[i], (value: unknown) => { hooks.slots[i] = typeof value === 'function' ? value(hooks.slots[i]) : value; }];
  },
  useRef: (value: unknown) => {
    const i = hooks.index++;
    if (!(i in hooks.slots)) hooks.slots[i] = { current: value };
    return hooks.slots[i];
  },
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => unknown) => { hooks.effects.push(fn); },
}));
vi.mock('../utils/hostMode', () => ({ getHostMode: vi.fn(() => 'server') }));
vi.mock('../utils/vaultStore', () => ({
  isPhotoStorageAvailable: () => true,
  kvGetRaw: async (key: string) => assetKv.get(key),
  kvPutRaw: async (key: string, value: unknown) => { assetKv.set(key, value); },
  kvDeleteRaw: async (key: string) => { assetKv.delete(key); },
  kvKeysRaw: async (prefix: string) => [...assetKv.keys()].filter(key => key.startsWith(prefix)),
  loadSyncState: vi.fn(), saveSyncState: vi.fn(async () => {}), wipeLocalVault: vi.fn(async () => {}), markOnboarded: vi.fn(),
}));

const state = { serverUrl: 'https://daymark.test', username: 'admin', deviceId: 'device', deviceName: 'Browser',
  lastRev: 0, bases: {}, lastSyncAt: null };
const vault: VaultData = { docs: [], notes: [], settings: DEFAULT_SETTINGS, habits: { habits: [], days: [] }, backlog: { items: [] } };
let fetchFn: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;
let replace: ReturnType<typeof vi.fn>;
function render(next = vault) {
  hooks.index = 0;
  hooks.effects = [];
  return useSync(next, vi.fn(), vi.fn(), 'web');
}
beforeEach(() => {
  vi.clearAllMocks();
  hooks.slots = [];
  assetKv.clear();
  vi.mocked(getHostMode).mockReturnValue('server');
  vi.mocked(loadSyncState).mockReturnValue({ ...state });
  replace = vi.fn();
  vi.stubGlobal('location', { origin: state.serverUrl, replace });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', new EventTarget());
  vi.stubGlobal('BroadcastChannel', undefined);
  fetchFn = vi.fn(async (url: string) => {
    if (url.endsWith('/refresh')) return Response.json({ accessToken: 'access', expiresIn: 900, username: 'admin', device: { id: 'device', name: 'Browser' } });
    if (url.endsWith('/logout')) return Response.json({ ok: true });
    return Response.json({ rev: 1, entities: [{ key: 'settings', value: toSyncedSettings(DEFAULT_SETTINGS), rev: 1 },
      { key: 'habits', value: { habits: [] }, rev: 1 }, { key: 'backlog', value: { items: [] }, rev: 1 }], conflicts: [] });
  });
  vi.stubGlobal('fetch', fetchFn);
});
afterEach(() => vi.unstubAllGlobals());

it('records failed forced logout before wiping and expires the marker', async () => {
  const values = new Map<string, string>();
  vi.stubGlobal('navigator', { onLine: false, locks: { request: (_name: string, run: () => unknown) => run() } });
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.mocked(wipeLocalVault).mockImplementationOnce(async () => {
    expect(values.get('daymark_logout_pending')).toBe('1');
  });
  fetchFn.mockRejectedValue(new Error('offline'));
  expect(await render().signOut({ force: true })).toBe('done');
  expect(document.cookie).toBe('daymark_signed_in=; Max-Age=0; Path=/');
  expect(values.get('daymark_logout_pending')).toBe('1');
});

it('retries a failed remote-session wipe on the next sign-out', async () => {
  vi.mocked(wipeLocalVault).mockRejectedValueOnce(new Error('storage blocked'));
  fetchFn.mockResolvedValue(Response.json({ error: 'ended' }, { status: 401 }));
  await expect(render().syncNow()).rejects.toBeInstanceOf(SessionEndedError);
  await vi.waitFor(() => expect(render().error).toBe('storage blocked'));
  expect(replace).not.toHaveBeenCalled();
  expect(await render().signOut()).toBe('done');
  expect(wipeLocalVault).toHaveBeenCalledTimes(2);
  expect(replace).toHaveBeenCalledWith('/');
});

it('bootstraps server account from refresh before the first sync', async () => {
  vi.mocked(loadSyncState).mockReturnValue(null);
  const sync = render();
  hooks.effects[0]();
  await sync.syncNow();
  expect(saveSyncState).toHaveBeenCalledWith(expect.objectContaining({ ...state, bases: {} }));
  expect(render().account?.deviceName).toBe('Browser');
  expect(markOnboarded).toHaveBeenCalled();
  expect(fetchFn.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(['/api/auth/refresh', '/api/sync']);
});

it('syncs before logout and wipes before redirecting', async () => {
  expect(await render().signOut()).toBe('done');
  expect(fetchFn.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(['/api/auth/refresh', '/api/sync', '/api/auth/logout']);
  expect(wipeLocalVault).toHaveBeenCalledTimes(1);
  expect(replace).toHaveBeenCalledWith('/');
  expect(vi.mocked(wipeLocalVault).mock.invocationCallOrder[0]).toBeLessThan(replace.mock.invocationCallOrder[0]);
});

it('requires confirmation after a failed sync even with no pending changes, then force wipes', async () => {
  vi.mocked(loadSyncState).mockReturnValue({ ...state, bases: { settings: canonicalJson(toSyncedSettings(DEFAULT_SETTINGS)), habits: canonicalJson({ habits: [] }), backlog: canonicalJson({ items: [] }) } });
  fetchFn.mockImplementation(async (url: string) => {
    if (url.endsWith('/sync')) throw new Error('offline');
    return Response.json({ accessToken: 'access', expiresIn: 900, username: 'admin', device: { id: 'device', name: 'Browser' } });
  });
  const sync = render();
  expect(await sync.signOut()).toBe('needs-confirm-unreachable');
  expect(sync.pendingChanges()).toBe(0);
  expect(fetchFn.mock.calls.some(([url]) => url.endsWith('/sync'))).toBe(true);
  expect(wipeLocalVault).not.toHaveBeenCalled();
  expect(await sync.signOut({ force: true })).toBe('done');
  expect(wipeLocalVault).toHaveBeenCalledTimes(1);
});

it('requires confirmation when sync leaves unsent changes', async () => {
  fetchFn.mockImplementation(async (url: string) => Response.json(url.endsWith('/refresh')
    ? { accessToken: 'access', expiresIn: 900, username: 'admin', device: { id: 'device', name: 'Browser' } }
    : { rev: 1, entities: [], conflicts: [] }));
  expect(await render().signOut()).toBe('needs-confirm');
  expect(render().pendingChanges()).toBe(3);
  expect(fetchFn.mock.calls.some(([url]) => url.endsWith('/sync'))).toBe(true);
  expect(wipeLocalVault).not.toHaveBeenCalled();
});

it('waits for an already running sync before signing out', async () => {
  const original = fetchFn.getMockImplementation()!;
  let release!: () => void;
  let rounds = 0;
  fetchFn.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/sync') && ++rounds === 1) await new Promise<void>((resolve) => { release = resolve; });
    return original(url, init);
  });
  const sync = render();
  const pending = sync.syncNow();
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  const signingOut = sync.signOut();
  expect(wipeLocalVault).not.toHaveBeenCalled();
  release();
  await pending;
  expect(await signingOut).toBe('done');
  expect(rounds).toBe(2);
});

it('wipes a remotely ended server session without confirmation', async () => {
  fetchFn.mockResolvedValue(Response.json({ error: 'ended' }, { status: 401 }));
  await expect(render().syncNow()).rejects.toBeInstanceOf(SessionEndedError);
  await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  expect(wipeLocalVault).toHaveBeenCalledTimes(1);
});

it('uploads edits made during an active round before syncNow resolves', async () => {
  let release!: () => void;
  let rounds = 0;
  const original = fetchFn.getMockImplementation()!;
  fetchFn.mockImplementation(async (url, init) => {
    if (!url.endsWith('/sync')) return original(url, init);
    const request = JSON.parse(String(init?.body));
    if (++rounds === 1) await new Promise<void>((resolve) => { release = resolve; });
    return Response.json({ rev: rounds, entities: request.changes.map((change: { key: string; value: unknown }) => ({ ...change, rev: rounds })), conflicts: [] });
  });
  const first = render().syncNow();
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  const changed = { ...vault, notes: SEED_STANDALONE_NOTES };
  const second = render(changed).syncNow();
  release();
  await Promise.all([first, second]);
  const requests = fetchFn.mock.calls.filter(([url]) => url.endsWith('/sync'));
  expect(requests).toHaveLength(2);
  expect(JSON.parse(String(requests[1][1]?.body)).changes).toContainEqual(expect.objectContaining({ key: `note:${SEED_STANDALONE_NOTES[0].id}` }));
  expect(render(changed).pendingChanges()).toBe(0);
});

it('native sign-out clears credentials and preserves the vault', async () => {
  vi.mocked(getHostMode).mockReturnValue('native');
  vi.mocked(loadSyncState).mockReturnValue({ ...state, refreshToken: 'native-refresh' });
  expect(await render().signOut()).toBe('done');
  expect(saveSyncState).toHaveBeenLastCalledWith(null);
  expect(wipeLocalVault).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
});

it('local web ignores old sync credentials and never syncs', async () => {
  vi.mocked(getHostMode).mockReturnValue('local-web');
  const sync = render();
  expect(sync.account).toBeNull();
  expect(sync.pendingChanges()).toBe(0);
  await sync.syncNow();
  expect(fetchFn).not.toHaveBeenCalled();
});

it('remembers unsupported habits for the session and leaves habit bases untouched', async () => {
  const bases = { backlog: canonicalJson({ items: [] }), habits: canonicalJson({ habits: [] }), 'habitday:2026-10-23': canonicalJson({ date: '2026-10-23', ticks: {} }) };
  vi.mocked(loadSyncState).mockReturnValue({ ...state, bases });
  const original = fetchFn.getMockImplementation()!;
  const bodies: { changes: { key: string; value: unknown }[] }[] = [];
  fetchFn.mockImplementation(async (url, init) => {
    if (!url.endsWith('/sync')) return original(url, init);
    const body = JSON.parse(String(init?.body));
    bodies.push(body);
    if (body.changes.some((c: { key: string }) => c.key.startsWith('habit'))) return Response.json({ error: 'Invalid entity key in sync request.' }, { status: 400 });
    return Response.json({ rev: 1, entities: body.changes.map((c: { key: string; value: unknown }) => ({ ...c, rev: 1 })), conflicts: [] });
  });
  const changed = { ...vault, habits: { habits: [], days: [{ date: '2026-10-24', ticks: { a: { done: true, at: '2026-10-24T08:00:00Z' } } }] } };
  await render(changed).syncNow();
  await render(changed).syncNow();
  expect(bodies).toHaveLength(3);
  expect(bodies.slice(1).every((b) => b.changes.every((c) => !c.key.startsWith('habit')))).toBe(true);
  expect(render(changed).error).toBeNull();
  expect(render(changed).pendingChanges()).toBe(0);
  expect(saveSyncState).toHaveBeenLastCalledWith(expect.objectContaining({ bases: expect.objectContaining(bases) }));
});

it('remembers unsupported habits when a vault replacement discards the round', async () => {
  vi.mocked(loadSyncState).mockReturnValue({ ...state, bases: { backlog: canonicalJson({ items: [] }) } });
  let release!: () => void;
  const original = fetchFn.getMockImplementation()!;
  const bodies: { changes: { key: string; value: unknown }[] }[] = [];
  fetchFn.mockImplementation(async (url, init) => {
    if (!url.endsWith('/sync')) return original(url, init);
    const body = JSON.parse(String(init?.body));
    bodies.push(body);
    if (body.changes.some((c: { key: string }) => c.key.startsWith('habit'))) return Response.json({ error: 'Invalid entity key in sync request.' }, { status: 400 });
    if (bodies.length === 2) await new Promise<void>((resolve) => { release = resolve; });
    return Response.json({ rev: bodies.length, entities: body.changes.map((c: { key: string; value: unknown }) => ({ ...c, rev: bodies.length })), conflicts: [] });
  });
  const sync = render();
  const pending = sync.syncNow();
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  sync.rebaseAfterReplace();
  release();
  await pending;
  expect(bodies).toHaveLength(3);
  expect(bodies[2].changes.every((c) => !c.key.startsWith('habit'))).toBe(true);
  expect(render().error).toBeNull();
  expect(render().pendingChanges()).toBe(0);
});

it('clears the backfill marker even if a fallback result becomes stale', async () => {
  vi.mocked(loadSyncState).mockReturnValue({ ...state, habitsSynced: true, backlogSynced: true, bases: { backlog: canonicalJson({ items: [] }) } });
  const original = fetchFn.getMockImplementation()!;
  let release!: () => void;
  let calls = 0;
  fetchFn.mockImplementation(async (url, init) => {
    if (!url.endsWith('/sync')) return original(url, init);
    calls++;
    if (calls === 1) return Response.json({ error: 'Invalid entity key' }, { status: 400 });
    if (calls === 2) await new Promise<void>(resolve => { release = resolve; });
    if (calls === 3) throw new Error('offline');
    return Response.json({ rev: 5, entities: [], conflicts: [] });
  });
  const sync = render();
  const pending = sync.syncNow();
  const rejection = expect(pending).rejects.toThrow();
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  sync.rebaseAfterReplace();
  release();
  await rejection;
  expect(saveSyncState).toHaveBeenLastCalledWith(expect.objectContaining({ habitsSynced: false }));
});

it('applies incoming habit-only changes to the vault', async () => {
  const onChange = vi.fn();
  const habits = { habits: [], days: [{ date: '2026-10-24', ticks: { a: { done: true, at: '2026-10-24T08:00:00Z' } } }] };
  const original = fetchFn.getMockImplementation()!;
  fetchFn.mockImplementation(async (url, init) => url.endsWith('/sync')
    ? Response.json({ rev: 1, entities: [{ key: 'habitday:2026-10-24', value: habits.days[0], rev: 1 }], conflicts: [] })
    : original(url, init));
  hooks.index = 0;
  await useSync(vault, onChange, vi.fn(), 'web').syncNow();
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ habits }));
});

it.each([false, true])('persists recovered backfill habits through the vault callback (same content: %s)', async (sameContent) => {
  const store = await vi.importActual<typeof import('../utils/vaultStore')>('../utils/vaultStore');
  const day = { date: '2026-10-24', ticks: { a: { done: true, at: '2026-10-24T08:00:00Z' } } };
  const damaged = { habits: [], days: [...(sameContent ? [day] : []), { date: 'broken', ticks: {} }] };
  const values = new Map([['daymark_habits_v1', JSON.stringify(damaged)]]);
  vi.stubGlobal('indexedDB', undefined);
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await store.initVaultStore();
    const recovered = { ...vault, habits: store.loadHabits() };
    vi.mocked(loadSyncState).mockReturnValue({ ...state, habitsSynced: false });
    const original = fetchFn.getMockImplementation()!;
    fetchFn.mockImplementation(async (url, init) => url.endsWith('/sync')
      ? Response.json({ rev: 2, entities: [{ key: 'habitday:2026-10-24', value: day, rev: 1 }], conflicts: [] })
      : original(url, init));
    hooks.index = 0;
    await useSync(recovered, next => store.saveHabits(next.habits), vi.fn(), 'web').syncNow();
    expect(JSON.parse(values.get('daymark_habits_v1')!)).toEqual({ habits: [], days: [day] });
  } finally { errors.mockRestore(); }
});

it.each(['server', 'native'] as const)('retries pending picture upload and fetches missing pictures with %s auth', async mode => {
  vi.mocked(getHostMode).mockReturnValue(mode);
  vi.mocked(loadSyncState).mockReturnValue({ ...state, refreshToken: 'native-refresh' });
  const assets = await import('../utils/noteAssets');
  const local = new Blob(['abc'], { type: 'image/png' });
  const id = await assets.putAsset(local, { mime: 'image/png', width: 1, height: 1, createdAt: '2026-10-25' });
  const missing = 'cb8379ac2098aa165029e3938a51da0bcecfc008fd6795f401178647f96c5b34';
  const next = { ...vault, notes: [{ ...SEED_STANDALONE_NOTES[0], content: `![](daymark-asset:${missing}.png)` }] };
  const original = fetchFn.getMockImplementation()!;
  let attempts = 0;
  fetchFn.mockImplementation(async (url, init) => {
    if (url.includes('/api/assets/')) {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access');
      if (init?.method === 'PUT') {
        if (++attempts === 1) throw new Error('offline');
        return Response.json({ ok: true });
      }
      expect(url).toContain('?format=base64');
      return Response.json({ id: missing, mime: 'image/png', data: 'ZGVm' });
    }
    if (url.endsWith('/sync')) {
      const body = JSON.parse(String(init?.body));
      return Response.json({ rev: 1, entities: body.changes.map((c: { key: string; value: unknown }) => ({ ...c, rev: 1 })), conflicts: [] });
    }
    return original(url, init);
  });
  const arrived: string[] = [];
  window.addEventListener('daymark-assets-changed', event => arrived.push(...(event as CustomEvent<{ ids: string[] }>).detail.ids));
  await render(next).syncNow();
  await vi.waitFor(() => expect(attempts).toBe(1));
  expect(await assets.pendingUploads()).toContain(id);
  expect(await assets.getAssetUrl(missing)).toBeNull();
  expect(render(next).status).toBe('idle');
  await render(next).syncNow();
  await vi.waitFor(async () => expect(await assets.hasAsset(missing)).toBe(true));
  expect(await assets.pendingUploads()).toEqual([]);
  expect(arrived).toContain(missing);
});

it('finishes note sync while a picture upload is still waiting on the network', async () => {
  const assets = await import('../utils/noteAssets');
  const id = await assets.putAsset(new Blob(['abc'], { type: 'image/png' }), {
    mime: 'image/png', width: 1, height: 1, createdAt: '2026-10-25',
  });
  const original = fetchFn.getMockImplementation()!;
  let release!: () => void;
  fetchFn.mockImplementation(async (url, init) => {
    if (url.includes('/api/assets/')) {
      await new Promise<void>(resolve => { release = resolve; });
      return Response.json({ ok: true });
    }
    return original(url, init);
  });
  await render().syncNow();
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  expect(render().status).toBe('idle');
  expect(await assets.pendingUploads()).toContain(id);
  release();
  await vi.waitFor(async () => expect(await assets.pendingUploads()).toEqual([]));
});

it('syncNow reports completed rounds and false after closing', async () => {
  expect(await render().syncNow()).toBe(true); await render().signOut(); fetchFn.mockClear();
  expect(await render().syncNow()).toBe(false); expect(fetchFn).not.toHaveBeenCalled();
});
it('syncNow reports false in local-only mode', async () => {
  vi.mocked(getHostMode).mockReturnValue('local-web');
  expect(await render().syncNow()).toBe(false); expect(fetchFn).not.toHaveBeenCalled();
});

it('syncNow reports false after a session is blocked', async () => {
  fetchFn.mockResolvedValue(Response.json({ error: 'ended' }, { status: 401 }));
  await expect(render().syncNow()).rejects.toBeInstanceOf(SessionEndedError);
  fetchFn.mockClear();
  expect(await render().syncNow()).toBe(false);
  expect(fetchFn).not.toHaveBeenCalled();
});

it('remembers unsupported backlog without disabling habits or losing backlog bases', async () => {
  const backlog = { items: [{ id: 'idea', title: 'Idea', order: 1, createdAt: 'now', updatedAt: 'now' }] };
  const bases = { backlog: canonicalJson({ items: [] }) };
  vi.mocked(loadSyncState).mockReturnValue({ ...state, bases });
  const original = fetchFn.getMockImplementation()!;
  const bodies: { changes: { key: string; value: unknown }[] }[] = [];
  fetchFn.mockImplementation(async (url, init) => {
    if (!url.endsWith('/sync')) return original(url, init);
    const body = JSON.parse(String(init?.body)); bodies.push(body);
    if (body.changes.some((c: { key: string }) => c.key === 'backlog')) return Response.json({ error: 'Invalid entity key in sync request.' }, { status: 400 });
    return Response.json({ rev: 1, entities: body.changes.map((c: { key: string; value: unknown }) => ({ ...c, rev: 1 })), conflicts: [] });
  });
  const local = { ...vault, backlog };
  await render(local).syncNow();
  await render(local).syncNow();
  expect(bodies).toHaveLength(3);
  expect(bodies[1].changes.some(c => c.key === 'habits')).toBe(true);
  expect(bodies.slice(1).every(b => b.changes.every(c => c.key !== 'backlog'))).toBe(true);
  expect(render(local).error).toBeNull();
  expect(render(local).pendingChanges()).toBe(0);
  expect(saveSyncState).toHaveBeenLastCalledWith(expect.objectContaining({ habitsSynced: true, backlogSynced: false, bases: expect.objectContaining(bases) }));
});

it.each([false, true])('persists incoming backlog, including release of recovered identical content (%s)', async recovered => {
  const { uneditedRecoveredBacklog } = await import('../utils/backlog');
  const backlog = { items: [{ id: 'idea', title: 'Idea', order: 1, createdAt: 'now', updatedAt: 'now' }] };
  const local = { ...vault, backlog: recovered ? backlog : { items: [] } };
  if (recovered) uneditedRecoveredBacklog.add(local.backlog);
  const original = fetchFn.getMockImplementation()!;
  fetchFn.mockImplementation(async (url, init) => url.endsWith('/sync')
    ? Response.json({ rev: 1, entities: [{ key: 'backlog', value: backlog, rev: 1 }], conflicts: [] }) : original(url, init));
  const onChange = vi.fn(); hooks.index = 0;
  await useSync(local, onChange, vi.fn(), 'web').syncNow();
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ backlog }));
  expect(uneditedRecoveredBacklog.has(onChange.mock.calls[0][0].backlog)).toBe(false);
});
