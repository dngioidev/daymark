import React from 'react';
import { Archive, Calendar, CalendarDays, FolderOpen, Plus, Search, Settings } from 'lucide-react';
import type { ViewTab } from '../types/daymark';
import { SYNC_LABELS, type NavSyncStatus } from './Navbar';

interface SideRailProps {
  activeTab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
  onOpenQuickCapture: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenSync: () => void;
  syncStatus: NavSyncStatus;
  carriedAlertCount: number;
  todayLabel: string;
  side: 'left' | 'right';
  hidden?: boolean;
}

/** Six equal destinations keep desktop navigation visible as the page scrolls. */
export const SideRail: React.FC<SideRailProps> = ({ activeTab, onTabChange, onOpenQuickCapture, onOpenSearch, onOpenSettings, onOpenSync, syncStatus, carriedAlertCount, todayLabel, side, hidden }) => {
  if (hidden) return null;
  const sync = SYNC_LABELS[syncStatus];
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const part = 'min-h-0 flex flex-col items-center justify-center gap-2 border-t border-current/15 px-2 text-sm font-medium hover:underline underline-offset-4';
  const page = (tab: ViewTab, icon: React.ReactNode, label: string) => (
    <button type="button" data-rail-part={tab} aria-current={activeTab === tab ? 'page' : undefined}
      onClick={() => onTabChange(tab)} className={`${part} ${activeTab === tab ? 'bg-accent text-accent-fg font-semibold' : ''}`}>
      {icon}<span className="flex items-center gap-1.5">{label}
        {tab === 'today' && carriedAlertCount > 0 && <span aria-label={`${carriedAlertCount} ${carriedAlertCount === 1 ? 'task needs' : 'tasks need'} attention`} className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-amber-200 text-amber-950 text-xs font-bold">{carriedAlertCount}</span>}
      </span>
    </button>
  );
  return (
    <nav aria-label="Main" data-side={side} style={{ gridTemplateRows: 'repeat(6, minmax(0, 1fr))' }}
      className={`dm-side-rail sticky top-0 z-40 grid h-dvh w-[168px] shrink-0 self-start bg-[var(--dm-header-bg)] text-[var(--dm-header-fg)] backdrop-blur-md ${side === 'right' ? 'order-last border-l' : 'border-r'} border-stone-200 dark:border-stone-800`}>
      <div data-rail-part="title" className="min-h-0 flex flex-col justify-start overflow-y-auto px-2 py-1 text-center">
        <span className="shrink-0 font-bold tracking-tight text-base leading-5">Daymark</span>
        <span className="shrink-0 text-[10px] leading-4 truncate" title={todayLabel}>{todayLabel}</span>
        <button type="button" onClick={onOpenSync} aria-label={`Sync: ${sync.label}. Open sync settings`} className="shrink-0 inline-flex justify-center items-center gap-1 text-[11px] leading-4 hover:underline">
          <span className={`w-1.5 h-1.5 rounded-full ${sync.dot}`} aria-hidden="true" />{sync.label}
        </button>
        <button type="button" onClick={onOpenQuickCapture} aria-keyshortcuts="Control+K Meta+K" className="shrink-0 mt-1 inline-flex items-center justify-center gap-1 min-h-7 rounded-lg bg-accent text-accent-fg text-xs font-semibold hover:brightness-95">
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />New task <kbd className="text-[10px] font-sans opacity-80">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
        <button type="button" onClick={onOpenSearch} aria-label="Search (Ctrl Shift F)" aria-keyshortcuts="Control+Shift+F Meta+Shift+F" className="shrink-0 inline-flex items-center justify-center gap-1 min-h-6 text-xs hover:underline"><Search className="w-3 h-3" aria-hidden="true" />Search</button>
      </div>
      {page('today', <Calendar className="w-5 h-5" aria-hidden="true" />, 'Today')}
      {page('calendar', <CalendarDays className="w-5 h-5" aria-hidden="true" />, 'Calendar')}
      {page('notes', <FolderOpen className="w-5 h-5" aria-hidden="true" />, 'Notes')}
      {page('backlog', <Archive className="w-5 h-5" aria-hidden="true" />, 'Backlog')}
      <button type="button" data-rail-part="settings" onClick={onOpenSettings} className={part}><Settings className="w-5 h-5" aria-hidden="true" /><span>Settings</span></button>
    </nav>
  );
};
