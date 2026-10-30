import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { CalendarView } from './CalendarView';
import { WeekRows } from './WeekRows';
import { weekCells } from '../utils/calendarGrid';
import { DEFAULT_SETTINGS } from '../utils/defaultData';
import type { DailyDocument, HabitData } from '../types/daymark';
import { formatLongDate } from '../utils/dateFormat';

const habits: HabitData = {
  habits: [{ id: 'water', name: 'Drink water', order: 0, warnAfterDays: 3, addedOn: '2026-10-18', updatedAt: '2026-10-18T00:00:00Z' }],
  days: [{ date: '2026-10-20', ticks: { water: { done: true, at: '2026-10-20T12:00:00Z' } } }],
};

const calendarProps = {
  countingDays: 'all' as const,
  dailyDocuments: [], selectedDate: '2026-10-20', simulatedToday: '2026-10-21',
  statuses: DEFAULT_SETTINGS.statuses, onSelectDate: vi.fn(), onReopenTask: vi.fn(), onMoveTask: vi.fn(),
  habits, onHabitsChange: vi.fn(),
};

// DOMPurify needs a browser DOM; this test checks the surrounding Calendar rendering.
vi.mock('dompurify', () => ({ default: { sanitize: (html: string) => html } }));

it('excludes backlog-closed copies from day counts and detail list while retaining notes and Done-later history', () => {
  const task = { id: 'closed', title: 'Moved away', status: 'done', createdDate: '2026-10-18', originalNoteDate: '2026-10-18', heading: 'Work', order: 1, historyLog: [] };
  const doc: DailyDocument = {
    date: '2026-10-20', type: 'daily', updatedAt: '',
    headings: [{ name: 'Work', notesContent: 'Keep day notes', items: [
      { ...task, movedToBacklogDate: '2026-10-21' },
      { ...task, id: 'later', title: 'Finished elsewhere', doneLaterDate: '2026-10-21' },
      { ...task, id: 'done', title: 'Actually finished' },
    ] }],
  };
  const html = renderToStaticMarkup(React.createElement(CalendarView, { ...calendarProps, dailyDocuments: [doc] }));
  expect(html).toContain('>1/1</span>');
  expect(html).not.toContain('2/2');
  expect(html).not.toContain('Moved away');
  expect(html).toContain('Actually finished');
  expect(html).toContain('Finished elsewhere');
  expect(html).toContain('done later');
  expect(html).toContain('Keep day notes');
});

it('renders enabled future cells, counts, notes, Planned and the existing panels', () => {
  const doc: DailyDocument = {
    date: '2026-10-25', type: 'daily', updatedAt: '',
    headings: [{ name: 'Work', notesContent: 'Plan next week', items: [{
      id: 'plan', title: 'Prepare', status: 'in-progress', createdDate: '2026-10-21',
      originalNoteDate: '2026-10-25', heading: 'Work', order: 0, historyLog: [],
    }] }],
  };
  const html = renderToStaticMarkup(React.createElement(CalendarView, { countingDays: 'all',
    dailyDocuments: [doc], selectedDate: doc.date, simulatedToday: '2026-10-21',
    statuses: DEFAULT_SETTINGS.statuses, onSelectDate: vi.fn(), onReopenTask: vi.fn(),
    onMarkDoneOnDay: vi.fn(), onOpenDay: vi.fn(), onMoveTask: vi.fn(),
    habits: { habits: [], days: [] }, onHabitsChange: vi.fn(),
  }));
  expect(html).not.toContain('>Calendar</h1>');
  expect(html).toContain('max-w-[1800px]');
  expect(html.match(/dm-card/g)).toHaveLength(2);
  expect(html).toContain('>Month</button>');
  expect(html).toContain('>Week</button>');
  expect(html).toContain('>0/1</span>');
  expect(html).toContain('aria-label="has notes"');
  expect(html).toContain('Planned');
  expect(html).toContain('Prepare');
  expect(html).toContain('Plan next week');
  expect(html).toContain('Open this day');
  expect(html).toContain('Last 7 days:');
  expect(html).not.toContain('disabled=""');
  expect(html).not.toContain('Recent days');
  expect(html).not.toContain('Done this day');
});

