import { describe, expect, it } from 'vitest';
import type { Habit, HabitData } from '../types/daymark';
import {
  EMPTY_HABITS, activeHabits, addHabit, daySummary, habitsForDay, isDoneOn,
  missedDays, moveHabit, newHabitId, removeHabit, renameHabit, setTick, setWarnAfter, streak,
} from './habits';

const today = '2026-10-21';
const at = '2026-10-21T09:00:00.000Z';
const later = '2026-10-21T10:00:00.000Z';
const h1: Habit = { id: 'h1', name: 'Read', order: 0, warnAfterDays: 3, addedOn: '2026-10-12', updatedAt: at };

describe('habit warning counting days', () => {
  const habit = { ...h1, addedOn: '2026-10-19', warnAfterDays: 3 };
  it.each([['all', 14], ['weekdays', 10], ['weekend', 4]] as const)('counts misses across two weeks in %s mode', (mode, count) => {
    expect(missedDays(dataWith([], habit), habit, '2026-11-02', mode)).toBe(count);
  });

  it('a Saturday tick stops the weekday miss run', () => {
    expect(missedDays(dataWith(['2026-10-31'], habit), habit, '2026-11-03', 'weekdays')).toBe(1);
  });

  it.each(['all', 'weekdays', 'weekend'] as const)('keeps tick streaks unchanged in %s mode', (mode) => {
    const data = dataWith(['2026-10-30', '2026-10-31', '2026-11-01'], habit);
    expect(habitsForDay(data, '2026-11-02', '2026-11-02', mode)[0].streak).toBe(3);
  });

  it.each([
    ['all', '2026-10-21', '2026-10-22'],
    ['weekdays', '2026-10-21', '2026-10-22'],
    ['weekend', '2026-10-31', '2026-11-01'],
  ] as const)('warns on the third missed morning for %s', (mode, before, morning) => {
    const data = dataWith([], habit);
    expect(habitsForDay(data, before, before, mode)[0].warning).toBe(false);
    expect(habitsForDay(data, morning, morning, mode)[0].warning).toBe(true);
    expect(daySummary(data, morning, morning, mode).warnings).toEqual([{ habit, days: 3 }]);
  });

  it('keeps weekday warnings visible on weekends and suppresses them after ticking today', () => {
    expect(habitsForDay(dataWith([], habit), '2026-10-24', '2026-10-24', 'weekdays')[0]).toMatchObject({ missedDays: 5, warning: true });
    expect(habitsForDay(dataWith(['2026-10-24'], habit), '2026-10-24', '2026-10-24', 'weekdays')[0].warning).toBe(false);
  });
});

function dataWith(dates: string[] = [], habit: Habit = h1): HabitData {
  return { habits: [{ ...habit }], days: dates.map((date) => ({ date, ticks: { [habit.id]: { done: true, at } } })) };
}

