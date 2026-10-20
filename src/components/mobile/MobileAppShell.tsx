import React, { useState } from 'react';
import {
  Calendar,
  FileText,
  FolderOpen,
  Server,
  Settings,
  Plus,
  RefreshCw,
  Lock,
  ChevronLeft,
  ChevronRight,
  Sliders,
  CheckCircle2,
  Clock,
  Smartphone,
  Maximize2,
  Minimize2,
  Monitor,
  Search,
  Pin,
  Trash2,
  Edit2,
  Eye,
  Bold,
  Italic,
  CheckSquare,
  Code,
  Link2,
  ArrowLeft,
  FilePlus,
} from 'lucide-react';
import {
  AppSettings,
  DailyDocument,
  MobileTab,
  StandaloneNote,
  StatusDefinition,
  TaskItem,
} from '../../types/daymark';
import { useOnlineStatus, usePwaInstall } from '../../hooks/usePwa';
import { TodayView } from '../TodayView';
import { DailyHistoryView } from '../DailyHistoryView';
import { SyncStatus } from '../../hooks/useSync';
import { MarkdownPreview } from '../MarkdownPreview';
import { formatFullDate, getNextDate, getPreviousDate } from '../../utils/lifecycleEngine';

interface MobileAppShellProps {
  currentDocument: DailyDocument;
  dailyDocs: DailyDocument[];
  notes: StandaloneNote[];
  settings: AppSettings;
  simulatedToday: string;
  onDateChange: (date: string) => void;
  onUpdateDocument: (doc: DailyDocument) => void;
  onUpdateNotes: (notes: StandaloneNote[]) => void;
  onSaveSettings: (settings: AppSettings) => void;
  onOpenQuickCapture: () => void;
  onOpenHistoricalModal: (task: TaskItem) => void;
  onOpenHistoryDrawer: (task: TaskItem) => void;
  onQuickHistoricalDone: (taskId: string, targetDate: string) => void;
  onReopenTask: (taskId: string, targetDate: string) => void;
  onTriggerRollover: () => void;
  onSwitchToServerAdmin: () => void;
  onSwitchToDesktop?: () => void;
  syncStatus: SyncStatus;
  /** Content of the Sync tab (sync connection + server management). */
  syncTab: React.ReactNode;
  initialTab?: MobileTab;
  onOpenSettings?: () => void;
}

const SYNC_PILL: Record<SyncStatus, { dot: string; label: string }> = {
  off: { dot: 'bg-stone-500', label: 'Local only' },
  idle: { dot: 'bg-emerald-500', label: 'Synced' },
  syncing: { dot: 'bg-amber-500 animate-pulse', label: 'Syncing' },
  offline: { dot: 'bg-amber-500', label: 'Offline' },
  error: { dot: 'bg-rose-500', label: 'Sync error' },
};

