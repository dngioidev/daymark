import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { StandaloneNote, TaskItem } from '../../types/daymark';
import { MAX_CHANGES_PER_SYNC } from '../protocol';
import { collectChanges, toEntities } from '../syncClient';
import { startSyncRig, type Device } from '../testkit/devices';

const date = '2026-10-24';
const stamp = '2026-10-24T09:00:00Z';
const task = (id: string): TaskItem => ({ id, title: id, status: 'todo', createdDate: date, originalNoteDate: date, heading: 'Work', order: 1, historyLog: [] });
const note = (id: string, content = id): StandaloneNote => ({ id, title: id, content, folder: '', tags: [], createdAt: stamp, updatedAt: stamp });
const tasks = (d: Device) => d.vault.docs[0].headings[0].items;
function editTask(d: Device, id: string, change: Partial<TaskItem>) {
  d.edit(v => ({ ...v, docs: v.docs.map(doc => ({ ...doc, headings: doc.headings.map(h => ({ ...h, items: h.items.map(t => t.id === id ? { ...t, ...change } : t) })) })) }));
}
let rig: Awaited<ReturnType<typeof startSyncRig>>;
let a: Device;
let b: Device;
beforeEach(async () => {
  rig = await startSyncRig(); a = rig.device('A'); b = rig.device('B');
  a.edit(v => ({ ...v, docs: [{ date, type: 'daily', updatedAt: stamp, headings: [{ name: 'Work', items: [task('one'), task('two'), task('three')] }] }] }));
  await a.sync(); await b.sync();
});
afterEach(async () => { vi.restoreAllMocks(); await rig?.stop(); });
async function converge() {
  await a.sync(); await b.sync(); await a.sync();
  expect(a.vault).toEqual(b.vault);
}

it('serializes simultaneous pushes of the same task and different tasks, converging one round later', async () => {
  editTask(a, 'one', { status: 'done', completedDate: date });
  editTask(a, 'two', { title: 'A second task' });
  editTask(b, 'one', { title: 'B shared task' });
  editTask(b, 'three', { title: 'B third task' });
  await Promise.all([a.sync(), b.sync()]);
  await Promise.all([a.sync(), b.sync()]);
  expect(a.vault).toEqual(b.vault);
  expect(tasks(a)).toHaveLength(3);
  expect(tasks(a)).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'one', title: 'B shared task', status: 'done', completedDate: date }),
    expect.objectContaining({ id: 'two', title: 'A second task' }),
    expect.objectContaining({ id: 'three', title: 'B third task' }),
  ]));
});

it('retries a response lost after storage without duplicating or losing a task', async () => {
  a.edit(v => ({ ...v, docs: v.docs.map(doc => ({ ...doc, headings: doc.headings.map(h => ({ ...h, items: [...h.items, task('added')] })) })) }));
  const before = structuredClone(a.vault);
  await expect(a.sync({ dropResponse: true })).rejects.toMatchObject({ status: 0 });
  expect(a.vault).toEqual(before);
  await b.sync(); // Prove storage happened before retrying A.
  expect(tasks(b).filter(t => t.id === 'added')).toHaveLength(1);
  await converge();
  expect(tasks(a).map(t => t.id).sort()).toEqual(['added', 'one', 'three', 'two']);
});

it('merges a device offline across several rounds of the other device', async () => {
  a.online = false;
  editTask(a, 'one', { title: 'Offline A' });
  await expect(a.sync()).rejects.toThrow('offline');
  for (const id of ['first', 'second', 'third']) {
    b.edit(v => ({ ...v, notes: [...v.notes, note(id)] })); await b.sync();
  }
  editTask(b, 'two', { title: 'Online B' }); await b.sync();
  a.online = true;
  await converge();
  expect(tasks(a)).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'one', title: 'Offline A' }), expect.objectContaining({ id: 'two', title: 'Online B' })]));
  expect(a.vault.notes.map(n => n.id).sort()).toEqual(['first', 'second', 'third']);
});

it('gives a third device joining during a pending conflict the eventual merged result', async () => {
  a.edit(v => ({ ...v, notes: [note('shared', 'A text')] }));
  b.edit(v => ({ ...v, notes: [note('shared', 'B text')] }));
  await a.sync(); // B still has an unsubmitted conflicting version.
  const c = rig.device('C'); await c.sync();
  expect(c.vault.notes.map(n => n.content)).toEqual(['A text']);
  const result = await b.sync();
  expect(result.conflicts.length).toBeGreaterThan(0);
  await converge(); await c.sync();
  expect(c.vault).toEqual(a.vault);
  expect(c.vault.notes.map(n => n.content).sort()).toEqual(['A text', 'B text']);
  expect(c.vault.notes.some(n => n.title.endsWith('(conflict copy)'))).toBe(true);
});

it('persists changes and revision history across a server restart between rounds', async () => {
  editTask(a, 'one', { title: 'Before restart' });
  a.edit(v => ({ ...v, notes: [note('persisted')] }));
  const before = await a.sync();
  editTask(b, 'two', { title: 'Pending across restart' });
  await rig.restartServer();
  const after = await b.sync();
  expect(after.state.lastRev).toBeGreaterThan(before.state.lastRev);
  await converge();
  expect(tasks(a)).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'one', title: 'Before restart' }), expect.objectContaining({ id: 'two', title: 'Pending across restart' })]));
  expect(a.vault.notes.map(n => n.id)).toEqual(['persisted']);
  const c = rig.device('After restart'); await c.sync(); expect(c.vault).toEqual(a.vault);
});

