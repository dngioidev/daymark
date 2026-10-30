// Test-only: exercises the real sync client and server without browser storage.
import fs from 'node:fs';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../../server/app';
import { loadConfig } from '../../../server/config';
import { FileStore } from '../../../server/store';
import { DEFAULT_SETTINGS } from '../../utils/defaultData';
import { signIn } from '../authClient';
import { SyncRequest, SyncResponse } from '../protocol';
import { applySyncOutcome, FetchLike, syncOnce, SyncOutcome, SyncState, VaultData } from '../syncClient';

export interface Device {
  name: string;
  vault: VaultData;
  edit(change: (v: VaultData) => VaultData): void;
  sync(opts?: { dropResponse?: boolean }): Promise<SyncOutcome>;
  online: boolean;
  authFetch(path: string, init?: RequestInit): Promise<Response>;
}

function defaultVault(): VaultData {
  return structuredClone({
    docs: [{ date: '2026-10-24', type: 'daily', headings: [], updatedAt: '2026-10-24T08:00:00Z' }],
    notes: [], settings: DEFAULT_SETTINGS,
    habits: {
      habits: [{ id: 'water', name: 'Water', order: 1, warnAfterDays: 3, addedOn: '2026-10-23', updatedAt: '2026-10-24T08:00:00Z' }],
      days: [
        { date: '2026-10-23', ticks: { water: { done: true, at: '2026-10-23T08:00:00Z' } } },
        { date: '2026-10-24', ticks: { water: { done: false, at: '2026-10-24T08:00:00Z' } } },
      ],
    },
    backlog: { items: [] }, notemeta: { folders: [], dismissed: [] },
  });
}

// alertDays is intentionally untyped here: this emulates a client predating that field.
function withoutAlertDays<T>(settings: T): T {
  if (!settings || typeof settings !== 'object') return settings;
  const copy = { ...settings } as T & { alertDays?: unknown };
  delete copy.alertDays;
  return copy;
}

export async function startSyncRig(): Promise<{
  dataDir: string;
  device(name: string, opts?: { legacy?: boolean }): Device;
  restartServer(): Promise<void>;
  stop(): Promise<void>;
}> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-sync-rig-'));
  const password = 'correct horse battery';
  const config = { ...loadConfig({ NODE_ENV: 'test' }), dataDir: dir, initialPassword: password };
  let server: Server;
  let base: string;
  let stopped = false;

  async function start() {
    const store = new FileStore(dir);
    store.init(config.username, config.initialPassword);
    server = createApp(config, store).listen(0);
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  const close = () => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
  try {
    await start();
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  }

  return {
    dataDir: dir,
    device(name, opts = {}) {
      let state: SyncState | undefined;
      let accessToken: string;
      const device: Device = {
        name, vault: defaultVault(), online: true,
        edit(change) { device.vault = change(device.vault); },
        async authFetch(path, init) {
          if (!device.online) throw new Error(`Device ${name} is offline.`);
          if (!state) await device.sync();
          const headers = new Headers(init?.headers);
          headers.set('Authorization', `Bearer ${accessToken}`);
          return fetch(base + path, { ...init, headers });
        },
        async sync(syncOpts = {}) {
          if (!device.online) throw new Error(`Device ${name} is offline.`);
          if (stopped) throw new Error('Sync rig is stopped.');
          // Lazy sign-in keeps device() synchronous and offline sync free of side effects.
          if (!state) {
            const login = await signIn(fetch, base, 'body', {
              username: config.username, password, deviceName: name, platform: 'test',
            });
            accessToken = login.accessToken;
            state = { serverUrl: base, username: login.username, deviceId: login.device.id,
              deviceName: name, lastRev: 0, bases: {}, lastSyncAt: null };
          }
          const fetcher: FetchLike = async (url, init) => {
            if (opts.legacy) {
              const body = JSON.parse(String(init?.body)) as SyncRequest;
              body.changes = body.changes.map(change => change.key === 'settings'
                ? { ...change, base: withoutAlertDays(change.base), value: withoutAlertDays(change.value) }
                : change);
              init = { ...init, body: JSON.stringify(body) };
            }
            const response = await fetch(url, init);
            if (syncOpts.dropResponse && response.ok) {
              // Consume the completed response, then fail before syncOnce can advance its bases.
              await response.arrayBuffer();
              throw new Error('Sync response dropped.');
            }
            if (!opts.legacy || !response.ok) return response;
            const body = await response.json() as SyncResponse;
            body.entities = body.entities.map(entity => entity.key === 'settings'
              ? { ...entity, value: withoutAlertDays(entity.value) } : entity);
            return Response.json(body);
          };
          const local = opts.legacy
            ? { ...device.vault, settings: withoutAlertDays(device.vault.settings) } : device.vault;
          const outcome = await syncOnce(fetcher, local, { ...state, serverUrl: base }, accessToken);
          const next = applySyncOutcome(device.vault, outcome);
          device.vault = opts.legacy ? { ...next, settings: withoutAlertDays(next.settings) } : next;
          state = outcome.state;
          return outcome;
        },
      };
      return device;
    },
    async restartServer() {
      if (stopped) throw new Error('Sync rig is stopped.');
      await close();
      await start();
    },
    async stop() {
      if (stopped) return;
      await close();
      stopped = true;
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
