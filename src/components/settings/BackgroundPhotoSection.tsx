import React, { useEffect, useRef, useState } from 'react';
import type { PhotoMeta } from '../../types/daymark';
import type { useBackgroundPhoto } from '../../hooks/useBackgroundPhoto';
import { MAX_PHOTOS, photoUrl } from '../../utils/photoStore';
import { isPhotoStorageAvailable } from '../../utils/vaultStore';
import { Dialog, buttonClass } from '../ui/Dialog';

function Thumbnail({ photo }: { photo: PhotoMeta }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let owned: string | null = null;
    void photoUrl(photo.slot, 'thumb').then((next) => {
      if (!active) { if (next) URL.revokeObjectURL(next); return; }
      owned = next; setUrl(next);
    }).catch(() => setUrl(null));
    return () => { active = false; if (owned) URL.revokeObjectURL(owned); };
  }, [photo.slot, photo.addedAt]);
  return url ? <img src={url} alt="" className="w-20 h-14 object-cover rounded" /> : <span className="inline-block w-20 h-14 bg-stone-200 dark:bg-stone-800 rounded" />;
}

export function BackgroundPhotoSection({ background }: { background: ReturnType<typeof useBackgroundPhoto> }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await operation(); setPending(null); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save this photo.'); }
    finally { setBusy(false); }
  };
  if (!isPhotoStorageAvailable()) return <p>Photos need browser storage, which is unavailable here.</p>;
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={buttonClass.secondary} aria-pressed={background.meta === null} onClick={() => background.select(null)}>None</button>
      {background.photos.map((photo) => <div key={photo.slot} className="relative">
        <button type="button" disabled={busy} aria-label={`Select photo ${photo.slot + 1}`} aria-pressed={background.meta?.slot === photo.slot} className="block rounded border-2 border-transparent aria-pressed:border-stone-500 p-1" onClick={() => background.select(photo.slot)}><Thumbnail photo={photo} /></button>
        <button type="button" disabled={busy} aria-label={`Remove photo ${photo.slot + 1}`} className="absolute -right-2 -top-2 w-11 h-11 rounded-full bg-stone-100 text-stone-900 border border-stone-400" onClick={() => void run(() => background.remove(photo.slot))}>&times;</button>
      </div>)}
      <button type="button" disabled={busy} className={buttonClass.secondary} onClick={() => input.current?.click()}>+ Add</button>
      <input ref={input} type="file" accept="image/*" aria-label="Add background photo" className="hidden" onChange={(e) => {
        const file = e.currentTarget.files?.[0]; e.currentTarget.value = '';
        if (!file) return;
        if (background.photos.length >= MAX_PHOTOS) setPending(file);
        else void run(() => background.add(file));
      }} />
    </div>
    <p className="text-sm text-stone-600 dark:text-stone-400">Photos stay on this device and aren't synced or backed up.</p>
    {background.meta === null && background.photos.length === 0 && <p className="text-sm text-stone-600 dark:text-stone-400">If you chose a photo on another device, add it here too.</p>}
    {error && <p role="alert">{error}</p>}
    <Dialog isOpen={pending !== null} onClose={() => { if (!busy) setPending(null); }} dismissible={!busy} title="Replace which photo?" footer={<button type="button" disabled={busy} className={buttonClass.secondary} onClick={() => setPending(null)}>Cancel</button>}>
      <div className="p-4 flex flex-wrap gap-3">{background.photos.map((photo) => <button type="button" key={photo.slot} disabled={busy} aria-label={`Replace photo ${photo.slot + 1}`} className="p-1 rounded border border-stone-400" onClick={() => { if (pending) void run(() => background.add(pending, photo.slot)); }}><Thumbnail photo={photo} /></button>)}</div>
      {error && <p role="alert" className="p-4">{error}</p>}
    </Dialog>
  </div>;
}
