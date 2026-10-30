import { afterEach, beforeEach, expect, it } from 'vitest';
import type { DailyDocument, TaskItem } from '../../types/daymark';
import { startSyncRig, type Device } from '../testkit/devices';

const date = '2026-10-24';
const early = '2026-10-24T09:00:00Z';
const late = '2026-10-24T10:00:00Z';
const task = (id: string): TaskItem => ({ id, title: id, status: 'todo', createdDate: date, originalNoteDate: date, heading: 'Work', order: 1, historyLog: [] });
const doc = (items: TaskItem[], updatedAt = early): DailyDocument => ({ date, type: 'daily', headings: [{ name: 'Work', items, notesContent: 'Daily journal' }], updatedAt });
const tasks = (device: Device) => device.vault.docs.find(d => d.date === date)!.headings.flatMap(h => h.items);
let rig: Awaited<ReturnType<typeof startSyncRig>>;
let a: Device;
let b: Device;
beforeEach(async () => { rig = await startSyncRig(); a = rig.device('A'); b = rig.device('B'); });
afterEach(async () => { await rig?.stop(); });
async function seed() { a.edit(v => ({ ...v, docs: [doc([task('one'), task('two'), task('three')])] })); await a.sync(); await b.sync(); }
async function converge() {
  await a.sync(); await b.sync(); await a.sync(); await b.sync();
  expect(a.vault.docs).toEqual(b.vault.docs);
}

it('preserves completion and a concurrent title edit', async () => {
  await seed();
  a.edit(v => ({ ...v, docs: [doc(tasks(a).map(t => t.id === 'one' ? { ...t, status: 'done', completedDate: date, statusBeforeDone: 'todo' } : t))] }));
  b.edit(v => ({ ...v, docs: [doc(tasks(b).map(t => t.id === 'one' ? { ...t, title: 'Edited title' } : t), late)] }));
  await converge();
  expect(tasks(a)).toHaveLength(3);
  expect(tasks(a).find(t => t.id === 'one')).toMatchObject({ title: 'Edited title', status: 'done', completedDate: date, statusBeforeDone: 'todo' });
});

it('preserves a task edited against concurrent deletion', async () => {
  await seed();
  a.edit(v => ({ ...v, docs: [{ ...doc(tasks(a).filter(t => t.id !== 'one')), removedTaskIds: ['one'] }] }));
  b.edit(v => ({ ...v, docs: [doc(tasks(b).map(t => t.id === 'one' ? { ...t, title: 'Edited title' } : t), late)] }));
  await converge();
  expect(tasks(a).map(t => t.id).sort()).toEqual(['one', 'three', 'two']);
  expect(tasks(a).find(t => t.id === 'one')?.title).toBe('Edited title');
  expect(a.vault.docs[0].removedTaskIds ?? []).not.toContain('one');
});

it('converges concurrent task reorders without loss or duplicates', async () => {
  await seed();
  a.edit(v => ({ ...v, docs: [doc(['two', 'one', 'three'].map((id, i) => ({ ...task(id), order: i + 1 })))] }));
  b.edit(v => ({ ...v, docs: [doc(['three', 'two', 'one'].map((id, i) => ({ ...task(id), order: i + 1 })), late)] }));
  await converge();
  expect(tasks(a).map(t => t.id).sort()).toEqual(['one', 'three', 'two']);
  expect(tasks(a).every(t => t.title === t.id)).toBe(true);
});

it('unions tasks when a daily document is first created on both devices', async () => {
  a.edit(v => ({ ...v, docs: [doc([task('from-a')])] }));
  b.edit(v => ({ ...v, docs: [doc([task('from-b')], late)] }));
  await converge();
  expect(tasks(a).map(t => t.id).sort()).toEqual(['from-a', 'from-b']);
});

it('restores a correct-clock backlog undo against a future removal stamp and accepts later edits', async () => {
  const future = '2027-10-24T09:00:00Z';
  a.edit(v => ({ ...v, docs: [{ ...doc([], future), removedTaskIds: ['one'] }] }));
  const restored = { ...task('one'), historyLog: [{ id: 'hist-backlog-undo:park-one', action: 'moved' as const, date, timestamp: late, details: 'Undid move to backlog' }] };
  b.edit(v => ({ ...v, docs: [doc([restored], late)] }));
  await converge();
  expect(tasks(a)).toHaveLength(1);
  expect(tasks(a)[0]).toMatchObject({ id: 'one', status: 'todo', historyLog: restored.historyLog });
  expect(a.vault.docs[0].updatedAt).toBe(late);
  b.edit(v => ({ ...v, docs: [doc([{ ...tasks(b)[0], title: 'After undo' }], '2026-10-24T11:00:00Z')] }));
  await converge();
  expect(tasks(a)[0].title).toBe('After undo');
  expect(a.vault.docs[0].updatedAt).toBe('2026-10-24T11:00:00Z');
});
