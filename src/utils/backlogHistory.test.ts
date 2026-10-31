import { expect, it } from 'vitest';
import type { TaskHistoryItem } from '../types/daymark';
import { mergeBacklogHistory } from './backlogHistory';
import { mergeDailyDocument } from '../sync/merge';

const first: TaskHistoryItem = { id: 'hist-move-X-2026-10-26', timestamp: '2026-10-24T09:00:00Z', date: '2026-10-24', action: 'moved', details: 'Moved to 2026-10-26' };
it.each([
  { ...first, timestamp: '2026-10-24T11:00:00Z' },
  { ...first, date: '2026-10-25' },
])('retains distinct move events sharing an id: %j', second => {
  for (const histories of [[[first], [second]], [[second], [first]]]) {
    const merged = mergeBacklogHistory(...histories)!;
    expect(merged).toHaveLength(2);
    expect(merged).toEqual(expect.arrayContaining([first, second]));
    expect(mergeBacklogHistory(merged, [first, second])).toHaveLength(2);
  }
});
it('collapses identical move events, regardless of property insertion order', () => {
  const reordered: TaskHistoryItem = { details: first.details, action: first.action, date: first.date, timestamp: first.timestamp, id: first.id };
  expect(mergeBacklogHistory([first, first], [reordered])).toEqual([first]);
});
it('keeps both moves through the no-base task-history merge', () => {
  const second = { ...first, timestamp: '2026-10-24T11:00:00Z', date: '2026-10-25' };
  const day = (event: TaskHistoryItem) => ({ date: '2026-10-26', type: 'daily' as const, updatedAt: event.timestamp,
    headings: [{ name: 'Work', notesContent: '', items: [{ id: 'X', title: 'X', status: 'in-progress', createdDate: '2026-10-24', originalNoteDate: '2026-10-24', heading: 'Work', order: 1, historyLog: [event] }] }] });
  for (const [ours, theirs] of [[first, second], [second, first]]) {
    expect(mergeDailyDocument(null, day(ours), day(theirs)).value!.headings[0].items[0].historyLog).toEqual([first, second]);
  }
});
