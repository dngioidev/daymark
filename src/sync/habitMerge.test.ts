import { expect, it } from 'vitest';
import type { Habit } from '../types/daymark';
import { mergeHabitDay, mergeHabitList } from './merge';
const habit: Habit = { id: 'h', name: 'Base', addedOn: '2026-10-24', order: 0, warnAfterDays: 3, updatedAt: '2026-10-24T07:00:00Z' };
it.each([
  ['2026-10-24T09:00:00Z', '2026-10-24T08:00:00Z', 'Ours'],
  ['2026-10-24T08:00:00Z', '2026-10-24T09:00:00Z', 'Theirs'],
  ['2026-10-24T08:00:00.000Z', '2026-10-24T08:00:00Z', 'Theirs'],
])('keeps the newer habit edit (%s versus %s)', (oursAt, theirsAt, name) => {
  const result = mergeHabitList({ habits: [habit] }, { habits: [{ ...habit, name: 'Ours', updatedAt: oursAt }] }, { habits: [{ ...habit, name: 'Theirs', updatedAt: theirsAt }] });
  expect(result.value!.habits[0].name).toBe(name);
  expect(result.conflicts[0]).toContain('newer timestamp (incoming on ties)');
});
it('still prioritizes removal over a newer rename', () => {
  const removed = { ...habit, removedOn: '2026-10-24' };
  const edited = { ...habit, name: 'Edited', updatedAt: '2026-10-25T00:00:00Z' };
  for (const [a, b] of [[removed, edited], [edited, removed]]) {
    expect(mergeHabitList({ habits: [habit] }, { habits: [a] }, { habits: [b] }).value!.habits[0]).toEqual(removed);
  }
});
it.each([
  ['2026-10-24T08:00:00Z', '2026-10-24T08:00:00.123Z', false],
  ['2026-10-24T08:00:00.123Z', '2026-10-24T08:00:00Z', true],
  ['2026-10-24T08:00:00.000Z', '2026-10-24T08:00:00Z', false],
  ['invalid', '2026-10-24T08:00:00Z', false],
  ['2026-10-24T08:00:00Z', 'invalid', true],
  ['invalid', 'also invalid', false],
])('compares tick instants with mixed precision or invalid dates (%s, %s)', (oursAt, theirsAt, done) => {
  const result = mergeHabitDay(null, { date: '2026-10-24', ticks: { h: { done: true, at: oursAt } } }, { date: '2026-10-24', ticks: { h: { done: false, at: theirsAt } } });
  expect(result.value!.ticks.h.done).toBe(done);
});