it.each([false, true])('preserves empty past-day wording with a stored document: %s', (stored) => {
  const date = '2026-10-13';
  const html = renderToStaticMarkup(React.createElement(CalendarView, { countingDays: 'all',
    dailyDocuments: stored ? [{ date, type: 'daily', updatedAt: '', headings: [{ name: 'Work', items: [], notesContent: '  ' }] }] : [],
    selectedDate: date, simulatedToday: '2026-10-21', compact: true,
    statuses: DEFAULT_SETTINGS.statuses, onSelectDate: vi.fn(), onReopenTask: vi.fn(), onMoveTask: vi.fn(),
    habits: { habits: [], days: [] }, onHabitsChange: vi.fn(),
  }));
  expect(html).toContain(`aria-label="${formatLongDate(date)}: nothing recorded"`);
  expect(html).toContain('Nothing was recorded on');
  expect(html).not.toContain('notes only');
});

it('week view renders rows with all tasks', () => {
  const doc: DailyDocument = {
    date: '2026-10-19', type: 'daily', updatedAt: '', headings: [{ name: 'Work', items: Array.from({ length: 9 }, (_, i) => ({
      id: `busy-${i}`, title: `Busy task ${i + 1}`, status: i === 0 ? 'done' : 'in-progress',
      createdDate: '2026-10-19', originalNoteDate: '2026-10-19', heading: 'Work', order: i, historyLog: [],
    })) }],
  };
  const html = renderToStaticMarkup(React.createElement(CalendarView, { ...calendarProps, dailyDocuments: [doc], initialView: 'week' }));
  for (let i = 1; i <= 9; i++) expect(html).toContain(`Busy task ${i}`);
  expect(html.match(/data-date="/g)).toHaveLength(7);
  expect(html).toContain('columns-1 md:columns-2');
  expect(html).toContain('line-through');
  expect(html).toContain('Nothing planned');
  expect(html).not.toContain('grid-cols-7');
  expect(html).not.toContain('line-clamp');
  expect(html).not.toMatch(/\+\d+ more/);
});

it('future row has no habit dots', () => {
  const html = renderToStaticMarkup(React.createElement(CalendarView, { ...calendarProps, initialView: 'week', selectedDate: '2026-10-24' }));
  const rows = html.split(/(?=<(?:button|div)[^>]*data-date=")/).slice(1);
  expect(rows).toHaveLength(7);
  expect(rows[2]).toContain('bg-emerald-600');
  expect(rows[3]).toContain('bg-stone-300 dark:bg-stone-600');
  for (const row of rows.slice(4)) {
    expect(row).not.toContain('bg-emerald-600');
    expect(row).not.toContain('bg-stone-300 dark:bg-stone-600');
  }
  expect(html).not.toContain('type="checkbox"');
});

it('past day detail shows habit checkboxes', () => {
  const html = renderToStaticMarkup(React.createElement(CalendarView, calendarProps));
  expect(html).toContain('>Habits</h3>');
  expect(html).toContain('aria-label="Drink water"');
  expect(html).toContain('type="checkbox"');
  expect(html).toContain('checked=""');
  expect(html).not.toContain('disabled=""');
  expect(html).toContain('Nothing was recorded on');
});

function busyWeekRow() {
  const cells = weekCells('2026-10-21', [], '2026-10-21');
  cells[0] = { ...cells[0], items: [{ title: 'Read the complete project proposal', done: false }], total: 1 };
  const html = renderToStaticMarkup(React.createElement(WeekRows, {
    cells, today: '2026-10-21', selectedDate: '2026-10-21', habits, onSelectDate: vi.fn(), dropProps: () => ({}),
  }));
  return html.match(/<button\b[^>]*data-date="2026-10-18"[^>]*>[\s\S]*?<\/button>/)![0];
}

it('stacks a connected phone header above the full-width week task list', () => {
  const row = busyWeekRow();
  expect(row).toContain('flex w-full items-center gap-3 md:contents');
  expect(row).toContain('flex w-full min-h-11 flex-col');
  expect(row).toContain('block w-full min-w-0 columns-1 md:columns-2');
  expect(row).not.toContain('row-span');
  expect(row).toContain('md:grid-cols-[9rem_minmax(0,1fr)_8rem]');
  expect(row.indexOf('Habits:')).toBeLessThan(row.indexOf('Read the complete project proposal'));
});

it('exposes week task titles without a row aria-label override and shows the weekday once', () => {
  const row = busyWeekRow();
  expect(row.slice(0, row.indexOf('>'))).not.toContain('aria-label');
  expect(row).toContain('Read the complete project proposal');
  expect(row).toContain('0/1');
  const text = row.replace(/<[^>]*>/g, ' ');
  expect(text.match(/\bSun\b/g)).toHaveLength(1);
  expect(text).toContain('Oct 18');
});
