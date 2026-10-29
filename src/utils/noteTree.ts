import type { NoteMeta, StandaloneNote } from '../types/daymark';
import { buildFolderTree, normalizeFolderPath, type FolderNode } from './noteFolders';
import { formatNoteDate } from './notes';

export type NoteTreeRow =
  | { kind: 'pinned-heading' }
  | { kind: 'folder'; path: string; name: string; depth: number; expanded: boolean; ownNotes: number; totalNotes: number }
  | { kind: 'note'; noteId: string; title: string; depth: number; pinned: boolean; dimmed?: boolean;
      snippet?: { before: string; match: string; after: string }; titleMatch?: [number, number][]; group: 'pinned' | 'tree' }
  | { kind: 'status'; text: string };

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const folderKey = (path: string): string => normalizeFolderPath(path).toLowerCase();
const noteTitle = (note: StandaloneNote): string => note.title.trim() ? note.title : 'Untitled';

/** Includes the folder itself, so every containing folder can be expanded. */
export function ancestorPaths(folder: string): string[] {
  const parts = folderKey(folder).split('/').filter(Boolean);
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
}

export function defaultExpanded(notes: StandaloneNote[], openNoteId?: string): Set<string> {
  const expanded = new Set<string>();
  for (const note of notes) {
    const paths = ancestorPaths(note.folder);
    if (paths.length) expanded.add(paths[0]);
    if (note.id === openNoteId) for (const path of paths) expanded.add(path);
  }
  return expanded;
}

export function visibleRowKey(row: NoteTreeRow): string {
  switch (row.kind) {
    case 'folder': return `folder:${folderKey(row.path)}`;
    case 'note': return `note:${row.noteId}${row.group === 'pinned' ? ':pinned' : ''}`;
    case 'pinned-heading': return 'pinned-heading';
    case 'status': return 'status';
  }
}

export function noteTooltip(note: StandaloneNote, today?: string): string {
  return `Last edited ${formatNoteDate(note.updatedAt, today)}`;
}

interface SearchField { lower: string; offsets?: [number, number][] }
function searchField(text: string): SearchField {
  const lower = text.toLowerCase();
  if (lower.length === text.length) return { lower };
  // Cache original UTF-16 offsets as well: e.g. U+0130 lowercases to two units.
  const offsets: [number, number][] = []; let index = 0;
  for (const character of text) {
    const end = index + character.length, units = character.toLowerCase().length;
    for (let unit = 0; unit < units; unit++) offsets.push([index, end]);
    index = end;
  }
  return { lower, offsets };
}
const searchCache = new WeakMap<StandaloneNote, { title: SearchField; content: SearchField; tags: string[] }>();
function searchText(note: StandaloneNote) {
  let value = searchCache.get(note);
  if (!value) {
    value = { title: searchField(note.title), content: searchField(note.content), tags: note.tags.map(tag => tag.toLowerCase()) };
    searchCache.set(note, value);
  }
  return value;
}
/** Move a UTF-16 boundary outwards when it falls between a surrogate pair. */
function snippetEdge(text: string, edge: number, direction: -1 | 1): number {
  if (edge > 0 && edge < text.length && /[\uD800-\uDBFF]/.test(text[edge - 1]) && /[\uDC00-\uDFFF]/.test(text[edge])) return edge + direction;
  return edge;
}

/** Half-open UTF-16 ranges for rendering title highlights without parsing markup. */
function matchRanges(field: SearchField, query: string, firstOnly = false): [number, number][] {
  const { lower, offsets } = field;
  const ranges: [number, number][] = [];
  let start = lower.indexOf(query);
  while (start !== -1) {
    ranges.push([start, start + query.length]);
    if (firstOnly) break;
    start = lower.indexOf(query, start + query.length);
  }
  if (!ranges.length || !offsets) return ranges;
  return ranges.map(([from, to]) => [offsets[from][0], offsets[to - 1][1]]);
}

