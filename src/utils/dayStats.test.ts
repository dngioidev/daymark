import { describe, expect, it } from 'vitest';
import type { DailyDocument, TaskItem } from '../types/daymark';
import { nextPlannedDay, weekTrend } from './dayStats';

function day(date: string, statuses: string[]): DailyDocument {
  const items: TaskItem[] = statuses.map((status, i) => ({
    id: `${date}-${i}`, title: `Task ${i}`, status, createdDate: date,
    originalNoteDate: date, heading: 'Work', order: i, historyLog: [],
  }));
  return { date, type: 'daily', updatedAt: date, headings: [{ name: 'Work', items }] };
}

describe('day statistics', () => {
  const docs = [
    day('2026-10-27', ['not-started']),
    day('2026-10-21', ['not-started', 'in-progress', 'blocked', 'waiting']),
    day('2026-10-16', ['done', 'not-started', 'blocked', 'waiting', 'archived']),
    day('2026-10-24', ['not-started', 'in-progress', 'done']),
    day('2026-10-22', []),
    day('2026-10-14', ['done']),
  ];

  it('covers seven calendar days ending today, oldest first, filling missing days', () => {
    const trend = weekTrend(docs, '2026-10-21');
    expect(trend).toHaveLength(7);
    expect(trend).toEqual([
      { date: '2026-10-15', done: 0, total: 0 },
      { date: '2026-10-16', done: 1, total: 5 },
      { date: '2026-10-17', done: 0, total: 0 },
      { date: '2026-10-18', done: 0, total: 0 },
      { date: '2026-10-19', done: 0, total: 0 },
      { date: '2026-10-20', done: 0, total: 0 },
      { date: '2026-10-21', done: 0, total: 4 },
    ]);
    expect(weekTrend([], '2027-01-02')[0]).toEqual({ date: '2026-12-27', done: 0, total: 0 });
  });

  it('counts tasks across all sections', () => {
    const doc = day('2026-10-21', ['done']);
    doc.headings.push({ name: 'Personal', items: day(doc.date, ['done', 'waiting']).headings[0].items });
    expect(weekTrend([doc], doc.date)[6]).toEqual({ date: doc.date, done: 2, total: 3 });
  });

  it('finds the nearest future day with tasks regardless of input order', () => {
    expect(nextPlannedDay(docs, '2026-10-21')).toEqual({ date: '2026-10-24', open: 2 });
    expect(nextPlannedDay([day('2026-10-22', ['done'])], '2026-10-21')).toEqual({ date: '2026-10-22', open: 0 });
  });

  it('returns null for only past, current or empty future days', () => {
    const onlyPast = docs.filter((doc) => doc.date <= '2026-10-21');
    expect(nextPlannedDay(onlyPast, '2026-10-21')).toBeNull();
    expect(nextPlannedDay([day('2026-10-22', [])], '2026-10-21')).toBeNull();
    expect(nextPlannedDay([], '2026-10-21')).toBeNull();
  });
});
