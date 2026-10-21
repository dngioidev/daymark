import { afterEach, describe, expect, it, vi } from 'vitest';
import { DailyDocument, TaskItem } from '../types/daymark';
import { isDailyDocument } from './vaultValidation';
import { applyMarkdownEdit, removeTaskFromDocument, replaceTaskInDocument, restoreTaskToDocument, toggleTaskDoneInDocument } from './taskActions';

const task = (id: string, title = id): TaskItem => ({
  id,
  title,
  status: 'in-progress',
  createdDate: '2026-10-21',
  originalNoteDate: '2026-10-21',
  heading: 'Work',
  order: 1,
  historyLog: [],
});

const doc = (items: TaskItem[]): DailyDocument => ({
  date: '2026-10-21',
  type: 'daily',
  updatedAt: '2026-10-21T08:00:00Z',
  headings: [{ name: 'Work', items, notesContent: '' }],
});

const titles = (d: DailyDocument) => d.headings.flatMap((h) => h.items.map((t) => t.title));

describe('toggleTaskDoneInDocument', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('works where crypto.randomUUID is missing (app opened over plain HTTP on a LAN address)', () => {
    vi.stubGlobal('crypto', {});
    const original = doc([task('a')]);
    const done = toggleTaskDoneInDocument(original, 'a', original.date)!;
    const reopened = toggleTaskDoneInDocument(done.doc, 'a', original.date)!;
    expect(done.task.status).toBe('done');
    expect(new Set(reopened.task.historyLog.map((h) => h.id)).size).toBe(2);
  });

  it('toggles an accepted legacy task that has no history', () => {
    const legacy: unknown = { date: '2026-10-21', headings: [{ name: 'Work', items: [
      { id: 'a', title: 'Legacy task', status: 'blocked', createdDate: '2026-10-21' },
    ] }] };
    expect(isDailyDocument(legacy)).toBe(true);
    if (!isDailyDocument(legacy)) throw new Error('Invalid fixture');
    const done = toggleTaskDoneInDocument(legacy, 'a', legacy.date)!;
    expect(done.task.status).toBe('done');
    expect(done.task.historyLog.map((h) => h.action)).toEqual(['status_changed']);
  });
  it.each(['blocked', 'waiting', 'not-started'])('unticking returns a %s task to its previous status', (status) => {
    const original = doc([{ ...task('a'), status }]);
    const done = toggleTaskDoneInDocument(original, 'a', original.date)!;
    expect(done.task.status).toBe('done');
    expect(done.task.completedDate).toBe(original.date);
    const reopened = toggleTaskDoneInDocument(done.doc, 'a', original.date)!;
    expect(reopened.task.status).toBe(status);
    expect(reopened.task.completedDate).toBeUndefined();
    expect(reopened.task).not.toHaveProperty('statusBeforeDone');
    expect(original.headings[0].items[0].status).toBe(status);
  });

  it('falls back to in-progress without a remembered status', () => {
    const original = doc([{ ...task('a'), status: 'done', completedDate: '2026-10-20' }]);
    const reopened = toggleTaskDoneInDocument(original, 'a', original.date)!;
    expect(reopened.task.status).toBe('in-progress');
    expect(reopened.nowDone).toBe(false);
    expect(reopened.task.completedDate).toBeUndefined();
  });

  it('records done and reopened in the history', () => {
    const original = doc([task('a')]);
    const done = toggleTaskDoneInDocument(original, 'a', original.date)!;
    const reopened = toggleTaskDoneInDocument(done.doc, 'a', original.date)!;
    expect(reopened.task.historyLog.map((h) => [h.action, h.details, h.date])).toEqual([
      ['status_changed', 'Marked done', original.date],
      ['reopened', 'Marked not done', original.date],
    ]);
    expect(new Set(reopened.task.historyLog.map((h) => h.id)).size).toBe(2);
  });
});

describe('removeTaskFromDocument / restoreTaskToDocument', () => {
  it('returns null when the task is not in the document', () => {
    expect(removeTaskFromDocument(doc([task('a')]), 'zzz')).toBeNull();
  });

  it('restore puts the task back at its position and clears the tombstone', () => {
    const original = doc([task('a'), task('b'), task('c')]);
    const res = removeTaskFromDocument(original, 'b')!;
    expect(titles(res.doc)).toEqual(['a', 'c']);
    expect(res.doc.removedTaskIds).toEqual(['b']);
    const back = restoreTaskToDocument(res.doc, res.removed);
    expect(titles(back)).toEqual(['a', 'b', 'c']);
    expect(back.removedTaskIds).toBeUndefined();
  });

  it('restore keeps edits made to other tasks after the delete', () => {
    const res = removeTaskFromDocument(doc([task('A'), task('B')]), 'A')!;
    const edited: DailyDocument = {
      ...res.doc,
      headings: res.doc.headings.map((h) => ({ ...h, items: h.items.map((t) => ({ ...t, title: 'B renamed' })) })),
    };
    expect(titles(restoreTaskToDocument(edited, res.removed))).toEqual(['A', 'B renamed']);
  });

  it('restore is a no-op when the task is already back', () => {
    const res = removeTaskFromDocument(doc([task('a'), task('b')]), 'a')!;
    const once = restoreTaskToDocument(res.doc, res.removed);
    const twice = restoreTaskToDocument(once, res.removed);
    expect(titles(twice)).toEqual(['a', 'b']);
  });

  it('restore recreates a missing heading', () => {
    const res = removeTaskFromDocument(doc([task('a')]), 'a')!;
    const noHeading: DailyDocument = { ...res.doc, headings: [] };
    const back = restoreTaskToDocument(noHeading, res.removed);
    expect(back.headings.map((h) => h.name)).toEqual(['Work']);
    expect(titles(back)).toEqual(['a']);
  });
});

describe('applyMarkdownEdit', () => {
  it('keeps existing tombstones and adds ids dropped by the edit, without duplicates', () => {
    const previous: DailyDocument = { ...doc([task('a'), task('b')]), removedTaskIds: ['x', 'a'] };
    const result = applyMarkdownEdit(previous, doc([]));
    expect(result.removedTaskIds?.slice().sort()).toEqual(['a', 'b', 'x']);
  });

  it('keeps tombstones when nothing was dropped', () => {
    const previous: DailyDocument = { ...doc([task('a')]), removedTaskIds: ['x'] };
    expect(applyMarkdownEdit(previous, doc([task('a')])).removedTaskIds).toEqual(['x']);
  });

  it('does not tombstone ids that are still present, and omits an empty list', () => {
    expect(applyMarkdownEdit(doc([task('a')]), doc([task('a')])).removedTaskIds).toBeUndefined();
  });
});

describe('replaceTaskInDocument', () => {
  it('swaps only that task', () => {
    const d = doc([task('a', 'A'), task('b', 'B')]);
    const done = { ...task('b', 'B'), status: 'done' };
    const next = replaceTaskInDocument({ ...d, headings: [{ ...d.headings[0], items: [task('a', 'A renamed'), done] }] }, task('b', 'B'));
    expect(next.headings[0].items.map((t) => `${t.title}:${t.status}`)).toEqual(['A renamed:in-progress', 'B:in-progress']);
  });
});
