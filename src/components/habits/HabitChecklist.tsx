import React from 'react';
import type { HabitDayItem } from '../../types/daymark';

export interface HabitChecklistProps {
  items: HabitDayItem[];
  onToggle: (habitId: string, done: boolean) => void;
  showStreaks?: boolean;
}

export const HabitChecklist: React.FC<HabitChecklistProps> = ({ items, onToggle, showStreaks = true }) => (
  <ul className="divide-y divide-stone-200 dark:divide-stone-800">
    {items.map(({ habit, done, canTick, streak, missedDays, warning }) => (
      <li key={habit.id}>
        <label className={`flex min-h-11 items-center gap-3 py-2 text-sm ${canTick ? 'cursor-pointer' : 'opacity-70'}`}>
          <input
            type="checkbox"
            aria-label={habit.name}
            checked={done}
            disabled={!canTick}
            onChange={(event) => onToggle(habit.id, event.target.checked)}
            className="h-5 w-5 shrink-0 accent-[var(--dm-accent)] focus-visible:ring-2 focus-visible:ring-accent"
          />
          <span className="min-w-0 flex-1 break-words text-stone-900 dark:text-stone-100">{habit.name}</span>
          {warning ? (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">{`⚠ ${missedDays} days`}</span>
          ) : showStreaks ? (
            <span className="shrink-0 text-stone-600 dark:text-stone-400">{streak ? `🔥 ${streak}` : '–'}</span>
          ) : null}
        </label>
      </li>
    ))}
  </ul>
);
