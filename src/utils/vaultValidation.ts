import type { DailyDocument, StandaloneNote } from '../types/daymark';

// Pure structural checks (no DOM/React) shared by restore, load and server sync.

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';

function isTaskLike(v: unknown): boolean {
  return isObject(v) && isString(v.id) && isString(v.title) && isString(v.status) && isString(v.createdDate);
}

export function isDailyDocument(v: unknown): v is DailyDocument {
  if (!isObject(v) || !isString(v.date) || !/^\d{4}-\d{2}-\d{2}$/.test(v.date) || !Array.isArray(v.headings)) return false;
  if (v.removedTaskIds !== undefined && !(Array.isArray(v.removedTaskIds) && v.removedTaskIds.every(isString))) return false;
  return v.headings.every((h) => isObject(h) && isString(h.name) && Array.isArray(h.items) && h.items.every(isTaskLike));
}

export function isStandaloneNote(v: unknown): v is StandaloneNote {
  return (
    isObject(v) && isString(v.id) && isString(v.title) && isString(v.content) && isString(v.folder) && Array.isArray(v.tags)
  );
}

export function isSyncedSettings(v: unknown): boolean {
  return isObject(v) && Array.isArray(v.statuses) && Array.isArray(v.defaultHeadings);
}

/** Returns null when the vault is usable, otherwise a sentence explaining why not. */
export function vaultProblem(docs: unknown, notes: unknown): string | null {
  if (!Array.isArray(docs) || !Array.isArray(notes)) return "This isn't a Daymark backup.";
  const seen = new Set<string>();
  for (let i = 0; i < docs.length; i++) {
    const doc: unknown = docs[i];
    if (!isDailyDocument(doc)) return `This backup is damaged: day ${i + 1} can't be read.`;
    if (seen.has(doc.date)) return `This backup has ${doc.date} twice.`;
    seen.add(doc.date);
  }
  for (let i = 0; i < notes.length; i++) {
    if (!isStandaloneNote(notes[i])) return `This backup is damaged: note ${i + 1} can't be read.`;
  }
  return null;
}
