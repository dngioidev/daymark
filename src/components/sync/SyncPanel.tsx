import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, CloudOff, Loader2, RefreshCw } from 'lucide-react';
import { UseSyncResult } from '../../hooks/useSync';
import { formatDateTime } from '../../utils/dateFormat';
import { buttonClass } from '../ui/Dialog';
import { alertDialog, confirmDialog } from '../ui/feedback';

interface SyncPanelProps {
  sync: UseSyncResult;
  defaultDeviceName: string;
}

export function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return formatDateTime(iso);
}

const inputClass =
  'w-full min-h-11 px-3 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-[15px] sm:text-sm text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-amber-500 placeholder:text-stone-500';
const labelClass = 'block text-sm font-semibold text-stone-800 dark:text-stone-200 mb-1';

/** Connect to / manage the self-hosted sync server. */
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

  if (sync.mode === 'local-web') return (
    <p className="text-sm text-stone-600 dark:text-stone-400">
      Sign-in and sync work in the Daymark app served by your server, or in the Android app. On this page your notes stay in this browser; use Backup &amp; restore to move them.
    </p>
  );

  if (sync.mode === 'server' && !sync.account) return (
    <p role="status" className="text-sm text-stone-600 dark:text-stone-400">{sync.error || 'Syncing…'}</p>
  );

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
          <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">Sync your devices</h3>
          <p className="text-stone-600 dark:text-stone-400 mt-1">
            Keep your phone and computer in step through a Daymark server you run yourself. What's on this device is kept and merged on the
            first sync.
          </p>
        </div>
        <div>
          <label htmlFor="sync-url" className={labelClass}>
            Server address
          </label>
          <input
            id="sync-url"
            className={inputClass}
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="e.g. http://192.168.1.10:3000"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            required
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="sync-user" className={labelClass}>
              Username
            </label>
            <input id="sync-user" className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" required />
          </div>
          <div>
            <label htmlFor="sync-pass" className={labelClass}>
              Password
            </label>
            <input id="sync-pass" className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
        </div>
        <div>
          <label htmlFor="sync-device" className={labelClass}>
            Name for this device
          </label>
          <input id="sync-device" className={inputClass} value={deviceName} onChange={(e) => setDeviceName(e.target.value)} required />
        </div>
        {sync.error && (
          <div role="alert" className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{sync.error}</span>
          </div>
        )}
        <button type="submit" disabled={busy} className={`${buttonClass.primary} w-full`}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {busy ? 'Connecting…' : 'Connect and sync'}
        </button>
      </form>
    );
  }

  const statusLine = {
    off: { icon: <CloudOff className="w-4 h-4 text-stone-500" />, text: 'Not syncing' },
    idle: { icon: <CheckCircle2 className="w-4 h-4 text-stone-700 dark:text-stone-400" />, text: `Up to date · synced ${relativeTime(sync.lastSyncAt)}` },
    syncing: { icon: <Loader2 className="w-4 h-4 text-amber-700 animate-spin" />, text: 'Syncing…' },
    offline: { icon: <CloudOff className="w-4 h-4 text-amber-700" />, text: 'Offline · changes are saved here and sync when you reconnect' },
    error: { icon: <AlertCircle className="w-4 h-4 text-rose-700" />, text: sync.error || 'Sync failed' },
  }[sync.status];

  return (
    <div className="space-y-3 text-sm">
      <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">Sync</h3>
      <div role="status" className="flex items-start gap-2 p-3 rounded-lg bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200">
        <span className="mt-0.5">{statusLine.icon}</span>
        <span>{statusLine.text}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-stone-600 dark:text-stone-400">Server</dt>
        <dd className="break-all text-stone-900 dark:text-stone-100">{sync.account.serverUrl}</dd>
        <dt className="text-stone-600 dark:text-stone-400">Account</dt>
        <dd className="text-stone-900 dark:text-stone-100">{sync.account.username}</dd>
        <dt className="text-stone-600 dark:text-stone-400">This device</dt>
        <dd className="text-stone-900 dark:text-stone-100">{sync.account.deviceName}</dd>
      </dl>
      <div className="flex flex-col sm:flex-row gap-2">
        <button type="button" onClick={() => { void sync.syncNow().catch(() => undefined); }} disabled={sync.status === 'syncing'} className={`${buttonClass.primary} flex-1`}>
          <RefreshCw className={`w-4 h-4 ${sync.status === 'syncing' ? 'animate-spin' : ''}`} /> Sync now
        </button>
        <button
          type="button"
          onClick={async () => {
            if (sync.mode === 'server') {
              setBusy(true);
              try {
                const result = await sync.signOut();
                if (result !== 'done') {
                  const ok = await confirmDialog({
                    title: 'Sign out?',
                    message: result === 'needs-confirm-unreachable'
                      ? `The server could not be reached. ${sync.pendingChanges()} change(s) haven't reached the server and will be deleted from this browser.`
                      : `${sync.pendingChanges()} change(s) haven't reached the server and will be deleted from this browser.`,
                    cancelLabel: 'Cancel',
                    confirmLabel: 'Sign out anyway',
                    danger: true,
                  });
                  if (ok) await sync.signOut({ force: true });
                }
              } catch (err) {
                await alertDialog('Could not sign out', err instanceof Error ? err.message : 'Please try signing out again.');
              } finally { setBusy(false); }
              return;
            }
            const ok = await confirmDialog({
              title: 'Stop syncing this device?',
              message: 'Everything stays on this device, and the server keeps its copy.',
              confirmLabel: 'Disconnect',
            });
            if (ok) await sync.signOut();
          }}
          disabled={busy}
          className={`${buttonClass.secondary} flex-1`}
        >
          {sync.mode === 'server' ? 'Sign out' : 'Disconnect this device'}
        </button>
      </div>
    </div>
  );
};
