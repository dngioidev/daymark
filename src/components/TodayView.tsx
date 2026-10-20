import React, { useState, useMemo } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  AlertTriangle,
  AlertCircle,
  FileCode,
  Layout,
  Columns,
  RotateCw,
  CheckCircle2,
  Clock,
  Filter,
  Eye,
  Edit3,
  FileText,
} from 'lucide-react';
import {
  AgingThresholds,
  DailyDocument,
  EditorMode,
  StatusDefinition,
  TaskItem,
} from '../types/daymark';
import { TaskItemCard } from './TaskItemCard';
import {
  calculateTaskAge,
  formatFullDate,
  getAgingSeverity,
  getNextDate,
  getPreviousDate,
  getRelativeDateLabel,
} from '../utils/lifecycleEngine';
import { parseDailyDocument, serializeDailyDocument } from '../utils/markdownEngine';
import { MarkdownPreview } from './MarkdownPreview';

interface TodayViewProps {
  currentDocument: DailyDocument;
  simulatedToday: string;
  statuses: StatusDefinition[];
  agingThresholds: AgingThresholds;
  defaultHeadings: string[];
  onDateChange: (newDate: string) => void;
  onUpdateDocument: (doc: DailyDocument) => void;
  onOpenHistoricalModal: (task: TaskItem) => void;
  onOpenHistoryDrawer: (task: TaskItem) => void;
  onQuickHistoricalDone: (taskId: string, targetDate: string) => void;
  onTriggerRollover: () => void;
  /** Phone layout: tighter spacing, no Split view, no manual rollover (it runs automatically). */
  compact?: boolean;
}

