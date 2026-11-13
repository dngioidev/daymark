import { sameInkPages } from '../ink/inkVersion';
import { uneditedRecoveredNoteMeta } from '../utils/noteFolders';
import { useCallback, useEffect, useRef, useState } from 'react';
import { canonicalJson } from '../sync/merge';
import { applySyncOutcome, collectChanges, normalizeServerUrl, rebaseAfterVaultReplace, SyncFeature, SyncHttpError, SyncState, syncOnce, toEntities, VaultData } from '../sync/syncClient';
import { SessionEndedError, signIn, TokenManager } from '../sync/authClient';
import { loadSyncState, markOnboarded, saveSyncState, wipeLocalVault } from '../utils/vaultStore';
import { getInstallId } from '../utils/deviceName';
import { getHostMode } from '../utils/hostMode';
import { LOGOUT_PENDING_KEY } from '../utils/logoutPending';
import { uneditedRecoveredBacklog } from '../utils/backlog';
import { uneditedRecoveredHabits } from '../utils/habits';
import { syncNoteAssets } from '../utils/noteAssets';
import { readServerEvents } from '../sync/serverEvents';

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncAccount {
  serverUrl: string;
  username: string;
  deviceName: string;
}

export interface UseSyncResult {
  status: SyncStatus;
  account: SyncAccount | null;
  lastSyncAt: string | null;
  error: string | null;
  mode: ReturnType<typeof getHostMode>;
  connect: (serverUrl: string, username: string, password: string, deviceName: string) => Promise<void>;
  disconnect: () => Promise<void>;
  signOut: (opts?: { force?: boolean }) => Promise<'done' | 'needs-confirm' | 'needs-confirm-unreachable'>;
  pendingChanges: () => number;
  authFetch: (path: string, init?: RequestInit) => Promise<Response>;
  syncNow: () => Promise<boolean>;
  /** Call right after the whole local vault was replaced (restore, sample data). */
  rebaseAfterReplace: () => void;
}

const AUTO_SYNC_DEBOUNCE_MS = 2500;
const PERIODIC_SYNC_MS = 60_000;
const EVENTS_RETRY_MAX_MS = 30_000;
/** The stream opens after start-up settles, so it never competes with the first load and sync. */
const EVENTS_START_DELAY_MS = 2000;

/**
 * Sync on start, local changes, reconnect, foreground and once a minute. `vault` identities
 * schedule the debounced sync; `live` (optional) returns the newest data to send and merge, for
 * state that reaches `vault` later than it changes (ink strokes, see useInkPages).
 */
