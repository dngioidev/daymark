import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Check, ChevronLeft, ChevronRight, Circle, ExternalLink, RotateCcw } from 'lucide-react';
import { DailyDocument, StatusDefinition } from '../types/daymark';
import { getPreviousDate } from '../utils/lifecycleEngine';
import { formatDay, formatLongDate } from '../utils/dateFormat';
import { MarkdownPreview } from './MarkdownPreview';
import { buttonClass } from './ui/Dialog';

interface DailyHistoryViewProps {
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
  compact?: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const countTasks = (doc?: DailyDocument) => {
  const tasks = doc?.headings.flatMap((h) => h.items) ?? [];
  return { total: tasks.length, done: tasks.filter((t) => t.status === 'done').length };
};

export const DailyHistoryView: React.FC<DailyHistoryViewProps> = ({
  dailyDocuments,
  selectedDate,
  simulatedToday,
  statuses,
  onSelectDate,
  onReopenTask,
  onMarkDoneOnDay,
  onOpenDay,
  compact = false,
}) => {
  const [year, setYear] = useState(() => Number(selectedDate.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(selectedDate.slice(5, 7)) - 1);

  // Follow the selected day when it moves to another month
  useEffect(() => {
    setYear(Number(selectedDate.slice(0, 4)));
    setMonth(Number(selectedDate.slice(5, 7)) - 1);
  }, [selectedDate]);

  const shiftMonth = (delta: number) => {
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

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const recentDays = dailyDocuments
    .filter((d) => d.date <= simulatedToday)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14);

  const card = 'dm-card bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800';
  const iconBtn =
    'inline-flex items-center justify-center w-11 h-11 sm:w-9 sm:h-9 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-800';

  return (
    <div className={compact ? 'space-y-3 text-sm' : 'w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-4 text-sm'}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-xl font-bold text-[var(--dm-page-fg)]">History</h1>
        <p className="text-stone-700 dark:text-stone-300">
          Last 7 days: <strong>{week.done} done</strong> · {week.open} still open
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-5 space-y-4">
          <div className={`${card} p-3`}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold pl-1">{monthLabel}</h2>
              <div className="flex items-center">
                <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" className={iconBtn}>
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" className={iconBtn}>
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1" aria-hidden="true">
              {WEEKDAYS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstWeekday }).map((_, i) => (
                <div key={`e${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const date = `${year}-${pad(month + 1)}-${pad(i + 1)}`;
                const doc = docMap.get(date);
                const { total, done } = countTasks(doc);
                const isSelected = date === selectedDate;
                const isToday = date === simulatedToday;
                const isFuture = date > simulatedToday;
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
                    onClick={() => onSelectDate(date)}
                    disabled={isFuture}
                    aria-pressed={isSelected}
                    aria-label={`${formatLongDate(date)}${doc ? (total ? `: ${done} of ${total} done` : ': notes only') : ': nothing recorded'}`}
                    className={`h-11 rounded-lg flex flex-col items-center justify-center gap-1 text-sm tabular-nums ${
                      isSelected
                        ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 font-bold'
                        : isToday
                          ? 'ring-2 ring-accent font-bold text-stone-900 dark:text-stone-50'
                          : isFuture
                            ? 'text-stone-400 dark:text-stone-600'
                            : doc
                              ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 hover:bg-stone-200 dark:hover:bg-stone-700'
                              : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
                    }`}
                  >
                    {i + 1}
                    <span className={`w-4 h-1 rounded-full ${marker || 'bg-transparent'}`} />
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

        <div className={`lg:col-span-7 ${card} p-4 space-y-4`}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-stone-900 dark:text-stone-50">{formatLongDate(selectedDate)}</h2>
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
                          <li key={task.id} className="flex flex-wrap items-start gap-x-2.5 gap-y-1 p-2.5 rounded-lg border border-stone-200 dark:border-stone-800">
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
    </div>
  );
};