describe('habits', () => {
  it('streak counts back from today when ticked', () => {
    expect(streak(dataWith(['2026-10-19', '2026-10-20', today]), h1, today)).toBe(3);
  });

  it('unticked today does not break streak', () => {
    expect(streak(dataWith(['2026-10-19', '2026-10-20']), h1, today)).toBe(2);
  });

  it('gap breaks streak', () => {
    expect(streak(dataWith(['2026-10-17', '2026-10-20']), h1, today)).toBe(1);
  });

  it('missedDays counts unticked days before today back to last tick', () => {
    const data = dataWith(['2026-10-17']);
    expect(missedDays(data, h1, today)).toBe(3);
    expect(daySummary(data, today, today)).toEqual({ done: 0, total: 1, warnings: [{ habit: h1, days: 3 }] });
    expect(habitsForDay(data, today, today)[0]).toMatchObject({ missedDays: 3, warning: true });
    expect(daySummary(data, '2026-10-20', today).warnings).toEqual([]);
  });

  it('never ticked counts from addedOn inclusive', () => {
    const habit = { ...h1, addedOn: '2026-10-19' };
    const data = dataWith([], habit);
    expect(missedDays(data, habit, today)).toBe(2);
    expect(daySummary(data, today, today).warnings).toEqual([]);
  });

  it('added today has no misses', () => {
    expect(missedDays(dataWith(), { ...h1, addedOn: today }, today)).toBe(0);
    expect(missedDays(dataWith(), { ...h1, addedOn: '2026-10-22' }, today)).toBe(0);
  });

  it('ticking today clears warning', () => {
    const data = setTick(dataWith(['2026-10-17']), 'h1', today, true, today, later);
    expect(daySummary(data, today, today)).toEqual({ done: 1, total: 1, warnings: [] });
    expect(habitsForDay(data, today, today)[0].warning).toBe(false);
    expect(missedDays(data, h1, today)).toBe(3);
  });

  it('setTick rejects future and pre-addedOn dates', () => {
    const data = dataWith();
    expect(setTick(data, 'h1', '2026-10-22', true, today, at)).toBe(data);
    expect(setTick(data, 'h1', '2026-10-11', true, today, at)).toBe(data);
    expect(setTick(data, 'unknown', today, true, today, at)).toBe(data);
  });

  it('backfill past day changes streak', () => {
    const data = dataWith(['2026-10-18', '2026-10-20', today]);
    expect(streak(data, h1, today)).toBe(2);
    const result = setTick(data, 'h1', '2026-10-19', true, today, at);
    expect(streak(result, h1, today)).toBe(4);
    expect(result.days.map((day) => day.date)).toEqual(['2026-10-18', '2026-10-19', '2026-10-20', today]);
  });

  it('removed habit keeps past ticks but leaves today', () => {
    const data = removeHabit(dataWith(['2026-10-20']), 'h1', today, later);
    expect(data.habits[0]).toMatchObject({ removedOn: today, updatedAt: later });
    expect(habitsForDay(data, today, today)).toEqual([]);
    expect(habitsForDay(data, '2026-10-20', today)[0]).toMatchObject({ done: true, canTick: true });
    expect(setTick(data, 'h1', today, true, today, later)).toBe(data);
    const synced = { ...data, days: [...data.days, { date: '2026-10-22', ticks: { h1: { done: true, at } } }] };
    expect(habitsForDay(synced, '2026-10-22', today)[0]).toMatchObject({ done: true, canTick: false });
    expect(daySummary(synced, '2026-10-22', today)).toEqual({ done: 0, total: 0, warnings: [] });
  });

  it('day before addedOn shows no dot', () => {
    expect(habitsForDay(dataWith(), '2026-10-11', today)).toEqual([]);
  });

  it('pre-addedOn tick from sync does not crash streak/missed', () => {
    const habit = { ...h1, addedOn: '2026-10-20' };
    const data = dataWith(['2026-10-19', '2026-10-20'], habit);
    expect(streak(data, habit, today)).toBe(1);
    expect(missedDays(data, habit, today)).toBe(0);
    expect(habitsForDay(data, '2026-10-19', today)[0]).toMatchObject({ done: true, canTick: false });
    expect(daySummary(data, '2026-10-19', today).total).toBe(0);
  });

  it('untick writes explicit false record', () => {
    const data = dataWith([today]);
    const result = setTick(data, 'h1', today, false, today, later);
    expect(result.days).toEqual([{ date: today, ticks: { h1: { done: false, at: later } } }]);
    expect(isDoneOn(result, 'h1', today)).toBe(false);
    expect(data.days[0].ticks.h1).toEqual({ done: true, at });
    expect(setTick(dataWith(), 'h1', today, false, today, later).days[0].ticks.h1).toEqual({ done: false, at: later });
  });

  it('setTick preserves other records and drops empty days', () => {
    const data = dataWith([today]);
    data.days[0].ticks.h2 = { done: true, at };
    data.days.unshift({ date: '2026-10-18', ticks: {} });
    const result = setTick(data, 'h1', today, false, today, later);
    expect(result.days).toEqual([{ date: today, ticks: { h1: { done: false, at: later }, h2: { done: true, at } } }]);
    expect(data.days).toHaveLength(2);
  });

  it.each([[0, 1], [999, 365], [2.6, 3]])('setWarnAfter clamps or rounds %s to %s', (input, expected) => {
    const data = dataWith();
    expect(setWarnAfter(data, 'h1', input, later).habits[0]).toMatchObject({ warnAfterDays: expected, updatedAt: later });
    expect(data.habits[0].updatedAt).toBe(at);
  });

  it('addHabit trims and rejects empty/81 chars', () => {
    expect(addHabit(EMPTY_HABITS, '  ', today, at, 'h1')).toBe(EMPTY_HABITS);
    expect(addHabit(EMPTY_HABITS, 'x'.repeat(81), today, at, 'h1')).toBe(EMPTY_HABITS);
    const result = addHabit(EMPTY_HABITS, '  Read  ', today, at, 'h1');
    expect(result.habits).toEqual([{ ...h1, addedOn: today }]);
    expect(EMPTY_HABITS).toEqual({ habits: [], days: [] });
    expect(addHabit(result, 'Read', today, later, 'h2').habits[1]).toMatchObject({ id: 'h2', order: 1, addedOn: today, updatedAt: later });
    expect(addHabit(result, 'x'.repeat(80), today, at, 'h3').habits).toHaveLength(2);
  });

  it('addHabit orders after the maximum including removed habits', () => {
    const data = dataWith([], { ...h1, order: 8, removedOn: today });
    expect(addHabit(data, 'Walk', today, at, 'h2').habits[1].order).toBe(9);
  });

  it('moveHabit swaps order among active neighbours', () => {
    const data: HabitData = { habits: [
      { ...h1, id: 'h3', order: 4 },
      { ...h1, id: 'removed', order: 2, removedOn: today },
      h1,
    ], days: [] };
    const moved = moveHabit(data, 'h1', 1, later);
    expect(activeHabits(moved, today).map((habit) => habit.id)).toEqual(['h3', 'h1']);
    expect(moved.habits.find((habit) => habit.id === 'h1')).toMatchObject({ order: 1, updatedAt: later });
    expect(moved.habits[0]).toMatchObject({ order: 0, updatedAt: later });
    expect(moved.habits[1]).toEqual(data.habits[1]);
    expect(moveHabit(moved, 'h1', 1, later)).toBe(moved);
    expect(moveHabit(moved, 'h3', -1, later)).toBe(moved);
    expect(activeHabits(moveHabit(moved, 'h1', -1, later), today).map((habit) => habit.id)).toEqual(['h1', 'h3']);
    expect(data.habits[2].order).toBe(0);
  });

  it('rename keeps ticks', () => {
    const data = dataWith(['2026-10-20']);
    const renamed = renameHabit(data, 'h1', '  Study  ', later);
    expect(renamed.habits[0]).toMatchObject({ name: 'Study', updatedAt: later });
    expect(renamed.days).toEqual(data.days);
    expect(streak(renamed, renamed.habits[0], today)).toBe(1);
    expect(renameHabit(data, 'h1', ' ', later)).toBe(data);
    expect(renameHabit(data, 'h1', 'x'.repeat(81), later)).toBe(data);
    expect(data.habits[0].name).toBe('Read');
  });

  it('habitsForDay is per date', () => {
    const data = dataWith(['2026-10-20']);
    expect(habitsForDay(data, '2026-10-20', today)[0].done).toBe(true);
    expect(habitsForDay(data, today, today)[0]).toMatchObject({ done: false, canTick: true, streak: 1 });
    expect(habitsForDay(data, '2026-10-22', today)[0].canTick).toBe(false);
  });

  it('sorts visible habits without mutating definitions and excludes removed false ticks', () => {
    const data: HabitData = { habits: [{ ...h1, id: 'h2', order: 3 }, h1, { ...h1, id: 'h3', removedOn: today }], days: [{ date: today, ticks: { h3: { done: false, at } } }] };
    expect(habitsForDay(data, today, today).map((item) => item.habit.id)).toEqual(['h1', 'h2']);
    expect(activeHabits(data, today).map((habit) => habit.id)).toEqual(['h1', 'h2']);
    expect(data.habits[0].id).toBe('h2');
    expect(daySummary(data, today, today).total).toBe(2);
  });

  it('unknown habit edits return the original data', () => {
    const data = dataWith();
    expect(renameHabit(data, 'missing', 'Walk', at)).toBe(data);
    expect(setWarnAfter(data, 'missing', 4, at)).toBe(data);
    expect(moveHabit(data, 'missing', 1, at)).toBe(data);
    expect(removeHabit(data, 'missing', today, at)).toBe(data);
  });

  it('empty data has no summary, items or completion', () => {
    expect(daySummary(EMPTY_HABITS, today, today)).toEqual({ done: 0, total: 0, warnings: [] });
    expect(habitsForDay(EMPTY_HABITS, today, today)).toEqual([]);
    expect(isDoneOn(EMPTY_HABITS, 'h1', today)).toBe(false);
  });

  it('handles calendar boundaries using the supplied today', () => {
    const habit = { ...h1, addedOn: '2024-02-28' };
    expect(streak(dataWith(['2024-02-28', '2024-02-29', '2024-03-01'], habit), habit, '2024-03-01')).toBe(3);
    expect(missedDays(dataWith([], { ...h1, addedOn: '2025-12-30' }), { ...h1, addedOn: '2025-12-30' }, '2026-01-02')).toBe(3);
  });

  it('newHabitId supplies six random characters and addHabit generates an id by default', () => {
    expect(newHabitId()).toMatch(/^habit-\d+-[a-z0-9]{6}$/);
    expect(addHabit(EMPTY_HABITS, 'Walk', today, at).habits[0].id).toMatch(/^habit-\d+-[a-z0-9]{6}$/);
  });
});

