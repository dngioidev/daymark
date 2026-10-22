import { beforeEach, expect, it, vi } from 'vitest';
const { kv, encode } = vi.hoisted(() => ({ kv: new Map<string, unknown>(), encode: vi.fn() }));
vi.mock('./vaultStore', () => ({
  isPhotoStorageAvailable: () => true,
  kvGetRaw: async (key: string) => kv.get(key),
  kvPutRaw: async (key: string, value: unknown) => { kv.set(key, value); },
  kvDeleteRaw: async (key: string) => { kv.delete(key); },
}));
vi.mock('./photoEncoder', async (original) => ({ ...await original<typeof import('./photoEncoder')>(), encodeImage: encode }));
import { addPhoto, fitWithin, getSelectedSlot, listPhotos, MAX_EDGE, MAX_PHOTOS, PhotoLimitError, photoUrl, pickFreeSlot, QUALITY, removePhoto, setSelectedSlot, THUMB_EDGE } from './photoStore';
const file = new File(['image'], 'photo.png', { type: 'image/png' });
const meta = (slot: number) => ({ slot, addedAt: '2026-01-01', luminance: 0.5, width: 800, height: 600 });
beforeEach(() => {
  kv.clear();
  encode.mockReset().mockImplementation(async (_file, edge) => ({ blob: new Blob(['encoded']), width: edge, height: edge / 2, luminance: 0.42 }));
});
it('fits images without upscaling and chooses the first free slot', () => {
  expect([MAX_PHOTOS, MAX_EDGE, THUMB_EDGE, QUALITY]).toEqual([5, 2560, 320, 0.82]);
  expect(fitWithin(5000, 2500, 2560)).toEqual({ width: 2560, height: 1280 });
  expect(fitWithin(800, 600, 2560)).toEqual({ width: 800, height: 600 });
  expect(fitWithin(2500, 5000, 2560)).toEqual({ width: 1280, height: 2560 });
  expect(pickFreeSlot([0, 1, 2, 3, 4].map(meta))).toBeNull();
  expect(pickFreeSlot([0, 2].map(meta))).toBe(1);
});
it('saves full image, thumbnail and thumbnail luminance; limits to five and replaces explicitly', async () => {
  for (let i = 0; i < 5; i++) expect((await addPhoto(file)).slot).toBe(i);
  await expect(addPhoto(file)).rejects.toBeInstanceOf(PhotoLimitError);
  const old = (await listPhotos())[3];
  kv.set('bgMeta', (await listPhotos()).map((m) => ({ ...m, addedAt: '2020-01-01' })));
  const replaced = await addPhoto(file, 3);
  expect(replaced.addedAt).not.toBe('2020-01-01');
  expect(replaced.luminance).toBe(0.42);
  expect(replaced.width).toBe(2560);
  expect((await listPhotos()).length).toBe(5);
  expect(old.slot).toBe(replaced.slot);
  expect(kv.get('bgPhoto:3')).toBeInstanceOf(Blob);
  expect(kv.get('bgThumb:3')).toBeInstanceOf(Blob);
});
it('removes both blobs and clears the selection only for the removed photo', async () => {
  await addPhoto(file); await addPhoto(file);
  await setSelectedSlot(0);
  await removePhoto(1);
  expect(await getSelectedSlot()).toBe(0);
  await removePhoto(0);
  expect(await getSelectedSlot()).toBeNull();
  expect(await listPhotos()).toEqual([]);
  expect(kv.has('bgPhoto:0')).toBe(false);
  expect(kv.has('bgThumb:0')).toBe(false);
});
it('returns owned object URLs for existing blobs and null for missing photos', async () => {
  expect(await photoUrl(0, 'full')).toBeNull();
  await addPhoto(file);
  const url = await photoUrl(0, 'thumb');
  expect(url).toMatch(/^blob:/);
  URL.revokeObjectURL(url!);
});
it('does not damage a saved photo when encoding a replacement fails', async () => {
  await addPhoto(file);
  const old = kv.get('bgPhoto:0');
  encode.mockRejectedValueOnce(new Error('Invalid image'));
  await expect(addPhoto(file, 0)).rejects.toThrow('Invalid image');
  expect(kv.get('bgPhoto:0')).toBe(old);
  expect(await listPhotos()).toHaveLength(1);
});
it('serializes concurrent additions so they cannot exceed five slots', async () => {
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => addPhoto(file)));
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
  expect(await listPhotos()).toHaveLength(5);
});

