import { describe, expect, it } from 'vitest';
import { NoteMeta } from '../types/daymark';
import { DEFAULT_SETTINGS } from '../utils/defaultData';
import { buildFolderTree, createFolder, renameFolder, uneditedRecoveredNoteMeta } from '../utils/noteFolders';
import { canonicalJson, mergeEntity, mergeNoteMeta } from './merge';
import { applySyncOutcome, collectChanges, fromEntities, syncOnce, SyncState, toEntities } from './syncClient';
import { SyncRequest } from './protocol';

const empty: NoteMeta = { folders: [], dismissed: [] };
const early = '2026-10-28T08:00:00Z', late = '2026-10-28T09:00:00Z';
const meta: NoteMeta = { folders: [{ path: 'Tech/Java', updatedAt: early }], dismissed: [{ key: 'a|b', at: early }] };
const vault = { docs: [], notes: [], settings: DEFAULT_SETTINGS, habits: { habits: [], days: [] }, backlog: { items: [] }, notemeta: meta };
const state: SyncState = { serverUrl: 'https://test', username: 'a', deviceId: 'a', deviceName: 'a', lastRev: 99, habitsSynced: true, backlogSynced: true, bases: {}, lastSyncAt: null };
const merge = (base: NoteMeta | null, ours: NoteMeta | null, theirs: NoteMeta | null) => mergeEntity('notemeta', base, ours, theirs).value;

describe('NoteMeta merge', () => {
  it('retains independent folders and dismissals missing on the other side', () => {
    expect(merge(null, meta, { folders: [{ path: 'Empty', updatedAt: late }], dismissed: [] })).toEqual({ ...meta, folders: [...meta.folders, { path: 'Empty', updatedAt: late }] });
  });
  it('uses newest case-insensitive folder records and restores over older tombstones', () => {
    const older = { folders: [{ path: 'tech/java', updatedAt: early, removed: true }], dismissed: meta.dismissed };
    const newer = { folders: [{ path: 'Tech/Java', updatedAt: late }], dismissed: [{ key: 'a|b', at: late, restored: true }] };
    expect(merge(meta, older, newer)).toEqual(newer);
    expect(merge(meta, newer, older)).toEqual(newer);
    expect(merge(meta, newer, { ...older, folders: [{ ...older.folders[0], updatedAt: '2026-10-28T10:00:00Z' }] })).toMatchObject({ folders: [{ removed: true }] });
  });
  it('syncs a real rename without resurrecting the old empty folder', () => {
    const renamed = renameFolder([], meta, 'Tech/Java', 'Tech/Kotlin', late)!.meta;
    const merged = mergeNoteMeta(meta, meta, renamed).value!;
    expect(merged.folders.filter(f => !f.removed).map(f => f.path)).toEqual(['Tech/Kotlin']);
    expect(merged.folders).toContainEqual({ path: 'Tech/Java', updatedAt: late, removed: true });
    expect(buildFolderTree([], merged)[0].children.map(f => f.path)).toEqual(['Tech/Kotlin']);
  });
  it('converges real concurrent renames with one tombstone per source and both destinations', () => {
    const base = createFolder(meta, 'Tech/Java/Empty', early);
    const a = renameFolder([], base, 'Tech/Java', 'Tech/Kotlin', late)!.meta;
    const newest = '2026-10-28T10:00:00Z';
    const b = renameFolder([], base, 'Tech/Java', 'Tech/JVM', newest)!.meta;
    const ab = mergeNoteMeta(base, a, b).value!;
    const ba = mergeNoteMeta(base, b, a).value!;
    expect([...ab.folders].sort((a, b) => a.path.localeCompare(b.path))).toEqual([...ba.folders].sort((a, b) => a.path.localeCompare(b.path)));
    for (const path of ['Tech/Java', 'Tech/Java/Empty']) {
      expect(ab.folders.filter(f => f.path.toLowerCase() === path.toLowerCase())).toEqual([{ path, removed: true, updatedAt: newest }]);
    }
    expect(ab.folders.filter(f => !f.removed).map(f => f.path).sort()).toEqual(['Tech/JVM', 'Tech/JVM/Empty', 'Tech/Kotlin', 'Tech/Kotlin/Empty']);
  });
  it('restores a renamed source recreated later without allowing an older tombstone to remove it', () => {
    const renamed = renameFolder([], meta, 'Tech/Java', 'Tech/Kotlin', late)!.meta;
    const restored = createFolder(renamed, 'tech/java', '2026-10-28T10:00:00Z');
    for (const [ours, theirs] of [[renamed, restored], [restored, renamed]]) {
      const merged = mergeNoteMeta(renamed, ours, theirs).value!;
      expect(merged.folders.find(f => f.path.toLowerCase() === 'tech/java')).toEqual({ path: 'Tech/Java', updatedAt: '2026-10-28T10:00:00Z' });
      expect(buildFolderTree([], merged)[0].children.map(f => f.path)).toEqual(['Tech/Java', 'Tech/Kotlin']);
    }
  });
  it('honours whole deletion only against unchanged data', () => {
    expect(merge(meta, meta, null)).toBeNull();
    expect(merge(meta, null, meta)).toBeNull();
    expect(merge(empty, meta, null)).toEqual(meta);
    expect(merge(empty, null, meta)).toEqual(meta);
  });
});

