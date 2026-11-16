import React from 'react';
import { CalendarDays } from 'lucide-react';
import type { EventItem } from '../../types/daymark';
import { eventsForDate } from '../../utils/events';
import { formatEventSchedule } from '../../utils/eventTime';
import { formatLongDate } from '../../utils/dateFormat';

export interface CalendarEventsProps {
  events: readonly EventItem[];
  selectedDate: string;
  deviceZone: string;
  onEdit: (event: EventItem) => void;
}

function compareEvents(a: EventItem, b: EventItem): number {
  if (a.timing && b.timing) return Date.parse(a.timing.startInstant) - Date.parse(b.timing.startInstant) || a.order - b.order || a.id.localeCompare(b.id);
  if (a.timing) return -1;
  if (b.timing) return 1;
  return a.order - b.order || a.id.localeCompare(b.id);
}

export const CalendarEvents: React.FC<CalendarEventsProps> = ({ events, selectedDate, deviceZone, onEdit }) => {
  const agenda = eventsForDate(events, selectedDate).slice().sort(compareEvents);
  return (
    <section aria-label="Events" className="space-y-2">
      <h3 className="flex items-center gap-2 font-semibold text-stone-800 dark:text-stone-200">
        <CalendarDays aria-hidden="true" className="h-4 w-4 text-amber-700 dark:text-amber-400" /> Events
        {agenda.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950 dark:bg-amber-950/50 dark:text-amber-200">{agenda.length}</span>}
      </h3>
      {agenda.length === 0 ? <p className="text-sm text-stone-600 dark:text-stone-400">No events on this date.</p> : (
        <ul className="space-y-1.5">
          {agenda.map((event) => {
            const schedule = formatEventSchedule(event, deviceZone);
            return <li key={event.id} data-calendar-event-id={event.id}>
              <button type="button" onClick={() => onEdit(event)} className="w-full rounded-lg border border-stone-200 border-l-4 border-l-amber-500 bg-white px-3 py-2 text-left hover:bg-amber-50 dark:border-stone-800 dark:border-l-amber-400 dark:bg-stone-900 dark:hover:bg-stone-800">
                {event.date < selectedDate && <span className="mb-0.5 block text-xs font-medium text-amber-800 dark:text-amber-300">Continues from {formatLongDate(event.date)}</span>}
                <span className="block text-sm font-semibold text-stone-900 dark:text-stone-100">{event.title}</span>
                <span data-schedule-primary className="mt-0.5 block text-xs font-medium text-stone-700 dark:text-stone-300">{schedule.primary}</span>
                {schedule.secondary && <span className="mt-0.5 block text-xs text-stone-600 dark:text-stone-400">{schedule.secondary}</span>}
              </button>
            </li>;
          })}
        </ul>
      )}
    </section>
  );
};
