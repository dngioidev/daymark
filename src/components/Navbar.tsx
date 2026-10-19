import React from 'react';
import {
  Calendar,
  FileText,
  FolderOpen,
  Smartphone,
  Settings,
  Plus,
  Server,
  HardDriveDownload,
  Monitor,
} from 'lucide-react';
import { ViewTab } from '../types/daymark';

interface NavbarProps {
  activeTab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
  onOpenQuickCapture: () => void;
  onOpenSettings: () => void;
  onExportZip: () => void;
  onSwitchToMobileApp: () => void;
  simulatedToday: string;
  syncStatus: 'offline' | 'synced' | 'syncing' | 'error';
  carriedAlertCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  onOpenQuickCapture,
  onOpenSettings,
  onExportZip,
  onSwitchToMobileApp,
  simulatedToday,
  syncStatus,
  carriedAlertCount,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-stone-50/95 dark:bg-stone-950/95 backdrop-blur-md border-b border-stone-200 dark:border-stone-800">
      <div className="w-full max-w-[1920px] mx-auto flex items-center justify-between gap-4 lg:gap-8 px-4 sm:px-6 lg:px-8 py-2.5">
        {/* Brand & Date */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => onTabChange('today')}
            className="text-lg font-bold tracking-tight text-stone-900 dark:text-stone-100 hover:text-amber-600 dark:hover:text-amber-400 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 text-left"
          >
            <span className="w-3 h-3 rounded-sm bg-amber-600 dark:bg-amber-500 inline-block shadow-2xs"></span>
            <span>Daymark</span>
          </button>
          <span className="hidden xl:inline text-xs font-mono text-stone-500 dark:text-stone-400 tabular-nums px-2 py-0.5 rounded bg-stone-200/50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-800">
            {simulatedToday}
          </span>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="flex items-center gap-1 sm:gap-2 lg:gap-3 text-xs sm:text-sm font-medium text-stone-600 dark:text-stone-400 overflow-x-auto py-1">
          <button
            onClick={() => onTabChange('today')}
            className={`flex items-center gap-1.5 py-1 px-2.5 rounded-md transition-colors whitespace-nowrap shrink-0 relative ${
              activeTab === 'today'
                ? 'text-stone-950 dark:text-stone-50 font-bold bg-stone-200/70 dark:bg-stone-800/80 shadow-2xs'
                : 'hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Today</span>
            {carriedAlertCount > 0 && (
              <span className="inline-flex items-center justify-center px-1.5 py-0.2 text-[10px] font-mono font-bold text-amber-700 bg-amber-100 dark:bg-amber-950 dark:text-amber-300 rounded-sm">
                {carriedAlertCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onTabChange('history')}
            className={`flex items-center gap-1.5 py-1 px-2.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'history'
                ? 'text-stone-950 dark:text-stone-50 font-bold bg-stone-200/70 dark:bg-stone-800/80 shadow-2xs'
                : 'hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>History</span>
          </button>

          <button
            onClick={() => onTabChange('notes')}
            className={`flex items-center gap-1.5 py-1 px-2.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'notes'
                ? 'text-stone-950 dark:text-stone-50 font-bold bg-stone-200/70 dark:bg-stone-800/80 shadow-2xs'
                : 'hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            <span>Notes</span>
          </button>

          <button
            onClick={() => onTabChange('server')}
            className={`flex items-center gap-1.5 py-1 px-2.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'server'
                ? 'text-stone-950 dark:text-stone-50 font-bold bg-stone-200/70 dark:bg-stone-800/80 shadow-2xs'
                : 'hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            <Server className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>Self-Hosted Server</span>
            <span className="hidden lg:inline text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-semibold">
              Advance
            </span>
          </button>

          <button
            onClick={() => onTabChange('mobile-code')}
            className={`flex items-center gap-1.5 py-1 px-2.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'mobile-code'
                ? 'text-stone-950 dark:text-stone-50 font-bold bg-stone-200/70 dark:bg-stone-800/80 shadow-2xs'
                : 'hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Mobile & Code</span>
          </button>

          <button
            onClick={onOpenSettings}
            className={`flex items-center gap-1.5 py-1 px-2.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'settings'
                ? 'text-stone-950 dark:text-stone-50 font-bold bg-stone-200/70 dark:bg-stone-800/80 shadow-2xs'
                : 'hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </nav>

        {/* Right Zone: Switch to Mobile View + Quick Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Switch to Dedicated Mobile App View */}
          <button
            onClick={onSwitchToMobileApp}
            title="Switch to dedicated Mobile App View"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md bg-stone-200/80 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 transition-colors shadow-2xs"
          >
            <Smartphone className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span className="hidden sm:inline">Mobile App View</span>
          </button>

          <button
            onClick={onExportZip}
            title="Export complete Daymark Vault as Markdown ZIP"
            className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-stone-700 dark:text-stone-300 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 rounded-md transition-colors whitespace-nowrap shrink-0 border border-stone-200 dark:border-stone-700"
          >
            <HardDriveDownload className="w-3.5 h-3.5" />
            <span>Export ZIP</span>
          </button>

          <button
            onClick={onOpenQuickCapture}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 rounded-md shadow-xs transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Quick Capture</span>
            <span className="hidden lg:inline text-[10px] opacity-75 font-mono ml-0.5">⌘K</span>
          </button>
        </div>
      </div>
    </header>
  );
};
