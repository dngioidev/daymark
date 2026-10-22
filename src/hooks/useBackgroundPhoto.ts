import { useEffect, useState } from 'react';
import type { PhotoMeta } from '../types/daymark';
import * as store from '../utils/photoStore';
import { isPhotoStorageAvailable } from '../utils/vaultStore';
import { showToast } from '../components/ui/feedback';

export function useBackgroundPhoto(): { url: string | null; meta: PhotoMeta | null; photos: PhotoMeta[]; select(slot: number | null): void; add(file: File, replaceSlot?: number): Promise<void>; remove(slot: number): Promise<void> } {
  const [photos, setPhotos] = useState<PhotoMeta[]>([]);
  const [slot, setSlot] = useState<number | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const meta = photos.find((photo) => photo.slot === slot) ?? null;
  useEffect(() => {
    if (!isPhotoStorageAvailable()) return;
    let active = true;
    void Promise.all([store.listPhotos(), store.getSelectedSlot()]).then(([photos, selected]) => {
      if (active) { setPhotos(photos); setSlot(selected); }
    }).catch(() => showToast('Could not load your background photos.'));
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    let owned: string | null = null;
    setUrl(null);
    if (meta) void store.photoUrl(meta.slot, 'full').then((next) => {
      if (!active) { if (next) URL.revokeObjectURL(next); return; }
      owned = next;
      setUrl(next);
    }).catch(() => showToast('Could not load your background photo.'));
    return () => { active = false; if (owned) URL.revokeObjectURL(owned); };
  }, [meta?.slot, meta?.addedAt]);
  return {
    url, meta, photos,
    select(selected) {
      setSlot(selected);
      void store.setSelectedSlot(selected).catch(() => showToast('Could not save your background choice.'));
    },
    async add(file, replaceSlot) {
      const added = await store.addPhoto(file, replaceSlot);
      await store.setSelectedSlot(added.slot);
      setPhotos(await store.listPhotos());
      setSlot(added.slot);
    },
    async remove(removed) {
      await store.removePhoto(removed);
      setPhotos(await store.listPhotos());
      setSlot((selected) => selected === removed ? null : selected);
    },
  };
}
