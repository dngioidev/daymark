import type { StandaloneNote } from '../types/daymark';
import { folderMatches } from './noteFolders';
import { pairKey, suggestRelated, type NoteIndex } from './noteRelated';

export interface GraphNode { id: string; title: string; folder: string; tags: string[]; degree: number }
export interface GraphEdge { a: string; b: string; kind: 'link' | 'tag' | 'suggested'; terms?: string[] }
export interface GraphOptions {
  folderPaths: string[] | null;
  tag?: string;
  showTags: boolean;
  showSuggestions: boolean;
  showOrphans: boolean;
  local?: { noteId: string; depth: number };
  query?: string;
}
export type GraphData = ReturnType<typeof buildGraph>;

export function defaultGraphScope(noteCount: number, selectedFolder: string | 'all'): { folderPaths: string[] | null; showOrphans: boolean } {
  return { folderPaths: noteCount <= 300 || selectedFolder === 'all' ? null : [selectedFolder], showOrphans: noteCount <= 300 };
}

/** Pure projection. No persistence, serialization or mutations of the source vault. */
export function buildGraph(notes: StandaloneNote[], index: NoteIndex, dismissed: Set<string>, options: GraphOptions) {
  let visible = notes.filter(note => (options.folderPaths === null || options.folderPaths.some(path => folderMatches(note, path))) &&
    (!options.tag || note.tags.includes(options.tag)));
  const ids = new Set(visible.map(note => note.id));
  const pairs = new Map<string, GraphEdge>();
  const put = (edge: GraphEdge) => {
    if (edge.a === edge.b || !ids.has(edge.a) || !ids.has(edge.b)) return;
    const key = pairKey(edge.a, edge.b), previous = pairs.get(key);
    // Explicit links take precedence, then actionable suggestions, then tag lines.
    const priority = { link: 3, suggested: 2, tag: 1 };
    if (!previous || priority[edge.kind] > priority[previous.kind]) pairs.set(key, edge);
  };
  for (const note of visible) for (const id of index.notes.get(note.id)?.outgoing ?? []) put({ a: note.id, b: id, kind: 'link' });
  if (options.showSuggestions) for (const note of visible) {
    for (const suggestion of suggestRelated(index, note.id, { dismissed })) put({ a: note.id, b: suggestion.noteId, kind: 'suggested', terms: suggestion.sharedTerms });
  }
  if (options.showTags) {
    // A spanning hub uses k-1 edges per tag rather than k*(k-1)/2. Every line
    // still connects two real notes sharing the tag (no synthetic note IDs).
    const hubs = new Map<string, string>();
    for (const note of visible) for (const tag of new Set(note.tags)) {
      const hub = hubs.get(tag);
      if (hub) put({ a: hub, b: note.id, kind: 'tag' }); else hubs.set(tag, note.id);
    }
  }
  let edges = [...pairs.values()];
  if (options.local) {
    const adjacent = new Map<string, string[]>();
    for (const edge of edges) {
      if (!adjacent.has(edge.a)) adjacent.set(edge.a, []);
      if (!adjacent.has(edge.b)) adjacent.set(edge.b, []);
      adjacent.get(edge.a)!.push(edge.b); adjacent.get(edge.b)!.push(edge.a);
    }
    const reached = new Set([options.local.noteId]);
    let frontier = [options.local.noteId];
    for (let depth = 0; depth < options.local.depth && frontier.length; depth++) {
      const next: string[] = [];
      for (const id of frontier) for (const other of adjacent.get(id) ?? []) if (!reached.has(other)) { reached.add(other); next.push(other); }
      frontier = next;
    }
    visible = visible.filter(note => reached.has(note.id));
    edges = edges.filter(edge => reached.has(edge.a) && reached.has(edge.b));
  }
  const degree = new Map<string, number>();
  for (const edge of edges) { degree.set(edge.a, (degree.get(edge.a) ?? 0) + 1); degree.set(edge.b, (degree.get(edge.b) ?? 0) + 1); }
  const nodes: GraphNode[] = visible.filter(note => options.showOrphans || degree.has(note.id)).map(note => ({
    id: note.id, title: note.title, folder: note.folder, tags: [...note.tags], degree: degree.get(note.id) ?? 0,
  }));
  const query = options.query?.trim().toLocaleLowerCase();
  const matches = new Set(nodes.filter(note => query && `${note.title} ${note.folder} ${note.tags.join(' ')}`.toLocaleLowerCase().includes(query)).map(note => note.id));
  return { nodes, edges, matches };
}
