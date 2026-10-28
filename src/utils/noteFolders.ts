import type { NoteFolder, NoteMeta, StandaloneNote } from '../types/daymark';

/** Recovered data is read-only until an explicit edit; also consumed by sync. */
export const uneditedRecoveredNoteMeta = new WeakSet<NoteMeta>();
const folderCollator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

export function normalizeFolderPath(input: string): string {
  return input.split('/').map(part => part.trim()).filter(Boolean).join('/');
}

const pathKey = (path: string): string => normalizeFolderPath(path).toLowerCase();
const containsPath = (path: string, parent: string): boolean => !parent || path === parent || path.startsWith(`${parent}/`);
const parentPath = (path: string): string => path.split('/').slice(0, -1).join('/');

/** Keeps the first spelling of each ancestor as well as each complete path. */
function canonicalPath(path: string, spellings: Map<string, string>): string {
  let result = '';
  for (const part of normalizeFolderPath(path).split('/').filter(Boolean)) {
    const next = result ? `${result}/${part}` : part;
    const key = next.toLowerCase();
    if (!spellings.has(key)) spellings.set(key, next);
    result = spellings.get(key)!;
  }
  return result;
}

export interface FolderNode {
  path: string;
  name: string;
  ownCount: number;
  totalCount: number;
  children: FolderNode[];
}

export function buildFolderTree(notes: StandaloneNote[], meta: NoteMeta): FolderNode[] {
  const spellings = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const note of notes) {
    const path = canonicalPath(note.folder, spellings);
    if (path) counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  for (const folder of meta.folders) if (!folder.removed) canonicalPath(folder.path, spellings);
  const nodes = new Map<string, FolderNode>();
  const roots: FolderNode[] = [];
  for (const path of spellings.values()) {
    const node: FolderNode = { path, name: path.split('/').at(-1)!, ownCount: counts.get(path) ?? 0, totalCount: 0, children: [] };
    nodes.set(path, node);
    const parent = nodes.get(parentPath(path));
    (parent ? parent.children : roots).push(node);
  }
  function rollUp(siblings: FolderNode[]): number {
    siblings.sort((a, b) => folderCollator.compare(a.name, b.name));
    return siblings.reduce((sum, node) => {
      node.totalCount = node.ownCount + rollUp(node.children);
      return sum + node.totalCount;
    }, 0);
  }
  rollUp(roots);
  return roots;
}

export function createFolder(meta: NoteMeta, path: string, nowIso: string): NoteMeta {
  path = normalizeFolderPath(path);
  if (!path) return meta;
  const existing = meta.folders.find(folder => pathKey(folder.path) === pathKey(path));
  if (existing && !existing.removed) return meta;
  return { ...meta, folders: existing ? meta.folders.map(folder => {
    if (folder !== existing) return folder;
    const { removed: _removed, ...rest } = folder;
    return { ...rest, updatedAt: nowIso };
  }) : [...meta.folders, { path, updatedAt: nowIso }] };
}

type FolderResult = { notes: StandaloneNote[]; meta: NoteMeta };

export function renameFolder(notes: StandaloneNote[], meta: NoteMeta, fromPath: string, toPath: string, nowIso: string): FolderResult | null {
  const from = normalizeFolderPath(fromPath);
  const to = normalizeFolderPath(toPath);
  const fromKey = pathKey(from);
  if (!from || !to || from === to || (pathKey(to) !== fromKey && containsPath(pathKey(to), fromKey))) return null;
  const underSource = (path: string) => containsPath(pathKey(path), fromKey);
  const spellings = new Map<string, string>();
  // Existing destination folders get their spelling before the moved subtree.
  for (const note of notes) if (!underSource(note.folder)) canonicalPath(note.folder, spellings);
  for (const folder of meta.folders) if (!folder.removed && !underSource(folder.path)) canonicalPath(folder.path, spellings);
  const rewrite = (path: string) => canonicalPath(to + normalizeFolderPath(path).slice(from.length), spellings);
  const nextNotes = notes.map(note => underSource(note.folder) ? { ...note, folder: rewrite(note.folder), updatedAt: nowIso } : note);
  const folders = new Map<string, NoteFolder>();
  const put = (folder: NoteFolder) => {
    const key = pathKey(folder.path);
    const existing = folders.get(key);
    const at = Date.parse(folder.updatedAt) || 0;
    const previousAt = existing ? Date.parse(existing.updatedAt) || 0 : 0;
    // Keep newer recreations; a live destination wins a same-operation collision.
    if (!existing || at > previousAt || (at === previousAt && existing.removed && !folder.removed)) folders.set(key, folder);
  };
  const tombstones: NoteFolder[] = [];
  for (const folder of meta.folders) {
    // Removed records describe their original path; moving them would delete destinations.
    const moved = !folder.removed && underSource(folder.path);
    const next = moved ? { ...folder, path: rewrite(folder.path), updatedAt: nowIso } : folder;
    put(next);
    if (moved && pathKey(next.path) !== pathKey(folder.path)) {
      tombstones.push({ path: folder.path, removed: true, updatedAt: nowIso });
    }
  }
  for (const tombstone of tombstones) put(tombstone);
  return { notes: nextNotes, meta: { ...meta, folders: [...folders.values()] } };
}