export function useSync(
  vault: VaultData,
  onVaultChange: (next: VaultData) => void,
  onConflicts: (messages: string[]) => void,
  platform: string,
  live?: (vault: VaultData) => VaultData
): UseSyncResult {
  const [mode] = useState(getHostMode);
  const [state, setState] = useState<SyncState | null>(() => mode === 'local-web' ? null : loadSyncState());
  const [status, setStatus] = useState<SyncStatus>(state || mode === 'server' ? 'idle' : 'off');
  const [error, setError] = useState<string | null>(null);
  const manager = useRef<TokenManager | null>(null);
  const vaultRef = useRef(vault);
  vaultRef.current = vault;
  const liveRef = useRef(live);
  liveRef.current = live;
  const latest = () => liveRef.current ? liveRef.current(vaultRef.current) : vaultRef.current;
  const stateRef = useRef(state);
  stateRef.current = state;
  const callbacks = useRef({ onVaultChange, onConflicts });
  callbacks.current = { onVaultChange, onConflicts };
  const running = useRef<Promise<boolean> | null>(null);
  const rerun = useRef(false);
  const assetRun = useRef<Promise<void> | null>(null);
  const blocked = useRef(false);
  const closing = useRef(false);
  const wiped = useRef<Promise<void> | null>(null);
  const epoch = useRef(0); // stale in-flight results are dropped after replacing the vault
  const inkNoticeShown = useRef(false);
  const unsupported = useRef(new Set<SyncFeature>()); // capability fallback belongs to this session, never persisted

  const persistState = (next: SyncState | null) => {
    stateRef.current = next;
    setState(next);
    return saveSyncState(next);
  };

  const wipeAndLeave = () => {
    if (!wiped.current) wiped.current = wipeLocalVault().then(() => { location.replace('/'); }).catch((err) => {
      wiped.current = null;
      throw err;
    });
    return wiped.current;
  };

  const sessionEnded = () => {
    blocked.current = true;
    epoch.current++;
    if (closing.current) return;
    if (mode === 'server') {
      void wipeAndLeave().catch((err) => { setError((err as Error).message); setStatus('error'); });
    } else {
      void persistState(null);
      setError('This device was signed out by the server. Connect again to resume syncing.');
      setStatus('off');
    }
  };

  const tokenManager = () => {
    if (mode === 'local-web' || (mode === 'native' && !stateRef.current)) throw new SessionEndedError();
    if (!manager.current) manager.current = new TokenManager({
      fetchFn: fetch, serverUrl: mode === 'server' ? location.origin : stateRef.current!.serverUrl,
      mode: mode === 'native' ? 'body' : 'cookie',
      // A new browser needs its own refresh response to discover its account and device.
      ...(mode === 'server' && !stateRef.current ? { channel: null } : {}),
      getRefreshToken: () => stateRef.current?.refreshToken,
      setRefreshToken: (refreshToken) => {
        if (stateRef.current) return persistState({ ...stateRef.current, refreshToken });
      },
      onRefresh: async (session) => {
        if (mode !== 'server' || closing.current || blocked.current) return;
        const current = stateRef.current;
        if (current?.deviceId === session.device.id && current.serverUrl === location.origin) return;
        await persistState({ serverUrl: location.origin, username: session.username,
          deviceId: session.device.id, deviceName: session.device.name, lastRev: 0, bases: {}, lastSyncAt: null });
      },
      onSessionEnded: sessionEnded,
    });
    return manager.current;
  };

  const authFetch = useCallback((path: string, init?: RequestInit) => tokenManager().authFetch(path, init), [mode]);

  const run = useCallback((): Promise<boolean> => {
    if (mode === 'local-web' || blocked.current || closing.current || (mode === 'native' && !stateRef.current)) return Promise.resolve(false);
    if (running.current) {
      rerun.current = true;
      return running.current;
    }
    const operation = async () => {
      setStatus('syncing');
      try {
        do {
          rerun.current = false;
          const startedAt = epoch.current;
          const accessToken = await tokenManager().getAccessToken();
          if (blocked.current || closing.current) return false;
          const current = stateRef.current!;
          const outcome = await syncOnce((url, init) => authFetch(url.slice(current.serverUrl.length), init), latest(), current, accessToken, unsupported.current);
          if (blocked.current || closing.current) return false;
          unsupported.current = outcome.unsupported;
          if (unsupported.current.has('ink') && !inkNoticeShown.current) {
            inkNoticeShown.current = true;
            callbacks.current.onConflicts(['Handwritten pages stay on this device until the server is updated to Daymark 1.11']);
          }
          if (stateRef.current && ((unsupported.current.has('habits') && stateRef.current.habitsSynced) ||
            (unsupported.current.has('backlog') && stateRef.current.backlogSynced) ||
            (unsupported.current.has('notemeta') && stateRef.current.notemetaSynced) ||
            (unsupported.current.has('ink') && stateRef.current.inkSynced))) {
            await persistState({ ...stateRef.current,
              inkSynced: unsupported.current.has('ink') ? false : stateRef.current.inkSynced,
              habitsSynced: unsupported.current.has('habits') ? false : stateRef.current.habitsSynced,
              backlogSynced: unsupported.current.has('backlog') ? false : stateRef.current.backlogSynced,
              notemetaSynced: unsupported.current.has('notemeta') ? false : stateRef.current.notemetaSynced });
          }
          if (startedAt !== epoch.current) {
            rerun.current = true;
            continue;
          }
          if (outcome.serverValues.size > 0) {
            const before = latest();
            const next = applySyncOutcome(before, outcome);
            const recoveredHabitsReleased = uneditedRecoveredHabits.has(before.habits) && !uneditedRecoveredHabits.has(next.habits);
            const recoveredNoteMetaReleased = uneditedRecoveredNoteMeta.has(before.notemeta) && !uneditedRecoveredNoteMeta.has(next.notemeta);
            const recoveredBacklogReleased = uneditedRecoveredBacklog.has(before.backlog) && !uneditedRecoveredBacklog.has(next.backlog);
            if (canonicalJson(next.docs) !== canonicalJson(before.docs) || canonicalJson(next.notes) !== canonicalJson(before.notes) ||
              canonicalJson(next.settings) !== canonicalJson(before.settings) || canonicalJson(next.habits) !== canonicalJson(before.habits) || recoveredHabitsReleased ||
              canonicalJson(next.backlog) !== canonicalJson(before.backlog) || recoveredBacklogReleased ||
              !sameInkPages(next.ink, before.ink) ||
              canonicalJson(next.notemeta) !== canonicalJson(before.notemeta) || recoveredNoteMetaReleased) {
              vaultRef.current = next;
              callbacks.current.onVaultChange(next);
            }
          }
          // Native refresh may have rotated while the sync request was being retried.
          await persistState({ ...outcome.state, refreshToken: stateRef.current?.refreshToken });
          if (outcome.conflicts.length) callbacks.current.onConflicts(outcome.conflicts);
          // Pictures follow successful note sync, independently of its status/latency.
          if (!assetRun.current && !closing.current && !blocked.current) {
            const assetEpoch = epoch.current;
            assetRun.current = syncNoteAssets(latest().notes, authFetch,
              () => !closing.current && !blocked.current && assetEpoch === epoch.current)
              .catch(() => undefined).finally(() => { assetRun.current = null; });
          }
        } while (rerun.current);
        setError(null);
        setStatus('idle');
        return !blocked.current && !closing.current;
      } catch (err) {
        const e = err as SyncHttpError;
        if (err instanceof SessionEndedError || e.status === 401) {
          if (!blocked.current) sessionEnded();
        } else if (e.status === 0 || !navigator.onLine) {
          setError(null);
          setStatus('offline');
        } else {
          setError(e.message || 'Sync failed.');
          setStatus('error');
        }
        throw err;
      }
    };
    running.current = operation().finally(() => { running.current = null; });
    return running.current;
  }, [mode, authFetch]);

  useEffect(() => {
    if (mode === 'server') markOnboarded();
  }, [mode]);

  useEffect(() => {
    if (!state) return;
    const timer = setTimeout(() => { void run().catch(() => undefined); }, AUTO_SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [vault.docs, vault.notes, vault.settings, vault.habits, vault.backlog, vault.notemeta, vault.ink, state?.deviceId, run]);

  useEffect(() => {
    if (mode !== 'server' && !state?.deviceId) return;
    const trigger = () => { void run().catch(() => undefined); };
    trigger();
    const onVisible = () => document.visibilityState === 'visible' && trigger();
    const interval = setInterval(trigger, PERIODIC_SYNC_MS);
    window.addEventListener('online', trigger);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', trigger);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [mode, state?.deviceId, run]);

  // While the page is visible, the server says when the vault changed (another device, an AI
  // connection) so this page syncs at once. The timer above stays as the fallback.
  useEffect(() => {
    if (mode === 'local-web' || (mode !== 'server' && !state?.deviceId)) return;
    let stopped = false;
    let abort: AbortController | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let delay = 1000;
    const onEvent = (_type: 'ready' | 'changed', rev: number) => {
      delay = 1000;
      // `ready` also catches up on anything missed while disconnected.
      if (rev > (stateRef.current?.lastRev ?? 0)) void run().catch(() => undefined);
    };
    const open = () => {
      clearTimeout(retry);
      if (stopped || abort || blocked.current || document.visibilityState !== 'visible') return;
      const controller = new AbortController();
      abort = controller;
      readServerEvents(authFetch, '/api/events', onEvent, controller.signal)
        .catch((err: Error & { status?: number }) => {
          // A server without the endpoint keeps the timer only, for this session.
          if (err.status === 404) stopped = true;
          if (err instanceof SessionEndedError) stopped = true;
        })
        .finally(() => {
          if (abort === controller) abort = null;
          if (stopped || controller.signal.aborted) return;
          retry = setTimeout(open, delay);
          delay = Math.min(delay * 2, EVENTS_RETRY_MAX_MS);
        });
    };
    const close = () => { clearTimeout(retry); abort?.abort(); abort = null; };
    const onVisible = () => document.visibilityState === 'visible' ? open() : close();
    void (running.current ?? Promise.resolve(false)).catch(() => false).finally(() => {
      if (!stopped) retry = setTimeout(open, EVENTS_START_DELAY_MS);
    });
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', open);
    return () => {
      stopped = true;
      close();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', open);
    };
  }, [mode, state?.deviceId, run, authFetch]);

  const connect = useCallback(async (serverUrl: string, username: string, password: string, deviceName: string) => {
    if (mode !== 'native') throw new Error('Sign in from your server or the Android app.');
    setError(null);
    try {
      const session = await signIn(fetch, serverUrl, 'body', { username, password, deviceName, platform, installId: getInstallId() });
      manager.current = null;
      unsupported.current = new Set();
      inkNoticeShown.current = false;
      blocked.current = false;
      closing.current = false;
      await persistState({ serverUrl: normalizeServerUrl(serverUrl), username: session.username,
        deviceId: session.device.id, deviceName: session.device.name, refreshToken: session.refreshToken,
        lastRev: 0, bases: {}, lastSyncAt: null });
      setStatus('idle');
    } catch (err) {
      setError((err as Error).message);
      setStatus(stateRef.current ? 'error' : 'off');
      throw err;
    }
  }, [mode, platform]);

  const pendingChanges = () => stateRef.current ? collectChanges(toEntities(latest(), !unsupported.current.has('habits'), !unsupported.current.has('backlog'), !unsupported.current.has('notemeta'), true), stateRef.current,
    !unsupported.current.has('habits') && !uneditedRecoveredHabits.has(vaultRef.current.habits),
    !unsupported.current.has('backlog') && !uneditedRecoveredBacklog.has(vaultRef.current.backlog),
    !unsupported.current.has('notemeta') && !uneditedRecoveredNoteMeta.has(vaultRef.current.notemeta),
    true).length : 0;

  const signOut = async (opts?: { force?: boolean }): Promise<'done' | 'needs-confirm' | 'needs-confirm-unreachable'> => {
    if (mode === 'local-web') return 'done';
    if (mode === 'server') {
      let failed = false;
      try { await run(); } catch { failed = true; }
      if (blocked.current && !closing.current) { await wipeAndLeave(); return 'done'; }
      if (!opts?.force && failed) return 'needs-confirm-unreachable';
      if (!opts?.force && pendingChanges() > 0) return 'needs-confirm';
    }
    closing.current = true;
    epoch.current++;
    let logoutFailed = false;
    if (mode === 'server' || stateRef.current) await tokenManager().signOut().catch(() => {
      logoutFailed = true;
      if (mode === 'server') document.cookie = 'daymark_signed_in=; Max-Age=0; Path=/';
    });
    await running.current?.catch(() => undefined);
    manager.current = null;
    if (mode === 'server') {
      if (logoutFailed) localStorage.setItem(LOGOUT_PENDING_KEY, '1');
      await wipeLocalVault();
      location.replace('/');
    }
    else {
      await persistState(null);
      blocked.current = false;
      setError(null);
      setStatus('off');
    }
    return 'done';
  };

  return {
    status, mode,
    account: state ? { serverUrl: state.serverUrl, username: state.username, deviceName: state.deviceName } : null,
    lastSyncAt: state?.lastSyncAt ?? null, error, connect,
    disconnect: async () => { await signOut(); },
    signOut, pendingChanges, authFetch, syncNow: run,
    rebaseAfterReplace: () => {
      if (!stateRef.current) return;
      epoch.current++;
      void persistState(rebaseAfterVaultReplace(stateRef.current));
    },
  };
}
