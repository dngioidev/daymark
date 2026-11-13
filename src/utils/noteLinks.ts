import type { StandaloneNote } from '../types/daymark';
import { normalizeFolderPath } from './noteFolders';

type LinkableNote = Pick<StandaloneNote, 'id' | 'title' | 'folder' | 'updatedAt'>;

const key = (text: string) => text.trim().toLowerCase();

/**
 * Finds the note a `[[link]]` points to. Titles match case-insensitively and ignore surrounding
 * whitespace, across all folders. `[[Folder/Sub/Title]]` narrows to that folder, and an Obsidian
 * alias (`[[Title|shown text]]`) is ignored. Several matches prefer `fromFolder`, then the most
 * recently updated note. Returns undefined when nothing matches.
 */
export function resolveNoteLink<T extends LinkableNote>(notes: readonly T[], link: string, fromFolder?: string): T | undefined {
  const target = link.split('|')[0].trim();
  if (!target) return undefined;
  const pick = (candidates: T[]): T | undefined => {
    if (candidates.length < 2) return candidates[0];
    const here = fromFolder === undefined ? [] : candidates.filter(note => key(note.folder) === key(normalizeFolderPath(fromFolder)));
    return [...(here.length ? here : candidates)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  };
  const slash = target.lastIndexOf('/');
  if (slash > 0) {
    const folder = key(normalizeFolderPath(target.slice(0, slash)));
    const title = key(target.slice(slash + 1));
    const inFolder = notes.filter(note => key(note.title) === title && key(normalizeFolderPath(note.folder)) === folder);
    if (inFolder.length) return pick(inFolder);
  }
  // A title may itself contain "/", so fall back to the whole text.
  return pick(notes.filter(note => key(note.title) === key(target)));
}
