import { afterEach, beforeEach, expect, it } from 'vitest';
import { startSyncRig } from '../testkit/devices';
import { addStroke, inkKey } from '../../ink/inkModel';
import type { InkPage, InkStroke, StandaloneNote } from '../../types/daymark';
import { applySyncOutcome, syncOnce, toEntities, collectChanges } from '../syncClient';
import { MAX_SYNC_BATCH_BYTES, SyncRequest } from '../protocol';

const at = '2026-11-01T08:00:00Z';
const note: StandaloneNote = { id: 'study', title: 'Study', content: 'Handwritten note: open Daymark 1.11 or later on a tablet to view', folder: 'General', tags: [], createdAt: at, updatedAt: at, kind: 'handwritten', paper: 'grid' };
const stroke = (id: string): InkStroke => ({ id, tool: 'pen', color: '#000000', width: 2, points: 'AAAA', createdAt: at });
const page = (n: number): InkPage => ({ noteId: note.id, page: n, strokes: [stroke(`p${n}`)], removed: [], updatedAt: at });
let rig: Awaited<ReturnType<typeof startSyncRig>>;
beforeEach(async () => { rig = await startSyncRig(); });
afterEach(async () => { await rig?.stop(); });

it('syncs two pages, unions offline strokes, and protects ink through legacy text edits', async () => {
  const a = rig.device('a'), b = rig.device('b'), old = rig.device('old', { legacy: true });
  await old.sync();
  a.edit(v => ({ ...v, notes: [note], ink: [page(0), page(1)] }));
  await a.sync(); await b.sync();
  expect(b.vault.ink).toEqual(a.vault.ink);
  a.edit(v => ({ ...v, ink: v.ink.map(p => p.page === 0 ? addStroke(p, stroke('a'), at) : p) }));
  b.edit(v => ({ ...v, ink: v.ink.map(p => p.page === 0 ? addStroke(p, stroke('b'), at) : p) }));
  await a.sync(); await b.sync(); await a.sync();
  const legacy = await old.sync();
  expect([...legacy.serverValues.keys()].some(k => k.startsWith('ink:'))).toBe(false);
  expect([...legacy.snapshot.keys()].some(k => k.startsWith('ink:'))).toBe(false);
  expect(old.vault.ink).toEqual([]);
  old.edit(v => ({ ...v, notes: v.notes.map(n => ({ ...n, content: 'Legacy edit', updatedAt: '2026-11-01T09:00:00Z' })) }));
  const edited = await old.sync();
  expect(Object.keys(edited.state.bases).some(k => k.startsWith('ink:'))).toBe(false);
  await a.sync(); await b.sync();
  for (const device of [a, b]) {
    expect(device.vault.notes[0]).toMatchObject({ kind: 'handwritten', paper: 'grid', content: 'Legacy edit' });
    expect(device.vault.ink[0].strokes.map(s => s.id).sort()).toEqual(['a', 'b', 'p0']);
    expect(device.vault.ink[1]).toEqual(page(1));
  }
});

it('falls back from a server rejecting ink keys and preserves local pages', async () => {
  const a = rig.device('a');
  const local = { ...a.vault, notes: [note], ink: [page(0)] };
  const bodies: SyncRequest[] = [];
  const out = await syncOnce(async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as SyncRequest; bodies.push(body);
    if (body.changes.some(c => c.key.startsWith('ink:'))) return Response.json({ error: 'Invalid entity key in sync request.' }, { status: 400 });
    return Response.json({ rev: 1, entities: body.changes.map(c => ({ key: c.key, value: c.value, rev: 1 })), conflicts: [] });
  }, local, { serverUrl: 'https://old', username: 'a', deviceId: 'a', deviceName: 'a', lastRev: 0, bases: {}, lastSyncAt: null }, 'token');
  expect(out.unsupported).toEqual(new Set(['ink']));
  expect(bodies).toHaveLength(2);
  expect(bodies[1].features).not.toContain('ink');
  expect(bodies[1].changes.some(c => c.key === 'notemeta')).toBe(true);
  expect(applySyncOutcome(local, out).ink).toEqual(local.ink);
});

it('syncs 50 dense pages in byte bounded batches and pushes only the page changed', async () => {
  const a = rig.device('a'), b = rig.device('b');
  const pages = Array.from({ length: 50 }, (_, n) => ({ ...page(n), strokes: [{ ...stroke(`p${n}`), points: 'AAAA'.repeat(60000) }] }));
  const local = { ...a.vault, notes: [note], ink: pages };
  const bodies: SyncRequest[] = [];
  await a.sync();
  const state = { serverUrl: '', username: 'a', deviceId: 'a', deviceName: 'a', lastRev: 0, bases: {}, lastSyncAt: null };
  const out = await syncOnce(async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return a.authFetch('/api/sync', init); }, local, state, 'ignored');
  expect(bodies.length).toBeGreaterThan(1);
  for (const body of bodies) expect(new TextEncoder().encode(JSON.stringify(body)).length).toBeLessThan(MAX_SYNC_BATCH_BYTES + 1024);
  await b.sync(); expect(b.vault.ink).toEqual(pages);
  const next = { ...local, ink: pages.map(p => p.page === 23 ? addStroke(p, stroke('new'), at) : p) };
  expect(collectChanges(toEntities(next), out.state).map(c => c.key)).toEqual([inkKey(note.id, 23)]);
  const pushed = await syncOnce((_url, init) => a.authFetch('/api/sync', init), next, out.state, 'ignored');
  expect(pushed.pushed).toBe(1);
  await b.sync(); expect(b.vault.ink.find(p => p.page === 23)?.strokes.some(s => s.id === 'new')).toBe(true);
});

it('backfills ink after an upgrade even when lastRev already passed it, retaining in-flight strokes', async () => {
  const a = rig.device('a');
  a.edit(v => ({ ...v, notes: [note], ink: [page(0)] }));
  const sent = await a.sync();
  const local = { ...a.vault, ink: [] };
  const bases = Object.fromEntries(Object.entries(sent.state.bases).filter(([key]) => !key.startsWith('ink:')));
  const bodies: SyncRequest[] = [];
  const out = await syncOnce(async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return a.authFetch('/api/sync', init); }, local,
    { ...sent.state, serverUrl: '', bases, inkSynced: undefined }, 'ignored');
  expect(bodies[0].sinceRev).toBe(0);
  expect(applySyncOutcome(local, out).ink).toEqual([page(0)]);
  const during = { ...local, ink: [addStroke(page(0), stroke('during'), at)] };
  expect(applySyncOutcome(during, out).ink[0].strokes.map(s => s.id)).toEqual(['during', 'p0']);
});
