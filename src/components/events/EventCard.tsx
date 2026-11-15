import React, { useState } from 'react';
import { CalendarDays, Edit2, MoreHorizontal, Trash2 } from 'lucide-react';
import type { EventItem } from '../../types/daymark';
import { formatEventSchedule } from '../../utils/eventTime';
import { isValidEventDate } from '../../utils/eventTime';
import { MarkdownPreview } from '../MarkdownPreview';
import { MoveToSectionDialog } from '../MoveToSectionDialog';
import { Dialog, buttonClass } from '../ui/Dialog';
import { Menu } from '../ui/Menu';
import { confirmDialog } from '../ui/feedback';
import { resolveEventTime } from '../../utils/eventTime';
import { useBackHandler } from '../../native/backButton';

export interface EventCardProps {
  event: EventItem;
  sectionNames: string[];
  deviceZone?: string;
  onEdit: (event: EventItem) => void;
  onUpdate: (event: EventItem) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, change: { date?: string; heading?: string; startInstant?: string }) => void;
}

const iconButton = 'inline-flex items-center justify-center w-11 h-11 sm:w-9 sm:h-9 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-800';

function moveOccurrenceLabel(instant: string, zone: string, index: number): string {
  try {
    const value = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(new Date(instant)).find(part => part.type === 'timeZoneName')?.value;
    return `${index === 0 ? 'First' : 'Second'} occurrence · ${(value ?? 'GMT').replace(/^GMT/, 'UTC')}`;
  } catch { return `${index === 0 ? 'First' : 'Second'} occurrence`; }
}

