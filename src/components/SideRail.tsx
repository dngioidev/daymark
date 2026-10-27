import React, { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, Calendar, CalendarDays, FolderOpen, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, RefreshCw, Search, Settings } from 'lucide-react';
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
  collapsed: boolean;
  onToggleCollapsed: () => void;
  hidden?: boolean;
}

/** Portal labels escape the short-height Title scroller and never receive focus. */
function RailButton({ tooltip, side, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tooltip?: string; side: 'left' | 'right' }) {
  const id = useId();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const visible = !!tooltip && !!anchor && (hovered || focused);
  return <>
    <button {...props} aria-describedby={[props['aria-describedby'], visible ? id : undefined].filter(Boolean).join(' ') || undefined}
      onMouseEnter={event => { setAnchor(event.currentTarget.getBoundingClientRect()); setHovered(true); }}
      onMouseLeave={() => setHovered(false)}
      onFocus={event => { setAnchor(event.currentTarget.getBoundingClientRect()); setFocused(true); }}
      onBlur={() => setFocused(false)}
      onClick={event => { setHovered(false); setFocused(false); props.onClick?.(event); }}
      onKeyDown={event => { if (event.key === 'Escape') { setHovered(false); setFocused(false); } props.onKeyDown?.(event); }}>
      {children}
    </button>
    {visible && createPortal(<span id={id} role="tooltip" className="pointer-events-none fixed z-[200] max-w-[240px] rounded-md bg-stone-900 px-3 py-2 text-sm text-white shadow-lg dark:bg-stone-100 dark:text-stone-950"
      style={{ top: Math.max(8, Math.min(anchor.top, window.innerHeight - 72)), ...(side === 'left' ? { left: anchor.right + 8 } : { right: window.innerWidth - anchor.left + 8 }) }}>{tooltip}</span>, document.body)}
  </>;
}

