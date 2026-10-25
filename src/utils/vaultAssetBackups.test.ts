import { beforeEach, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
const { kv } = vi.hoisted(() => ({ kv: new Map<string, unknown>() }));
vi.mock('./vaultStore', () => ({
  isPhotoStorageAvailable: () => true,
  kvGetRaw: async (key: string) => kv.get(key),
  kvPutRaw: async (key: string, value: unknown) => { kv.set(key, value); },
  kvDeleteRaw: async (key: string) => { kv.delete(key); },
  kvKeysRaw: async (prefix: string) => [...kv.keys()].filter(key => key.startsWith(prefix)),
}));
import { buildVaultZip, importVaultFromZip, exportBackupAssets, importBackupAssets, removeUnusedPictures } from './vaultArchive';
import { hasAsset, pendingUploads, putAsset } from './noteAssets';
import { DEFAULT_SETTINGS, SEED_STANDALONE_NOTES } from './defaultData';
const id = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const meta = { id, mime: 'image/png' as const, bytes: 3, width: 10, height: 20, createdAt: '2026-10-25T00:00:00Z' };
const content = `![picture](daymark-asset:${id}.png)`;
const note = { ...SEED_STANDALONE_NOTES[0], title: 'Picture', folder: 'A', content };
beforeEach(() => kv.clear());
const seed = () => putAsset(new Blob(['abc'], { type: meta.mime }), meta);

it('zip export rewrites refs and includes files at the correct nested depth', async () => {
  await seed();
  await putAsset(new Blob(['unused'], { type: meta.mime }), meta);
  const zip = await JSZip.loadAsync(await buildVaultZip([], [note, { ...note, id: 'nested', folder: 'A/B/C' }], DEFAULT_SETTINGS));
  expect(await zip.file(`Daymark/Notes/_assets/${id}.png`)!.async('string')).toBe('abc');
  expect(await zip.file('Daymark/Notes/A/Picture.md')!.async('string')).toBe(`![picture](../_assets/${id}.png)`);
  expect(await zip.file('Daymark/Notes/A/B/C/Picture.md')!.async('string')).toBe(`![picture](../../../_assets/${id}.png)`);
  expect(Object.keys(zip.files).filter(path => path.includes('/_assets/') && !zip.files[path].dir)).toHaveLength(1);
  const snapshot = JSON.parse(await zip.file('Daymark/.daymark/vault.json')!.async('string'));
  expect(snapshot.standalone_notes[0].content).toBe(content);
  expect(snapshot.assets).toEqual([meta]);
});
it('import restores assets and queues uploads while preserving original refs', async () => {
  await seed();
  const bytes = await buildVaultZip([], [note], DEFAULT_SETTINGS);
  kv.clear();
  expect((await importVaultFromZip(bytes)).notes[0].content).toBe(content);
  expect(await hasAsset(id)).toBe(true);
  expect(await pendingUploads()).toEqual([id]);
  expect(await (kv.get(`noteAsset:${id}`) as Blob).text()).toBe('abc');
});
it('ZIP import rejects a picture with a mismatched hash before storing it', async () => {
  await seed();
  const zip = await JSZip.loadAsync(await buildVaultZip([], [note], DEFAULT_SETTINGS));
  zip.file(`Daymark/Notes/_assets/${id}.png`, 'corrupt');
  kv.clear();
  await expect(importVaultFromZip(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/integrity|hash/i);
  expect(await hasAsset(id)).toBe(false);
});
it('JSON assets round-trip base64 bytes and queue restored pictures', async () => {
  await seed();
  const assets = await exportBackupAssets([note]);
  expect(assets).toEqual([{ meta, data: 'YWJj' }]);
  kv.clear();
  await importBackupAssets(assets);
  expect(await (kv.get(`noteAsset:${id}`) as Blob).text()).toBe('abc');
  expect(await pendingUploads()).toEqual([id]);
});
it('JSON import rejects tampered bytes and malformed metadata', async () => {
  await expect(importBackupAssets([{ meta, data: 'ZGVm' }])).rejects.toThrow(/integrity|hash/i);
  await expect(importBackupAssets([{ meta: { ...meta, id: '../bad' }, data: 'YWJj' }])).rejects.toThrow();
  expect(kv.size).toBe(0);
});
it('old JSON backups without pictures remain restorable', async () => {
  await importBackupAssets(undefined);
  expect(kv.size).toBe(0);
});
it('export reports a missing referenced picture rather than silently losing it', async () => {
  await expect(buildVaultZip([], [note], DEFAULT_SETTINGS)).rejects.toThrow(/missing|unavailable/i);
});
it('remove unused keeps referenced, including notes received by the required sync', async () => {
  const kept = await seed();
  const removed = await putAsset(new Blob(['unused'], { type: meta.mime }), meta);
  let notes: { content: string }[] = [];
  const deleted: string[] = [];
  const count = await removeUnusedPictures(() => notes, {
    sync: async () => { notes = [note]; },
    authFetch: async (path, init) => {
      expect(init?.method).toBe('DELETE');
      deleted.push(path);
      return new Response(null, { status: 204 });
    },
  });
  expect(count).toBe(1);
  expect(deleted).toEqual([`/api/assets/${removed}`]);
  expect(await hasAsset(kept)).toBe(true);
  expect(await hasAsset(removed)).toBe(false);
  expect(await pendingUploads()).toEqual([kept]);
});
it('failed sync prevents cleanup and server delete failure preserves local bytes', async () => {
  await seed();
  await expect(removeUnusedPictures(() => [], {
    sync: async () => { throw new Error('offline'); }, authFetch: async () => new Response(null, { status: 204 }),
  })).rejects.toThrow('offline');
  expect(await hasAsset(id)).toBe(true);
  await expect(removeUnusedPictures(() => [], {
    sync: async () => {}, authFetch: async () => new Response(null, { status: 500 }),
  })).rejects.toThrow();
  expect(await hasAsset(id)).toBe(true);
});
it('cleanup without sync removes only local unused pictures', async () => {
  await seed();
  expect(await removeUnusedPictures(() => [note])).toBe(0);
  expect(await removeUnusedPictures(() => [])).toBe(1);
  expect(await hasAsset(id)).toBe(false);
});
it('Markdown-only ZIP restores _assets and converts nested relative links back to asset refs', async () => {
  await seed();
  const zip = await JSZip.loadAsync(await buildVaultZip([], [{ ...note, folder: 'A/B' }], DEFAULT_SETTINGS));
  zip.remove('Daymark/.daymark/vault.json');
  kv.clear();
  const restored = await importVaultFromZip(await zip.generateAsync({ type: 'uint8array' }));
  expect(restored.notes[0].content).toBe(content);
  expect(await hasAsset(id)).toBe(true);
  expect(await pendingUploads()).toEqual([id]);
});
it('invalid later JSON picture prevents persisting earlier valid pictures', async () => {
  await expect(importBackupAssets([{ meta, data: 'YWJj' }, { meta, data: 'ZGVm' }])).rejects.toThrow(/integrity/i);
  expect(kv.size).toBe(0);
});
it('ZIP readable links resolve to the stored picture extension even for jpeg aliases', async () => {
  await putAsset(new Blob(['abc'], { type: 'image/jpeg' }), { ...meta, mime: 'image/jpeg' });
  const zip = await JSZip.loadAsync(await buildVaultZip([], [{ ...note, content: `![](daymark-asset:${id}.jpeg)` }], DEFAULT_SETTINGS));
  expect(await zip.file('Daymark/Notes/A/Picture.md')!.async('string')).toBe(`![](../_assets/${id}.jpg)`);
  expect(await zip.file(`Daymark/Notes/_assets/${id}.jpg`)!.async('string')).toBe('abc');
});
it('Markdown-only restore leaves online image URLs untouched', async () => {
  const zip = new JSZip();
  const online = `![online](https://example.com/_assets/${id}.png)`;
  zip.file('Daymark/Notes/Picture.md', online);
  zip.file(`Daymark/Notes/_assets/${id}.png`, 'abc');
  const restored = await importVaultFromZip(await zip.generateAsync({ type: 'uint8array' }));
  expect(restored.notes[0].content).toBe(online);
});
