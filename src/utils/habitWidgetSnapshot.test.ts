import { describe, expect, it } from 'vitest';
import type { HabitData } from '../types/daymark';
import { applyWidgetAction, buildHabitWidgetSnapshot } from './habitWidgetSnapshot';

const today = '2026-10-21';
const at = '2026-10-21T09:00:00.000Z';
const habit = { id: 'read', name: 'Read', order: 0, addedOn: '2026-10-01', warnAfterDays: 3, updatedAt: at };
const data: HabitData = {
  habits: [habit],
  days: ['2026-10-18', '2026-10-19', '2026-10-20'].map((date) => ({ date, ticks: { read: { done: true, at } } })),
};

describe('habit widget snapshot', () => {
  it('snapshot streakBefore/lastDoneBefore', () => {
    expect(buildHabitWidgetSnapshot(data, today)).toMatchObject({ date: today, habits: [
      { id: 'read', name: 'Read', doneToday: false, streakBefore: 3, lastDoneBefore: '2026-10-20', addedOn: '2026-10-01', warnAfterDays: 3 },
    ] });
  });
  it('does not include today in streakBefore or lastDoneBefore', () => {
    const doneToday = applyWidgetAction(data, { type: 'habit', habitId: 'read', date: today, done: true, at }, today);
    expect(buildHabitWidgetSnapshot(doneToday, today).habits[0]).toMatchObject({ doneToday: true, streakBefore: 3, lastDoneBefore: '2026-10-20' });
  });
  it('does not borrow an older streak when yesterday was missed', () => {
    expect(buildHabitWidgetSnapshot(data, '2026-10-22').habits[0]).toMatchObject({ streakBefore: 0, lastDoneBefore: '2026-10-20' });
  });
  it('snapshot excludes removed habits', () => {
    expect(buildHabitWidgetSnapshot({ ...data, habits: [{ ...habit, removedOn: today }] }, today).habits).toEqual([]);
  });
  it('keeps active habits in order with a maximum of 30', () => {
    const habits = Array.from({ length: 32 }, (_, order) => ({ ...habit, id: String(order), order })).reverse();
    const snapshot = buildHabitWidgetSnapshot({ habits, days: [] }, today);
    expect(snapshot.habits).toHaveLength(30);
    expect(snapshot.habits[0]).toMatchObject({ id: '0', streakBefore: 0, lastDoneBefore: null });
    expect(snapshot.habits[29].id).toBe('29');
    expect(Number.isNaN(Date.parse(snapshot.updatedAt))).toBe(false);
  });
});

describe('habit widget actions', () => {
  it('applyWidgetAction uses the action date', () => {
    const next = applyWidgetAction({ habits: [habit], days: [] }, { type: 'habit', habitId: 'read', date: '2026-10-20', done: true, at }, today);
    expect(next.days).toEqual([{ date: '2026-10-20', ticks: { read: { done: true, at } } }]);
  });
  it('older widget action loses to newer app tick', () => {
    const current: HabitData = { habits: [habit], days: [{ date: today, ticks: { read: { done: false, at } } }] };
    expect(applyWidgetAction(current, { type: 'habit', habitId: 'read', date: today, done: true, at: '2026-10-21T08:00:00.000Z' }, today)).toBe(current);
  });
  it('applies explicit done values in queue order, preserving other habits', () => {
    const actions = [true, false].map((done, index) => ({ type: 'habit' as const, habitId: 'read', date: today, done, at: `2026-10-21T10:0${index}:00.000Z` }));
    const next = actions.reduce((current, action) => applyWidgetAction(current, action, today), data);
    expect(next.days.find((day) => day.date === today)?.ticks.read.done).toBe(false);
    expect(next.days.find((day) => day.date === '2026-10-18')?.ticks.read.done).toBe(true);
  });
  it('ignores non-habit actions, unknown habits and future dates', () => {
    expect(applyWidgetAction(data, { type: 'habits' }, today)).toBe(data);
    expect(applyWidgetAction(data, { type: 'habit', habitId: 'missing', date: today, done: true, at }, today)).toBe(data);
    expect(applyWidgetAction(data, { type: 'habit', habitId: 'read', date: '2026-10-22', done: true, at }, today)).toBe(data);
  });
});

it('compares widget timestamps by instant even when native omits fractional seconds', () => {
  const current: HabitData = { habits: [habit], days: [{ date: today, ticks: { read: { done: false, at: '2026-10-21T09:00:00.100Z' } } }] };
  expect(applyWidgetAction(current, { type: 'habit', habitId: 'read', date: today, done: true, at: '2026-10-21T09:00:00Z' }, today)).toBe(current);
});
