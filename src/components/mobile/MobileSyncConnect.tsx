import React, { useState } from 'react';
import {
  Server,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Shield,
  Smartphone,
  ExternalLink,
  Wifi,
  WifiOff,
  Clock,
  ArrowRight,
  Key,
} from 'lucide-react';
import { AppSettings, DailyDocument, StandaloneNote } from '../../types/daymark';

interface MobileSyncConnectProps {
  settings: AppSettings;
  dailyDocs: DailyDocument[];
  notes: StandaloneNote[];
  onSaveSettings: (settings: AppSettings) => void;
  onSyncComplete: (serverDocs: DailyDocument[], serverNotes: StandaloneNote[]) => void;
}

export const MobileSyncConnect: React.FC<MobileSyncConnectProps> = ({
  settings,
  dailyDocs,
  notes,
  onSaveSettings,
  onSyncComplete,
}) => {
  const [serverUrl, setServerUrl] = useState(
    settings.syncConfig.serverUrl || `${window.location.origin}/api/sync`
  );
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('daymark2026');
  const [deviceName, setDeviceName] = useState(
    settings.syncConfig.deviceId || 'Mobile Client (Pixel 9 Pro)'
  );

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [serverStats, setServerStats] = useState<any>(null);

  const handleTestAndSync = async () => {
    setIsSyncing(true);
    setSyncStatus('idle');
    setStatusMessage('Connecting to self-hosted server...');

    try {
      // 1. Authenticate with server
      const authRes = await fetch(`${window.location.origin}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!authRes.ok) {
        throw new Error('Authentication failed: Invalid username or password');
      }

      const authData = await authRes.json();
      const token = authData.token;

      // 2. Perform bidirectional sync
      setStatusMessage('Sending mobile notes & reconciling rollover state...');
      const syncRes = await fetch(`${window.location.origin}/api/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          deviceId: deviceName,
          deviceName,
          dailyDocuments: dailyDocs,
          standaloneNotes: notes,
          settings,
        }),
      });

      if (!syncRes.ok) {
        throw new Error('Sync reconciliation failed on server');
      }

      const syncData = await syncRes.json();

      // Update local settings
      const updatedSettings = {
        ...settings,
        syncConfig: {
          ...settings.syncConfig,
          enabled: true,
          serverUrl,
          deviceId: deviceName,
          authToken: token,
          lastSyncAt: new Date().toISOString(),
          status: 'synced' as const,
        },
      };
      onSaveSettings(updatedSettings);

      if (syncData.serverDocuments && syncData.serverNotes) {
        onSyncComplete(syncData.serverDocuments, syncData.serverNotes);
      }

      setSyncStatus('success');
      setStatusMessage(
        `Synced with self-hosted server (${dailyDocs.length} daily notes, ${notes.length} standalone notes).`
      );

      // Fetch server stats
      const statsRes = await fetch(`${window.location.origin}/api/server/stats`);
      if (statsRes.ok) {
        setServerStats(await statsRes.json());
      }
    } catch (err: any) {
      console.error(err);
      setSyncStatus('error');
      setStatusMessage(err.message || 'Could not connect to self-hosted server.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="p-4 sm:p-5 max-w-lg mx-auto space-y-5 text-xs text-stone-800 dark:text-stone-200">
      {/* Title Card */}
      <div className="p-4 bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-2xs space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 flex items-center justify-center">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              Sync with Self-Hosted Web Server
            </h2>
            <p className="text-[11px] text-stone-500 dark:text-stone-400">
              Daymark is local-first. Connect your mobile app to your private server instance.
            </p>
          </div>
        </div>

        {/* Sync Status Badge */}
        <div className="pt-2 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between text-[11px]">
          <span className="text-stone-500">Connection Status:</span>
          <span className="inline-flex items-center gap-1 font-mono font-medium text-emerald-600 dark:text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
            <span>Self-Hosted Gateway Ready</span>
          </span>
        </div>
      </div>

      {/* Sync Credentials Form */}
      <div className="p-4 bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-2xs space-y-3.5">
        <div>
          <label className="block text-[11px] font-semibold text-stone-600 dark:text-stone-400 mb-1">
            Self-Hosted Server URL
          </label>
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg font-mono text-xs text-stone-900 dark:text-stone-100"
            placeholder="https://sync.yourdomain.com/api/sync"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-stone-600 dark:text-stone-400 mb-1">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg font-mono text-xs text-stone-900 dark:text-stone-100"
              placeholder="admin"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-stone-600 dark:text-stone-400 mb-1">
              Server Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg font-mono text-xs text-stone-900 dark:text-stone-100"
              placeholder="••••••••"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-stone-600 dark:text-stone-400 mb-1">
            Mobile Device Identifier
          </label>
          <input
            type="text"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            className="w-full px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-xs text-stone-900 dark:text-stone-100"
            placeholder="Pixel 9 Pro (Android)"
          />
        </div>

        {/* Sync Action Button */}
        <button
          onClick={handleTestAndSync}
          disabled={isSyncing}
          className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-xs"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Connecting & Reconciling...' : 'Sync Mobile Vault with Server'}</span>
        </button>

        {/* Feedback Alert */}
        {syncStatus === 'success' && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Sync Successful!</span>
              <p className="mt-0.5">{statusMessage}</p>
            </div>
          </div>
        )}

        {syncStatus === 'error' && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-lg border border-rose-200 dark:border-rose-800 text-[11px] text-rose-800 dark:text-rose-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Sync Failed</span>
              <p className="mt-0.5">{statusMessage}</p>
            </div>
          </div>
        )}
      </div>

      {/* Sync Architecture Info */}
      <div className="p-4 bg-stone-50 dark:bg-stone-800/40 rounded-2xl border border-stone-200 dark:border-stone-800 space-y-2 text-[11px]">
        <div className="font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-amber-600" />
          <span>How Mobile & Self-Hosted Web Sync Works</span>
        </div>
        <ul className="list-disc pl-4 space-y-1 text-stone-600 dark:text-stone-400">
          <li><strong>Local-First:</strong> All notes are stored locally on your device in plain Markdown. The mobile app never locks you out if offline.</li>
          <li><strong>Historical Completion Reconciled:</strong> Marking a task "Done on Oct 15" on mobile propagates cleanly to the server and stops carry-forward on other devices.</li>
          <li><strong>Zero Overwrite Risk:</strong> Deterministic task IDs and timestamp vector cursors resolve concurrent edits safely.</li>
        </ul>
      </div>
    </div>
  );
};
