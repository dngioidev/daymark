import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, SEED_STANDALONE_NOTES } from '../utils/defaultData';
import { canonicalJson, toSyncedSettings } from '../sync/merge';
import { useSync } from './useSync';
import { loadSyncState, markOnboarded, saveSyncState, wipeLocalVault } from '../utils/vaultStore';
import { getHostMode } from '../utils/hostMode';
import { SessionEndedError } from '../sync/authClient';
import { VaultData } from '../sync/syncClient';

// Run the hook's async actions without introducing a DOM dependency.
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
  loadSyncState: vi.fn(), saveSyncState: vi.fn(async () => {}), wipeLocalVault: vi.fn(async () => {}), markOnboarded: vi.fn(),
}));

const state = { serverUrl: 'https://daymark.test', username: 'admin', deviceId: 'device', deviceName: 'Browser',
  lastRev: 0, bases: {}, lastSyncAt: null };
const vault: VaultData = { docs: [], notes: [], settings: DEFAULT_SETTINGS };
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
    return Response.json({ rev: 1, entities: [{ key: 'settings', value: toSyncedSettings(DEFAULT_SETTINGS), rev: 1 }], conflicts: [] });
  });
  vi.stubGlobal('fetch', fetchFn);
});
afterEach(() => vi.unstubAllGlobals());

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
  vi.mocked(loadSyncState).mockReturnValue({ ...state, bases: { settings: canonicalJson(toSyncedSettings(DEFAULT_SETTINGS)) } });
  fetchFn.mockImplementation(async (url: string) => {
    if (url.endsWith('/sync')) throw new Error('offline');
    return Response.json({ accessToken: 'access', expiresIn: 900, username: 'admin', device: { id: 'device', name: 'Browser' } });
  });
  const sync = render();
  expect(await sync.signOut()).toBe('needs-confirm');
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
  expect(render().pendingChanges()).toBe(1);
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
