import { describe, expect, it } from 'vitest';
import { HabitData } from '../types/daymark';
import { DEFAULT_SETTINGS } from '../utils/defaultData';
import { uneditedRecoveredHabits } from '../utils/habits';
import { canonicalJson } from './merge';
import { SyncRequest } from './protocol';
import { applySyncOutcome, fromEntities, syncOnce, SyncState, toEntities, VaultData } from './syncClient';

const habits: HabitData = {
  habits: [{ id: 'water', name: 'Water', order: 1, warnAfterDays: 3, addedOn: '2026-10-23', updatedAt: '2026-10-24T08:00:00Z' }],
  days: [{ date: '2026-10-23', ticks: { water: { done: true, at: '2026-10-23T08:00:00Z' } } },
    { date: '2026-10-24', ticks: { water: { done: false, at: '2026-10-24T08:00:00Z' } } }],
};
const vault: VaultData = { docs: [{ date: '2026-10-24', type: 'daily', headings: [], updatedAt: '2026-10-24T08:00:00Z' }],
  notes: [], settings: DEFAULT_SETTINGS, habits };
const state: SyncState = { serverUrl: 'https://daymark.test', username: 'admin', deviceId: 'device', deviceName: 'test',
  lastRev: 0, bases: {}, lastSyncAt: null };

it('toEntities/fromEntities round-trip habits', () => {
  const map = toEntities({ ...vault, habits: { ...habits, days: [...habits.days].reverse() } });
  expect(map.get('habits')).toEqual({ habits: habits.habits });
  expect(map.get('habitday:2026-10-24')).toEqual(habits.days[1]);
  expect(fromEntities(map, DEFAULT_SETTINGS)).toEqual(vault);
  expect(fromEntities(new Map(), DEFAULT_SETTINGS).habits).toEqual({ habits: [], days: [] });
});

describe('older server fallback', () => {
  it.each(['Invalid entity key in sync request.'])('retries without habit keys on %s', async (error) => {
    const calls: SyncRequest[] = [];
    const bases = { habits: canonicalJson({ habits: [] }), 'habitday:2026-10-22': canonicalJson({ date: '2026-10-22', ticks: {} }) };
    const outcome = await syncOnce(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as SyncRequest;
      calls.push(body);
      if (body.changes.some((c) => c.key.startsWith('habit'))) return Response.json({ error }, { status: 400 });
      return Response.json({ rev: 1, entities: body.changes.map((c) => ({ key: c.key, value: c.value, rev: 1 })), conflicts: [] });
    }, vault, { ...state, bases }, 'access');
    expect(calls).toHaveLength(2);
    expect(calls[0].features).toEqual(['habits']);
    expect(calls[1].changes.some((c) => c.key.startsWith('habit'))).toBe(false);
    expect(calls[1].changes.some((c) => c.key === 'doc:2026-10-24')).toBe(true);
    expect(outcome.habitsUnsupported).toBe(true);
    expect(outcome.state.bases.habits).toBe(bases.habits);
    expect(outcome.state.bases['habitday:2026-10-22']).toBe(bases['habitday:2026-10-22']);
    expect(applySyncOutcome(vault, outcome).habits).toEqual(habits);
  });
  it('surfaces Invalid value for habitday errors without retry or habitsUnsupported', async () => {
    let calls = 0;
    const error = 'Invalid value for habitday:2026-10-24.';
    const pending = syncOnce(async (_url, init) => {
      calls++;
      const body = JSON.parse(String(init?.body)) as SyncRequest;
      if (body.changes.some((c) => c.key.startsWith('habit'))) return Response.json({ error }, { status: 400 });
      return Response.json({ rev: 1, entities: [], conflicts: [] });
    }, vault, state, 'access');
    await expect(pending).rejects.toMatchObject({ status: 400, message: error });
    await expect(pending).rejects.not.toHaveProperty('habitsUnsupported');
    expect(calls).toBe(1);
  });
  it('does not retry unrelated errors or retry more than once', async () => {
    let calls = 0;
    await expect(syncOnce(async () => { calls++; return Response.json({ error: 'Invalid entity key' }, { status: 400 }); }, vault, state, 'access')).rejects.toMatchObject({ status: 400 });
    expect(calls).toBe(2);
    calls = 0;
    await expect(syncOnce(async () => { calls++; return Response.json({ error: 'Invalid value for settings.' }, { status: 400 }); }, vault, state, 'access')).rejects.toMatchObject({ status: 400 });
    expect(calls).toBe(1);
  });
});