it('moves habits sharing order in either direction with deterministic ties', () => {
  const data: HabitData = { habits: [{ ...h1, id: 'a' }, { ...h1, id: 'b' }], days: [] };
  expect(activeHabits(moveHabit(data, 'a', 1, later), today).map(h => h.id)).toEqual(['b', 'a']);
  expect(activeHabits(moveHabit(data, 'b', -1, later), today).map(h => h.id)).toEqual(['b', 'a']);
});
it('indexes a two-year history for ten habits and invalidates on a new data object', () => {
  const days = Array.from({ length: 731 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10));
  const habits = Array.from({ length: 10 }, (_, i) => ({ ...h1, id: String(i), addedOn: days[0] }));
  let reads = 0;
  const data: HabitData = { habits, days: days.map(date => ({ get date() { reads++; return date; }, ticks: Object.fromEntries(habits.map(h => [h.id, { done: true, at }])) })) };
  const start = performance.now();
  const items = habitsForDay(data, days[730], days[730]);
  expect(performance.now() - start).toBeLessThan(50);
  expect(items).toHaveLength(10);
  expect(items.every(item => item.done && item.streak === 731 && item.missedDays === 0 && !item.warning)).toBe(true);
  expect(reads).toBeLessThanOrEqual(731);
  const before = reads;
  expect(daySummary(data, days[730], days[730])).toMatchObject({ done: 10, total: 10 });
  expect(reads).toBe(before);
  const changed = setTick(data, '0', days[730], false, days[730], later);
  expect(isDoneOn(changed, '0', days[730])).toBe(false);
  expect(isDoneOn(data, '0', days[730])).toBe(true);
});
