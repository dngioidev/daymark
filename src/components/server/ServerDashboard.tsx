import React, { useCallback, useEffect, useState } from 'react';
import { HardDrive, HelpCircle, KeyRound, Laptop, ListChecks, Smartphone } from 'lucide-react';
import { UseSyncResult } from '../../hooks/useSync';
import { SyncPanel, relativeTime } from '../sync/SyncPanel';
import { formatDateTime } from '../../utils/dateFormat';
import { buttonClass } from '../ui/Dialog';
import { confirmDialog } from '../ui/feedback';

interface ServerDashboardProps {
  sync: UseSyncResult;
  defaultDeviceName: string;
  /** Single column, no outer page padding (Settings dialog). */
  compact?: boolean;
}

interface Stats {
  version: string;
  dailyNotes: number;
  notes: number;
  devices: number;
  lastSyncAt: string | null;
}
interface Device {
  id: string;
  name: string;
  platform: string;
  lastSyncAt: string | null;
  lastIp: string;
  current: boolean;
}
interface LogEntry {
  id: string;
  timestamp: string;
  deviceName: string;
  action: string;
  details: string;
}

const card = 'p-4 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800';
const heading = 'text-base font-semibold flex items-center gap-2 mb-3';

const COMPOSE = `services:
  daymark:
    build: .            # or: image: <your registry>/daymark
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      DAYMARK_USER: admin
      DAYMARK_PASSWORD: \${DAYMARK_PASSWORD}   # first start only
    volumes:
      - ./data:/data`;

/** Server log lines in everyday words: "Pushed 9 change(s), received 9; 4 conflict(s) resolved" -> "Sent 9 · received 9 · merged 4 edits". */
export function describeLogEntry(details: string): string {
  const sync = details.match(/^Pushed (\d+) change\(s\), received (\d+)(?:; (\d+) conflict\(s\) resolved)?/);
  if (sync) {
    const [, sent, received, merged] = sync;
    return [`Sent ${sent}`, `received ${received}`, merged ? `merged ${merged} ${merged === '1' ? 'edit' : 'edits'}` : ''].filter(Boolean).join(' · ');
  }
  return details.replace(/^Signed in \((\w+)\)$/, (_m, p) => `Signed in (${p === 'android' ? 'Android app' : p === 'web' ? 'browser' : p})`);
}

const platformLabel = (p: string) => (p === 'android' ? 'Android app' : p === 'web' ? 'Browser' : p);

