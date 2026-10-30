import React, { useMemo } from 'react';
import { Check, Circle } from 'lucide-react';
import type { CountingDays, CalendarCell, HabitData } from '../types/daymark';
import { formatDayParts } from '../utils/dateFormat';
import { daySummary, habitsForDay } from '../utils/habits';

interface WeekRowsProps {
  countingDays?: CountingDays;
  cells: CalendarCell[];
  selectedDate: string;
  today: string;
  habits: HabitData;
  onSelectDate: (date: string) => void;
  dropProps: (date: string) => React.HTMLAttributes<HTMLElement>;
}

export const WeekRows: React.FC<WeekRowsProps> = ({ countingDays = 'all', cells, selectedDate, today, habits, onSelectDate, dropProps }) => {
  const habitDates = cells.map(({ date }) => date).join(',');
  const habitDays = useMemo(() => new Map(habitDates.split(',').filter(Boolean).map(date => [date, {
    items: date <= today ? habitsForDay(habits, date, today, countingDays) : [],
    summary: date <= today ? daySummary(habits, date, today, countingDays) : null,
  }])), [habitDates, habits, today, countingDays]);
  return (
    <div className="space-y-2">
      {cells.map(({ date, items, total, done, isToday }) => {
        const selected = date === selectedDate;
        const { items: habitItems, summary } = habitDays.get(date)!;
        const dayLabel = formatDayParts(date, today);
        return (
          <button key={date} type="button" data-date={date} {...dropProps(date)}
            onClick={() => onSelectDate(date)} aria-pressed={selected}
            className={`flex w-full min-h-11 flex-col md:grid md:grid-cols-[9rem_minmax(0,1fr)_8rem] items-start gap-3 rounded-lg p-3 text-left text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              isToday ? 'ring-2 ring-accent ' : ''
            }${selected
              ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
              : 'bg-stone-100 text-stone-900 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-100 dark:hover:bg-stone-700'}`}>
            <span className="flex w-full items-center gap-3 md:contents">
              <span className="flex shrink-0 items-center gap-2 md:col-start-1 md:row-start-1 md:flex-col md:items-start md:gap-1">
                <span className="font-semibold">{dayLabel.label}</span>
                <span>{dayLabel.date}</span>
                {total > 0 && <span className="text-xs">{done}/{total}<span className="sr-only"> tasks done</span></span>}
              </span>
              {habitItems.length > 0 && summary && (
                <span className="flex min-w-0 flex-wrap items-center gap-1.5 md:col-start-3 md:row-start-1">
                  <span className="sr-only">Habits: </span>
                  {habitItems.map(({ habit, done }) => (
                    <span key={habit.id} role="img" aria-label={`${habit.name}: ${done ? 'done' : 'not done'}`}
                      className={`h-2 w-2 rounded-full ${done ? 'bg-emerald-600' : 'bg-stone-300 dark:bg-stone-600'}`} />
                  ))}
                  <span className="text-xs">{summary.done}/{summary.total}<span className="sr-only"> habits done</span></span>
                </span>
              )}
            </span>
            <span className="block w-full min-w-0 columns-1 md:columns-2 md:col-start-2 md:row-start-1 gap-4">
              {items.length ? items.map((item, index) => (
                <span key={index} className="mb-1.5 flex break-inside-avoid items-start gap-2">
                  {item.done ? <Check className="mt-0.5 h-4 w-4 shrink-0" role="img" aria-label="Done" />
                    : <Circle className="mt-0.5 h-4 w-4 shrink-0" role="img" aria-label="Not done" />}
                  <span className={`min-w-0 break-words ${item.done ? 'line-through' : ''}`}>{item.title}</span>
                </span>
              )) : <span>Nothing planned</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
};
