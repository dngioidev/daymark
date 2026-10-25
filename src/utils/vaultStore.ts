import { AppSettings, DailyDocument, HabitData, StandaloneNote } from '../types/daymark';
import { EMPTY_HABITS, uneditedRecoveredHabits } from './habits';
import { DEFAULT_SETTINGS, normalizeSettings, SEED_DAILY_DOCUMENTS, SEED_STANDALONE_NOTES } from './defaultData';
import { buildVaultZip } from './vaultArchive';
import type { SyncState } from '../sync/syncClient';
import { isDailyDocument, isHabit, isHabitData, isHabitDay, isHabitTick, isStandaloneNote, isSyncedSettings } from './vaultValidation';
import { isNativeApp } from '../native/daymarkBridge';
import { LOGOUT_PENDING_KEY } from './logoutPending';
import { decideInitialAppearance } from './appearance';
import { isHabitEntityKey } from '../sync/merge';

/**
 * Vault persistence.
 *
 * Data lives in IndexedDB (no 5 MB localStorage ceiling, survives reloads, can be marked
 * persistent). A small in-memory cache is hydrated by `initVaultStore()` before React
 * renders, so the load*() functions stay synchronous. Writes update the cache immediately
 * and are queued to IndexedDB; failures are reported through `subscribeStorageErrors`.
 * If IndexedDB is unavailable (private mode, old browser) the store falls back to
 * localStorage and reports the degraded mode once.
 */

const DB_NAME = 'daymark';
const DB_VERSION = 1;
const STORE = 'kv';

const KEYS = {
  SETTINGS: 'settings',
  DAILY_DOCS: 'daily_docs',
  NOTES: 'notes',
  HABITS: 'habits',
  SYNC_STATE: 'sync_state',
  ONBOARDED: 'onboarded',
} as const;

// Legacy localStorage keys (versions before IndexedDB storage)
const LEGACY_KEYS: Record<string, string> = {
  [KEYS.SETTINGS]: 'daymark_settings_v1',
  [KEYS.DAILY_DOCS]: 'daymark_daily_docs_v1',
  [KEYS.NOTES]: 'daymark_notes_v1',
  [KEYS.HABITS]: 'daymark_habits_v1',
  [KEYS.SYNC_STATE]: 'daymark_sync_state_v1',
};

// The pre-Cycle-1 default for the date override; treated as "no override"
const LEGACY_SIMULATED_DATE = '2026-10-16';

const cache = new Map<string, unknown>();
let db: IDBDatabase | null = null;
let storageMode: 'indexeddb' | 'localstorage' = 'indexeddb';
let writeChain: Promise<void> = Promise.resolve();
let wiping = false;
let wipePromise: Promise<void> | null = null;

type ErrorListener = (message: string) => void;
const errorListeners = new Set<ErrorListener>();

export function subscribeStorageErrors(listener: ErrorListener): () => void {
  errorListeners.add(listener);
  return () => errorListeners.delete(listener);
}

