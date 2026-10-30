import type { CountingDays, HabitData, HabitWidgetSnapshot } from '../types/daymark';
import type { WidgetAction } from '../native/daymarkBridge';
import { activeHabits, isDoneOn, setTick, streak } from './habits';
import { getPreviousDate } from './lifecycleEngine';

export type { HabitWidgetSnapshot } from '../types/daymark';

/** Enough history for the native widget to recompute streaks and warnings after midnight. */
export function buildHabitWidgetSnapshot(data: HabitData, today: string, mode: CountingDays = 'all'): HabitWidgetSnapshot {
  const yesterday = getPreviousDate(today);
  return {
    date: today,
    countingDays: mode,
    updatedAt: new Date().toISOString(),
    habits: activeHabits(data, today).slice(0, 30).map((habit) => ({
      id: habit.id,
      name: habit.name,
      doneToday: isDoneOn(data, habit.id, today),
      // streak() preserves yesterday's streak on a miss, so explicitly require a tick here.
      streakBefore: isDoneOn(data, habit.id, yesterday) ? streak(data, habit, yesterday) : 0,
      lastDoneBefore: data.days.reduce<string | null>((last, day) =>
        day.date < today && day.date >= habit.addedOn && day.ticks[habit.id]?.done && (!last || day.date > last) ? day.date : last, null),
      addedOn: habit.addedOn,
      warnAfterDays: habit.warnAfterDays,
    })),
  };
}

/** Explicit dated values are replay-safe; an older widget must not overwrite a newer app edit. */
export function applyWidgetAction(data: HabitData, action: WidgetAction, today: string): HabitData {
  if (action.type !== 'habit') return data;
  const existing = data.days.find((day) => day.date === action.date)?.ticks[action.habitId];
  if (existing && Date.parse(existing.at) >= Date.parse(action.at)) return data;
  return setTick(data, action.habitId, action.date, action.done, today, action.at);
}
