import React, { useState } from 'react';
import { Calendar, FileText, FolderOpen, Maximize2, Minimize2, Monitor, Plus, Settings } from 'lucide-react';
import { AppSettings, DailyDocument, MobileTab, StandaloneNote, TaskItem } from '../../types/daymark';
import { useOnlineStatus, usePwaInstall } from '../../hooks/usePwa';
import { useBackHandler } from '../../native/backButton';
import { TodayView } from '../TodayView';
import { DailyHistoryView } from '../DailyHistoryView';
import { StandaloneNotesView } from '../StandaloneNotesView';
import { SyncStatus } from '../../hooks/useSync';
import { getMostRecentPastDate } from '../../utils/lifecycleEngine';
import type { SettingsTab } from '../SettingsModal';
import { SYNC_LABELS } from '../Navbar';

interface MobileAppShellProps {
  currentDocument: DailyDocument;
  dailyDocs: DailyDocument[];
  notes: StandaloneNote[];
  settings: AppSettings;
  simulatedToday: string;
  onDateChange: (date: string) => void;
  onUpdateDocument: (doc: DailyDocument) => void;
  onPatchDocument: (date: string, patch: (doc: DailyDocument) => DailyDocument) => void;
  onUpdateNotes: (notes: StandaloneNote[]) => void;
  onOpenQuickCapture: () => void;
  onOpenHistoricalModal: (task: TaskItem) => void;
  onOpenHistoryDrawer: (task: TaskItem) => void;
  onQuickHistoricalDone: (taskId: string, targetDate: string) => void;
  onMoveTask?: (taskId: string, toDate: string) => void;
  onReopenTask: (taskId: string, targetDate: string) => void;
  onTriggerRollover: () => void;
  /** Shows a past day in the Today tab. */
  onOpenDay: (date: string) => void;
  /** Present on wide screens: return to the desktop layout. */
  onSwitchToDesktop?: () => void;
  syncStatus: SyncStatus;
  initialTab?: MobileTab;
  onOpenSettings: (tab?: SettingsTab) => void;
}

const SYNC_KEY: Record<SyncStatus, keyof typeof SYNC_LABELS> = { off: 'off', idle: 'synced', syncing: 'syncing', offline: 'offline', error: 'error' };

