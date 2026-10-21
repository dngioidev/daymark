import { useCallback, useEffect, useRef, useState } from 'react';
import { canonicalJson } from '../sync/merge';
import { applySyncOutcome, login, rebaseAfterVaultReplace, SyncHttpError, SyncState, syncOnce, VaultData } from '../sync/syncClient';
import { loadSyncState, saveSyncState } from '../utils/vaultStore';

/** Random id kept for the lifetime of this install (lets the server recognise a repeat sign-in). */
function getInstallId(): string {
  const KEY = 'daymark_install_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `inst-${crypto.randomUUID()}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

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
  connect: (serverUrl: string, username: string, password: string, deviceName: string) => Promise<void>;
  disconnect: () => Promise<void>;
  syncNow: () => void;
  /** Call right after the whole local vault was replaced (restore, sample data). */
  rebaseAfterReplace: () => void;
  token: string | null;
}

const AUTO_SYNC_DEBOUNCE_MS = 2500;
const PERIODIC_SYNC_MS = 60_000;

/**
 * Keeps the local vault in sync with the self-hosted server: syncs on start, a moment after
 * every local change, when the device comes back online or to the foreground, and every minute.
 * `onVaultChange` receives the merged vault and must apply it to app state.
 */
export function useSync(
  vault: VaultData,
  onVaultChange: (next: VaultData) => void,
  onConflicts: (messages: string[]) => void,
  platform: string
): UseSyncResult {
  const [state, setState] = useState<SyncState | null>(loadSyncState);
  const [status, setStatus] = useState<SyncStatus>(state ? 'idle' : 'off');
  const [error, setError] = useState<string | null>(null);

  const vaultRef = useRef(vault);
  vaultRef.current = vault;
  const stateRef = useRef(state);
  stateRef.current = state;
  const callbacks = useRef({ onVaultChange, onConflicts });
  callbacks.current = { onVaultChange, onConflicts };
  const running = useRef(false);
  const rerun = useRef(false);
  const blocked = useRef(false); // set after the server rejected our token
  const epoch = useRef(0); // bumped when the vault is replaced; stale in-flight results are dropped

  const persistState = (next: SyncState | null) => {
    stateRef.current = next;
    setState(next);
    saveSyncState(next);
  };

  const run = useCallback(async () => {
    const current = stateRef.current;
    if (!current || blocked.current) return;
    if (running.current) {
      rerun.current = true;
      return;
    }
    running.current = true;
    setStatus('syncing');
    try {
      do {
        rerun.current = false;
        const startedAt = epoch.current;
        const outcome = await syncOnce(fetch, vaultRef.current, stateRef.current!);
        if (startedAt !== epoch.current) {
          // The vault was replaced while this round was in flight: start over from fresh bases
          rerun.current = true;
          continue;
        }
        if (outcome.serverValues.size > 0) {
          const before = vaultRef.current;
          const next = applySyncOutcome(before, outcome);
          const changed =
            canonicalJson(next.docs) !== canonicalJson(before.docs) ||
            canonicalJson(next.notes) !== canonicalJson(before.notes) ||
            canonicalJson(next.settings) !== canonicalJson(before.settings);
          if (changed) {
            vaultRef.current = next;
            callbacks.current.onVaultChange(next);
          }
        }
        persistState(outcome.state);
        if (outcome.conflicts.length) callbacks.current.onConflicts(outcome.conflicts);
      } while (rerun.current);
      setError(null);
      setStatus('idle');
    } catch (err) {
      const e = err as SyncHttpError;
      if (e.status === 401) {
        blocked.current = true;
        setError('This device was signed out by the server. Connect again to resume syncing.');
        setStatus('error');
      } else if (e.status === 0 || !navigator.onLine) {
        setError(null);
        setStatus('offline');
      } else {
        setError(e.message || 'Sync failed.');
        setStatus('error');
      }
    } finally {
      running.current = false;
    }
  }, []);

  // Sync shortly after local changes (debounced)
  useEffect(() => {
    if (!state) return;
    const timer = setTimeout(run, AUTO_SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault.docs, vault.notes, vault.settings, state?.token]);

  // Start, reconnect, foreground and periodic triggers
  useEffect(() => {
    if (!state?.token) return;
    void run();
    const onVisible = () => document.visibilityState === 'visible' && void run();
    const interval = setInterval(run, PERIODIC_SYNC_MS);
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [state?.token, run]);

  const connect = useCallback(
    async (serverUrl: string, username: string, password: string, deviceName: string) => {
      setError(null);
      try {
        const session = await login(fetch, serverUrl, { username, password, deviceName, platform, installId: getInstallId() });
        blocked.current = false;
        // Fresh bases: the first sync merges this device's vault with the server's
        persistState({ ...session, lastRev: 0, bases: {}, lastSyncAt: null });
        setStatus('idle');
      } catch (err) {
        setError((err as Error).message);
        setStatus(stateRef.current ? 'error' : 'off');
        throw err;
      }
    },
    [platform]
  );

  const disconnect = useCallback(async () => {
    const current = stateRef.current;
    if (current) {
      // Best effort: tell the server to forget this device; local data stays untouched
      await fetch(`${current.serverUrl}/api/devices/${current.deviceId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${current.token}` },
      }).catch(() => undefined);
    }
    blocked.current = false;
    persistState(null);
    setError(null);
    setStatus('off');
  }, []);

  return {
    status,
    account: state ? { serverUrl: state.serverUrl, username: state.username, deviceName: state.deviceName } : null,
    lastSyncAt: state?.lastSyncAt ?? null,
    error,
    connect,
    disconnect,
    syncNow: () => {
      blocked.current = false;
      void run();
    },
    rebaseAfterReplace: () => {
      if (!stateRef.current) return;
      epoch.current++;
      persistState(rebaseAfterVaultReplace(stateRef.current));
    },
    token: state?.token ?? null,
  };
}
