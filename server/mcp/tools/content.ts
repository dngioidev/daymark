import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { BacklogData, BacklogItem, StandaloneNote } from '../../../src/types/daymark';
import { addBacklogItem, editBacklogItem, removeBacklogItem, pickBacklogItem, sectionForCategory } from '../../../src/utils/backlog';
import { habitsForDay, setTick } from '../../../src/utils/habits';
import { assertWrite, cleanFolder, ScopeError } from '../scope';
import { ensureDay, readBacklog, readDocs, readHabits, readNotes, readSettings } from '../vaultView';
import { defineTool, type ToolContext, type ToolOutcome } from './define';

const id = z.string().min(1).max(200);
const title = z.string().trim().min(1).max(300);
const content = z.string().max(100_000);
const folder = z.string().max(500);
const tags = z.array(z.string().trim().min(1).max(50)).max(20);
const description = z.string().max(10_000);
const category = z.string().trim().max(100);
const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Invalid calendar date');

const outcome = (result: unknown, action: ToolOutcome['action'], keys: string[]): ToolOutcome => ({ result, action, targets: keys.map(key => ({ key })) });

async function changeNote(ctx: ToolContext, noteId: string, change: (note: StandaloneNote) => StandaloneNote | null): Promise<StandaloneNote | null> {
  let result: StandaloneNote | null = null;
  await ctx.commit(() => {
    const note = readNotes(ctx.store).find(n => n.id === noteId);
    if (!note) throw new ScopeError();
    assertWrite(ctx.connection, { kind: 'folder', folder: note.folder });
    result = change(note);
    if (result) assertWrite(ctx.connection, { kind: 'folder', folder: result.folder });
    return [{ key: `note:${noteId}`, value: result }];
  });
  return result;
}

async function changeBacklog(ctx: ToolContext, itemId: string, change: (data: BacklogData) => BacklogData): Promise<BacklogItem> {
  let result: BacklogItem | undefined;
  await ctx.commit(() => {
    assertWrite(ctx.connection, { kind: 'backlog' });
    const data = readBacklog(ctx.store);
    if (!data.items.some(item => item.id === itemId && !item.deletedAt && !item.pickedOn)) throw new ScopeError();
    const next = change(data);
    result = next.items.find(item => item.id === itemId)!;
    return [{ key: 'backlog', value: next }];
  });
  return result!;
}

