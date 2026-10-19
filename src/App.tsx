import React, { useState, useEffect, useMemo } from 'react';
import {
  DailyDocument,
  StandaloneNote,
  AppSettings,
  ViewTab,
  TaskItem,
  AppMode,
  MobileTab,
  ServerAuthState,
} from './types/daymark';
import {
  loadSettings,
  saveSettings,
  loadDailyDocuments,
  saveDailyDocuments,
  loadStandaloneNotes,
  saveStandaloneNotes,
  loadSyncLogs,
  saveSyncLogs,
  exportVaultAsZip,
  exportVaultAsJson,
  resetVaultToSeedData,
  needsOnboarding,
  markOnboarded,
  subscribeStorageErrors,
  SyncLogEntry,
} from './utils/vaultStore';
import { importVaultFromZip } from './utils/vaultArchive';
import { resolveToday } from './utils/clock';
import { useRealToday } from './hooks/useRealToday';
import { useWidgetSync } from './hooks/useWidgetSync';
import { toggleTaskDoneInDocument } from './utils/taskActions';
import { WelcomeModal } from './components/WelcomeModal';
import {
  correctHistoricalCompletion,
  performDailyRollover,
  reopenTask,
  getAgingSeverity,
  getPreviousDate,
} from './utils/lifecycleEngine';
import { Navbar } from './components/Navbar';
import { TodayView } from './components/TodayView';
import { DailyHistoryView } from './components/DailyHistoryView';
import { StandaloneNotesView } from './components/StandaloneNotesView';
import { MobileCodeHub } from './components/MobileCodeHub';
import { MobileAppShell } from './components/mobile/MobileAppShell';
import { ServerAdminDashboard } from './components/server/ServerAdminDashboard';
import { ServerAuthModal } from './components/server/ServerAuthModal';
import { QuickCaptureModal } from './components/QuickCaptureModal';
import { HistoricalCompletionModal } from './components/HistoricalCompletionModal';
import { TaskHistoryDrawer } from './components/TaskHistoryDrawer';
import { SettingsModal } from './components/SettingsModal';
import { Check } from 'lucide-react';

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

  // Server Authentication State
  const [serverAuth, setServerAuth] = useState<ServerAuthState>(() => {
    try {
      const saved = localStorage.getItem('daymark_server_auth');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return { isLoggedIn: false, username: '', token: null };
  });

  const [isServerAuthModalOpen, setIsServerAuthModalOpen] = useState(false);

  // Core vault state
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [dailyDocs, setDailyDocs] = useState<DailyDocument[]>(loadDailyDocuments);
  const [notes, setNotes] = useState<StandaloneNote[]>(loadStandaloneNotes);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>(loadSyncLogs);

  // Current active date
  // "Today" is the real local date (updates at midnight) unless a developer override is set
  const realToday = useRealToday();
  const today = resolveToday(settings.simulatedToday, realToday);
  const [currentDate, setCurrentDate] = useState<string>(today);
  const [historySelectedDate, setHistorySelectedDate] = useState<string>(getPreviousDate(today, 1));

  // Deep link target for the mobile shell (?tab=notes from manifest shortcuts)
  const [initialMobileTab] = useState<MobileTab | undefined>(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    return tab === 'today' || tab === 'history' || tab === 'notes' ? tab : undefined;
  });

  // First-run welcome (empty vault) and dev-only UI
  const [showWelcome, setShowWelcome] = useState<boolean>(needsOnboarding);
  const devMode =
    typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).has('dev') || localStorage.getItem('daymark_dev') === '1');

  // Modals & Drawers state
  const [isQuickCaptureOpen, setIsQuickCaptureOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [historicalModalTask, setHistoricalModalTask] = useState<TaskItem | null>(null);
  const [historyDrawerTask, setHistoryDrawerTask] = useState<TaskItem | null>(null);

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Surface storage failures instead of silently losing edits
  useEffect(() => subscribeStorageErrors((msg) => showToast(msg)), []);

  // When the day changes (midnight, or waking the phone next day), follow it if the user was
  // viewing today, and carry unfinished tasks into the new day automatically.
  const previousTodayRef = React.useRef(today);
  useEffect(() => {
    const previousToday = previousTodayRef.current;
    previousTodayRef.current = today;
    if (previousToday !== today) {
      setCurrentDate((prev) => (prev === previousToday ? today : prev));
      setHistorySelectedDate(getPreviousDate(today, 1));
    }
    const { updatedDocs, carriedCount } = performDailyRollover(
      today,
      dailyDocs,
      settings.statuses,
      settings.defaultHeadings
    );
    if (carriedCount > 0) {
      setDailyDocs(updatedDocs);
      showToast(
        `${carriedCount} unfinished ${carriedCount === 1 ? 'task' : 'tasks'} carried forward to ${today}.`
      );
    }
    // Runs when the effective date changes; performDailyRollover is idempotent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  // Deep links from the PWA manifest shortcuts (?action=capture)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('action') === 'capture') {
      setIsQuickCaptureOpen(true);
    }
  }, []);

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

  useEffect(() => {
    saveSyncLogs(syncLogs);
  }, [syncLogs]);

  useEffect(() => {
    try {
      localStorage.setItem('daymark_server_auth', JSON.stringify(serverAuth));
    } catch (e) {}
  }, [serverAuth]);

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

  // Handler: Execute idempotent daily rollover
  const handleTriggerRollover = () => {
    const { updatedDocs, carriedCount } = performDailyRollover(
      currentDate,
      dailyDocs,
      settings.statuses,
      settings.defaultHeadings
    );
    setDailyDocs(updatedDocs);
    if (carriedCount > 0) {
      showToast(
        `Rollover complete: ${carriedCount} ${
          carriedCount === 1 ? 'task' : 'tasks'
        } carried forward to ${currentDate}. History preserved.`
      );
    } else {
      showToast(`Rollover up-to-date: 0 new tasks carried forward.`);
    }
  };

  // Handler: Historical Completion Correction (PRD §7)
  const handleConfirmHistoricalCorrection = (
    taskId: string,
    effectiveCompletedDate: string,
    note?: string
  ) => {
    const { updatedDocs, updatedTask } = correctHistoricalCompletion(
      taskId,
      effectiveCompletedDate,
      currentDate,
      dailyDocs,
      note
    );
    setDailyDocs(updatedDocs);
    if (updatedTask) {
      showToast(
        `Marked "${updatedTask.title}" done on ${effectiveCompletedDate}. Removed from active list.`
      );
    }
  };

  const handleQuickHistoricalDone = (taskId: string, targetDate: string) => {
    handleConfirmHistoricalCorrection(taskId, targetDate, 'Quick completed from carry-forward entry');
  };

  // Handler: Reopen Task
  const handleReopenTask = (taskId: string, targetDate = currentDate) => {
    const { updatedDocs, updatedTask } = reopenTask(taskId, targetDate, dailyDocs);
    setDailyDocs(updatedDocs);
    if (updatedTask) {
      showToast(`Reopened "${updatedTask.title}" in ${targetDate} notebook.`);
    }
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
          details: `Captured to #${heading.name}`,
        },
      ],
    };

    heading.items.push(newTask);
    doc.updatedAt = new Date().toISOString();
    setDailyDocs(newDocs);
    showToast(`Task added to #${heading.name}`);
  };

  // Handler: Quick add task from widget/mobile hub
  const handleQuickAddTaskFromHub = (title: string, sectionName: string) => {
    handleQuickCapture({
      title,
      heading: sectionName,
      status: 'in-progress',
    });
  };

  // Handler: Toggle Task Done
  const handleToggleTaskDone = (taskId: string) => {
    const result = toggleTaskDoneInDocument(currentDoc, taskId, currentDate);
    if (!result) return;
    handleUpdateDocument(result.doc);
    showToast(result.nowDone ? `Completed "${result.task.title}"` : `Reopened "${result.task.title}"`);
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
  useWidgetSync(today, dailyDocs.find((d) => d.date === today), handleWidgetToggle);

  // Handler: Export Vault as ZIP
  const handleExportVaultZip = async () => {
    try {
      await exportVaultAsZip(dailyDocs, notes, settings);
      showToast('Exported complete Markdown vault ZIP.');
    } catch (err) {
      console.error(err);
      alert('Failed to export vault as zip.');
    }
  };

  // Handler: Export JSON
  const handleExportJson = async () => {
    try {
      await exportVaultAsJson(dailyDocs, notes, settings);
      showToast('Daymark JSON backup ready.');
    } catch (err) {
      console.error(err);
      alert('Failed to export the JSON backup.');
    }
  };

  // After replacing the vault (sample data, import), carry unfinished tasks into today
  const rolloverIntoToday = (docs: DailyDocument[], s: AppSettings): DailyDocument[] =>
    performDailyRollover(resolveToday(s.simulatedToday, realToday), docs, s.statuses, s.defaultHeadings).updatedDocs;

  // Importing replaces the whole vault, so ask first when there is existing data
  const confirmReplaceVault = () =>
    (dailyDocs.length === 0 && notes.length === 0) ||
    window.confirm(
      'Importing replaces everything currently in this vault. Export a backup first if you are unsure.\n\nReplace the current vault?'
    );

  // Handler: Import JSON
  const handleImportJson = (jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.daily_documents && parsed.standalone_notes) {
        if (!confirmReplaceVault()) return;
        const nextSettings: AppSettings = parsed.settings || settings;
        setDailyDocs(rolloverIntoToday(parsed.daily_documents, nextSettings));
        setNotes(parsed.standalone_notes);
        if (parsed.settings) setSettings(parsed.settings);
        markOnboarded();
        showToast('Vault successfully restored from backup.');
      } else {
        alert('Invalid Daymark backup format.');
      }
    } catch (err) {
      alert('Error parsing JSON backup file.');
    }
  };

  // Handler: Import vault ZIP (Daymark export or a folder of Markdown files)
  const handleImportZip = async (file: File) => {
    try {
      const snapshot = await importVaultFromZip(file, settings.defaultHeadings);
      if (!confirmReplaceVault()) return;
      setDailyDocs(rolloverIntoToday(snapshot.docs, snapshot.settings || settings));
      setNotes(snapshot.notes);
      if (snapshot.settings) setSettings(snapshot.settings);
      markOnboarded();
      showToast(`Imported ${snapshot.docs.length} daily notes and ${snapshot.notes.length} notes from ZIP.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not read this ZIP file.');
    }
  };

  // Handler: Load the sample vault
  const handleResetVault = () => {
    const res = resetVaultToSeedData();
    setSettings(res.settings);
    setDailyDocs(rolloverIntoToday(res.docs, res.settings));
    setNotes(res.notes);
    setCurrentDate(resolveToday(res.settings.simulatedToday, realToday));
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

  // Handler: Mobile Sync Complete Callback from server
  const handleMobileSyncComplete = (serverDocs: DailyDocument[], serverNotes: StandaloneNote[]) => {
    if (serverDocs && serverDocs.length > 0) setDailyDocs(serverDocs);
    if (serverNotes && serverNotes.length > 0) setNotes(serverNotes);
    showToast('Vault reconciled with self-hosted server.');
  };

  return (
    <div className="min-h-screen bg-stone-900 text-stone-100 flex flex-col">
      {/* 1. PRIMARY DESKTOP MODE: FULL WIDTH NOTES APPLICATION */}
      {appMode === 'desktop' && (
        <div className="flex flex-col min-h-screen w-full">
          <Navbar
            activeTab={activeDesktopTab}
            onTabChange={(tab) => {
              if (tab === 'settings') setIsSettingsOpen(true);
              else setActiveDesktopTab(tab);
            }}
            onOpenQuickCapture={() => setIsQuickCaptureOpen(true)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onExportZip={handleExportVaultZip}
            onSwitchToMobileApp={() => setAppMode('mobile-app')}
            simulatedToday={today}
            syncStatus={settings.syncConfig.status}
            carriedAlertCount={carriedAlertCount}
            showDevTabs={devMode}
          />

          <main className="flex-1 w-full bg-stone-900">
            {activeDesktopTab === 'today' && (
              <TodayView
                currentDocument={currentDoc}
                simulatedToday={today}
                statuses={settings.statuses}
                agingThresholds={settings.agingThresholds}
                defaultHeadings={settings.defaultHeadings}
                onDateChange={setCurrentDate}
                onUpdateDocument={handleUpdateDocument}
                onOpenHistoricalModal={setHistoricalModalTask}
                onOpenHistoryDrawer={setHistoryDrawerTask}
                onQuickHistoricalDone={handleQuickHistoricalDone}
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
              />
            )}

            {activeDesktopTab === 'notes' && (
              <StandaloneNotesView notes={notes} onUpdateNotes={setNotes} />
            )}

            {activeDesktopTab === 'server' && (
              <ServerAdminDashboard
                username={serverAuth.username || 'admin'}
                onLogout={() => {
                  setServerAuth({ isLoggedIn: false, username: '', token: null });
                  showToast('Signed out of Self-Hosted Server.');
                }}
                onSwitchToMobile={() => setAppMode('mobile-app')}
                onSwitchToDesktop={() => setActiveDesktopTab('today')}
                dailyDocs={dailyDocs}
                notes={notes}
                settings={settings}
                onExportZip={handleExportVaultZip}
              />
            )}

            {activeDesktopTab === 'mobile-code' && (
              <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <MobileCodeHub
                  currentDocument={currentDoc}
                  simulatedToday={today}
                  statuses={settings.statuses}
                  onToggleTaskDone={handleToggleTaskDone}
                  onQuickHistoricalDone={handleQuickHistoricalDone}
                  onQuickAddTask={handleQuickAddTaskFromHub}
                />
              </div>
            )}
          </main>
        </div>
      )}

      {/* 2. DEDICATED MOBILE APP MODE: TAILORED FOR MOBILE USERS */}
      {appMode === 'mobile-app' && (
        <MobileAppShell
          currentDocument={currentDoc}
          dailyDocs={dailyDocs}
          notes={notes}
          settings={settings}
          simulatedToday={today}
          onDateChange={setCurrentDate}
          onUpdateDocument={handleUpdateDocument}
          onUpdateNotes={setNotes}
          onSaveSettings={setSettings}
          onOpenQuickCapture={() => setIsQuickCaptureOpen(true)}
          onOpenHistoricalModal={setHistoricalModalTask}
          onOpenHistoryDrawer={setHistoryDrawerTask}
          onQuickHistoricalDone={handleQuickHistoricalDone}
          onReopenTask={handleReopenTask}
          onTriggerRollover={handleTriggerRollover}
          onSwitchToServerAdmin={() => {
            if (serverAuth.isLoggedIn) {
              setAppMode('web-server');
            } else {
              setIsServerAuthModalOpen(true);
            }
          }}
          onSwitchToDesktop={() => setAppMode('desktop')}
          initialTab={initialMobileTab}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onSyncComplete={handleMobileSyncComplete}
        />
      )}

      {/* 3. ADVANCED WEB SERVER VIEW: SELF-HOSTED DASHBOARD */}
      {appMode === 'web-server' && (
        <ServerAdminDashboard
          username={serverAuth.username || 'admin'}
          onLogout={() => {
            setServerAuth({ isLoggedIn: false, username: '', token: null });
            setAppMode('desktop');
            showToast('Signed out of Self-Hosted Server.');
          }}
          onSwitchToMobile={() => setAppMode('mobile-app')}
          onSwitchToDesktop={() => setAppMode('desktop')}
          dailyDocs={dailyDocs}
          notes={notes}
          settings={settings}
          onExportZip={handleExportVaultZip}
        />
      )}

      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed z-50 left-4 right-4 sm:left-auto sm:right-6 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] sm:bottom-6 max-w-md flex items-center gap-2 px-4 py-2.5 bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900 rounded-lg shadow-xl text-xs font-medium animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Server Authentication Modal */}
      <ServerAuthModal
        isOpen={isServerAuthModalOpen}
        onClose={() => setIsServerAuthModalOpen(false)}
        onLoginSuccess={(user) => {
          setServerAuth({ isLoggedIn: true, username: user.username, token: user.token });
          setAppMode('web-server');
          showToast(`Logged into Self-Hosted Server as ${user.username}`);
        }}
      />

      {/* Historical Completion Modal */}
      <HistoricalCompletionModal
        task={historicalModalTask}
        currentDate={currentDate}
        isOpen={Boolean(historicalModalTask)}
        onClose={() => setHistoricalModalTask(null)}
        onConfirm={handleConfirmHistoricalCorrection}
      />

      {/* Task Audit Trail & History Drawer */}
      <TaskHistoryDrawer
        task={historyDrawerTask}
        currentDate={currentDate}
        statuses={settings.statuses}
        onClose={() => setHistoryDrawerTask(null)}
        onReopenTask={handleReopenTask}
        onOpenHistoricalCorrection={(task) => {
          setHistoryDrawerTask(null);
          setHistoricalModalTask(task);
        }}
      />

      {/* Quick Capture Modal */}
      <QuickCaptureModal
        isOpen={isQuickCaptureOpen}
        onClose={() => setIsQuickCaptureOpen(false)}
        headings={settings.defaultHeadings}
        statuses={settings.statuses}
        simulatedToday={today}
        onCapture={handleQuickCapture}
      />

      {/* First-run welcome */}
      <WelcomeModal isOpen={showWelcome} onStartEmpty={handleStartEmpty} onLoadSample={handleLoadSample} />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        syncLogs={syncLogs}
        onSaveSettings={(newSettings) => {
          setSettings(newSettings);
          setCurrentDate(resolveToday(newSettings.simulatedToday, realToday));
        }}
        onExportZip={handleExportVaultZip}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onImportZip={handleImportZip}
        onResetVault={handleResetVault}
        onTriggerSync={() => {}}
      />
    </div>
  );
}
