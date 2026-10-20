import React, { useCallback, useEffect, useState } from 'react';
import { HardDrive, KeyRound, Laptop, ListChecks, Smartphone, Terminal } from 'lucide-react';
import { UseSyncResult } from '../../hooks/useSync';
import { SyncPanel } from '../sync/SyncPanel';

interface ServerDashboardProps {
  sync: UseSyncResult;
  defaultDeviceName: string;
  /** Phone layout: single column, no outer page padding. */
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
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'never');

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

/** Server management for the account this device is connected to. */
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
        text: 'Password changed. Other devices are signed out and need to connect again with the new password; this device was signed out too, so connect again below.',
      });
      await sync.disconnect();
    } catch (err) {
      setPasswordMessage({ ok: false, text: (err as Error).message });
    }
  };

  const disconnectDevice = async (device: Device) => {
    if (!window.confirm(`Disconnect "${device.name}"? It stops syncing until it signs in again. Its local notes are not deleted.`)) return;
    try {
      await api(`/api/devices/${device.id}`, { method: 'DELETE' });
      await refresh();
    } catch (err) {
      setLoadError((err as Error).message);
    }
  };

  const layout = compact ? 'space-y-4' : 'w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-4 items-start';
  const input =
    'w-full min-h-[44px] px-3 py-2 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm';

  return (
    <div className={`${layout} text-stone-900 dark:text-stone-100`}>
      <div className={`${card} ${compact ? '' : 'lg:row-span-2'}`}>
        <SyncPanel sync={sync} defaultDeviceName={defaultDeviceName} />
      </div>

      {!sync.account && (
        <div className={card}>
          <h3 className="font-bold text-sm flex items-center gap-2 mb-2">
            <Terminal className="w-4 h-4 text-amber-600" /> Run your own server
          </h3>
          <p className="text-xs text-stone-600 dark:text-stone-300 mb-2">
            On any machine with Docker, in the Daymark folder, set a password and start it. Data is stored in <code>./data</code>.
          </p>
          <pre className="text-[11px] p-3 rounded-lg bg-stone-950 text-stone-100 overflow-x-auto">{`DAYMARK_PASSWORD='choose-a-strong-one' docker compose up -d`}</pre>
          <p className="text-xs text-stone-600 dark:text-stone-300 mt-2">
            Then connect above with <code>http://&lt;that machine's IP&gt;:3000</code>. Use HTTPS (a reverse proxy) if the server is reachable from the internet.
          </p>
          <pre className="mt-2 text-[11px] p-3 rounded-lg bg-stone-950 text-stone-100 overflow-x-auto">{COMPOSE}</pre>
        </div>
      )}

      {sync.account && (
        <>
          {loadError && (
            <div role="alert" className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 text-xs">
              {loadError}
            </div>
          )}

          <div className={card}>
            <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
              <HardDrive className="w-4 h-4 text-amber-600" /> On the server
            </h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ['Daily notes', stats?.dailyNotes],
                ['Notes', stats?.notes],
                ['Devices', stats?.devices],
              ].map(([label, value]) => (
                <div key={label as string} className="p-2 rounded-lg bg-stone-50 dark:bg-stone-800/50">
                  <div className="text-lg font-bold">{value ?? '–'}</div>
                  <div className="text-[11px] text-stone-500">{label}</div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-stone-500 mt-2">
              Last sync from any device: {fmt(stats?.lastSyncAt ?? null)} · server v{stats?.version ?? '?'}
            </p>
          </div>

          <div className={card}>
            <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
              <Smartphone className="w-4 h-4 text-amber-600" /> Connected devices
            </h3>
            <ul className="divide-y divide-stone-100 dark:divide-stone-800">
              {devices.map((d) => (
                <li key={d.id} className="py-2 flex items-center gap-3">
                  {d.platform === 'android' ? <Smartphone className="w-4 h-4 text-stone-400 shrink-0" /> : <Laptop className="w-4 h-4 text-stone-400 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {d.name} {d.current && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200">this device</span>}
                    </div>
                    <div className="text-[11px] text-stone-500">Last sync {fmt(d.lastSyncAt)}</div>
                  </div>
                  {!d.current && (
                    <button
                      type="button"
                      onClick={() => disconnectDevice(d)}
                      className="min-h-[36px] px-3 text-xs rounded-lg border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800"
                    >
                      Disconnect
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className={card}>
            <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
              <ListChecks className="w-4 h-4 text-amber-600" /> Recent activity
            </h3>
            {log.length === 0 ? (
              <p className="text-xs text-stone-500">No activity yet.</p>
            ) : (
              <ul className="space-y-1.5 max-h-72 overflow-y-auto">
                {log.slice(0, 30).map((entry) => (
                  <li key={entry.id} className="text-xs">
                    <span className="text-stone-500">{new Date(entry.timestamp).toLocaleString()} · {entry.deviceName}</span>
                    <div className="text-stone-800 dark:text-stone-200">{entry.details}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form onSubmit={changePassword} className={`${card} space-y-2`}>
            <h3 className="font-bold text-sm flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-600" /> Change server password
            </h3>
            <input className={input} type="password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            <input className={input} type="password" placeholder="New password (8+ characters)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required />
            {passwordMessage && (
              <p role="status" className={`text-xs ${passwordMessage.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                {passwordMessage.text}
              </p>
            )}
            <button type="submit" className="w-full min-h-[44px] rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-semibold">
              Change password
            </button>
          </form>
        </>
      )}
    </div>
  );
};
