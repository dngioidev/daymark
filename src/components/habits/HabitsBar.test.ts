import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { HabitData, HabitDayItem } from '../../types/daymark';
import { HabitsBar, barLabel } from './HabitsBar';
import { HabitChecklist } from './HabitChecklist';
import { EMPTY_HABITS } from '../../utils/habits';
import { formatDay } from '../../utils/dateFormat';

const today = '2026-10-24';
const data: HabitData = {
  habits: ['Water', 'Read', 'Stretch', 'Walk', 'Write'].map((name, order) => ({
    id: String(order), name, order, warnAfterDays: 3,
    addedOn: order === 2 ? '2026-10-20' : today, updatedAt: '2026-10-24T10:00:00Z',
  })),
  days: [{ date: today, ticks: {
    '0': { done: true, at: '2026-10-24T10:00:00Z' },
    '1': { done: true, at: '2026-10-24T10:00:00Z' },
  } }],
};

it('is closed by default with progress and the single missed-habit warning', () => {
  const html = renderToStaticMarkup(React.createElement(HabitsBar, { countingDays: 'all', data, date: today, today, onChange: vi.fn() }));
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('2 of 5');
  expect(html).toContain('⚠ 1 missed 4 days');
  expect(html).toContain('<circle');
  expect(html).not.toContain('type="checkbox"');
});

it('offers adding a daily habit without a warning in the empty state', () => {
  const html = renderToStaticMarkup(React.createElement(HabitsBar, { countingDays: 'all', data: EMPTY_HABITS, date: today, today, onChange: vi.fn(), compact: true }));
  expect(html).toContain('Habits · Add a daily habit');
  expect(html).not.toContain('⚠');
});

it('summarizes multiple warning habits without attributing one missed duration to all', () => {
  const multiple = { ...data, habits: data.habits.map(habit => ({ ...habit, addedOn: '2026-10-20' })) };
  const html = renderToStaticMarkup(React.createElement(HabitsBar, { countingDays: 'all', data: multiple, date: today, today, onChange: vi.fn() }));
  expect(html).toContain('⚠ 3');
  expect(html).not.toContain('missed 4 days');
});

it('labels empty, current and historical days with their progress and date', () => {
  const summary = { done: 2, total: 5, warnings: [] };
  expect(barLabel({ done: 0, total: 0, warnings: [] }, today, today)).toBe('Habits · Add a daily habit');
  expect(barLabel(summary, today, today)).toBe('2 of 5');
  const historical = barLabel(summary, '2026-10-20', today);
  expect(historical).toContain('Habits · ' + formatDay('2026-10-20', today));
  expect(historical).toContain('2 of 5');
});

it('renders labelled checkboxes, warnings, streaks and disabled historical/future rows', () => {
  const items: HabitDayItem[] = [
    { habit: data.habits[0], done: false, canTick: true, streak: 0, missedDays: 4, warning: true },
    { habit: data.habits[1], done: true, canTick: true, streak: 12, missedDays: 0, warning: false },
    { habit: data.habits[2], done: false, canTick: false, streak: 0, missedDays: 0, warning: false },
  ];
  const html = renderToStaticMarkup(React.createElement(HabitChecklist, { items, onToggle: vi.fn() }));
  expect(html).toContain('🔥 12');
  expect(html).toContain('⚠ 4 days');
  expect(html).toContain('aria-label="Water"');
  expect(html).toMatch(/<input[^>]*disabled=""/);
  expect(html).toContain('min-h-11');
  const hidden = renderToStaticMarkup(React.createElement(HabitChecklist, { items, onToggle: vi.fn(), showStreaks: false }));
  expect(hidden).not.toContain('🔥');
  expect(hidden).toContain('⚠ 4 days');
});
