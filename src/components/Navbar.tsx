export type NavSyncStatus = 'off' | 'synced' | 'syncing' | 'offline' | 'error';

export const SYNC_LABELS: Record<NavSyncStatus, { dot: string; label: string }> = {
  off: { dot: 'bg-stone-400', label: 'Not synced' },
  synced: { dot: 'bg-emerald-500', label: 'Synced' },
  syncing: { dot: 'bg-amber-500 animate-pulse', label: 'Syncing' },
  offline: { dot: 'bg-amber-500', label: 'Offline' },
  error: { dot: 'bg-rose-500', label: 'Sync problem' },
};
