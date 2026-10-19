import { describe, expect, it } from 'vitest';
import { DailyDocument, TaskItem } from '../types/daymark';
import { DEFAULT_SETTINGS } from './defaultData';
import {
  correctHistoricalCompletion,
  getAgingSeverity,
  getCalendarDaysDifference,
  getPreviousDate,
  performDailyRollover,
  reopenTask,
} from './lifecycleEngine';

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

describe('performDailyRollover: versions and completion', () => {
  const statuses = DEFAULT_SETTINGS.statuses;

  it('carries the newest version of a task, not a stale older copy', () => {
    const older = task('a', 'in-progress', '2026-10-14');
    const newer = { ...task('a', 'blocked', '2026-10-14'), carriedFromDate: '2026-10-14' };
    const docs = [doc('2026-10-14', [older]), doc('2026-10-15', [newer])];
    const { updatedDocs } = performDailyRollover('2026-10-16', docs, statuses);
    const carried = allItems(updatedDocs, '2026-10-16');
    expect(carried).toHaveLength(1);
    expect(carried[0].status).toBe('blocked');
    expect(carried[0].carriedFromDate).toBe('2026-10-15');
  });

  it('does not resurrect a task completed historically', () => {
    const open = task('a', 'in-progress', '2026-10-13');
    const docs = [doc('2026-10-13', [open]), doc('2026-10-14', [{ ...open }]), doc('2026-10-15', [{ ...open }])];
    const fixed = correctHistoricalCompletion('a', '2026-10-14', '2026-10-15', docs).updatedDocs;
    const { updatedDocs, carriedCount } = performDailyRollover('2026-10-16', fixed, statuses);
    expect(carriedCount).toBe(0);
    expect(allItems(updatedDocs, '2026-10-16')).toHaveLength(0);
  });
});

describe('correctHistoricalCompletion', () => {
  it('marks done on the effective date and removes later copies', () => {
    const open = task('a', 'in-progress', '2026-10-13');
    const docs = [doc('2026-10-14', [{ ...open }]), doc('2026-10-15', [{ ...open }])];
    const { updatedDocs, updatedTask } = correctHistoricalCompletion('a', '2026-10-14', '2026-10-15', docs);
    expect(updatedTask?.status).toBe('done');
    expect(allItems(updatedDocs, '2026-10-14')[0].completedDate).toBe('2026-10-14');
    expect(allItems(updatedDocs, '2026-10-15')).toHaveLength(0);
  });

  it('returns input unchanged for an unknown task id', () => {
    const docs = [doc('2026-10-14', [task('a', 'in-progress', '2026-10-14')])];
    const res = correctHistoricalCompletion('missing', '2026-10-14', '2026-10-15', docs);
    expect(res.updatedTask).toBeNull();
    expect(res.updatedDocs).toBe(docs);
  });
});

describe('reopenTask', () => {
  it('clears completion and records history', () => {
    const done = { ...task('a', 'done', '2026-10-14'), completedDate: '2026-10-14' };
    const { updatedTask } = reopenTask('a', '2026-10-15', [doc('2026-10-14', [done])]);
    expect(updatedTask?.status).toBe('in-progress');
    expect(updatedTask?.completedDate).toBeUndefined();
    expect(updatedTask?.historyLog.at(-1)?.action).toBe('reopened');
  });
});

describe('aging', () => {
  const t = DEFAULT_SETTINGS.agingThresholds;
  const s = DEFAULT_SETTINGS.statuses;
  it('escalates by age and ignores done tasks', () => {
    const open = task('a', 'in-progress', '2026-10-10');
    expect(getAgingSeverity(open, '2026-10-11', t, s)).toBe('normal');
    expect(getAgingSeverity(open, `2026-10-${10 + t.attentionDays}`, t, s)).toBe('attention');
    expect(getAgingSeverity(open, `2026-10-${10 + t.criticalDays}`, t, s)).toBe('critical');
    expect(getAgingSeverity({ ...open, status: 'done' }, '2026-10-30', t, s)).toBe('normal');
  });
});

describe('getCalendarDaysDifference', () => {
  it('counts whole calendar days across DST changes', () => {
    expect(getCalendarDaysDifference('2026-03-01', '2026-03-31')).toBe(30);
    expect(getCalendarDaysDifference('2026-10-20', '2026-11-10')).toBe(21);
    expect(getCalendarDaysDifference('2026-10-20', '2026-10-20')).toBe(0);
  });
});