it('round trips NoteMeta and collects its changes independently', () => {
  expect(fromEntities(toEntities(vault), DEFAULT_SETTINGS).notemeta).toEqual(meta);
  expect(fromEntities(new Map(), DEFAULT_SETTINGS).notemeta).toEqual(empty);
  const bases = Object.fromEntries([...toEntities({ ...vault, notemeta: empty })].map(([k, v]) => [k, canonicalJson(v)]));
  expect(collectChanges(toEntities(vault), { ...state, bases })).toEqual([{ key: 'notemeta', base: empty, value: meta }]);
});

it.each([{ rejected: ['notemeta'] }, { rejected: ['notemeta', 'backlog'] }])('falls back session-only for old servers rejecting $rejected', async ({ rejected }) => {
  const calls: SyncRequest[] = [];
  const fetcher = async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)); calls.push(body);
    if (body.changes.some((c: { key: string }) => rejected.includes(c.key))) return Response.json({ error: 'Invalid entity key in sync request.' }, { status: 400 });
    return Response.json({ rev: 100, entities: body.changes.map((c: object) => ({ ...c, rev: 100 })), conflicts: [] });
  };
  const first = await syncOnce(fetcher, vault, state, 'token');
  expect(calls[0].features).toEqual(['habits', 'backlog', 'notemeta']);
  expect([...first.unsupported]).toEqual(rejected);
  expect(first.state.habitsSynced).toBe(true);
  expect(first.state.backlogSynced).toBe(!rejected.includes('backlog'));
  expect(first.state.notemetaSynced).toBe(false);
  expect(applySyncOutcome(vault, first).notemeta).toEqual(meta);
  const count = calls.length;
  await syncOnce(fetcher, vault, first.state, 'token', first.unsupported);
  expect(calls).toHaveLength(count + 1);
  expect(calls.at(-1)!.changes.some(c => c.key === 'notemeta')).toBe(false);
});

it('backfills on upgrade and retains edits made during the request without editing notes', async () => {
  const calls: SyncRequest[] = [];
  const outcome = await syncOnce(async (_url, init) => {
    calls.push(JSON.parse(String(init?.body)));
    return Response.json({ rev: 100, entities: [{ key: 'notemeta', value: meta, rev: 1 }], conflicts: [] });
  }, { ...vault, notemeta: empty }, state, 'token');
  expect(calls[0].sinceRev).toBe(0);
  expect(outcome.state.notemetaSynced).toBe(true);
  const edited = { ...vault, notemeta: { folders: [{ path: 'Local', updatedAt: late }], dismissed: [] } };
  const next = applySyncOutcome(edited, outcome);
  expect(next.notemeta.folders).toHaveLength(2);
  expect(next.notemeta.dismissed).toEqual(meta.dismissed);
  expect(next.notes).toEqual(edited.notes);
  await syncOnce(async (_url, init) => { calls.push(JSON.parse(String(init?.body))); return Response.json({ rev: 100, entities: [], conflicts: [] }); }, next, outcome.state, 'token');
  expect(calls[1].sinceRev).toBe(100);
});

it('never pushes recovered metadata; preserves survivors and the guard until received', async () => {
  const recovered = { folders: [{ path: 'Survivor', updatedAt: early }], dismissed: [] };
  uneditedRecoveredNoteMeta.add(recovered);
  const local = { ...vault, notemeta: recovered };
  const calls: SyncRequest[] = [];
  const first = await syncOnce(async (_url, init) => { calls.push(JSON.parse(String(init?.body))); return Response.json({ rev: 100, entities: [], conflicts: [] }); }, local, state, 'token');
  expect(calls[0].changes.some(c => c.key === 'notemeta')).toBe(false);
  const waiting = applySyncOutcome(local, first);
  expect(uneditedRecoveredNoteMeta.has(waiting.notemeta)).toBe(true);
  const second = await syncOnce(async () => Response.json({ rev: 100, entities: [{ key: 'notemeta', value: meta, rev: 1 }], conflicts: [] }), waiting, state, 'token');
  const next = applySyncOutcome(waiting, second);
  expect(next.notemeta.folders).toHaveLength(2);
  expect(uneditedRecoveredNoteMeta.has(next.notemeta)).toBe(false);
});