export const EventCard: React.FC<EventCardProps> = ({ event, sectionNames, deviceZone, onEdit, onUpdate, onDelete, onMove }) => {
  const [moveSectionOpen, setMoveSectionOpen] = useState(false);
  const [moveDateOpen, setMoveDateOpen] = useState(false);
  const [moveDate, setMoveDate] = useState(event.date);
  const [moveDateError, setMoveDateError] = useState<string | null>(null);
  const [moveInstants, setMoveInstants] = useState<string[]>([]);
  const [moveOccurrence, setMoveOccurrence] = useState('');
  useBackHandler(() => {
    if (moveDateOpen) { setMoveDateOpen(false); return true; }
    if (moveSectionOpen) { setMoveSectionOpen(false); return true; }
    return false;
  }, moveDateOpen || moveSectionOpen);
  const schedule = formatEventSchedule(event, deviceZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const askDelete = async () => {
    const confirmed = await confirmDialog({ title: 'Delete this event?', message: <>“{event.title}” will be removed.</>, confirmLabel: 'Delete', danger: true });
    if (confirmed) onDelete(event.id);
  };
  const items = [
    { label: 'Edit event', icon: <Edit2 className="w-4 h-4" />, onSelect: () => onEdit(event) },
    { label: 'Move to date…', icon: <CalendarDays className="w-4 h-4" />, onSelect: () => { setMoveDate(event.date); setMoveDateError(null); setMoveInstants([]); setMoveOccurrence(''); setMoveDateOpen(true); } },
    { label: 'Move to section…', onSelect: () => setMoveSectionOpen(true) },
    { label: 'Delete event', icon: <Trash2 className="w-4 h-4" />, danger: true, separatorBefore: true, onSelect: () => { void askDelete(); } },
  ];

  return <>
    <article data-event-id={event.id} aria-label={`Event: ${event.title}`} className="group flex items-start gap-3 rounded-lg border border-stone-200 dark:border-stone-800 border-l-4 border-l-amber-500 dark:border-l-amber-400 bg-white dark:bg-stone-900 px-3 py-2.5">
      <CalendarDays aria-hidden="true" className="mt-0.5 w-4 h-4 shrink-0 text-amber-700 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <button type="button" onClick={() => onEdit(event)} className="min-h-6 text-left text-[15px] sm:text-sm font-semibold text-stone-900 hover:text-amber-800 dark:text-stone-100 dark:hover:text-amber-300">{event.title}</button>
          <span className="mt-0.5 rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 text-[11px] font-semibold text-amber-950 dark:text-amber-200">Event</span>
          <div className="ml-auto -my-1 flex items-center">
            <button type="button" aria-label={`Edit event “${event.title}”`} onClick={() => onEdit(event)} className={`${iconButton} sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100`}><Edit2 className="w-4 h-4" /></button>
            <Menu sheetTitle={event.title} align="right" items={items} trigger={props => <button type="button" {...props} aria-label={`More actions for event “${event.title}”`} className={iconButton}><MoreHorizontal className="w-4 h-4" /></button>} />
          </div>
        </div>
        <p className="mt-0.5 text-xs font-medium text-stone-700 dark:text-stone-300">{schedule.primary}</p>
        {schedule.secondary && <p className="text-xs text-stone-500 dark:text-stone-400">{schedule.secondary}</p>}
        {event.description && <div className="mt-1 text-sm text-stone-700 dark:text-stone-300"><MarkdownPreview content={event.description} /></div>}
        {!!event.checklist?.length && <ul aria-label={`${event.title} checklist`} className="mt-1 space-y-0.5">
          {event.checklist.map(item => <li key={item.id} className="flex items-start gap-2 text-sm text-stone-700 dark:text-stone-300">
            <input type="checkbox" aria-label={item.text} checked={item.done} onChange={e => onUpdate({ ...event, updatedAt: new Date().toISOString(), checklist: event.checklist!.map(current => current.id === item.id ? { ...current, done: e.target.checked } : current) })} className="mt-1 w-4 h-4 shrink-0 accent-amber-700" />
            <span className={item.done ? 'line-through text-stone-500 dark:text-stone-400' : ''}>{item.text}</span>
          </li>)}
        </ul>}
      </div>
    </article>

    {moveSectionOpen && <MoveToSectionDialog taskTitle={event.title} currentSection={event.heading} sections={sectionNames}
      onClose={() => setMoveSectionOpen(false)} onMove={heading => { onMove(event.id, { heading }); setMoveSectionOpen(false); }} />}
    {moveDateOpen && <Dialog isOpen onClose={() => setMoveDateOpen(false)} variant="sheet" size="sm" title="Move event to date" footer={<>
      <button type="button" className={buttonClass.secondary} onClick={() => setMoveDateOpen(false)}>Cancel</button>
      <button type="submit" form="event-move-date" className={buttonClass.primary} disabled={!isValidEventDate(moveDate)}>Move</button>
    </>}>
      <form id="event-move-date" onSubmit={e => {
        e.preventDefault();
        if (!isValidEventDate(moveDate)) { setMoveDateError('Choose a valid date.'); return; }
        let startInstant: string | undefined;
        if (event.timing) {
          const result = resolveEventTime(moveDate, event.timing.localTime, event.timing.timeZone);
          if (result.kind === 'invalid') { setMoveDateError(result.message); setMoveInstants([]); return; }
          if (result.instants.length > 1) {
            setMoveInstants(result.instants);
            if (!result.instants.includes(moveOccurrence)) { setMoveDateError('Choose which occurrence of this time to use.'); return; }
            startInstant = moveOccurrence;
          } else startInstant = result.instants[0];
        }
        setMoveDateError(null);
        onMove(event.id, { date: moveDate, startInstant });
        setMoveDateOpen(false);
      }} className="px-5 py-4 space-y-2">
        <label htmlFor="event-move-date-input" className="block text-sm font-semibold">Date</label>
        <input id="event-move-date-input" type="date" value={moveDate} onChange={e => { setMoveDate(e.target.value); setMoveDateError(null); setMoveInstants([]); setMoveOccurrence(''); }} className="w-full min-h-11 px-3 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800" />
        {moveInstants.length > 1 && event.timing && <div><label htmlFor="event-move-occurrence" className="block text-sm font-semibold mb-1.5">This time occurs twice</label><select id="event-move-occurrence" aria-label="Move time occurrence" value={moveOccurrence} onChange={e => { setMoveOccurrence(e.target.value); setMoveDateError(null); }} className="w-full min-h-11 px-3 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800"><option value="">Choose an occurrence</option>{moveInstants.map((instant, index) => <option key={instant} value={instant}>{moveOccurrenceLabel(instant, event.timing!.timeZone, index)}</option>)}</select></div>}
        {moveDateError && <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">{moveDateError}</p>}
      </form>
    </Dialog>}
  </>;
};
