import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns,
  Edit3,
  FileCode,
  Layout,
  MoreHorizontal,
  Plus,
  RotateCw,
  X,
} from 'lucide-react';
import { AgingThresholds, DailyDocument, EditorMode, StatusDefinition, TaskItem } from '../types/daymark';
import { TaskItemCard, pickableStatuses } from './TaskItemCard';
import { getAgingSeverity, getNextDate, getPreviousDate } from '../utils/lifecycleEngine';
import { applyMarkdownEdit, isDoneLater, removeTaskFromDocument, replaceTaskInDocument, restoreTaskToDocument } from '../utils/taskActions';
import { formatDay, formatLongDate, formatShortDate } from '../utils/dateFormat';
import { loadCollapsed, saveCollapsed } from '../utils/collapsedSections';
import { nextPlannedDay, weekTrend } from '../utils/dayStats';
import { hideTaskTags, parseDailyDocument, restoreTaskTags, serializeDailyDocument } from '../utils/markdownEngine';
import { MarkdownPreview } from './MarkdownPreview';
import { Menu } from './ui/Menu';
import { buttonClass } from './ui/Dialog';
import { confirmDialog, showToast } from './ui/feedback';

interface TodayViewProps {
  habitsSlot?: React.ReactNode;
  currentDocument: DailyDocument;
  allDocs: DailyDocument[];
  simulatedToday: string;
  statuses: StatusDefinition[];
  agingThresholds: AgingThresholds;
  defaultHeadings: string[];
  onDateChange: (newDate: string) => void;
  onUpdateDocument: (doc: DailyDocument) => void;
  /** Applies a change to the latest copy of a day, so Undo only touches what it must. */
  onPatchDocument: (date: string, patch: (doc: DailyDocument) => DailyDocument) => void;
  onOpenHistoricalModal: (task: TaskItem) => void;
  onOpenHistoryDrawer: (task: TaskItem) => void;
  onQuickHistoricalDone: (taskId: string, targetDate: string) => void;
  onMoveTask?: (taskId: string, toDate: string) => void;
  onTriggerRollover: () => void;
  /** Phone layout: tighter spacing, no Split view, no manual refresh (rollover runs automatically). */
  compact?: boolean;
}

const clone = (doc: DailyDocument): DailyDocument => JSON.parse(JSON.stringify(doc));
const touch = (doc: DailyDocument) => ({ ...doc, updatedAt: new Date().toISOString() });

/**
 * Keeps what Markdown cannot express (history, snoozes, tags) for tasks that survived an edit
 * in the Markdown view, matched by task id.
 */
function keepTaskMetadata(parsed: DailyDocument, previous: DailyDocument): DailyDocument {
  const byId = new Map(previous.headings.flatMap((h) => h.items).map((t) => [t.id, t]));
  for (const h of parsed.headings) {
    h.items = h.items.map((t) => {
      const old = byId.get(t.id);
      return old ? { ...t, historyLog: old.historyLog, originalNoteDate: old.originalNoteDate, dismissedAlertDate: old.dismissedAlertDate, tags: old.tags, statusBeforeDone: old.statusBeforeDone } : t;
    });
  }
  return parsed;
}

/** Wraps the current selection of a textarea (or inserts a placeholder) and keeps it selected. */
function wrapSelection(el: HTMLTextAreaElement | null, value: string, before: string, after: string, placeholder: string) {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  const selected = value.slice(start, end) || placeholder;
  const next = value.slice(0, start) + before + selected + after + value.slice(end);
  requestAnimationFrame(() => {
    if (!el) return;
    el.focus();
    el.setSelectionRange(start + before.length, start + before.length + selected.length);
  });
  return next;
}