export function registerContentTools(server: McpServer, initialContext: ToolContext): void {
  defineTool(server, initialContext, {
    name: 'create_note', description: 'Creates a standalone note in a shared folder.',
    input: { title, folder, content, tags: tags.optional() }, readOnly: false,
    run: async (args, ctx) => {
      let note: StandaloneNote | undefined;
      const folderPath = cleanFolder(args.folder);
      await ctx.commit(() => {
        assertWrite(ctx.connection, { kind: 'folder', folder: folderPath });
        // Keep the app's note-<milliseconds> format while avoiding same-millisecond collisions.
        let stamp = Date.now();
        while (ctx.store.vault.entities[`note:note-${stamp}`]) stamp++;
        const now = ctx.now().toISOString();
        note = { ...args, folder: folderPath, id: `note-${stamp}`, tags: args.tags ?? [], createdAt: now, updatedAt: now, pinned: false };
        return [{ key: `note:${note.id}`, value: note }];
      });
      return outcome(note, 'create', [`note:${note!.id}`]);
    },
  });
  defineTool(server, initialContext, {
    name: 'update_note', description: 'Edits a shared note; both folders must be shared when moving it.',
    input: { id, title: title.optional(), content: content.optional(), folder: folder.optional(), tags: tags.optional() }, readOnly: false,
    run: async ({ id: noteId, ...patch }, ctx) => outcome(await changeNote(ctx, noteId, note => ({
      ...note,
      title: patch.title ?? note.title,
      content: patch.content ?? note.content,
      folder: patch.folder === undefined ? note.folder : cleanFolder(patch.folder),
      tags: patch.tags ?? note.tags,
      updatedAt: ctx.now().toISOString(),
    })), 'update', [`note:${noteId}`]),
  });
  defineTool(server, initialContext, {
    name: 'append_note', description: 'Appends text to a shared note.', input: { id, text: content }, readOnly: false,
    run: async ({ id: noteId, text }, ctx) => outcome(await changeNote(ctx, noteId, note => ({ ...note, content: note.content ? `${note.content}\n${text}` : text, updatedAt: ctx.now().toISOString() })), 'update', [`note:${noteId}`]),
  });
  defineTool(server, initialContext, {
    name: 'delete_note', description: 'Deletes a shared note with a sync tombstone.', input: { id }, readOnly: false, destructive: true,
    run: async ({ id: noteId }, ctx) => {
      await changeNote(ctx, noteId, () => null);
      return outcome({ id: noteId }, 'delete', [`note:${noteId}`]);
    },
  });
  defineTool(server, initialContext, {
    name: 'add_backlog_item', description: 'Adds an item to the shared backlog.', input: { title, description: description.optional(), category: category.optional() }, readOnly: false,
    run: async (args, ctx) => {
      let result: BacklogItem | undefined;
      await ctx.commit(() => {
        assertWrite(ctx.connection, { kind: 'backlog' });
        const next = addBacklogItem(readBacklog(ctx.store), args, ctx.now().toISOString());
        result = next.items.at(-1)!;
        return [{ key: 'backlog', value: next }];
      });
      return outcome(result, 'create', ['backlog']);
    },
  });
  defineTool(server, initialContext, {
    name: 'update_backlog_item', description: 'Edits a visible shared backlog item.', input: { id, title: title.optional(), description: description.optional(), category: category.optional() }, readOnly: false,
    run: async ({ id: itemId, ...patch }, ctx) => outcome(await changeBacklog(ctx, itemId, data => editBacklogItem(data, itemId, patch, ctx.now().toISOString())), 'update', ['backlog']),
  });
  defineTool(server, initialContext, {
    name: 'delete_backlog_item', description: 'Deletes a visible shared backlog item.', input: { id }, readOnly: false, destructive: true,
    run: async ({ id: itemId }, ctx) => outcome(await changeBacklog(ctx, itemId, data => removeBacklogItem(data, itemId, ctx.now().toISOString())), 'delete', ['backlog']),
  });
  defineTool(server, initialContext, {
    name: 'pick_backlog_item', description: 'Picks a shared backlog item into its category heading today.', input: { id }, readOnly: false,
    run: async ({ id: itemId }, ctx) => {
      let result: unknown;
      let date = '';
      await ctx.commit(() => {
        assertWrite(ctx.connection, { kind: 'backlog' });
        const data = readBacklog(ctx.store);
        const item = data.items.find(i => i.id === itemId && !i.deletedAt && !i.pickedOn);
        if (!item) throw new ScopeError();
        date = ctx.today();
        const { doc } = ensureDay(ctx.store, date, date);
        const { defaultHeadings } = readSettings(ctx.store);
        const section = sectionForCategory(doc.headings.map(h => h.name), item.category, defaultHeadings[0] || 'Work');
        assertWrite(ctx.connection, { kind: 'heading', name: section.name });
        const docs = [...readDocs(ctx.store).filter(d => d.date !== date), doc];
        const next = pickBacklogItem(docs, data, itemId, date, defaultHeadings, ctx.now().toISOString());
        if (!next) throw new ScopeError();
        const target = next.docs.find(d => d.date === date)!;
        result = { id: itemId, date, heading: section.name };
        return [{ key: 'backlog', value: next.data }, { key: `doc:${date}`, value: target }];
      });
      return outcome(result, 'update', ['backlog', `doc:${date}`]);
    },
  });
  defineTool(server, initialContext, {
    name: 'tick_habit', description: 'Sets a shared habit tick for today or a past day.', input: { habitId: id, done: z.boolean(), date: dateInput.optional() }, readOnly: false,
    run: async (args, ctx) => {
      let result: unknown;
      let date = '';
      await ctx.commit(() => {
        assertWrite(ctx.connection, { kind: 'habits' });
        const data = readHabits(ctx.store);
        const today = ctx.today();
        date = args.date ?? today;
        const next = setTick(data, args.habitId, date, args.done, today, ctx.now().toISOString());
        if (next === data) throw new ScopeError();
        result = habitsForDay(next, date, today).find(item => item.habit.id === args.habitId)!;
        return [{ key: `habitday:${date}`, value: next.days.find(day => day.date === date)! }];
      });
      return outcome(result, 'update', [`habitday:${date}`]);
    },
  });
}
