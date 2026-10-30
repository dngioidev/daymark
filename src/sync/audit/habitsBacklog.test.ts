import { afterEach, beforeEach, expect, it } from 'vitest';
import type { BacklogItem, Habit, TaskHistoryItem } from '../../types/daymark';
import { pickBacklogItem } from '../../utils/backlog';
import { mergeBacklog, mergeHabitList } from '../merge';
import { startSyncRig } from '../testkit/devices';

const early = '2026-10-24T09:00:00Z';
const late = '2026-10-24T10:00:00Z';
const habit: Habit = { id: 'water', name: 'Water', order: 1, warnAfterDays: 3, addedOn: '2026-10-23', updatedAt: '2026-10-24T08:00:00Z' };
const item: BacklogItem = { id: 'idea', title: 'Idea', description: 'Original note', order: 1, createdAt: early, updatedAt: early };

it('combines habit fields without treating updatedAt as a user conflict', () => {
  const result = mergeHabitList({ habits: [habit] },
    { habits: [{ ...habit, name: 'Drink water', updatedAt: early }] },
    { habits: [{ ...habit, warnAfterDays: 5, updatedAt: late }] });
  expect(result.value?.habits[0]).toMatchObject({ name: 'Drink water', warnAfterDays: 5, updatedAt: late });
  expect(result.conflicts).toEqual([]);
});

it.each([[late, early, 'Mine'], [early, late, 'Incoming'], [late, '2026-10-24T10:00:00.000Z', 'Incoming']])(
  'resolves conflicting backlog fields by timestamp (%s, %s)', (mineAt, incomingAt, title) => {
    const result = mergeBacklog({ items: [item] },
      { items: [{ ...item, title: 'Mine', description: 'Mine note', updatedAt: mineAt }] },
      { items: [{ ...item, title: 'Incoming', description: 'Incoming note', updatedAt: incomingAt }] });
    expect(result.value?.items[0]).toMatchObject({ title, description: `${title} note` });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toContain('Incoming');
  });

it('retains absent optional fields and unions backlog history without a conflict', () => {
  const history = (id: string, timestamp: string): TaskHistoryItem => ({ id, timestamp, date: '2026-10-24', action: 'moved', details: 'Moved to backlog' });
  const { description: _description, ...legacy } = item;
  const result = mergeBacklog({ items: [item] },
    { items: [{ ...legacy, title: 'Renamed', historyLog: [history('a', early)], updatedAt: late }] },
    { items: [{ ...item, category: 'Home', historyLog: [history('b', late)], updatedAt: early }] });
  expect(result.value?.items[0]).toMatchObject({ title: 'Renamed', description: 'Original note', category: 'Home' });
  expect(result.value?.items[0].historyLog?.map(event => event.id)).toEqual(['a', 'b']);
  expect(result.conflicts).toEqual([]);
});

it.each([true, false])('backlog deletion loses to a concurrent edit even with a newer clock (delete mine: %s)', deleteMine => {
  const deleted = { items: [{ ...item, deletedAt: late, updatedAt: late }] };
  const edited = { items: [{ ...item, title: 'Saved edit' }] };
  const result = mergeBacklog({ items: [item] }, deleteMine ? deleted : edited, deleteMine ? edited : deleted);
  expect(result.value?.items[0].title).toBe('Saved edit');
  expect(result.value?.items[0].deletedAt).toBeUndefined();
  expect(result.conflicts).toHaveLength(1);
});

it.each([true, false])('without a base distinguishes a stale copy from an edit against a tombstone (delete mine: %s)', deleteMine => {
  const deleted = { items: [{ ...item, deletedAt: late, updatedAt: late }] };
  for (const [title, deletedAt] of [['Idea', late], ['Offline edit', undefined]] as const) {
    const live = { items: [{ ...item, title }] };
    const result = mergeBacklog(null, deleteMine ? deleted : live, deleteMine ? live : deleted);
    expect(result.value?.items[0]).toMatchObject({ title });
    expect(result.value?.items[0].deletedAt).toBe(deletedAt);
  }
});

let rig: Awaited<ReturnType<typeof startSyncRig>>;
beforeEach(async () => { rig = await startSyncRig(); });
afterEach(async () => { await rig?.stop(); });

