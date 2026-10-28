import { beforeEach, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
const { kv, available } = vi.hoisted(() => ({ kv: new Map<string, unknown>(), available: { value: true } }));
vi.mock('./vaultStore', () => ({
  isPhotoStorageAvailable: () => available.value,
  kvGetRaw: async (key: string) => kv.get(key),
  kvPutRaw: async (key: string, value: unknown) => { kv.set(key, value); },
  kvDeleteRaw: async (key: string) => { kv.delete(key); },
  kvKeysRaw: async (prefix: string) => [...kv.keys()].filter(key => key.startsWith(prefix)),
}));
import { buildVaultZip, importVaultFromZip, exportBackupAssets, importBackupAssets, removeUnusedPictures } from './vaultArchive';
import { hasAsset, pendingUploads, putAsset } from './noteAssets';
import { DEFAULT_SETTINGS, SEED_DAILY_DOCUMENTS, SEED_STANDALONE_NOTES } from './defaultData';
import type { HabitData } from '../types/daymark';
const id = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const meta = { id, mime: 'image/png' as const, bytes: 3, width: 10, height: 20, createdAt: '2026-10-25T00:00:00Z' };
const content = `![picture](daymark-asset:${id}.png)`;
const note = { ...SEED_STANDALONE_NOTES[0], title: 'Picture', folder: 'A', content };
beforeEach(() => { kv.clear(); available.value = true; });
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
it('export skips missing pictures, preserves unresolved refs and reports their count', async () => {
  const missing = vi.fn();
  const zip = await JSZip.loadAsync(await buildVaultZip([], [note], DEFAULT_SETTINGS, undefined, missing));
  expect(await zip.file('Daymark/Notes/A/Picture.md')!.async('string')).toBe(content);
  expect(missing).toHaveBeenCalledWith(1);
  const jsonMissing = vi.fn();
  expect(await exportBackupAssets([note], jsonMissing)).toEqual([]);
  expect(jsonMissing).toHaveBeenCalledWith(1);
});
it('remove unused keeps referenced, including notes received by the required sync', async () => {
  const kept = await seed();
  const removed = await putAsset(new Blob(['unused'], { type: meta.mime }), meta);
  let notes: { content: string }[] = [];
  const deleted: string[] = [];
  const count = await removeUnusedPictures(() => notes, {
    sync: async () => { notes = [note]; return true; },
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
    sync: async () => true, authFetch: async () => new Response(null, { status: 500 }),
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
it('ZIP and JSON restore keep notes and skip pictures when browser picture storage is unavailable', async () => {
  await seed();
  const bytes = await buildVaultZip([], [note], DEFAULT_SETTINGS);
  const assets = await exportBackupAssets([note]);
  kv.clear(); available.value = false;
  const restored = await importVaultFromZip(bytes);
  expect(restored.notes).toEqual([note]);
  expect(restored.skippedPictures).toBe(1);
  expect(await importBackupAssets(assets)).toBe(1);
  expect(kv.size).toBe(0);
});
it('folder paths and picture link depth use the same normalized safe segments', async () => {
  await seed();
  const zip = await JSZip.loadAsync(await buildVaultZip([], [{ ...note, folder: 'A/./B/../C' }], DEFAULT_SETTINGS));
  expect(await zip.file('Daymark/Notes/A/_/B/_/C/Picture.md')!.async('string')).toBe(`![picture](../../../../../_assets/${id}.png)`);
  expect(Object.keys(zip.files).some(path => path.includes('/../') || path.includes('/./'))).toBe(false);
});
it('Markdown-only Windows ZIP normalizes asset keys before resolving picture links', async () => {
  const zip = new JSZip();
  zip.file('Daymark\\Notes\\A\\Picture.md', `![picture](../_assets/${id}.png)`);
  zip.file(`Daymark\\Notes\\_assets\\${id}.png`, 'abc');
  const restored = await importVaultFromZip(await zip.generateAsync({ type: 'uint8array' }));
  expect(restored.notes[0].content).toBe(content);
  expect(await hasAsset(id)).toBe(true);
});
it('cleanup removes unreferenced orphan blobs and protects referenced orphan blobs', async () => {
  kv.set(`noteAsset:${id}`, new Blob(['abc'], { type: 'image/png' }));
  expect(await removeUnusedPictures(() => [note])).toBe(0);
  expect(await removeUnusedPictures(() => [])).toBe(1);
  expect(await hasAsset(id)).toBe(false);
});
it('cleanup invalidates Undo only after successful sync and before deleting pictures', async () => {
  await seed();
  let synced = false;
  const invalidate = vi.fn(() => {
    expect(synced).toBe(true);
    expect(kv.has(`noteAsset:${id}`)).toBe(true);
  });
  await removeUnusedPictures(() => [], { sync: async () => { synced = true; return true; }, authFetch: async () => new Response(null, { status: 204 }) }, invalidate);
  expect(invalidate).toHaveBeenCalledOnce();
});
it('ZIP pictures round-trip without browser base64 conversion APIs', async () => {
  await seed();
  const encode = vi.spyOn(globalThis, 'btoa').mockImplementation(() => { throw new Error('base64 encoding unavailable'); });
  const decode = vi.spyOn(globalThis, 'atob').mockImplementation(() => { throw new Error('base64 decoding unavailable'); });
  try {
    const bytes = await buildVaultZip([], [note], DEFAULT_SETTINGS);
    kv.clear();
    expect((await importVaultFromZip(bytes)).notes).toEqual([note]);
    expect(await hasAsset(id)).toBe(true);
  } finally { encode.mockRestore(); decode.mockRestore(); }
});
it('unavailable picture storage skips ZIP picture extraction while preserving notes, days and habits', async () => {
  const zip = new JSZip();
  const habits: HabitData = { habits: [{ id: 'read', name: 'Read', order: 0, warnAfterDays: 3, addedOn: '2026-10-25', updatedAt: '2026-10-25T00:00:00Z' }], days: [] };
  zip.file('Daymark/.daymark/vault.json', JSON.stringify({ daily_documents: [SEED_DAILY_DOCUMENTS[0]], standalone_notes: [note], habits, assets: [meta] }));
  // Picture extraction is unnecessary on a device that cannot store pictures.
  available.value = false;
  const restored = await importVaultFromZip(await zip.generateAsync({ type: 'uint8array' }));
  expect(restored.docs).toEqual([SEED_DAILY_DOCUMENTS[0]]);
  expect(restored.notes).toEqual([note]);
  expect(restored.habits).toEqual(habits);
  expect(restored.skippedPictures).toBe(1);
});

it('blocked sync aborts cleanup before history invalidation or delete', async () => {
  await seed(); const authFetch = vi.fn(), before = vi.fn();
  await expect(removeUnusedPictures(() => [], { sync: async () => false, authFetch }, before)).rejects.toThrow(/sync.*complete/i);
  expect(before).not.toHaveBeenCalled(); expect(authFetch).not.toHaveBeenCalled(); expect(await hasAsset(id)).toBe(true);
});
it('Markdown-folder import skips bad assets, keeps their links and restores healthy assets', async () => {
  const zip = new JSZip();
  const empty = '0'.repeat(64), wrong = '1'.repeat(64), unknown = '2'.repeat(64);
  const links = [id + '.png', empty + '.png', wrong + '.png', unknown + '.svg'];
  const markdown = links.map(file => '![](../_assets/' + file + ')').join(' ');
  zip.file('Notes/A/Import.md', markdown);
  zip.file('Notes/_assets/' + links[0], 'abc'); zip.file('Notes/_assets/' + links[1], '');
  zip.file('Notes/_assets/' + links[2], 'wrong'); zip.file('Notes/_assets/' + links[3], '<svg/>');
  const restored = await importVaultFromZip(await zip.generateAsync({ type: 'uint8array' }));
  expect(restored.skippedPictures).toBe(3);
  expect(restored.notes[0].content).toBe(markdown.replace('../_assets/' + id + '.png', 'daymark-asset:' + id + '.png'));
  expect(await hasAsset(id)).toBe(true); expect(await hasAsset(empty)).toBe(false); expect(await hasAsset(wrong)).toBe(false);
});
