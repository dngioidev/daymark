import React, { useState, useEffect, useMemo } from 'react';
import { useAppearance } from './hooks/useAppearance';
import { useBackgroundPhoto } from './hooks/useBackgroundPhoto';
import { BackgroundPhotoSection } from './components/settings/BackgroundPhotoSection';
import { DEFAULT_APPEARANCE } from './utils/defaultData';
import {
  DailyDocument,
  StandaloneNote,
  AppSettings,
  ViewTab,
  TaskItem,
  AppMode,
  MobileTab,
} from './types/daymark';
import {
  loadSettings,
  saveSettings,
  loadDailyDocuments,
  saveDailyDocuments,
  loadStandaloneNotes,
  saveStandaloneNotes,
  exportVaultAsZip,
  exportVaultAsJson,
  resetVaultToSeedData,
  needsOnboarding,
  markOnboarded,
  subscribeStorageErrors,
  subscribeExternalChanges,
  getLastBackupDate,
  isShareCancel,
} from './utils/vaultStore';
import { importVaultFromZip } from './utils/vaultArchive';
import { vaultProblem } from './utils/vaultValidation';
import { resolveToday } from './utils/clock';
import { useRealToday } from './hooks/useRealToday';
import { useWidgetSync } from './hooks/useWidgetSync';
import { getMoveTaskDateError, moveTaskToDate, undoMoveTask, removeTaskFromDocument, restoreTaskToDocument, toggleTaskDoneInDocument } from './utils/taskActions';
import { WelcomeModal } from './components/WelcomeModal';
import {
  correctHistoricalCompletion,
  performDailyRollover,
  reopenIntoToday,
  reopenTask,
  getAgingSeverity,
  getPreviousDate,
  getMostRecentPastDate,
} from './utils/lifecycleEngine';
import { Navbar } from './components/Navbar';
import { TodayView } from './components/TodayView';
import { DailyHistoryView } from './components/DailyHistoryView';
import { StandaloneNotesView } from './components/StandaloneNotesView';
// Developer-only screen (large embedded code samples): loaded on demand
const MobileCodeHub = React.lazy(() => import('./components/MobileCodeHub').then((m) => ({ default: m.MobileCodeHub })));
import { MobileAppShell } from './components/mobile/MobileAppShell';
import { ServerDashboard } from './components/server/ServerDashboard';
import { useSync } from './hooks/useSync';
import { getHostMode } from './utils/hostMode';
import { isNativeApp } from './native/daymarkBridge';
import { defaultDeviceName as browserDeviceName } from './utils/deviceName';
import { useBackHandler } from './native/backButton';
import { QuickCaptureModal } from './components/QuickCaptureModal';
import { HistoricalCompletionModal } from './components/HistoricalCompletionModal';
import { TaskHistoryDrawer } from './components/TaskHistoryDrawer';
import { SettingsModal, SettingsTab } from './components/SettingsModal';
import { FeedbackHost, alertDialog, confirmDialog, showToast } from './components/ui/feedback';
import { normalizeSettings } from './utils/defaultData';
import { inlineDay } from './components/TaskItemCard';
import { formatDay } from './utils/dateFormat';

