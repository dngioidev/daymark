import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ChecklistItem, DailyDocument, TaskItem } from '../../../src/types/daymark';
import {
  followDoneChanges, isClosedCopy, moveTaskToSection, removeTaskFromDocument, replaceTaskInDocument,
  toggleTaskDone, toggleTaskDoneInDocument,
} from '../../../src/utils/taskActions';
import { assertWrite, normalizeHeading, ScopeError } from '../scope';
import { ensureDay, readDocs, readSettings } from '../vaultView';
import { defineTool, type ToolContext, type ToolOutcome, type VaultChange } from './define';

const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Invalid calendar date');
const title = z.string().trim().min(1).max(300);
const heading = z.string().trim().min(1).max(100);
const description = z.string().max(10_000);
const tags = z.array(z.string().trim().min(1).max(50)).max(20);
const checklist = z.array(z.string().trim().min(1).max(300)).max(100);
const taskId = z.string().min(1).max(200);

/** The newest day that holds the id, which is the copy the app treats as the live task. */
export function findLatestCopy(docs: DailyDocument[], id: string): { date: string; heading: string; task: TaskItem } | null {
  let found: { date: string; heading: string; task: TaskItem } | null = null;
  for (const doc of docs) {
    for (const section of doc.headings) {
      const task = section.items.find(item => item.id === id);
      if (task && (!found || doc.date >= found.date)) found = { date: doc.date, heading: section.name, task };
    }
  }
  return found;
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

function checklistItems(texts: string[], previous: ChecklistItem[] = []): ChecklistItem[] {
  const stamp = Date.now();
  return texts.map((text, index) => {
    const same = previous.find(item => item.text === text);
    return same ?? { id: `chk-${stamp}-${index}`, text, done: false };
  });
}

function checkStatus(ctx: ToolContext, status: string): void {
  if (!readSettings(ctx.store).statuses.some(def => def.id === status)) throw new ScopeError(`Unknown status "${status}".`);
}

/** Every heading whose content differs between two copies of a day. */
function changedHeadings(before: DailyDocument | undefined, after: DailyDocument): string[] {
  const names = new Set([...(before?.headings ?? []), ...after.headings].map(section => section.name));
  return [...names].filter(name => JSON.stringify(before?.headings.find(h => h.name === name)) !== JSON.stringify(after.headings.find(h => h.name === name)));
}

interface Working {
  docs: DailyDocument[];
  today: string;
  /** Stored value of each day, or today's rolled-over view, before this call changes anything. */
  baseline: Map<string, DailyDocument>;
  todayCreated: boolean;
}

/** Reads inside the vault queue, so the result is built from the current vault. */
function loadWorking(ctx: ToolContext, extraDate?: string): Working {
  const today = ctx.today();
  const stored = readDocs(ctx.store);
  const prepared = new Map<string, { doc: DailyDocument; created: boolean }>();
  for (const date of new Set([today, ...(extraDate ? [extraDate] : [])])) prepared.set(date, ensureDay(ctx.store, date, today));
  const docs = [...stored.filter(doc => !prepared.has(doc.date)), ...[...prepared.values()].map(item => item.doc)]
    .sort((a, b) => a.date.localeCompare(b.date));
  return { docs, today, baseline: new Map(structuredClone(docs).map(doc => [doc.date, doc])), todayCreated: prepared.get(today)!.created };
}

/** Refuses the whole write if any changed heading is outside the connection's grants, then lists the docs to write. */
function finish(ctx: ToolContext, work: Working, next: DailyDocument[], forced: string[] = []): VaultChange[] {
  const changes: VaultChange[] = [];
  const created = new Set([...(work.todayCreated ? [work.today] : []), ...forced]);
  for (const doc of next) {
    const before = work.baseline.get(doc.date);
    const changed = changedHeadings(before, doc);
    for (const name of changed) assertWrite(ctx.connection, { kind: 'heading', name });
    if (changed.length > 0 || doc.removedTaskIds?.length !== before?.removedTaskIds?.length || created.has(doc.date)) {
      changes.push({ key: `doc:${doc.date}`, value: doc });
    }
  }
  return changes;
}

const swap = (docs: DailyDocument[], doc: DailyDocument) => docs.map(d => d.date === doc.date ? doc : d);

interface TaskResult { id: string; title: string; date: string; heading: string; status: string }
const summarize = (date: string, section: string, task: TaskItem): TaskResult => ({ id: task.id, title: task.title, date, heading: section, status: task.status });

/** Runs one change to the latest copy of a task inside the vault queue. */
async function changeTask(
  ctx: ToolContext, id: string,
  change: (work: Working, copy: { date: string; heading: string; task: TaskItem }, doc: DailyDocument) => { docs: DailyDocument[]; result: TaskResult },
): Promise<TaskResult> {
  let result: TaskResult | undefined;
  await ctx.commit(() => {
    const work = loadWorking(ctx);
    const copy = findLatestCopy(work.docs, id);
    if (!copy || isClosedCopy(copy.task)) throw new ScopeError();
    assertWrite(ctx.connection, { kind: 'heading', name: copy.heading });
    const doc = work.docs.find(d => d.date === copy.date)!;
    const outcome = change(work, copy, doc);
    result = outcome.result;
    return finish(ctx, work, outcome.docs);
  });
  return result!;
}

const outcome = (result: TaskResult, action: ToolOutcome['action']): ToolOutcome => ({ result, action, targets: [{ key: `doc:${result.date}` }] });

function flip(docs: DailyDocument[], doc: DailyDocument, id: string): { docs: DailyDocument[]; result: TaskResult } {
  const toggled = toggleTaskDoneInDocument(doc, id, doc.date)!;
  return { docs: followDoneChanges(swap(docs, toggled.doc), doc, toggled.doc), result: summarize(doc.date, toggled.task.heading, toggled.task) };
}

export function registerTaskTools(server: McpServer, initialContext: ToolContext): void {
  defineTool(server, initialContext, {
    name: 'create_task', description: 'Creates a task under a shared heading on a day (today by default).',
    input: { title, heading, date: dateInput.optional(), description: description.optional(), status: z.string().optional(), tags: tags.optional(), checklist: checklist.optional() },
    readOnly: false,
    run: async (args, ctx) => {
      let result: TaskResult | undefined;
      await ctx.commit(() => {
        const date = args.date ?? ctx.today();
        const work = loadWorking(ctx, date);
        const status = args.status ?? 'not-started';
        checkStatus(ctx, status);
        const doc = work.docs.find(d => d.date === date)!;
        const existing = doc.headings.find(h => normalizeHeading(h.name) === normalizeHeading(args.heading));
        const name = existing?.name ?? args.heading;
        assertWrite(ctx.connection, { kind: 'heading', name });
        const section = existing ?? { name, items: [], notesContent: '' };
        const nowIso = ctx.now().toISOString();
        const task: TaskItem = {
          id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          title: oneLine(args.title),
          ...(args.description ? { description: args.description } : {}),
          status,
          createdDate: date,
          originalNoteDate: date,
          heading: name,
          order: section.items.length + 1,
          ...(args.tags?.length ? { tags: args.tags } : {}),
          ...(args.checklist?.length ? { checklist: checklistItems(args.checklist) } : {}),
          ...(status === 'done' ? { completedDate: date } : {}),
          historyLog: [{ id: `hist-${Date.now()}`, timestamp: nowIso, date, action: 'created', details: `Added to ${name}` }],
        };
        const next = { ...doc, updatedAt: nowIso, headings: existing
          ? doc.headings.map(h => h === existing ? { ...h, items: [...h.items, task] } : h)
          : [...doc.headings, { ...section, items: [task] }] };
        result = summarize(date, name, task);
        return finish(ctx, work, swap(work.docs, next), [date]);
      });
      return outcome(result!, 'create');
    },
  });

  defineTool(server, initialContext, {
    name: 'update_task', description: 'Edits a task. Setting heading moves it to that section on its day; status done or back follows the checkbox rules.',
    input: { taskId, title: title.optional(), description: description.optional(), status: z.string().optional(), heading: heading.optional(), tags: tags.optional(), checklist: checklist.optional() },
    readOnly: false,
    run: async (args, ctx) => outcome(await changeTask(ctx, args.taskId, (work, copy, doc) => {
      const nowIso = ctx.now().toISOString();
      let task = copy.task;
      if (args.status !== undefined) checkStatus(ctx, args.status);
      if (args.title !== undefined) task = { ...task, title: oneLine(args.title) };
      if (args.description !== undefined) task = { ...task, description: args.description || undefined };
      if (args.tags !== undefined) task = { ...task, tags: args.tags };
      if (args.checklist !== undefined) task = { ...task, checklist: checklistItems(args.checklist, task.checklist) };
      if (args.status !== undefined && args.status !== task.status) {
        const from = task.status;
        if (args.status === 'done' || from === 'done') task = toggleTaskDone(task, doc.date);
        if (task.status !== args.status) {
          task = { ...task, status: args.status, historyLog: [...task.historyLog, {
            id: `hist-${Date.now()}`, timestamp: nowIso, date: doc.date, action: 'status_changed', details: `Status changed from ${from} to ${args.status}`,
          }] };
        }
      }
      let next = replaceTaskInDocument(doc, task);
      let section = copy.heading;
      if (args.heading !== undefined && normalizeHeading(args.heading) !== normalizeHeading(copy.heading)) {
        const target = next.headings.find(h => normalizeHeading(h.name) === normalizeHeading(args.heading!))?.name ?? args.heading.trim();
        assertWrite(ctx.connection, { kind: 'heading', name: target });
        const moved = moveTaskToSection(next, task.id, target, nowIso);
        if (moved) { next = moved.doc; task = moved.task; section = moved.task.heading; }
      }
      return { docs: followDoneChanges(swap(work.docs, next), doc, next), result: summarize(doc.date, section, task) };
    }), 'update'),
  });

  defineTool(server, initialContext, {
    name: 'complete_task', description: 'Marks a task done, closing its earlier carried copies like the checkbox does.', input: { taskId }, readOnly: false,
    run: async ({ taskId: id }, ctx) => outcome(await changeTask(ctx, id, (work, copy, doc) =>
      copy.task.status === 'done' ? { docs: work.docs, result: summarize(doc.date, copy.heading, copy.task) } : flip(work.docs, doc, id)), 'complete'),
  });

  defineTool(server, initialContext, {
    name: 'reopen_task', description: 'Reopens a done task, restoring its status from before it was completed.', input: { taskId }, readOnly: false,
    run: async ({ taskId: id }, ctx) => outcome(await changeTask(ctx, id, (work, copy, doc) =>
      copy.task.status !== 'done' ? { docs: work.docs, result: summarize(doc.date, copy.heading, copy.task) } : flip(work.docs, doc, id)), 'update'),
  });

  defineTool(server, initialContext, {
    name: 'delete_task', description: 'Deletes a task from its day. It does not come back when days roll over.', input: { taskId }, readOnly: false, destructive: true,
    run: async ({ taskId: id }, ctx) => outcome(await changeTask(ctx, id, (work, copy, doc) => {
      const removed = removeTaskFromDocument(doc, id)!;
      return { docs: followDoneChanges(swap(work.docs, removed.doc), doc, removed.doc), result: summarize(doc.date, copy.heading, copy.task) };
    }), 'delete'),
  });

  defineTool(server, initialContext, {
    name: 'append_section_notes', description: 'Appends text to the notes of a shared heading on a day (today by default).',
    input: { heading, text: z.string().trim().min(1).max(20_000), date: dateInput.optional() }, readOnly: false,
    run: async (args, ctx) => {
      const date = args.date ?? ctx.today();
      await ctx.commit(() => {
        const work = loadWorking(ctx, date);
        const doc = work.docs.find(d => d.date === date)!;
        const existing = doc.headings.find(h => normalizeHeading(h.name) === normalizeHeading(args.heading));
        const name = existing?.name ?? args.heading;
        assertWrite(ctx.connection, { kind: 'heading', name });
        const notes = existing?.notesContent?.trimEnd();
        const content = notes ? `${notes}\n\n${args.text}` : args.text;
        const nowIso = ctx.now().toISOString();
        const next = { ...doc, updatedAt: nowIso, headings: existing
          ? doc.headings.map(h => h === existing ? { ...h, notesContent: content } : h)
          : [...doc.headings, { name, items: [], notesContent: content }] };
        return finish(ctx, work, swap(work.docs, next), [date]);
      });
      return { result: { date, heading: args.heading }, action: 'update', targets: [{ key: `doc:${date}` }] };
    },
  });
}