/** Sync connection plus management of the server this device is connected to. */
export const ServerDashboard: React.FC<ServerDashboardProps> = ({ sync, defaultDeviceName, compact }) => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const api = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const res = await fetch(`${sync.account!.serverUrl}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sync.token}`, ...init.headers },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
      return data;
    },
    [sync.account, sync.token]
  );

  const refresh = useCallback(async () => {
    if (!sync.account || !sync.token) return;
    try {
      const [s, d, l] = await Promise.all([api('/api/server/stats'), api('/api/devices'), api('/api/sync/log')]);
      setStats(s);
      setDevices(d.devices);
      setLog(l.entries);
      setLoadError(null);
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, [api, sync.account, sync.token]);

  useEffect(() => {
    void refresh();
  }, [refresh, sync.lastSyncAt]);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);
    try {
      await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
      setCurrentPassword('');
      setNewPassword('');
      setPasswordMessage({
        ok: true,
        text: 'Password changed. Every device, including this one, was signed out; connect again with the new password.',
      });
      await sync.disconnect();
    } catch (err) {
      setPasswordMessage({ ok: false, text: (err as Error).message });
    }
  };

  const disconnectDevice = async (device: Device) => {
    const ok = await confirmDialog({
      title: `Disconnect “${device.name}”?`,
      message: 'It stops syncing until it signs in again. Nothing on that device is deleted.',
      confirmLabel: 'Disconnect',
    });
    if (!ok) return;
    try {
      await api(`/api/devices/${device.id}`, { method: 'DELETE' });
      await refresh();
    } catch (err) {
      setLoadError((err as Error).message);
    }
  };

  const layout = compact ? 'space-y-4' : 'w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-2 gap-4 items-start';
  const input =
    'w-full min-h-11 px-3 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-[15px] sm:text-sm placeholder:text-stone-500';

  return (
    <div className={`${layout} text-sm text-stone-900 dark:text-stone-100`}>
      <div className={card}>
        <SyncPanel sync={sync} defaultDeviceName={defaultDeviceName} />
      </div>

      {!sync.account && (
        <details className={`${card} group`}>
          <summary className="flex items-center gap-2 min-h-11 cursor-pointer font-semibold list-none">
            <HelpCircle className="w-4 h-4 text-stone-600 dark:text-stone-400" /> Don't have a server? How to set one up
          </summary>
          <div className="mt-2 space-y-2 text-stone-700 dark:text-stone-300">
            <p>
              On a computer that is always on (a home server, NAS or small cloud machine) with Docker installed, open the Daymark folder, choose a
              password and run:
            </p>
            <pre className="text-xs p-3 rounded-lg bg-stone-950 text-stone-100 overflow-x-auto">{`DAYMARK_PASSWORD='choose-a-strong-one' docker compose up -d`}</pre>
            <p>
              Then connect above with <code>http://&lt;that computer's address&gt;:3000</code>. Put it behind HTTPS if it's reachable from the
              internet. Data is stored in <code>./data</code>. Example <code>docker-compose.yml</code>:
            </p>
            <pre className="text-xs p-3 rounded-lg bg-stone-950 text-stone-100 overflow-x-auto">{COMPOSE}</pre>
          </div>
        </details>
      )}

      {sync.account && (
        <>
          {loadError && (
            <div role="alert" className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200">
              {loadError}
            </div>
          )}

          <div className={card}>
            <h3 className={heading}>
              <Smartphone className="w-4 h-4 text-stone-600 dark:text-stone-400" /> Devices
            </h3>
            <ul className="divide-y divide-stone-100 dark:divide-stone-800">
              {devices.map((d) => (
                <li key={d.id} className="py-2 flex items-center gap-3">
                  {d.platform === 'android' ? (
                    <Smartphone className="w-4 h-4 text-stone-500 shrink-0" />
                  ) : (
                    <Laptop className="w-4 h-4 text-stone-500 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">
                      {d.name}
                      {d.current && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-900 dark:text-emerald-200">
                          This device
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-stone-600 dark:text-stone-400">
                      {platformLabel(d.platform)} · last sync {relativeTime(d.lastSyncAt)}
                    </div>
                  </div>
                  {!d.current && (
                    <button type="button" onClick={() => disconnectDevice(d)} className={buttonClass.secondary}>
                      Disconnect
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className={card}>
            <h3 className={heading}>
              <HardDrive className="w-4 h-4 text-stone-600 dark:text-stone-400" /> On the server
            </h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ['Days', stats?.dailyNotes],
                ['Notes', stats?.notes],
                ['Devices', stats?.devices],
              ].map(([label, value]) => (
                <div key={label as string} className="p-2 rounded-lg bg-stone-50 dark:bg-stone-800/50">
                  <div className="text-lg font-bold">{value ?? '–'}</div>
                  <div className="text-xs text-stone-600 dark:text-stone-400">{label}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-2">
              Last sync from any device: {relativeTime(stats?.lastSyncAt ?? null)} · server {stats?.version ?? '?'}
            </p>
          </div>

          <div className={card}>
            <h3 className={heading}>
              <ListChecks className="w-4 h-4 text-stone-600 dark:text-stone-400" /> Recent activity
            </h3>
            {log.length === 0 ? (
              <p className="text-stone-600 dark:text-stone-400">No activity yet.</p>
            ) : (
              <ul className="space-y-2 max-h-72 overflow-y-auto">
                {log.slice(0, 30).map((entry) => (
                  <li key={entry.id}>
                    <div className="text-xs text-stone-600 dark:text-stone-400">
                      {formatDateTime(entry.timestamp)} · {entry.deviceName}
                    </div>
                    <div>{describeLogEntry(entry.details)}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form onSubmit={changePassword} className={`${card} space-y-2`}>
            <h3 className={heading}>
              <KeyRound className="w-4 h-4 text-stone-600 dark:text-stone-400" /> Change server password
            </h3>
            <label htmlFor="pw-current" className="sr-only">
              Current password
            </label>
            <input id="pw-current" className={input} type="password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            <label htmlFor="pw-new" className="sr-only">
              New password
            </label>
            <input id="pw-new" className={input} type="password" placeholder="New password (8+ characters)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required />
            {passwordMessage && (
              <p role="status" className={passwordMessage.ok ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}>
                {passwordMessage.text}
              </p>
            )}
            <button type="submit" className={`${buttonClass.secondary} w-full`}>
              Change password
            </button>
          </form>
        </>
      )}
    </div>
  );
};
