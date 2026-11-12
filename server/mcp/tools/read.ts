import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DailyDocument } from '../../../src/types/daymark';
import { visibleBacklog } from '../../../src/utils/backlog';
import { habitsForDay } from '../../../src/utils/habits';
import { getCalendarDaysDifference } from '../../../src/utils/lifecycleEngine';
import { searchVault } from '../../../src/utils/search';
import { cleanFolder, normalizeHeading, scopeBacklog, scopeDoc, scopeHabits, scopeNotes, ScopeError } from '../scope';
import { dayView, readBacklog, readDocs, readHabits, readNotes, readSettings } from '../vaultView';
import { defineTool, type ToolContext } from './define';
import { buildDaySummary, buildReview } from './summary';

const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Invalid calendar date');

function scopedDay(ctx: ToolContext, date: string): DailyDocument {
  const doc = scopeDoc(dayView(ctx.store, date, ctx.today()), ctx.connection.grants);
  if (!doc) throw new ScopeError();
  return doc;
}

/** Stored days, with today's carry-forward applied in memory (like scopedDay) so reads agree before any device rolls over. */
function scopedDocs(ctx: ToolContext): DailyDocument[] {
  const today = ctx.today();
  const stored = readDocs(ctx.store).filter(doc => doc.date !== today);
  return [...stored, dayView(ctx.store, today, today)].flatMap(doc => {
    const scoped = scopeDoc(doc, ctx.connection.grants);
    return scoped ? [scoped] : [];
  });
}

function daysInRange(from: string, to: string, max?: number): number {
  const days = getCalendarDaysDifference(from, to) + 1;
  if (from > to || (max !== undefined && days > max)) throw new ScopeError(max ? `Date range must be ordered and at most ${max} days.` : 'Date range must be ordered.');
  return days;
}

export function registerReadTools(server: McpServer, initialContext: ToolContext): void {
  defineTool(server, initialContext, {
    name: 'get_day_summary', description: 'Summarizes a shared day, including a spoken line.', input: { date: dateInput.optional() }, readOnly: true,
    run: async ({ date = initialContext.today() }, ctx) => ({
      result: buildDaySummary({ doc: scopedDay(ctx, date), date, settings: readSettings(ctx.store), habits: scopeHabits(readHabits(ctx.store), ctx.connection.grants), backlog: scopeBacklog(readBacklog(ctx.store), ctx.connection.grants) }),
      action: 'read', targets: [{ key: `doc:${date}` }],
    }),
  });
  defineTool(server, initialContext, {
    name: 'get_review', description: 'Reviews shared activity over at most 92 inclusive days.', input: { from: dateInput, to: dateInput }, readOnly: true,
    run: async ({ from, to }, ctx) => {
      const count = daysInRange(from, to, 92);
      return { result: buildReview({ docs: scopedDocs(ctx), notes: scopeNotes(readNotes(ctx.store), ctx.connection.grants), from, to, habits: scopeHabits(readHabits(ctx.store), ctx.connection.grants), settings: readSettings(ctx.store) }), action: 'read', count };
    },
  });
  defineTool(server, initialContext, {
    name: 'get_day', description: 'Reads a shared day with current rollover applied in memory.', input: { date: dateInput.optional() }, readOnly: true,
    run: async ({ date = initialContext.today() }, ctx) => {
      const { rawMarkdown: _raw, removedTaskIds: _removed, ...result } = scopedDay(ctx, date);
      return { result, action: 'read', targets: [{ key: `doc:${date}` }] };
    },
  });
  defineTool(server, initialContext, {
    name: 'list_tasks', description: 'Lists shared daily tasks with optional filters (up to 200).',
    input: { from: dateInput.optional(), to: dateInput.optional(), status: z.string().optional(), heading: z.string().optional(), tag: z.string().optional(), limit: z.number().int().min(1).max(200).optional() }, readOnly: true,
    run: async ({ from = initialContext.today(), to = initialContext.today(), status, heading, tag, limit = 200 }, ctx) => {
      daysInRange(from, to);
      const result = scopedDocs(ctx).filter(doc => doc.date >= from && doc.date <= to).flatMap(doc => doc.headings
        .filter(section => heading === undefined || normalizeHeading(section.name) === normalizeHeading(heading))
        .flatMap(section => section.items.filter(task => (status === undefined || task.status === status) && (tag === undefined || task.tags?.includes(tag)))
          .map(task => ({ date: doc.date, heading: section.name, id: task.id, title: task.title, status: task.status, tags: task.tags ?? [] })))).slice(0, limit);
      return { result, action: 'read', count: result.length };
    },
  });
  defineTool(server, initialContext, {
    name: 'search', description: 'Searches shared daily tasks, notes and visible backlog items.', input: { query: z.string(), limit: z.number().int().min(1).max(50).optional() }, readOnly: true,
    run: async ({ query, limit = 20 }, ctx) => {
      const result = searchVault(scopedDocs(ctx), scopeNotes(readNotes(ctx.store), ctx.connection.grants), query, limit, scopeBacklog(readBacklog(ctx.store), ctx.connection.grants) ?? { items: [] });
      return { result, action: 'search', count: result.length };
    },
  });
  defineTool(server, initialContext, {
    name: 'list_notes', description: 'Lists shared note metadata, optionally in a folder.', input: { folder: z.string().optional() }, readOnly: true,
    run: async ({ folder }, ctx) => {
      const wanted = folder === undefined ? undefined : cleanFolder(folder);
      return { result: scopeNotes(readNotes(ctx.store), ctx.connection.grants)
        .filter(note => wanted === undefined || note.folder === wanted)
        .map(({ id, title, folder, tags, updatedAt, pinned }) => ({ id, title, folder, tags, updatedAt, pinned })), action: 'read' as const };
    },
  });
  defineTool(server, initialContext, {
    name: 'get_note', description: 'Reads a shared note.', input: { id: z.string() }, readOnly: true,
    run: async ({ id }, ctx) => {
      const note = scopeNotes(readNotes(ctx.store), ctx.connection.grants).find(note => note.id === id);
      if (!note) throw new ScopeError();
      return { result: note, action: 'read', targets: [{ key: `note:${id}`, title: note.title }] };
    },
  });
  defineTool(server, initialContext, {
    name: 'list_backlog', description: 'Lists visible shared backlog items.', input: {}, readOnly: true,
    run: async (_, ctx) => {
      const backlog = scopeBacklog(readBacklog(ctx.store), ctx.connection.grants);
      if (!backlog) throw new ScopeError();
      return { result: visibleBacklog(backlog), action: 'read' };
    },
  });
  defineTool(server, initialContext, {
    name: 'list_habits', description: 'Lists shared habits for a day.', input: { date: dateInput.optional() }, readOnly: true,
    run: async ({ date = initialContext.today() }, ctx) => {
      const habits = scopeHabits(readHabits(ctx.store), ctx.connection.grants);
      if (!habits) throw new ScopeError();
      return { result: habitsForDay(habits, date, ctx.today()), action: 'read' };
    },
  });
}

