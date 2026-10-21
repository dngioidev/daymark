import { describe, expect, it } from 'vitest';
import { DailyDocument, TaskItem } from '../types/daymark';
import { removeTaskFromDocument, restoreTaskToDocument } from './taskActions';

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
