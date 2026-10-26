import React, { useState, useEffect, useMemo } from 'react';
import { useAppearance } from './hooks/useAppearance';
import { useBackgroundPhoto } from './hooks/useBackgroundPhoto';
import { BackgroundPhotoSection } from './components/settings/BackgroundPhotoSection';
import { DEFAULT_APPEARANCE } from './utils/defaultData';
import {
  DailyDocument,
  StandaloneNote,
  HabitData,
  BacklogData,
  BacklogItem,
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
  loadHabits,
  loadBacklog,
  saveBacklog,
  saveHabits,
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
import { importBackupAssets, importVaultFromZip, mergeRestoredBacklog, mergeRestoredHabits, removeUnusedPictures } from './utils/vaultArchive';
import { addBacklogItem, editBacklogItem, moveTaskToBacklog, pickBacklogItem, reconcileBacklog, removeBacklogItem, reorderBacklogItem, restoreBacklogItem, uneditedRecoveredBacklog, visibleBacklog } from './utils/backlog';
import { isHabitData, vaultProblem } from './utils/vaultValidation';
import { resolveToday } from './utils/clock';
import { useRealToday } from './hooks/useRealToday';
import { useWidgetSync } from './hooks/useWidgetSync';
import { closeEarlierCopies, followDoneChanges, reopenEarlierCopies, getMoveTaskDateError, moveTaskToDate, moveTaskToSection, undoMoveTask, removeTaskFromDocument, restoreTaskToDocument, toggleTaskDoneInDocument } from './utils/taskActions';
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
import { BacklogView } from './components/backlog/BacklogView';
import { HabitsBar } from './components/habits/HabitsBar';
import { CalendarView } from './components/CalendarView';
import { StandaloneNotesView } from './components/StandaloneNotesView';
import type { RichNoteEditorHandle } from './components/notes/RichNoteEditor';
// Developer-only screen (large embedded code samples): loaded on demand
const MobileCodeHub = React.lazy(() => import('./components/MobileCodeHub').then((m) => ({ default: m.MobileCodeHub })));
import { MobileAppShell } from './components/mobile/MobileAppShell';
import { ServerDashboard } from './components/server/ServerDashboard';
import { useSync } from './hooks/useSync';
import { getHostMode } from './utils/hostMode';
import { applySystemBars, isNativeApp } from './native/daymarkBridge';
import { defaultDeviceName as browserDeviceName } from './utils/deviceName';
import { useBackHandler } from './native/backButton';
import { QuickCaptureModal } from './components/QuickCaptureModal';
import { HistoricalCompletionModal } from './components/HistoricalCompletionModal';
import { TaskHistoryDrawer } from './components/TaskHistoryDrawer';
import { SettingsModal, SettingsTab } from './components/SettingsModal';
import { FeedbackHost, alertDialog, confirmDialog, dismissToast, showToast } from './components/ui/feedback';
import { mergeIncomingSettings, normalizeSettings } from './utils/defaultData';
import { inlineDay } from './components/TaskItemCard';
import { formatDay } from './utils/dateFormat';
import { shortcutFor } from './utils/shortcuts';
import type { SearchResult } from './utils/search';
import { SearchDialog } from './components/SearchDialog';
import { ShortcutHelp } from './components/ShortcutHelp';
import { isDialogOpen } from './components/ui/Dialog';
import { isMenuOpen } from './components/ui/Menu';

export default function App() {
  // App Mode: auto-detect mobile vs desktop, with instant user switcher
  const [appMode, setAppMode] = useState<AppMode>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return 'mobile-app';
    }
    return 'desktop';
  });

  // Desktop active tab
  const [activeDesktopTab, setActiveDesktopTab] = useState<ViewTab>(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab === 'history') return 'calendar';
    return tab === 'today' || tab === 'calendar' || tab === 'notes' || tab === 'backlog' ? tab : 'today';
  });

  // Core vault state
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const background = useBackgroundPhoto();
  const appearance = useAppearance(settings.appearance ?? DEFAULT_APPEARANCE, background.meta);
  useEffect(() => {
    // Dialogs are portalled to body, so the glass scope includes them too.
    document.documentElement.classList.toggle('dm-glass', !!background.url);
    return () => document.documentElement.classList.remove('dm-glass');
  }, [background.url]);
  const [dailyDocs, setDailyDocs] = useState<DailyDocument[]>(loadDailyDocuments);
  const dailyDocsRef = React.useRef(dailyDocs);
  dailyDocsRef.current = dailyDocs;
  const [notes, setNotes] = useState<StandaloneNote[]>(loadStandaloneNotes);
  const notesRef = React.useRef(notes);
  notesRef.current = notes;
  const richEditorHandleRef = React.useRef<RichNoteEditorHandle>(null);
  const [pictureCleanupSignal, setPictureCleanupSignal] = useState(0);
  const [backlog, setBacklog] = useState<BacklogData>(loadBacklog);
  const backlogRef = React.useRef(backlog);
  backlogRef.current = backlog;
  const backlogDeletes = React.useRef(new Map<string, BacklogItem>());
  const [habits, setHabits] = useState<HabitData>(loadHabits);
  const [habitsOpenSignal, setHabitsOpenSignal] = useState(0);

  // Current active date
  // "Today" is the real local date (updates at midnight) unless a developer override is set
  const realToday = useRealToday();
  const today = resolveToday(settings.simulatedToday, realToday);
  const [currentDate, setCurrentDate] = useState<string>(today);
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<string>(() => getMostRecentPastDate(dailyDocs, today));

  // Deep link target for the mobile shell (?tab=notes from manifest shortcuts)
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTab>(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab === 'history') return 'calendar';
    return tab === 'today' || tab === 'calendar' || tab === 'notes' ? tab : 'today';
  });

  // First-run welcome (empty vault) and dev-only UI
  const [hostMode] = useState(getHostMode);
  const [showWelcome, setShowWelcome] = useState<boolean>(() => hostMode !== 'server' && needsOnboarding());
  const devMode =
    typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).has('dev') || localStorage.getItem('daymark_dev') === '1');

  // Modals & Drawers state
  const [isQuickCaptureOpen, setIsQuickCaptureOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);
  const [openNoteId, setOpenNoteId] = useState<string | undefined>();
  const [focusToggleSignal, setFocusToggleSignal] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsStatusStrip = appMode === 'mobile-app' && isSettingsOpen;
  useEffect(() => {
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeColor) themeColor.content = appearance.headerBgOpaque;
    // Fullscreen phone Settings paints a stone-900 strip beneath the status icons.
    void applySystemBars(
      settingsStatusStrip ? '#1c1917' : appearance.headerBgOpaque,
      settingsStatusStrip || appearance.headerText === '#ffffff',
    );
  }, [appearance.headerBgOpaque, appearance.headerText, settingsStatusStrip]);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('appearance');
  const [widgetEditorId, setWidgetEditorId] = useState<number | undefined>();
  const [historicalModalTask, setHistoricalModalTask] = useState<TaskItem | null>(null);
  const [detailsTaskId, setDetailsTaskId] = useState<string | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(getLastBackupDate);

  const openSearch = () => {
    setIsSearchOpen(true);
  };
  const goToTab = (tab: 'today' | 'calendar' | 'notes' | 'backlog') => {
    setActiveDesktopTab(tab);
    setActiveMobileTab(tab);
  };
  // The Today tab always shows the real today, even after opening another day from the Calendar.
  const changeDesktopTab = (tab: ViewTab) => {
    if (tab === 'today') setCurrentDate(today);
    setActiveDesktopTab(tab);
  };
  const pickSearchResult = (result: SearchResult) => {
    if (result.kind === 'task') {
      setCurrentDate(result.date);
      goToTab('today');
      setDetailsTaskId(result.taskId);
    } else if (result.kind === 'backlog') {
      goToTab('backlog');
    } else {
      setOpenNoteId(result.noteId);
      goToTab('notes');
    }
  };

  const openSettings = (tab: SettingsTab = 'appearance') => {
    setSettingsTab(tab);
    setIsSettingsOpen(true);
  };

  // Surface storage failures instead of silently losing edits
  useEffect(() => subscribeStorageErrors((msg) => showToast(msg, { tone: 'error' })), []);

  // One global handler owns all shortcuts, including the Notes focus toggle.
  useEffect(() => {
    let pendingG = false;
    let timer: number | undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.isComposing) return;
      const action = shortcutFor(e, pendingG, e.target, isDialogOpen() || isMenuOpen());
      pendingG = false;
      window.clearTimeout(timer);
      if (!action) return;
      if (action === 'focus-notes' && (appMode === 'mobile-app' ? activeMobileTab : activeDesktopTab) !== 'notes') return;
      e.preventDefault();
      if (action === 'g-prefix') {
        pendingG = true;
        timer = window.setTimeout(() => { pendingG = false; }, 1500);
      } else if (action === 'new-task') setIsQuickCaptureOpen(true);
      else if (action === 'search') openSearch();
      else if (action === 'help') setIsShortcutHelpOpen(true);
      else if (action === 'focus-notes') setFocusToggleSignal((signal) => signal + 1);
      else if (action === 'go-today') {
        setCurrentDate(today);
        goToTab('today');
      } else if (action === 'go-calendar') goToTab('calendar');
      else if (action === 'go-notes') goToTab('notes');
      else if (action === 'go-backlog') goToTab('backlog');
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.clearTimeout(timer); };
  }, [appMode, activeDesktopTab, activeMobileTab, today]);

  // When the day changes (midnight, or waking the phone next day), follow it if the user was
  // viewing today, and carry unfinished tasks into the new day automatically.
  const previousTodayRef = React.useRef(today);
  useEffect(() => {
    const previousToday = previousTodayRef.current;
    previousTodayRef.current = today;
    if (previousToday !== today) {
      setCurrentDate((prev) => (prev === previousToday ? today : prev));
      setCalendarSelectedDate(getMostRecentPastDate(dailyDocs, today));
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
    if (isSearchOpen) return (setIsSearchOpen(false), true);
    if (isShortcutHelpOpen) return (setIsShortcutHelpOpen(false), true);
    if (isQuickCaptureOpen) return (setIsQuickCaptureOpen(false), true);
    if (historicalModalTask) return (setHistoricalModalTask(null), true);
    if (detailsTaskId) return (setDetailsTaskId(null), true);
    if (isSettingsOpen) return (setIsSettingsOpen(false), true);
    return false;
  });

  // Keep the latest recorded past day as the initial review, preserving future selections.
  useEffect(() => {
    if (activeDesktopTab === 'calendar' && calendarSelectedDate <= today && !dailyDocs.some((d) => d.date === calendarSelectedDate)) {
      setCalendarSelectedDate(getMostRecentPastDate(dailyDocs, today));
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
    saveHabits(habits);
  }, [habits]);

  useEffect(() => { saveBacklog(backlog); }, [backlog]);

  useEffect(() => {
    const next = reconcileBacklog(backlog, dailyDocs);
    if (!next.items.some((item, index) => item !== backlog.items[index])) return;
    // Reconciliation is automatic: it must not release recovered data for persistence/sync.
    if (uneditedRecoveredBacklog.has(backlog)) uneditedRecoveredBacklog.add(next);
    setBacklog(next);
  }, [backlog, dailyDocs]);

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
        else if (key === 'backlog') setBacklog(loadBacklog());
        else if (key === 'habits') setHabits(loadHabits());
        else setSettings((local) => mergeIncomingSettings(local, value as AppSettings));
      }),
    [],
  );


  // Synthesize an unsaved day for the editor; opening a date never persists it.
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
        // Finishing a carried task closes its open copies on earlier days (and unticking reopens them)
        return followDoneChanges(copy, prev[idx], updatedDoc);
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
      return followDoneChanges(copy, prev[idx], copy[idx]);
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
    const corrected = correctHistoricalCompletion(
      taskId,
      effectiveCompletedDate,
      currentDate,
      dailyDocs,
      note
    );
    const updatedTask = corrected.updatedTask;
    // Open copies on days before the completion day are closed as done later
    const updatedDocs = updatedTask ? closeEarlierCopies(corrected.updatedDocs, taskId, effectiveCompletedDate) : corrected.updatedDocs;
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

  const applyBacklogMove = (result: { docs: DailyDocument[]; data: BacklogData }) => {
    dailyDocsRef.current = result.docs;
    backlogRef.current = result.data;
    setDailyDocs(result.docs);
    setBacklog(result.data);
  };
  const canUndoBacklogMove = (result: { docs: DailyDocument[]; data: BacklogData }) => {
    if (dailyDocsRef.current === result.docs && backlogRef.current === result.data) return true;
    showToast("Can't undo: the list changed since.", { tone: 'error' });
    return false;
  };
  const handleCaptureBacklog = (input: { title: string; description?: string; category?: string }) => {
    setBacklog((current) => addBacklogItem(current, input, new Date().toISOString()));
    showToast('Added to backlog.');
  };
  const handleRemoveBacklog = (id: string) => {
    const next = removeBacklogItem(backlogRef.current, id, new Date().toISOString());
    const removed = next.items.find((item) => item.id === id);
    if (removed) backlogDeletes.current.set(id, removed);
    setBacklog(next);
  };
  const handleRestoreBacklog = (id: string) => {
    const current = backlogRef.current;
    if (current.items.find((item) => item.id === id) !== backlogDeletes.current.get(id)) {
      showToast("Can't undo: the list changed since.", { tone: 'error' });
      return;
    }
    setBacklog(restoreBacklogItem(current, id, new Date().toISOString()));
    backlogDeletes.current.delete(id);
  };
  const handleMoveToBacklog = (id: string) => {
    const beforeDocs = dailyDocsRef.current;
    const beforeBacklog = backlogRef.current;
    const result = moveTaskToBacklog(beforeDocs, beforeBacklog, id, currentDate, new Date().toISOString());
    if (!result) return;
    applyBacklogMove(result);
    showToast('Moved to backlog.', { action: { label: 'Undo', onClick: () => {
      if (!canUndoBacklogMove(result)) return;
      const now = new Date().toISOString();
      const previous = beforeBacklog.items.find((item) => item.id === id);
      applyBacklogMove({
        docs: beforeDocs.map((doc) => result.docs.find((d) => d.date === doc.date) === doc ? doc : { ...doc, updatedAt: now }),
        // A newly-created backlog item needs a tombstone so a synced move cannot return.
        data: { items: result.data.items.map((item) => item.id !== id ? item : previous ? { ...previous, updatedAt: now } : { ...item, deletedAt: now, updatedAt: now }) },
      });
    } } });
  };
  const handlePickBacklog = (id: string, date: string) => {
    const error = getMoveTaskDateError(date, '', today);
    if (error) { showToast(error, { tone: 'error' }); return; }
    const result = pickBacklogItem(dailyDocsRef.current, backlogRef.current, id, date, settings.defaultHeadings, new Date().toISOString());
    if (!result) { showToast('This task is already on a day.', { tone: 'info' }); return; }
    applyBacklogMove(result);
    const section = result.docs.find((doc) => doc.date === date)!.headings.find((heading) => heading.items.some((item) => item.id === id))!.name;
    showToast(`Added to ${formatDay(date, today)} in ${section}`, { action: { label: 'Undo', onClick: () => {
      if (!canUndoBacklogMove(result)) return;
      const restored = moveTaskToBacklog(dailyDocsRef.current, backlogRef.current, id, date, new Date().toISOString());
      if (restored) applyBacklogMove(restored);
    } } });
  };

  // Handler: Reopen Task
  const handleReopenTask = (taskId: string, targetDate = currentDate) => {
    if (targetDate < today) {
      // Reopened in the past: bring it back to today's list too.
      const r = reopenIntoToday(taskId, targetDate, today, dailyDocs, settings.statuses, settings.defaultHeadings);
      if (!r.updatedTask) return;
      // Copies closed as "done later" on that day open again too
      setDailyDocs(reopenEarlierCopies(r.updatedDocs, taskId, targetDate));
      showToast(
        r.onToday
          ? `Reopened “${r.updatedTask.title}”. It's back on today's list.`
          : `Reopened “${r.updatedTask.title}” ${inlineDay(targetDate, today)}.`
      );
      return;
    }
    const reopened = reopenTask(taskId, targetDate, dailyDocs, settings.defaultHeadings);
    if (!reopened.updatedTask) return;
    setDailyDocs(reopenEarlierCopies(reopened.updatedDocs, taskId, targetDate));
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
      return result ? followDoneChanges(prev.map((d) => (d.date === today ? result.doc : d)), todayDoc, result.doc) : prev;
    });
  };
  useWidgetSync(today, dailyDocs.find((d) => d.date === today), handleWidgetToggle, () => {
    setCurrentDate(today);
    setIsQuickCaptureOpen(true);
  }, (widgetId) => {
    setWidgetEditorId(widgetId);
    setSettingsTab('widget');
    setIsSettingsOpen(true);
  }, appearance, habits, setHabits, () => {
    setActiveDesktopTab('today');
    setActiveMobileTab('today');
    setCurrentDate(today);
    setHabitsOpenSignal((signal) => signal + 1);
  });

  // Backups: closing the Android share sheet without choosing a target is not an error
  const runBackup = async (exporter: typeof exportVaultAsZip, done: string) => {
    try {
      let missingPictures = 0;
      if (await exporter(dailyDocs, notes, settings, habits, count => { missingPictures = count; }, loadBacklog())) {
        setLastBackupAt(getLastBackupDate());
        showToast(missingPictures ? `${done} ${missingPictures} ${missingPictures === 1 ? 'picture was' : 'pictures were'} not included (not on this device yet)` : done);
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
    (dailyDocs.length === 0 && notes.length === 0 && backlog.items.length === 0) ||
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
    let skippedPictures = 0;
    try {
      skippedPictures = await importBackupAssets(parsed.assets);
    } catch (error) {
      return alertDialog("This file can't be restored", error instanceof Error ? error.message : 'Could not restore backup pictures.');
    }
    const nextSettings: AppSettings = parsed.settings ? normalizeSettings(parsed.settings) : settings;
    setDailyDocs(rolloverIntoToday(parsed.daily_documents, nextSettings));
    setNotes(parsed.standalone_notes);
    setHabits((current) => mergeRestoredHabits(current, isHabitData(parsed.habits) ? parsed.habits : undefined));
    setBacklog((current) => mergeRestoredBacklog(current, parsed.backlog));
    if (parsed.settings) setSettings(nextSettings);
    sync.rebaseAfterReplace();
    markOnboarded();
    showToast(`Backup restored.${skippedPictures ? ` ${skippedPictures} ${skippedPictures === 1 ? 'picture was' : 'pictures were'} skipped because picture storage is unavailable on this device.` : ''}`);
  };

  // Handler: Import vault ZIP (Daymark export or a folder of Markdown files)
  const handleImportZip = async (file: File) => {
    try {
      if (!(await confirmReplaceVault())) return;
      const snapshot = await importVaultFromZip(file, settings.defaultHeadings);
      const nextSettings = snapshot.settings ? normalizeSettings(snapshot.settings) : settings;
      setDailyDocs(rolloverIntoToday(snapshot.docs, nextSettings));
      setNotes(snapshot.notes);
      setHabits((current) => mergeRestoredHabits(current, snapshot.habits));
      setBacklog((current) => mergeRestoredBacklog(current, snapshot.backlog));
      if (snapshot.settings) setSettings(nextSettings);
      sync.rebaseAfterReplace();
      markOnboarded();
      showToast(
        `Restored ${snapshot.docs.length} ${snapshot.docs.length === 1 ? 'day' : 'days'} and ${snapshot.notes.length} ${snapshot.notes.length === 1 ? 'note' : 'notes'}.${snapshot.skippedPictures ? ` ${snapshot.skippedPictures} ${snapshot.skippedPictures === 1 ? 'picture was' : 'pictures were'} skipped (invalid picture files or picture storage unavailable on this device).` : ''}`
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
    setHabits(res.habits);
    setBacklog(res.backlog);
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
  const vaultForSync = useMemo(() => ({ docs: dailyDocs, notes, settings, habits, backlog }), [dailyDocs, notes, settings, habits, backlog]);
  const sync = useSync(
    vaultForSync,
    (next) => {
      setDailyDocs(next.docs);
      notesRef.current = next.notes;
      setNotes(next.notes);
      setHabits(next.habits);
      setBacklog(next.backlog);
      setSettings((local) => mergeIncomingSettings(local, next.settings));
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
  const handleMoveTask = (taskId: string, toDate: string, fromDate = currentDate): void => {
    const error = getMoveTaskDateError(toDate, fromDate, today);
    if (error) {
      showToast(error, { tone: 'error' });
      return;
    }
    const docs = dailyDocsRef.current;
    const source = docs.find((d) => d.date === fromDate);
    const removed = source && removeTaskFromDocument(source, taskId)?.removed;
    if (!removed) {
      showToast(`That task is no longer on ${formatDay(fromDate, today)}.`, { tone: 'info' });
      return;
    }
    const before = { doc: docs.find((d) => d.date === toDate), removed };
    const updated = moveTaskToDate(docs, taskId, fromDate, toDate, settings.defaultHeadings, new Date().toISOString());
    if (!updated) {
      showToast(`“${removed.task.title}” is already on ${formatDay(toDate, today)}.`, { tone: 'info' });
      return;
    }
    setDailyDocs(updated);
    showToast(`Moved “${removed.task.title}” to ${formatDay(toDate, today)}`, {
      action: { label: 'Undo', onClick: () => setDailyDocs((prev) => undoMoveTask(prev, taskId, fromDate, toDate, before, new Date().toISOString())) },
    });
  };
  const handleMoveToSection = (taskId: string, section: string): void => {
    const source = dailyDocsRef.current.find((d) => d.date === currentDate);
    if (!source) return;
    const result = moveTaskToSection(source, taskId, section, new Date().toISOString());
    if (!result) return;
    const before = JSON.parse(JSON.stringify(source)) as DailyDocument;
    handleUpdateDocument(result.doc);
    showToast(`Moved “${result.task.title}” to ${result.task.heading}`, {
      action: { label: 'Undo', onClick: () => {
        // A snapshot can only be restored while this day has no newer local or synced edits.
        if (dailyDocsRef.current.find((d) => d.date === before.date) !== result.doc) {
          showToast("Can't undo: the list changed since.", { tone: 'error' });
          return;
        }
        patchDocument(before.date, (doc) => doc === result.doc ? { ...before, updatedAt: new Date().toISOString() } : doc);
      } },
    });
  };
  const openDetails = (task: TaskItem) => setDetailsTaskId(task.id);

  return (
    <div className={`dm-app relative isolate min-h-dvh bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex flex-col ${background.url ? 'dm-glass' : ''}`}>
      {background.url && <div aria-hidden="true" className="dm-photo" style={{ backgroundImage: `url("${background.url}")` }}><div className="dm-photo-overlay" /></div>}
      {appMode === 'desktop' && (
        <div className={`flex flex-col w-full ${activeDesktopTab === 'notes' ? 'h-dvh overflow-hidden' : 'min-h-screen'}`}>
          <Navbar
            activeTab={activeDesktopTab}
            onTabChange={changeDesktopTab}
            onOpenQuickCapture={() => setIsQuickCaptureOpen(true)}
            onOpenSettings={() => openSettings()}
            onOpenSync={() => openSettings('sync')}
            onOpenSearch={openSearch}
            onSwitchToMobileApp={() => setAppMode('mobile-app')}
            syncStatus={navbarSyncStatus}
            carriedAlertCount={carriedAlertCount}
            showDevTabs={devMode}
          />

          <main className={`dm-backdrop-surface flex-1 w-full bg-stone-50 dark:bg-stone-950 ${activeDesktopTab === 'notes' ? 'min-h-0 flex overflow-hidden' : ''}`}>
            {activeDesktopTab === 'today' && (
              <TodayView
                habitsSlot={<HabitsBar data={habits} date={currentDoc.date} today={today} onChange={setHabits} openSignal={habitsOpenSignal} />}
                currentDocument={currentDoc}
                allDocs={dailyDocs}
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
                onMoveToSection={handleMoveToSection}
                onMoveToBacklog={handleMoveToBacklog}
                onTriggerRollover={handleTriggerRollover}
              />
            )}

            {activeDesktopTab === 'calendar' && (
              <CalendarView
                habits={habits}
                onHabitsChange={setHabits}
                dailyDocuments={dailyDocs}
                selectedDate={calendarSelectedDate}
                simulatedToday={today}
                statuses={settings.statuses}
                onSelectDate={setCalendarSelectedDate}
                onReopenTask={handleReopenTask}
                onMarkDoneOnDay={handleQuickHistoricalDone}
                onMoveTask={(taskId, fromDate, toDate) => handleMoveTask(taskId, toDate, fromDate)}
                onOpenDay={(date) => {
                  setCurrentDate(date);
                  setActiveDesktopTab('today');
                }}
              />
            )}

            {activeDesktopTab === 'notes' && <StandaloneNotesView notes={notes} onUpdateNotes={setNotes} openNoteId={openNoteId} onOpenNoteConsumed={() => setOpenNoteId(undefined)} focusToggleSignal={focusToggleSignal} richEditorHandleRef={richEditorHandleRef} pictureCleanupSignal={pictureCleanupSignal} />}

            {activeDesktopTab === 'backlog' && <BacklogView backlog={backlog} today={today} headings={settings.defaultHeadings}
              onAdd={handleCaptureBacklog}
              onEdit={(id, patch) => setBacklog((current) => editBacklogItem(current, id, patch, new Date().toISOString()))}
              onRemove={handleRemoveBacklog} onRestore={handleRestoreBacklog}
              onReorder={(id, direction) => setBacklog((current) => reorderBacklogItem(current, id, direction, new Date().toISOString()))}
              onPick={handlePickBacklog} />}

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
          habits={habits}
          onHabitsChange={setHabits}
          habitsSlot={<HabitsBar data={habits} date={currentDoc.date} today={today} onChange={setHabits} openSignal={habitsOpenSignal} compact />}
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
          onOpenSearch={openSearch}
          openNoteId={openNoteId}
          onOpenNoteConsumed={() => setOpenNoteId(undefined)}
          focusToggleSignal={focusToggleSignal}
          richEditorHandleRef={richEditorHandleRef}
          pictureCleanupSignal={pictureCleanupSignal}
          onOpenHistoricalModal={setHistoricalModalTask}
          onOpenHistoryDrawer={openDetails}
          onQuickHistoricalDone={handleQuickHistoricalDone}
          onMoveTask={handleMoveTask}
          onMoveToSection={handleMoveToSection}
          onMoveToBacklog={handleMoveToBacklog}
          onReopenTask={handleReopenTask}
          onTriggerRollover={handleTriggerRollover}
          onOpenDay={setCurrentDate}
          onSwitchToDesktop={window.innerWidth >= 768 ? () => setAppMode('desktop') : undefined}
          activeTab={activeMobileTab}
          onTabChange={setActiveMobileTab}
          onOpenSettings={openSettings}
          syncStatus={sync.status}
        />
      )}

      <SearchDialog isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} docs={dailyDocs} notes={notes} backlog={backlog} today={today} statuses={settings.statuses} onPick={pickSearchResult} />
      <ShortcutHelp isOpen={isShortcutHelpOpen} onClose={() => setIsShortcutHelpOpen(false)} />

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
        onCaptureBacklog={handleCaptureBacklog}
        categories={visibleBacklog(backlog).map((item) => item.category).filter((category): category is string => !!category)}
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
        widgetEditorId={widgetEditorId}
        widgetAppColors={{ headerBg: appearance.headerBgOpaque, headerText: appearance.headerText, accent: appearance.accent }}
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
        onRemoveUnusedPictures={() => removeUnusedPictures(() => notesRef.current, sync.account ? { sync: sync.syncNow, authFetch: sync.authFetch } : undefined, () => {
          richEditorHandleRef.current?.clearHistory();
          setPictureCleanupSignal(signal => signal + 1);
          dismissToast();
        })}
        syncPanel={<ServerDashboard sync={sync} defaultDeviceName={defaultDeviceName} compact />}
      />

      <FeedbackHost />
    </div>
  );
}
