import { AppSettings, DailyDocument, StandaloneNote } from '../types/daymark';
import { DEFAULT_SETTINGS, normalizeSettings, SEED_DAILY_DOCUMENTS, SEED_STANDALONE_NOTES } from './defaultData';
import { buildVaultZip } from './vaultArchive';
import type { SyncState } from '../sync/syncClient';
import { isNativeApp } from '../native/daymarkBridge';

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
  SYNC_STATE: 'sync_state',
  ONBOARDED: 'onboarded',
} as const;

// Legacy localStorage keys (versions before IndexedDB storage)
const LEGACY_KEYS: Record<string, string> = {
  [KEYS.SETTINGS]: 'daymark_settings_v1',
  [KEYS.DAILY_DOCS]: 'daymark_daily_docs_v1',
  [KEYS.NOTES]: 'daymark_notes_v1',
};

// The pre-Cycle-1 default for the date override; treated as "no override"
const LEGACY_SIMULATED_DATE = '2026-10-16';

const cache = new Map<string, unknown>();
let db: IDBDatabase | null = null;
let storageMode: 'indexeddb' | 'localstorage' = 'indexeddb';
let writeChain: Promise<void> = Promise.resolve();

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
        out.set(String(cursor.key), cursor.value);
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

function readLegacyLocalStorage(key: string): unknown {
  try {
    const raw = localStorage.getItem(LEGACY_KEYS[key]);
    return raw ? JSON.parse(raw) : undefined;
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

function writeValue(key: string, value: unknown): void {
  cache.set(key, value);
  if (storageMode === 'localstorage' || !db) {
    const legacyKey = LEGACY_KEYS[key];
    if (!legacyKey) return;
    try {
      localStorage.setItem(legacyKey, JSON.stringify(value));
    } catch (err) {
      reportError('Could not save your changes: browser storage is full or blocked.', err);
    }
    return;
  }
  const database = db;
  writeChain = writeChain
    .then(() => putValue(database, key, value))
    .catch((err) => reportError('Could not save your changes: browser storage is full or blocked.', err));
}

function readArray<T>(key: string, fallback: T[]): T[] {
  const value = cache.get(key);
  return Array.isArray(value) ? (value as T[]) : fallback;
}

export function loadSettings(): AppSettings {
  const value = cache.get(KEYS.SETTINGS) as AppSettings | undefined;
  if (!value) return DEFAULT_SETTINGS;
  // Older versions defaulted the date override to a fixed demo date
  return normalizeSettings(value.simulatedToday === LEGACY_SIMULATED_DATE ? { ...value, simulatedToday: '' } : value);
}

export function saveSettings(settings: AppSettings): void {
  writeValue(KEYS.SETTINGS, settings);
}

export function loadDailyDocuments(): DailyDocument[] {
  return readArray<DailyDocument>(KEYS.DAILY_DOCS, []);
}

export function saveDailyDocuments(docs: DailyDocument[]): void {
  writeValue(KEYS.DAILY_DOCS, docs);
}

export function loadStandaloneNotes(): StandaloneNote[] {
  return readArray<StandaloneNote>(KEYS.NOTES, []);
}

export function saveStandaloneNotes(notes: StandaloneNote[]): void {
  writeValue(KEYS.NOTES, notes);
}

/** Per-device sync bookkeeping (server, token, last agreed versions); never synced itself. */
export function loadSyncState(): SyncState | null {
  return (cache.get(KEYS.SYNC_STATE) as SyncState | undefined) ?? null;
}

export function saveSyncState(state: SyncState | null): void {
  writeValue(KEYS.SYNC_STATE, state);
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
} {
  saveSettings(DEFAULT_SETTINGS);
  saveDailyDocuments(SEED_DAILY_DOCUMENTS);
  saveStandaloneNotes(SEED_STANDALONE_NOTES);
  markOnboarded();
  return {
    settings: DEFAULT_SETTINGS,
    docs: SEED_DAILY_DOCUMENTS,
    notes: SEED_STANDALONE_NOTES,
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
  settings: AppSettings
): Promise<boolean> {
  const bytes = await buildVaultZip(docs, notes, settings);
  return recordBackup(await downloadBlob(new Blob([bytes as BlobPart], { type: 'application/zip' }), `daymark-vault-${new Date().toISOString().split('T')[0]}.zip`));
}

/**
 * Downloads full JSON snapshot backup
 */
export async function exportVaultAsJson(
  docs: DailyDocument[],
  notes: StandaloneNote[],
  settings: AppSettings
): Promise<boolean> {
  const bundle = {
    daymark_backup_version: '1.0',
    exported_at: new Date().toISOString(),
    settings,
    daily_documents: docs,
    standalone_notes: notes,
  };
  return recordBackup(
    await downloadBlob(
      new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }),
      `daymark-backup-${new Date().toISOString().split('T')[0]}.json`
    )
  );
}
