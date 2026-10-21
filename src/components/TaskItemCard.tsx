import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BellOff,
  Bell,
  Check,
  CalendarCheck,
  ChevronDown,
  Edit2,
  FileText,
  ListChecks,
  MoreHorizontal,
  PanelRightOpen,
  Trash2,
} from 'lucide-react';
import { AgingThresholds, StatusDefinition, TaskItem } from '../types/daymark';
import { calculateTaskAge, getAgingSeverity, getPreviousDate, isAlertDismissedForDate } from '../utils/lifecycleEngine';
import { formatAge, formatDay } from '../utils/dateFormat';
import { Menu } from './ui/Menu';
import { confirmDialog } from './ui/feedback';

interface TaskItemCardProps {
  task: TaskItem;
  currentDate: string;
  statuses: StatusDefinition[];
  agingThresholds: AgingThresholds;
  onUpdateTask: (task: TaskItem) => void;
  onDeleteTask: (taskId: string) => void;
  onOpenHistoricalModal: (task: TaskItem) => void;
  /** Opens the task details sheet (notes, checklist, history). */
  onOpenHistoryDrawer: (task: TaskItem) => void;
  onQuickHistoricalDone: (taskId: string, targetDate: string) => void;
  onToggleAlertDismiss: (taskId: string) => void;
}

/** "today" / "yesterday" / "on Fri 16 Oct", for use inside a sentence. */
export const inlineDay = (date: string, today: string): string => {
  const label = formatDay(date, today);
  return ['Today', 'Yesterday', 'Tomorrow'].includes(label) ? label.toLowerCase() : `on ${label}`;
};

/** Statuses offered in pickers: "Note" is a document item type, not something a task moves to. */
export const pickableStatuses = (statuses: StatusDefinition[], current?: string) =>
  statuses.filter((s) => s.id !== 'note' || s.id === current);

/**
 * One task as a compact row: checkbox, title, and a single meta line (status, age, checklist).
 * Everything else (notes, checklist editing, history, "Mark done on…") lives in the details
 * sheet or the "…" menu, so a phone shows a full day's list at a glance.
 */
