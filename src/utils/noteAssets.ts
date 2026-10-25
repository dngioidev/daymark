import type { NoteAssetMeta } from '../types/daymark';
import { isPhotoStorageAvailable, kvDeleteRaw, kvGetRaw, kvKeysRaw, kvPutRaw } from './vaultStore';

export const MAX_ASSET_BYTES = 1.5 * 1024 * 1024;
const validId = (id: string) => /^[a-f0-9]{64}$/.test(id);
const urls = new Map<string, string>();
let mutations: Promise<unknown> = Promise.resolve();
function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutations.then(operation);
  mutations = result.catch(() => undefined);
  return result;
}
async function hash(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function pendingUploads(): Promise<string[]> {
  const value = await kvGetRaw('noteAssetPending');
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && validId(id)) : [];
}
/** Hash and persist locally; downloaded assets use the internal non-pending path. */
export function putAsset(blob: Blob, meta: Omit<NoteAssetMeta, 'id' | 'bytes'>): Promise<string> {
  return storeAsset(blob, meta, true);
}
export function storeAsset(blob: Blob, meta: Omit<NoteAssetMeta, 'id' | 'bytes'>, pending: boolean, expectedId?: string): Promise<string> {
  return mutate(async () => {
    if (!isPhotoStorageAvailable()) throw new Error('Pictures need browser storage, which is unavailable here.');
    if (blob.size === 0) throw new Error('This picture is empty. Choose another picture.');
    if (blob.size > MAX_ASSET_BYTES) throw new Error('This picture exceeds 1.5 MiB. Choose a smaller picture.');
    if (!['image/webp', 'image/jpeg', 'image/png'].includes(meta.mime)) throw new Error('Unsupported picture format.');
    const id = await hash(blob);
    if (expectedId && id !== expectedId) throw new Error('Downloaded picture failed its integrity check.');
    // Preserve the first creation time when the same content is pasted again.
    const existing = await kvGetRaw(`noteAssetMeta:${id}`);
    await kvPutRaw(`noteAsset:${id}`, blob);
    await kvPutRaw(`noteAssetMeta:${id}`, existing ?? { ...meta, id, bytes: blob.size });
    if (pending) await kvPutRaw('noteAssetPending', [...new Set([...await pendingUploads(), id])]);
    return id;
  });
}
export async function hasAsset(id: string): Promise<boolean> {
  return validId(id) && await kvGetRaw(`noteAsset:${id}`) instanceof Blob;
}
/** Cached URLs belong to the store and are revoked when the asset is deleted. */
export async function getAssetUrl(id: string): Promise<string | null> {
  if (!validId(id)) return null;
  const blob = await kvGetRaw(`noteAsset:${id}`);
  if (!(blob instanceof Blob)) {
    const old = urls.get(id);
    if (old) URL.revokeObjectURL(old);
    urls.delete(id);
    return null;
  }
  if (!urls.has(id)) urls.set(id, URL.createObjectURL(blob));
  return urls.get(id)!;
}
export async function listAssets(): Promise<NoteAssetMeta[]> {
  const keys = await kvKeysRaw('noteAssetMeta:');
  const metas = await Promise.all(keys.map(key => kvGetRaw(key)));
  const result = metas.filter((meta): meta is NoteAssetMeta => !!meta && typeof meta === 'object' && 'id' in meta && validId(String(meta.id)));
  const known = new Set(result.map(meta => meta.id));
  // An interrupted write can leave bytes without metadata. Include them in usage/cleanup.
  for (const key of await kvKeysRaw('noteAsset:')) {
    const id = key.slice('noteAsset:'.length);
    if (!validId(id) || known.has(id)) continue;
    const blob = await kvGetRaw(key);
    if (!(blob instanceof Blob)) continue;
    const mime = blob.type === 'image/jpeg' || blob.type === 'image/webp' ? blob.type : 'image/png';
    result.push({ id, mime, bytes: blob.size, width: 0, height: 0, createdAt: new Date(0).toISOString() });
  }
  return result;
}
function queueUpload(id: string): Promise<boolean> {
  return mutate(async () => {
    if (!await hasAsset(id)) return false;
    await kvPutRaw('noteAssetPending', [...new Set([...await pendingUploads(), id])]);
    return true;
  });
}
// The API has no push deletion notice. Recheck once per minute to discover cleanup elsewhere.
const inventoryCheckedAt = new WeakMap<(path: string, init?: RequestInit) => Promise<Response>, number>();
const sessions = new WeakMap<(path: string, init?: RequestInit) => Promise<Response>, {
  missing: Map<string, { failures: number; retryAt: number }>;
  rejected: Set<string>;
}>();
const retryDelays = [60_000, 300_000, 1_800_000, 7_200_000];
export function invalidateAssetInventory(authFetch: (path: string, init?: RequestInit) => Promise<Response>): void {
  inventoryCheckedAt.delete(authFetch);
}
export function markUploaded(id: string): Promise<void> {
  return mutate(async () => { await kvPutRaw('noteAssetPending', (await pendingUploads()).filter(item => item !== id)); });
}
export function deleteAsset(id: string): Promise<void> {
  return mutate(async () => {
    if (!validId(id)) return;
    await kvDeleteRaw(`noteAsset:${id}`);
    await kvDeleteRaw(`noteAssetMeta:${id}`);
    await kvPutRaw('noteAssetPending', (await pendingUploads()).filter(item => item !== id));
    const url = urls.get(id);
    if (url) URL.revokeObjectURL(url);
    urls.delete(id);
  });
}
export function assetRef(id: string, mime: NoteAssetMeta['mime']): string {
  return `daymark-asset:${id}.${mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp'}`;
}
export function parseAssetRefs(markdown: string): string[] {
  return [...new Set(Array.from(markdown.matchAll(/daymark-asset:([a-f0-9]{64})\.(?:webp|jpeg|jpg|png)\b/g), match => match[1]))];
}