export const TodayView: React.FC<TodayViewProps> = ({
  habitsSlot,
  compact = false,
  currentDocument,
  allDocs,
  simulatedToday,
  statuses,
  agingThresholds,
  defaultHeadings,
  onDateChange,
  onUpdateDocument,
  onPatchDocument,
  onOpenHistoricalModal,
  onOpenHistoryDrawer,
  onQuickHistoricalDone,
  onMoveTask,
  onTriggerRollover,
}) => {
  const [editorMode, setEditorMode] = useState<EditorMode>('visual');
  const [rawDraft, setRawDraft] = useState('');
  const [rawDirty, setRawDirty] = useState(false);
  // The day the Markdown draft was opened from; the draft is only ever saved back to this day
  const [draftDate, setDraftDate] = useState(currentDocument.date);
  const hiddenTags = useRef<Map<string, string[]>>(new Map());
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [showAddSection, setShowAddSection] = useState(false);
  const [openDone, setOpenDone] = useState<Set<string>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [collapsedLoaded, setCollapsedLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void loadCollapsed().then((names) => {
      if (!active) return;
      setCollapsedSections(names);
      setCollapsedLoaded(true);
    });
    return () => { active = false; };
  }, []);

  // Wait for hydration before persisting so the initial empty set cannot erase saved names.
  useEffect(() => {
    if (!collapsedLoaded) return;
    void saveCollapsed(collapsedSections).catch(() => {
      showToast('Could not remember collapsed sections on this device.', { tone: 'error' });
    });
  }, [collapsedSections, collapsedLoaded]);

  const toggleSection = (name: string) => {
    setCollapsedSections((previous) => {
      const next = new Set(previous);
      const key = name.toLowerCase();
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const [activeAddHeading, setActiveAddHeading] = useState<string | null>(null);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskStatus, setQuickTaskStatus] = useState('not-started');

  const [activeNoteHeading, setActiveNoteHeading] = useState<string | null>(null);
  const [quickNoteContent, setQuickNoteContent] = useState('');
  const noteAreaRef = useRef<HTMLTextAreaElement>(null);

  const date = currentDocument.date;
  const isToday = date === simulatedToday;
  const allTasks = useMemo(() => currentDocument.headings.flatMap((h) => h.items), [currentDocument]);

  const severityOf = (task: TaskItem) =>
    task.status === 'done' || task.status === 'archived' || task.dismissedAlertDate === date
      ? 'normal'
      : getAgingSeverity(task, date, agingThresholds, statuses);

  const alerts = useMemo(() => {
    let critical = 0;
    let attention = 0;
    for (const t of allTasks) {
      const s = severityOf(t);
      if (s === 'critical') critical++;
      else if (s === 'attention') attention++;
    }
    return { critical, attention, total: critical + attention };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTasks, date, agingThresholds, statuses]);

  // ---------- Markdown view ----------
  const canonicalMarkdown = useMemo(() => serializeDailyDocument(currentDocument), [currentDocument]);

  const openMarkdown = (mode: EditorMode) => {
    const { text, tags } = hideTaskTags(canonicalMarkdown);
    hiddenTags.current = tags;
    setRawDraft(text);
    setRawDirty(false);
    setDraftDate(date);
    setEditorMode(mode);
  };

  // Keep an unedited Markdown pane in step with changes made in the list (Split view)
  useEffect(() => {
    if (editorMode === 'visual' || rawDirty) return;
    const { text, tags } = hideTaskTags(canonicalMarkdown);
    hiddenTags.current = tags;
    setRawDraft(text);
    setDraftDate(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canonicalMarkdown]);

  // Safety net for day changes we did not ask about (History, midnight, Settings): an unsaved draft never follows the user to another day
  useEffect(() => {
    if (!rawDirty || draftDate === date) return;
    showToast(`Unsaved Markdown for ${formatDay(draftDate, simulatedToday)} was discarded.`, { tone: 'error' });
    const { text, tags } = hideTaskTags(canonicalMarkdown);
    hiddenTags.current = tags;
    setRawDraft(text);
    setRawDirty(false);
    setDraftDate(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  /** True when it is fine to leave the draft behind (nothing unsaved, or the user agreed to discard it). */
  const confirmLeaveDraft = async () => {
    if (!rawDirty) return true;
    const discard = await confirmDialog({
      title: 'Discard your Markdown changes?',
      message: 'You edited the Markdown but did not save it.',
      confirmLabel: 'Discard',
      danger: true,
    });
    if (discard) setRawDirty(false);
    return discard;
  };

  const switchMode = async (mode: EditorMode) => {
    if (mode === editorMode) return true;
    if (!(await confirmLeaveDraft())) return false;
    if (mode === 'visual') setEditorMode('visual');
    else openMarkdown(mode);
    return true;
  };

  const changeDay = async (target: string) => {
    if (await confirmLeaveDraft()) onDateChange(target);
  };

  const saveMarkdown = () => {
    if (draftDate !== date) return;
    const restored = restoreTaskTags(rawDraft, hiddenTags.current, date);
    const parsed = applyMarkdownEdit(currentDocument, keepTaskMetadata(parseDailyDocument(restored, date, defaultHeadings), currentDocument));
    onUpdateDocument(parsed);
    const { text, tags } = hideTaskTags(serializeDailyDocument(parsed));
    hiddenTags.current = tags;
    setRawDraft(text);
    setRawDirty(false);
    showToast('Markdown saved.');
  };

  // ---------- Task edits ----------
  const handleTaskUpdate = (updatedTask: TaskItem) => {
    const newDoc = clone(currentDocument);
    let previous: TaskItem | undefined;
    for (const h of newDoc.headings) {
      const idx = h.items.findIndex((t) => t.id === updatedTask.id);
      if (idx !== -1) {
        previous = h.items[idx];
        h.items[idx] = updatedTask;
        break;
      }
    }
    onUpdateDocument(touch(newDoc));
    if (previous && previous.status !== 'done' && updatedTask.status === 'done') {
      // Finishing the last old task while filtered to old tasks: leave the filter here, in the one Done toast
      const lastOldTask =
        attentionOnly && newDoc.headings.every((h) => h.items.every((t) => severityOf(t) === 'normal'));
      if (lastOldTask) setAttentionOnly(false);
      showToast(lastOldTask ? `Done: ${updatedTask.title}. No old tasks left, showing everything.` : `Done: ${updatedTask.title}`, {
        action: { label: 'Undo', onClick: () => onPatchDocument(date, (d) => replaceTaskInDocument(d, previous)) },
      });
    }
  };

  const handleTaskDelete = (taskId: string) => {
    const res = removeTaskFromDocument(currentDocument, taskId);
    if (!res) return;
    const { removed } = res;
    onUpdateDocument(res.doc);
    showToast(`Deleted “${removed.task.title}”`, {
      action: { label: 'Undo', onClick: () => onPatchDocument(date, (d) => restoreTaskToDocument(d, removed)) },
    });
  };

  const handleToggleAlertDismiss = (taskId: string) => {
    const newDoc = clone(currentDocument);
    for (const h of newDoc.headings) {
      const found = h.items.find((t) => t.id === taskId);
      if (found) {
        found.dismissedAlertDate = found.dismissedAlertDate === date ? undefined : date;
        break;
      }
    }
    onUpdateDocument(touch(newDoc));
  };

  const openAdd = (headingName: string) => {
    setActiveAddHeading(headingName);
    setActiveNoteHeading(null);
    setQuickTaskTitle('');
  };

  const handleQuickAddTask = (headingName: string) => {
    if (!quickTaskTitle.trim()) return;
    const newDoc = clone(currentDocument);
    let heading = newDoc.headings.find((h) => h.name === headingName);
    if (!heading) {
      heading = { name: headingName, items: [], notesContent: '' };
      newDoc.headings.push(heading);
    }
    heading.items.push({
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: quickTaskTitle.trim(),
      status: quickTaskStatus,
      createdDate: date,
      originalNoteDate: date,
      heading: headingName,
      order: heading.items.length + 1,
      historyLog: [
        { id: `hist-${Date.now()}`, timestamp: new Date().toISOString(), date, action: 'created', details: `Added to ${headingName}` },
      ],
    });
    onUpdateDocument(touch(newDoc));
    // Stay open for the next task; the field keeps focus
    setQuickTaskTitle('');
  };

  const saveSectionNotes = (sectionName: string) => {
    const newDoc = clone(currentDocument);
    let heading = newDoc.headings.find((h) => h.name === sectionName);
    if (!heading) {
      heading = { name: sectionName, items: [], notesContent: '' };
      newDoc.headings.push(heading);
    }
    heading.notesContent = quickNoteContent.trim();
    onUpdateDocument(touch(newDoc));
    setActiveNoteHeading(null);
  };

  const handleAddSection = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSectionTitle.trim();
    if (!name) return;
    if (!currentDocument.headings.some((h) => h.name.toLowerCase() === name.toLowerCase())) {
      const newDoc = clone(currentDocument);
      newDoc.headings.push({ name, items: [], notesContent: '' });
      onUpdateDocument(touch(newDoc));
    }
    setNewSectionTitle('');
    setShowAddSection(false);
    openAdd(name);
  };

  const toggleSectionNoteCheckbox = (sectionName: string, index: number, checked: boolean) => {
    const newDoc = clone(currentDocument);
    const heading = newDoc.headings.find((h) => h.name === sectionName);
    if (!heading?.notesContent) return;
    let count = 0;
    heading.notesContent = heading.notesContent.replace(/([-*]\s*\[)([ xX])(\])/g, (match, prefix, _cur, suffix) =>
      count++ === index ? `${prefix}${checked ? 'x' : ' '}${suffix}` : match
    );
    onUpdateDocument(touch(newDoc));
  };

  const clearSectionNotes = async (sectionName: string) => {
    const ok = await confirmDialog({ title: `Clear the ${sectionName} notes?`, confirmLabel: 'Clear', danger: true });
    if (!ok) return;
    const previousNotes = currentDocument.headings.find((h) => h.name === sectionName)?.notesContent ?? '';
    const newDoc = clone(currentDocument);
    const heading = newDoc.headings.find((h) => h.name === sectionName);
    if (heading) heading.notesContent = '';
    onUpdateDocument(touch(newDoc));
    showToast(`Cleared ${sectionName} notes`, {
      action: {
        label: 'Undo',
        onClick: () =>
          onPatchDocument(date, (d) => ({
            ...d,
            headings: d.headings.map((h) => (h.name === sectionName ? { ...h, notesContent: previousNotes } : h)),
            updatedAt: new Date().toISOString(),
          })),
      },
    });
  };

  const cardProps = {
    currentDate: date,
    today: simulatedToday,
    onMoveTask,
    statuses,
    agingThresholds,
    onUpdateTask: handleTaskUpdate,
    onDeleteTask: handleTaskDelete,
    onOpenHistoricalModal,
    onOpenHistoryDrawer,
    onQuickHistoricalDone,
    onToggleAlertDismiss: handleToggleAlertDismiss,
  };

  const iconBtn =
    'inline-flex items-center justify-center w-11 h-11 sm:w-9 sm:h-9 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-800';
  const segBtn = (active: boolean) =>
    `inline-flex items-center gap-1.5 px-3 min-h-9 text-sm font-medium rounded-md ${
      active ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-2xs' : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
    }`;

  // ---------- Header ----------
  const header = (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => changeDay(getPreviousDate(date))} aria-label="Previous day" className={iconBtn}>
        <ChevronLeft className="w-5 h-5" />
      </button>
      <div className="min-w-0 flex-1 sm:flex-none text-center sm:text-left sm:min-w-56">
        <h1 className="text-xl font-bold leading-tight text-[var(--dm-page-fg)]">{formatDay(date, simulatedToday)}</h1>
        <p className="text-sm text-stone-600 dark:text-stone-400 truncate">{formatLongDate(date)}</p>
      </div>
      <button type="button" onClick={() => changeDay(getNextDate(date))} aria-label="Next day" className={iconBtn}>
        <ChevronRight className="w-5 h-5" />
      </button>
      {!isToday && (
        <button type="button" onClick={() => changeDay(simulatedToday)} className={`${buttonClass.secondary} ml-1`}>
          Today
        </button>
      )}

      <div className="ml-auto flex items-center gap-2">
        {!compact && (
          <div className="flex items-center gap-0.5 p-0.5 bg-stone-100 dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800" role="group" aria-label="View">
            <button type="button" aria-pressed={editorMode === 'visual'} onClick={() => switchMode('visual')} className={segBtn(editorMode === 'visual')}>
              <Layout className="w-4 h-4" /> List
            </button>
            <button type="button" aria-pressed={editorMode === 'split'} onClick={() => switchMode('split')} className={segBtn(editorMode === 'split')}>
              <Columns className="w-4 h-4" /> Split
            </button>
            <button type="button" aria-pressed={editorMode === 'raw'} onClick={() => switchMode('raw')} className={segBtn(editorMode === 'raw')}>
              <FileCode className="w-4 h-4" /> Markdown
            </button>
          </div>
        )}
        <Menu
          align="right"
          items={[
            ...(compact
              ? [
                  editorMode === 'visual'
                    ? { label: 'Edit as Markdown', icon: <FileCode className="w-4 h-4" />, onSelect: () => switchMode('raw') }
                    : { label: 'Back to list', icon: <Layout className="w-4 h-4" />, onSelect: () => switchMode('visual') },
                ]
              : []),
            ...(isToday
              ? [
                  {
                    label: "Refresh today's list",
                    icon: <RotateCw className="w-4 h-4" />,
                    onSelect: onTriggerRollover,
                  },
                ]
              : []),
            { label: 'New section', icon: <Plus className="w-4 h-4" />, onSelect: async () => { if (await switchMode('visual')) setShowAddSection(true); } },
          ]}
          trigger={(props) => (
            <button type="button" {...props} aria-label="More options for this day" className={iconBtn}>
              <MoreHorizontal className="w-5 h-5" />
            </button>
          )}
        />
      </div>
    </div>
  );

  // The filter can only show old tasks; once none are left, drop it so the page is never blank
  useEffect(() => {
    if (!attentionOnly || alerts.total > 0) return;
    setAttentionOnly(false);
    showToast('No old tasks left. Showing everything.', { tone: 'info' });
  }, [attentionOnly, alerts.total]);

  // ---------- Attention chip ----------
  const attentionBar = (alerts.total > 0 || attentionOnly) && (
    <div className="flex items-center gap-3 pl-3 pr-1.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/70 text-sm">
      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-800 dark:text-amber-300" />
      <p className="flex-1 min-w-0 text-amber-950 dark:text-amber-100">
        <span className="font-semibold">
          {alerts.total} {alerts.total === 1 ? 'task needs' : 'tasks need'} attention
        </span>
        {alerts.critical > 0 && (
          <span className="text-amber-900 dark:text-amber-200">
            {' '}
            · {alerts.critical} over {agingThresholds.criticalDays} days old
          </span>
        )}
      </p>
      <button
        type="button"
        aria-pressed={attentionOnly}
        onClick={() => setAttentionOnly(!attentionOnly)}
        className="shrink-0 min-h-11 sm:min-h-9 px-3 rounded-lg font-semibold text-amber-950 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/50"
      >
        {attentionOnly ? 'Show all' : 'Show'}
      </button>
    </div>
  );

  // ---------- Sections ----------
  const isEmpty = (s: DailyDocument['headings'][number]) =>
    s.items.length === 0 && !s.notesContent && activeAddHeading !== s.name && activeNoteHeading !== s.name;
  const shownSections = currentDocument.headings.filter((s) => !isEmpty(s));
  const emptySections = currentDocument.headings.filter(isEmpty);
  const nothingYet = allTasks.length === 0 && currentDocument.headings.every((h) => !h.notesContent);

  const renderSection = (section: DailyDocument['headings'][number]) => {
    const items = attentionOnly ? section.items.filter((t) => severityOf(t) !== 'normal') : section.items;
    if (attentionOnly && items.length === 0) return null;
    const open = items.filter((t) => t.status !== 'done');
    const done = items.filter((t) => t.status === 'done');
    const doneOpen = openDone.has(section.name);
    const addingHere = activeAddHeading === section.name;
    const editingNotes = activeNoteHeading === section.name;
    const collapsed = collapsedSections.has(section.name.toLowerCase());

    return (
      <section
        key={section.name}
        aria-labelledby={`sec-${section.name}`}
        className={`dm-card bg-white/60 dark:bg-stone-900/40 rounded-xl border border-stone-200 dark:border-stone-800 ${compact ? 'p-2.5' : 'p-4'} space-y-2`}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${section.name}`}
            disabled={!collapsedLoaded}
            onClick={() => toggleSection(section.name)}
            className={iconBtn}
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
          </button>
          <h2 id={`sec-${section.name}`} className="text-base font-bold text-stone-900 dark:text-stone-50">
            {section.name}
          </h2>
          <span className="text-sm text-stone-600 dark:text-stone-400" aria-label={`${open.length} open`}>
            {open.length}
          </span>
          {!collapsed && <div className="ml-auto flex items-center">
            <button type="button" onClick={() => (addingHere ? setActiveAddHeading(null) : openAdd(section.name))} className={buttonClass.ghost}>
              <Plus className="w-4 h-4" /> Task
            </button>
            <button
              type="button"
              onClick={() => {
                setQuickNoteContent(section.notesContent || '');
                setActiveNoteHeading(editingNotes ? null : section.name);
                setActiveAddHeading(null);
              }}
              className={buttonClass.ghost}
            >
              <Edit3 className="w-4 h-4" /> Note
            </button>
          </div>}
        </div>

        {!collapsed && <>
        {addingHere && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleQuickAddTask(section.name);
            }}
            className="p-2.5 rounded-lg bg-stone-50 dark:bg-stone-800/50 border border-amber-300 dark:border-amber-800 space-y-2"
          >
            <label htmlFor={`add-${section.name}`} className="sr-only">
              New task in {section.name}
            </label>
            <input
              id={`add-${section.name}`}
              type="text"
              placeholder="What needs to be done?"
              value={quickTaskTitle}
              onChange={(e) => setQuickTaskTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setActiveAddHeading(null)}
              enterKeyHint="done"
              autoComplete="off"
              className="w-full min-w-0 px-3 min-h-11 sm:min-h-9 text-[15px] sm:text-sm bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 placeholder:text-stone-500"
              autoFocus
            />
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={`add-status-${section.name}`} className="sr-only">
                Status
              </label>
              <select
                id={`add-status-${section.name}`}
                value={quickTaskStatus}
                onChange={(e) => setQuickTaskStatus(e.target.value)}
                className="min-w-0 flex-1 sm:flex-none px-2.5 min-h-11 sm:min-h-9 text-sm bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg"
              >
                {pickableStatuses(statuses).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => setActiveAddHeading(null)} className={buttonClass.ghost}>
                Close
              </button>
              <button type="submit" disabled={!quickTaskTitle.trim()} className={buttonClass.primary}>
                Add task
              </button>
            </div>
          </form>
        )}

        {open.length > 0 && (
          <div className="space-y-1.5">
            {open.map((task) => (
              <TaskItemCard key={task.id} task={task} {...cardProps} />
            ))}
          </div>
        )}

        {done.length > 0 && (
          <div>
            <button
              type="button"
              aria-expanded={doneOpen}
              onClick={() =>
                setOpenDone((prev) => {
                  const next = new Set(prev);
                  if (next.has(section.name)) next.delete(section.name);
                  else next.add(section.name);
                  return next;
                })
              }
              className="inline-flex items-center gap-1 min-h-11 sm:min-h-8 px-1 text-sm font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${doneOpen ? '' : '-rotate-90'}`} />
              Done ({done.length})
            </button>
            {doneOpen && (
              <div className="space-y-1.5 mt-1">
                {done.map((task) => (
                  <TaskItemCard key={task.id} task={task} {...cardProps} />
                ))}
              </div>
            )}
          </div>
        )}

        {(section.notesContent || editingNotes) && (
          <div className="p-3 rounded-lg bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-700/60 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-stone-800 dark:text-stone-200">Notes</span>
              {!editingNotes && (
                <div className="ml-auto flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      setQuickNoteContent(section.notesContent || '');
                      setActiveNoteHeading(section.name);
                    }}
                    className={buttonClass.ghost}
                  >
                    <Edit3 className="w-4 h-4" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => clearSectionNotes(section.name)}
                    aria-label={`Clear ${section.name} notes`}
                    className={iconBtn}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {editingNotes ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Formatting">
                  {(
                    [
                      ['Bold', 'B', '**', '**', 'bold text', 'font-bold'],
                      ['Italic', 'I', '*', '*', 'italic text', 'italic'],
                      ['Checklist item', '☐ Item', '\n- [ ] ', '', 'to do', ''],
                      ['Bullet', '• List', '\n- ', '', 'point', ''],
                    ] as const
                  ).map(([label, text, before, after, placeholder, cls]) => (
                    <button
                      key={label}
                      type="button"
                      aria-label={label}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setQuickNoteContent((v) => wrapSelection(noteAreaRef.current, v, before, after, placeholder))}
                      className={`min-h-11 sm:min-h-8 min-w-11 sm:min-w-8 px-2 rounded-md text-sm text-stone-700 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-700 ${cls}`}
                    >
                      {text}
                    </button>
                  ))}
                </div>
                <label htmlFor={`notes-${section.name}`} className="sr-only">
                  {section.name} notes
                </label>
                <textarea
                  id={`notes-${section.name}`}
                  ref={noteAreaRef}
                  placeholder="Notes, decisions, links… (Markdown works)"
                  value={quickNoteContent}
                  onChange={(e) => setQuickNoteContent(e.target.value)}
                  rows={5}
                  className="w-full p-3 text-[15px] sm:text-sm leading-relaxed bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 placeholder:text-stone-500"
                  autoFocus
                />
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={() => setActiveNoteHeading(null)} className={buttonClass.ghost}>
                    Cancel
                  </button>
                  <button type="button" onClick={() => saveSectionNotes(section.name)} className={buttonClass.primary}>
                    Save notes
                  </button>
                </div>
              </div>
            ) : (
              <MarkdownPreview content={section.notesContent || ''} onToggleTaskItem={(i, c) => toggleSectionNoteCheckbox(section.name, i, c)} />
            )}
          </div>
        )}
        </>}
      </section>
    );
  };

  const listView = (
    <div className={compact ? 'space-y-2.5' : 'space-y-4'}>
      {nothingYet && isToday && !attentionOnly && (
        <div className="p-4 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 text-sm text-stone-700 dark:text-stone-300">
          <p className="font-semibold text-stone-900 dark:text-stone-100">Your day starts here.</p>
          <p className="mt-1">Add what you plan to do today. Anything you don't finish moves to tomorrow automatically.</p>
        </div>
      )}

      {shownSections.map(renderSection)}

      {!attentionOnly && emptySections.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-stone-600 dark:text-stone-400 mr-1">Add to</span>
          {emptySections.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => openAdd(s.name)}
              className="inline-flex items-center gap-1 min-h-11 sm:min-h-8 px-3 rounded-full border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              <Plus className="w-3.5 h-3.5" /> {s.name}
            </button>
          ))}
        </div>
      )}

      {showAddSection ? (
        <form onSubmit={handleAddSection} className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
          <label htmlFor="new-section" className="sr-only">
            New section name
          </label>
          <input
            id="new-section"
            type="text"
            placeholder="Section name, e.g. Follow-ups"
            value={newSectionTitle}
            onChange={(e) => setNewSectionTitle(e.target.value)}
            enterKeyHint="done"
            className="flex-1 min-w-0 basis-full sm:basis-auto px-3 min-h-11 sm:min-h-9 text-[15px] sm:text-sm bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg"
            autoFocus
          />
          <button type="button" onClick={() => setShowAddSection(false)} className={buttonClass.ghost}>
            Cancel
          </button>
          <button type="submit" disabled={!newSectionTitle.trim()} className={buttonClass.primary}>
            Add section
          </button>
        </form>
      ) : (
        !attentionOnly && (
          <button type="button" onClick={() => setShowAddSection(true)} className={`${buttonClass.ghost} text-stone-600 dark:text-stone-400`}>
            <Plus className="w-4 h-4" /> New section
          </button>
        )
      )}
    </div>
  );

  // Desktop side panel: the day in numbers, and what was finished
  const doneToday = allTasks.filter((t) => t.status === 'done' && !isDoneLater(t));
  const trend = useMemo(() => weekTrend(allDocs, simulatedToday), [allDocs, simulatedToday]);
  const planned = useMemo(() => nextPlannedDay(allDocs, simulatedToday), [allDocs, simulatedToday]);
  const glance = (
    <aside aria-label="Day at a glance" className="hidden xl:block sticky top-20 space-y-3 text-sm">
      <div className="dm-card p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white/60 dark:bg-stone-900/40">
        <h2 className="font-semibold text-stone-900 dark:text-stone-50">{isToday ? 'Today at a glance' : 'This day at a glance'}</h2>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          {(
            [
              ['Open', allTasks.filter((t) => t.status !== 'done').length],
              ['Done', doneToday.length],
              ['Old', alerts.total],
            ] as const
          ).map(([label, n]) => (
            <div key={label} className="p-2 rounded-lg bg-stone-100 dark:bg-stone-800/70">
              <dd className="text-lg font-bold text-stone-900 dark:text-stone-50">{n}</dd>
              <dt className="text-xs text-stone-600 dark:text-stone-400">{label}</dt>
            </div>
          ))}
        </dl>
      </div>
      <div className="dm-card p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white/60 dark:bg-stone-900/40">
        <h2 className="font-semibold text-stone-900 dark:text-stone-50">Last 7 days</h2>
        <div className="mt-3 flex gap-2" role="list" aria-label="Daily completion">
          {trend.map((day) => {
            const label = `${formatShortDate(day.date, simulatedToday)}: ${day.done} of ${day.total} done`;
            return (
              <div key={day.date} role="listitem" aria-label={label} title={label} className="flex-1">
                <div className="h-12 rounded-sm bg-stone-200 dark:bg-stone-800 flex items-end overflow-hidden">
                  <div className="w-full bg-stone-700 dark:bg-stone-300" style={{ height: `${day.total ? day.done / day.total * 100 : 0}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {planned && (
        <div className="dm-card p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white/60 dark:bg-stone-900/40">
          <h2 className="font-semibold text-stone-900 dark:text-stone-50">Next planned day</h2>
          <p className="mt-2 text-stone-700 dark:text-stone-300">
            {formatDay(planned.date, simulatedToday)} · {planned.open} {planned.open === 1 ? 'task' : 'tasks'} ·{' '}
            <button type="button" onClick={() => changeDay(planned.date)} className="min-h-11 sm:min-h-9 underline font-medium text-stone-900 dark:text-stone-100">Open</button>
          </p>
        </div>
      )}
      <div className="dm-card p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white/60 dark:bg-stone-900/40">
        <h2 className="font-semibold text-stone-900 dark:text-stone-50">Finished</h2>
        {doneToday.length ? (
          <ul className="mt-2 space-y-1.5">
            {doneToday.map((t) => (
              <li key={t.id} className="flex gap-2 text-stone-700 dark:text-stone-300">
                <span aria-hidden="true" className="text-emerald-700 dark:text-emerald-400">✓</span>
                <span className="min-w-0 break-words">{t.title}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-stone-600 dark:text-stone-400">Nothing yet. Tick a task when it's done.</p>
        )}
      </div>
    </aside>
  );

  const markdownEditor = (rows: number, stickyBar: boolean) => (
    <div className="space-y-2">
      <label htmlFor="day-markdown" className="sr-only">
        Markdown for {formatLongDate(date)}
      </label>
      <textarea
        id="day-markdown"
        value={rawDraft}
        onChange={(e) => {
          setRawDraft(e.target.value);
          setRawDirty(true);
        }}
        rows={rows}
        spellCheck={false}
        className="w-full p-4 font-mono text-sm leading-relaxed bg-stone-900 text-stone-100 rounded-xl border border-stone-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
      />
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Task links (IDs, status, carry-over dates) are kept for you and hidden here. Rename tasks in the list to keep their history.
      </p>
      <div
        className={`${stickyBar ? 'sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] sm:bottom-2' : ''} flex items-center justify-end gap-2 p-2 rounded-xl bg-white/90 dark:bg-stone-900/90 backdrop-blur border border-stone-200 dark:border-stone-800`}
      >
        {rawDirty && <span className="mr-auto pl-2 text-sm text-stone-600 dark:text-stone-400">Unsaved changes</span>}
        <button type="button" onClick={() => switchMode('visual')} className={buttonClass.ghost}>
          {rawDirty ? 'Cancel' : 'Back to list'}
        </button>
        <button type="button" onClick={saveMarkdown} disabled={!rawDirty} className={buttonClass.primary}>
          Save
        </button>
      </div>
    </div>
  );

  return (
    <div className={compact ? 'w-full space-y-3' : 'w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-4'}>
      <div>{header}</div>
      {habitsSlot}
      {editorMode !== 'raw' && attentionBar && <div>{attentionBar}</div>}

      {editorMode === 'visual' &&
        (compact ? (
          listView
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_18rem] gap-6 items-start">
            {listView}
            {glance}
          </div>
        ))}

      {editorMode === 'split' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {listView}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
              <FileCode className="w-4 h-4" /> Markdown ({date}.md)
            </div>
            {markdownEditor(22, false)}
          </div>
        </div>
      )}

      {editorMode === 'raw' && <div>{markdownEditor(compact ? 18 : 26, true)}</div>}
    </div>
  );
};
