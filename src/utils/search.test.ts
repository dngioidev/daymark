import { expect, it } from 'vitest';
import type { DailyDocument, StandaloneNote, TaskItem } from '../types/daymark';
import { searchVault } from './search';

const task = (id: string, title = 'Pipeline', status = 'in-progress'): TaskItem => ({ id, title, status, createdDate: '2026-10-20', originalNoteDate: '2026-10-20', heading: 'Work', order: 0, historyLog: [] });
const doc = (date: string, items: TaskItem[], removedTaskIds: string[] = []): DailyDocument => ({ date, type: 'daily', updatedAt: '', headings: [{ name: 'Work', items }], removedTaskIds });
const note: StandaloneNote = { id: 'n1', title: 'Release', content: 'A **PIPELINE** checklist', folder: 'Work', tags: [], createdAt: '', updatedAt: '' };

it('returns only the newest copy per task id, regardless of input order', () => {
  const docs = [doc('2026-10-20', [task('t1')]), doc('2026-10-21', [task('t1', 'Pipeline v2')])];
  expect(searchVault(docs, [], 'pipeline')).toEqual([{ kind: 'task', taskId: 't1', date: '2026-10-21', title: 'Pipeline v2', status: 'in-progress', archived: false }]);
});
it('does not match stale titles or resurrect deleted tasks, but includes archived tasks', () => {
  const docs = [doc('2026-10-20', [task('deleted'), task('renamed')]), doc('2026-10-21', [task('renamed', 'Other'), task('archive', 'Pipeline', 'archived')], ['deleted'])];
  expect(searchVault(docs, [], 'PIPELINE')).toEqual([expect.objectContaining({ taskId: 'archive', archived: true })]);
});
it('keeps a future moved copy despite the source tombstone', () => {
  expect(searchVault([doc('2026-10-20', [], ['t1']), doc('2026-10-25', [task('t1')])], [], 'pipeline')).toHaveLength(1);
});
it('matches note titles and content with a plain text snippet', () => {
  expect(searchVault([], [note], ' pipeline ')).toEqual([{ kind: 'note', noteId: 'n1', title: 'Release', snippet: 'A PIPELINE checklist' }]);
  expect(searchVault([], [note], 'release')).toHaveLength(1);
});
it('ignores blank queries and applies default and explicit limits', () => {
  const docs = [doc('2026-10-21', Array.from({ length: 25 }, (_, i) => task(`${i}`)))];
  expect(searchVault(docs, [note], '  ')).toEqual([]);
  expect(searchVault(docs, [note], 'pipeline')).toHaveLength(20);
  expect(searchVault(docs, [note], 'pipeline', 2)).toHaveLength(2);
  expect(searchVault(docs, [note], 'pipeline', 0)).toEqual([]);
});
