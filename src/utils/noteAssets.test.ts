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

it.each([0, 1.5 * 1024 * 1024 + 1])('rejects invalid picture size %s before storing anything', async bytes => {
  await expect(putAsset(new Blob([new Uint8Array(bytes)], { type: 'image/png' }), meta)).rejects.toThrow(/empty|1\.5 MiB/);
  expect(kv.size).toBe(0);
});
it.each([400, 403, 413, 415, 422])('drops permanent upload failure %s and uploads later ids', async status => {
  const first = await putAsset(new Blob(['abc'], { type: 'image/png' }), meta);
  const second = await putAsset(new Blob(['def'], { type: 'image/png' }), meta);
  const sent: string[] = [];
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await syncNoteAssets([], async path => {
      sent.push(path.split('/').pop()!);
      return new Response(null, { status: sent.length === 1 ? status : 200 });
    });
    expect(sent).toEqual([first, second]);
    expect(await pendingUploads()).toEqual([]);
    expect(await hasAsset(first)).toBe(true); // dropping pending never deletes local pictures
    expect(warning).toHaveBeenCalledWith(expect.stringContaining(first));
  } finally { warning.mockRestore(); }
});
it.each([401, 404, 408, 429, 500, 503])('retains upload failure %s and retries next round', async status => {
  const first = await putAsset(new Blob(['abc'], { type: 'image/png' }), meta);
  const second = await putAsset(new Blob(['def'], { type: 'image/png' }), meta);
  const sent: string[] = [];
  await syncNoteAssets([], async path => { sent.push(path); return new Response(null, { status }); });
  expect(sent).toHaveLength(1);
  expect(await pendingUploads()).toEqual([first, second]);
  await syncNoteAssets([], async () => new Response(null, { status: 200 }));
  expect(await pendingUploads()).toEqual([]);
});
it.each(['network', 'http', 'integrity'])('a failing download (%s) does not stop other workers or later ids', async failure => {
  const bodies = ['first', 'second', 'third', 'fourth', 'fifth'];
  const ids = await Promise.all(bodies.map(async body => {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
    return Buffer.from(bytes).toString('hex');
  }));
  const visited: string[] = [];
  await syncNoteAssets([{ content: ids.map(id => assetRef(id, 'image/png')).join('\n') }], async path => {
    const id = path.split('/').pop()!;
    visited.push(id);
    if (ids.indexOf(id) < 3) {
      if (failure === 'network') throw new Error('offline for this request');
      if (failure === 'http') return new Response(null, { status: 500 });
      return new Response(new Blob(['corrupt'], { type: 'image/png' }));
    }
    return new Response(new Blob([bodies[ids.indexOf(id)]], { type: 'image/png' }));
  });
  expect(visited).toEqual(ids);
  expect(await Promise.all(ids.map(hasAsset))).toEqual([false, false, false, true, true]);
});
it('stores hash-verified downloads with zero dimensions when bitmap decoding fails', async () => {
  vi.stubGlobal('createImageBitmap', async () => { throw new Error('decoder unavailable'); });
  try {
    await syncNoteAssets([{ content: assetRef(id, 'image/png') }], async () => new Response(new Blob(['abc'], { type: 'image/png' })));
    expect(await hasAsset(id)).toBe(true);
    expect(await listAssets()).toEqual([expect.objectContaining({ id, width: 0, height: 0 })]);
  } finally { vi.unstubAllGlobals(); }
});
it('device B re-uploads a locally referenced picture missing from the server inventory', async () => {
  await putAsset(new Blob(['abc'], { type: 'image/png' }), meta);
  await markUploaded(id);
  const requests: string[] = [];
  const fetcher = async (path: string, init?: RequestInit) => {
    requests.push(`${init?.method ?? 'GET'} ${path}`);
    if (path === '/api/assets') return Response.json([]);
    expect(JSON.parse(init!.body as string)).toEqual({ mime: 'image/png', data: 'YWJj' });
    return Response.json({ ok: true });
  };
  await syncNoteAssets([{ content: assetRef(id, 'image/png') }], fetcher);
  expect(requests).toEqual(['GET /api/assets', `PUT /api/assets/${id}`]);
  expect(await pendingUploads()).toEqual([]);
  await syncNoteAssets([{ content: assetRef(id, 'image/png') }], fetcher);
  expect(requests).toHaveLength(2);
});
it('periodic inventory refresh heals a picture removed by cleanup on another device', async () => {
  await putAsset(new Blob(['abc'], { type: 'image/png' }), meta);
  await markUploaded(id);
  let present = true;
  let uploaded = false;
  const now = vi.spyOn(Date, 'now'); now.mockReturnValue(1000);
  const fetcher = async (path: string, init?: RequestInit) => {
    if (path === '/api/assets') return Response.json(present ? [{ ...meta, id, bytes: 3 }] : []);
    if (init?.method === 'PUT') uploaded = true;
    return Response.json({ ok: true });
  };
  try {
    await syncNoteAssets([{ content: assetRef(id, 'image/png') }], fetcher);
    present = false;
    now.mockReturnValue(62_000);
    await syncNoteAssets([{ content: assetRef(id, 'image/png') }], fetcher);
    expect(uploaded).toBe(true);
  } finally { now.mockRestore(); }
});
it('a referenced download 404 queues bytes that arrived locally during the request', async () => {
  const fetcher = async () => {
    await putAsset(new Blob(['abc'], { type: 'image/png' }), meta);
    await markUploaded(id);
    return new Response(null, { status: 404 });
  };
  await syncNoteAssets([{ content: assetRef(id, 'image/png') }], fetcher);
  expect(await pendingUploads()).toEqual([id]);
});
it('listAssets counts orphan blobs without metadata', async () => {
  kv.set(`noteAsset:${id}`, new Blob(['abc'], { type: 'image/png' }));
  expect(await listAssets()).toEqual([expect.objectContaining({ id, bytes: 3, mime: 'image/png' })]);
});
