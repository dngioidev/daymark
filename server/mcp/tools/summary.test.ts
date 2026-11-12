import { expect, it } from 'vitest';
import type { DailyDocument, HabitData, TaskItem } from '../../../src/types/daymark';
import { DEFAULT_SETTINGS } from '../../../src/utils/defaultData';
import { NO_GRANTS } from '../../../src/sync/mcpProtocol';
import { scopeDoc } from '../scope';
import { buildDaySummary, buildReview } from './summary';

const date = '2026-11-12';
const task = (id: string, status = 'in-progress', createdDate = date): TaskItem => ({
  id, title: id, status, createdDate, originalNoteDate: createdDate, heading: 'Work', order: Number(id) || 0, historyLog: [],
});
const doc = (items: TaskItem[]): DailyDocument => ({ date, type: 'daily', updatedAt: `${date}T00:00:00Z`, headings: [{ name: 'Work', items }] });
const summary = (document: DailyDocument, habits: HabitData | null = null) => buildDaySummary({ doc: document, date, settings: DEFAULT_SETTINGS, habits, backlog: null });

it('spoken line for a typical day', () => {
  const habits: HabitData = {
    habits: ['a', 'b', 'c'].map((id, order) => ({ id, name: id, order, addedOn: date, updatedAt: '', warnAfterDays: 3 })),
    days: [{ date, ticks: { a: { done: true, at: '' } } }],
  };
  const result = summary(doc([task('1'), task('2', 'blocked'), task('3', 'in-progress', '2026-11-08'), task('4', 'in-progress', '2026-11-01'), task('5'), task('6', 'done'), task('7', 'done')]), habits);
  expect(result.spoken).toBe('5 open tasks: 1 blocked, 2 getting old. 2 done so far. Habits: 1 of 3.');
  expect(result.sections[0].open.map(t => t.id)).toEqual(['2', '4', '3', '1', '5']);
});

it('zero clauses are dropped', () => {
  expect(summary(doc([])).spoken).toBe('No open tasks. Nothing done yet.');
  expect(summary(doc([task('1')])).spoken).toBe('1 open task. Nothing done yet.');
});

it('summary counts only granted headings', () => {
  const document = doc([task('1')]);
  document.headings.push({ name: 'Personal', items: [task('secret', 'done')] });
  expect(summary(scopeDoc(document, { ...NO_GRANTS, headings: ['Work'] })!).counts).toEqual({ open: 1, done: 0, blocked: 0, aging: 0 });
});

it("review counts a task's copies only in granted headings", () => {
  const first = { ...doc([task('1')]), date: '2026-11-11' };
  first.headings[0].items[0].createdDate = '2026-11-11';
  const last = doc([]);
  last.headings.push({ name: 'Personal', items: [{ ...task('1', 'done'), completedDate: date }, task('secret', 'done')] });
  const docs = [first, last].map(d => scopeDoc(d, { ...NO_GRANTS, headings: ['Work'] })!);
  expect(buildReview({ docs, notes: [], from: '2026-11-11', to: date, habits: null, settings: DEFAULT_SETTINGS })).toMatchObject({ done: 0, created: 1, carried: 0, habitStreaks: null });
});

it('review deduplicates carried copies and counts effective completion dates', () => {
  const first = { ...doc([{ ...task('1', 'done', '2026-11-11'), doneLaterDate: date }]), date: '2026-11-11' };
  const last = doc([{ ...task('1', 'done', '2026-11-11'), carriedFromDate: '2026-11-11', completedDate: date }]);
  expect(buildReview({ docs: [first, last], notes: [], from: '2026-11-11', to: date, habits: null, settings: DEFAULT_SETTINGS })).toMatchObject({ done: 1, created: 1, carried: 1, agingOpen: [] });
});

it('summary excludes notes and closed copies and reports picks for its date', () => {
  const document = doc([task('note', 'note'), task('archived', 'archived'), { ...task('closed', 'done'), doneLaterDate: date }, { ...task('parked', 'done'), movedToBacklogDate: date }]);
  const before = structuredClone(document);
  const result = buildDaySummary({ doc: document, date, settings: DEFAULT_SETTINGS, habits: { habits: [], days: [] }, backlog: { items: [
    { id: 'picked', title: 'Picked', order: 1, createdAt: '', updatedAt: '', pickedOn: date },
    { id: 'other', title: 'Other', order: 2, createdAt: '', updatedAt: '', pickedOn: '2026-11-11' },
  ] } });
  expect(result.counts).toEqual({ open: 0, done: 0, blocked: 0, aging: 0 });
  expect(result.spoken).toBe('No open tasks. Nothing done yet.');
  expect(result.backlogPicked).toEqual([{ id: 'picked', title: 'Picked' }]);
  expect(document).toEqual(before);
});

it('review reports aging, habit streaks and only notes touched in the period', () => {
  const habits: HabitData = { habits: [{ id: 'h', name: 'Read', addedOn: '2026-11-11', order: 0, warnAfterDays: 3, updatedAt: '' }],
    days: ['2026-11-11', date].map(date => ({ date, ticks: { h: { done: true, at: '' } } })) };
  const result = buildReview({ docs: [doc([task('old', 'in-progress', '2026-11-01')])], notes: [
    { id: 'n', title: 'Touched', folder: 'Work', content: '', tags: [], createdAt: '', updatedAt: `${date}T00:00:00Z` },
    { id: 'old', title: 'Old note', folder: 'Work', content: '', tags: [], createdAt: '', updatedAt: '2026-10-01T00:00:00Z' },
  ], from: '2026-11-11', to: date, habits, settings: DEFAULT_SETTINGS });
  expect(result).toMatchObject({ created: 0, agingOpen: [{ id: 'old', title: 'old', ageDays: 11 }], habitStreaks: [{ name: 'Read', streak: 2 }], notesTouched: [{ id: 'n', title: 'Touched' }] });
});