export function buildNoteTreeRows(input: {
  notes: StandaloneNote[];
  meta: NoteMeta;
  expanded: ReadonlySet<string>;
  query: string;
  openNoteId?: string;
}): { rows: NoteTreeRow[]; matchCount: number } {
  const { notes, meta, expanded, openNoteId } = input;
  const query = input.query.trim();
  const q = query.toLowerCase();
  const rows: NoteTreeRow[] = [];
  const folders = buildFolderTree(notes, meta);
  const byFolder = new Map<string, StandaloneNote[]>();
  const searchRows = new Map<string, Extract<NoteTreeRow, { kind: 'note' }>>();
  const visibleFolders = new Set<string>();
  let matchCount = 0;

  function noteRow(note: StandaloneNote, depth: number, group: 'pinned' | 'tree'): Extract<NoteTreeRow, { kind: 'note' }> {
    return { kind: 'note', noteId: note.id, title: noteTitle(note), depth, pinned: Boolean(note.pinned), group };
  }

  for (const note of notes) {
    if (q) {
      // Keep the existing Notes search predicate: literal substrings in title, raw body or tags.
      const lower = searchText(note);
      const titleMatch = matchRanges(lower.title, q);
      const bodyMatch = matchRanges(lower.content, q, true)[0];
      const tagMatch = lower.tags.some(tag => tag.includes(q));
      const matches = titleMatch.length > 0 || Boolean(bodyMatch) || tagMatch;
      if (matches) matchCount++;
      if (!matches && note.id !== openNoteId) continue;
      const row = noteRow(note, 0, 'tree');
      if (!matches) row.dimmed = true;
      if (titleMatch.length) row.titleMatch = titleMatch;
      if (bodyMatch && !titleMatch.length && !tagMatch) {
        const [bodyStart, bodyEnd] = bodyMatch;
        const collapse = (text: string) => text.replace(/\s+/g, ' ');
        row.snippet = {
          before: collapse(note.content.slice(snippetEdge(note.content, Math.max(0, bodyStart - 60), -1), bodyStart)),
          match: collapse(note.content.slice(bodyStart, bodyEnd)),
          after: collapse(note.content.slice(bodyEnd, snippetEdge(note.content, Math.min(note.content.length, bodyEnd + 60), 1))),
        };
      }
      searchRows.set(note.id, row);
      for (const path of ancestorPaths(note.folder)) visibleFolders.add(path);
    }
    const key = folderKey(note.folder);
    const siblings = byFolder.get(key) ?? [];
    siblings.push(note);
    byFolder.set(key, siblings);
  }

  const compareNotes = (a: StandaloneNote, b: StandaloneNote) => collator.compare(noteTitle(a), noteTitle(b));
  for (const siblings of byFolder.values()) siblings.sort(compareNotes);

  if (!q) {
    matchCount = notes.length;
    const pinned = notes.filter(note => note.pinned).sort(compareNotes);
    if (pinned.length) {
      rows.push({ kind: 'pinned-heading' });
      for (const note of pinned) rows.push(noteRow(note, 0, 'pinned'));
    }
  } else if (!matchCount) {
    rows.push({ kind: 'status', text: `No notes match “${query}”` });
  }

  function appendNotes(path: string, depth: number): void {
    for (const note of byFolder.get(path) ?? []) {
      rows.push(q ? { ...searchRows.get(note.id)!, depth } : noteRow(note, depth, 'tree'));
    }
  }

  function appendFolders(nodes: FolderNode[], depth: number): void {
    for (const folder of nodes) {
      const key = folderKey(folder.path);
      if (q && !visibleFolders.has(key)) continue;
      const isExpanded = Boolean(q) || expanded.has(key);
      rows.push({ kind: 'folder', path: folder.path, name: folder.name, depth, expanded: isExpanded,
        ownNotes: folder.ownCount, totalNotes: folder.totalCount });
      if (isExpanded) {
        appendFolders(folder.children, depth + 1);
        appendNotes(key, depth + 1);
      }
    }
  }

  appendFolders(folders, 0);
  appendNotes('', 0);
  if (!rows.length) rows.push({ kind: 'status', text: 'No notes yet. Create a note.' });
  return { rows, matchCount };
}
