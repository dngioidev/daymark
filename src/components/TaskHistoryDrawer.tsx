import React from 'react';
import { X, Clock, Calendar, CheckCircle2, RotateCcw, AlertTriangle, ArrowRight } from 'lucide-react';
import { StatusDefinition, TaskItem } from '../types/daymark';
import { calculateTaskAge, formatFullDate } from '../utils/lifecycleEngine';

interface TaskHistoryDrawerProps {
  task: TaskItem | null;
  currentDate: string;
  statuses: StatusDefinition[];
  onClose: () => void;
  onReopenTask: (taskId: string) => void;
  onOpenHistoricalCorrection: (task: TaskItem) => void;
}

export const TaskHistoryDrawer: React.FC<TaskHistoryDrawerProps> = ({
  task,
  currentDate,
  statuses,
  onClose,
  onReopenTask,
  onOpenHistoricalCorrection,
}) => {
  if (!task) return null;

  const currentStatusDef = statuses.find((s) => s.id === task.status);
  const ageDays = calculateTaskAge(task, currentDate);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-stone-900/40 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-md bg-white dark:bg-stone-900 h-full shadow-2xl flex flex-col border-l border-stone-200 dark:border-stone-800 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 border-b border-stone-200 dark:border-stone-800 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400 mb-1">
              <span className="font-mono">{task.id}</span>
              <span>·</span>
              <span>Section #{task.heading}</span>
            </div>
            <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">
              {task.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content & Metadata */}
        <div className="p-4 flex-1 overflow-y-auto space-y-5">
          {/* Status & Aging summary */}
          <div className="bg-stone-50 dark:bg-stone-800/50 rounded-lg p-3.5 border border-stone-200 dark:border-stone-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-500 dark:text-stone-400">Current Status</span>
              <span className="font-medium text-stone-800 dark:text-stone-200">
                {currentStatusDef?.label || task.status}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-500 dark:text-stone-400">Originally Created</span>
              <span className="font-mono text-stone-700 dark:text-stone-300">
                {task.createdDate} ({formatFullDate(task.createdDate)})
              </span>
            </div>
            {task.carriedFromDate && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-stone-500 dark:text-stone-400">Carried From</span>
                <span className="font-mono text-stone-700 dark:text-stone-300">
                  {task.carriedFromDate}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-500 dark:text-stone-400">Carry-Forward Age</span>
              <span className="font-mono font-medium text-stone-900 dark:text-stone-100">
                {ageDays} calendar {ageDays === 1 ? 'day' : 'days'}
              </span>
            </div>
            {task.completedDate && (
              <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-400 font-medium pt-1 border-t border-stone-200 dark:border-stone-700">
                <span>Effective Completed Date</span>
                <span className="font-mono">{task.completedDate}</span>
              </div>
            )}
          </div>

          {/* Description if present */}
          {task.description && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
                Description / Notes
              </h4>
              <p className="text-xs text-stone-700 dark:text-stone-300 bg-stone-50 dark:bg-stone-800/40 p-3 rounded-md border border-stone-200/60 dark:border-stone-800 whitespace-pre-wrap">
                {task.description}
              </p>
            </div>
          )}

          {/* Checklist if present */}
          {task.checklist && task.checklist.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5">
                Sub-tasks
              </h4>
              <div className="space-y-1.5">
                {task.checklist.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-xs">
                    <span
                      className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                        item.done
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-stone-300 dark:border-stone-600'
                      }`}
                    >
                      {item.done && '✓'}
                    </span>
                    <span
                      className={
                        item.done
                          ? 'line-through text-stone-400'
                          : 'text-stone-700 dark:text-stone-300'
                      }
                    >
                      {item.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Audit / Lifecycle Timeline */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>Lifecycle History & Audit Trail</span>
            </h4>

            <div className="relative pl-5 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-stone-200 dark:before:bg-stone-800">
              {task.historyLog && task.historyLog.length > 0 ? (
                task.historyLog.map((log) => (
                  <div key={log.id} className="relative text-xs">
                    <span className="absolute -left-5 top-1 w-2.5 h-2.5 rounded-full bg-stone-400 dark:bg-stone-600 ring-4 ring-white dark:ring-stone-900" />
                    <div className="font-mono text-[11px] text-stone-400 dark:text-stone-500">
                      {log.date} · {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="text-stone-800 dark:text-stone-200 font-medium mt-0.5">
                      {log.details}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-stone-500">No previous events logged.</div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60 flex items-center justify-between gap-3">
          {task.status === 'done' ? (
            <button
              onClick={() => {
                onReopenTask(task.id);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-800 rounded-md transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reopen Task</span>
            </button>
          ) : (
            <button
              onClick={() => {
                onOpenHistoricalCorrection(task);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800 rounded-md transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Correct Historical Completion</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
