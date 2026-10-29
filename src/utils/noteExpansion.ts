import type { NoteMeta, StandaloneNote } from '../types/daymark';
import { ancestorPaths } from './noteTree';
export function existingExpansionKeys(notes: StandaloneNote[], meta: NoteMeta): Set<string> {
  return new Set([...notes.map(note => note.folder), ...meta.folders.filter(folder => !folder.removed).map(folder => folder.path)].flatMap(ancestorPaths));
}
export function pruneNoteExpansion(expanded: Set<string>, valid: ReadonlySet<string>): Set<string> {
  const next = new Set([...expanded].filter(key => valid.has(key)));
  return next.size === expanded.size ? expanded : next;
}
export function migrateNoteExpansion(expanded: ReadonlySet<string>, from: string, to?: string): Set<string> {
  const source = ancestorPaths(from).at(-1) ?? '';
  const target = to ? ancestorPaths(to).at(-1) : undefined;
  const next = new Set<string>(); let migrated = false;
  for (const key of expanded) {
    if (key === source || key.startsWith(source + '/')) { if (target) { next.add(target + key.slice(source.length)); migrated = true; } }
    else next.add(key);
  }
  if (migrated && target) for (const parent of ancestorPaths(target).slice(0, -1)) next.add(parent);
  return next;
}
