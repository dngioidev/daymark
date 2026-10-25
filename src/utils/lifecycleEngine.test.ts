import { describe, expect, it } from 'vitest';
import { DailyDocument, TaskItem } from '../types/daymark';
import { DEFAULT_SETTINGS } from './defaultData';
import { removeTaskFromDocument } from './taskActions';
import {
  correctHistoricalCompletion,
  getAgingSeverity,
  getCalendarDaysDifference,
  getPreviousDate,
  performDailyRollover,
  reopenIntoToday,
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
  it('never carries a moved-to-backlog copy or alerts on it, even with an open status', () => {
    const closed = { ...task('a', 'in-progress', '2026-10-10'), movedToBacklogDate: '2026-10-20' };
    const docs = [doc('2026-10-19', [closed])];
    expect(performDailyRollover('2026-10-21', docs, statuses).carriedCount).toBe(0);
    expect(getAgingSeverity(closed, '2026-10-21', DEFAULT_SETTINGS.agingThresholds, statuses)).toBe('normal');
    expect(reopenTask('a', '2026-10-19', docs).updatedTask?.movedToBacklogDate).toBeUndefined();
  });

  it('a task deleted on a day does not come back from older copies the next morning', () => {
    const first = performDailyRollover('2026-10-21', [doc('2026-10-20', [task('t1', 'in-progress', '2026-10-20')])], statuses).updatedDocs;
    const deleted = first.map((d) => d.date === '2026-10-21' ? removeTaskFromDocument(d, 't1')!.doc : d);
    const out = performDailyRollover('2026-10-22', deleted, statuses).updatedDocs;
    expect(allItems(out, '2026-10-22').map((t) => t.id)).not.toContain('t1');
  });

  it('a tombstone hides only that task; other carried tasks still roll', () => {
    const first = performDailyRollover('2026-10-21', [doc('2026-10-20', ['t1', 't2'].map((id) => task(id, 'in-progress', '2026-10-20')))], statuses).updatedDocs;
    const deleted = first.map((d) => d.date === '2026-10-21' ? removeTaskFromDocument(d, 't1')!.doc : d);
    expect(allItems(performDailyRollover('2026-10-22', deleted, statuses).updatedDocs, '2026-10-22').map((t) => t.id)).toEqual(['t2']);
  });

  it('future documents are never rollover sources', () => {
    const out = performDailyRollover('2026-10-22', [doc('2026-10-25', [task('f1', 'in-progress', '2026-10-25')])], statuses).updatedDocs;
    expect(allItems(out, '2026-10-22').map((t) => t.id)).not.toContain('f1');
  });

  it('rollover into an existing future-planned doc appends carried tasks after planned ones', () => {
    const out = performDailyRollover('2026-10-22', [doc('2026-10-22', [{ ...task('p1', 'in-progress', '2026-10-22'), title: 'p1' }]), doc('2026-10-21', [{ ...task('c1', 'in-progress', '2026-10-21'), title: 'c1' }])], statuses).updatedDocs;
    expect(allItems(out, '2026-10-22').map((t) => t.title)).toEqual(['p1', 'c1']);
  });

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

  it('stamps the carried history entry with a fixed UTC timestamp', () => {
    const past = [doc('2026-10-20', [task('a', 'in-progress', '2026-10-20')])];
    const [carried] = allItems(performDailyRollover('2026-10-21', past, statuses).updatedDocs, '2026-10-21');
    const entry = carried.historyLog!.find((h) => h.action === 'carried_forward')!;
    expect(entry.timestamp).toBe('2026-10-21T00:00:00.000Z');
    expect(entry.id).toBe('hist-carry-a-2026-10-21');
  });

  it('does not bring back a task deleted from the target day', () => {
    const past = [doc('2026-10-20', [task('a', 'in-progress', '2026-10-20')])];
    const first = performDailyRollover('2026-10-21', past, statuses).updatedDocs;
    const today = first.find((d) => d.date === '2026-10-21')!;
    const removed = removeTaskFromDocument(today, 'a')!.doc;
    const docs = first.map((d) => (d.date === '2026-10-21' ? removed : d));
    const second = performDailyRollover('2026-10-21', docs, statuses);
    expect(allItems(second.updatedDocs, '2026-10-21').map((t) => t.id)).not.toContain('a');
  });

  it('two independent rollovers produce identical carried tasks', () => {
    const past = [doc('2026-10-20', [task('a', 'in-progress', '2026-10-20')])];
    const one = allItems(performDailyRollover('2026-10-21', past, statuses).updatedDocs, '2026-10-21');
    const two = allItems(performDailyRollover('2026-10-21', past, statuses).updatedDocs, '2026-10-21');
    expect(one).toEqual(two);
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

describe('historical completion and reopen use the right copy (BUG-08, BUG-09)', () => {
  it('historical completion keeps the latest edits', () => {
    const latest = { ...task('a', 'in-progress', '2026-10-15'), title: 'NEW title', description: 'new desc' };
    const docs = [
      doc('2026-10-15', [{ ...task('a', 'in-progress', '2026-10-15'), title: 'old title' }]),
      doc('2026-10-17', [latest]),
    ];
    const { updatedDocs } = correctHistoricalCompletion('a', '2026-10-16', '2026-10-17', docs);
    const [copy] = allItems(updatedDocs, '2026-10-16');
    expect(copy.title).toBe('NEW title');
    expect(copy.description).toBe('new desc');
    expect(copy.status).toBe('done');
    expect(copy.completedDate).toBe('2026-10-16');
  });

  it('reopen on the day it was done reopens that copy', () => {
    const done = { ...task('a', 'done', '2026-10-20'), completedDate: '2026-10-21' };
    const docs = [doc('2026-10-20', [task('a', 'in-progress', '2026-10-20')]), doc('2026-10-21', [done])];
    const { updatedDocs } = reopenTask('a', '2026-10-21', docs);
    const [copy] = allItems(updatedDocs, '2026-10-21');
    expect(copy.status).toBe('in-progress');
    expect(copy.completedDate).toBeUndefined();
  });

  it('reopen into a day with no note creates the note', () => {
    const done = { ...task('a', 'done', '2026-10-19'), completedDate: '2026-10-19' };
    const { updatedDocs } = reopenTask('a', '2026-10-21', [doc('2026-10-19', [done])], ['Work']);
    const [copy] = allItems(updatedDocs, '2026-10-21');
    expect(copy.id).toBe('a');
    expect(copy.status).not.toBe('done');
  });

  it('reopen leaves other days unchanged', () => {
    const earlier = task('a', 'in-progress', '2026-10-20');
    const done = { ...task('a', 'done', '2026-10-20'), completedDate: '2026-10-21' };
    const docs = [doc('2026-10-20', [earlier]), doc('2026-10-21', [done])];
    const { updatedDocs } = reopenTask('a', '2026-10-21', docs);
    expect(updatedDocs.find((d) => d.date === '2026-10-20')).toEqual(docs[0]);
  });

  it('reopen clears the id from removedTaskIds', () => {
    const done = { ...task('a', 'done', '2026-10-19'), completedDate: '2026-10-19' };
    const target = { ...doc('2026-10-21', []), removedTaskIds: ['a'] };
    const { updatedDocs } = reopenTask('a', '2026-10-21', [doc('2026-10-19', [done]), target]);
    expect(updatedDocs.find((d) => d.date === '2026-10-21')!.removedTaskIds).toBeUndefined();
    expect(allItems(updatedDocs, '2026-10-21').map((t) => t.id)).toEqual(['a']);
  });

  it('reopen never clones a copy dated after the target day', () => {
    const later = { ...task('a', 'done', '2026-10-20'), completedDate: '2026-10-20' };
    const docs = [doc('2026-10-20', [later])];
    const { updatedDocs, updatedTask } = reopenTask('a', '2026-10-18', docs);
    expect(updatedTask).toBeNull();
    expect(updatedDocs).toBe(docs);
  });
});

describe('reopenIntoToday', () => {
  const statuses = DEFAULT_SETTINGS.statuses;
  const heads = ['Work'];
  const today = '2026-10-21';
  const count = (docs: DailyDocument[], date: string) => allItems(docs, date).filter((t) => t.id === 'a').length;

  it('carries a past reopen to today', () => {
    const done = { ...task('a', 'done', '2026-10-18'), completedDate: '2026-10-18' };
    const r = reopenIntoToday('a', '2026-10-18', today, [doc('2026-10-18', [done])], statuses, heads);
    expect(r.onToday).toBe(true);
    expect(r.updatedTask?.status).toBe('in-progress');
    expect(count(r.updatedDocs, today)).toBe(1);
    expect(allItems(r.updatedDocs, today)[0].status).not.toBe('done');
  });

  it('lands on today and clears the tombstone when today had it removed', () => {
    const done = { ...task('a', 'done', '2026-10-18'), completedDate: '2026-10-18' };
    const t = { ...doc(today, []), removedTaskIds: ['a'] };
    const r = reopenIntoToday('a', '2026-10-18', today, [doc('2026-10-18', [done]), t], statuses, heads);
    expect(r.onToday).toBe(true);
    expect(count(r.updatedDocs, today)).toBe(1);
    expect(r.updatedDocs.find((d) => d.date === today)!.removedTaskIds).toBeUndefined();
  });

  it('lands on today reopened when a later past day holds a done copy', () => {
    const done1 = { ...task('a', 'done', '2026-10-17'), completedDate: '2026-10-17' };
    const done2 = { ...task('a', 'done', '2026-10-17'), completedDate: '2026-10-19' };
    const docs = [doc('2026-10-17', [done1]), doc('2026-10-19', [done2])];
    const r = reopenIntoToday('a', '2026-10-17', today, docs, statuses, heads);
    expect(r.onToday).toBe(true);
    expect(count(r.updatedDocs, today)).toBe(1);
    expect(allItems(r.updatedDocs, today)[0].status).not.toBe('done');
    expect(allItems(r.updatedDocs, '2026-10-19')[0].status).toBe('done');
  });

  it('returns a null task and unchanged docs when there is nothing to reopen', () => {
    const docs = [doc('2026-10-18', [])];
    const r = reopenIntoToday('a', '2026-10-18', today, docs, statuses, heads);
    expect(r.updatedTask).toBeNull();
    expect(r.updatedDocs).toBe(docs);
    expect(r.onToday).toBe(false);
  });
});
