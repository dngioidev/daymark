import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  Lock,
  Unlock,
  FileText,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { DailyDocument, StatusDefinition, TaskItem } from '../types/daymark';
import { formatFullDate, getRelativeDateLabel } from '../utils/lifecycleEngine';
import { MarkdownPreview } from './MarkdownPreview';

interface DailyHistoryViewProps {
  dailyDocuments: DailyDocument[];
  selectedDate: string;
  simulatedToday: string;
  statuses: StatusDefinition[];
  onSelectDate: (date: string) => void;
  onReopenTask: (taskId: string, targetDate: string) => void;
}

export const DailyHistoryView: React.FC<DailyHistoryViewProps> = ({
  dailyDocuments,
  selectedDate,
  simulatedToday,
  statuses,
  onSelectDate,
  onReopenTask,
}) => {
  // Calendar month state (defaults to October 2026 based on metadata)
  const [currentYear, setCurrentYear] = useState<number>(2026);
  const [currentMonth, setCurrentMonth] = useState<number>(9); // 0-indexed: 9 = October

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  // Build calendar matrix
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay(); // 0 is Sunday

  const docMap = new Map<string, DailyDocument>();
  for (const doc of dailyDocuments) {
    docMap.set(doc.date, doc);
  }

  const selectedDoc = docMap.get(selectedDate);

  const isHistorical = selectedDate < simulatedToday;

  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200 dark:border-stone-800">
        <div>
          <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-amber-600 dark:text-amber-500" />
            <span>Daily History & Calendar</span>
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Browse past daily records, completion events, and historical task preservation.
          </p>
        </div>

        {/* Selected date quick summary */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono bg-stone-100 dark:bg-stone-800 px-3 py-1.5 rounded-md text-stone-700 dark:text-stone-300">
            Viewing: {selectedDate} ({getRelativeDateLabel(selectedDate, simulatedToday)})
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Calendar Grid & Quick Timeline (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Calendar Card */}
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4 shadow-2xs">
            {/* Month Navigation */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                {monthNames[currentMonth]} {currentYear}
              </h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={handlePrevMonth}
                  className="p-1 rounded-md text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={handleNextMonth}
                  className="p-1 rounded-md text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Weekdays */}
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-2">
              <span>Su</span>
              <span>Mo</span>
              <span>Tu</span>
              <span>We</span>
              <span>Th</span>
              <span>Fr</span>
              <span>Sa</span>
            </div>

            {/* Calendar Days */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
                <div key={`empty-${idx}`} className="h-9" />
              ))}

              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const dayNum = idx + 1;
                const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(
                  dayNum
                ).padStart(2, '0')}`;
                const hasDoc = docMap.has(dateStr);
                const doc = docMap.get(dateStr);
                const isSelected = dateStr === selectedDate;
                const isTodayDate = dateStr === simulatedToday;

                let doneCount = 0;
                let totalCount = 0;
                if (doc) {
                  for (const h of doc.headings) {
                    for (const t of h.items) {
                      totalCount++;
                      if (t.status === 'done') doneCount++;
                    }
                  }
                }

                return (
                  <button
                    key={dateStr}
                    onClick={() => onSelectDate(dateStr)}
                    className={`h-9 rounded-lg flex flex-col items-center justify-center relative transition-all text-xs font-mono ${
                      isSelected
                        ? 'bg-amber-600 text-white font-bold shadow-xs'
                        : isTodayDate
                        ? 'border border-amber-500 text-amber-700 dark:text-amber-400 font-bold'
                        : hasDoc
                        ? 'bg-stone-50 dark:bg-stone-800/80 text-stone-900 dark:text-stone-100 hover:bg-stone-100'
                        : 'text-stone-400 dark:text-stone-600 hover:bg-stone-50 dark:hover:bg-stone-900'
                    }`}
                  >
                    <span>{dayNum}</span>
                    {hasDoc && (
                      <span className="flex items-center gap-0.5 mt-0.5">
                        <span
                          className={`w-1 h-1 rounded-full ${
                            isSelected
                              ? 'bg-white'
                              : doneCount === totalCount && totalCount > 0
                              ? 'bg-emerald-500'
                              : 'bg-amber-500'
                          }`}
                        />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Date Shortcuts */}
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Recorded Daily Notes
            </h3>
            <div className="space-y-1.5">
              {dailyDocuments
                .slice()
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((d) => {
                  const tasks = d.headings.flatMap((h) => h.items);
                  const done = tasks.filter((t) => t.status === 'done').length;
                  return (
                    <button
                      key={d.date}
                      onClick={() => onSelectDate(d.date)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between border transition-colors ${
                        d.date === selectedDate
                          ? 'bg-stone-100 dark:bg-stone-800 border-stone-300 dark:border-stone-700 font-medium'
                          : 'border-transparent hover:bg-stone-50 dark:hover:bg-stone-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-stone-900 dark:text-stone-100">{d.date}</span>
                        <span className="text-[11px] text-stone-400">
                          {getRelativeDateLabel(d.date, simulatedToday)}
                        </span>
                      </div>
                      <span className="font-mono text-stone-500 tabular-nums text-[11px]">
                        {done}/{tasks.length} done
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Right Column: Historical Document Viewer (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5 shadow-2xs space-y-5">
            {/* Day Header */}
            <div className="flex items-start justify-between pb-3 border-b border-stone-200 dark:border-stone-800">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                    {formatFullDate(selectedDate)}
                  </h2>
                  {isHistorical && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-stone-500 font-mono">
                      <Lock className="w-3 h-3 text-stone-400" />
                      <span>Historical Archive</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  Path: <code className="font-mono text-[11px]">Daily/2026/10-October/{selectedDate}.md</code>
                </p>
              </div>
            </div>

            {selectedDoc ? (
              <div className="space-y-6">
                {selectedDoc.headings.map((section) => (
                  <div key={section.name} className="space-y-3">
                    <h3 className="text-sm font-bold text-stone-800 dark:text-stone-200 flex items-center gap-2">
                      <span className="text-amber-600 dark:text-amber-500 font-mono">#</span>
                      <span>{section.name}</span>
                    </h3>

                    {section.items.length > 0 ? (
                      <div className="space-y-2">
                        {section.items.map((task) => {
                          const statusDef = statuses.find((s) => s.id === task.status);
                          const isDone = task.status === 'done';
                          const isHistoricalCompleted = task.completedDate === selectedDate;

                          return (
                            <div
                              key={task.id}
                              className={`p-3 rounded-lg border text-xs transition-colors ${
                                isDone
                                  ? 'bg-stone-50/60 dark:bg-stone-800/40 border-stone-200/80 dark:border-stone-800'
                                  : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-2.5">
                                  <span
                                    className={`mt-0.5 w-4 h-4 rounded-sm flex items-center justify-center border text-[10px] font-bold ${
                                      isDone
                                        ? 'bg-emerald-600 border-emerald-600 text-white'
                                        : 'border-stone-300 dark:border-stone-600'
                                    }`}
                                  >
                                    {isDone && '✓'}
                                  </span>
                                  <div>
                                    <div
                                      className={`font-medium ${
                                        isDone
                                          ? 'line-through text-stone-400 dark:text-stone-500'
                                          : 'text-stone-900 dark:text-stone-100'
                                      }`}
                                    >
                                      {task.title}
                                    </div>
                                    {task.description && (
                                      <p className="text-[11px] text-stone-500 mt-1">
                                        {task.description}
                                      </p>
                                    )}

                                    {/* Unboxed Metadata with separators */}
                                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-stone-400 flex-wrap">
                                      <span className="font-mono">{statusDef?.label || task.status}</span>
                                      {task.completedDate && (
                                        <>
                                          <span aria-hidden="true">·</span>
                                          <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                                            Completed on {task.completedDate}
                                          </span>
                                        </>
                                      )}
                                      {task.carriedFromDate && (
                                        <>
                                          <span aria-hidden="true">·</span>
                                          <span className="font-mono">
                                            Carried from {task.carriedFromDate}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {isDone && (
                                  <button
                                    onClick={() => onReopenTask(task.id, selectedDate)}
                                    title="Reopen task"
                                    className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-stone-400 italic">No tasks recorded under #{section.name}</div>
                    )}

                    {section.notesContent && (
                      <div className="p-3 bg-stone-50 dark:bg-stone-800/40 rounded-lg border border-stone-100 dark:border-stone-800">
                        <MarkdownPreview content={section.notesContent} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-stone-400">
                No daily document exists for {selectedDate}.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