export default function App() {
  // App Mode: auto-detect mobile vs desktop, with instant user switcher
  const [appMode, setAppMode] = useState<AppMode>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return 'mobile-app';
    }
    return 'desktop';
  });

  // Desktop active tab
  const [activeDesktopTab, setActiveDesktopTab] = useState<ViewTab>('today');

  // Core vault state
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const background = useBackgroundPhoto();
  useAppearance(settings.appearance ?? DEFAULT_APPEARANCE, background.meta);
  useEffect(() => {
    // Dialogs are portalled to body, so the glass scope includes them too.
    document.documentElement.classList.toggle('dm-glass', !!background.url);
    return () => document.documentElement.classList.remove('dm-glass');
  }, [background.url]);
  const [dailyDocs, setDailyDocs] = useState<DailyDocument[]>(loadDailyDocuments);
  const dailyDocsRef = React.useRef(dailyDocs);
  dailyDocsRef.current = dailyDocs;
  const [notes, setNotes] = useState<StandaloneNote[]>(loadStandaloneNotes);

  // Current active date
  // "Today" is the real local date (updates at midnight) unless a developer override is set
  const realToday = useRealToday();
  const today = resolveToday(settings.simulatedToday, realToday);
  const [currentDate, setCurrentDate] = useState<string>(today);
  const [historySelectedDate, setHistorySelectedDate] = useState<string>(() => getMostRecentPastDate(dailyDocs, today));

  // Deep link target for the mobile shell (?tab=notes from manifest shortcuts)
  const [initialMobileTab] = useState<MobileTab | undefined>(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    return tab === 'today' || tab === 'history' || tab === 'notes' ? tab : undefined;
  });

  // First-run welcome (empty vault) and dev-only UI
  const [hostMode] = useState(getHostMode);
  const [showWelcome, setShowWelcome] = useState<boolean>(() => hostMode !== 'server' && needsOnboarding());
  const devMode =
    typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).has('dev') || localStorage.getItem('daymark_dev') === '1');

  // Modals & Drawers state
  const [isQuickCaptureOpen, setIsQuickCaptureOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('appearance');
  const [historicalModalTask, setHistoricalModalTask] = useState<TaskItem | null>(null);
  const [detailsTaskId, setDetailsTaskId] = useState<string | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(getLastBackupDate);

  const openSettings = (tab: SettingsTab = 'appearance') => {
    setSettingsTab(tab);
    setIsSettingsOpen(true);
  };

  // Surface storage failures instead of silently losing edits
  useEffect(() => subscribeStorageErrors((msg) => showToast(msg, { tone: 'error' })), []);

  // Ctrl/Cmd+K opens the new-task sheet from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsQuickCaptureOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // When the day changes (midnight, or waking the phone next day), follow it if the user was
  // viewing today, and carry unfinished tasks into the new day automatically.
  const previousTodayRef = React.useRef(today);
  useEffect(() => {
    const previousToday = previousTodayRef.current;
    previousTodayRef.current = today;
    if (previousToday !== today) {
      setCurrentDate((prev) => (prev === previousToday ? today : prev));
      setHistorySelectedDate(getMostRecentPastDate(dailyDocs, today));
    }
    const { updatedDocs, carriedCount } = performDailyRollover(
      today,
      dailyDocs,
      settings.statuses,
      settings.defaultHeadings
    );
    if (carriedCount > 0) {
      setDailyDocs(updatedDocs);
      showToast(`${carriedCount} unfinished ${carriedCount === 1 ? 'task' : 'tasks'} moved to today.`, { tone: 'info' });
    }
    // Runs when the effective date changes; performDailyRollover is idempotent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  // Android Back closes the topmost dialog first
  useBackHandler(() => {
    if (isQuickCaptureOpen) return (setIsQuickCaptureOpen(false), true);
    if (historicalModalTask) return (setHistoricalModalTask(null), true);
    if (detailsTaskId) return (setDetailsTaskId(null), true);
    if (isSettingsOpen) return (setIsSettingsOpen(false), true);
    return false;
  });

  // History opens on the latest day that actually has a note
  useEffect(() => {
    if (activeDesktopTab === 'history' && !dailyDocs.some((d) => d.date === historySelectedDate)) {
      setHistorySelectedDate(getMostRecentPastDate(dailyDocs, today));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDesktopTab]);

  // Deep links from the PWA manifest shortcuts (?action=capture); on a first launch the
  // welcome choice comes first and the new-task sheet opens right after it
  const captureFromLink = React.useRef(new URLSearchParams(window.location.search).get('action') === 'capture');
  useEffect(() => {
    if (captureFromLink.current && !showWelcome) {
      captureFromLink.current = false;
      setIsQuickCaptureOpen(true);
    }
  }, [showWelcome]);

  // Synchronize state changes to local storage
  useEffect(() => {
    saveDailyDocuments(dailyDocs);
  }, [dailyDocs]);

  useEffect(() => {
    saveStandaloneNotes(notes);
  }, [notes]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Another open tab or window changed the vault: take its version instead of overwriting it
  useEffect(
    () =>
      subscribeExternalChanges((key, value) => {
        // The loaders drop damaged entries and keep the cached array's identity (loop guard)
        if (key === 'daily_docs') setDailyDocs(loadDailyDocuments());
        else if (key === 'notes') setNotes(loadStandaloneNotes());
        else setSettings(normalizeSettings(value as AppSettings));
      }),
    [],
  );


  // Ensure document exists for currentDate
  const currentDoc = useMemo(() => {
    let doc = dailyDocs.find((d) => d.date === currentDate);
    if (!doc) {
      doc = {
        date: currentDate,
        type: 'daily',
        headings: settings.defaultHeadings.map((name) => ({ name, items: [], notesContent: '' })),
        updatedAt: new Date().toISOString(),
      };
    }
    return doc;
  }, [dailyDocs, currentDate, settings.defaultHeadings]);

  // Carried alert count for Navbar badge
  const carriedAlertCount = useMemo(() => {
    let count = 0;
    const allTasks = currentDoc.headings.flatMap((h) => h.items);
    for (const task of allTasks) {
      if (task.status === 'done' || task.status === 'archived') continue;
      if (task.dismissedAlertDate === currentDate) continue;
      const severity = getAgingSeverity(task, currentDate, settings.agingThresholds, settings.statuses);
      if (severity === 'attention' || severity === 'critical') count++;
    }
    return count;
  }, [currentDoc, currentDate, settings.agingThresholds, settings.statuses]);

  // Handler: Update DailyDocument
  const handleUpdateDocument = (updatedDoc: DailyDocument) => {
    setDailyDocs((prev) => {
      const idx = prev.findIndex((d) => d.date === updatedDoc.date);
      if (idx !== -1) {
        const copy = [...prev];
        copy[idx] = updatedDoc;
        return copy;
      }
      return [...prev, updatedDoc].sort((a, b) => a.date.localeCompare(b.date));
    });
  };

  // Handler: change one day against the latest state (used by Undo so it only touches what it must)
  const patchDocument = (date: string, patch: (doc: DailyDocument) => DailyDocument) => {
    setDailyDocs((prev) => {
      const idx = prev.findIndex((d) => d.date === date);
      if (idx === -1) return prev;
      const copy = [...prev];
      copy[idx] = patch(prev[idx]);
      return copy;
    });
  };

  // Handler: Execute idempotent daily rollover
  const handleTriggerRollover = () => {
    const { updatedDocs, carriedCount } = performDailyRollover(
      currentDate,
      dailyDocs,
      settings.statuses,
      settings.defaultHeadings
    );
    setDailyDocs(updatedDocs);
    showToast(
      carriedCount > 0
        ? `${carriedCount} unfinished ${carriedCount === 1 ? 'task' : 'tasks'} moved to today.`
        : "Today's list is up to date.",
      { tone: 'info' }
    );
  };

  // Handler: Historical Completion Correction (PRD §7)
  const handleConfirmHistoricalCorrection = (
    taskId: string,
    effectiveCompletedDate: string,
    note?: string
  ) => {
    const before = dailyDocs;
    const { updatedDocs, updatedTask } = correctHistoricalCompletion(
      taskId,
      effectiveCompletedDate,
      currentDate,
      dailyDocs,
      note
    );
    setDailyDocs(updatedDocs);
    if (updatedTask) {
      showToast(`Marked “${updatedTask.title}” done ${inlineDay(effectiveCompletedDate, currentDate)}.`, {
        action: {
          label: 'Undo',
          onClick: () => {
            // Only undo when nothing else changed since; otherwise we would wipe out newer edits
            if (dailyDocsRef.current !== updatedDocs) {
              showToast("Can't undo: the list changed since.", { tone: 'error' });
              return;
            }
            setDailyDocs((prev) => (prev === updatedDocs ? before : prev));
          },
        },
      });
    }
  };

  const handleQuickHistoricalDone = (taskId: string, targetDate: string) => {
    handleConfirmHistoricalCorrection(taskId, targetDate, 'Marked done from the task menu');
  };

  // Handler: Reopen Task
  const handleReopenTask = (taskId: string, targetDate = currentDate) => {
    if (targetDate < today) {
      // Reopened in the past: bring it back to today's list too.
      const r = reopenIntoToday(taskId, targetDate, today, dailyDocs, settings.statuses, settings.defaultHeadings);
      if (!r.updatedTask) return;
      setDailyDocs(r.updatedDocs);
      showToast(
        r.onToday
          ? `Reopened “${r.updatedTask.title}”. It's back on today's list.`
          : `Reopened “${r.updatedTask.title}” ${inlineDay(targetDate, today)}.`
      );
      return;
    }
    const reopened = reopenTask(taskId, targetDate, dailyDocs, settings.defaultHeadings);
    if (!reopened.updatedTask) return;
    setDailyDocs(reopened.updatedDocs);
    showToast(`Reopened “${reopened.updatedTask.title}” ${inlineDay(targetDate, today)}.`);
  };

  // Handler: Quick Capture Task
  const handleQuickCapture = (newTaskData: {
    title: string;
    description?: string;
    heading: string;
    status: string;
  }) => {
    const newDocs: DailyDocument[] = JSON.parse(JSON.stringify(dailyDocs));
    let doc = newDocs.find((d) => d.date === currentDate);
    if (!doc) {
      doc = {
        date: currentDate,
        type: 'daily',
        headings: settings.defaultHeadings.map((name) => ({ name, items: [], notesContent: '' })),
        updatedAt: new Date().toISOString(),
      };
      newDocs.push(doc);
    }

    let heading = doc.headings.find((h) => h.name.toLowerCase() === newTaskData.heading.toLowerCase());
    if (!heading) {
      heading = { name: newTaskData.heading, items: [], notesContent: '' };
      doc.headings.push(heading);
    }

    const newTask: TaskItem = {
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: newTaskData.title,
      description: newTaskData.description,
      status: newTaskData.status,
      createdDate: currentDate,
      originalNoteDate: currentDate,
      heading: heading.name,
      order: heading.items.length + 1,
      historyLog: [
        {
          id: `hist-${Date.now()}`,
          timestamp: new Date().toISOString(),
          date: currentDate,
          action: 'created',
          details: `Added to ${heading.name}`,
        },
      ],
    };

    heading.items.push(newTask);
    doc.updatedAt = new Date().toISOString();
    setDailyDocs(newDocs);
    showToast(`Added to ${heading.name}`);
  };

  // Handler: Quick add task from widget/mobile hub
  const handleQuickAddTaskFromHub = (title: string, sectionName: string) => {
    handleQuickCapture({
      title,
      heading: sectionName,
      status: 'not-started',
    });
  };

  // Handler: Toggle Task Done
  const handleToggleTaskDone = (taskId: string) => {
    const result = toggleTaskDoneInDocument(currentDoc, taskId, currentDate);
    if (!result) return;
    handleUpdateDocument(result.doc);
    showToast(result.nowDone ? `Done: ${result.task.title}` : `Reopened “${result.task.title}”`);
  };

  // Android app only: apply widget checkbox taps and keep the home-screen widget up to date.
  // Uses a functional update so several queued toggles apply in order against the latest state.
  const handleWidgetToggle = (taskId: string) => {
    setDailyDocs((prev) => {
      const todayDoc = prev.find((d) => d.date === today);
      const result = todayDoc ? toggleTaskDoneInDocument(todayDoc, taskId, today) : null;
      return result ? prev.map((d) => (d.date === today ? result.doc : d)) : prev;
    });
  };
  useWidgetSync(today, dailyDocs.find((d) => d.date === today), handleWidgetToggle, () => {
    setCurrentDate(today);
    setIsQuickCaptureOpen(true);
  });

  // Backups: closing the Android share sheet without choosing a target is not an error
  const runBackup = async (exporter: typeof exportVaultAsZip, done: string) => {
    try {
      if (await exporter(dailyDocs, notes, settings)) {
        setLastBackupAt(getLastBackupDate());
        showToast(done);
      }
    } catch (err) {
      if (isShareCancel(err)) return;
      console.error(err);
      showToast('Could not create the backup. Check free storage space and try again.', { tone: 'error' });
    }
  };
  const handleExportVaultZip = () => runBackup(exportVaultAsZip, 'Backup saved.');
  const handleExportJson = () => runBackup(exportVaultAsJson, 'Technical backup saved.');

  // After replacing the vault (sample data, import), carry unfinished tasks into today
  const rolloverIntoToday = (docs: DailyDocument[], s: AppSettings): DailyDocument[] =>
    performDailyRollover(resolveToday(s.simulatedToday, realToday), docs, s.statuses, s.defaultHeadings).updatedDocs;

  // Importing replaces the whole vault, so ask first when there is existing data
  const confirmReplaceVault = async () =>
    (dailyDocs.length === 0 && notes.length === 0) ||
    confirmDialog({
      title: 'Restore this backup?',
      message: sync.account
        ? 'It replaces what is on this device. Because sync is on, it is then merged with your server: nothing on your other devices is deleted.'
        : 'It replaces everything on this device. Back up first if you are unsure.',
      confirmLabel: 'Restore',
    });

  // Handler: Import JSON
  const handleImportJson = async (jsonStr: string) => {
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return alertDialog("This file can't be read", 'It is not a Daymark backup. Choose a .zip or .json file made with Back up.');
    }
    if (!parsed?.daily_documents || !parsed?.standalone_notes) {
      return alertDialog("This file isn't a Daymark backup", 'Choose a .zip or .json file made with Back up.');
    }
    const problem = vaultProblem(parsed.daily_documents, parsed.standalone_notes);
    if (problem) return alertDialog("This file can't be restored", problem);
    if (!(await confirmReplaceVault())) return;
    const nextSettings: AppSettings = parsed.settings ? normalizeSettings(parsed.settings) : settings;
    setDailyDocs(rolloverIntoToday(parsed.daily_documents, nextSettings));
    setNotes(parsed.standalone_notes);
    if (parsed.settings) setSettings(nextSettings);
    sync.rebaseAfterReplace();
    markOnboarded();
    showToast('Backup restored.');
  };

  // Handler: Import vault ZIP (Daymark export or a folder of Markdown files)
  const handleImportZip = async (file: File) => {
    try {
      const snapshot = await importVaultFromZip(file, settings.defaultHeadings);
      if (!(await confirmReplaceVault())) return;
      const nextSettings = snapshot.settings ? normalizeSettings(snapshot.settings) : settings;
      setDailyDocs(rolloverIntoToday(snapshot.docs, nextSettings));
      setNotes(snapshot.notes);
      if (snapshot.settings) setSettings(nextSettings);
      sync.rebaseAfterReplace();
      markOnboarded();
      showToast(
        `Restored ${snapshot.docs.length} ${snapshot.docs.length === 1 ? 'day' : 'days'} and ${snapshot.notes.length} ${snapshot.notes.length === 1 ? 'note' : 'notes'}.`
      );
    } catch (err) {
      await alertDialog("This file can't be restored", err instanceof Error ? err.message : 'Could not read this ZIP file.');
    }
  };

  // Handler: Load the sample vault
  const handleResetVault = () => {
    const res = resetVaultToSeedData();
    setSettings(res.settings);
    setDailyDocs(rolloverIntoToday(res.docs, res.settings));
    setNotes(res.notes);
    setCurrentDate(resolveToday(res.settings.simulatedToday, realToday));
    sync.rebaseAfterReplace();
    showToast('Sample vault loaded.');
  };

  const handleStartEmpty = () => {
    markOnboarded();
    setShowWelcome(false);
  };

  const handleLoadSample = () => {
    handleResetVault();
    setShowWelcome(false);
  };

  // Self-hosted sync: merges this vault with the server in the background
  const vaultForSync = useMemo(() => ({ docs: dailyDocs, notes, settings }), [dailyDocs, notes, settings]);
  const sync = useSync(
    vaultForSync,
    (next) => {
      setDailyDocs(next.docs);
      setNotes(next.notes);
      setSettings(normalizeSettings(next.settings));
    },
    (conflicts) =>
      showToast(conflicts.length === 1 ? conflicts[0] : `${conflicts.length} edits made on two devices were merged; nothing was lost.`),
    isNativeApp() ? 'android' : 'web'
  );
  const defaultDeviceName = useMemo(() => {
    if (isNativeApp()) return 'Android phone';
    return browserDeviceName();
  }, []);
  const navbarSyncStatus = ({ off: 'off', idle: 'synced', syncing: 'syncing', offline: 'offline', error: 'error' } as const)[sync.status];

  // Task details sheet: always shows the live task from the current day
  const detailsTask = detailsTaskId ? currentDoc.headings.flatMap((h) => h.items).find((t) => t.id === detailsTaskId) ?? null : null;
  const handleUpdateTaskInDay = (task: TaskItem) =>
    handleUpdateDocument({
      ...currentDoc,
      headings: currentDoc.headings.map((h) => ({ ...h, items: h.items.map((t) => (t.id === task.id ? task : t)) })),
      updatedAt: new Date().toISOString(),
    });
  const handleDeleteTaskInDay = (taskId: string) => {
    const res = removeTaskFromDocument(currentDoc, taskId);
    if (!res) return;
    const { removed } = res;
    const date = currentDoc.date;
    handleUpdateDocument(res.doc);
    showToast(`Deleted “${removed.task.title}”`, {
      action: { label: 'Undo', onClick: () => patchDocument(date, (d) => restoreTaskToDocument(d, removed)) },
    });
  };
  const handleMoveTask = (taskId: string, toDate: string): void => {
    const fromDate = currentDate;
    const error = getMoveTaskDateError(toDate, fromDate, today);
    if (error) {
      showToast(error, { tone: 'error' });
      return;
    }
    const docs = dailyDocsRef.current;
    const source = docs.find((d) => d.date === fromDate);
    const removed = source && removeTaskFromDocument(source, taskId)?.removed;
    if (!removed) return;
    const before = { doc: docs.find((d) => d.date === toDate), removed };
    const updated = moveTaskToDate(docs, taskId, fromDate, toDate, settings.defaultHeadings, new Date().toISOString());
    if (!updated) return;
    setDailyDocs(updated);
    showToast(`Moved “${removed.task.title}” to ${formatDay(toDate, today)}`, {
      action: { label: 'Undo', onClick: () => setDailyDocs((prev) => undoMoveTask(prev, taskId, fromDate, toDate, before)) },
    });
  };
  const openDetails = (task: TaskItem) => setDetailsTaskId(task.id);

  return (
    <div className={`dm-app relative isolate min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex flex-col ${background.url ? 'dm-glass' : ''}`}>
      {background.url && <div aria-hidden="true" className="dm-photo" style={{ backgroundImage: `url("${background.url}")` }}><div className="dm-photo-overlay" /></div>}
      {appMode === 'desktop' && (
        <div className="flex flex-col min-h-screen w-full">
          <Navbar
            activeTab={activeDesktopTab}
            onTabChange={setActiveDesktopTab}
            onOpenQuickCapture={() => setIsQuickCaptureOpen(true)}
            onOpenSettings={() => openSettings()}
            onOpenSync={() => openSettings('sync')}
            onSwitchToMobileApp={() => setAppMode('mobile-app')}
            syncStatus={navbarSyncStatus}
            carriedAlertCount={carriedAlertCount}
            showDevTabs={devMode}
          />

          <main className="dm-backdrop-surface flex-1 w-full bg-stone-50 dark:bg-stone-950">
            {activeDesktopTab === 'today' && (
              <TodayView
                currentDocument={currentDoc}
                simulatedToday={today}
                statuses={settings.statuses}
                agingThresholds={settings.agingThresholds}
                defaultHeadings={settings.defaultHeadings}
                onDateChange={setCurrentDate}
                onUpdateDocument={handleUpdateDocument}
                onPatchDocument={patchDocument}
                onOpenHistoricalModal={setHistoricalModalTask}
                onOpenHistoryDrawer={openDetails}
                onQuickHistoricalDone={handleQuickHistoricalDone}
                onMoveTask={handleMoveTask}
                onTriggerRollover={handleTriggerRollover}
              />
            )}

            {activeDesktopTab === 'history' && (
              <DailyHistoryView
                dailyDocuments={dailyDocs}
                selectedDate={historySelectedDate}
                simulatedToday={today}
                statuses={settings.statuses}
                onSelectDate={setHistorySelectedDate}
                onReopenTask={handleReopenTask}
                onMarkDoneOnDay={handleQuickHistoricalDone}
                onOpenDay={(date) => {
                  setCurrentDate(date);
                  setActiveDesktopTab('today');
                }}
              />
            )}

            {activeDesktopTab === 'notes' && <StandaloneNotesView notes={notes} onUpdateNotes={setNotes} />}

            {activeDesktopTab === 'mobile-code' && (
              <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <React.Suspense fallback={null}>
                  <MobileCodeHub
                    currentDocument={currentDoc}
                    simulatedToday={today}
                    statuses={settings.statuses}
                    onToggleTaskDone={handleToggleTaskDone}
                    onQuickHistoricalDone={handleQuickHistoricalDone}
                    onQuickAddTask={handleQuickAddTaskFromHub}
                  />
                </React.Suspense>
              </div>
            )}
          </main>
        </div>
      )}

      {appMode === 'mobile-app' && (
        <MobileAppShell
          currentDocument={currentDoc}
          dailyDocs={dailyDocs}
          notes={notes}
          settings={settings}
          simulatedToday={today}
          onDateChange={setCurrentDate}
          onUpdateDocument={handleUpdateDocument}
          onPatchDocument={patchDocument}
          onUpdateNotes={setNotes}
          onOpenQuickCapture={() => setIsQuickCaptureOpen(true)}
          onOpenHistoricalModal={setHistoricalModalTask}
          onOpenHistoryDrawer={openDetails}
          onQuickHistoricalDone={handleQuickHistoricalDone}
          onMoveTask={handleMoveTask}
          onReopenTask={handleReopenTask}
          onTriggerRollover={handleTriggerRollover}
          onOpenDay={setCurrentDate}
          onSwitchToDesktop={window.innerWidth >= 768 ? () => setAppMode('desktop') : undefined}
          initialTab={initialMobileTab}
          onOpenSettings={openSettings}
          syncStatus={sync.status}
        />
      )}

      <HistoricalCompletionModal
        task={historicalModalTask}
        currentDate={currentDate}
        isOpen={Boolean(historicalModalTask)}
        onClose={() => setHistoricalModalTask(null)}
        onConfirm={handleConfirmHistoricalCorrection}
      />

      <TaskHistoryDrawer
        task={detailsTask}
        currentDate={currentDate}
        statuses={settings.statuses}
        onClose={() => setDetailsTaskId(null)}
        onReopenTask={handleReopenTask}
        onOpenHistoricalCorrection={setHistoricalModalTask}
        onUpdateTask={handleUpdateTaskInDay}
        onDeleteTask={handleDeleteTaskInDay}
      />

      <QuickCaptureModal
        isOpen={isQuickCaptureOpen}
        onClose={() => setIsQuickCaptureOpen(false)}
        headings={currentDoc.headings.length ? currentDoc.headings.map((h) => h.name) : settings.defaultHeadings}
        statuses={settings.statuses}
        simulatedToday={today}
        targetDate={currentDate}
        onCapture={handleQuickCapture}
      />

      <WelcomeModal
        isOpen={showWelcome}
        onStartEmpty={handleStartEmpty}
        onLoadSample={handleLoadSample}
        onSignIn={hostMode === 'native' ? () => {
          handleStartEmpty();
          openSettings('sync');
        } : undefined}
        onRestore={() => {
          handleStartEmpty();
          openSettings('storage');
        }}
      />

      <SettingsModal
        photoSection={<BackgroundPhotoSection background={background} />}
        photoMeta={background.meta}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        initialTab={settingsTab}
        settings={settings}
        isSynced={Boolean(sync.account)}
        lastBackupAt={lastBackupAt}
        onChangeSettings={(newSettings) => {
          setSettings(newSettings);
          setCurrentDate(resolveToday(newSettings.simulatedToday, realToday));
        }}
        onExportZip={handleExportVaultZip}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onImportZip={handleImportZip}
        onResetVault={handleResetVault}
        syncPanel={<ServerDashboard sync={sync} defaultDeviceName={defaultDeviceName} compact />}
      />

      <FeedbackHost />
    </div>
  );
}
