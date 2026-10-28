import React, { useState } from 'react';
import { Calendar, CalendarDays, FolderOpen, Inbox, Maximize2, Minimize2, Monitor, Plus, Search, Settings } from 'lucide-react';
import { AppSettings, DailyDocument, HabitData, MobileTab, NoteMeta, StandaloneNote, TaskItem } from '../../types/daymark';
import { useOnlineStatus, usePwaInstall } from '../../hooks/usePwa';
import { useBackHandler } from '../../native/backButton';
import { TodayView } from '../TodayView';
import { CalendarView } from '../CalendarView';
import { StandaloneNotesView } from '../StandaloneNotesView';
import type { RichNoteEditorHandle } from '../notes/RichNoteEditor';
import { SyncStatus } from '../../hooks/useSync';
import { getMostRecentPastDate } from '../../utils/lifecycleEngine';
import type { SettingsTab } from '../SettingsModal';
import { SYNC_LABELS } from '../Navbar';

interface MobileAppShellProps {
  habits: HabitData;
  onHabitsChange: (next: HabitData) => void;
  habitsSlot?: React.ReactNode;
  backlogSlot?: React.ReactNode;
  currentDocument: DailyDocument;
  dailyDocs: DailyDocument[];
  notes: StandaloneNote[];
  noteMeta?: NoteMeta;
  onUpdateNoteMeta?: (meta: NoteMeta) => void;
  settings: AppSettings;
  simulatedToday: string;
  onDateChange: (date: string) => void;
  onUpdateDocument: (doc: DailyDocument) => void;
  onPatchDocument: (date: string, patch: (doc: DailyDocument) => DailyDocument) => void;
  onUpdateNotes: (notes: StandaloneNote[]) => void;
  onOpenQuickCapture: () => void;
  onOpenSearch: () => void;
  openNoteId?: string;
  onOpenNoteConsumed?: () => void;
  focusToggleSignal?: number;
  pictureCleanupSignal?: number;
  richEditorHandleRef?: React.RefObject<RichNoteEditorHandle | null>;
  onOpenHistoricalModal: (task: TaskItem) => void;
  onOpenHistoryDrawer: (task: TaskItem) => void;
  onQuickHistoricalDone: (taskId: string, targetDate: string) => void;
  onMoveTask: (taskId: string, toDate: string, fromDate?: string) => void;
  onMoveToSection?: (taskId: string, section: string) => void;
  onMoveToBacklog?: (taskId: string) => void;
  onReopenTask: (taskId: string, targetDate: string) => void;
  onTriggerRollover: () => void;
  /** Shows any day in the Today editor. */
  onOpenDay: (date: string) => void;
  /** Present on wide screens: return to the desktop layout. */
  onSwitchToDesktop?: () => void;
  syncStatus: SyncStatus;
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  onOpenSettings: (tab?: SettingsTab) => void;
}

const SYNC_KEY: Record<SyncStatus, keyof typeof SYNC_LABELS> = { off: 'off', idle: 'synced', syncing: 'syncing', offline: 'offline', error: 'error' };

