import type { McpGrants } from '../../src/sync/mcpProtocol';
import type { BacklogData, DailyDocument, HabitData, StandaloneNote } from '../../src/types/daymark';
import type { McpConnection } from './mcpStore';

export const NOT_SHARED = 'Not found or not shared with this connection.';

export class ScopeError extends Error {
  constructor(message = NOT_SHARED) {
    super(message);
    this.name = 'ScopeError';
  }
}

export type WriteTarget =
  | { kind: 'heading'; name: string }
  | { kind: 'folder'; folder: string }
  | { kind: 'backlog' }
  | { kind: 'habits' };

export const normalizeHeading = (name: string): string => name.trim().toLowerCase();

export function headingGranted(g: McpGrants, name: string): boolean {
  return g.all || g.headings.some(heading => normalizeHeading(heading) === normalizeHeading(name));
}

export function folderGranted(g: McpGrants, folder: string): boolean {
  return g.all || g.folders.some(grant =>
    folder === grant || (grant !== '' && folder.startsWith(`${grant}/`)));
}

export function scopeDoc(doc: DailyDocument, g: McpGrants): DailyDocument | null {
  const headings = doc.headings.filter(heading => headingGranted(g, heading.name));
  if (headings.length === 0) return null;
  if (g.all) return doc;
  const scoped = { ...doc, headings };
  // The original Markdown may contain headings outside this connection's scope.
  delete scoped.rawMarkdown;
  return scoped;
}

export function scopeNotes(notes: StandaloneNote[], g: McpGrants): StandaloneNote[] {
  return notes.filter(note => folderGranted(g, note.folder));
}

export function scopeBacklog(b: BacklogData, g: McpGrants): BacklogData | null {
  return g.all || g.backlog ? b : null;
}

export function scopeHabits(h: HabitData, g: McpGrants): HabitData | null {
  return g.all || g.habits ? h : null;
}

export function assertWrite(
  conn: Pick<McpConnection, 'access' | 'grants'>,
  target: WriteTarget,
  opts?: { feedback?: boolean },
): void {
  if (opts?.feedback) return;
  if (conn.access !== 'full') throw new ScopeError();
  const g = conn.grants;
  let granted: boolean;
  switch (target.kind) {
    case 'heading': granted = headingGranted(g, target.name); break;
    case 'folder': granted = folderGranted(g, target.folder); break;
    case 'backlog': granted = g.all || g.backlog; break;
    case 'habits': granted = g.all || g.habits; break;
  }
  if (!granted) throw new ScopeError();
}
