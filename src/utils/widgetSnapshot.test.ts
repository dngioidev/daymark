import { describe, expect, it } from 'vitest';
import { DailyDocument, TaskItem } from '../types/daymark';
import { toggleTaskDoneInDocument } from './taskActions';
import { buildWidgetSnapshot } from './widgetSnapshot';

const task = (id: string, status: string): TaskItem => ({
  id,
  title: `Task ${id}`,
  status,
  createdDate: '2026-10-18',
  originalNoteDate: '2026-10-18',
  heading: 'Work',
  order: 1,
  historyLog: [],
});

const doc: DailyDocument = {
  date: '2026-10-20',
  type: 'daily',
  updatedAt: '2026-10-20T00:00:00Z',
  headings: [
    { name: 'Work', items: [task('a', 'done'), task('b', 'in-progress'), task('c', 'archived')] },
    { name: 'Ideas', items: [task('d', 'blocked')] },
  ],
};

describe('buildWidgetSnapshot', () => {
  it('preserves section names for optional widget subheaders', () => {
    expect(buildWidgetSnapshot(doc, '2026-10-20').tasks.map((t) => t.section)).toEqual(['Work', 'Ideas', 'Work']);
  });
  it('lists active tasks first, then done, and omits archived', () => {
    const snap = buildWidgetSnapshot(doc, '2026-10-20');
    expect(snap.date).toBe('2026-10-20');
    expect(snap.tasks.map((t) => t.id)).toEqual(['b', 'd', 'a']);
  });

  it('returns an empty list when there is no document for today', () => {
    expect(buildWidgetSnapshot(undefined, '2026-10-20').tasks).toEqual([]);
  });

  it('caps the number of tasks', () => {
    const big: DailyDocument = {
      ...doc,
      headings: [{ name: 'Work', items: Array.from({ length: 60 }, (_, i) => task(`t${i}`, 'in-progress')) }],
    };
    expect(buildWidgetSnapshot(big, '2026-10-20').tasks).toHaveLength(30);
  });
});

describe('toggleTaskDoneInDocument', () => {
  it('marks an open task done with the completion date, without mutating the input', () => {
    const res = toggleTaskDoneInDocument(doc, 'b', '2026-10-20')!;
    expect(res.nowDone).toBe(true);
    expect(res.task.completedDate).toBe('2026-10-20');
    expect(doc.headings[0].items[1].status).toBe('in-progress');
  });

  it('reopens a done task', () => {
    const res = toggleTaskDoneInDocument(doc, 'a', '2026-10-20')!;
    expect(res.nowDone).toBe(false);
    expect(res.task.status).toBe('in-progress');
  });

  it('returns null for an unknown task', () => {
    expect(toggleTaskDoneInDocument(doc, 'zzz', '2026-10-20')).toBeNull();
  });
});

it('includes the selected task counting mode for native age recomputation', () => {
  expect(buildWidgetSnapshot(doc, '2026-11-02', 'weekdays').tasks[0]).toMatchObject({ countingDays: 'weekdays' });
  expect(buildWidgetSnapshot(doc, '2026-11-02').tasks[0]).toMatchObject({ countingDays: 'all' });
});

it('uses createdDate when present and falls back to originalNoteDate when empty', () => {
  const snapshot = buildWidgetSnapshot({ ...doc, headings: [{ name: 'Work', items: [
    { ...task('created', 'in-progress'), createdDate: '2026-10-16', originalNoteDate: '2026-10-18' },
    { ...task('fallback', 'in-progress'), createdDate: '', originalNoteDate: '2026-10-19' },
  ] }] }, '2026-10-20');
  expect(snapshot.tasks.map(t => [t.id, t.createdDate])).toEqual([
    ['created', '2026-10-16'], ['fallback', '2026-10-19'],
  ]);
});
