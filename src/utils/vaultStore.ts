import JSZip from 'jszip';
import { AppSettings, DailyDocument, StandaloneNote } from '../types/daymark';
import { DEFAULT_SETTINGS, SEED_DAILY_DOCUMENTS, SEED_STANDALONE_NOTES } from './defaultData';
import { serializeDailyDocument } from './markdownEngine';

const STORAGE_KEYS = {
  SETTINGS: 'daymark_settings_v1',
  DAILY_DOCS: 'daymark_daily_docs_v1',
  NOTES: 'daymark_notes_v1',
  SYNC_LOG: 'daymark_sync_log_v1',
};

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  status: 'applied' | 'pending';
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Failed to parse settings from storage:', err);
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (err) {
    console.error('Failed to save settings:', err);
  }
}

export function loadDailyDocuments(): DailyDocument[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DAILY_DOCS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to load daily docs:', err);
  }
  return SEED_DAILY_DOCUMENTS;
}

export function saveDailyDocuments(docs: DailyDocument[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.DAILY_DOCS, JSON.stringify(docs));
  } catch (err) {
    console.error('Failed to save daily docs:', err);
  }
}

export function loadStandaloneNotes(): StandaloneNote[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.NOTES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to load standalone notes:', err);
  }
  return SEED_STANDALONE_NOTES;
}

export function saveStandaloneNotes(notes: StandaloneNote[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(notes));
  } catch (err) {
    console.error('Failed to save standalone notes:', err);
  }
}

export function loadSyncLogs(): SyncLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SYNC_LOG);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Failed to load sync log:', err);
  }
  return [
    {
      id: 'log-1',
      timestamp: '2026-10-16T04:15:00Z',
      action: 'snapshot_sync',
      details: 'Synchronized 3 daily docs and 4 standalone notes with self-hosted server',
      status: 'applied',
    },
    {
      id: 'log-2',
      timestamp: '2026-10-16T04:18:22Z',
      action: 'rollover_reconciliation',
      details: 'Evaluated carry-forward tasks for Oct 16. Idempotent check passed.',
      status: 'applied',
    },
  ];
}

export function saveSyncLogs(logs: SyncLogEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SYNC_LOG, JSON.stringify(logs.slice(-50)));
  } catch (err) {
    console.error('Failed to save sync log:', err);
  }
}

/**
 * Resets storage back to initial demonstration seed data.
 */
export function resetVaultToSeedData(): {
  settings: AppSettings;
  docs: DailyDocument[];
  notes: StandaloneNote[];
} {
  saveSettings(DEFAULT_SETTINGS);
  saveDailyDocuments(SEED_DAILY_DOCUMENTS);
  saveStandaloneNotes(SEED_STANDALONE_NOTES);
  return {
    settings: DEFAULT_SETTINGS,
    docs: SEED_DAILY_DOCUMENTS,
    notes: SEED_STANDALONE_NOTES,
  };
}

/**
 * Exports the complete Daymark Vault as a standard .zip archive,
 * strictly matching the folder hierarchy in Section 5 of the PRD:
 * Daymark/
 * ├── Daily/YYYY/MM-Month/YYYY-MM-DD.md
 * ├── Notes/<Folder>/<Note>.md
 * └── .daymark/configuration.json
 */
export async function exportVaultAsZip(
  docs: DailyDocument[],
  notes: StandaloneNote[],
  settings: AppSettings
): Promise<void> {
  const zip = new JSZip();
  const root = zip.folder('Daymark');
  if (!root) return;

  const monthNames = [
    '01-January', '02-February', '03-March', '04-April', '05-May', '06-June',
    '07-July', '08-August', '09-September', '10-October', '11-November', '12-December',
  ];

  // 1. Daily Documents
  const dailyFolder = root.folder('Daily');
  for (const doc of docs) {
    const [year, monthStr] = doc.date.split('-');
    const monthNum = parseInt(monthStr, 10);
    const monthFolder = monthNames[monthNum - 1] || monthStr;
    const pathFolder = dailyFolder?.folder(year)?.folder(monthFolder);

    const mdContent = serializeDailyDocument(doc);
    pathFolder?.file(`${doc.date}.md`, mdContent);
  }

  // 2. Standalone Notes
  const notesFolder = root.folder('Notes');
  for (const note of notes) {
    const folderName = note.folder || 'General';
    const sub = notesFolder?.folder(folderName);
    const safeTitle = note.title.replace(/[/\\?%*:|"<>]/g, '-').trim() || `note-${note.id}`;
    sub?.file(`${safeTitle}.md`, note.content);
  }

  // 3. .daymark Metadata & Config
  const metaFolder = root.folder('.daymark');
  metaFolder?.file('configuration.json', JSON.stringify(settings, null, 2));
  metaFolder?.file(
    'vault_manifest.json',
    JSON.stringify(
      {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        totalDailyNotes: docs.length,
        totalStandaloneNotes: notes.length,
        exportFormat: 'Daymark Canonical Markdown + Metadata',
      },
      null,
      2
    )
  );

  // Generate ZIP blob and trigger download
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `daymark-vault-${new Date().toISOString().split('T')[0]}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Downloads full JSON snapshot backup
 */
export function exportVaultAsJson(
  docs: DailyDocument[],
  notes: StandaloneNote[],
  settings: AppSettings
): void {
  const bundle = {
    daymark_backup_version: '1.0',
    exported_at: new Date().toISOString(),
    settings,
    daily_documents: docs,
    standalone_notes: notes,
  };
  const jsonStr = JSON.stringify(bundle, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `daymark-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
