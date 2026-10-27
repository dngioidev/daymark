// JSZip is loaded on demand: it is only needed when exporting or importing
const loadJSZip = async () => (await import('jszip')).default;
import { AppSettings, BacklogData, DailyDocument, HabitData, NoteAssetMeta, StandaloneNote } from '../types/daymark';
import { EMPTY_BACKLOG, visibleBacklog } from './backlog';
import { parseDailyDocument, serializeDailyDocument } from './markdownEngine';
import { isBacklogData, isHabitData, vaultProblem } from './vaultValidation';
import { assetRef, deleteAsset, invalidateAssetInventory, listAssets, MAX_ASSET_BYTES, parseAssetRefs, storeAsset } from './noteAssets';
import { isPhotoStorageAvailable, kvGetRaw } from './vaultStore';

interface BackupAsset { meta: NoteAssetMeta; data: string }
interface BinaryBackupAsset { meta: NoteAssetMeta; data: Uint8Array<ArrayBuffer> }

async function collectBackupAssets(notes: readonly { content: string }[], onMissing?: (count: number) => void): Promise<BinaryBackupAsset[]> {
  const ids = new Set(notes.flatMap(note => parseAssetRefs(note.content)));
  const metas = new Map((ids.size ? await listAssets() : []).map(meta => [meta.id, meta]));
  const assets: BinaryBackupAsset[] = [];
  let missing = 0;
  for (const id of ids) {
    const meta = metas.get(id);
    const blob = await kvGetRaw(`noteAsset:${id}`);
    if (!meta || !(blob instanceof Blob)) { missing++; continue; }
    assets.push({ meta, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  onMissing?.(missing);
  return assets;
}

/** Only pictures referenced by the exported notes belong in a backup. */
export async function exportBackupAssets(notes: readonly { content: string }[], onMissing?: (count: number) => void): Promise<BackupAsset[]> {
  const assets: BackupAsset[] = [];
  for (const { meta, data: bytes } of await collectBackupAssets(notes, onMissing)) {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    assets.push({ meta, data: btoa(binary) });
  }
  return assets;
}

function isAssetMeta(value: unknown): value is NoteAssetMeta {
  if (!value || typeof value !== 'object') return false;
  const meta = value as NoteAssetMeta;
  return typeof meta.id === 'string' && /^[a-f0-9]{64}$/.test(meta.id) && ['image/webp', 'image/jpeg', 'image/png'].includes(meta.mime) &&
    Number.isInteger(meta.bytes) && meta.bytes > 0 && meta.bytes <= MAX_ASSET_BYTES &&
    Number.isFinite(meta.width) && meta.width >= 0 && Number.isFinite(meta.height) && meta.height >= 0 &&
    typeof meta.createdAt === 'string';
}

/** Validate the entire batch before persisting; restored pictures must upload to peers. */
export async function importBackupAssets(value: unknown): Promise<number> {
  if (value === undefined) return 0; // older backups
  if (!Array.isArray(value)) throw new Error('Damaged backup pictures.');
  if (!isPhotoStorageAvailable()) return value.length;
  const assets: BinaryBackupAsset[] = [];
  for (const entry of value) {
    if (!entry || !isAssetMeta(entry.meta) || typeof entry.data !== 'string' || entry.data.length > Math.ceil(MAX_ASSET_BYTES / 3) * 4)
      throw new Error('Damaged backup picture metadata.');
    const binary = atob(entry.data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    assets.push({ meta: entry.meta, data: bytes });
  }
  return importBinaryAssets(assets);
}

async function importBinaryAssets(assets: BinaryBackupAsset[]): Promise<number> {
  if (!isPhotoStorageAvailable()) return assets.length;
  const checked: { meta: NoteAssetMeta; blob: Blob }[] = [];
  for (const { meta, data: bytes } of assets) {
    if (!isAssetMeta(meta)) throw new Error('Damaged backup picture metadata.');
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const id = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (id !== meta.id || bytes.length !== meta.bytes) throw new Error('Backup picture failed its integrity check.');
    checked.push({ meta, blob: new Blob([bytes], { type: meta.mime }) });
  }
  for (const { meta, blob } of checked) await storeAsset(blob, meta, true, meta.id);
  return 0;
}

/** Explicit cleanup only. Read notes after sync, and delete remotely before local bytes. */
export async function removeUnusedPictures(
  getNotes: () => readonly { content: string }[],
  server?: { sync: () => Promise<boolean>; authFetch: (path: string, init?: RequestInit) => Promise<Response> },
  beforeRemove?: () => void,
): Promise<number> {
  if (server && !await server.sync()) throw new Error('Sync did not complete. Try syncing again before removing unused pictures.');
  beforeRemove?.();
  if (server) invalidateAssetInventory(server.authFetch);
  let count = 0;
  for (const meta of await listAssets()) {
    // Re-read because notes can change while earlier deletions are in flight.
    if (getNotes().some(note => parseAssetRefs(note.content).includes(meta.id))) continue;
    if (server) {
      const response = await server.authFetch(`/api/assets/${meta.id}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) throw new Error(`Could not remove unused pictures (HTTP ${response.status}). Try again.`);
    }
    await deleteAsset(meta.id);
    count++;
  }
  return count;
}

export interface VaultSnapshot {
  docs: DailyDocument[];
  notes: StandaloneNote[];
  settings?: AppSettings;
  habits?: HabitData;
  backlog?: BacklogData;
  skippedPictures?: number;
}

/** Older backups have no habits; restoring those must preserve the current data. */
export function mergeRestoredHabits(current: HabitData, restored?: HabitData): HabitData {
  return restored ?? current;
}

/** Missing or damaged backlog in older backups must not erase the current data. */
export function mergeRestoredBacklog(current: BacklogData, restored?: unknown): BacklogData {
  return isBacklogData(restored) ? restored : current;
}

function backlogMarkdown(data: BacklogData): string {
  const groups = new Map<string, { label: string; titles: string[] }>();
  for (const item of visibleBacklog(data)) {
    const label = item.category?.trim() || 'Unsorted';
    const key = item.category?.trim().toLowerCase() || '';
    if (!groups.has(key)) groups.set(key, { label, titles: [] });
    groups.get(key)!.titles.push(item.title);
  }
  return [...groups.values()].map(group => `## ${group.label}\n\n${group.titles.map(title => `- [ ] ${title}`).join('\n')}\n`).join('\n');
}

const MONTH_NAMES = [
  '01-January', '02-February', '03-March', '04-April', '05-May', '06-June',
  '07-July', '08-August', '09-September', '10-October', '11-November', '12-December',
];

const SNAPSHOT_PATH = 'Daymark/.daymark/vault.json';

/**
 * Builds the vault ZIP, strictly matching the folder hierarchy in Section 5 of the PRD:
 * Daymark/
 * ├── Daily/YYYY/MM-Month/YYYY-MM-DD.md
 * ├── Notes/<Folder>/<Note>.md
 * └── .daymark/configuration.json, vault_manifest.json, vault.json
 *
 * The Markdown files are the human-readable copy (Obsidian compatible).
 * `vault.json` is a full-fidelity snapshot (task history, note ids/tags) that
 * import prefers, so a Daymark export restores exactly.
 */
export async function buildVaultZip(
  docs: DailyDocument[],
  notes: StandaloneNote[],
  settings: AppSettings,
  habits?: HabitData,
  onMissingPictures?: (count: number) => void,
  backlog: BacklogData = EMPTY_BACKLOG,
): Promise<Uint8Array> {
  const assets = await collectBackupAssets(notes, onMissingPictures);
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  const root = zip.folder('Daymark')!;
  const dailyFolder = root.folder('Daily')!;
  root.file('Backlog.md', backlogMarkdown(backlog));

  for (const doc of docs) {
    const [year, monthStr] = doc.date.split('-');
    const monthFolder = MONTH_NAMES[parseInt(monthStr, 10) - 1] || monthStr;
    dailyFolder.folder(year)!.folder(monthFolder)!.file(`${doc.date}.md`, serializeDailyDocument(doc));
  }

  const notesFolder = root.folder('Notes')!;
  const assetFiles = new Map(assets.map(({ meta }) => [meta.id, assetRef(meta.id, meta.mime).split(':')[1]]));
  for (const { meta, data } of assets) notesFolder.file(`_assets/${assetFiles.get(meta.id)}`, data);
  const usedPaths = new Set<string>();
  for (const note of notes) {
    const folderName = (note.folder || 'General').replace(/\\/g, '/').split('/')
      .filter(segment => segment && segment !== '.').map(segment => segment === '..' ? '_' : segment.replace(/[?%*:|"<>]/g, '-')).join('/') || 'General';
    const safeTitle = note.title.replace(/[/\\?%*:|"<>]/g, '-').trim() || `note-${note.id}`;
    let fileName = `${safeTitle}.md`;
    // Two notes with the same title in one folder must not overwrite each other
    for (let n = 2; usedPaths.has(`${folderName}/${fileName}`); n++) fileName = `${safeTitle} (${n}).md`;
    usedPaths.add(`${folderName}/${fileName}`);
    const depth = folderName.split('/').filter(Boolean).length;
    const markdown = note.content.replace(/daymark-asset:([a-f0-9]{64})\.(?:webp|jpeg|jpg|png)\b/g,
      (ref, id: string) => assetFiles.has(id) ? `${'../'.repeat(depth)}_assets/${assetFiles.get(id)}` : ref);
    notesFolder.folder(folderName)!.file(fileName, markdown);
  }

  const meta = root.folder('.daymark')!;
  meta.file('configuration.json', JSON.stringify(settings, null, 2));
  meta.file(
    'vault_manifest.json',
    JSON.stringify(
      {
        version: '1.7.0',
        exportedAt: new Date().toISOString(),
        totalDailyNotes: docs.length,
        totalStandaloneNotes: notes.length,
        exportFormat: 'Daymark Canonical Markdown + Metadata',
      },
      null,
      2
    )
  );
  meta.file(
    'vault.json',
    JSON.stringify({ daymark_backup_version: '1.0', settings, daily_documents: docs, standalone_notes: notes, habits, backlog, assets: assets.map(asset => asset.meta) })
  );

  return zip.generateAsync({ type: 'uint8array' });
}

function looksLikeSettings(value: unknown): value is AppSettings {
  return !!value && typeof value === 'object' && Array.isArray((value as AppSettings).statuses);
}

/**
 * Imports a vault ZIP. Uses the full-fidelity `vault.json` when present (Daymark exports);
 * otherwise falls back to parsing the Markdown files (e.g. a hand-made or Obsidian vault).
 */
export async function importVaultFromZip(
  data: ArrayBuffer | Uint8Array | Blob,
  defaultHeadings?: string[]
): Promise<VaultSnapshot> {
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(data);
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);

  const snapshotName = names.find((n) => n === SNAPSHOT_PATH || n.endsWith('.daymark/vault.json'));
  if (snapshotName) {
    const parsed = JSON.parse(await zip.files[snapshotName].async('string'));
    if (Array.isArray(parsed.daily_documents) && Array.isArray(parsed.standalone_notes)) {
      const problem = vaultProblem(parsed.daily_documents, parsed.standalone_notes);
      if (problem) throw new Error(problem);
      let skippedPictures = 0;
      if (parsed.assets !== undefined) {
        if (!Array.isArray(parsed.assets)) throw new Error('Damaged backup picture metadata.');
        if (!isPhotoStorageAvailable()) skippedPictures = parsed.assets.length;
        else {
          if (!parsed.assets.every(isAssetMeta)) throw new Error('Damaged backup picture metadata.');
          const assets: BinaryBackupAsset[] = [];
          const rootPath = snapshotName.slice(0, -'.daymark/vault.json'.length);
          for (const meta of parsed.assets as NoteAssetMeta[]) {
            const file = zip.file(`${rootPath}Notes/_assets/${assetRef(meta.id, meta.mime).split(':')[1]}`);
            if (!file) throw new Error('A backup picture is missing.');
            assets.push({ meta, data: new Uint8Array(await file.async('uint8array')) });
          }
          skippedPictures = await importBinaryAssets(assets);
        }
      }
      return {
        docs: parsed.daily_documents,
        notes: parsed.standalone_notes,
        settings: looksLikeSettings(parsed.settings) ? parsed.settings : undefined,
        habits: isHabitData(parsed.habits) ? parsed.habits : undefined,
        backlog: isBacklogData(parsed.backlog) ? parsed.backlog : undefined,
        skippedPictures,
      };
    }
  }

  const docs: DailyDocument[] = [];
  const notes: StandaloneNote[] = [];
  const assets: BinaryBackupAsset[] = [];
  const assetPaths = new Map<string, string>();
  const now = new Date().toISOString();
  let noteCounter = 0;
  let skippedPictures = 0;

  // A readable Markdown vault remains restorable even without the private snapshot.
  for (const name of names) {
    const normalized = name.replace(/\\/g, '/');
    if (!/(?:^|\/)Notes\/_assets\//.test(normalized)) continue;
    const match = normalized.match(/(?:^|\/)Notes\/_assets\/([a-f0-9]{64})\.(webp|jpeg|jpg|png)$/);
    if (!match || !isPhotoStorageAvailable()) { skippedPictures++; continue; }
    const bytes = new Uint8Array(await zip.files[name].async('uint8array'));
    if (!bytes.length || bytes.length > MAX_ASSET_BYTES) { skippedPictures++; continue; }
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    if (Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') !== match[1]) {
      skippedPictures++;
      continue;
    }
    const mime = match[2] === 'webp' ? 'image/webp' : match[2] === 'png' ? 'image/png' : 'image/jpeg';
    const meta: NoteAssetMeta = { id: match[1], mime, bytes: bytes.length, width: 0, height: 0, createdAt: now };
    assets.push({ meta, data: bytes });
    assetPaths.set(normalized, assetRef(meta.id, mime));
  }

  for (const name of names) {
    const normalized = name.replace(/\\/g, '/');
    const dailyMatch = normalized.match(/(?:^|\/)Daily\/(?:.*\/)?(\d{4}-\d{2}-\d{2})\.md$/);
    if (dailyMatch) {
      docs.push(parseDailyDocument(await zip.files[name].async('string'), dailyMatch[1], defaultHeadings));
      continue;
    }
    const noteMatch = normalized.match(/(?:^|\/)Notes\/(.+)\.md$/);
    if (noteMatch) {
      const parts = noteMatch[1].split('/');
      const title = parts.pop() as string;
      const markdown = await zip.files[name].async('string');
      const content = markdown.replace(/(?<![\w/.:~-])(?:\.\.?\/)*_assets\/[a-f0-9]{64}\.(?:webp|jpeg|jpg|png)\b/g, path => {
        const resolved = normalized.split('/').slice(0, -1);
        for (const part of path.split('/')) {
          if (part === '..') resolved.pop();
          else if (part !== '.') resolved.push(part);
        }
        return assetPaths.get(resolved.join('/')) ?? path;
      });
      notes.push({
        id: `note-import-${Date.now()}-${noteCounter++}`,
        title,
        folder: parts.join('/') || 'General',
        content,
        tags: [],
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  let settings: AppSettings | undefined;
  const configName = names.find((n) => n.endsWith('.daymark/configuration.json'));
  if (configName) {
    try {
      const parsed = JSON.parse(await zip.files[configName].async('string'));
      if (looksLikeSettings(parsed)) settings = parsed;
    } catch {
      // unreadable configuration is ignored; documents and notes still import
    }
  }

  if (docs.length === 0 && notes.length === 0) {
    throw new Error('No Daymark daily notes or standalone notes were found in this ZIP.');
  }
  const problem = vaultProblem(docs, notes);
  if (problem) throw new Error(problem);
  skippedPictures += await importBinaryAssets(assets);
  docs.sort((a, b) => a.date.localeCompare(b.date));
  return { docs, notes, settings, skippedPictures };
}