/** Six equal destinations stay available in either width. */
export const SideRail: React.FC<SideRailProps> = ({ activeTab, onTabChange, onOpenQuickCapture, onOpenSearch, onOpenSettings, onOpenSync, syncStatus, carriedAlertCount, todayLabel, side, collapsed, onToggleCollapsed, hidden }) => {
  if (hidden) return null;
  const sync = SYNC_LABELS[syncStatus];
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const part = 'relative min-h-0 flex flex-col items-center justify-center gap-2 border-t border-current/15 px-2 text-sm font-medium hover:underline underline-offset-4';
  const ToggleIcon = side === 'right' ? (collapsed ? PanelRightOpen : PanelRightClose) : (collapsed ? PanelLeftOpen : PanelLeftClose);
  const toggleLabel = collapsed ? 'Expand menu' : 'Minimize menu';
  const syncLabel = `Sync: ${sync.label}. Open sync settings`;
  const page = (tab: ViewTab, icon: React.ReactNode, label: string) => (
    <RailButton type="button" side={side} tooltip={collapsed ? label : undefined} aria-label={tab === 'today' && carriedAlertCount > 0 ? `${label} ${collapsed && carriedAlertCount > 99 ? '99+' : carriedAlertCount}` : label} aria-describedby={tab === 'today' && carriedAlertCount > 0 ? 'daymark-rail-attention' : undefined} data-rail-part={tab} aria-current={activeTab === tab ? 'page' : undefined}
      onClick={() => onTabChange(tab)} className={`${part} ${activeTab === tab ? 'bg-accent text-accent-fg font-semibold' : ''}`}>
      {icon}<span className={`flex items-center gap-1.5 ${collapsed ? 'absolute right-1 top-2' : ''}`}>
        {!collapsed && label}
        {tab === 'today' && carriedAlertCount > 0 && <span id="daymark-rail-attention" aria-label={`${carriedAlertCount} ${carriedAlertCount === 1 ? 'task needs' : 'tasks need'} attention`} className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-amber-200 text-amber-950 text-[12px] font-bold">{carriedAlertCount > 99 && collapsed ? '99+' : carriedAlertCount}</span>}
      </span>
    </RailButton>
  );
  return (
    <nav aria-label="Main" data-side={side} data-collapsed={collapsed} style={{ gridTemplateRows: 'repeat(6, minmax(0, 1fr))' }}
      className={`dm-side-rail sticky top-0 z-40 grid h-dvh ${collapsed ? 'w-[64px]' : 'w-[168px]'} shrink-0 self-start bg-[var(--dm-header-bg)] text-[var(--dm-header-fg)] backdrop-blur-md ${side === 'right' ? 'order-last border-l' : 'border-r'} border-stone-200 dark:border-stone-800`}>
      <div data-rail-part="title" className="min-h-0 flex flex-col justify-start overflow-y-auto px-2 py-1 text-center">
        <RailButton side={side} type="button" aria-label={toggleLabel} aria-expanded={!collapsed} tooltip={toggleLabel} onClick={onToggleCollapsed} className="shrink-0 inline-flex min-h-8 items-center justify-center rounded-md hover:bg-stone-500/10"><ToggleIcon className="w-5 h-5" aria-hidden="true" /></RailButton>
        {!collapsed && <span className="shrink-0 font-bold tracking-tight text-base leading-5">Daymark</span>}
        {!collapsed && <span className="shrink-0 text-[12px] leading-4 truncate" title={todayLabel}>{todayLabel}</span>}
        <RailButton side={side} tooltip={collapsed ? syncLabel : undefined} type="button" onClick={onOpenSync} aria-label={syncLabel} className={`shrink-0 inline-flex justify-center items-center gap-1 ${collapsed ? 'min-h-8' : 'min-h-[24px]'} text-[12px] leading-4 hover:underline`}>
          {collapsed && <RefreshCw className={`w-4 h-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} aria-hidden="true" />}<span className={`w-1.5 h-1.5 rounded-full ${sync.dot}`} aria-hidden="true" />{!collapsed && sync.label}
        </RailButton>
        <RailButton side={side} tooltip={collapsed ? 'New task (Ctrl K / ⌘K)' : undefined} type="button" onClick={onOpenQuickCapture} aria-label={collapsed ? 'New task' : `New task ${isMac ? '⌘K' : 'Ctrl K'}`} aria-keyshortcuts="Control+K Meta+K" className={`shrink-0 mt-1 inline-flex items-center justify-center gap-1 ${collapsed ? 'min-h-8' : 'min-h-7'} rounded-lg bg-accent text-accent-fg text-[12px] font-semibold hover:brightness-95`}>
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />{!collapsed && <>New task <kbd className="text-[12px] font-sans">{isMac ? '⌘K' : 'Ctrl K'}</kbd></>}
        </RailButton>
        <RailButton side={side} tooltip={collapsed ? 'Search (Ctrl Shift F / ⌘ Shift F)' : undefined} type="button" onClick={onOpenSearch} aria-label="Search (Ctrl Shift F)" aria-keyshortcuts="Control+Shift+F Meta+Shift+F" className={`shrink-0 inline-flex items-center justify-center gap-1 ${collapsed ? 'min-h-8' : 'min-h-[24px]'} text-[12px] hover:underline`}><Search className="w-3 h-3" aria-hidden="true" />{!collapsed && 'Search'}</RailButton>
      </div>
      {page('today', <Calendar className="w-5 h-5" aria-hidden="true" />, 'Today')}
      {page('calendar', <CalendarDays className="w-5 h-5" aria-hidden="true" />, 'Calendar')}
      {page('notes', <FolderOpen className="w-5 h-5" aria-hidden="true" />, 'Notes')}
      {page('backlog', <Archive className="w-5 h-5" aria-hidden="true" />, 'Backlog')}
      <RailButton side={side} tooltip={collapsed ? 'Settings' : undefined} type="button" aria-label="Settings" data-rail-part="settings" onClick={onOpenSettings} className={part}><Settings className="w-5 h-5" aria-hidden="true" />{!collapsed && <span>Settings</span>}</RailButton>
    </nav>
  );
};
