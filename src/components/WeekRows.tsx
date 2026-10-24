import React from 'react';
import { Check, Circle } from 'lucide-react';
import type { CalendarCell, HabitData } from '../types/daymark';
import { formatDay, formatLongDate } from '../utils/dateFormat';
import { daySummary, habitsForDay } from '../utils/habits';

interface WeekRowsProps {
  cells: CalendarCell[];
  selectedDate: string;
  today: string;
  habits: HabitData;
  onSelectDate: (date: string) => void;
  dropProps: (date: string) => React.HTMLAttributes<HTMLElement>;
}

export const WeekRows: React.FC<WeekRowsProps> = ({ cells, selectedDate, today, habits, onSelectDate, dropProps }) => (
  <div className="space-y-2">
    {cells.map(({ date, items, total, done, isToday }) => {
      const selected = date === selectedDate;
      const habitItems = date <= today ? habitsForDay(habits, date, today) : [];
      const summary = date <= today ? daySummary(habits, date, today) : null;
      const [year, month, day] = date.split('-').map(Number);
      const weekday = new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: 'short' });
      return (
        <button key={date} type="button" data-date={date} {...dropProps(date)}
          onClick={() => onSelectDate(date)} aria-pressed={selected}
          aria-label={`${formatLongDate(date)}${total ? `: ${done} of ${total} done` : ': nothing planned'}`}
          className={`grid w-full min-h-11 grid-cols-[7rem_minmax(0,1fr)] md:grid-cols-[9rem_minmax(0,1fr)_8rem] items-start gap-x-3 gap-y-1 rounded-lg p-3 text-left text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            isToday ? 'ring-2 ring-accent ' : ''
          }${selected
            ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
            : 'bg-stone-100 text-stone-900 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-100 dark:hover:bg-stone-700'}`}>
          <span className="col-start-1 row-start-1 flex flex-col gap-1">
            <span className="font-semibold">{weekday}</span>
            <span>{formatDay(date, today)}</span>
            {total > 0 && <span className="text-xs">{done}/{total}</span>}
          </span>
          <span className="col-start-2 row-start-1 row-span-2 md:row-span-1 min-w-0 columns-1 md:columns-2 gap-4">
            {items.length ? items.map((item, index) => (
              <span key={index} className="mb-1.5 flex break-inside-avoid items-start gap-2">
                {item.done ? <Check className="mt-0.5 h-4 w-4 shrink-0" role="img" aria-label="Done" />
                  : <Circle className="mt-0.5 h-4 w-4 shrink-0" role="img" aria-label="Not done" />}
                <span className={`min-w-0 break-words ${item.done ? 'line-through' : ''}`}>{item.title}</span>
              </span>
            )) : <span>Nothing planned</span>}
          </span>
          {habitItems.length > 0 && summary && (
            <span className="col-start-1 row-start-2 md:col-start-3 md:row-start-1 flex flex-wrap items-center gap-1.5" aria-label={`Habits: ${summary.done} of ${summary.total} done`}>
              {habitItems.map(({ habit, done }) => (
                <span key={habit.id} role="img" aria-label={`${habit.name}: ${done ? 'done' : 'not done'}`}
                  className={`h-2 w-2 rounded-full ${done ? 'bg-emerald-600' : 'bg-stone-300 dark:bg-stone-600'}`} />
              ))}
              <span className="text-xs">{summary.done}/{summary.total}</span>
            </span>
          )}
        </button>
      );
    })}
  </div>
);