/** The phone app: header, one screen at a time, and a bottom bar with the central + button. */
export const MobileAppShell: React.FC<MobileAppShellProps> = ({
  habits,
  onHabitsChange,
  habitsSlot,
  backlogSlot,
  currentDocument,
  dailyDocs,
  notes,
  noteMeta,
  onUpdateNoteMeta,
  settings,
  simulatedToday,
  onDateChange,
  onUpdateDocument,
  onPatchDocument,
  onUpdateNotes,
  onOpenQuickCapture,
  onOpenSearch,
  openNoteId,
  onOpenNoteConsumed,
  focusToggleSignal,
  pictureCleanupSignal,
  richEditorHandleRef,
  onOpenHistoricalModal,
  onOpenHistoryDrawer,
  onQuickHistoricalDone,
  onMoveTask,
  onMoveToSection,
  onMoveToBacklog,
  onReopenTask,
  onTriggerRollover,
  onOpenDay,
  onSwitchToDesktop,
  syncStatus,
  activeTab,
  onTabChange: setActiveTab,
  onOpenSettings,
}) => {
  const isOnline = useOnlineStatus();
  const { canInstall, install } = usePwaInstall();
  const [frame, setFrame] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth >= 768);
  const [calendarDate, setCalendarDate] = useState<string>(() => getMostRecentPastDate(dailyDocs, simulatedToday));

  // Android Back: other tab -> Today, then leave the app
  useBackHandler(() => {
    if (activeTab !== 'today') return (setActiveTab('today'), true);
    return false;
  });

  const sync = SYNC_LABELS[SYNC_KEY[syncStatus]];

  const tabButton = (tab: MobileTab, icon: React.ReactNode, label: string, onClick?: () => void) => (
    <button
      type="button"
      onClick={onClick ?? (() => {
        // The Today tab always shows the real today, even after opening another day
        if (tab === 'today') onDateChange(simulatedToday);
        setActiveTab(tab);
      })}
      aria-current={activeTab === tab ? 'page' : undefined}
      className={`flex flex-col items-center justify-center gap-0.5 min-w-0 basis-0 min-h-12 rounded-lg text-xs font-medium ${tab === 'today' || tab === 'calendar' ? 'grow-[1.5]' : 'grow'} ${
        activeTab === tab ? 'bg-accent text-accent-fg font-bold' : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div className={`dm-backdrop-surface flex flex-col items-center ${activeTab === 'notes' ? 'h-dvh overflow-hidden' : 'min-h-screen'} ${frame ? 'bg-stone-900 sm:py-3' : 'bg-stone-50 dark:bg-stone-950'}`}>
      {onSwitchToDesktop && (
        <div className="shrink-0 hidden sm:flex w-full max-w-md px-2 pb-2 items-center justify-end gap-2 text-sm">
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
        className={`dm-backdrop-surface w-full flex-1 flex flex-col bg-stone-50 dark:bg-stone-950 ${activeTab === 'notes' ? 'min-h-0 overflow-hidden' : ''} ${
          frame ? `sm:max-w-[430px] sm:h-[860px] ${activeTab === 'notes' ? 'sm:flex-initial' : 'sm:flex-none'} sm:border-4 sm:border-stone-800 sm:rounded-[40px] sm:overflow-hidden relative` : `max-w-2xl ${activeTab === 'notes' ? '' : 'min-h-screen'}`
        }`}
      >
        <header className="shrink-0 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] bg-[var(--dm-header-bg)] text-[var(--dm-header-fg)] border-b border-stone-200 dark:border-stone-800 flex items-center gap-2 sticky top-0 z-30">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" aria-hidden="true" />
          <span className="font-bold text-base tracking-tight mr-auto">Daymark</span>
          <button type="button" onClick={onOpenSearch} aria-label="Search (Ctrl Shift F)" className="inline-flex items-center justify-center w-11 h-11 rounded-lg">
            <Search className="w-5 h-5" />
          </button>
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

        <main className={`flex-1 text-stone-900 dark:text-stone-100 ${activeTab === 'notes' ? 'min-h-0 flex overflow-hidden p-2.5' : 'overflow-y-auto pb-24 p-3'}`}>
          {activeTab === 'today' && (
            <TodayView
              habitsSlot={habitsSlot}
              compact
              currentDocument={currentDocument}
              allDocs={dailyDocs}
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
              onMoveToSection={onMoveToSection}
              onMoveToBacklog={onMoveToBacklog}
              onTriggerRollover={onTriggerRollover}
            />
          )}

          {activeTab === 'calendar' && (
            <CalendarView
              habits={habits}
              onHabitsChange={onHabitsChange}
              compact
              dailyDocuments={dailyDocs}
              selectedDate={calendarDate}
              simulatedToday={simulatedToday}
              statuses={settings.statuses}
              onSelectDate={setCalendarDate}
              onReopenTask={onReopenTask}
              onMarkDoneOnDay={onQuickHistoricalDone}
              onMoveTask={(taskId, fromDate, toDate) => onMoveTask(taskId, toDate, fromDate)}
              onOpenDay={(date) => {
                onOpenDay(date);
                setActiveTab('today');
              }}
            />
          )}

          {activeTab === 'notes' && <StandaloneNotesView compact notes={notes} noteMeta={noteMeta} onUpdateNoteMeta={onUpdateNoteMeta} onUpdateNotes={onUpdateNotes} openNoteId={openNoteId} onOpenNoteConsumed={onOpenNoteConsumed} focusToggleSignal={focusToggleSignal} richEditorHandleRef={richEditorHandleRef} pictureCleanupSignal={pictureCleanupSignal} />}
          {activeTab === 'backlog' && backlogSlot}
        </main>

        <nav
          aria-label="Main"
          className={`dm-card bg-white! dark:bg-stone-900! border-t border-stone-200 dark:border-stone-800 flex items-center pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] z-30 ${
            activeTab === 'notes' ? 'shrink-0' : frame ? 'sm:absolute fixed bottom-0 left-0 right-0' : 'fixed bottom-0 left-0 right-0'
          }`}
        >
          {/* Balance the two tabs on the left against the three on the right so + stays centred. */}
          {tabButton('today', <Calendar className="w-5 h-5" />, 'Today')}
          {tabButton('calendar', <CalendarDays className="w-5 h-5" />, 'Calendar', () => {
            setActiveTab('calendar');
            if (calendarDate <= simulatedToday && !dailyDocs.some((d) => d.date === calendarDate)) {
              setCalendarDate(getMostRecentPastDate(dailyDocs, simulatedToday));
            }
          })}
          <button
            type="button"
            onClick={onOpenQuickCapture}
            aria-label="New task"
            className="flex items-center justify-center w-12 h-12 -mt-5 rounded-full bg-accent text-accent-fg shadow-lg active:scale-95 transition-transform shrink-0"
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </button>
          {tabButton('backlog', <Inbox className="w-5 h-5" />, 'Backlog')}
          {tabButton('notes', <FolderOpen className="w-5 h-5" />, 'Notes')}
          {tabButton('settings', <Settings className="w-5 h-5" />, 'Settings', () => onOpenSettings())}
        </nav>
      </div>
    </div>
  );
};