/** Best-effort follow-up to note sync. Failures leave placeholders/pending ids for the next round. */
export async function syncNoteAssets(
  notes: readonly { content: string }[],
  authFetch: (path: string, init?: RequestInit) => Promise<Response>,
  active: () => boolean = () => true,
): Promise<void> {
  if (!isPhotoStorageAvailable()) return;
  let session = sessions.get(authFetch);
  if (!session) {
    session = { missing: new Map(), rejected: new Set() };
    sessions.set(authFetch, session);
  }
  const { missing, rejected } = session;
  const failed = (id: string) => {
    const failures = (missing.get(id)?.failures ?? 0) + 1;
    missing.set(id, { failures, retryAt: Date.now() + retryDelays[Math.min(failures - 1, retryDelays.length - 1)] });
  };
  const arrived: string[] = [];
  try {
    const ids = [...new Set(notes.flatMap(note => parseAssetRefs(note.content)))];
    for (const id of missing.keys()) if (!ids.includes(id)) missing.delete(id);
    let metas: Map<string, NoteAssetMeta> | undefined;
    const checkedAt = inventoryCheckedAt.get(authFetch);
    if (ids.length && (checkedAt === undefined || Date.now() - checkedAt >= 60_000)) {
      inventoryCheckedAt.set(authFetch, Date.now());
      try {
        metas = new Map((await listAssets()).map(meta => [meta.id, meta]));
        const local = [...metas.values()].filter(meta => ids.includes(meta.id) && meta.bytes > 0 && !rejected.has(meta.id));
        if (local.length && active()) {
          const response = await authFetch('/api/assets');
          if (!active()) return;
          if (response.ok) {
            const inventory: unknown = await response.json();
            if (Array.isArray(inventory)) {
              const remote = new Set(inventory.flatMap(entry => {
                const id = typeof entry === 'string' ? entry : entry?.id;
                return typeof id === 'string' && validId(id) ? [id] : [];
              }));
              for (const meta of local) if (!remote.has(meta.id) && active()) await queueUpload(meta.id);
              inventoryCheckedAt.set(authFetch, Date.now());
            }
          }
        }
      } catch { /* Inventory failures must not block pending uploads or downloads. */ }
    }
    const pending = await pendingUploads();
    if (pending.some(id => !rejected.has(id))) metas ??= new Map((await listAssets()).map(meta => [meta.id, meta]));
    for (const id of pending) {
      if (!active()) return;
      if (rejected.has(id)) { await markUploaded(id); continue; }
      const blob = await kvGetRaw(`noteAsset:${id}`);
      const meta = metas?.get(id);
      if (!(blob instanceof Blob) || !meta) continue;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      const response = await authFetch(`/api/assets/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mime: meta.mime, data: btoa(binary) }),
      });
      if (!active()) return;
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500 && ![401, 404, 408, 429].includes(response.status)) {
          rejected.add(id);
          await markUploaded(id);
          console.warn(`Dropped picture upload ${id}: server rejected it with HTTP ${response.status}.`);
          continue;
        }
        return; // transient/server/auth failures retry on the next successful note-sync round
      }
      await markUploaded(id);
    }
    let index = 0;
    const worker = async () => {
      while (active() && index < ids.length) {
        const id = ids[index++];
        try {
          if (await hasAsset(id)) { missing.delete(id); continue; }
          if ((missing.get(id)?.retryAt ?? 0) > Date.now()) continue;
          if (!active()) return;
          // CapacitorHttp text-decodes binary fetch bodies. JSON base64 is lossless on every platform.
          const response = await authFetch(`/api/assets/${id}?format=base64`);
          if (response.status === 404) {
            // A concurrent local restore/paste may have supplied bytes during the request.
            if (active() && !rejected.has(id) && await queueUpload(id)) invalidateAssetInventory(authFetch);
            failed(id);
            continue;
          }
          if (!response.ok) { failed(id); continue; }
          const payload = await response.json();
          const { mime, data } = payload;
          if ((payload.id !== undefined && payload.id !== id) || !['image/webp', 'image/jpeg', 'image/png'].includes(mime) ||
            typeof data !== 'string' || data.length > Math.ceil(MAX_ASSET_BYTES / 3) * 4) throw new Error('Invalid picture response.');
          const binary = atob(data);
          const bytes = new Uint8Array(binary.length);
          for (let offset = 0; offset < binary.length; offset++) bytes[offset] = binary.charCodeAt(offset);
          const blob = new Blob([bytes], { type: mime });
          let width = 0, height = 0;
          if (typeof createImageBitmap !== 'undefined') {
            try {
              const image = await createImageBitmap(blob);
              try { width = image.width; height = image.height; }
              finally { image.close(); }
            } catch {
              // A decoder failure must not discard hash-verified bytes or block other pictures.
              width = 0; height = 0;
            }
          }
          if (!active()) return;
          await storeAsset(blob, { mime: mime as NoteAssetMeta['mime'], width, height, createdAt: new Date().toISOString() }, false, id);
          missing.delete(id);
          arrived.push(id);
        } catch {
          if (active()) failed(id);
          // Isolate failures to this picture; other workers and later ids still make progress.
        }
      }
    };
    await Promise.all(Array.from({ length: 3 }, worker));
  } catch {
    // Network/storage failures do not change note-sync status and retry next round.
  } finally {
    if (arrived.length && active() && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('daymark-assets-changed', { detail: { ids: arrived } }));
    }
  }
}
