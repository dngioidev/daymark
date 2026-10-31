import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TaskItem } from '../../types/daymark';
import { SyncRequest } from '../protocol';
import { Device, startSyncRig } from './devices';

let rig: Awaited<ReturnType<typeof startSyncRig>>;
beforeEach(async () => { rig = await startSyncRig(); });
afterEach(async () => {
  vi.restoreAllMocks();
  await rig?.stop();
});

const task: TaskItem = {
  id: 'new-task', title: 'From device a', status: 'in-progress',
  createdDate: '2026-10-24', originalNoteDate: '2026-10-24',
  heading: 'Work', order: 1, historyLog: [],
};
function addTask(device: Device) {
  device.edit(v => ({ ...v, docs: v.docs.map(doc => doc.date === '2026-10-24'
    ? { ...doc, headings: [{ name: 'Work', items: [task], notesContent: '' }] }
    : doc) }));
}
const tasks = (device: Device) => device.vault.docs.flatMap(doc => doc.headings.flatMap(h => h.items));

it('two devices converge on a new task', async () => {
  const a = rig.device('a'), b = rig.device('b');
  addTask(a);
  await a.sync();
  await b.sync();
  expect(tasks(b)).toEqual([task]);
  expect(b.vault.docs).toEqual(a.vault.docs);
  expect((await a.sync()).pushed).toBe(0);
});

it('dropResponse resend does not duplicate', async () => {
  const a = rig.device('a');
  addTask(a);
  const before = structuredClone(a.vault);
  await expect(a.sync({ dropResponse: true })).rejects.toThrow();
  expect(a.vault).toEqual(before);
  // A fresh device must see the write even before the sender retries.
  const b = rig.device('b');
  await b.sync();
  expect(tasks(b)).toEqual([task]);
  expect((await a.sync()).pushed).toBeGreaterThan(0);
  const c = rig.device('c');
  await c.sync();
  expect(tasks(c)).toEqual([task]);
});

it('legacy device never sends or keeps alertDays', async () => {
  const legacy = rig.device('old', { legacy: true });
  legacy.edit(v => ({ ...v, settings: { ...v.settings, alertDays: { tasks: 'weekdays', habits: 'all' } } }));
  const before = structuredClone(legacy.vault);
  const requests: SyncRequest[] = [];
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url).endsWith('/api/sync')) requests.push(JSON.parse(String(init?.body)));
    return realFetch(url, init);
  });
  await legacy.sync();
  const settings = requests[0].changes.find(c => c.key === 'settings')!;
  expect(settings.value).not.toHaveProperty('alertDays');
  expect(settings.value).toHaveProperty('defaultHeadings', before.settings.defaultHeadings);
  expect(before.settings).toHaveProperty('alertDays');
  expect(legacy.vault.settings).not.toHaveProperty('alertDays');

  const modern = rig.device('new');
  await modern.sync();
  modern.edit(v => ({ ...v, settings: { ...v.settings, alertDays: { tasks: 'all', habits: 'all' } } }));
  await modern.sync();
  await legacy.sync();
  expect(legacy.vault.settings).not.toHaveProperty('alertDays');
  legacy.edit(v => ({ ...v, settings: { ...v.settings, defaultHeadings: ['Legacy'] } }));
  await legacy.sync();
  const next = requests.at(-1)!.changes.find(c => c.key === 'settings')!;
  expect(next.base).not.toHaveProperty('alertDays');
  expect(next.value).not.toHaveProperty('alertDays');
});

it('offline sync rejects without making requests or changing the vault', async () => {
  const a = rig.device('a');
  addTask(a);
  a.online = false;
  const before = structuredClone(a.vault);
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  await expect(a.sync()).rejects.toThrow();
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(a.vault).toEqual(before);
  a.online = true;
  await a.sync();
  const b = rig.device('b');
  await b.sync();
  expect(tasks(b)).toEqual([task]);
});

it('restartServer preserves persisted data and existing device sessions', async () => {
  const a = rig.device('a');
  addTask(a);
  await a.sync();
  await rig.restartServer();
  expect((await a.sync()).pushed).toBe(0);
  const b = rig.device('b');
  await b.sync();
  expect(tasks(b)).toEqual([task]);
});

it('devices own independent default vaults', () => {
  const a = rig.device('same'), b = rig.device('same');
  a.vault.settings.defaultHeadings.push('Local');
  a.vault.habits.habits[0].name = 'Changed';
  expect(b.name).toBe('same');
  expect(b.vault.settings.defaultHeadings).not.toContain('Local');
  expect(b.vault.habits.habits[0].name).toBe('Water');
  expect(b.online).toBe(true);
});

it('a task moved on one device and edited on another ends up on one day only', async () => {
  const { moveTaskToDate } = await import('../../utils/taskActions');
  const a = rig.device('a'), b = rig.device('b');
  addTask(a);
  await a.sync();
  await b.sync();
  a.edit(v => ({ ...v, docs: moveTaskToDate(v.docs, 'new-task', '2026-10-24', '2026-10-25', ['Work'], '2026-10-24T09:00:00Z')! }));
  b.edit(v => ({ ...v, docs: v.docs.map(doc => ({ ...doc, headings: doc.headings.map(h => ({ ...h, items: h.items.map(t => ({ ...t, title: 'Edited on b' })) })) })) }));
  await a.sync();
  await b.sync();
  await a.sync();
  for (const device of [a, b]) {
    const copies = device.vault.docs.flatMap(doc => doc.headings.flatMap(h => h.items.filter(t => t.id === 'new-task').map(t => ({ date: doc.date, title: t.title }))));
    expect(copies).toEqual([{ date: '2026-10-25', title: 'Edited on b' }]);
  }
  expect(b.vault.docs).toEqual(a.vault.docs);
});

