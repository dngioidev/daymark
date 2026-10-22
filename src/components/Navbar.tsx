import React from 'react';
import { Calendar, FileText, FolderOpen, Plus, Settings, Smartphone } from 'lucide-react';
import { ViewTab } from '../types/daymark';

export type NavSyncStatus = 'off' | 'synced' | 'syncing' | 'offline' | 'error';

interface NavbarProps {
  activeTab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
  onOpenQuickCapture: () => void;
  onOpenSettings: () => void;
  /** Opens Settings on the Sync tab. */
  onOpenSync: () => void;
  onSwitchToMobileApp: () => void;
  /** Developer-only extras (phone preview, code samples). */
  showDevTabs?: boolean;
  syncStatus: NavSyncStatus;
  carriedAlertCount: number;
}

export const SYNC_LABELS: Record<NavSyncStatus, { dot: string; label: string }> = {
  off: { dot: 'bg-stone-400', label: 'Not synced' },
  synced: { dot: 'bg-emerald-500', label: 'Synced' },
  syncing: { dot: 'bg-amber-500 animate-pulse', label: 'Syncing' },
  offline: { dot: 'bg-amber-500', label: 'Offline' },
  error: { dot: 'bg-rose-500', label: 'Sync problem' },
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  onOpenQuickCapture,
  onOpenSettings,
  onOpenSync,
  onSwitchToMobileApp,
  showDevTabs = false,
  syncStatus,
  carriedAlertCount,
}) => {
  const link = (tab: ViewTab, icon: React.ReactNode, label: string, extra?: React.ReactNode) => (
    <button
      type="button"
      onClick={() => onTabChange(tab)}
      aria-current={activeTab === tab ? 'page' : undefined}
      className={`flex items-center gap-1.5 min-h-9 px-3 rounded-lg whitespace-nowrap ${
        activeTab === tab
          ? 'bg-accent text-accent-fg font-semibold'
          : 'hover:underline underline-offset-4'
      }`}
    >
      {icon}
      <span>{label}</span>
      {extra}
    </button>
  );

  const sync = SYNC_LABELS[syncStatus];

  return (
    <header className="sticky top-0 z-40 bg-[var(--dm-header-bg)] text-[var(--dm-header-fg)] backdrop-blur-md border-b border-stone-200 dark:border-stone-800">
      <div className="w-full max-w-[1800px] mx-auto flex items-center gap-3 lg:gap-6 px-4 sm:px-6 lg:px-8 py-2">
        <button
          type="button"
          onClick={() => onTabChange('today')}
          className="text-lg font-bold tracking-tight flex items-center gap-2 shrink-0"
        >
          <span className="w-3 h-3 rounded-sm bg-amber-600 dark:bg-amber-500" aria-hidden="true" />
          Daymark
        </button>

        <nav aria-label="Main" className="flex items-center gap-1 text-sm font-medium">
          {link(
            'today',
            <Calendar className="w-4 h-4" />,
            'Today',
            carriedAlertCount > 0 && (
              <span
                title={`${carriedAlertCount} ${carriedAlertCount === 1 ? 'task needs' : 'tasks need'} attention`}
                aria-label={`${carriedAlertCount} ${carriedAlertCount === 1 ? 'task needs' : 'tasks need'} attention`}
                className="inline-flex items-center justify-center min-w-5 h-5 px-1 text-xs font-bold text-amber-950 bg-amber-200 dark:bg-amber-900 dark:text-amber-100 rounded-full"
              >
                {carriedAlertCount}
              </span>
            )
          )}
          {link('history', <FileText className="w-4 h-4" />, 'History')}
          {link('notes', <FolderOpen className="w-4 h-4" />, 'Notes')}
          {showDevTabs && link('mobile-code', <Smartphone className="w-4 h-4" />, 'Mobile & Code')}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onOpenSync}
            aria-label={`Sync: ${sync.label}. Open sync settings`}
            className="inline-flex items-center gap-1.5 min-h-9 px-2.5 rounded-lg text-sm hover:underline underline-offset-4"
          >
            <span className={`w-2 h-2 rounded-full ${sync.dot}`} aria-hidden="true" />
            <span className="hidden lg:inline">{sync.label}</span>
          </button>
          {showDevTabs && (
            <button
              type="button"
              onClick={onSwitchToMobileApp}
              aria-label="Phone layout preview"
              title="Phone layout preview"
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg hover:underline underline-offset-4"
            >
              <Smartphone className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Settings"
            title="Settings"
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg hover:underline underline-offset-4"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onOpenQuickCapture}
            aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
            className="inline-flex items-center gap-1.5 min-h-9 px-3 text-sm font-semibold rounded-lg bg-accent text-accent-fg hover:brightness-95 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>New task</span>
            <kbd className="hidden lg:inline ml-1 px-1 rounded bg-black/10 text-xs font-sans">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
          </button>
        </div>
      </div>
    </header>
  );
};
