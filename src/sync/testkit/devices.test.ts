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