function reportError(message: string, err?: unknown) {
  console.error(message, err);
  errorListeners.forEach((l) => l(message));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readAll(database: IDBDatabase): Promise<Map<string, unknown>> {
  return new Promise((resolve, reject) => {
    const out = new Map<string, unknown>();
    const req = database.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        const key = String(cursor.key);
        if (!key.startsWith('bgPhoto:') && !key.startsWith('bgThumb:') && !key.startsWith('noteAsset:')) out.set(key, cursor.value);
        cursor.continue();
      } else {
        resolve(out);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

function putValue(database: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Raw IndexedDB access bypasses the vault cache, broadcast and entity sync. */
export function isPhotoStorageAvailable(): boolean {
  return storageMode === 'indexeddb' && db !== null && !wiping;
}

export async function kvGetRaw(key: string): Promise<unknown> {
  if (!isPhotoStorageAvailable()) return undefined;
  await writeChain;
  if (!db || wiping) return undefined;
  return new Promise((resolve, reject) => {
    const req = db!.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Enumerate raw metadata keys without loading picture Blobs into memory. */
export async function kvKeysRaw(prefix: string): Promise<string[]> {
  if (!isPhotoStorageAvailable()) return [];
  await writeChain;
  if (!db || wiping) return [];
  return new Promise((resolve, reject) => {
    const keys: string[] = [];
    const req = db!.transaction(STORE, 'readonly').objectStore(STORE).openKeyCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve(keys);
      const key = String(cursor.key);
      if (key.startsWith(prefix)) keys.push(key);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

function rawWrite(key: string, value: unknown, remove: boolean): Promise<void> {
  if (!isPhotoStorageAvailable()) return Promise.reject(new Error('Photos need browser storage, which is unavailable here.'));
  const database = db!;
  const written = writeChain.then(() => {
    if (wiping) return;
    return new Promise<void>((resolve, reject) => {
      const tx = database.transaction(STORE, 'readwrite');
      if (remove) tx.objectStore(STORE).delete(key);
      else tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  });
  writeChain = written.catch((err) => reportError('Could not save your photo: browser storage is full or blocked.', err));
  return written;
}

export function kvPutRaw(key: string, value: unknown): Promise<void> {
  return rawWrite(key, value, false);
}

export function kvDeleteRaw(key: string): Promise<void> {
  return rawWrite(key, undefined, true);
}

function readLegacyLocalStorage(key: string): unknown {
  try {
    const raw = localStorage.getItem(LEGACY_KEYS[key]);
    if (!raw) return undefined;
    try { return JSON.parse(raw); } catch {
      // Keep a marker for unreadable habits so mount saves cannot replace stored data.
      return key === KEYS.HABITS ? null : undefined;
    }
  } catch {
    return undefined;
  }
}

/**
 * Hydrates the in-memory cache. Call once before rendering the app.
 * Never throws: on failure the app starts in localStorage fallback mode.
 */
export async function initVaultStore(): Promise<void> {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is not available');
    db = await openDb();
    db.onversionchange = () => {
      db?.close();
      db = null;
      reportError('Daymark storage changed in another tab. Please reload this tab.');
    };
    const stored = await readAll(db);
    stored.forEach((value, key) => cache.set(key, value));

    // One-time migration from the old localStorage layout. Legacy keys are left in place
    // as a backup; IndexedDB wins as soon as it holds data.
    if (!cache.has(KEYS.DAILY_DOCS) && !cache.has(KEYS.NOTES)) {
      for (const key of Object.keys(LEGACY_KEYS)) {
        const legacy = readLegacyLocalStorage(key);
        if (legacy !== undefined) {
          cache.set(key, legacy);
          await putValue(db, key, legacy);
        }
      }
    }

    // Ask the browser not to evict the vault under storage pressure
    navigator.storage?.persist?.().catch(() => undefined);
  } catch (err) {
    storageMode = 'localstorage';
    db = null;
    for (const key of Object.keys(LEGACY_KEYS)) {
      const legacy = readLegacyLocalStorage(key);
      if (legacy !== undefined) cache.set(key, legacy);
    }
    reportError('Browser storage (IndexedDB) is unavailable; using limited fallback storage.', err);
  }
}

export type SharedKey = 'daily_docs' | 'notes' | 'settings' | 'habits';
type ExternalListener = (key: SharedKey, value: unknown) => void;
const externalListeners = new Set<ExternalListener>();
const CHANNEL_NAME = 'daymark-vault';
const channel: BroadcastChannel | null = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME);

/** Accepts only well-formed messages for the shared keys; anything else is ignored. */
export function parseVaultMessage(data: unknown): { key: SharedKey; value: unknown } | null {
  if (!data || typeof data !== 'object') return null;
  const { key, value } = data as { key?: unknown; value?: unknown };
  if ((key === 'daily_docs' || key === 'notes') && Array.isArray(value)) return { key, value };
  if (key === 'settings' && isSyncedSettings(value)) return { key, value };
  if (key === 'habits' && isHabitData(value)) return { key, value };
  return null;
}

if (channel) {
  channel.onmessage = (event: MessageEvent) => {
    if (event.data?.type === 'wipe') {
      if (!wipePromise) void wipeLocalVault().then(() => location.replace('/')).catch((err) => reportError('Could not clear this browser vault.', err));
      return;
    }
    if (wiping) return;
    const msg = parseVaultMessage(event.data);
    if (!msg) return;
    try {
      cache.set(msg.key, msg.value);
      externalListeners.forEach((l) => l(msg.key, msg.value));
    } catch (err) {
      console.error('Could not apply a change from another tab', err);
    }
  };
}

/** Called when another tab or window changes the daily docs, notes, habits or settings. */
export function subscribeExternalChanges(listener: ExternalListener): () => void {
  externalListeners.add(listener);
  return () => externalListeners.delete(listener);
}

function writeValue(key: string, value: unknown): Promise<void> {
  if (wiping) return Promise.resolve();
  const previous = cache.get(key);
  // Loop guard: a value received from another tab is saved back by the same reference.
  // Settings are re-normalized into a new object, so they are compared by content.
  if (value === previous && key !== KEYS.SYNC_STATE) return writeChain;
  if (key === KEYS.SETTINGS && previous && JSON.stringify(value) === JSON.stringify(previous)) return writeChain;
  cache.set(key, value);
  if (key === KEYS.SETTINGS || key === KEYS.DAILY_DOCS || key === KEYS.NOTES || key === KEYS.HABITS) {
    try {
      channel?.postMessage({ key, value });
    } catch {
      // Not cloneable or channel closed; the other tab will pick the change up on its next load.
    }
  }
  if (storageMode === 'localstorage' || !db) {
    const legacyKey = LEGACY_KEYS[key];
    if (!legacyKey) return Promise.resolve();
    try {
      localStorage.setItem(legacyKey, JSON.stringify(value));
    } catch (err) {
      reportError('Could not save your changes: browser storage is full or blocked.', err);
      const failed = Promise.reject<void>(err);
      // Keep fire-and-forget callers handled; credential writes still observe failure.
      void failed.catch(() => undefined);
      return failed;
    }
    return Promise.resolve();
  }
  const database = db;
  const written = writeChain.then(() => putValue(database, key, value));
  writeChain = written.catch((err) => reportError('Could not save your changes: browser storage is full or blocked.', err));
  return written;
}

function readArray<T>(key: string, fallback: T[]): T[] {
  const value = cache.get(key);
  return Array.isArray(value) ? (value as T[]) : fallback;
}

/** Drops entries damaged by an earlier bad restore so the app can still open. */
export function keepValid<T>(items: unknown[], isValid: (v: unknown) => v is T, label: string): T[] {
  const valid = items.filter(isValid);
  if (valid.length === items.length) return items as T[]; // keep identity with the cached array
  console.error(`Ignored ${items.length - valid.length} damaged ${label} entries.`);
  return valid;
}

/** Like keepValid, but caches the cleaned array (no persistence) so later loads return the same one. */
function loadValid<T>(key: string, isValid: (v: unknown) => v is T, label: string): T[] {
  const items = readArray<unknown>(key, []);
  const valid = keepValid(items, isValid, label);
  if (valid !== items) cache.set(key, valid);
  return valid;
}

export function loadSettings(): AppSettings {
  const value = cache.get(KEYS.SETTINGS) as AppSettings | undefined;
  let settings = value ?? DEFAULT_SETTINGS;
  if (!value?.appearance) {
    const hasExistingData = [KEYS.SETTINGS, KEYS.DAILY_DOCS, KEYS.NOTES].some(
      (key) => cache.has(key) || readLegacyLocalStorage(key) !== undefined,
    );
    const systemPrefersDark = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    settings = { ...settings, appearance: decideInitialAppearance(hasExistingData, systemPrefersDark) };
    saveSettings(settings);
  }
  // Older versions defaulted the date override to a fixed demo date
  return normalizeSettings(settings.simulatedToday === LEGACY_SIMULATED_DATE ? { ...settings, simulatedToday: '' } : settings);
}

export function saveSettings(settings: AppSettings): void {
  writeValue(KEYS.SETTINGS, settings);
}

export function loadDailyDocuments(): DailyDocument[] {
  return loadValid(KEYS.DAILY_DOCS, isDailyDocument, 'day');
}

export function saveDailyDocuments(docs: DailyDocument[]): void {
  writeValue(KEYS.DAILY_DOCS, docs);
}

export function loadStandaloneNotes(): StandaloneNote[] {
  return loadValid(KEYS.NOTES, isStandaloneNote, 'note');
}

export function saveStandaloneNotes(notes: StandaloneNote[]): void {
  writeValue(KEYS.NOTES, notes);
}

export function loadHabits(): HabitData {
  const value = cache.get(KEYS.HABITS);
  if (isHabitData(value)) return value;
  if (!cache.has(KEYS.HABITS)) return EMPTY_HABITS;
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const habits = keepValid(Array.isArray(raw.habits) ? raw.habits : [], isHabit, 'habit');
  const days = (Array.isArray(raw.days) ? raw.days : []).map((day: unknown) => {
    if (!day || typeof day !== 'object' || !('ticks' in day) || !day.ticks || typeof day.ticks !== 'object' || Array.isArray(day.ticks)) return day;
    const entries = Object.entries(day.ticks);
    const valid = entries.filter(([, tick]) => isHabitTick(tick));
    if (valid.length === entries.length) return day;
    console.error(`Ignored ${entries.length - valid.length} damaged habit tick entries.`);
    return { ...day, ticks: Object.fromEntries(valid) };
  });
  const recovered = { habits, days: keepValid(days, isHabitDay, 'habit day') };
  // Dropped values are damage, not intentional deletions. Forget only habit bases
  // and backfill their full history before accepting another incremental cursor.
  const syncState = loadSyncState();
  if (syncState) {
    const bases = Object.fromEntries(Object.entries(syncState.bases).filter(([key]) => !isHabitEntityKey(key)));
    void saveSyncState({ ...syncState, bases, habitsSynced: false }).catch(() => undefined);
  }
  console.error('Recovered damaged habit storage; keeping the stored value until habits are edited.');
  uneditedRecoveredHabits.add(recovered);
  cache.set(KEYS.HABITS, recovered);
  return recovered;
}

export function saveHabits(data: HabitData): void {
  if (uneditedRecoveredHabits.has(data)) return;
  writeValue(KEYS.HABITS, data);
}

/** Per-device sync bookkeeping (server, token, last agreed versions); never synced itself. */
export function loadSyncState(): SyncState | null {
  return (cache.get(KEYS.SYNC_STATE) as SyncState | undefined) ?? null;
}

export function saveSyncState(state: SyncState | null): Promise<void> {
  return writeValue(KEYS.SYNC_STATE, state);
}

/** Remove this browser's vault after its server session ends. */
export function wipeLocalVault(): Promise<void> {
  if (wipePromise) return wipePromise;
  wiping = true;
  cache.clear();
  wipePromise = (async () => {
    channel?.postMessage({ type: 'wipe' });
    await writeChain;
    db?.close();
    db = null;
    if (typeof indexedDB !== 'undefined') {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        // The deletion request remains queued and completes when old tabs close.
        // Do not let an old bundle block the rest of the sign-out cleanup.
        request.onblocked = () => resolve();
      });
    }
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith('daymark') && key !== LOGOUT_PENDING_KEY) localStorage.removeItem(key);
    }
    if (typeof caches !== 'undefined') {
      await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
    }
  })().catch((err) => { wipePromise = null; wiping = false; throw err; });
  return wipePromise;
}

/** True once the user has chosen how to start (empty vault or sample data), or has any data. */
export function needsOnboarding(): boolean {
  if (cache.get(KEYS.ONBOARDED)) return false;
  return loadDailyDocuments().length === 0 && loadStandaloneNotes().length === 0;
}

export function markOnboarded(): void {
  writeValue(KEYS.ONBOARDED, true);
}

/**
 * Replaces the vault with the demonstration sample data.
 */
export function resetVaultToSeedData(): {
  settings: AppSettings;
  docs: DailyDocument[];
  notes: StandaloneNote[];
  habits: HabitData;
} {
  saveSettings(DEFAULT_SETTINGS);
  saveDailyDocuments(SEED_DAILY_DOCUMENTS);
  saveStandaloneNotes(SEED_STANDALONE_NOTES);
  saveHabits(EMPTY_HABITS);
  markOnboarded();
  return {
    settings: DEFAULT_SETTINGS,
    docs: SEED_DAILY_DOCUMENTS,
    notes: SEED_STANDALONE_NOTES,
    habits: EMPTY_HABITS,
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Saves a file for the user. Browsers download it; the Android app (whose WebView cannot handle
 * blob downloads) writes it to the app cache and opens the system share sheet (Drive, Files, email...).
 */
async function downloadBlob(blob: Blob, filename: string): Promise<boolean> {
  if (isNativeApp()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const written = await Filesystem.writeFile({
      path: filename,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
    });
    try {
      await Share.share({ title: filename, url: written.uri, dialogTitle: 'Save your Daymark backup' });
    } catch (err) {
      // Closing the share sheet without picking a target is a choice, not a failure
      if (isShareCancel(err)) return false;
      throw err;
    }
    return true;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

export const isShareCancel = (err: unknown): boolean => /cancel/i.test(err instanceof Error ? err.message : String(err));

const LAST_BACKUP_KEY = 'daymark_last_backup';

/** ISO date of the last completed export on this device, or null. */
export function getLastBackupDate(): string | null {
  return localStorage.getItem(LAST_BACKUP_KEY);
}

function recordBackup(saved: boolean): boolean {
  if (saved) localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  return saved;
}

/**
 * Exports the complete Daymark Vault as a standard .zip archive (see buildVaultZip).
 */
export async function exportVaultAsZip(
  docs: DailyDocument[],
  notes: StandaloneNote[],
  settings: AppSettings,
  habits: HabitData
): Promise<boolean> {
  const bytes = await buildVaultZip(docs, notes, settings, habits);
  return recordBackup(await downloadBlob(new Blob([bytes as BlobPart], { type: 'application/zip' }), `daymark-vault-${new Date().toISOString().split('T')[0]}.zip`));
}

/**
 * Downloads full JSON snapshot backup
 */
export async function exportVaultAsJson(
  docs: DailyDocument[],
  notes: StandaloneNote[],
  settings: AppSettings,
  habits: HabitData
): Promise<boolean> {
  const bundle = {
    daymark_backup_version: '1.0',
    exported_at: new Date().toISOString(),
    settings,
    daily_documents: docs,
    standalone_notes: notes,
    habits,
  };
  return recordBackup(
    await downloadBlob(
      new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }),
      `daymark-backup-${new Date().toISOString().split('T')[0]}.json`
    )
  );
}
