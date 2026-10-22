import type { PhotoMeta } from '../types/daymark';
import { isPhotoStorageAvailable, kvDeleteRaw, kvGetRaw, kvPutRaw } from './vaultStore';
import { encodeImage, MAX_EDGE, THUMB_EDGE } from './photoEncoder';
export type { PhotoMeta } from '../types/daymark';
export { fitWithin, MAX_EDGE, THUMB_EDGE, QUALITY } from './photoEncoder';
export const MAX_PHOTOS = 5;
export class PhotoLimitError extends Error {
  constructor() { super('Replace which photo?'); this.name = 'PhotoLimitError'; }
}

export function pickFreeSlot(metas: PhotoMeta[]): number | null {
  for (let slot = 0; slot < MAX_PHOTOS; slot++) if (!metas.some((m) => m.slot === slot)) return slot;
  return null;
}
export async function listPhotos(): Promise<PhotoMeta[]> {
  const value = await kvGetRaw('bgMeta');
  return Array.isArray(value) ? value as PhotoMeta[] : [];
}
export async function getSelectedSlot(): Promise<number | null> {
  const slot = await kvGetRaw('ui:bgSlot');
  return typeof slot === 'number' && Number.isInteger(slot) && slot >= 0 && slot < MAX_PHOTOS ? slot : null;
}
export async function setSelectedSlot(slot: number | null): Promise<void> {
  await kvPutRaw('ui:bgSlot', slot);
}
// Serialize mutations so two quick file selections cannot allocate the same slot.
let mutations: Promise<unknown> = Promise.resolve();
function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutations.then(operation);
  mutations = result.catch(() => undefined);
  return result;
}
export function addPhoto(file: File, replaceSlot?: number): Promise<PhotoMeta> {
  return mutate(async () => {
    if (!isPhotoStorageAvailable()) throw new Error('Photos need browser storage, which is unavailable here.');
    const metas = await listPhotos();
    const slot = replaceSlot ?? pickFreeSlot(metas);
    if (slot === null) throw new PhotoLimitError();
    if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_PHOTOS) throw new Error('Invalid photo slot.');
    const full = await encodeImage(file, MAX_EDGE);
    const thumb = await encodeImage(file, THUMB_EDGE);
    const meta: PhotoMeta = { slot, addedAt: new Date().toISOString(), luminance: thumb.luminance ?? 0.5, width: full.width, height: full.height };
    await kvPutRaw(`bgPhoto:${slot}`, full.blob);
    await kvPutRaw(`bgThumb:${slot}`, thumb.blob);
    await kvPutRaw('bgMeta', [...metas.filter((m) => m.slot !== slot), meta].sort((a, b) => a.slot - b.slot));
    return meta;
  });
}
export function removePhoto(slot: number): Promise<void> {
  return mutate(async () => {
    if (await getSelectedSlot() === slot) await setSelectedSlot(null);
    await kvPutRaw('bgMeta', (await listPhotos()).filter((m) => m.slot !== slot));
    await kvDeleteRaw(`bgPhoto:${slot}`);
    await kvDeleteRaw(`bgThumb:${slot}`);
  });
}
/** Caller owns the returned URL and must revoke it when no longer displayed. */
export async function photoUrl(slot: number, kind: 'full' | 'thumb'): Promise<string | null> {
  const blob = await kvGetRaw(`${kind === 'full' ? 'bgPhoto' : 'bgThumb'}:${slot}`);
  return blob instanceof Blob ? URL.createObjectURL(blob) : null;
}