export const TodayView: React.FC<TodayViewProps> = ({
  compact = false,
  currentDocument,
  simulatedToday,
  statuses,
  agingThresholds,
  defaultHeadings,
  onDateChange,
  onUpdateDocument,
  onOpenHistoricalModal,
  onOpenHistoryDrawer,
  onQuickHistoricalDone,
  onTriggerRollover,
}) => {
  const [editorMode, setEditorMode] = useState<EditorMode>('visual');
  const [splitRightTab, setSplitRightTab] = useState<'rendered' | 'raw'>('rendered');
  const [rawMarkdownDraft, setRawMarkdownDraft] = useState<string>('');
  const [isEditingRaw, setIsEditingRaw] = useState(false);
  const [attentionFilterActive, setAttentionFilterActive] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [showAddSection, setShowAddSection] = useState(false);

  // Quick add state per section
  const [activeAddHeading, setActiveAddHeading] = useState<string | null>(null);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskStatus, setQuickTaskStatus] = useState('in-progress');

  // Quick note state per section
  const [activeNoteHeading, setActiveNoteHeading] = useState<string | null>(null);
  const [quickNoteContent, setQuickNoteContent] = useState('');

  const isToday = currentDocument.date === simulatedToday;

  // Flatten all tasks in this document
  const allTasks = useMemo(() => {
    return currentDocument.headings.flatMap((h) => h.items);
  }, [currentDocument]);

  // Evaluate aging tasks
  const agingAlerts = useMemo(() => {
    const attentionTasks: TaskItem[] = [];
    const criticalTasks: TaskItem[] = [];

    for (const task of allTasks) {
      if (task.status === 'done' || task.status === 'archived') continue;
      if (task.dismissedAlertDate === currentDocument.date) continue;
      const severity = getAgingSeverity(task, currentDocument.date, agingThresholds, statuses);
      if (severity === 'critical') criticalTasks.push(task);
      else if (severity === 'attention') attentionTasks.push(task);
    }

    return {
      attentionCount: attentionTasks.length,
      criticalCount: criticalTasks.length,
      totalAlerts: attentionTasks.length + criticalTasks.length,
      criticalTasks,
      attentionTasks,
    };
  }, [allTasks, currentDocument.date, agingThresholds, statuses]);

  // Synchronize raw markdown when opening raw/split mode
  const currentCanonicalMarkdown = useMemo(() => {
    return serializeDailyDocument(currentDocument);
  }, [currentDocument]);

  const handleSwitchMode = (mode: EditorMode) => {
    if (mode === 'raw' || mode === 'split') {
      setRawMarkdownDraft(currentCanonicalMarkdown);
    }
    setEditorMode(mode);
  };

  const handleSaveRawMarkdown = () => {
    const parsed = parseDailyDocument(rawMarkdownDraft, currentDocument.date, defaultHeadings);
    onUpdateDocument(parsed);
    setIsEditingRaw(false);
  };

  const handleTaskUpdate = (updatedTask: TaskItem) => {
    const newDoc: DailyDocument = JSON.parse(JSON.stringify(currentDocument));
    for (const h of newDoc.headings) {
      const idx = h.items.findIndex((t) => t.id === updatedTask.id);
      if (idx !== -1) {
        h.items[idx] = updatedTask;
        break;
      }
    }
    newDoc.updatedAt = new Date().toISOString();
    onUpdateDocument(newDoc);
  };

  const handleTaskDelete = (taskId: string) => {
    const newDoc: DailyDocument = JSON.parse(JSON.stringify(currentDocument));
    for (const h of newDoc.headings) {
      h.items = h.items.filter((t) => t.id !== taskId);
    }
    newDoc.updatedAt = new Date().toISOString();
    onUpdateDocument(newDoc);
  };

  const handleToggleAlertDismiss = (taskId: string) => {
    const newDoc: DailyDocument = JSON.parse(JSON.stringify(currentDocument));
    for (const h of newDoc.headings) {
      const found = h.items.find((t) => t.id === taskId);
      if (found) {
        found.dismissedAlertDate =
          found.dismissedAlertDate === currentDocument.date ? undefined : currentDocument.date;
        break;
      }
    }
    newDoc.updatedAt = new Date().toISOString();
    onUpdateDocument(newDoc);
  };

  const handleQuickAddTask = (headingName: string) => {
    if (!quickTaskTitle.trim()) return;

    const newDoc: DailyDocument = JSON.parse(JSON.stringify(currentDocument));
    let heading = newDoc.headings.find((h) => h.name === headingName);
    if (!heading) {
      heading = { name: headingName, items: [], notesContent: '' };
      newDoc.headings.push(heading);
    }

    const newTask: TaskItem = {
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: quickTaskTitle.trim(),
      status: quickTaskStatus,
      createdDate: currentDocument.date,
      originalNoteDate: currentDocument.date,
      heading: headingName,
      order: heading.items.length + 1,
      historyLog: [
        {
          id: `hist-${Date.now()}`,
          timestamp: new Date().toISOString(),
          date: currentDocument.date,
          action: 'created',
          details: `Created in #${headingName}`,
        },
      ],
    };

    heading.items.push(newTask);
    newDoc.updatedAt = new Date().toISOString();
    onUpdateDocument(newDoc);

    setQuickTaskTitle('');
    setActiveAddHeading(null);
  };

  const handleSaveQuickNote = (headingName: string) => {
    const newDoc: DailyDocument = JSON.parse(JSON.stringify(currentDocument));
    let heading = newDoc.headings.find((h) => h.name === headingName);
    if (!heading) {
      heading = { name: headingName, items: [], notesContent: '' };
      newDoc.headings.push(heading);
    }

    const existing = heading.notesContent ? heading.notesContent + '\n\n' : '';
    heading.notesContent = existing + quickNoteContent.trim();
    newDoc.updatedAt = new Date().toISOString();
    onUpdateDocument(newDoc);

    setQuickNoteContent('');
    setActiveNoteHeading(null);
  };

  const handleAddSection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSectionTitle.trim()) return;

    const newDoc: DailyDocument = JSON.parse(JSON.stringify(currentDocument));
    if (!newDoc.headings.some((h) => h.name.toLowerCase() === newSectionTitle.trim().toLowerCase())) {
      newDoc.headings.push({
        name: newSectionTitle.trim(),
        items: [],
        notesContent: '',
      });
      newDoc.updatedAt = new Date().toISOString();
      onUpdateDocument(newDoc);
    }
    setNewSectionTitle('');
    setShowAddSection(false);
  };

  // Helper to toggle checkbox in a section's markdown notes
  const handleToggleSectionNoteCheckbox = (sectionName: string, taskIndex: number, newChecked: boolean) => {
    const newDoc: DailyDocument = JSON.parse(JSON.stringify(currentDocument));
    const heading = newDoc.headings.find((h) => h.name === sectionName);
    if (!heading || !heading.notesContent) return;

    let count = 0;
    heading.notesContent = heading.notesContent.replace(/([-*]\s*\[)([ xX])(\])/g, (match, prefix, cur, suffix) => {
      if (count === taskIndex) {
        count++;
        return `${prefix}${newChecked ? 'x' : ' '}${suffix}`;
      }
      count++;
      return match;
    });

    newDoc.updatedAt = new Date().toISOString();
    onUpdateDocument(newDoc);
  };

  // Helper to delete/clear notes in a section
  const handleClearSectionNotes = (sectionName: string) => {
    if (confirm(`Clear all freeform notes in #${sectionName}?`)) {
      const newDoc: DailyDocument = JSON.parse(JSON.stringify(currentDocument));
      const heading = newDoc.headings.find((h) => h.name === sectionName);
      if (heading) {
        heading.notesContent = '';
        newDoc.updatedAt = new Date().toISOString();
        onUpdateDocument(newDoc);
      }
    }
  };

  return (
    <div className={compact ? 'w-full space-y-4' : 'w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6'}>
      {/* Date Navigation & View Controls Bar */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between ${compact ? 'gap-3 pb-3' : 'gap-4 pb-4'} border-b border-stone-200 dark:border-stone-800`}>
        {/* Date Navigator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-0.5 shadow-2xs">
            <button
              onClick={() => onDateChange(getPreviousDate(currentDocument.date))}
              title="Previous Day"
              className="p-1.5 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 rounded-md hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={() => onDateChange(simulatedToday)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                isToday
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
            >
              Today
            </button>

            <button
              onClick={() => onDateChange(getNextDate(currentDocument.date))}
              title="Next Day"
              className="p-1.5 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 rounded-md hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">
                {getRelativeDateLabel(currentDocument.date, simulatedToday)}
              </h1>
              {!compact && (
                <span className="text-xs font-mono text-stone-400 dark:text-stone-500 tabular-nums">
                  ({currentDocument.date})
                </span>
              )}
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {formatFullDate(currentDocument.date)}
            </p>
          </div>
        </div>

        {/* View Mode Segmented Controls (Button tabs) */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {isToday && !compact && (
            <button
              onClick={onTriggerRollover}
              title="Re-run daily carry-forward rollover safely"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 bg-stone-100 dark:bg-stone-900 hover:bg-stone-200 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-800 rounded-md transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Reconcile Rollover</span>
            </button>
          )}

          {/* Segmented Control */}
          <div className="flex items-center gap-0.5 p-1 bg-stone-100 dark:bg-stone-900 rounded-lg border border-stone-200/60 dark:border-stone-800">
            <button
              onClick={() => handleSwitchMode('visual')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                editorMode === 'visual'
                  ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-2xs font-semibold'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
              }`}
            >
              <Layout className="w-3.5 h-3.5" />
              <span>Notebook</span>
            </button>

            {!compact && (
            <button
              onClick={() => handleSwitchMode('split')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                editorMode === 'split'
                  ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-2xs font-semibold'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Split</span>
            </button>
            )}

            <button
              onClick={() => handleSwitchMode('raw')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                editorMode === 'raw'
                  ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-2xs font-semibold'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Markdown</span>
            </button>
          </div>
        </div>
      </div>

      {/* Carry-Forward Aging Alert Banner (Section 8 of PRD) */}
      {agingAlerts.totalAlerts > 0 && (
        <div className="p-4 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-200/80 dark:bg-amber-900/80 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-amber-950 dark:text-amber-100">
                {agingAlerts.totalAlerts} carried-forward {agingAlerts.totalAlerts === 1 ? 'task needs' : 'tasks need'} attention
              </div>
              <div className="text-stone-600 dark:text-stone-300 mt-0.5 flex items-center gap-2 flex-wrap">
                {agingAlerts.criticalCount > 0 && (
                  <span className="text-rose-600 dark:text-rose-400 font-medium">
                    {agingAlerts.criticalCount} critical (≥{agingThresholds.criticalDays} days)
                  </span>
                )}
                {agingAlerts.criticalCount > 0 && agingAlerts.attentionCount > 0 && (
                  <span>·</span>
                )}
                {agingAlerts.attentionCount > 0 && (
                  <span className="text-amber-700 dark:text-amber-300">
                    {agingAlerts.attentionCount} pending review (≥{agingThresholds.attentionDays} days)
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              onClick={() => setAttentionFilterActive(!attentionFilterActive)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                attentionFilterActive
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 border border-stone-300 dark:border-stone-700 hover:bg-stone-50'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>{attentionFilterActive ? 'Show All Sections' : 'Filter Attention Tasks'}</span>
            </button>
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      {editorMode === 'visual' && (
        <div className={compact ? 'space-y-3' : 'space-y-5'}>
          {currentDocument.headings.map((section) => {
            const visibleItems = attentionFilterActive
              ? section.items.filter((item) => {
                  const s = getAgingSeverity(item, currentDocument.date, agingThresholds, statuses);
                  return s === 'attention' || s === 'critical';
                })
              : section.items;

            // If filtering by attention and this section has no matching tasks and no notes, we can skip or show minimal
            if (attentionFilterActive && visibleItems.length === 0) {
              return null;
            }
            // Empty sections collapse to a single slim row
            const isEmptySection =
              visibleItems.length === 0 &&
              !section.notesContent &&
              activeAddHeading !== section.name &&
              activeNoteHeading !== section.name;

            return (
              <section
                key={section.name}
                className={`bg-white dark:bg-stone-900/60 rounded-xl border border-stone-200 dark:border-stone-800 shadow-2xs ${
                  isEmptySection ? (compact ? 'px-3 py-1.5' : 'px-5 py-2') : compact ? 'p-3 space-y-3' : 'p-5 space-y-4'
                }`}
              >
                {/* Heading Bar */}
                <div className={`flex items-center justify-between ${isEmptySection ? '' : 'pb-2 border-b border-stone-100 dark:border-stone-800'}`}>
                  <div className="flex items-center gap-2.5">
                    <h2 className={`font-bold text-stone-900 dark:text-stone-100 ${isEmptySection ? 'text-sm' : 'text-base'}`}>
                      {section.name}
                    </h2>
                    <span className="text-xs font-mono text-stone-400 dark:text-stone-500 tabular-nums">
                      {visibleItems.length} {visibleItems.length === 1 ? 'task' : 'tasks'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setActiveAddHeading(activeAddHeading === section.name ? null : section.name);
                        setActiveNoteHeading(null);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-md transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Task</span>
                    </button>

                    <button
                      onClick={() => {
                        setActiveNoteHeading(activeNoteHeading === section.name ? null : section.name);
                        setActiveAddHeading(null);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-md transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Note</span>
                    </button>
                  </div>
                </div>

                {/* Inline Quick Add Task Box */}
                {activeAddHeading === section.name && (
                  <div className="p-3 bg-stone-50 dark:bg-stone-800/50 rounded-lg border border-amber-200 dark:border-amber-900/60 space-y-2 animate-in fade-in duration-100">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="What needs to be done?"
                        value={quickTaskTitle}
                        onChange={(e) => setQuickTaskTitle(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleQuickAddTask(section.name)}
                        className="flex-1 text-xs px-3 py-1.5 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-md text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                        autoFocus
                      />
                      <select
                        value={quickTaskStatus}
                        onChange={(e) => setQuickTaskStatus(e.target.value)}
                        className="text-xs px-2 py-1.5 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-md text-stone-700 dark:text-stone-300"
                      >
                        {statuses.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleQuickAddTask(section.name)}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-md shadow-2xs"
                      >
                        Add Task
                      </button>
                    </div>
                  </div>
                )}

                {/* Task list */}
                {visibleItems.length > 0 && (
                  <div className="space-y-2">
                    {visibleItems.map((task) => (
                      <TaskItemCard
                        key={task.id}
                        task={task}
                        currentDate={currentDocument.date}
                        statuses={statuses}
                        agingThresholds={agingThresholds}
                        onUpdateTask={handleTaskUpdate}
                        onDeleteTask={handleTaskDelete}
                        onOpenHistoricalModal={onOpenHistoricalModal}
                        onOpenHistoryDrawer={onOpenHistoryDrawer}
                        onQuickHistoricalDone={onQuickHistoricalDone}
                        onToggleAlertDismiss={handleToggleAlertDismiss}
                      />
                    ))}
                  </div>
                )}

                {/* Freeform Section Notes Card & Inline Editor */}
                {(section.notesContent || activeNoteHeading === section.name) && (
                  <div className="mt-4 p-4 bg-stone-50 dark:bg-stone-800/50 rounded-xl border border-stone-200 dark:border-stone-700/60 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-stone-200/60 dark:border-stone-800">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-amber-600 dark:text-amber-500" />
                        <span className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                          {section.name} Notes
                        </span>
                        <span className="text-[10px] text-stone-400">· Markdown</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {activeNoteHeading !== section.name && (
                          <>
                            <button
                              onClick={() => {
                                setQuickNoteContent(section.notesContent || '');
                                setActiveNoteHeading(section.name);
                              }}
                              className="px-2.5 py-1 text-xs font-medium text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-200 dark:hover:bg-stone-700 rounded transition-colors inline-flex items-center gap-1"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                            {section.notesContent && (
                              <button
                                onClick={() => handleClearSectionNotes(section.name)}
                                className="px-2 py-1 text-xs text-stone-400 hover:text-rose-500 rounded transition-colors"
                                title="Clear Section Notes"
                              >
                                Clear
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Inline Editor Form */}
                    {activeNoteHeading === section.name ? (
                      <div className="space-y-2.5 pt-1 animate-in fade-in duration-100">
                        {/* Quick formatting toolbar */}
                        <div className="flex flex-wrap items-center gap-1 pb-1 text-xs border-b border-stone-200 dark:border-stone-800">
                          <button
                            type="button"
                            onClick={() => setQuickNoteContent((prev) => prev + '**bold text**')}
                            className="px-2 py-0.5 rounded text-[11px] font-bold text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700"
                            title="Bold"
                          >
                            B
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuickNoteContent((prev) => prev + '*italic text*')}
                            className="px-2 py-0.5 rounded text-[11px] italic text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700"
                            title="Italic"
                          >
                            I
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuickNoteContent((prev) => prev + '\n- [ ] Checklist item')}
                            className="px-2 py-0.5 rounded text-[11px] font-mono text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700"
                            title="Checklist item"
                          >
                            ☑ Checkbox
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuickNoteContent((prev) => prev + '\n- Bullet point')}
                            className="px-2 py-0.5 rounded text-[11px] text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700"
                            title="Bullet list"
                          >
                            • Bullet
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuickNoteContent((prev) => prev + '\n> [!NOTE]\n> Note callout text\n')}
                            className="px-2 py-0.5 rounded text-[11px] text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700"
                            title="Callout"
                          >
                            💬 Callout
                          </button>
                        </div>

                        <textarea
                          placeholder="Write rich Markdown notes, considerations, or meeting bullet points..."
                          value={quickNoteContent}
                          onChange={(e) => setQuickNoteContent(e.target.value)}
                          rows={5}
                          className="w-full text-xs sm:text-sm font-mono p-3 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-1 focus:ring-amber-500 leading-relaxed"
                          autoFocus
                        />

                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveNoteHeading(null)}
                            className="px-3 py-1.5 text-xs text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const newDoc: DailyDocument = JSON.parse(JSON.stringify(currentDocument));
                              let heading = newDoc.headings.find((h) => h.name === section.name);
                              if (!heading) {
                                heading = { name: section.name, items: [], notesContent: '' };
                                newDoc.headings.push(heading);
                              }
                              heading.notesContent = quickNoteContent.trim();
                              newDoc.updatedAt = new Date().toISOString();
                              onUpdateDocument(newDoc);
                              setActiveNoteHeading(null);
                            }}
                            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md shadow-2xs"
                          >
                            Save Section Notes
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Rendered Markdown Preview with Interactive Checkboxes */
                      <div className="pt-1">
                        <MarkdownPreview
                          content={section.notesContent || ''}
                          onToggleTaskItem={(taskIdx, checked) =>
                            handleToggleSectionNoteCheckbox(section.name, taskIdx, checked)
                          }
                        />
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}

          {/* Add Custom Section Button */}
          {showAddSection ? (
            <form
              onSubmit={handleAddSection}
              className="p-4 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 flex items-center gap-3"
            >
              <input
                type="text"
                placeholder="New section name (e.g. Learning, Follow-ups)"
                value={newSectionTitle}
                onChange={(e) => setNewSectionTitle(e.target.value)}
                className="flex-1 text-xs px-3 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-md text-stone-900 dark:text-stone-100"
                autoFocus
              />
              <button
                type="submit"
                className="px-3.5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md"
              >
                Add Section
              </button>
              <button
                type="button"
                onClick={() => setShowAddSection(false)}
                className="px-3 py-2 text-xs font-medium text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              onClick={() => setShowAddSection(true)}
              className="w-full py-2.5 border border-dashed border-stone-300 dark:border-stone-800 hover:border-stone-400 dark:hover:border-stone-700 rounded-xl text-xs font-medium text-stone-500 hover:text-stone-800 dark:hover:text-stone-300 transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add Section Heading</span>
            </button>
          )}
        </div>
      )}

      {/* SPLIT VIEW MODE: Visual on Left, Live Synchronized Canonical Markdown on Right */}
      {editorMode === 'split' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Visual Column */}
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-2 border-b border-stone-200 dark:border-stone-800">
              <span className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Visual Notebook
              </span>
              <span className="text-xs text-stone-400">Interactive controls</span>
            </div>

            <div className="space-y-6">
              {currentDocument.headings.map((section) => (
                <div
                  key={section.name}
                  className="bg-white dark:bg-stone-900/60 rounded-xl border border-stone-200 dark:border-stone-800 p-4 space-y-3"
                >
                  <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                    #{section.name}
                  </h3>
                  <div className="space-y-2">
                    {section.items.map((task) => (
                      <TaskItemCard
                        key={task.id}
                        task={task}
                        currentDate={currentDocument.date}
                        statuses={statuses}
                        agingThresholds={agingThresholds}
                        onUpdateTask={handleTaskUpdate}
                        onDeleteTask={handleTaskDelete}
                        onOpenHistoricalModal={onOpenHistoricalModal}
                        onOpenHistoryDrawer={onOpenHistoryDrawer}
                        onQuickHistoricalDone={onQuickHistoricalDone}
                        onToggleAlertDismiss={handleToggleAlertDismiss}
                      />
                    ))}
                  </div>
                  {section.notesContent && (
                    <div className="p-2.5 bg-stone-50 dark:bg-stone-800/40 rounded border border-stone-100 dark:border-stone-800">
                      <MarkdownPreview content={section.notesContent} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Document Preview & Canonical Markdown Column */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-200 dark:border-stone-800">
              <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 p-0.5 rounded-md">
                <button
                  onClick={() => setSplitRightTab('rendered')}
                  className={`px-2.5 py-1 text-xs rounded transition-colors flex items-center gap-1.5 ${
                    splitRightTab === 'rendered'
                      ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 font-semibold shadow-2xs'
                      : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Rendered Document</span>
                </button>
                <button
                  onClick={() => setSplitRightTab('raw')}
                  className={`px-2.5 py-1 text-xs rounded transition-colors flex items-center gap-1.5 ${
                    splitRightTab === 'raw'
                      ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 font-semibold shadow-2xs'
                      : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>Raw Markdown (.md)</span>
                </button>
              </div>

              {splitRightTab === 'raw' && (
                <button
                  onClick={handleSaveRawMarkdown}
                  className="px-2.5 py-1 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md shadow-2xs"
                >
                  Save Changes
                </button>
              )}
            </div>

            {splitRightTab === 'rendered' ? (
              <div className="p-5 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 max-h-[750px] overflow-y-auto">
                <div className="text-xs text-stone-500 dark:text-stone-400 font-mono mb-3 pb-2 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
                  <span>Document: {currentDocument.date}.md</span>
                  <span>Markdown Render Mode</span>
                </div>
                <MarkdownPreview content={currentCanonicalMarkdown} />
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  value={rawMarkdownDraft}
                  onChange={(e) => setRawMarkdownDraft(e.target.value)}
                  rows={28}
                  className="w-full p-4 font-mono text-xs leading-relaxed bg-stone-900 text-stone-100 rounded-xl border border-stone-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500 selection:bg-amber-900/80"
                  spellCheck={false}
                />
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  Notice the HTML comment metadata tags (<code>&lt;!-- daymark: task_id=... --&gt;</code>).
                  These allow full round-trip preservation in Obsidian, VS Code, and Typora.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FULL RAW MARKDOWN MODE */}
      {editorMode === 'raw' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800">
            <div>
              <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                Direct Markdown Editor ({currentDocument.date}.md)
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Edit raw Markdown directly. Daymark metadata comments preserve task IDs, statuses, and carry-forward state.
              </p>
            </div>
            <button
              onClick={handleSaveRawMarkdown}
              className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md shadow-2xs"
            >
              Apply Changes to Notebook
            </button>
          </div>

          <textarea
            value={rawMarkdownDraft}
            onChange={(e) => setRawMarkdownDraft(e.target.value)}
            rows={24}
            className="w-full p-5 font-mono text-xs leading-relaxed bg-stone-900 text-stone-100 rounded-xl border border-stone-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500 selection:bg-amber-900/80"
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
};
