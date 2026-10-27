import { expect, it } from 'vitest';
import type { DailyDocument, TaskItem } from '../types/daymark';
import { DEFAULT_SETTINGS } from './defaultData';
import { moveTaskToBacklog, pickBacklogItem, reconcileBacklogVault, visibleBacklog } from './backlog';
import { mergeBacklog, mergeDailyDocument } from '../sync/merge';
import { performDailyRollover } from './lifecycleEngine';
import { isClosedCopy } from './taskActions';

const original: DailyDocument = { date: '2026-10-26', type: 'daily', updatedAt: '2026-10-26T08:00:00Z', headings: [
  { name: 'Work', notesContent: 'Keep this journal', items: [{ id: 'parked', title: 'Original task', status: 'in-progress', createdDate: '2026-10-25', originalNoteDate: '2026-10-25', heading: 'Work', order: 1, historyLog: [] }] },
] };
const park = () => moveTaskToBacklog([structuredClone(original)], { items: [] }, 'parked', original.date, '2026-10-26T09:00:00Z')!;
const taskOn = (docs: DailyDocument[], date: string): TaskItem => docs.find(d => d.date === date)!.headings.flatMap(h => h.items).find(t => t.id === 'parked')!;

it('keeps an offline edited copy as closed history without hiding the parked idea', () => {
  const parked = park();
  const offline = structuredClone(original);
  offline.headings[0].items[0].title = 'Offline edited title';
  offline.headings[0].notesContent = 'Offline journal edit';
  offline.updatedAt = '2026-10-26T10:00:00Z';
  const merged = mergeDailyDocument(original, parked.docs[0], offline).value!;
  const result = reconcileBacklogVault(parked.data, [merged]);
  expect(visibleBacklog(result.backlog).map(i => i.id)).toEqual(['parked']);
  expect(isClosedCopy(taskOn(result.docs, original.date))).toBe(true);
  expect(taskOn(result.docs, original.date).title).toBe('Offline edited title');
  expect(result.docs[0].headings[0].notesContent).toContain('Offline journal edit');
  expect(result.docs).toHaveLength(1);
});

it('closes stale offline rollover copies non-destructively and does not carry them again', () => {
  const parked = park();
  const rolled = performDailyRollover('2026-10-27', [structuredClone(original)], DEFAULT_SETTINGS.statuses).updatedDocs;
  const next = rolled.find(d => d.date === '2026-10-27')!;
  const result = reconcileBacklogVault(parked.data, [...parked.docs, next]);
  expect(visibleBacklog(result.backlog)).toHaveLength(1);
  expect(taskOn(result.docs, next.date)).toMatchObject({ title: 'Original task', movedToBacklogDate: original.date });
  expect(result.docs.find(d => d.date === next.date)!.removedTaskIds).toBeUndefined();
  expect(performDailyRollover('2026-10-28', result.docs, DEFAULT_SETTINGS.statuses).carriedCount).toBe(0);
  expect(reconcileBacklogVault(result.backlog, result.docs).docs).toBe(result.docs);
});

it('preserves both genuine post-park picks, their distinct edits, and subsequent carry', () => {
  const parked = park();
  const first = pickBacklogItem(parked.docs, parked.data, 'parked', '2026-10-27', ['Work'], '2026-10-26T10:00:00Z')!;
  const second = pickBacklogItem(parked.docs, parked.data, 'parked', '2026-10-28', ['Work'], '2026-10-26T11:00:00Z')!;
  taskOn(second.docs, '2026-10-28').title = 'Edited second pick';
  const docs = [...first.docs, ...second.docs.filter(d => d.date === '2026-10-28')];
  const result = reconcileBacklogVault(parked.data, docs);
  expect(result.docs).toBe(docs);
  expect(visibleBacklog(result.backlog)).toHaveLength(0);
  expect(taskOn(result.docs, '2026-10-28').title).toBe('Edited second pick');
  expect(performDailyRollover('2026-10-29', result.docs, DEFAULT_SETTINGS.statuses).carriedCount).toBe(1);
});

it('retains the latest park history when a newer stale backlog edit wins the payload', () => {
  const parked = park();
  const old = { items: [{ ...parked.data.items[0], historyLog: [], title: 'Stale payload', updatedAt: '2026-10-26T08:00:00Z' }] };
  const edited = { items: [{ ...old.items[0], title: 'New category edit', category: 'Home', updatedAt: '2026-10-26T12:00:00Z' }] };
  const merged = mergeBacklog(old, parked.data, edited).value!;
  expect(merged.items[0].title).toBe('New category edit');
  expect(merged.items[0].historyLog?.some(h => h.id === parked.data.items[0].historyLog!.at(-1)!.id)).toBe(true);
  const next = reconcileBacklogVault(merged, [structuredClone(original)]);
  expect(visibleBacklog(next.backlog)).toHaveLength(1);
  expect(isClosedCopy(taskOn(next.docs, original.date))).toBe(true);
});

it('retains an explicit pick marker after its daily task is deleted', () => {
  const parked = park();
  const picked = pickBacklogItem(parked.docs, parked.data, 'parked', '2026-10-27', ['Work'], '2026-10-26T10:00:00Z')!;
  expect(picked.data.items[0].historyLog?.at(-1)?.details).toBe('Picked from backlog');
  const result = reconcileBacklogVault(picked.data, [structuredClone(original)]);
  expect(visibleBacklog(result.backlog)).toHaveLength(0);
  expect(isClosedCopy(taskOn(result.docs, original.date))).toBe(true);
});

it('a later park closes old picked copies while a new pick remains valid with clock skew', () => {
  const parked = park();
  const first = pickBacklogItem(parked.docs, parked.data, 'parked', '2026-10-27', ['Work'], '2026-10-26T10:00:00Z')!;
  const again = moveTaskToBacklog(first.docs, first.data, 'parked', '2026-10-27', '2026-10-26T11:00:00Z')!;
  const stale = reconcileBacklogVault(again.data, first.docs);
  expect(visibleBacklog(stale.backlog)).toHaveLength(1);
  expect(isClosedCopy(taskOn(stale.docs, '2026-10-27'))).toBe(true);
  // This device's wall clock is behind, but its history proves it saw the latest park.
  const picked = pickBacklogItem(again.docs, again.data, 'parked', '2026-10-28', ['Work'], '2026-10-26T09:30:00Z')!;
  const edited = { items: [{ ...again.data.items[0], title: 'Other edit', updatedAt: '2026-10-26T12:00:00Z' }] };
  const merged = mergeBacklog(again.data, picked.data, edited).value!;
  const result = reconcileBacklogVault(merged, picked.docs);
  expect(result.docs).toBe(picked.docs);
  expect(visibleBacklog(result.backlog)).toHaveLength(0);
  expect(taskOn(result.docs, '2026-10-28').status).toBe('in-progress');
});

it('does not crash or overwrite malformed legacy history accepted by the daily-document boundary', () => {
  const parked = park();
  const legacy = structuredClone(original);
  Object.assign(legacy.headings[0].items[0], { historyLog: 'legacy history text' });
  const result = reconcileBacklogVault(parked.data, [legacy]);
  expect(taskOn(result.docs, original.date).historyLog).toBe('legacy history text');
  expect(isClosedCopy(taskOn(result.docs, original.date))).toBe(true);
  expect(visibleBacklog(result.backlog)).toHaveLength(1);
});
