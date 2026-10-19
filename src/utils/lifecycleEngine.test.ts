import { describe, expect, it } from 'vitest';
import { DailyDocument, TaskItem } from '../types/daymark';
import { DEFAULT_SETTINGS } from './defaultData';
import { getPreviousDate, performDailyRollover } from './lifecycleEngine';

function task(id: string, status: string, createdDate: string): TaskItem {
  return {
    id,
    title: `Task ${id}`,
    status,
    createdDate,
    originalNoteDate: createdDate,
    heading: 'Work',
    order: 1,
    historyLog: [],
  };
}

function doc(date: string, items: TaskItem[]): DailyDocument {
  return {
    date,
    type: 'daily',
    headings: [{ name: 'Work', items, notesContent: '' }],
    updatedAt: `${date}T00:00:00Z`,
  };
}

const allItems = (docs: DailyDocument[], date: string) =>
  docs.find((d) => d.date === date)!.headings.flatMap((h) => h.items);

describe('performDailyRollover', () => {
  const statuses = DEFAULT_SETTINGS.statuses;

  it('carries unfinished tasks forward and skips done ones', () => {
    const docs = [doc('2026-10-15', [task('a', 'in-progress', '2026-10-15'), task('b', 'done', '2026-10-15')])];
    const { updatedDocs, carriedCount } = performDailyRollover('2026-10-16', docs, statuses);
    expect(carriedCount).toBe(1);
    expect(allItems(updatedDocs, '2026-10-16').map((t) => t.id)).toEqual(['a']);
  });

  it('is idempotent: a second rollover produces no duplicates', () => {
    const docs = [doc('2026-10-15', [task('a', 'in-progress', '2026-10-15')])];
    const first = performDailyRollover('2026-10-16', docs, statuses);
    const second = performDailyRollover('2026-10-16', first.updatedDocs, statuses);
    expect(second.carriedCount).toBe(0);
    expect(allItems(second.updatedDocs, '2026-10-16')).toHaveLength(1);
  });
});

describe('getPreviousDate', () => {
  it('crosses month boundaries', () => {
    expect(getPreviousDate('2026-11-01', 1)).toBe('2026-10-31');
  });
});
