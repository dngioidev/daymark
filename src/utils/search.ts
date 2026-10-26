import type { BacklogData, DailyDocument, StandaloneNote } from '../types/daymark';
import { visibleBacklog } from './backlog';
import { notePreview } from './notes';

export type SearchResult =
  | { kind: 'task'; taskId: string; date: string; title: string; status: string; archived: boolean }
  | { kind: 'note'; noteId: string; title: string; snippet: string }
  | { kind: 'backlog'; itemId: string; title: string; category?: string };

export function searchVault(docs: DailyDocument[], notes: StandaloneNote[], query: string, limit = 20, backlog: BacklogData = { items: [] }): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q || limit <= 0) return [];
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  // Resolve identity before matching: an old title must not expose a stale copy.
  for (const doc of [...docs].sort((a, b) => b.date.localeCompare(a.date))) {
    for (const id of doc.removedTaskIds ?? []) seen.add(id);
    for (const heading of doc.headings) {
      for (const task of heading.items) {
        if (seen.has(task.id)) continue;
        seen.add(task.id);
        if (`${task.title}\n${task.description ?? ''}`.toLowerCase().includes(q)) {
          results.push({ kind: 'task', taskId: task.id, date: doc.date, title: task.title, status: task.status, archived: task.status === 'archived' });
        }
      }
    }
  }
  for (const note of notes) {
    if (note.title.toLowerCase().includes(q) || note.content.toLowerCase().includes(q)) {
      results.push({ kind: 'note', noteId: note.id, title: note.title, snippet: notePreview(note.content) });
    }
  }
  for (const item of visibleBacklog(backlog)) {
    if (`${item.title}\n${item.description ?? ''}\n${item.category ?? ''}`.toLowerCase().includes(q)) {
      results.push({ kind: 'backlog', itemId: item.id, title: item.title, category: item.category });
    }
  }
  return results.slice(0, limit);
}
