import { describe, expect, it } from 'vitest';
import type { DailyDocument } from '../types/daymark';
import { monthCells, weekCells } from './calendarGrid';

const docs: DailyDocument[] = [{
  date: '2026-10-16', type: 'daily', updatedAt: '',
  headings: [{ name: 'Work', notesContent: 'Review notes', items: Array.from({ length: 5 }, (_, i) => ({
    id: `task-${i}`, title: `Task ${i + 1}`, status: 'in-progress', createdDate: '2026-10-16',
    originalNoteDate: '2026-10-16', heading: 'Work', order: i, historyLog: [],
  })) }],
}];

describe('monthCells', () => {
  it('fills Sunday-first weeks, including selectable future dates and adjacent months', () => {
    const cells = monthCells(2026, 9, docs, '2026-10-21');
    expect(cells).toHaveLength(35);
    expect(cells.length % 7).toBe(0);
    expect(cells[0]).toMatchObject({ date: '2026-09-27', inMonth: false });
    expect(cells.at(-1)?.date).toBe('2026-10-31');
    expect(cells.find((c) => c.date === '2026-10-25')).toMatchObject({ isFuture: true, inMonth: true });
    expect(cells.find((c) => c.date === '2026-10-21')).toMatchObject({ isToday: true, isFuture: false });
  });

  it('summarises all sections without changing documents', () => {
    const before = JSON.stringify(docs);
    expect(monthCells(2026, 9, docs, '2026-10-21').find((c) => c.date === '2026-10-16'))
      .toMatchObject({ done: 0, total: 5, hasNotes: true, titles: ['Task 1', 'Task 2', 'Task 3', 'Task 4', 'Task 5'] });
    const mixed: DailyDocument = { ...docs[0], headings: [
      { name: 'Work', items: [{ ...docs[0].headings[0].items[0], status: 'done' }] },
      { name: 'Home', items: [docs[0].headings[0].items[1]], notesContent: '  ' },
    ] };
    expect(monthCells(2026, 9, [mixed], '2026-10-21').find((c) => c.date === '2026-10-16'))
      .toMatchObject({ done: 1, total: 2, hasNotes: false, titles: ['Task 1', 'Task 2'] });
    expect(JSON.stringify(docs)).toBe(before);
  });

  it('handles leap years and fills the trailing week', () => {
    const cells = monthCells(2028, 1, [], '2028-02-01');
    expect(cells).toHaveLength(35);
    expect(cells[0].date).toBe('2028-01-30');
    expect(cells.at(-1)).toEqual({ date: '2028-03-04', inMonth: false, isToday: false, isFuture: true, done: 0, total: 0, hasNotes: false, titles: [] });
    expect(cells.some((c) => c.date === '2028-02-29')).toBe(true);
  });
});

describe('weekCells', () => {
  it('returns the Sunday-first week containing the anchor', () => {
    expect(weekCells('2026-10-21', docs, '2026-10-21').map((c) => c.date)).toEqual([
      '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24',
    ]);
  });

  it('crosses year boundaries and marks membership relative to the anchor month', () => {
    const cells = weekCells('2027-01-01', [], '2026-12-31');
    expect(cells[0]).toMatchObject({ date: '2026-12-27', inMonth: false });
    expect(cells.at(-1)).toMatchObject({ date: '2027-01-02', inMonth: true, isFuture: true });
    expect(weekCells('2026-10-18', [], '2026-10-21')[0].date).toBe('2026-10-18');
  });
});
