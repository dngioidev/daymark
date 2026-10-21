import React, { useEffect, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { StatusDefinition } from '../types/daymark';
import { Dialog, buttonClass } from './ui/Dialog';
import { pickableStatuses } from './TaskItemCard';

interface QuickCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  headings: string[];
  statuses: StatusDefinition[];
  simulatedToday: string;
  onCapture: (task: { title: string; description?: string; heading: string; status: string }) => void;
}

const LAST_KEY = 'daymark_capture_last';
const readLast = (): { heading?: string; status?: string } => {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) || '{}');
  } catch {
    return {};
  }
};

/**
 * New task sheet: docked at the bottom on phones (next to the + that opened it), centred on
 * desktop. Remembers the last section and status used. "Save & add another" keeps it open.
 */
export const QuickCaptureModal: React.FC<QuickCaptureModalProps> = ({ isOpen, onClose, headings, statuses, onCapture }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [heading, setHeading] = useState(headings[0] || 'Work');
  const [status, setStatus] = useState('not-started');
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const last = readLast();
    setTitle('');
    setDescription('');
    setShowDetails(false);
    setSavedCount(0);
    setHeading(last.heading && headings.includes(last.heading) ? last.heading : headings[0] || 'Work');
    setStatus(last.status && statuses.some((s) => s.id === last.status) ? last.status : 'not-started');
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (keepOpen: boolean) => {
    if (!title.trim()) return;
    onCapture({ title: title.trim(), description: description.trim() || undefined, heading, status });
    localStorage.setItem(LAST_KEY, JSON.stringify({ heading, status }));
    if (keepOpen) {
      setTitle('');
      setDescription('');
      setSavedCount((n) => n + 1);
      document.getElementById('capture-title')?.focus();
    } else onClose();
  };

  const field =
    'w-full px-3 min-h-11 text-[15px] sm:text-sm bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg text-stone-900 dark:text-stone-100';

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      variant="sheet"
      title="New task · Today"
      footer={
        <>
          <button type="button" className={`${buttonClass.ghost} mr-auto hidden sm:inline-flex`} disabled={!title.trim()} onClick={() => save(true)}>
            Save & add another
          </button>
          <button type="button" className={buttonClass.ghost} onClick={onClose}>
            {savedCount ? 'Done' : 'Cancel'}
          </button>
          <button type="submit" form="capture-form" className={buttonClass.primary} disabled={!title.trim()}>
            <Plus className="w-4 h-4" /> Add task
          </button>
        </>
      }
    >
      <form
        id="capture-form"
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
        className="px-5 py-4 space-y-3"
      >
        <div>
          <label htmlFor="capture-title" className="sr-only">
            Task
          </label>
          <input
            id="capture-title"
            type="text"
            placeholder="What do you need to do?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            enterKeyHint="done"
            autoComplete="off"
            className={`${field} font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-500 placeholder:text-stone-500`}
            data-autofocus
          />
          {savedCount > 0 && (
            <p role="status" className="mt-1.5 text-sm text-emerald-800 dark:text-emerald-400">
              Added {savedCount} {savedCount === 1 ? 'task' : 'tasks'}. Add another or tap Done.
            </p>
          )}
        </div>

        {showDetails ? (
          <div>
            <label htmlFor="capture-notes" className="block text-sm font-semibold mb-1.5">
              Notes
            </label>
            <textarea
              id="capture-notes"
              placeholder="Links, context, sub-steps…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={`${field} py-2 placeholder:text-stone-500`}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowDetails(true)}
            className="inline-flex items-center gap-1 min-h-11 sm:min-h-8 text-sm font-medium text-stone-700 hover:text-stone-900 dark:text-stone-300 dark:hover:text-stone-100"
          >
            <Plus className="w-4 h-4" /> Add notes
          </button>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="capture-section" className="block text-sm font-semibold mb-1.5">
              Section
            </label>
            <div className="relative">
              <select id="capture-section" value={heading} onChange={(e) => setHeading(e.target.value)} className={`${field} appearance-none pr-8`}>
                {headings.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-stone-500" />
            </div>
          </div>
          <div>
            <label htmlFor="capture-status" className="block text-sm font-semibold mb-1.5">
              Status
            </label>
            <div className="relative">
              <select id="capture-status" value={status} onChange={(e) => setStatus(e.target.value)} className={`${field} appearance-none pr-8`}>
                {pickableStatuses(statuses).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-stone-500" />
            </div>
          </div>
        </div>
      </form>
    </Dialog>
  );
};
