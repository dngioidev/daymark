import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CalendarCheck, Check, ChevronLeft, ChevronRight, Circle, ExternalLink, MoreHorizontal, RotateCcw } from 'lucide-react';
import { DailyDocument, StatusDefinition, TaskItem } from '../types/daymark';
import { getNextDate, getPreviousDate } from '../utils/lifecycleEngine';
import { formatDay, formatLongDate } from '../utils/dateFormat';
import { monthCells, weekCells } from '../utils/calendarGrid';
import { getMoveTaskDateError } from '../utils/taskActions';
import { MarkdownPreview } from './MarkdownPreview';
import { Dialog, buttonClass } from './ui/Dialog';
import { Menu } from './ui/Menu';

interface CalendarViewProps {
  dailyDocuments: DailyDocument[];
  selectedDate: string;
  simulatedToday: string;
  statuses: StatusDefinition[];
  onSelectDate: (date: string) => void;
  onReopenTask: (taskId: string, targetDate: string) => void;
  /** Marks a task that is still open today as done on the selected past day. */
  onMarkDoneOnDay?: (taskId: string, date: string) => void;
  /** Opens the day in the Today view (editable). */
  onOpenDay?: (date: string) => void;
  onMoveTask: (taskId: string, fromDate: string, toDate: string) => void;
  compact?: boolean;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DRAG_TYPE = 'application/x-daymark-task';

const countTasks = (doc?: DailyDocument) => {
  const tasks = doc?.headings.flatMap((h) => h.items) ?? [];
  return { total: tasks.length, done: tasks.filter((t) => t.status === 'done').length };
};

export const CalendarView: React.FC<CalendarViewProps> = ({
  dailyDocuments,
  selectedDate,
  simulatedToday,
  statuses,
  onSelectDate,
  onReopenTask,
  onMarkDoneOnDay,
  onOpenDay,
  onMoveTask,
  compact = false,
}) => {
  const [year, setYear] = useState(() => Number(selectedDate.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(selectedDate.slice(5, 7)) - 1);
  const [view, setView] = useState<'month' | 'week'>('month');
  const [weekAnchor, setWeekAnchor] = useState(selectedDate);
  const [moveTask, setMoveTask] = useState<TaskItem | null>(null);
  const [moveDate, setMoveDate] = useState('');
  const [moveError, setMoveError] = useState<string | null>(null);
  const moveId = useId();
  const moveTrigger = useRef<HTMLButtonElement | null>(null);
  const canDrag = !compact && typeof window !== 'undefined' && window.matchMedia('(min-width: 768px) and (pointer: fine)').matches;

  // Follow the selected day when it moves to another month
  useEffect(() => {
    setYear(Number(selectedDate.slice(0, 4)));
    setMonth(Number(selectedDate.slice(5, 7)) - 1);
    setWeekAnchor(selectedDate);
  }, [selectedDate]);

  const shiftMonth = (delta: number) => {
    if (view === 'week') {
      setWeekAnchor((anchor) => delta < 0 ? getPreviousDate(anchor, 7) : getNextDate(anchor, 7));
      return;
    }
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const docMap = useMemo(() => new Map(dailyDocuments.map((d) => [d.date, d])), [dailyDocuments]);
  const selectedDoc = docMap.get(selectedDate);
  const todayDoc = docMap.get(simulatedToday);
  const openToday = new Set(todayDoc?.headings.flatMap((h) => h.items).filter((t) => t.status !== 'done').map((t) => t.id) ?? []);

  // Last 7 days, today included
  const week = useMemo(() => {
    const from = getPreviousDate(simulatedToday, 6);
    const doneIds = new Set<string>();
    for (const doc of dailyDocuments) {
      for (const t of doc.headings.flatMap((h) => h.items)) {
        if (t.status === 'done' && t.completedDate && t.completedDate >= from && t.completedDate <= simulatedToday) doneIds.add(t.id);
      }
    }
    return { done: doneIds.size, open: openToday.size };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyDocuments, simulatedToday]);

  const cells = view === 'month' ? monthCells(year, month, dailyDocuments, simulatedToday) : weekCells(weekAnchor, dailyDocuments, simulatedToday);
  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const recentDays = dailyDocuments
    .filter((d) => d.date <= simulatedToday)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14);

  const card = 'dm-card bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800';
  const iconBtn =
    'inline-flex items-center justify-center w-11 h-11 sm:w-9 sm:h-9 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-800';

  const submitMove = (event: React.FormEvent) => {
    event.preventDefault();
    const error = getMoveTaskDateError(moveDate, selectedDate, simulatedToday);
    setMoveError(error);
    if (error || !moveTask) return;
    onMoveTask(moveTask.id, selectedDate, moveDate);
    setMoveTask(null);
  };

  const dropTask = (event: React.DragEvent, date: string) => {
    if (!canDrag || date < simulatedToday || date === selectedDate) return;
    event.preventDefault();
    try {
      const payload: unknown = JSON.parse(event.dataTransfer.getData(DRAG_TYPE));
      if (!payload || typeof payload !== 'object' || !('taskId' in payload) || !('fromDate' in payload)) return;
      if (payload.fromDate !== selectedDate || typeof payload.taskId !== 'string') return;
      if (!selectedDoc?.headings.some((h) => h.items.some((task) => task.id === payload.taskId))) return;
      onMoveTask(payload.taskId, selectedDate, date);
    } catch { /* Ignore external or malformed drops. */ }
  };

  return (
    <div className={compact ? 'space-y-3 text-sm' : 'w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-4 text-sm'}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-xl font-bold text-[var(--dm-page-fg)]">Calendar</h1>
        <p className="text-stone-700 dark:text-stone-300">
          Last 7 days: <strong>{week.done} done</strong> · {week.open} still open
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className={`${view === 'week' ? 'lg:col-span-12' : 'lg:col-span-6'} min-w-0 space-y-4`}>
          <div className={`${card} p-3`}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold pl-1">{view === 'month' ? monthLabel : `${formatDay(cells[0].date, simulatedToday)} – ${formatDay(cells[6].date, simulatedToday)}`}</h2>
              <div className="flex items-center">
                <button type="button" onClick={() => shiftMonth(-1)} aria-label={`Previous ${view}`} className={iconBtn}>
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button type="button" onClick={() => shiftMonth(1)} aria-label={`Next ${view}`} className={iconBtn}>
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex gap-1 mb-3" role="group" aria-label="Calendar view">
              {(['month', 'week'] as const).map((mode) => (
                <button key={mode} type="button" aria-pressed={view === mode} onClick={() => setView(mode)}
                  className={`min-h-11 px-3 rounded-lg font-medium ${view === mode ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900' : 'hover:bg-stone-100 dark:hover:bg-stone-800'}`}>
                  {mode === 'month' ? 'Month' : 'Week'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1" aria-hidden="true">
              {WEEKDAYS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map(({ date, done, total, hasNotes, titles, inMonth, isToday }) => {
                const doc = docMap.get(date);
                const isSelected = date === selectedDate;
                const ratio = total ? done / total : 0;
                const marker = !doc
                  ? ''
                  : total === 0
                    ? 'bg-stone-400'
                    : ratio === 1
                      ? 'bg-emerald-600'
                      : ratio > 0
                        ? 'bg-amber-500'
                        : 'bg-stone-400';
                return (
                  <button
                    key={date}
                    type="button"
                    data-date={date}
                    onClick={() => onSelectDate(date)}
                    onDragOver={(event) => {
                      if (canDrag && date >= simulatedToday && date !== selectedDate && event.dataTransfer.types.includes(DRAG_TYPE)) {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                      }
                    }}
                    onDrop={(event) => dropTask(event, date)}
                    aria-pressed={isSelected}
                    aria-label={`${formatLongDate(date)}${doc ? (total ? `: ${done} of ${total} done` : ': notes only') : ': nothing recorded'}`}
                    className={`${view === 'week' ? 'min-h-36 justify-start py-2' : 'min-h-20 justify-center'} min-w-0 px-1 rounded-lg flex flex-col items-center gap-1 text-sm tabular-nums ${
                      isSelected
                        ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 font-bold'
                        : isToday
                          ? 'ring-2 ring-accent font-bold text-stone-900 dark:text-stone-50'
                          : !inMonth
                            ? 'text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
                            : doc
                              ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 hover:bg-stone-200 dark:hover:bg-stone-700'
                              : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
                    }`}
                  >
                    <span>{Number(date.slice(8))}</span>
                    {total > 0 && <span className="text-xs">{done}/{total}</span>}
                    {hasNotes && <span role="img" aria-label="has notes" className="w-1.5 h-1.5 rounded-full bg-current" />}
                    <span className={`w-4 h-1 rounded-full ${marker || 'bg-transparent'}`} />
                    {view === 'week' && <>
                      {titles.slice(0, 6).map((title, index) => <span key={index} className="w-full text-left text-xs break-words line-clamp-2">{title}</span>)}
                      {titles.length > 6 && <span className="text-xs">{`+${titles.length - 6} more`}</span>}
                    </>}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-600 dark:text-stone-400 pl-1">
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-1 rounded-full bg-emerald-600" /> all done
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-1 rounded-full bg-amber-500" /> some done
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-3 h-1 rounded-full bg-stone-400" /> none done
              </span>
            </div>
          </div>

          {!compact && recentDays.length > 0 && (
            <div className={`${card} p-2`}>
              <h2 className="px-2 pt-1 pb-1.5 font-semibold">Recent days</h2>
              <ul>
                {recentDays.map((d) => {
                  const { total, done } = countTasks(d);
                  return (
                    <li key={d.date}>
                      <button
                        type="button"
                        onClick={() => onSelectDate(d.date)}
                        aria-current={d.date === selectedDate ? 'date' : undefined}
                        className={`w-full min-h-10 px-2 rounded-lg flex items-center justify-between ${
                          d.date === selectedDate ? 'bg-stone-100 dark:bg-stone-800 font-semibold' : 'hover:bg-stone-50 dark:hover:bg-stone-800/50'
                        }`}
                      >
                        <span>{formatDay(d.date, simulatedToday)}</span>
                        <span className="text-stone-600 dark:text-stone-400 tabular-nums">{total ? `${done} of ${total} done` : 'notes'}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className={`${view === 'week' ? 'lg:col-span-12' : 'lg:col-span-6'} ${card} p-4 space-y-4`}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-stone-900 dark:text-stone-50">{formatLongDate(selectedDate)}</h2>
              {selectedDate > simulatedToday && <p className="font-medium text-stone-700 dark:text-stone-300">Planned</p>}
              {selectedDoc && (
                <p className="text-stone-600 dark:text-stone-400">
                  {(() => {
                    const { total, done } = countTasks(selectedDoc);
                    return total ? `${done} of ${total} tasks done` : 'No tasks, notes only';
                  })()}
                </p>
              )}
            </div>
            {onOpenDay && (
              <button type="button" onClick={() => onOpenDay(selectedDate)} className={buttonClass.secondary}>
                <ExternalLink className="w-4 h-4" /> Open this day
              </button>
            )}
          </div>

          {selectedDoc ? (
            selectedDoc.headings
              .filter((s) => s.items.length > 0 || s.notesContent)
              .map((section) => (
                <section key={section.name} className="space-y-2">
                  <h3 className="font-semibold text-stone-800 dark:text-stone-200">{section.name}</h3>
                  {section.items.length > 0 && (
                    <ul className="space-y-1.5">
                      {section.items.map((task) => {
                        const isDone = task.status === 'done';
                        const statusLabel = statuses.find((s) => s.id === task.status)?.label ?? task.status;
                        const canMarkDone = !isDone && onMarkDoneOnDay && openToday.has(task.id) && selectedDate < simulatedToday;
                        return (
                          <li key={task.id} draggable={canDrag}
                            onDragStart={(event) => {
                              if (!canDrag) { event.preventDefault(); return; }
                              event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ taskId: task.id, fromDate: selectedDate }));
                              event.dataTransfer.effectAllowed = 'move';
                            }}
                            className="flex flex-wrap items-start gap-x-2.5 gap-y-1 p-2.5 rounded-lg border border-stone-200 dark:border-stone-800">
                            {isDone ? (
                              <Check className="mt-0.5 w-4 h-4 shrink-0 text-emerald-700 dark:text-emerald-400" role="img" aria-label="Done" />
                            ) : (
                              <Circle className="mt-0.5 w-4 h-4 shrink-0 text-stone-400" role="img" aria-label="Not done" />
                            )}
                            <div className="flex-1 min-w-48">
                              <div className={isDone ? 'text-stone-600 dark:text-stone-400 line-through' : 'font-medium text-stone-900 dark:text-stone-100'}>
                                {task.title}
                              </div>
                              <div className="text-xs text-stone-600 dark:text-stone-400">
                                {statusLabel}
                                {task.completedDate && ` · done ${formatDay(task.completedDate, simulatedToday)}`}
                                {task.carriedFromDate && ` · moved from ${formatDay(task.carriedFromDate, simulatedToday)}`}
                              </div>
                            </div>
                            {isDone && (
                              <button type="button" onClick={() => onReopenTask(task.id, selectedDate)} className={`${buttonClass.ghost} ml-auto`}>
                                <RotateCcw className="w-4 h-4" /> Reopen
                              </button>
                            )}
                            {canMarkDone && (
                              <button type="button" onClick={() => onMarkDoneOnDay!(task.id, selectedDate)} className={`${buttonClass.ghost} ml-auto`}>
                                <CalendarCheck className="w-4 h-4" /> Done this day
                              </button>
                            )}
                            <Menu align="right" items={[{ label: 'Move to date…', onSelect: () => {
                              moveTrigger.current?.focus();
                              setMoveTask(task);
                              setMoveDate(selectedDate === simulatedToday ? getNextDate(simulatedToday) : simulatedToday);
                              setMoveError(null);
                            } }]} trigger={(props) => (
                              <button type="button" {...props}
                                onFocus={(event) => { moveTrigger.current = event.currentTarget; }}
                                aria-label={`More actions for "${task.title}"`} className={iconBtn}>
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                            )} />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {section.notesContent && (
                    <div className="p-3 bg-stone-50 dark:bg-stone-800/40 rounded-lg border border-stone-200 dark:border-stone-800">
                      <MarkdownPreview content={section.notesContent} />
                    </div>
                  )}
                </section>
              ))
          ) : (
            <p className="py-10 text-center text-stone-600 dark:text-stone-400">Nothing was recorded on {formatDay(selectedDate, simulatedToday)}.</p>
          )}
        </div>
      </div>
      <Dialog isOpen={!!moveTask} onClose={() => setMoveTask(null)} title="Move to date…"
        description={`Move “${moveTask?.title ?? ''}” from ${formatDay(selectedDate, simulatedToday)}.`} size="sm"
        footer={<>
          <button type="button" className={buttonClass.secondary} onClick={() => setMoveTask(null)}>Cancel</button>
          <button type="submit" form={moveId} className={buttonClass.primary}>Move</button>
        </>}>
        <form id={moveId} onSubmit={submitMove} noValidate className="px-5 py-4 space-y-2">
          <label htmlFor={`${moveId}-date`} className="block text-sm font-medium">Move to</label>
          <input id={`${moveId}-date`} type="date" min={simulatedToday} value={moveDate}
            onChange={(event) => { setMoveDate(event.target.value); setMoveError(getMoveTaskDateError(event.target.value, selectedDate, simulatedToday)); }}
            aria-invalid={!!moveError} aria-describedby={moveError ? `${moveId}-error` : undefined}
            className="w-full min-h-11 px-3 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800" />
          {moveError && <p id={`${moveId}-error`} role="alert" className="text-sm text-stone-700 dark:text-stone-300">{moveError}</p>}
        </form>
      </Dialog>
    </div>
  );
};
