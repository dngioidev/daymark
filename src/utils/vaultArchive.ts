// JSZip is loaded on demand: it is only needed when exporting or importing
const loadJSZip = async () => (await import('jszip')).default;
import { AppSettings, DailyDocument, StandaloneNote } from '../types/daymark';
import { parseDailyDocument, serializeDailyDocument } from './markdownEngine';

export interface VaultSnapshot {
  docs: DailyDocument[];
  notes: StandaloneNote[];
  settings?: AppSettings;
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
  settings: AppSettings
): Promise<Uint8Array> {
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  const root = zip.folder('Daymark')!;
  const dailyFolder = root.folder('Daily')!;

  for (const doc of docs) {
    const [year, monthStr] = doc.date.split('-');
    const monthFolder = MONTH_NAMES[parseInt(monthStr, 10) - 1] || monthStr;
    dailyFolder.folder(year)!.folder(monthFolder)!.file(`${doc.date}.md`, serializeDailyDocument(doc));
  }

  const notesFolder = root.folder('Notes')!;
  const usedPaths = new Set<string>();
  for (const note of notes) {
    const folderName = note.folder || 'General';
    const safeTitle = note.title.replace(/[/\\?%*:|"<>]/g, '-').trim() || `note-${note.id}`;
    let fileName = `${safeTitle}.md`;
    // Two notes with the same title in one folder must not overwrite each other
    for (let n = 2; usedPaths.has(`${folderName}/${fileName}`); n++) fileName = `${safeTitle} (${n}).md`;
    usedPaths.add(`${folderName}/${fileName}`);
    notesFolder.folder(folderName)!.file(fileName, note.content);
  }

  const meta = root.folder('.daymark')!;
  meta.file('configuration.json', JSON.stringify(settings, null, 2));
  meta.file(
    'vault_manifest.json',
    JSON.stringify(
      {
        version: '1.1.0',
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
    JSON.stringify({ daymark_backup_version: '1.0', settings, daily_documents: docs, standalone_notes: notes })
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
      return {
        docs: parsed.daily_documents,
        notes: parsed.standalone_notes,
        settings: looksLikeSettings(parsed.settings) ? parsed.settings : undefined,
      };
    }
  }

  const docs: DailyDocument[] = [];
  const notes: StandaloneNote[] = [];
  const now = new Date().toISOString();
  let noteCounter = 0;

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
      notes.push({
        id: `note-import-${Date.now()}-${noteCounter++}`,
        title,
        folder: parts.join('/') || 'General',
        content: await zip.files[name].async('string'),
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
  docs.sort((a, b) => a.date.localeCompare(b.date));
  return { docs, notes, settings };
}
