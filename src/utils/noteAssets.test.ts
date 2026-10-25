import { beforeEach, expect, it, vi } from 'vitest';
const { kv, available } = vi.hoisted(() => ({ kv: new Map<string, unknown>(), available: { value: true } }));
vi.mock('./vaultStore', () => ({
  isPhotoStorageAvailable: () => available.value,
  kvGetRaw: async (key: string) => kv.get(key),
  kvPutRaw: async (key: string, value: unknown) => { kv.set(key, value); },
  kvDeleteRaw: async (key: string) => { kv.delete(key); },
  kvKeysRaw: async (prefix: string) => [...kv.keys()].filter(key => key.startsWith(prefix)),
}));
import { assetRef, deleteAsset, getAssetUrl, hasAsset, listAssets, markUploaded, parseAssetRefs, pendingUploads, putAsset, syncNoteAssets } from './noteAssets';
const meta = { mime: 'image/png' as const, width: 10, height: 20, createdAt: '2026-10-25T00:00:00Z' };
const id = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
beforeEach(() => { kv.clear(); available.value = true; });
it('putAsset dedupes by content hash even for concurrent additions', async () => {
  const blob = new Blob(['abc'], { type: 'image/png' });
  expect(await Promise.all([putAsset(blob, meta), putAsset(blob, meta)])).toEqual([id, id]);
  expect(await pendingUploads()).toEqual([id]);
  expect(await listAssets()).toEqual([{ ...meta, id, bytes: 3 }]);
  expect(await hasAsset(id)).toBe(true);
  const url = await getAssetUrl(id);
  expect(await getAssetUrl(id)).toBe(url);
  await markUploaded(id);
  expect(await pendingUploads()).toEqual([]);
  await deleteAsset(id);
  expect(await getAssetUrl(id)).toBeNull();
  expect(await listAssets()).toEqual([]);
});
it('parseAssetRefs finds unique ids and assetRef uses the right extension', () => {
  expect(assetRef(id, 'image/jpeg')).toBe(`daymark-asset:${id}.jpg`);
  expect(parseAssetRefs(`![](daymark-asset:${id}.png) ![](daymark-asset:${id}.webp) daymark-asset:invalid.png`)).toEqual([id]);
});
it('rejects pictures with a friendly error in localStorage fallback', async () => {
  available.value = false;
  await expect(putAsset(new Blob(['abc']), meta)).rejects.toThrow(/Pictures need browser storage/);
  expect(kv.size).toBe(0);
});
it('keeps failed uploads pending and missing URLs as placeholders until next round fetches them', async () => {
  await putAsset(new Blob(['abc'], { type: 'image/png' }), meta);
  const other = 'cb8379ac2098aa165029e3938a51da0bcecfc008fd6795f401178647f96c5b34'; // sha256(def)
  let fail = true;
  const fetcher = async (_path: string, init?: RequestInit) => {
    if (init?.method === 'PUT') { if (fail) throw new Error('offline'); return Response.json({ ok: true }); }
    return new Response(new Blob(['def'], { type: 'image/png' }));
  };
  const notes = [{ content: `![](daymark-asset:${other}.png)` }];
  await syncNoteAssets(notes, fetcher);
  expect(await pendingUploads()).toEqual([id]);
  expect(await getAssetUrl(other)).toBeNull();
  fail = false;
  await syncNoteAssets(notes, fetcher);
  expect(await pendingUploads()).toEqual([]);
  expect(await hasAsset(other)).toBe(true);
});
it('bounds downloads to three and emits arrival ids without re-uploading downloads', async () => {
  const bodies = ['one', 'two', 'three', 'four', 'five'];
  const ids = await Promise.all(bodies.map(async text => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }));
  let inFlight = 0, peak = 0;
  const fetcher = async (path: string) => {
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise(resolve => setTimeout(resolve, 5));
    inFlight--;
    return new Response(new Blob([bodies[ids.indexOf(path.split('/').pop()!)]], { type: 'image/png' }));
  };
  const notes = [{ content: ids.map(id => `![](daymark-asset:${id}.png)`).join('\n') }];
  await syncNoteAssets(notes, fetcher);
  expect(peak).toBe(3);
  expect(await Promise.all(ids.map(hasAsset))).toEqual([true, true, true, true, true]);
  expect(await pendingUploads()).toEqual([]);
});
it('rejects a downloaded picture whose bytes do not match the reference', async () => {
  await syncNoteAssets([{ content: `![](daymark-asset:${id}.png)` }], async () => new Response(new Blob(['wrong'], { type: 'image/png' })));
  expect(await hasAsset(id)).toBe(false);
});
it('does not save a picture that arrives after the sync session is cancelled', async () => {
  let active = true;
  await syncNoteAssets([{ content: `![](daymark-asset:${id}.png)` }], async () => {
    active = false;
    return new Response(new Blob(['abc'], { type: 'image/png' }));
  }, () => active);
  expect(await hasAsset(id)).toBe(false);
});