it('keeps local ticks made while sync was in flight', async () => {
  const outcome = await syncOnce(async () => Response.json({ rev: 1, conflicts: [], entities: [
    { key: 'habits', rev: 1, value: { habits: habits.habits } },
    { key: 'habitday:2026-10-23', rev: 1, value: habits.days[0] },
    { key: 'habitday:2026-10-24', rev: 1, value: { date: '2026-10-24', ticks: { reading: { done: true, at: '2026-10-24T09:00:00Z' } } } },
  ] }), vault, state, 'access');
  const changed = { ...vault, habits: { ...habits, days: [habits.days[0], { date: '2026-10-24', ticks: { water: { done: true, at: '2026-10-24T10:00:00Z' } } }] } };
  expect(applySyncOutcome(changed, outcome).habits.days[1].ticks).toEqual({
    water: { done: true, at: '2026-10-24T10:00:00Z' }, reading: { done: true, at: '2026-10-24T09:00:00Z' },
  });
});

it('preserves recovered local-only habits and ticks when a different day is edited during backfill', async () => {
  const localHabit = { ...habits.habits[0], id: 'reading', name: 'Reading' };
  const localTick = { done: true, at: '2026-10-23T09:00:00Z' };
  const recovered: VaultData = { ...vault, habits: {
    habits: [...habits.habits, localHabit],
    days: [{ ...habits.days[0], ticks: { ...habits.days[0].ticks, reading: localTick } }, habits.days[1]],
  } };
  uneditedRecoveredHabits.add(recovered.habits);
  let respond!: (response: Response) => void;
  const requests: SyncRequest[] = [];
  const pending = syncOnce(async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Promise<Response>(resolve => { respond = resolve; });
  }, recovered, state, 'access');
  const editedTick = { done: true, at: '2026-10-24T10:00:00Z' };
  const edited: VaultData = { ...recovered, habits: { ...recovered.habits,
    days: [recovered.habits.days[0], { ...habits.days[1], ticks: { water: editedTick } }],
  } };
  respond(Response.json({ rev: 3, conflicts: [], entities: [
    { key: 'habits', rev: 1, value: { habits: habits.habits } },
    ...habits.days.map((day, index) => ({ key: `habitday:${day.date}`, rev: index + 2, value: day })),
  ] }));
  const outcome = await pending;
  const merged = applySyncOutcome(edited, outcome);
  expect(merged.habits.habits).toContainEqual(localHabit);
  expect(merged.habits.days[0].ticks.reading).toEqual(localTick);
  expect(merged.habits.days[1].ticks.water).toEqual(editedTick);
  expect(requests[0].changes.some(change => change.key.startsWith('habit'))).toBe(false);
  await syncOnce(async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({ rev: 4, entities: [], conflicts: [] });
  }, merged, outcome.state, 'access');
  expect(requests[1].changes).toEqual(expect.arrayContaining([
    expect.objectContaining({ key: 'habits', value: { habits: expect.arrayContaining([localHabit]) } }),
    expect.objectContaining({ key: 'habitday:2026-10-23', value: expect.objectContaining({ ticks: expect.objectContaining({ reading: localTick }) }) }),
    expect.objectContaining({ key: 'habitday:2026-10-24', value: expect.objectContaining({ ticks: { water: editedTick } }) }),
  ]));
});

it('backfills habits once and clears the marker after fallback', async () => {
  const calls: SyncRequest[] = [];
  const fetcher = async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as SyncRequest;
    calls.push(body);
    return Response.json({ rev: 99, entities: [], conflicts: [] });
  };
  const first = await syncOnce(fetcher, vault, { ...state, lastRev: 90 }, 'access');
  expect(calls[0].sinceRev).toBe(0);
  expect(first.state.habitsSynced).toBe(true);
  await syncOnce(fetcher, vault, first.state, 'access');
  expect(calls[1].sinceRev).toBe(99);
  let rejected = false;
  const fallback = await syncOnce(async (url, init) => {
    if (!rejected) { rejected = true; return Response.json({ error: 'Invalid entity key' }, { status: 400 }); }
    return fetcher(url, init);
  }, vault, first.state, 'access');
  expect(fallback.state.habitsSynced).toBe(false);
  const disabled = await syncOnce(fetcher, vault, first.state, 'access', true);
  expect(disabled.state.habitsSynced).toBe(false);
  await syncOnce(fetcher, vault, fallback.state, 'access');
  expect(calls.at(-1)!.sinceRev).toBe(0);
});