export const TaskItemCard: React.FC<TaskItemCardProps> = ({
  task,
  currentDate,
  statuses,
  agingThresholds,
  onUpdateTask,
  onDeleteTask,
  onOpenHistoricalModal,
  onOpenHistoryDrawer,
  onQuickHistoricalDone,
  onToggleAlertDismiss,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);

  const statusDef = statuses.find((s) => s.id === task.status) ?? {
    id: task.status,
    label: task.status,
    color: 'text-stone-700 bg-stone-100 border-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:border-stone-700',
  };
  const isDone = task.status === 'done';
  const ageDays = calculateTaskAge(task, currentDate);
  const severity = isDone ? 'normal' : getAgingSeverity(task, currentDate, agingThresholds, statuses);
  const isSnoozed = isAlertDismissedForDate(task, currentDate);
  const showWarning = severity !== 'normal' && !isSnoozed;
  const carriedDay = task.carriedFromDate || getPreviousDate(currentDate, 1);
  const isCarried = !isDone && (Boolean(task.carriedFromDate) || ageDays > 0);
  const checklist = task.checklist ?? [];

  const setStatus = (statusId: string) =>
    onUpdateTask({ ...task, status: statusId, completedDate: statusId === 'done' ? currentDate : undefined });

  const toggleDone = () => setStatus(isDone ? 'in-progress' : 'done');

  const saveTitle = () => {
    const next = titleDraft.trim();
    if (next && next !== task.title) onUpdateTask({ ...task, title: next });
    setIsEditingTitle(false);
  };

  const askDelete = async () => {
    const ok = await confirmDialog({
      title: 'Delete this task?',
      message: <>“{task.title}” will be removed from this day.</>,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) onDeleteTask(task.id);
  };

  const accent = showWarning
    ? severity === 'critical'
      ? 'border-l-rose-600 dark:border-l-rose-400'
      : 'border-l-amber-500 dark:border-l-amber-400'
    : 'border-l-transparent';

  return (
    <div
      className={`group relative flex items-start gap-3 pl-3 pr-1 py-2.5 rounded-lg border border-stone-200 dark:border-stone-800 border-l-4 ${accent} bg-white dark:bg-stone-900`}
    >
      <button
        type="button"
        onClick={toggleDone}
        aria-label={isDone ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
        aria-pressed={isDone}
        className={`relative mt-0.5 w-5 h-5 rounded-md flex items-center justify-center border-2 shrink-0 transition-colors before:absolute before:-inset-3 before:content-[''] ${
          isDone
            ? 'bg-emerald-700 border-emerald-700 text-white dark:bg-emerald-500 dark:border-emerald-500 dark:text-stone-950'
            : 'border-stone-400 dark:border-stone-500 hover:border-stone-600 dark:hover:border-stone-300 bg-white dark:bg-stone-900'
        }`}
      >
        {isDone && <Check className="w-3.5 h-3.5 stroke-[3]" />}
      </button>

      <div className="flex-1 min-w-0">
        {isEditingTitle ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveTitle();
            }}
            className="flex items-center gap-2"
          >
            <input
              aria-label="Task title"
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => e.key === 'Escape' && (setTitleDraft(task.title), setIsEditingTitle(false))}
              enterKeyHint="done"
              className="flex-1 min-w-0 px-2 py-1.5 text-[15px] sm:text-sm bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-md"
              autoFocus
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => onOpenHistoryDrawer(task)}
            className={`relative block w-full min-h-6 text-left text-[15px] sm:text-sm leading-snug font-medium break-words before:absolute before:-inset-y-2.5 before:inset-x-0 before:content-[''] ${
              isDone
                ? 'line-through text-stone-500 dark:text-stone-400'
                : 'text-stone-900 dark:text-stone-100 hover:text-amber-800 dark:hover:text-amber-300'
            }`}
          >
            {task.title}
          </button>
        )}

        <div className="mt-1 flex items-center gap-x-2.5 gap-y-1 flex-wrap text-xs text-stone-600 dark:text-stone-400">
          <Menu
            heading="Status"
            items={pickableStatuses(statuses, task.status).map((s) => ({
              label: s.label,
              active: s.id === task.status,
              trailing: s.id === task.status ? <Check className="w-4 h-4 text-amber-700 dark:text-amber-400" /> : undefined,
              onSelect: () => setStatus(s.id),
            }))}
            trigger={(props) => (
              <button
                type="button"
                {...props}
                aria-label={`Status: ${statusDef.label}. Change status`}
                className={`relative inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-medium whitespace-nowrap before:absolute before:-inset-y-2.5 before:-inset-x-1 before:content-[''] ${statusDef.color}`}
              >
                {statusDef.label}
                <ChevronDown className="w-3 h-3 opacity-70" />
              </button>
            )}
          />

          {isCarried && ageDays > 0 && (
            <span
              className={`inline-flex items-center gap-1 ${
                showWarning
                  ? severity === 'critical'
                    ? 'text-rose-700 dark:text-rose-400 font-semibold'
                    : 'text-amber-800 dark:text-amber-300 font-semibold'
                  : ''
              }`}
              title={`In your list since ${formatDay(task.createdDate, currentDate)}`}
            >
              {showWarning && (severity === 'critical' ? <AlertCircle className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />)}
              {formatAge(ageDays)}
            </span>
          )}

          {isDone && task.completedDate && (
            <span className="text-emerald-800 dark:text-emerald-400">Done {inlineDay(task.completedDate, currentDate)}</span>
          )}

          {checklist.length > 0 && (
            <span className="inline-flex items-center gap-1" role="img" aria-label={`${checklist.filter((c) => c.done).length} of ${checklist.length} checklist items done`}>
              <ListChecks className="w-3.5 h-3.5" />
              {checklist.filter((c) => c.done).length}/{checklist.length}
            </span>
          )}

          {task.description && (
            <span className="inline-flex items-center" title="Has notes" role="img" aria-label="Has notes">
              <FileText className="w-3.5 h-3.5" />
            </span>
          )}
        </div>
      </div>

      <Menu
        align="right"
        items={[
          ...(isCarried
            ? [
                {
                  label: `Mark done ${inlineDay(carriedDay, currentDate)}`,
                  icon: <CalendarCheck className="w-4 h-4" />,
                  onSelect: () => onQuickHistoricalDone(task.id, carriedDay),
                },
                { label: 'Mark done on another day…', icon: <CalendarCheck className="w-4 h-4" />, onSelect: () => onOpenHistoricalModal(task) },
              ]
            : []),
          { label: 'Rename', icon: <Edit2 className="w-4 h-4" />, onSelect: () => (setTitleDraft(task.title), setIsEditingTitle(true)) },
          { label: 'Details & history', icon: <PanelRightOpen className="w-4 h-4" />, onSelect: () => onOpenHistoryDrawer(task) },
          ...(severity !== 'normal'
            ? [
                {
                  label: isSnoozed ? 'Show warning again' : 'Hide warning today',
                  icon: isSnoozed ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />,
                  onSelect: () => onToggleAlertDismiss(task.id),
                },
              ]
            : []),
          { label: 'Delete', icon: <Trash2 className="w-4 h-4" />, danger: true, separatorBefore: true, onSelect: askDelete },
        ]}
        trigger={(props) => (
          <button
            type="button"
            {...props}
            aria-label={`More actions for "${task.title}"`}
            className="-my-1.5 inline-flex items-center justify-center w-11 h-11 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-800"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        )}
      />
    </div>
  );
};
