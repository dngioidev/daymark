import React, { useEffect, useState } from 'react';
import { TaskItem } from '../types/daymark';
import { getPreviousDate } from '../utils/lifecycleEngine';
import { formatDay, formatLongDate } from '../utils/dateFormat';
import { Dialog, buttonClass } from './ui/Dialog';

interface HistoricalCompletionModalProps {
  task: TaskItem | null;
  currentDate: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (taskId: string, effectiveCompletedDate: string, note?: string) => void;
}

/** "Mark done on…": record that a carried task was actually finished on an earlier day. */
export const HistoricalCompletionModal: React.FC<HistoricalCompletionModalProps> = ({
  task,
  currentDate,
  isOpen,
  onClose,
  onConfirm,
}) => {
  const yesterday = getPreviousDate(currentDate, 1);
  const defaultDate = task?.carriedFromDate && task.carriedFromDate < currentDate ? task.carriedFromDate : yesterday;
  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSelectedDate(defaultDate);
      setNote('');
    }
  }, [isOpen, task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!task) return <Dialog isOpen={false} onClose={onClose} title="">{null}</Dialog>;

  // Quick picks: yesterday, the day before, and the day it was last carried from
  const presets = [...new Set([yesterday, getPreviousDate(currentDate, 2), task.carriedFromDate].filter(Boolean) as string[])]
    .filter((d) => d < currentDate && d >= task.createdDate)
    .sort()
    .reverse();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate) return;
    onConfirm(task.id, selectedDate, note.trim() || undefined);
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      variant="sheet"
      title="When did you finish it?"
      description={task.title}
      footer={
        <>
          <button type="button" className={buttonClass.ghost} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="mark-done-form" className={buttonClass.primary} data-autofocus>
            Mark done
          </button>
        </>
      }
    >
      <form id="mark-done-form" onSubmit={submit} className="px-5 py-4 space-y-4 text-sm">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick picks">
          {presets.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={selectedDate === d}
              onClick={() => setSelectedDate(d)}
              className={`min-h-11 sm:min-h-9 px-3.5 rounded-full border font-medium ${
                selectedDate === d
                  ? 'bg-accent border-accent text-accent-fg'
                  : 'bg-white border-stone-300 text-stone-800 hover:bg-stone-50 dark:bg-stone-800 dark:border-stone-700 dark:text-stone-100'
              }`}
            >
              {formatDay(d, currentDate)}
              {d === task.carriedFromDate && d !== yesterday && ' (last carried)'}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="mark-done-date" className="block font-semibold mb-1.5">
            Or pick a date
          </label>
          <input
            id="mark-done-date"
            type="date"
            value={selectedDate}
            max={yesterday}
            min={task.createdDate || undefined}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full px-3 min-h-11 text-[15px] sm:text-sm bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg"
          />
        </div>

        <div>
          <label htmlFor="mark-done-note" className="block font-semibold mb-1.5">
            Note <span className="font-normal text-stone-600 dark:text-stone-400">(optional)</span>
          </label>
          <input
            id="mark-done-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Finished late, forgot to tick it"
            enterKeyHint="done"
            className="w-full px-3 min-h-11 text-[15px] sm:text-sm bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg placeholder:text-stone-500"
          />
        </div>

        {selectedDate && (
          <p className="text-stone-700 dark:text-stone-300">
            It will show as done on <strong>{formatLongDate(selectedDate)}</strong> and leave today’s list.
          </p>
        )}
      </form>
    </Dialog>
  );
};