/** The phone app: header, one screen at a time, and a bottom bar with the central + button. */
export const MobileAppShell: React.FC<MobileAppShellProps> = ({
  currentDocument,
  dailyDocs,
  notes,
  settings,
  simulatedToday,
  onDateChange,
  onUpdateDocument,
  onPatchDocument,
  onUpdateNotes,
  onOpenQuickCapture,
  onOpenHistoricalModal,
  onOpenHistoryDrawer,
  onQuickHistoricalDone,
  onMoveTask,
  onReopenTask,
  onTriggerRollover,
  onOpenDay,
  onSwitchToDesktop,
  syncStatus,
  initialTab,
  onOpenSettings,
}) => {
  const [activeTab, setActiveTab] = useState<MobileTab>(initialTab === 'today' || initialTab === 'history' || initialTab === 'notes' ? initialTab : 'today');
  const isOnline = useOnlineStatus();
  const { canInstall, install } = usePwaInstall();
  const [frame, setFrame] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth >= 768);
  const [historyDate, setHistoryDate] = useState<string>(() => getMostRecentPastDate(dailyDocs, simulatedToday));

  // Android Back: other tab -> Today, then leave the app
  useBackHandler(() => {
    if (activeTab !== 'today') return (setActiveTab('today'), true);
    return false;
  });

  const sync = SYNC_LABELS[SYNC_KEY[syncStatus]];

  const tabButton = (tab: MobileTab, icon: React.ReactNode, label: string, onClick?: () => void) => (
    <button
      type="button"
      onClick={onClick ?? (() => setActiveTab(tab))}
      aria-current={activeTab === tab ? 'page' : undefined}
      className={`flex flex-col items-center justify-center gap-0.5 min-w-16 min-h-12 rounded-lg text-xs font-medium ${
        activeTab === tab ? 'bg-accent text-accent-fg font-bold' : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div className={`min-h-screen flex flex-col items-center ${frame ? 'bg-stone-900 sm:py-3' : 'bg-stone-50 dark:bg-stone-950'}`}>
      {onSwitchToDesktop && (
        <div className="hidden sm:flex w-full max-w-md px-2 pb-2 items-center justify-end gap-2 text-sm">
          <button
            type="button"
            onClick={() => setFrame(!frame)}
            className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-lg bg-stone-800 text-stone-200 hover:text-white"
          >
            {frame ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
            {frame ? 'Full width' : 'Phone frame'}
          </button>
          <button
            type="button"
            onClick={onSwitchToDesktop}
            className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-lg bg-stone-800 text-stone-100 hover:bg-stone-700 font-semibold"
          >
            <Monitor className="w-4 h-4" /> Desktop layout
          </button>
        </div>
      )}

      <div
        className={`w-full flex-1 flex flex-col bg-stone-50 dark:bg-stone-950 ${
          frame ? 'sm:max-w-[430px] sm:h-[860px] sm:flex-none sm:border-4 sm:border-stone-800 sm:rounded-[40px] sm:overflow-hidden relative' : 'max-w-2xl min-h-screen'
        }`}
      >
        <header className="px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] bg-[var(--dm-header-bg)] text-[var(--dm-header-fg)] border-b border-stone-200 dark:border-stone-800 flex items-center gap-2 sticky top-0 z-30">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" aria-hidden="true" />
          <span className="font-bold text-base tracking-tight mr-auto">Daymark</span>
          {canInstall && (
            <button type="button" onClick={install} className="min-h-9 px-3 rounded-lg bg-accent text-accent-fg text-sm font-semibold">
              Install app
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenSettings('sync')}
            aria-label={`Sync: ${sync.label}. Open sync settings`}
            className="inline-flex items-center gap-1.5 min-h-11 px-2 -mr-2 rounded-lg text-sm hover:underline underline-offset-4"
          >
            <span className={`w-2 h-2 rounded-full ${sync.dot}`} aria-hidden="true" />
            {sync.label}
          </button>
        </header>

        {!isOnline && (
          <div role="status" className="px-4 py-2 bg-amber-100 text-amber-950 text-sm border-b border-amber-300">
            Offline. Changes are saved on this device and nothing is lost.
          </div>
        )}

        <main className={`flex-1 overflow-y-auto pb-24 text-stone-900 dark:text-stone-100 ${activeTab === 'notes' ? 'p-2.5' : 'p-3'}`}>
          {activeTab === 'today' && (
            <TodayView
              compact
              currentDocument={currentDocument}
              simulatedToday={simulatedToday}
              statuses={settings.statuses}
              agingThresholds={settings.agingThresholds}
              defaultHeadings={settings.defaultHeadings}
              onDateChange={onDateChange}
              onUpdateDocument={onUpdateDocument}
              onPatchDocument={onPatchDocument}
              onOpenHistoricalModal={onOpenHistoricalModal}
              onOpenHistoryDrawer={onOpenHistoryDrawer}
              onQuickHistoricalDone={onQuickHistoricalDone}
              onMoveTask={onMoveTask}
              onTriggerRollover={onTriggerRollover}
            />
          )}

          {activeTab === 'history' && (
            <DailyHistoryView
              compact
              dailyDocuments={dailyDocs}
              selectedDate={historyDate}
              simulatedToday={simulatedToday}
              statuses={settings.statuses}
              onSelectDate={setHistoryDate}
              onReopenTask={onReopenTask}
              onMarkDoneOnDay={onQuickHistoricalDone}
              onOpenDay={(date) => {
                onOpenDay(date);
                setActiveTab('today');
              }}
            />
          )}

          {activeTab === 'notes' && <StandaloneNotesView compact notes={notes} onUpdateNotes={onUpdateNotes} />}
        </main>

        <nav
          aria-label="Main"
          className={`bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-t border-stone-200 dark:border-stone-800 flex items-center justify-around pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] px-1 z-30 ${
            frame ? 'sm:absolute fixed bottom-0 left-0 right-0' : 'fixed bottom-0 left-0 right-0'
          }`}
        >
          {tabButton('today', <Calendar className="w-5 h-5" />, 'Today')}
          {tabButton('history', <FileText className="w-5 h-5" />, 'History', () => {
            setActiveTab('history');
            if (!dailyDocs.some((d) => d.date === historyDate)) setHistoryDate(getMostRecentPastDate(dailyDocs, simulatedToday));
          })}
          <button
            type="button"
            onClick={onOpenQuickCapture}
            aria-label="New task"
            className="flex items-center justify-center w-14 h-14 -mt-5 rounded-full bg-accent text-accent-fg shadow-lg active:scale-95 transition-transform shrink-0"
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </button>
          {tabButton('notes', <FolderOpen className="w-5 h-5" />, 'Notes')}
          {tabButton('settings', <Settings className="w-5 h-5" />, 'Settings', () => onOpenSettings())}
        </nav>
      </div>
    </div>
  );
};
