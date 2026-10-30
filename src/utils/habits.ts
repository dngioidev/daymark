import type { CountingDays, Habit, HabitData, HabitDay, HabitDayItem } from '../types/daymark';
import { isCountedDay } from './alertDays';
import { getPreviousDate } from './lifecycleEngine';

export const EMPTY_HABITS: HabitData = { habits: [], days: [] };
/** Recovered load snapshots stay read-only until an explicit edit or a server habit merge. */
export const uneditedRecoveredHabits = new WeakSet<HabitData>();
export const DEFAULT_WARN_AFTER_DAYS = 3;

const dayIndexes = new WeakMap<HabitData, Map<string, HabitDay>>();

function dayIndex(data: HabitData): Map<string, HabitDay> {
  let index = dayIndexes.get(data);
  if (!index) {
    index = new Map();
    for (const day of data.days) {
      const date = day.date;
      if (!index.has(date)) index.set(date, day);
    }
    dayIndexes.set(data, index);
  }
  return index;
}

function existsOn(habit: Habit, date: string): boolean {
  return habit.addedOn <= date && (!habit.removedOn || date < habit.removedOn);
}

export function isDoneOn(data: HabitData, habitId: string, date: string): boolean {
  return dayIndex(data).get(date)?.ticks[habitId]?.done === true;
}

/** An unticked today leaves yesterday's streak intact. Ignore pre-lifetime sync ticks. */
export function streak(data: HabitData, habit: Habit, today: string): number {
  let date = isDoneOn(data, habit.id, today) ? today : getPreviousDate(today);
  let count = 0;
  while (date >= habit.addedOn && isDoneOn(data, habit.id, date)) {
    count++;
    date = getPreviousDate(date);
  }
  return count;
}

/** Consecutive misses before today; ticking today suppresses the warning separately. */
export function missedDays(data: HabitData, habit: Habit, today: string, mode: CountingDays = 'all'): number {
  let date = getPreviousDate(today);
  let count = 0;
  while (date >= habit.addedOn && !isDoneOn(data, habit.id, date)) {
    if (isCountedDay(date, mode)) count++;
    date = getPreviousDate(date);
  }
  return count;
}

export function habitsForDay(data: HabitData, date: string, today: string, mode: CountingDays = 'all'): HabitDayItem[] {
  return data.habits
    .filter((habit) => existsOn(habit, date) || isDoneOn(data, habit.id, date))
    .sort((a, b) => a.order - b.order)
    .map((habit) => {
      const done = isDoneOn(data, habit.id, date);
      const missed = missedDays(data, habit, today, mode);
      return {
        habit, done,
        canTick: date <= today && existsOn(habit, date),
        streak: streak(data, habit, today),
        missedDays: missed,
        warning: date === today && existsOn(habit, today) && !done && missed >= habit.warnAfterDays,
      };
    });
}

export function setTick(data: HabitData, habitId: string, date: string, done: boolean, today: string, at: string): HabitData {
  const habit = data.habits.find((item) => item.id === habitId);
  if (!habit || date > today || !existsOn(habit, date)) return data;
  const existing = data.days.find((day) => day.date === date);
  const changed = { date, ticks: { ...existing?.ticks, [habitId]: { done, at } } };
  const days = data.days.filter((day) => day.date !== date && Object.keys(day.ticks).length > 0);
  days.push(changed);
  days.sort((a, b) => a.date.localeCompare(b.date));
  return { ...data, days };
}

export function daySummary(data: HabitData, date: string, today: string, mode: CountingDays = 'all'): { done: number; total: number; warnings: { habit: Habit; days: number }[] } {
  const items = habitsForDay(data, date, today, mode).filter((item) => existsOn(item.habit, date));
  return {
    done: items.filter((item) => item.done).length,
    total: items.length,
    warnings: items.filter((item) => item.warning).map((item) => ({ habit: item.habit, days: item.missedDays })),
  };
}

export function newHabitId(): string {
  const random6 = Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');
  return `habit-${Date.now()}-${random6}`;
}

function validName(name: string): boolean {
  return name.length > 0 && name.length <= 80;
}

export function addHabit(data: HabitData, name: string, today: string, at: string, id = newHabitId()): HabitData {
  name = name.trim();
  if (!validName(name)) return data;
  const order = data.habits.length ? Math.max(...data.habits.map((habit) => habit.order)) + 1 : 0;
  return {
    ...data,
    habits: [...data.habits, { id, name, order, warnAfterDays: DEFAULT_WARN_AFTER_DAYS, addedOn: today, updatedAt: at }],
  };
}

function editHabit(data: HabitData, id: string, at: string, changes: Partial<Habit>): HabitData {
  if (!data.habits.some((habit) => habit.id === id)) return data;
  return { ...data, habits: data.habits.map((habit) => habit.id === id ? { ...habit, ...changes, updatedAt: at } : habit) };
}

export function renameHabit(data: HabitData, id: string, name: string, at: string): HabitData {
  name = name.trim();
  return validName(name) ? editHabit(data, id, at, { name }) : data;
}

export function setWarnAfter(data: HabitData, id: string, days: number, at: string): HabitData {
  if (Number.isNaN(days)) return data;
  return editHabit(data, id, at, { warnAfterDays: Math.max(1, Math.min(365, Math.round(days))) });
}

export function activeHabits(data: HabitData, _today: string): Habit[] {
  return data.habits.filter((habit) => !habit.removedOn).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id) || a.addedOn.localeCompare(b.addedOn));
}

export function moveHabit(data: HabitData, id: string, delta: -1 | 1, at: string): HabitData {
  const active = activeHabits(data, '');
  const index = active.findIndex((habit) => habit.id === id);
  const neighbour = active[index + delta];
  if (index < 0 || !neighbour) return data;
  const orders = new Map(active.map((habit, i) => [habit.id, i]));
  orders.set(id, index + delta);
  orders.set(neighbour.id, index);
  return {
    ...data,
    habits: data.habits.map((item) => {
      const order = orders.get(item.id);
      if (order !== undefined && (order !== item.order || item.id === id || item.id === neighbour.id)) return { ...item, order, updatedAt: at };
      return item;
    }),
  };
}

export function removeHabit(data: HabitData, id: string, today: string, at: string): HabitData {
  return editHabit(data, id, at, { removedOn: today });
}
