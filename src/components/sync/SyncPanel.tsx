import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, CloudOff, Loader2, RefreshCw, Server } from 'lucide-react';
import { UseSyncResult } from '../../hooks/useSync';

interface SyncPanelProps {
  sync: UseSyncResult;
  defaultDeviceName: string;
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleString();
}

const inputClass =
  'w-full min-h-[44px] px-3 py-2 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-sm text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-amber-500';

/** Connect to / manage the self-hosted sync server. Used on the phone Sync tab and in Settings. */
export const SyncPanel: React.FC<SyncPanelProps> = ({ sync, defaultDeviceName }) => {
  const [serverUrl, setServerUrl] = useState(() =>
    typeof window !== 'undefined' && /^https?:/.test(window.location.origin) && !window.location.hostname.endsWith('localhost')
      ? window.location.origin
      : ''
  );
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [deviceName, setDeviceName] = useState(defaultDeviceName);
  const [busy, setBusy] = useState(false);

  if (!sync.account) {
    const submit = async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      try {
        await sync.connect(serverUrl, username, password, deviceName);
        setPassword('');
      } catch {
        // error is shown from sync.error
      } finally {
        setBusy(false);
      }
    };
    return (
      <form onSubmit={submit} className="space-y-3 text-sm">
        <div>
          <h3 className="font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <Server className="w-4 h-4 text-amber-600" /> Sync with your own server
          </h3>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
            Keep your phone and computer in step through a Daymark server you run yourself. Your notes on this device
            are kept and merged with the server on the first sync.
          </p>
        </div>
        <label className="block">
          <span className="block text-xs font-semibold text-stone-600 dark:text-stone-300 mb-1">Server address</span>
          <input
            className={inputClass}
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="e.g. http://192.168.1.10:3000"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            required
          />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-semibold text-stone-600 dark:text-stone-300 mb-1">Username</span>
            <input className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" required />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-stone-600 dark:text-stone-300 mb-1">Password</span>
            <input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
        </div>
        <label className="block">
          <span className="block text-xs font-semibold text-stone-600 dark:text-stone-300 mb-1">Name for this device</span>
          <input className={inputClass} value={deviceName} onChange={(e) => setDeviceName(e.target.value)} required />
        </label>
        {sync.error && (
          <div role="alert" className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{sync.error}</span>
          </div>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full min-h-[44px] rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-semibold flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {busy ? 'Connecting…' : 'Connect and sync'}
        </button>
        <p className="text-[11px] text-stone-500">
          No server yet? See the self-hosting guide in the project README (one Docker command).
        </p>
      </form>
    );
  }

  const statusLine = {
    off: { icon: <CloudOff className="w-4 h-4 text-stone-400" />, text: 'Not syncing' },
    idle: { icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />, text: `Up to date · synced ${relativeTime(sync.lastSyncAt)}` },
    syncing: { icon: <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />, text: 'Syncing…' },
    offline: { icon: <CloudOff className="w-4 h-4 text-amber-600" />, text: `Offline · changes are saved here and sync when you reconnect` },
    error: { icon: <AlertCircle className="w-4 h-4 text-rose-600" />, text: sync.error || 'Sync failed' },
  }[sync.status];

  return (
    <div className="space-y-3 text-sm">
      <h3 className="font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
        <Server className="w-4 h-4 text-amber-600" /> Self-hosted sync
      </h3>
      <div role="status" className="flex items-start gap-2 p-3 rounded-lg bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 text-xs text-stone-700 dark:text-stone-200">
        {statusLine.icon}
        <span>{statusLine.text}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-stone-500">Server</dt>
        <dd className="font-mono break-all text-stone-800 dark:text-stone-200">{sync.account.serverUrl}</dd>
        <dt className="text-stone-500">Account</dt>
        <dd className="text-stone-800 dark:text-stone-200">{sync.account.username}</dd>
        <dt className="text-stone-500">This device</dt>
        <dd className="text-stone-800 dark:text-stone-200">{sync.account.deviceName}</dd>
      </dl>
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={sync.syncNow}
          disabled={sync.status === 'syncing'}
          className="flex-1 min-h-[44px] rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-semibold flex items-center justify-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${sync.status === 'syncing' ? 'animate-spin' : ''}`} /> Sync now
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Stop syncing this device? Notes stay on this device; the server keeps its copy.')) void sync.disconnect();
          }}
          className="flex-1 min-h-[44px] rounded-lg border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 font-medium"
        >
          Disconnect this device
        </button>
      </div>
    </div>
  );
};
