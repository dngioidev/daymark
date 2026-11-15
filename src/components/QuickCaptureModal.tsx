import React, { useEffect, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { EventItem, StatusDefinition } from '../types/daymark';
import { Dialog, buttonClass } from './ui/Dialog';
import { pickableStatuses } from './TaskItemCard';
import { formatDay } from '../utils/dateFormat';
import { EventFields } from './events/EventFields';
import { createEventDraft, eventFromDraft, EventDraft } from '../utils/eventDraft';

interface QuickCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  headings: string[];
  statuses: StatusDefinition[];
  simulatedToday: string;
  targetDate: string;
  onCapture: (task: { title: string; description?: string; heading: string; status: string }) => void;
  onCaptureEvent?: (event: EventItem) => void;
  onCaptureBacklog?: (task: { title: string; description?: string; category?: string }) => void;
  categories?: string[];
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
export const QuickCaptureModal: React.FC<QuickCaptureModalProps> = ({ isOpen, onClose, headings, statuses, simulatedToday, targetDate, onCapture, onCaptureEvent, onCaptureBacklog, categories = [] }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [heading, setHeading] = useState(headings[0] || 'Work');
  const [status, setStatus] = useState('not-started');
  const [savedCount, setSavedCount] = useState(0);
  const [target, setTarget] = useState<'date' | 'backlog'>('date');
  const [category, setCategory] = useState('');
  const [itemType, setItemType] = useState<'task' | 'event'>('task');
  const [eventDraft, setEventDraft] = useState<EventDraft>(() => createEventDraft(null, targetDate, headings));
  const [eventAttempted, setEventAttempted] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const last = readLast();
    setTitle('');
    setDescription('');
    setShowDetails(false);
    setSavedCount(0);
    setTarget('date');
    setItemType('task');
    setEventDraft(createEventDraft(null, targetDate, headings));
    setEventAttempted(false);
    setCategory('');
    setHeading(last.heading && headings.includes(last.heading) ? last.heading : headings[0] || 'Work');
    setStatus(last.status && statuses.some((s) => s.id === last.status) ? last.status : 'not-started');
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (keepOpen: boolean) => {
    if (itemType === 'event') {
      const built = eventFromDraft(eventDraft);
      if (!built.event) { setEventAttempted(true); return; }
      onCaptureEvent?.(built.event);
      localStorage.setItem(LAST_KEY, JSON.stringify({ heading: eventDraft.heading, status }));
      if (keepOpen) {
        setEventDraft(createEventDraft(null, targetDate, headings));
        setSavedCount((n) => n + 1);
        document.getElementById('event-title')?.focus();
      } else onClose();
      return;
    }
    if (!title.trim()) return;
    if (target === 'backlog') onCaptureBacklog?.({ title: title.trim(), description: description.trim() || undefined, category: category.trim() || undefined });
    else onCapture({ title: title.trim(), description: description.trim() || undefined, heading, status });
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
      title={`New ${itemType} · ${target === 'backlog' ? 'Backlog' : formatDay(targetDate, simulatedToday)}`}
      footer={
        <>
          <button type="button" className={`${buttonClass.ghost} mr-auto hidden sm:inline-flex`} disabled={itemType === 'event' ? !eventDraft.title.trim() : !title.trim()} onClick={() => save(true)}>
            Save & add another
          </button>
          <button type="button" className={buttonClass.ghost} onClick={onClose}>
            {savedCount ? 'Done' : 'Cancel'}
          </button>
          <button type="submit" form="capture-form" className={buttonClass.primary} disabled={itemType === 'event' ? !eventDraft.title.trim() : !title.trim()}>
            <Plus className="w-4 h-4" /> Add {itemType}
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
        {onCaptureEvent && target === 'date' && <div role="group" aria-label="Item type" className="flex gap-2">
          <button type="button" aria-pressed={itemType === 'task'} className={itemType === 'task' ? buttonClass.primary : buttonClass.secondary} onClick={() => setItemType('task')}>Task</button>
          <button type="button" aria-pressed={itemType === 'event'} className={itemType === 'event' ? buttonClass.primary : buttonClass.secondary} onClick={() => { setItemType('event'); setTarget('date'); }}>Event</button>
        </div>}
        {onCaptureBacklog && itemType === 'task' && <div role="group" aria-label="Task target" className="flex gap-2">
          <button type="button" aria-pressed={target === 'date'} className={target === 'date' ? buttonClass.primary : buttonClass.secondary} onClick={() => setTarget('date')}>Date</button>
          <button type="button" aria-pressed={target === 'backlog'} className={target === 'backlog' ? buttonClass.primary : buttonClass.secondary} onClick={() => setTarget('backlog')}>Backlog</button>
        </div>}
        {itemType === 'event' ? <EventFields draft={eventDraft} onChange={setEventDraft} headings={headings} showValidation={eventAttempted} /> : <>
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

        {target === 'backlog' ? <div>
          <label htmlFor="capture-category" className="block text-sm font-semibold mb-1.5">Category (optional)</label>
          <input id="capture-category" list="capture-categories" value={category} onChange={(e) => setCategory(e.target.value)} className={field} />
          <datalist id="capture-categories">{[...new Set([...categories, ...headings])].map((value) => <option key={value} value={value} />)}</datalist>
        </div> : <div className="grid grid-cols-2 gap-3">
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
        </div>}
        </>}
      </form>
    </Dialog>
  );
};
