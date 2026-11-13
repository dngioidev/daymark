import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { NoteMeta, StandaloneNote } from '../../../src/types/daymark';
import { createFolder, deleteFolder, renameFolder } from '../../../src/utils/noteFolders';
import { assertWrite, cleanFolder, folderGranted, ScopeError } from '../scope';
import { knownFolders, readNoteMeta, readNotes } from '../vaultView';
import type { FileStore } from '../../store';
import { defineTool, type ToolContext, type ToolOutcome } from './define';

const folder = z.string().trim().min(1).max(500);
const parentOf = (path: string) => path.split('/').slice(0, -1).join('/');

/** The stored spelling of an existing folder (paths match case-insensitively, as in the app). */
function existingFolder(store: FileStore, path: string): string {
  const key = path.toLowerCase();
  const found = knownFolders(store).find(candidate => candidate.toLowerCase() === key);
  if (!found) throw new ScopeError();
  return found;
}

/** Commits the folder records plus every note the change touched, after checking each against scope. */
function changes(ctx: ToolContext, before: StandaloneNote[], next: { notes: StandaloneNote[]; meta: NoteMeta }) {
  const writes: { key: string; value: unknown }[] = [];
  next.notes.forEach((note, i) => {
    if (note === before[i]) return;
    assertWrite(ctx.connection, { kind: 'folder', folder: before[i].folder });
    assertWrite(ctx.connection, { kind: 'folder', folder: note.folder });
    writes.push({ key: `note:${note.id}`, value: note });
  });
  return { writes: [...writes, { key: 'notemeta', value: next.meta }], moved: writes.length };
}

const outcome = (result: unknown, action: ToolOutcome['action'], count: number): ToolOutcome =>
  ({ result, action, targets: [{ key: 'notemeta' }], count });

export function registerFolderTools(server: McpServer, initialContext: ToolContext): void {
  defineTool(server, initialContext, {
    name: 'list_folders', description: 'Lists shared note folders, including empty ones, with their note counts.', input: {}, readOnly: true,
    run: async (_args, ctx) => {
      const notes = readNotes(ctx.store);
      const result = knownFolders(ctx.store)
        .filter(path => folderGranted(ctx.connection.grants, path))
        .sort((a, b) => a.localeCompare(b))
        .map(path => ({ path, notes: notes.filter(note => note.folder.toLowerCase() === path.toLowerCase()).length }));
      return { result, action: 'read', count: result.length };
    },
  });
  defineTool(server, initialContext, {
    name: 'create_folder', description: 'Creates a note folder (nested paths use "/") inside a shared folder.', input: { path: folder }, readOnly: false,
    run: async (args, ctx) => {
      const path = cleanFolder(args.path);
      if (!path) throw new ScopeError('Folder path is empty.');
      let created = path;
      await ctx.commit(() => {
        assertWrite(ctx.connection, { kind: 'folder', folder: path });
        const meta = readNoteMeta(ctx.store);
        const next = createFolder(meta, path, ctx.now().toISOString());
        created = next.folders.find(f => !f.removed && f.path.toLowerCase() === path.toLowerCase())?.path ?? path;
        return next === meta ? [] : [{ key: 'notemeta', value: next }];
      });
      return outcome({ path: created }, 'create', 0);
    },
  });
  defineTool(server, initialContext, {
    name: 'rename_folder', description: 'Renames or moves a shared folder with its subfolders and notes; both paths must be shared.',
    input: { path: folder, newPath: folder }, readOnly: false,
    run: async (args, ctx) => {
      const to = cleanFolder(args.newPath);
      let result: unknown;
      let moved = 0;
      await ctx.commit(() => {
        const from = existingFolder(ctx.store, cleanFolder(args.path));
        assertWrite(ctx.connection, { kind: 'folder', folder: from });
        assertWrite(ctx.connection, { kind: 'folder', folder: to });
        const notes = readNotes(ctx.store);
        const next = renameFolder(notes, readNoteMeta(ctx.store), from, to, ctx.now().toISOString());
        if (!next) throw new ScopeError('Cannot rename a folder to itself, an empty path or one of its own subfolders.');
        const { writes, moved: count } = changes(ctx, notes, next);
        moved = count;
        result = { path: from, newPath: to, notesMoved: count };
        return writes;
      });
      return outcome(result, 'update', moved);
    },
  });
  defineTool(server, initialContext, {
    name: 'delete_folder', description: 'Deletes a shared folder and its subfolders. Notes are kept and move to the parent folder, which must be shared.',
    input: { path: folder }, readOnly: false, destructive: true,
    run: async (args, ctx) => {
      let result: unknown;
      let moved = 0;
      await ctx.commit(() => {
        const path = existingFolder(ctx.store, cleanFolder(args.path));
        assertWrite(ctx.connection, { kind: 'folder', folder: path });
        assertWrite(ctx.connection, { kind: 'folder', folder: parentOf(path) });
        const notes = readNotes(ctx.store);
        const next = deleteFolder(notes, readNoteMeta(ctx.store), path, ctx.now().toISOString());
        const { writes, moved: count } = changes(ctx, notes, next);
        moved = count;
        result = { path, notesMovedTo: parentOf(path), notesMoved: count };
        return writes;
      });
      return outcome(result, 'delete', moved);
    },
  });
}
