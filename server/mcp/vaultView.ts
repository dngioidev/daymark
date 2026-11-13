import type {
  AgingThresholds, BacklogData, DailyDocument, HabitData, HabitDay, NoteMeta,
  StandaloneNote, StatusDefinition,
} from '../../src/types/daymark';
import type { SyncedSettings } from '../../src/sync/merge';
import { EMPTY_BACKLOG } from '../../src/utils/backlog';
import { DEFAULT_SETTINGS } from '../../src/utils/defaultData';
import { EMPTY_HABITS } from '../../src/utils/habits';
import { getPreviousDate, performDailyRollover } from '../../src/utils/lifecycleEngine';
import type { FileStore } from '../store';
import { isValidEntityValue } from '../vault';

export function todayIn(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/** Read a detached value so a tool cannot mutate the vault before its write is accepted. */
function readEntity<T>(store: FileStore, key: string): T | undefined {
  const value = store.vault.entities[key]?.value;
  return value != null && isValidEntityValue(key, value) ? structuredClone(value) as T : undefined;
}

function readEntities<T>(store: FileStore, prefix: string): T[] {
  return Object.keys(store.vault.entities).filter(key => key.startsWith(prefix)).flatMap(key => {
    const value = readEntity<T>(store, key);
    return value === undefined ? [] : [value];
  });
}

export function readDocs(store: FileStore): DailyDocument[] {
  return readEntities<DailyDocument>(store, 'doc:').sort((a, b) => a.date.localeCompare(b.date));
}

export function readNotes(store: FileStore): StandaloneNote[] {
  return readEntities<StandaloneNote>(store, 'note:');
}

export function readBacklog(store: FileStore): BacklogData {
  return readEntity<BacklogData>(store, 'backlog') ?? structuredClone(EMPTY_BACKLOG);
}

export function readHabits(store: FileStore): HabitData {
  const result = structuredClone(EMPTY_HABITS);
  result.habits = readEntity<Pick<HabitData, 'habits'>>(store, 'habits')?.habits ?? result.habits;
  result.days = readEntities<HabitDay>(store, 'habitday:').sort((a, b) => a.date.localeCompare(b.date));
  return result;
}

export function readSettings(store: FileStore): {
  statuses: StatusDefinition[]; defaultHeadings: string[]; agingThresholds: AgingThresholds;
} {
  const settings = readEntity<Partial<SyncedSettings>>(store, 'settings');
  return structuredClone({
    statuses: settings?.statuses ?? DEFAULT_SETTINGS.statuses,
    defaultHeadings: settings?.defaultHeadings ?? DEFAULT_SETTINGS.defaultHeadings,
    agingThresholds: { ...DEFAULT_SETTINGS.agingThresholds, ...settings?.agingThresholds },
  });
}

export function dayView(store: FileStore, date: string, today: string): DailyDocument {
  const docs = readDocs(store);
  const { statuses, defaultHeadings } = readSettings(store);
  const doc = date === today
    ? performDailyRollover(date, docs, statuses, defaultHeadings).updatedDocs.find(d => d.date === date)!
    : docs.find(d => d.date === date) ?? {
      date, type: 'daily', updatedAt: new Date().toISOString(),
      headings: defaultHeadings.map(name => ({ name, items: [], notesContent: '' })),
    };
  delete doc.rawMarkdown;
  return doc;
}

/** Prepare a day for the caller's attributed, revisioned write; does not persist it. */
export function ensureDay(store: FileStore, date: string, today: string): { doc: DailyDocument; created: boolean } {
  const created = readEntity<DailyDocument>(store, `doc:${date}`) === undefined;
  return { doc: dayView(store, date, today), created };
}

export function knownHeadings(store: FileStore, today: string): string[] {
  const earliest = getPreviousDate(today, 29);
  const names = [
    ...readSettings(store).defaultHeadings,
    ...readDocs(store).filter(doc => doc.date >= earliest && doc.date <= today).flatMap(doc => doc.headings.map(h => h.name)),
  ];
  const seen = new Set<string>();
  return names.filter(name => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function readNoteMeta(store: FileStore): NoteMeta {
  return readEntity<NoteMeta>(store, 'notemeta') ?? { folders: [], dismissed: [] };
}

export function knownFolders(store: FileStore): string[] {
  const paths = [
    ...readNotes(store).map(note => note.folder),
    ...(readEntity<NoteMeta>(store, 'notemeta')?.folders ?? []).filter(folder => !folder.removed).map(folder => folder.path),
  ];
  const folders = new Set<string>();
  for (const path of paths) {
    const parts = path.split('/');
    for (let i = 1; i <= parts.length; i++) folders.add(parts.slice(0, i).join('/'));
  }
  return [...folders];
}
