import { isInkEntityKey, parseInkKey } from '../src/ink/inkModel';
import type { DailyDocument } from '../src/types/daymark';
import { sameValue } from '../src/sync/merge';
import { reconcileBacklogVault } from '../src/utils/backlog';
import { isInkPage, isNoteMeta, isBacklogData, isDailyDocument, isHabitData, isStandaloneNote, isSyncedSettings } from '../src/utils/vaultValidation';
import type { FileStore } from './store';

/** Shape check for a sync value against its entity key. */
export function isValidEntityValue(key: string, value: unknown): boolean {
  if (isInkEntityKey(key)) {
    const identity = parseInkKey(key)!;
    return isInkPage(value) && value.noteId === identity.noteId && value.page === identity.page;
  }
  if (key === 'notemeta') return isNoteMeta(value);
  if (key === 'backlog') return isBacklogData(value);
  if (key === 'habits') return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    isHabitData({ habits: (value as Record<string, unknown>).habits, days: [] });
  if (key.startsWith('habitday:')) return isHabitData({ habits: [], days: [value] }) &&
    (value as { date: string }).date === key.slice(9);
  if (key.startsWith('doc:')) return isDailyDocument(value) && value.date === key.slice(4);
  if (key.startsWith('note:')) return isStandaloneNote(value) && value.id === key.slice(5);
  return isSyncedSettings(value);
}

export class VaultQueue {
  private queue: Promise<unknown> = Promise.resolve();

  run<T>(job: () => Promise<T>): Promise<T> {
    const result = this.queue.then(job);
    this.queue = result.catch(() => undefined);
    return result;
  }
}

export function writeEntity(store: FileStore, key: string, value: unknown | null, actorId: string, nowIso: string): void {
  store.vault.rev += 1;
  store.vault.entities[key] = { rev: store.vault.rev, value, updatedBy: actorId, updatedAt: nowIso };
}

export function reconcileBacklogAfterWrite(store: FileStore, actorId: string, nowIso: string, touched: Set<string>, backlogCapable: boolean): void {
  const backlog = store.vault.entities.backlog?.value;
  if (isBacklogData(backlog)) {
    const docs = Object.entries(store.vault.entities).filter(([key, e]) => key.startsWith('doc:') && isValidEntityValue(key, e.value)).map(([, e]) => e.value as DailyDocument);
    const reconciled = reconcileBacklogVault(backlog, docs, backlogCapable);
    for (const doc of reconciled.docs) {
      const key = `doc:${doc.date}`;
      if (!sameValue(store.vault.entities[key]?.value, doc)) { writeEntity(store, key, doc, actorId, nowIso); touched.add(key); }
    }
    if (!sameValue(backlog, reconciled.backlog)) writeEntity(store, 'backlog', reconciled.backlog, actorId, nowIso);
  }
}
