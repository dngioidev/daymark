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

it('clears an omitted optional field and unions backlog history without a conflict', () => {
  const history = (id: string, timestamp: string): TaskHistoryItem => ({ id, timestamp, date: '2026-10-24', action: 'moved', details: 'Moved to backlog' });
  const { description: _description, ...legacy } = item;
  const result = mergeBacklog({ items: [item] },
    { items: [{ ...legacy, title: 'Renamed', historyLog: [history('a', early)], updatedAt: late }] },
    { items: [{ ...item, category: 'Home', historyLog: [history('b', late)], updatedAt: early }] });
  expect(result.value?.items[0]).toMatchObject({ title: 'Renamed', category: 'Home' });
  expect(result.value?.items[0]).not.toHaveProperty('description');
  expect(result.value?.items[0].historyLog?.map(event => event.id)).toEqual(['a', 'b']);
  expect(result.conflicts).toEqual([]);
});

it('clears pickedOn while retaining an independent title edit in either argument order', () => {
  const base = { items: [{ ...item, pickedOn: '2026-10-23' }] };
  const cleared = { items: [{ ...item, updatedAt: early }] };
  const edited = { items: [{ ...base.items[0], title: 'Edited idea', updatedAt: late }] };
  for (const [mine, incoming] of [[cleared, edited], [edited, cleared]]) {
    const result = mergeBacklog(base, mine, incoming);
    expect(result.value?.items[0]).toMatchObject({ title: 'Edited idea', updatedAt: late });
    expect(result.value?.items[0]).not.toHaveProperty('pickedOn');
    expect(result.conflicts).toEqual([]);
  }
});

it('clears an existing habit removal while retaining an independent rename in either order', () => {
  const base = { habits: [{ ...habit, removedOn: '2026-10-23' }] };
  const cleared = { habits: [{ ...habit, updatedAt: early }] };
  const edited = { habits: [{ ...base.habits[0], name: 'Renamed', updatedAt: late }] };
  for (const [mine, incoming] of [[cleared, edited], [edited, cleared]]) {
    const result = mergeHabitList(base, mine, incoming);
    expect(result.value?.habits[0]).toMatchObject({ name: 'Renamed', updatedAt: late });
    expect(result.value?.habits[0]).not.toHaveProperty('removedOn');
    expect(result.conflicts).toEqual([]);
  }
});

it.each([early, late])('resolves clearing versus changing the same optional field by timestamp (clear at %s)', clearAt => {
  const editAt = clearAt === late ? early : late;
  const backlogBase = { items: [{ ...item, pickedOn: '2026-10-23' }] };
  const backlogCleared = { items: [{ ...item, updatedAt: clearAt }] };
  const backlogChanged = { items: [{ ...item, pickedOn: '2026-10-24', updatedAt: editAt }] };
  const habitBase = { habits: [{ ...habit, removedOn: '2026-10-23' }] };
  const habitCleared = { habits: [{ ...habit, updatedAt: clearAt }] };
  const habitChanged = { habits: [{ ...habit, removedOn: '2026-10-24', updatedAt: editAt }] };
  for (const swap of [false, true]) {
    const backlog = mergeBacklog(backlogBase, swap ? backlogChanged : backlogCleared, swap ? backlogCleared : backlogChanged);
    const habits = mergeHabitList(habitBase, swap ? habitChanged : habitCleared, swap ? habitCleared : habitChanged);
    expect(backlog.value?.items[0].pickedOn).toBe(clearAt === late ? undefined : '2026-10-24');
    expect(habits.value?.habits[0].removedOn).toBe(clearAt === late ? undefined : '2026-10-24');
    expect(backlog.conflicts).toHaveLength(1);
    expect(habits.conflicts).toHaveLength(1);
  }
});

it('keeps the newer habit and backlog conflicts independent of argument order', () => {
  const habitOlder = { habits: [{ ...habit, name: 'Older', updatedAt: early }] };
  const habitNewer = { habits: [{ ...habit, name: 'Newer', updatedAt: late }] };
  const backlogOlder = { items: [{ ...item, title: 'Older', updatedAt: early }] };
  const backlogNewer = { items: [{ ...item, title: 'Newer', updatedAt: late }] };
  const firstHabit = mergeHabitList({ habits: [habit] }, habitOlder, habitNewer);
  const swappedHabit = mergeHabitList({ habits: [habit] }, habitNewer, habitOlder);
  const firstBacklog = mergeBacklog({ items: [item] }, backlogOlder, backlogNewer);
  const swappedBacklog = mergeBacklog({ items: [item] }, backlogNewer, backlogOlder);
  expect(firstHabit.value?.habits[0].name).toBe('Newer');
  expect(firstBacklog.value?.items[0].title).toBe('Newer');
  expect(swappedHabit.value).toEqual(firstHabit.value);
  expect(swappedBacklog.value).toEqual(firstBacklog.value);
  for (const result of [firstHabit, swappedHabit, firstBacklog, swappedBacklog]) expect(result.conflicts).toHaveLength(1);
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

it('keeps incoming tie winners stable across a second sync round for habits and backlog', async () => {
  const a = rig.device('a');
  const b = rig.device('b');
  a.edit(v => ({ ...v, backlog: { items: [item] } }));
  await a.sync();
  await b.sync();
  for (const [device, name] of [[a, 'A'], [b, 'B']] as const) {
    device.edit(v => ({ ...v,
      habits: { ...v.habits!, habits: [{ ...habit, name, updatedAt: late }] },
      backlog: { items: [{ ...item, title: name, updatedAt: late }] },
    }));
  }
  await a.sync();
  expect((await b.sync()).conflicts).toHaveLength(2);
  await a.sync();
  for (const device of [a, b]) {
    expect(device.vault.habits?.habits[0].name).toBe('B');
    expect(device.vault.backlog?.items[0].title).toBe('B');
  }
  expect((await a.sync()).conflicts).toEqual([]);
  expect((await b.sync()).conflicts).toEqual([]);
  for (const device of [a, b]) {
    expect(device.vault.habits?.habits[0].name).toBe('B');
    expect(device.vault.backlog?.items[0].title).toBe('B');
  }
  expect(a.vault.habits).toEqual(b.vault.habits);
  expect(a.vault.backlog).toEqual(b.vault.backlog);
});

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