export const MobileAppShell: React.FC<MobileAppShellProps> = ({
  currentDocument,
  dailyDocs,
  notes,
  settings,
  simulatedToday,
  onDateChange,
  onUpdateDocument,
  onUpdateNotes,
  onSaveSettings,
  onOpenQuickCapture,
  onOpenHistoricalModal,
  onOpenHistoryDrawer,
  onQuickHistoricalDone,
  onReopenTask,
  onTriggerRollover,
  onSwitchToServerAdmin,
  onSwitchToDesktop,
  syncStatus,
  syncTab,
  initialTab,
  onOpenSettings,
}) => {
  const [activeTab, setActiveTab] = useState<MobileTab>(initialTab ?? 'today');
  const isOnline = useOnlineStatus();
  const { canInstall, install } = usePwaInstall();
  const [deviceFrameMode, setDeviceFrameMode] = useState<boolean>(() => {
    // If screen is wider than 768px, use phone frame by default on desktop; otherwise full canvas on phone
    return typeof window !== 'undefined' ? window.innerWidth >= 768 : false;
  });
  const [historySelectedDate, setHistorySelectedDate] = useState<string>(
    getPreviousDate(simulatedToday, 1)
  );

  // Dedicated Mobile Notes State
  const [mobileSelectedNoteId, setMobileSelectedNoteId] = useState<string | null>(notes[0]?.id || null);
  const [mobileNoteView, setMobileNoteView] = useState<'list' | 'editor'>('list');
  const [mobileFolderFilter, setMobileFolderFilter] = useState<string>('all');
  const [mobileSearchQuery, setMobileSearchQuery] = useState('');
  const [mobileEditorTab, setMobileEditorTab] = useState<'edit' | 'preview'>('edit');

  const mobileActiveNote = notes.find((n) => n.id === mobileSelectedNoteId) || null;

  // Unique folders
  const allFolders = React.useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) {
      if (n.folder) set.add(n.folder);
    }
    return Array.from(set).sort();
  }, [notes]);

  // Filtered notes for mobile
  const mobileFilteredNotes = React.useMemo(() => {
    return notes.filter((n) => {
      const matchFolder = mobileFolderFilter === 'all' || n.folder === mobileFolderFilter;
      const q = mobileSearchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags?.some((t) => t.toLowerCase().includes(q));
      return matchFolder && matchSearch;
    });
  }, [notes, mobileFolderFilter, mobileSearchQuery]);

  const handleUpdateActiveMobileNote = (updates: Partial<StandaloneNote>) => {
    if (!mobileActiveNote) return;
    const updated = notes.map((n) =>
      n.id === mobileActiveNote.id ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n
    );
    onUpdateNotes(updated);
  };

  const handleCreateMobileNote = () => {
    const newNote: StandaloneNote = {
      id: `note-${Date.now()}`,
      title: 'Untitled Note',
      folder: mobileFolderFilter === 'all' ? 'Personal' : mobileFolderFilter,
      content: '# Untitled Note\n\nWrite your thoughts, checklist, or daily reflections...',
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pinned: false,
    };
    onUpdateNotes([newNote, ...notes]);
    setMobileSelectedNoteId(newNote.id);
    setMobileNoteView('editor');
    setMobileEditorTab('edit');
  };

  const handleDeleteMobileNote = (id: string) => {
    if (confirm('Delete this note?')) {
      const updated = notes.filter((n) => n.id !== id);
      onUpdateNotes(updated);
      setMobileNoteView('list');
      setMobileSelectedNoteId(updated[0]?.id || null);
    }
  };

  const handleToggleMobileCheckbox = (taskIndex: number, newChecked: boolean) => {
    if (!mobileActiveNote) return;
    let count = 0;
    const updatedContent = mobileActiveNote.content.replace(/([-*]\s*\[)([ xX])(\])/g, (match, prefix, cur, suffix) => {
      if (count === taskIndex) {
        count++;
        return `${prefix}${newChecked ? 'x' : ' '}${suffix}`;
      }
      count++;
      return match;
    });
    handleUpdateActiveMobileNote({ content: updatedContent });
  };

  const insertMobileFormatting = (prefix: string, suffix = '') => {
    if (!mobileActiveNote) return;
    const textarea = document.getElementById('mobile-note-textarea') as HTMLTextAreaElement | null;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = mobileActiveNote.content;
    const selected = current.substring(start, end);

    const replacement = `${prefix}${selected || 'text'}${suffix}`;
    const newContent = current.substring(0, start) + replacement + current.substring(end);
    handleUpdateActiveMobileNote({ content: newContent });
  };

  return (
    <div className="min-h-screen bg-stone-900 text-stone-100 flex flex-col items-center justify-start sm:py-3">
      {/* Top Banner on Desktop Screen: Mode Switcher */}
      <div className="hidden sm:flex w-full max-w-4xl px-4 py-2 items-center justify-between text-xs border-b border-stone-800 bg-stone-950/90 mb-2 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block shadow-2xs" />
          <span className="font-bold text-stone-200">Daymark Mobile</span>
          <span className="text-[11px] text-stone-400 hidden sm:inline">
            · Dedicated Mobile Note Taking App
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Frame mode toggle for desktop */}
          <button
            onClick={() => setDeviceFrameMode(!deviceFrameMode)}
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-stone-800 text-stone-300 hover:text-white transition-colors text-[11px]"
            title="Toggle between phone frame and full width canvas"
          >
            {deviceFrameMode ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            <span>{deviceFrameMode ? 'Full Canvas' : 'Phone Frame'}</span>
          </button>

          {/* Switch to Full-Width Desktop App */}
          {onSwitchToDesktop && (
            <button
              onClick={onSwitchToDesktop}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-stone-800 text-stone-200 hover:bg-stone-700 transition-colors font-semibold text-[11px]"
              title="Return to full-width desktop layout"
            >
              <Monitor className="w-3.5 h-3.5 text-amber-400" />
              <span>Desktop View</span>
            </button>
          )}

          {/* Switch to Self-Hosted Web Server (Advanced Feature) */}
          <button
            onClick={onSwitchToServerAdmin}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-600/20 text-amber-300 hover:bg-amber-600/30 border border-amber-500/40 font-semibold transition-colors text-[11px]"
          >
            <Server className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Self-Hosted Server</span>
          </button>
        </div>
      </div>

      {/* MOBILE APPLICATION CONTAINER */}
      <div
        className={`w-full flex-1 flex flex-col transition-all ${
          deviceFrameMode
            ? 'sm:max-w-[430px] sm:min-h-[820px] sm:max-h-[880px] sm:bg-stone-950 sm:border-4 sm:border-stone-800 sm:rounded-[44px] sm:shadow-2xl sm:overflow-hidden relative'
            : 'max-w-2xl bg-stone-50 dark:bg-stone-950 min-h-screen'
        }`}
      >
        {/* Simulated Mobile Status Bar (Visible in frame mode on desktop) */}
        {deviceFrameMode && (
          <div className="hidden sm:flex items-center justify-between px-6 pt-3 pb-1 text-[11px] font-mono text-stone-400 select-none bg-stone-950">
            <span>09:41</span>
            {/* Dynamic Island / Speaker notch */}
            <div className="w-24 h-4 bg-stone-900 rounded-full flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-stone-950" />
            </div>
            <div className="flex items-center gap-1.5">
              <span>5G</span>
              <span className="w-3.5 h-2 border border-stone-400 rounded-xs flex items-center p-0.5">
                <span className="h-full w-2 bg-stone-400 rounded-2xs" />
              </span>
            </div>
          </div>
        )}

        {/* Mobile App Header Bar */}
        <div className="px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] bg-stone-900/90 backdrop-blur-md border-b border-stone-800 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-xs bg-amber-500 inline-block" />
            <span className="font-bold text-xs tracking-tight text-white">Daymark Mobile</span>
            <span className="text-[10px] font-mono text-stone-400">({simulatedToday})</span>
          </div>

          <div className="flex items-center gap-2">
            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                aria-label="Settings, backup and import"
                className="inline-flex items-center justify-center w-9 h-9 -my-1 rounded-md text-stone-300 hover:text-amber-400"
              >
                <Settings className="w-4.5 h-4.5" />
              </button>
            )}
            {canInstall && (
              <button
                onClick={install}
                className="px-2.5 min-h-[32px] rounded-md bg-amber-600 text-white text-[11px] font-semibold"
              >
                Install app
              </button>
            )}
            <button
              onClick={() => setActiveTab('sync')}
              className="inline-flex items-center gap-1 text-[11px] font-mono text-stone-400 hover:text-amber-400 transition-colors"
            >
              <span className={`w-2 h-2 rounded-full ${SYNC_PILL[syncStatus].dot}`} />
              <span>{SYNC_PILL[syncStatus].label}</span>
            </button>
          </div>
        </div>

        {!isOnline && (
          <div role="status" className="px-4 py-1.5 bg-amber-100 text-amber-900 text-[11px] border-b border-amber-300">
            Offline. Changes are saved on this device and nothing is lost.
          </div>
        )}

        {/* Scrollable Mobile App Body */}
        <div className="flex-1 overflow-y-auto pb-20 bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100">
          {/* TAB 1: TODAY DAILY NOTEBOOK */}
          {activeTab === 'today' && (
            <div className="p-3 sm:p-4 space-y-4">
              <TodayView
                currentDocument={currentDocument}
                simulatedToday={simulatedToday}
                statuses={settings.statuses}
                agingThresholds={settings.agingThresholds}
                defaultHeadings={settings.defaultHeadings}
                onDateChange={onDateChange}
                onUpdateDocument={onUpdateDocument}
                onOpenHistoricalModal={onOpenHistoricalModal}
                onOpenHistoryDrawer={onOpenHistoryDrawer}
                onQuickHistoricalDone={onQuickHistoricalDone}
                onTriggerRollover={onTriggerRollover}
              />
            </div>
          )}

          {/* TAB 2: DAILY HISTORY CALENDAR */}
          {activeTab === 'history' && (
            <div className="p-3 sm:p-4 space-y-4">
              <DailyHistoryView
                dailyDocuments={dailyDocs}
                selectedDate={historySelectedDate}
                simulatedToday={simulatedToday}
                statuses={settings.statuses}
                onSelectDate={setHistorySelectedDate}
                onReopenTask={onReopenTask}
              />
            </div>
          )}

          {/* TAB 3: DEDICATED FULL MOBILE NOTES EXPERIENCE */}
          {activeTab === 'notes' && (
            <div className="flex flex-col h-full min-h-[500px]">
              {mobileNoteView === 'list' ? (
                /* Mobile Notes List Screen */
                <div className="p-3 sm:p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-stone-200 dark:border-stone-800">
                    <div>
                      <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                        <FolderOpen className="w-4 h-4 text-amber-600" />
                        <span>All Notes</span>
                      </h2>
                      <span className="text-[11px] text-stone-500 dark:text-stone-400">
                        {mobileFilteredNotes.length} notes
                      </span>
                    </div>

                    <button
                      onClick={handleCreateMobileNote}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>New Note</span>
                    </button>
                  </div>

                  {/* Search */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search notes..."
                      value={mobileSearchQuery}
                      onChange={(e) => setMobileSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                    />
                  </div>

                  {/* Folder Chips */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                    <button
                      onClick={() => setMobileFolderFilter('all')}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                        mobileFolderFilter === 'all'
                          ? 'bg-amber-600 text-white font-semibold'
                          : 'bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
                      }`}
                    >
                      All ({notes.length})
                    </button>
                    {allFolders.map((f) => (
                      <button
                        key={f}
                        onClick={() => setMobileFolderFilter(f)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                          mobileFolderFilter === f
                            ? 'bg-amber-600 text-white font-semibold'
                            : 'bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>

                  {/* Notes Cards */}
                  <div className="space-y-2 pt-1">
                    {mobileFilteredNotes.length > 0 ? (
                      mobileFilteredNotes.map((note) => (
                        <div
                          key={note.id}
                          onClick={() => {
                            setMobileSelectedNoteId(note.id);
                            setMobileNoteView('editor');
                          }}
                          className="p-3 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 hover:border-amber-500/50 cursor-pointer shadow-2xs transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold text-xs text-stone-900 dark:text-stone-100 truncate">
                              {note.title}
                            </h3>
                            {note.pinned && <Pin className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />}
                          </div>

                          <div className="mt-1 flex items-center gap-2 text-[10px] text-stone-500">
                            <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                              {note.folder}
                            </span>
                            <span>{new Date(note.updatedAt).toLocaleDateString()}</span>
                          </div>

                          <p className="mt-1.5 text-[11px] text-stone-400 line-clamp-2 leading-relaxed">
                            {note.content.replace(/^#+\s+/gm, '').replace(/\n+/g, ' ')}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-xs text-stone-400">
                        No notes found in {mobileFolderFilter}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Mobile Single Note Editor Screen */
                mobileActiveNote && (
                  <div className="flex flex-col h-full">
                    {/* Mobile Editor Header */}
                    <div className="p-3 border-b border-stone-200 dark:border-stone-800 bg-white/90 dark:bg-stone-900/90 backdrop-blur-md flex items-center justify-between gap-2 sticky top-0 z-20">
                      <button
                        onClick={() => setMobileNoteView('list')}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Notes</span>
                      </button>

                      {/* Segmented Edit vs Preview */}
                      <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 p-0.5 rounded-lg text-xs">
                        <button
                          onClick={() => setMobileEditorTab('edit')}
                          className={`px-2.5 py-1 rounded-md transition-colors ${
                            mobileEditorTab === 'edit'
                              ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 font-bold shadow-2xs'
                              : 'text-stone-500'
                          }`}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setMobileEditorTab('preview')}
                          className={`px-2.5 py-1 rounded-md transition-colors ${
                            mobileEditorTab === 'preview'
                              ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 font-bold shadow-2xs'
                              : 'text-stone-500'
                          }`}
                        >
                          Preview
                        </button>
                      </div>

                      <button
                        onClick={() => handleDeleteMobileNote(mobileActiveNote.id)}
                        className="p-1.5 text-stone-400 hover:text-rose-500 rounded"
                        title="Delete Note"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Note Title & Folder input */}
                    <div className="p-3 bg-stone-50/60 dark:bg-stone-900/40 border-b border-stone-200/60 dark:border-stone-800 space-y-1.5">
                      <input
                        type="text"
                        value={mobileActiveNote.title}
                        onChange={(e) => handleUpdateActiveMobileNote({ title: e.target.value })}
                        className="w-full text-sm font-bold bg-transparent border-0 focus:outline-hidden text-stone-900 dark:text-stone-100"
                        placeholder="Note Title"
                      />
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-[10px] text-stone-400">Folder:</span>
                        <select
                          value={mobileActiveNote.folder}
                          onChange={(e) => handleUpdateActiveMobileNote({ folder: e.target.value })}
                          className="text-[11px] px-2 py-0.5 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded text-stone-700 dark:text-stone-300 font-medium"
                        >
                          {allFolders.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Content Area */}
                    {mobileEditorTab === 'edit' ? (
                      <div className="flex-1 flex flex-col p-3 space-y-2">
                        {/* Mobile Quick Markdown Formatting Bar */}
                        <div className="flex items-center gap-1 pb-1 overflow-x-auto text-xs border-b border-stone-200 dark:border-stone-800">
                          <button
                            type="button"
                            onClick={() => insertMobileFormatting('**', '**')}
                            className="p-1.5 rounded hover:bg-stone-200 dark:hover:bg-stone-800 font-bold text-xs"
                            title="Bold"
                          >
                            B
                          </button>
                          <button
                            type="button"
                            onClick={() => insertMobileFormatting('*', '*')}
                            className="p-1.5 rounded hover:bg-stone-200 dark:hover:bg-stone-800 italic text-xs"
                            title="Italic"
                          >
                            I
                          </button>
                          <button
                            type="button"
                            onClick={() => insertMobileFormatting('- [ ] ')}
                            className="p-1.5 rounded hover:bg-stone-200 dark:hover:bg-stone-800"
                            title="Checklist item"
                          >
                            <CheckSquare className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => insertMobileFormatting('- ')}
                            className="px-2 py-0.5 rounded hover:bg-stone-200 dark:hover:bg-stone-800 text-[11px]"
                            title="Bullet"
                          >
                            • List
                          </button>
                          <button
                            type="button"
                            onClick={() => insertMobileFormatting('```\n', '\n```')}
                            className="p-1.5 rounded hover:bg-stone-200 dark:hover:bg-stone-800"
                            title="Code block"
                          >
                            <Code className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => insertMobileFormatting('[[', ']]')}
                            className="px-2 py-0.5 rounded hover:bg-stone-200 dark:hover:bg-stone-800 text-[11px] font-semibold text-amber-600"
                            title="Internal Link"
                          >
                            [[Link]]
                          </button>
                        </div>

                        <textarea
                          id="mobile-note-textarea"
                          value={mobileActiveNote.content}
                          onChange={(e) => handleUpdateActiveMobileNote({ content: e.target.value })}
                          rows={18}
                          className="w-full flex-1 p-3 text-xs sm:text-sm font-mono leading-relaxed bg-transparent border-0 focus:outline-hidden text-stone-900 dark:text-stone-100 resize-none selection:bg-amber-500/30"
                          placeholder="Write your Markdown notes here..."
                        />
                      </div>
                    ) : (
                      /* Mobile Markdown Preview */
                      <div className="flex-1 p-4 overflow-y-auto">
                        <MarkdownPreview
                          content={mobileActiveNote.content}
                          onToggleTaskItem={handleToggleMobileCheckbox}
                        />
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          )}

          {/* TAB 4: MOBILE SYNC CONNECT */}
          {activeTab === 'sync' && (
            <div className="p-3 sm:p-4">{syncTab}</div>
          )}

          {/* TAB 5: MOBILE SETTINGS */}
          {activeTab === 'settings' && (
            <div className="p-4 space-y-4 text-xs">
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                Mobile Settings & Rules
              </h2>
              <div className="p-4 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 space-y-3">
                <div className="font-semibold text-stone-800 dark:text-stone-200">
                  Carry-Forward Aging Thresholds
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>Attention Threshold</span>
                  <span className="font-mono font-semibold text-amber-600">
                    ≥ {settings.agingThresholds.attentionDays} days
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>Critical Threshold</span>
                  <span className="font-mono font-semibold text-rose-600">
                    ≥ {settings.agingThresholds.criticalDays} days
                  </span>
                </div>
              </div>

              <div className="p-4 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 space-y-2">
                <div className="font-semibold text-stone-800 dark:text-stone-200">
                  Daily Rollover Engine
                </div>
                <p className="text-[11px] text-stone-500">
                  Unfinished tasks marked with In Progress, Blocked, or Waiting carry forward automatically each day.
                </p>
                <button
                  onClick={onTriggerRollover}
                  className="w-full py-2 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 rounded-lg font-medium flex items-center justify-center gap-2 mt-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Re-run Rollover Reconciliation</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* NATIVE MOBILE BOTTOM NAVIGATION BAR */}
        <div
          className={`bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-t border-stone-200 dark:border-stone-800 flex items-center justify-around pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] px-2 shadow-lg z-30 ${
            deviceFrameMode ? 'absolute bottom-0 left-0 right-0' : 'fixed bottom-0 left-0 right-0'
          }`}
        >
          <button
            onClick={() => setActiveTab('today')}
            className={`flex flex-col items-center justify-center p-1 min-w-[50px] min-h-[44px] rounded-lg text-[10px] font-medium transition-colors ${
              activeTab === 'today'
                ? 'text-amber-600 dark:text-amber-400 font-bold'
                : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-100'
            }`}
          >
            <Calendar className="w-4 h-4 mb-0.5" />
            <span>Today</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex flex-col items-center justify-center p-1 min-w-[50px] min-h-[44px] rounded-lg text-[10px] font-medium transition-colors ${
              activeTab === 'history'
                ? 'text-amber-600 dark:text-amber-400 font-bold'
                : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-100'
            }`}
          >
            <FileText className="w-4 h-4 mb-0.5" />
            <span>History</span>
          </button>

          {/* Central 1-Tap Quick Capture Button */}
          <button
            onClick={onOpenQuickCapture}
            className="flex items-center justify-center w-11 h-11 -mt-4 rounded-full bg-amber-600 text-white shadow-md active:scale-95 transition-transform shrink-0"
            title="Quick Capture"
          >
            <Plus className="w-5 h-5 stroke-[2.5]" />
          </button>

          <button
            onClick={() => {
              setActiveTab('notes');
              setMobileNoteView('list');
            }}
            className={`flex flex-col items-center justify-center p-1 min-w-[50px] min-h-[44px] rounded-lg text-[10px] font-medium transition-colors ${
              activeTab === 'notes'
                ? 'text-amber-600 dark:text-amber-400 font-bold'
                : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-100'
            }`}
          >
            <FolderOpen className="w-4 h-4 mb-0.5" />
            <span>Notes</span>
          </button>

          <button
            onClick={() => setActiveTab('sync')}
            className={`flex flex-col items-center justify-center p-1 min-w-[50px] min-h-[44px] rounded-lg text-[10px] font-medium transition-colors ${
              activeTab === 'sync'
                ? 'text-amber-600 dark:text-amber-400 font-bold'
                : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-100'
            }`}
          >
            <Server className="w-4 h-4 mb-0.5" />
            <span>Sync</span>
          </button>
        </div>
      </div>
    </div>
  );
};
