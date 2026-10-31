import { describe, expect, it } from 'vitest';
import type { DailyDocument, TaskItem } from '../types/daymark';
import { mergeDailyDocument, reconcileMovedTasks } from './merge';
import { moveTaskToDate } from '../utils/taskActions';
import { dropStaleCarries, performDailyRollover } from '../utils/lifecycleEngine';
import { DEFAULT_SETTINGS } from '../utils/defaultData';
const D1 = '2026-10-24', D2 = '2026-10-25', D3 = '2026-10-26', D4 = '2026-10-27';
const task: TaskItem = { id: 't', title: 'Original', status: 'in-progress', createdDate: D1, originalNoteDate: D1, heading: 'Work', order: 1, historyLog: [] };
const day = (date: string, t: TaskItem): DailyDocument => ({ date, type: 'daily', updatedAt: `${date}T08:00:00Z`, headings: [{ name: 'Work', items: [t], notesContent: 'Keep journal' }] });
const original = () => [day(D1, structuredClone(task))];
const move = (docs: DailyDocument[], from: string, to: string, hour = '09') => moveTaskToDate(docs, 't', from, to, ['Work'], `${D1}T${hour}:00:00Z`)!;
const copies = (docs: DailyDocument[]) => docs.flatMap(d => d.headings.flatMap(h => h.items.map(t => ({ date: d.date, task: t }))));
function check(docs: DailyDocument[], date: string, title = 'Edited') {
  // These placement cases have an agreed ancestor; no-base policy is tested below.
  const result = reconcileMovedTasks(docs, original());
  expect(copies(result)).toEqual([{ date, task: expect.objectContaining({ id: 't', title }) }]);
  expect(reconcileMovedTasks(result)).toEqual(result);
  expect(reconcileMovedTasks([...docs].reverse(), original()).sort((a,b) => a.date.localeCompare(b.date))).toEqual([...result].sort((a,b) => a.date.localeCompare(b.date)));
  expect(result.every(d => d.headings[0].notesContent === 'Keep journal' || d.headings[0].notesContent === '')).toBe(true);
  return result;
}
describe('move reconciliation edge cases', () => {
  it.each([false, true])('keeps a newer move-in against a no-base removal (tombstone first: %s)', tombstoneFirst => {
    const roundTrip = move(move(original(), D1, D3), D3, D1, '10');
    const tombstone = roundTrip.find(d => d.date === D3)!;
    const later = move(original(), D1, D3, '11').find(d => d.date === D3)!;
    const merged = mergeDailyDocument(null, tombstoneFirst ? tombstone : later, tombstoneFirst ? later : tombstone);
    expect(merged.value!.headings[0].items).toEqual([expect.objectContaining({ id: 't', title: 'Original' })]);
    const docs = reconcileMovedTasks([roundTrip.find(d => d.date === D1)!, merged.value!]);
    expect(copies(docs)).toEqual([{ date: D3, task: expect.objectContaining({ id: 't' }) }]);
  });
  it.each(['09', '10', 'invalid', '2099-01-01T11:00:00Z'])('does not let a non-newer or untrusted move override removal: %s', time => {
    const tombstone = move(move(original(), D1, D3), D3, D1, '10').find(d => d.date === D3)!;
    const incoming = move(original(), D1, D3, '11').find(d => d.date === D3)!;
    incoming.headings[0].items[0].historyLog[0].timestamp = time.length === 2 ? `${D1}T${time}:00:00Z` : time;
    expect(mergeDailyDocument(null, tombstone, incoming, Date.parse(`${D1}T12:00:00Z`)).value!.headings[0].items).toEqual([]);
  });
  it('keeps every moved field against an untouched offline carry, in both orders', () => {
    const moved = move(original(), D1, D3);
    Object.assign(moved[1].headings[0].items[0], { title: 'Renamed after move', status: 'blocked', description: 'Moved details' });
    const carry = performDailyRollover(D2, original(), DEFAULT_SETTINGS.statuses, ['Work']).updatedDocs.find(d => d.date === D2)!;
    for (const docs of [[...moved, carry], [...moved, carry].reverse()]) {
      const result = reconcileMovedTasks(docs);
      expect(copies(result)).toEqual([{ date: D3, task: expect.objectContaining({ title: 'Renamed after move', status: 'blocked', description: 'Moved details' }) }]);
      expect(reconcileMovedTasks(result)).toEqual(result);
    }
  });
  it('reports genuine concurrent stale edits by task and field and prefers moved values', () => {
    const moved = move(original(), D1, D3);
    Object.assign(moved[1].headings[0].items[0], { title: 'Moved title', status: 'blocked' });
    const stale = day(D1, { ...task, title: 'Stale edit', status: 'not-started' });
    const conflicts: string[] = [];
    const result = reconcileMovedTasks([...moved.filter(d => d.date !== D1), stale], [], conflicts);
    expect(copies(result)[0].task).toMatchObject({ title: 'Moved title', status: 'blocked' });
    expect(conflicts.some(c => c.includes('task "t"') && c.includes('title'))).toBe(true);
    expect(conflicts.some(c => c.includes('task "t"') && c.includes('status'))).toBe(true);
  });
  it('reports differences even when a legacy title edit has no history after its carry', () => {
    const moved = move(original(), D1, D3);
    const carry = performDailyRollover(D2, original(), DEFAULT_SETTINGS.statuses, ['Work']).updatedDocs.find(d => d.date === D2)!;
    carry.headings[0].items[0].title = 'Unlogged real edit';
    const conflicts: string[] = [];
    reconcileMovedTasks([...moved, carry], [], conflicts);
    expect(conflicts.some(c => c.includes('task "t"') && c.includes('title'))).toBe(true);
  });
  it('keeps completion on a no-base stale copy and reports the status clash', () => {
    const moved = move(original(), D1, D3);
    const conflicts: string[] = [];
    const result = reconcileMovedTasks([day(D1, { ...task, status: 'done', completedDate: D1 }), moved[1]], [], conflicts);
    expect(copies(result)[0].task).toMatchObject({ status: 'done', completedDate: D1 });
    expect(conflicts.some(c => c.includes('status'))).toBe(true);
  });
  it('accepts a stale edit only when it observed the moved-side edit history, despite skewed clocks', () => {
    const observed = { id: 'edit-1', date: D1, timestamp: `${D1}T12:00:00Z`, action: 'status_changed' as const, details: 'Blocked' };
    const later = { ...observed, id: 'edit-2', timestamp: `${D1}T08:00:00Z`, details: 'Waiting' };
    const moved = move([day(D1, { ...task, status: 'blocked', historyLog: [observed] })], D1, D3);
    const stale = day(D1, { ...task, status: 'waiting', historyLog: [observed, later] });
    const conflicts: string[] = [];
    const result = reconcileMovedTasks([stale, moved[1]], [], conflicts);
    expect(copies(result)[0].task.status).toBe('waiting');
    expect(conflicts.some(c => c.includes('status'))).toBe(true);
  });
  it('follows the whole chain rather than matching only the destination event id', () => {
    const moved = move(move(original(), D1, D2), D2, D3, '10');
    check(moved.map(d => d.date === D1 ? day(D1, { ...task, title: 'Edited' }) : d), D3);
  });
  it('keeps a task moved forward then back, absorbing an intermediate stale edit', () => {
    const moved = move(move(original(), D1, D2), D2, D1, '10');
    check(moved.map(d => d.date === D2 ? day(D2, { ...task, title: 'Edited', historyLog: move(original(), D1, D2)[1].headings[0].items[0].historyLog }) : d), D1);
  });
  it('chooses one live destination for competing moves, independent of document order', () => {
    const a = move(original(), D1, D2), b = move(original(), D1, D3, '10');
    check([a[0], a[1], b[1]], D3, 'Original');
  });
  it('breaks equal-time competing moves deterministically', () => {
    const a = move(original(), D1, D2), b = move(original(), D1, D3);
    check([a[0], a[1], b[1]], D3, 'Original');
  });
  it('merges completion on the old day into the moved task', () => {
    const moved = move(original(), D1, D2);
    const result = check([day(D1, { ...task, title: 'Edited', status: 'done', completedDate: D1 }), moved[1]], D2);
    expect(copies(result)[0].task).toMatchObject({ status: 'done', completedDate: D1 });
  });
  it('folds a stale rollover and its edit into the moved copy, preserving rollover idempotency', () => {
    const moved = move(original(), D1, D3);
    const stale = performDailyRollover(D2, original(), DEFAULT_SETTINGS.statuses, ['Work']).updatedDocs;
    const carry = stale.find(d => d.date === D2)!;
    carry.headings[0].items[0].title = 'Edited';
    const result = check([...moved, carry], D3);
    expect(dropStaleCarries(result)).toEqual(result);
    const rolled = performDailyRollover(D4, result, DEFAULT_SETTINGS.statuses, ['Work']).updatedDocs;
    expect(performDailyRollover(D4, rolled, DEFAULT_SETTINGS.statuses, ['Work']).carriedCount).toBe(0);
    expect(copies(rolled).filter(c => c.date === D4)).toHaveLength(1);
  });
  it('retains legitimate carries that already saw the move', () => {
    const moved = move(original(), D1, D2);
    const rolled = performDailyRollover(D3, moved, DEFAULT_SETTINGS.statuses, ['Work']).updatedDocs;
    expect(reconcileMovedTasks(rolled)).toEqual(rolled);
  });
  it('never removes a sole task even if its recorded destination is missing', () => {
    const moved = move(original(), D1, D2)[1].headings[0].items[0];
    const docs = [day(D1, moved)];
    expect(reconcileMovedTasks(docs)).toEqual(docs);
  });
  it('uses the real base to preserve independent edits on the moved copy', () => {
    const moved = move(original(), D1, D2);
    moved[1].headings[0].items[0].description = 'Edited after moving';
    const result = reconcileMovedTasks([day(D1, { ...task, title: 'Old-day edit' }), moved[1]], original());
    expect(copies(result)).toEqual([{ date: D2, task: expect.objectContaining({ title: 'Old-day edit', description: 'Edited after moving' }) }]);
  });
  it('recognizes a later visit to the same destination as a different move event', () => {
    const once = move(original(), D1, D2);
    const thrice = move(move(once, D2, D1, '10'), D1, D2, '11');
    const stale = day(D1, { ...task, title: 'Edited', historyLog: once[1].headings[0].items[0].historyLog });
    check([stale, thrice.find(d => d.date === D2)!], D2);
  });
  it('preserves independent moved-copy edits when the other branch rolls over', () => {
    const moved = move(original(), D1, D3);
    moved.find(d => d.date === D3)!.headings[0].items[0].description = 'Moved edit';
    const carry = performDailyRollover(D2, original(), DEFAULT_SETTINGS.statuses, ['Work']).updatedDocs.find(d => d.date === D2)!;
    carry.headings[0].items[0].title = 'Carry edit';
    const result = reconcileMovedTasks([...moved, carry], original());
    expect(copies(result)).toEqual([{ date: D3, task: expect.objectContaining({ title: 'Carry edit', description: 'Moved edit' }) }]);
  });
  it('does not collapse distinct visits with the same move id during per-day history merge', () => {
    const event = move(original(), D1, D2)[1].headings[0].items[0].historyLog[0];
    const later = { ...event, timestamp: `${D1}T11:00:00Z`, date: D3, details: `Moved from ${D3} to ${D2}` };
    const result = mergeDailyDocument(day(D2, task), day(D2, { ...task, historyLog: [event] }), day(D2, { ...task, description: 'Second visit', historyLog: [later] }));
    expect(result.value!.headings[0].items[0].historyLog).toEqual([event, later]);
  });
  it('keeps causal move order across repeated reconciliation despite clock skew', () => {
    const moved = move(move(original(), D1, D2, '11'), D2, D3, '09');
    const first = check(moved.map(d => d.date === D1 ? day(D1, { ...task, title: 'Edited' }) : d), D3);
    const again = first.map(d => d.date === D1 ? day(D1, { ...task, title: 'Edited again' }) : d);
    check(again, D3, 'Edited again');
  });
  it('does not let a stale carry reopen a completion when recovery has no base', () => {
    const moved = move(original(), D1, D3);
    const carry = performDailyRollover(D2, original(), DEFAULT_SETTINGS.statuses, ['Work']).updatedDocs.find(d => d.date === D2)!;
    const result = reconcileMovedTasks([day(D1, { ...task, status: 'done', completedDate: D1 }), ...moved.filter(d => d.date !== D1), carry]);
    expect(copies(result)).toEqual([{ date: D3, task: expect.objectContaining({ status: 'done', completedDate: D1 }) }]);
  });
  it('keeps a section edit on the stale device at the winning date', () => {
    const moved = move(original(), D1, D2);
    const stale = day(D1, { ...task, heading: 'Home' });
    stale.headings[0].name = 'Home';
    const result = reconcileMovedTasks([stale, moved[1]], original());
    expect(copies(result)).toEqual([{ date: D2, task: expect.objectContaining({ heading: 'Home' }) }]);
    expect(result.find(d => d.date === D2)!.headings.find(h => h.name === 'Home')!.items).toHaveLength(1);
  });
});