export function moveFolder(notes: StandaloneNote[], meta: NoteMeta, path: string, newParentPath: string, nowIso: string): FolderResult | null {
  const name = normalizeFolderPath(path).split('/').at(-1)!;
  const parent = normalizeFolderPath(newParentPath);
  return renameFolder(notes, meta, path, parent ? `${parent}/${name}` : name, nowIso);
}

/** Deletes folder records only; every affected note moves directly to the parent. */
export function deleteFolder(notes: StandaloneNote[], meta: NoteMeta, path: string, nowIso: string): FolderResult {
  path = normalizeFolderPath(path);
  if (!path) return { notes, meta };
  const spellings = new Map<string, string>();
  for (const note of notes) canonicalPath(note.folder, spellings);
  for (const folder of meta.folders) if (!folder.removed) canonicalPath(folder.path, spellings);
  path = canonicalPath(path, spellings);
  const key = pathKey(path);
  const under = (candidate: string) => containsPath(pathKey(candidate), key);
  const folders = meta.folders.map(folder => under(folder.path) ? { ...folder, removed: true, updatedAt: nowIso } : folder);
  const recorded = new Set(folders.map(folder => pathKey(folder.path)));
  const inferred = new Map<string, string>();
  canonicalPath(path, inferred);
  for (const note of notes) if (under(note.folder)) canonicalPath(note.folder, inferred);
  for (const folder of meta.folders) if (under(folder.path)) canonicalPath(folder.path, inferred);
  for (const candidate of inferred.values()) {
    if (under(candidate) && !recorded.has(pathKey(candidate))) {
      folders.push({ path: candidate, updatedAt: nowIso, removed: true });
      recorded.add(pathKey(candidate));
    }
  }
  return {
    notes: notes.map(note => under(note.folder) ? { ...note, folder: parentPath(path), updatedAt: nowIso } : note),
    meta: { ...meta, folders },
  };
}

export function moveNote(notes: StandaloneNote[], noteId: string, folderPath: string, nowIso: string): StandaloneNote[] {
  return notes.map(note => note.id === noteId ? { ...note, folder: normalizeFolderPath(folderPath), updatedAt: nowIso } : note);
}

/** Directory paths relative to the ZIP's Notes/ directory. */
export function exportFolderPath(notes: readonly Pick<StandaloneNote, 'id' | 'folder'>[]): Map<string, string> {
  const spellings = new Map<string, string>();
  const safeSpellings = new Map<string, string>();
  const exportPath = (path: string) => canonicalPath(
    canonicalPath(path, spellings).split('/').filter(Boolean).map(safeExportSegment).join('/'), safeSpellings,
  );
  return new Map(notes.map(note => [note.id, exportPath(note.folder)]));
}

/** A single portable filename/directory segment, never a relative path. */
export function safeExportSegment(segment: string): string {
  const safe = segment.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().replace(/[. ]+$/g, '') || '_';
  return /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(safe) ? `_${safe}` : safe;
}

export function folderMatches(note: StandaloneNote, selectedPath: string): boolean {
  return containsPath(pathKey(note.folder), pathKey(selectedPath));
}