it('exchanges every data type with an old-format device in both directions without stripping alertDays', async () => {
  const old = rig.device('Old', { legacy: true }); await old.sync();
  expect(old.vault.settings).not.toHaveProperty('alertDays');
  a.edit(v => ({ ...v, notes: [note('modern')], settings: { ...v.settings, alertDays: { tasks: 'weekdays', habits: 'weekend' } }, habits: { ...v.habits, days: v.habits.days.map(d => ({ ...d, ticks: { water: { done: true, at: stamp } } })) } }));
  editTask(old, 'one', { title: 'Old task' });
  old.edit(v => ({ ...v, settings: { ...v.settings, timeZone: 'Asia/Saigon' }, backlog: { items: [{ id: 'old-idea', title: 'Old idea', order: 1, createdAt: stamp, updatedAt: stamp }] }, notemeta: { folders: [{ path: 'Old folder', updatedAt: stamp }], dismissed: [] } }));
  await a.sync(); await old.sync(); await a.sync();
  expect(a.vault.settings).toMatchObject({ timeZone: 'Asia/Saigon', alertDays: { tasks: 'weekdays', habits: 'weekend' } });
  expect(tasks(a)[0].title).toBe('Old task');
  expect(a.vault.backlog.items[0].title).toBe('Old idea');
  expect(a.vault.notemeta.folders[0].path).toBe('Old folder');
  expect(old.vault.notes.map(n => n.id)).toEqual(['modern']);
  expect(old.vault.habits.days.every(d => d.ticks.water.done)).toBe(true);
  old.edit(v => ({ ...v, notes: [...v.notes, note('legacy')], settings: { ...v.settings, timeZone: 'Europe/Paris' }, habits: { ...v.habits, habits: v.habits.habits.map(h => ({ ...h, name: 'Old habit name', updatedAt: stamp })) } }));
  editTask(a, 'two', { title: 'Modern task' });
  a.edit(v => ({ ...v, backlog: { items: [...v.backlog.items, { id: 'modern-idea', title: 'Modern idea', order: 2, createdAt: stamp, updatedAt: stamp }] }, notemeta: { ...v.notemeta, folders: [...v.notemeta.folders, { path: 'Modern folder', updatedAt: stamp }] } }));
  await old.sync(); await a.sync(); await old.sync(); await a.sync();
  expect(a.vault.settings).toMatchObject({ timeZone: 'Europe/Paris', alertDays: { tasks: 'weekdays', habits: 'weekend' } });
  expect(a.vault.notes.map(n => n.id).sort()).toEqual(['legacy', 'modern']);
  expect(a.vault.habits.habits[0].name).toBe('Old habit name');
  expect(tasks(old)[1].title).toBe('Modern task');
  expect(old.vault.backlog.items.map(i => i.id).sort()).toEqual(['modern-idea', 'old-idea']);
  expect(old.vault.notemeta.folders.map(f => f.path).sort()).toEqual(['Modern folder', 'Old folder']);
  const { alertDays: _ignored, ...settings } = a.vault.settings;
  expect(old.vault).toEqual({ ...a.vault, settings });
  const c = rig.device('New reader'); await c.sync(); expect(c.vault).toEqual(a.vault);
});

it.each([false, true])('refuses an oversized request atomically and recovers smaller pushes (lost first batch response: %s)', async dropResponse => {
  // Capture a real authenticated request without exposing the harness internals.
  const realFetch = globalThis.fetch;
  let syncUrl = '';
  let syncInit: RequestInit = {};
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url).endsWith('/api/sync')) { syncUrl = String(url); syncInit = init!; }
    return realFetch(url, init);
  });
  const seeded = await a.sync(); spy.mockRestore();
  a.edit(v => ({ ...v, notes: Array.from({ length: MAX_CHANGES_PER_SYNC + 1 }, (_, i) => note(`bulk-${i}`)) }));
  const before = structuredClone(a.vault);
  const beforeState = structuredClone(seeded.state);
  const changes = collectChanges(toEntities(a.vault), seeded.state);
  expect(changes).toHaveLength(MAX_CHANGES_PER_SYNC + 1);
  const refused = await realFetch(syncUrl, { ...syncInit, body: JSON.stringify({ sinceRev: seeded.state.lastRev, features: ['habits', 'backlog', 'notemeta'], changes }) });
  expect(refused.status).toBe(413);
  expect(await refused.json()).toMatchObject({ error: expect.stringContaining('Too many changes') });
  expect(a.vault).toEqual(before); expect(seeded.state).toEqual(beforeState);
  const observer = await b.sync();
  expect(observer.state.lastRev).toBe(seeded.state.lastRev);
  expect(b.vault.notes).toEqual([]);
  if (dropResponse) {
    await expect(a.sync({ dropResponse: true })).rejects.toMatchObject({ status: 0 });
    expect(a.vault).toEqual(before);
    await b.sync();
    expect(b.vault.notes).toHaveLength(MAX_CHANGES_PER_SYNC);
  }
  const recovered = await a.sync(); // Must recover without the user removing pending data.
  expect(recovered.pushed).toBe(MAX_CHANGES_PER_SYNC + 1);
  await b.sync(); await a.sync();
  expect(a.vault).toEqual(b.vault);
  expect(a.vault.notes).toHaveLength(MAX_CHANGES_PER_SYNC + 1);
  expect(new Set(a.vault.notes.map(n => n.id)).size).toBe(MAX_CHANGES_PER_SYNC + 1);
  expect(a.vault.notes.every(n => n.content === n.id)).toBe(true);
  expect((await a.sync()).pushed).toBe(0);
}, 30000);