// Whole-item LWW loses the older side's independent edit; these also exercise late join and repeat sync.
it.each(['habit fields', 'habit conflict', 'habit removal', 'backlog fields', 'backlog pick', 'offline additions'])(
  'converges through the rig and a third device: %s', async scenario => {
    const a = rig.device('a');
    const b = rig.device('b');
    a.edit(v => ({ ...v, backlog: { items: [item] } }));
    await a.sync();
    await b.sync();
    a.online = b.online = false;
    if (scenario.startsWith('habit')) {
      a.edit(v => ({ ...v, habits: { ...v.habits!, habits: [{ ...habit,
        ...(scenario === 'habit removal' ? { removedOn: '2026-10-24' } : { name: 'Drink water' }), updatedAt: early }] } }));
      b.edit(v => ({ ...v, habits: { ...v.habits!, habits: [{ ...habit,
        ...(scenario === 'habit fields' ? { warnAfterDays: 5 } : { name: 'Incoming name' }), updatedAt: late }] } }));
    } else if (scenario === 'offline additions') {
      a.edit(v => ({ ...v, backlog: { items: [...v.backlog!.items, { ...item, id: 'a', title: 'A idea' }] },
        habits: { ...v.habits!, habits: [...v.habits!.habits, { ...habit, id: 'a', name: 'A habit' }] } }));
      b.edit(v => ({ ...v, backlog: { items: [...v.backlog!.items, { ...item, id: 'b', title: 'B idea' }] },
        habits: { ...v.habits!, habits: [...v.habits!.habits, { ...habit, id: 'b', name: 'B habit' }] } }));
    } else {
      if (scenario === 'backlog pick') {
        a.edit(v => {
          const picked = pickBacklogItem(v.docs, v.backlog!, item.id, '2026-10-24', ['Work'], early)!;
          return { ...v, docs: picked.docs, backlog: picked.data };
        });
      } else a.edit(v => ({ ...v, backlog: { items: [{ ...item, title: 'Edited idea', updatedAt: early }] } }));
      b.edit(v => ({ ...v, backlog: { items: [{ ...item, description: 'Edited note', updatedAt: late }] } }));
    }
    a.online = b.online = true;
    await a.sync();
    const outcome = await b.sync();
    if (scenario === 'habit conflict' || scenario === 'habit removal') {
      expect(outcome.conflicts).toHaveLength(1);
      expect(outcome.conflicts[0]).toContain('Incoming name');
      if (scenario === 'habit removal') expect(outcome.conflicts[0]).toContain('removal');
    } else expect(outcome.conflicts).toEqual([]);
    await a.sync();
    const c = rig.device('c');
    await c.sync();
    await b.sync();
    await c.sync();
    for (const device of [a, b, c]) {
      if (scenario === 'habit fields') expect(device.vault.habits?.habits[0]).toMatchObject({ name: 'Drink water', warnAfterDays: 5 });
      if (scenario === 'habit conflict') expect(device.vault.habits?.habits[0].name).toBe('Incoming name');
      if (scenario === 'habit removal') expect(device.vault.habits?.habits[0]).toMatchObject({ name: 'Water', removedOn: '2026-10-24' });
      if (scenario === 'backlog fields') expect(device.vault.backlog?.items[0]).toMatchObject({ title: 'Edited idea', description: 'Edited note' });
      if (scenario === 'backlog pick') {
        expect(device.vault.backlog?.items[0]).toMatchObject({ pickedOn: '2026-10-24', description: 'Edited note' });
        expect(device.vault.backlog?.items[0].historyLog?.some(event => event.details === 'Picked from backlog')).toBe(true);
        expect(device.vault.docs.flatMap(doc => doc.headings.flatMap(h => h.items)).map(task => task.id)).toContain('idea');
      }
      if (scenario === 'offline additions') {
        expect(device.vault.backlog?.items.map(i => i.id).sort()).toEqual(['a', 'b', 'idea']);
        expect(device.vault.habits?.habits.map(h => h.id).sort()).toEqual(['a', 'b', 'water']);
      }
      expect(device.vault.habits).toEqual(a.vault.habits);
      expect(device.vault.backlog).toEqual(a.vault.backlog);
    }
  });
