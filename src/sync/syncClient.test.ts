import { describe, expect, it } from 'vitest';
import { HabitData } from '../types/daymark';
import { DEFAULT_SETTINGS } from '../utils/defaultData';
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