it.each(['chain', 'return', 'compete', 'carry', 'completion'] as const)('converges after %s move races in either submission order', async scenario => {
  const { moveTaskToDate } = await import('../../utils/taskActions');
  const { performDailyRollover } = await import('../../utils/lifecycleEngine');
  for (const reverse of [false, true]) {
    const a = rig.device(`a-${reverse}`), b = rig.device(`b-${reverse}`);
    // Unique task per order; other tasks remain untouched in the shared rig.
    const id = `race-${scenario}-${reverse}`;
    a.edit(v => ({ ...v, docs: [{ date: '2026-10-24', type: 'daily', updatedAt: '2026-10-24T08:00:00Z', headings: [{ name: 'Work', items: [{ ...task, id }], notesContent: '' }] }] }));
    await a.sync(); await b.sync();
    const move = (device: Device, from: string, to: string, hour: string) => device.edit(v => ({ ...v, docs: moveTaskToDate(v.docs, id, from, to, ['Work'], `2026-10-24T${hour}:00:00Z`)! }));
    move(a, '2026-10-24', '2026-10-25', '09');
    let destination = '2026-10-25';
    if (scenario === 'chain') { move(a, '2026-10-25', '2026-10-26', '10'); destination = '2026-10-26'; }
    if (scenario === 'return') { move(a, '2026-10-25', '2026-10-24', '10'); destination = '2026-10-24'; }
    if (scenario === 'compete') { move(b, '2026-10-24', '2026-10-26', '10'); destination = '2026-10-26'; }
    else b.edit(v => ({ ...v, docs: v.docs.map(d => ({ ...d, headings: d.headings.map(h => ({ ...h, items: h.items.map(t => t.id !== id ? t : { ...t, title: 'Race edit', ...(scenario === 'completion' ? { status: 'done', completedDate: '2026-10-24' } : {}) }) })) })) }));
    if (scenario === 'carry') b.edit(v => ({ ...v, docs: performDailyRollover('2026-10-25', v.docs, v.settings.statuses, ['Work']).updatedDocs }));
    const order = reverse ? [b, a] : [a, b];
    for (let round = 0; round < 3; round++) for (const device of order) await device.sync();
    for (const device of [a, b]) {
      const copies = device.vault.docs.flatMap(d => d.headings.flatMap(h => h.items.filter(t => t.id === id).map(t => ({ date: d.date, task: t }))));
      expect(copies).toEqual([{ date: destination, task: expect.objectContaining({ title: scenario === 'compete' ? task.title : 'Race edit', status: scenario === 'completion' ? 'done' : task.status }) }]);
      expect((await device.sync()).pushed).toBe(0);
    }
    const observer = rig.device(`observer-${reverse}`);
    await observer.sync();
    expect(observer.vault.docs).toEqual(a.vault.docs);
  }
});

it('returns reconciled target keys with new revisions and leaves unchanged docs at their revisions', async () => {
  const { moveTaskToDate } = await import('../../utils/taskActions');
  const a = rig.device('a'), b = rig.device('b');
  addTask(a); await a.sync(); await b.sync();
  const base = structuredClone(b.vault.docs[0]);
  a.edit(v => ({ ...v, docs: moveTaskToDate(v.docs, task.id, '2026-10-24', '2026-10-25', ['Work'], '2026-10-24T09:00:00Z')! }));
  const moved = await a.sync();
  const edited = structuredClone(base); edited.headings[0].items[0].title = 'Edited over HTTP';
  const response = await b.authFetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sinceRev: moved.state.lastRev, features: ['habits', 'backlog', 'notemeta'], changes: [{ key: 'doc:2026-10-24', base, value: edited }] }) });
  expect(response.ok).toBe(true);
  const body = await response.json();
  expect(body.entities.map((e: { key: string }) => e.key).sort()).toEqual(['doc:2026-10-24', 'doc:2026-10-25']);
  expect(body.entities.every((e: { rev: number }) => e.rev > moved.state.lastRev)).toBe(true);
  const unchanged = await b.authFetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sinceRev: body.rev, features: ['habits', 'backlog', 'notemeta'], changes: [] }) });
  expect(await unchanged.json()).toMatchObject({ rev: body.rev, entities: [] });
});

it('keeps a completion made during a pull that receives a remote move', async () => {
  const { moveTaskToDate } = await import('../../utils/taskActions');
  const a = rig.device('a'), b = rig.device('b');
  addTask(a); await a.sync(); await b.sync();
  a.edit(v => ({ ...v, docs: moveTaskToDate(v.docs, task.id, '2026-10-24', '2026-10-25', ['Work'], '2026-10-24T09:00:00Z')! }));
  await a.sync();
  const realFetch = globalThis.fetch;
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const response = await realFetch(url, init);
    if (String(url).endsWith('/api/sync')) {
      b.edit(v => ({ ...v, docs: v.docs.map(d => ({ ...d, headings: d.headings.map(h => ({ ...h, items: h.items.map(t => t.id !== task.id ? t : { ...t, status: 'done', completedDate: '2026-10-24', historyLog: [...t.historyLog, { id: 'hist-done-in-flight', action: 'status_changed', date: '2026-10-24', timestamp: '2026-10-24T10:00:00Z', details: 'Done' }] }) })) })) }));
    }
    return response;
  });
  await b.sync(); spy.mockRestore();
  expect(tasks(b)).toEqual([expect.objectContaining({ status: 'done', completedDate: '2026-10-24' })]);
  expect(b.vault.docs.find(d => d.date === '2026-10-25')!.headings[0].items).toHaveLength(1);
  await b.sync(); await a.sync();
  expect(a.vault.docs).toEqual(b.vault.docs);
});
