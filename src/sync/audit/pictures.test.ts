import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { StandaloneNote } from '../../types/daymark';
const storage = vi.hoisted(() => ({ current: new Map<string, unknown>() }));
vi.mock('../../utils/vaultStore', () => ({
  isPhotoStorageAvailable: () => true,
  kvGetRaw: async (key: string) => storage.current.get(key),
  kvPutRaw: async (key: string, value: unknown) => { storage.current.set(key, value); },
  kvDeleteRaw: async (key: string) => { storage.current.delete(key); },
  kvKeysRaw: async (prefix: string) => [...storage.current.keys()].filter(key => key.startsWith(prefix)),
}));
import { assetRef, getAssetUrl, hasAsset, pendingUploads, putAsset, syncNoteAssets } from '../../utils/noteAssets';
import { startSyncRig, type Device } from '../testkit/devices';

const bytes = new Uint8Array([137, 80, 78, 71, 255, 0, 128]);
const meta = { mime: 'image/png' as const, width: 1, height: 1, createdAt: '2026-10-30T00:00:00Z' };
let rig: Awaited<ReturnType<typeof startSyncRig>>;
let a: Device, b: Device;
let stores: Map<Device, Map<string, unknown>>;
let id: string;
function use(device: Device) { storage.current = stores.get(device)!; }
async function round(device: Device, fetcher = device.authFetch) {
  use(device); await syncNoteAssets(device.vault.notes, fetcher);
}
async function expectPicture(device: Device, picture = id, expected = bytes) {
  use(device);
  expect(await hasAsset(picture)).toBe(true);
  expect(await getAssetUrl(picture)).toMatch(/^blob:/);
  expect(new Uint8Array(await (storage.current.get(`noteAsset:${picture}`) as Blob).arrayBuffer())).toEqual(expected);
  expect(await pendingUploads()).toEqual([]);
}
beforeEach(async () => {
  rig = await startSyncRig(); a = rig.device('A'); b = rig.device('B');
  stores = new Map([[a, new Map()], [b, new Map()]]);
  use(a); id = await putAsset(new Blob([bytes], { type: meta.mime }), meta);
  const note: StandaloneNote = { id: 'pictures', title: 'Pictures', folder: '', tags: [],
    content: `![photo](${assetRef(id, meta.mime)})`, createdAt: meta.createdAt, updatedAt: meta.createdAt };
  a.edit(v => ({ ...v, notes: [note] }));
  await a.sync(); await b.sync();
});
afterEach(async () => { vi.restoreAllMocks(); await rig?.stop(); });

it.each(['network', '500'])('retries interrupted upload (%s) next round and B receives identical bytes', async failure => {
  let interrupt = true;
  const fetcher = async (path: string, init?: RequestInit) => {
    if (interrupt && init?.method === 'PUT') {
      interrupt = false;
      if (failure === 'network') throw new Error('connection lost');
      return new Response(null, { status: 500 });
    }
    return a.authFetch(path, init);
  };
  await round(a, fetcher);
  expect(await pendingUploads()).toEqual([id]);
  expect((await a.authFetch(`/api/assets/${id}`)).status).toBe(404);
  await round(a, fetcher); await round(b);
  await expectPicture(a); await expectPicture(b);
});

it('note arrives before picture without error and resolves after the next eligible asset round', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(0);
  expect(b.vault.notes).toEqual(a.vault.notes);
  use(b); expect(await getAssetUrl(id)).toBeNull();
  await expect(round(b)).resolves.toBeUndefined();
  expect(await getAssetUrl(id)).toBeNull();
  await round(a);
  now.mockReturnValue(60_000); // the existing missing-picture backoff
  await round(b); await expectPicture(b);
  expect(b.vault.notes).toEqual(a.vault.notes);
});

it('owner repairs a server 404 from its uploaded local copy', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(0);
  await round(a);
  expect((await a.authFetch(`/api/assets/${id}`, { method: 'DELETE' })).ok).toBe(true);
  expect((await a.authFetch(`/api/assets/${id}`)).status).toBe(404);
  now.mockReturnValue(60_000);
  await round(a); await round(b); await expectPicture(a); await expectPicture(b);
});

it.each(['bytes', 'metadata'] as const)('owner heals damaged server %s while healthy pictures still download', async damage => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(0);
  use(a);
  const healthyBytes = new Uint8Array([255, 0, 1, 2]);
  const healthy = await putAsset(new Blob([healthyBytes], { type: meta.mime }), meta);
  a.edit(v => ({ ...v, notes: v.notes.map(n => ({ ...n, content: n.content + `\n![](${assetRef(healthy, meta.mime)})` })) }));
  await a.sync(); await b.sync(); await round(a);
  fs.writeFileSync(path.join(rig.dataDir, 'assets', id + (damage === 'metadata' ? '.json' : '')), damage === 'metadata' ? '{broken' : 'bad');
  await round(b);
  use(b); expect(await getAssetUrl(id)).toBeNull();
  await expectPicture(b, healthy, healthyBytes);
  now.mockReturnValue(60_000);
  await round(a); await round(b);
  await expectPicture(a); await expectPicture(b);
});

it('deleting a synced note retains local and server pictures for undo or sharing', async () => {
  await round(a); await round(b);
  a.edit(v => ({ ...v, notes: [] })); await a.sync(); await b.sync();
  await round(a); await round(b);
  expect(b.vault.notes).toEqual([]);
  await expectPicture(a); await expectPicture(b);
  const response = await b.authFetch(`/api/assets/${id}`);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
});

it('third device joining later receives notes and every referenced picture', async () => {
  use(a);
  const otherBytes = new Uint8Array([255, 0, 1, 2]);
  const other = await putAsset(new Blob([otherBytes], { type: meta.mime }), meta);
  a.edit(v => ({ ...v, notes: v.notes.map(n => ({ ...n, content: n.content + `\n![](${assetRef(other, meta.mime)})` })) }));
  await a.sync(); await round(a); await b.sync(); await round(b);
  await rig.restartServer();
  const c = rig.device('C'); stores.set(c, new Map());
  await c.sync();
  expect(c.vault.notes).toEqual(a.vault.notes);
  await round(c); await expectPicture(c); await expectPicture(c, other, otherBytes);
});
