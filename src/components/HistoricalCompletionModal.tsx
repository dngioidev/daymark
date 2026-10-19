import React, { useState } from 'react';
import { CheckCircle2, Calendar, AlertCircle, X, History, ArrowRight } from 'lucide-react';
import { TaskItem } from '../types/daymark';
import { formatFullDate, getCalendarDaysDifference, getPreviousDate, getRelativeDateLabel } from '../utils/lifecycleEngine';

interface HistoricalCompletionModalProps {
  task: TaskItem | null;
  currentDate: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (taskId: string, effectiveCompletedDate: string, note?: string) => void;
}

export const HistoricalCompletionModal: React.FC<HistoricalCompletionModalProps> = ({
  task,
  currentDate,
  isOpen,
  onClose,
  onConfirm,
}) => {
  if (!isOpen || !task) return null;

  // Default past completion date to yesterday or the day it was carried from
  const defaultPastDate = task.carriedFromDate || getPreviousDate(currentDate, 1);
  const [selectedDate, setSelectedDate] = useState<string>(defaultPastDate);
  const [completionNote, setCompletionNote] = useState<string>('');

  const yesterdayStr = getPreviousDate(currentDate, 1);
  const twoDaysAgoStr = getPreviousDate(currentDate, 2);

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate) return;
    onConfirm(task.id, selectedDate, completionNote.trim() || undefined);
    onClose();
  };

  const daysBack = getCalendarDaysDifference(selectedDate, currentDate);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative w-full max-w-lg bg-white dark:bg-stone-900 rounded-xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 flex items-center justify-center">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">
                Correct Historical Completion
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Mark task done on the actual day it was completed
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleApply} className="p-5 space-y-4">
          {/* Target Task Box */}
          <div className="p-3.5 bg-stone-50 dark:bg-stone-800/40 rounded-lg border border-stone-200 dark:border-stone-800">
            <div className="text-xs text-stone-500 dark:text-stone-400 mb-1 flex items-center gap-1.5">
              <span>Carried forward from</span>
              <span className="font-mono font-medium text-stone-700 dark:text-stone-300">
                {task.carriedFromDate || task.createdDate}
              </span>
            </div>
            <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              {task.title}
            </div>
          </div>

          {/* Quick Date Presets */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-2">
              Select Effective Completion Date
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                type="button"
                onClick={() => setSelectedDate(yesterdayStr)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  selectedDate === yesterdayStr
                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                    : 'bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-300 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700'
                }`}
              >
                Yesterday ({getRelativeDateLabel(yesterdayStr, currentDate)})
              </button>

              {task.createdDate <= twoDaysAgoStr && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(twoDaysAgoStr)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                    selectedDate === twoDaysAgoStr
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-300 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700'
                  }`}
                >
                  2 Days Ago ({getRelativeDateLabel(twoDaysAgoStr, currentDate)})
                </button>
              )}

              {task.carriedFromDate &&
                task.carriedFromDate !== yesterdayStr &&
                task.carriedFromDate !== twoDaysAgoStr && (
                  <button
                    type="button"
                    onClick={() => setSelectedDate(task.carriedFromDate!)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                      selectedDate === task.carriedFromDate
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-300 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700'
                    }`}
                  >
                    Carried Day ({task.carriedFromDate})
                  </button>
                )}
            </div>

            {/* Custom Date Input */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                <Calendar className="w-4 h-4" />
              </div>
              <input
                type="date"
                value={selectedDate}
                max={yesterdayStr}
                min={task.createdDate || undefined}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-md text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono"
              />
            </div>
            <div className="mt-1 text-xs text-stone-500 dark:text-stone-400 flex items-center justify-between">
              <span>{formatFullDate(selectedDate)}</span>
              <span className="font-mono tabular-nums">{daysBack} {daysBack === 1 ? 'day' : 'days'} before today</span>
            </div>
          </div>

          {/* Optional reason / note */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
              Correction Note (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Finished late yesterday, forgot to mark done"
              value={completionNote}
              onChange={(e) => setCompletionNote(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-md text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-amber-500 placeholder:text-stone-400"
            />
          </div>

          {/* Consequence explanation according to PRD section 7 */}
          <div className="p-3 bg-amber-50/70 dark:bg-amber-950/40 rounded-md border border-amber-200/80 dark:border-amber-900/50 text-xs text-amber-900 dark:text-amber-200 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>What happens next:</span>
            </div>
            <ul className="list-disc pl-4 space-y-0.5 text-stone-600 dark:text-stone-300 text-[11px]">
              <li>Records <strong>{selectedDate}</strong> as the canonical completion date.</li>
              <li>Updates historical note for <strong>{selectedDate}</strong> to show as completed.</li>
              <li>Removes this task from <strong>{currentDate}</strong> and future active daily notes.</li>
              <li>Preserves full audit trail and original creation timestamp.</li>
            </ul>
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-stone-200 dark:border-stone-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 rounded-md shadow-xs transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Record Done on {getRelativeDateLabel(selectedDate, currentDate)}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
