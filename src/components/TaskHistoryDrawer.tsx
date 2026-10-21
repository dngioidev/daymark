import React, { useEffect, useState } from 'react';
import { CalendarCheck, Check, RotateCcw, Trash2, X } from 'lucide-react';
import { AgingThresholds, StatusDefinition, TaskItem } from '../types/daymark';
import { calculateTaskAge } from '../utils/lifecycleEngine';
import { formatDay, formatLongDate } from '../utils/dateFormat';
import { Dialog, buttonClass } from './ui/Dialog';
import { confirmDialog } from './ui/feedback';

interface TaskDetailsSheetProps {
  task: TaskItem | null;
  currentDate: string;
  statuses: StatusDefinition[];
  agingThresholds?: AgingThresholds;
  onClose: () => void;
  onReopenTask: (taskId: string) => void;
  onOpenHistoricalCorrection: (task: TaskItem) => void;
  /** Omit for a read-only view (e.g. a past day). */
  onUpdateTask?: (task: TaskItem) => void;
  onDeleteTask?: (taskId: string) => void;
}

/** History entries were written with ISO dates and "#Section"; show them in everyday words. */
export const humanizeLog = (text: string, today: string): string =>
  text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (d) => formatDay(d, today)).replace(/#(\w[\w-]*)/g, '$1');

/**
 * Task details: notes, checklist, history and the less frequent actions. Opened by tapping a
 * task title. Edits apply immediately (notes on blur).
 */
export const TaskHistoryDrawer: React.FC<TaskDetailsSheetProps> = ({
  task,
  currentDate,
  statuses,
  onClose,
  onReopenTask,
  onOpenHistoricalCorrection,
  onUpdateTask,
  onDeleteTask,
}) => {
  const [notesDraft, setNotesDraft] = useState(task?.description ?? '');
  const [newItem, setNewItem] = useState('');
  useEffect(() => {
    setNotesDraft(task?.description ?? '');
    setNewItem('');
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!task) return <Dialog isOpen={false} onClose={onClose} title="">{null}</Dialog>;

  const editable = Boolean(onUpdateTask);
  const statusLabel = statuses.find((s) => s.id === task.status)?.label ?? task.status;
  const ageDays = calculateTaskAge(task, currentDate);
  const isDone = task.status === 'done';
  const checklist = task.checklist ?? [];
  const update = (patch: Partial<TaskItem>) => onUpdateTask?.({ ...task, ...patch });

  const saveNotes = () => {
    if ((task.description ?? '') !== notesDraft.trim()) update({ description: notesDraft.trim() || undefined });
  };
  const addItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.trim()) return;
    update({ checklist: [...checklist, { id: `chk-${Date.now()}`, text: newItem.trim(), done: false }] });
    setNewItem('');
  };
  const askDelete = async () => {
    const ok = await confirmDialog({
      title: 'Delete this task?',
      message: <>“{task.title}” will be removed from this day.</>,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) {
      onDeleteTask?.(task.id);
      onClose();
    }
  };

  const rows: [string, React.ReactNode][] = [
    ['Section', task.heading],
    ['Status', statusLabel],
    ['Created', formatLongDate(task.createdDate)],
  ];
  if (!isDone && ageDays > 0) rows.push(['In your list for', ageDays === 1 ? '1 day' : `${ageDays} days`]);
  if (task.completedDate) rows.push(['Done', formatDay(task.completedDate, currentDate)]);

  return (
    <Dialog
      isOpen
      onClose={onClose}
      variant="sheet"
      title={task.title}
      footer={
        <>
          {onDeleteTask && (
            <button type="button" onClick={askDelete} className={`${buttonClass.ghost} mr-auto text-rose-700 dark:text-rose-400`}>
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          )}
          {isDone ? (
            <button
              type="button"
              className={buttonClass.secondary}
              onClick={() => {
                onReopenTask(task.id);
                onClose();
              }}
            >
              <RotateCcw className="w-4 h-4" /> Reopen
            </button>
          ) : (
            <button
              type="button"
              className={buttonClass.secondary}
              onClick={() => {
                onClose();
                onOpenHistoricalCorrection(task);
              }}
            >
              <CalendarCheck className="w-4 h-4" /> Mark done on…
            </button>
          )}
        </>
      }
    >
      <div className="px-5 py-4 space-y-5 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          {rows.map(([k, v]) => (
            <React.Fragment key={k}>
              <dt className="text-stone-600 dark:text-stone-400">{k}</dt>
              <dd className="text-stone-900 dark:text-stone-100 font-medium">{v}</dd>
            </React.Fragment>
          ))}
        </dl>

        <div>
          <label htmlFor="task-notes" className="block text-sm font-semibold mb-1.5">
            Notes
          </label>
          {editable ? (
            <textarea
              id="task-notes"
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={saveNotes}
              rows={3}
              placeholder="Add details, links or context…"
              className="w-full px-3 py-2 text-[15px] sm:text-sm bg-stone-50 dark:bg-stone-800/60 border border-stone-300 dark:border-stone-700 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 placeholder:text-stone-500"
            />
          ) : (
            <p className="text-stone-700 dark:text-stone-300 whitespace-pre-wrap">{task.description || 'No notes.'}</p>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-1.5">Checklist</h3>
          <ul className="space-y-0.5">
            {checklist.map((item) => (
              <li key={item.id} className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={!editable}
                  aria-pressed={item.done}
                  aria-label={`${item.done ? 'Uncheck' : 'Check'} "${item.text}"`}
                  onClick={() => update({ checklist: checklist.map((c) => (c.id === item.id ? { ...c, done: !c.done } : c)) })}
                  className="flex items-center gap-2.5 flex-1 min-h-11 text-left"
                >
                  <span
                    className={`w-5 h-5 shrink-0 rounded-md border-2 flex items-center justify-center ${
                      item.done ? 'bg-emerald-700 border-emerald-700 text-white dark:bg-emerald-500 dark:border-emerald-500 dark:text-stone-950' : 'border-stone-400 dark:border-stone-500'
                    }`}
                  >
                    {item.done && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </span>
                  <span className={item.done ? 'line-through text-stone-500 dark:text-stone-400' : ''}>{item.text}</span>
                </button>
                {editable && (
                  <button
                    type="button"
                    aria-label={`Remove "${item.text}"`}
                    onClick={() => update({ checklist: checklist.filter((c) => c.id !== item.id) })}
                    className="inline-flex items-center justify-center w-11 h-11 rounded-lg text-stone-500 hover:text-rose-700 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-rose-400 dark:hover:bg-stone-800"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {editable && (
            <form onSubmit={addItem} className="mt-1 flex gap-2">
              <input
                aria-label="New checklist item"
                type="text"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder="Add an item…"
                enterKeyHint="done"
                className="flex-1 min-w-0 px-3 min-h-11 sm:min-h-9 text-[15px] sm:text-sm bg-stone-50 dark:bg-stone-800/60 border border-stone-300 dark:border-stone-700 rounded-lg placeholder:text-stone-500"
              />
              <button type="submit" disabled={!newItem.trim()} className={buttonClass.secondary}>
                Add
              </button>
            </form>
          )}
          {!editable && checklist.length === 0 && <p className="text-stone-600 dark:text-stone-400">No checklist.</p>}
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-2">History</h3>
          {task.historyLog?.length ? (
            <ol className="relative pl-5 space-y-3 before:absolute before:left-[5px] before:top-1.5 before:bottom-1.5 before:w-0.5 before:bg-stone-200 dark:before:bg-stone-700">
              {task.historyLog.map((log) => (
                <li key={log.id} className="relative">
                  <span className="absolute -left-5 top-1.5 w-3 h-3 rounded-full bg-stone-400 dark:bg-stone-500 ring-4 ring-white dark:ring-stone-900" />
                  <div className="text-xs text-stone-600 dark:text-stone-400">
                    {formatDay(log.date, currentDate)} ·{' '}
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </div>
                  <div className="text-stone-900 dark:text-stone-100">{humanizeLog(log.details, currentDate)}</div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-stone-600 dark:text-stone-400">Nothing has happened to this task yet.</p>
          )}
        </div>
      </div>
    </Dialog>
  );
};
