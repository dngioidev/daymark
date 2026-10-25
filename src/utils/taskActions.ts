import { DailyDocument, TaskItem } from '../types/daymark';
import { getNextDate } from './lifecycleEngine';

/** A null destination hides the quick move when it would do nothing. */
export function getMoveToTomorrowDate(status: TaskItem['status'], fromDate: string, today: string): string | null {
  const tomorrow = getNextDate(today);
  return status === 'done' || tomorrow === fromDate ? null : tomorrow;
}

/** Validation shared by the move dialog and its caller; destinations start today. */
export function getMoveTaskDateError(toDate: string, fromDate: string, today: string): string | null {
  if (!toDate) return 'Choose a date.';
  if (toDate === fromDate) return 'Choose a different day from the source day.';
  if (toDate < today) return 'Choose today or a later day.';
  return null;
}

/** Shared checkbox behaviour for task rows and queued Android widget actions. */
export function toggleTaskDone(task: TaskItem, date: string): TaskItem {
  const wasDone = task.status === 'done';
  const { statusBeforeDone, ...rest } = task;
  return {
    ...rest,
    status: wasDone ? statusBeforeDone || 'in-progress' : 'done',
    ...(!wasDone ? { statusBeforeDone: task.status } : {}),
    completedDate: wasDone ? undefined : date,
    historyLog: [...(task.historyLog ?? []), {
      id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      timestamp: new Date().toISOString(),
      date,
      action: wasDone ? 'reopened' : 'status_changed',
      details: wasDone ? 'Marked not done' : doneNote(task, date),
    }],
  };
}

const dayNumber = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86_400_000;

/** "Marked done", plus how long the task was carried when it started on an earlier day. */
function doneNote(task: TaskItem, date: string): string {
  // Legacy tasks may have no original date
  const days = task.originalNoteDate ? dayNumber(date) - dayNumber(task.originalNoteDate) : 0;
  return days > 0 ? `Marked done · carried from ${task.originalNoteDate}, done after ${days} day${days === 1 ? '' : 's'}` : 'Marked done';
}

/**
 * When a carried task is finished on `doneDate`, its still-open copies on earlier days are closed:
 * done, with `doneLaterDate` marking that the work happened later (day stats leave them out).
 * Returns `docs` itself when nothing changes.
 */
export function closeEarlierCopies(docs: DailyDocument[], taskId: string, doneDate: string): DailyDocument[] {
  return mapEarlierCopies(docs, taskId, doneDate, (t) => t.status === 'done' || t.status === 'archived' ? t : {
    ...t,
    status: 'done',
    statusBeforeDone: t.status,
    completedDate: doneDate,
    doneLaterDate: doneDate,
    historyLog: [...(t.historyLog ?? []), {
      id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      timestamp: new Date().toISOString(),
      date: doneDate,
      action: 'status_changed',
      details: `Done later on ${doneDate}`,
    }],
  });
}

/** Undoes closeEarlierCopies when the task is reopened on `doneDate`. */
export function reopenEarlierCopies(docs: DailyDocument[], taskId: string, doneDate: string): DailyDocument[] {
  return mapEarlierCopies(docs, taskId, doneDate, (t) => {
    if (t.doneLaterDate !== doneDate) return t;
    const { statusBeforeDone, completedDate: _completed, doneLaterDate: _later, ...rest } = t;
    return { ...rest, status: statusBeforeDone || 'in-progress' };
  });
}

/** A copy closed because the task was finished on a later day: not open, and not done on its own day. */
export const isDoneLater = (task: TaskItem): boolean => task.status === 'done' && !!task.doneLaterDate;

/**
 * After one day changes from `previous` to `next`, closes earlier copies of tasks that became done
 * there and reopens them for tasks that are no longer done. Covers the checkbox, the status menu
 * and Markdown edits alike.
 */
export function followDoneChanges(docs: DailyDocument[], previous: DailyDocument | undefined, next: DailyDocument): DailyDocument[] {
  const statusOf = (d: DailyDocument | undefined) => new Map((d?.headings ?? []).flatMap((h) => h.items.map((t) => [t.id, t.status] as const)));
  const before = statusOf(previous);
  let result = docs;
  for (const [id, status] of statusOf(next)) {
    const was = before.get(id);
    if (status === 'done' && was !== undefined && was !== 'done') result = closeEarlierCopies(result, id, next.date);
    // Archiving a finished task keeps its earlier copies closed
    else if (was === 'done' && status !== 'done' && status !== 'archived') result = reopenEarlierCopies(result, id, next.date);
  }
  // A closed copy reopened on its own day (status menu, Markdown) is an ordinary open task again
  if (next.headings.some((h) => h.items.some((t) => t.doneLaterDate && t.status !== 'done'))) {
    result = result.map((d) => d.date !== next.date ? d : {
      ...d,
      headings: d.headings.map((h) => ({ ...h, items: h.items.map((t) => {
        if (!t.doneLaterDate || t.status === 'done') return t;
        const { doneLaterDate: _later, ...rest } = t;
        return rest;
      }) })),
    });
  }
  return result;
}

function mapEarlierCopies(docs: DailyDocument[], taskId: string, before: string, change: (t: TaskItem) => TaskItem): DailyDocument[] {
  let changed = false;
  const next = docs.map((d) => {
    if (d.date >= before) return d;
    let docChanged = false;
    const headings = d.headings.map((h) => {
      let headingChanged = false;
      const items = h.items.map((t) => {
        if (t.id !== taskId) return t;
        const updated = change(t);
        if (updated !== t) headingChanged = true;
        return updated;
      });
      if (!headingChanged) return h;
      docChanged = true;
      return { ...h, items };
    });
    if (!docChanged) return d;
    changed = true;
    return { ...d, headings, updatedAt: new Date().toISOString() };
  });
  return changed ? next : docs;
}

/**
 * Toggles a task between done and its previous status inside one daily document.
 * Returns the updated copy plus the task, or null when the task is not in the document.
 * Shared by the UI checkbox and by actions queued from the Android widget.
 */
export function toggleTaskDoneInDocument(
  doc: DailyDocument,
  taskId: string,
  date: string
): { doc: DailyDocument; task: TaskItem; nowDone: boolean } | null {
  const copy: DailyDocument = JSON.parse(JSON.stringify(doc));
  for (const heading of copy.headings) {
    const task = heading.items.find((t) => t.id === taskId);
    if (task) {
      const updated = toggleTaskDone(task, date);
      heading.items = heading.items.map((item) => item.id === taskId ? updated : item);
      copy.updatedAt = new Date().toISOString();
      return { doc: copy, task: updated, nowDone: updated.status === 'done' };
    }
  }
  return null;
}

export interface RemovedTask {
  task: TaskItem;
  heading: string;
  index: number;
}

/** Moves a task without changing its identity or carry-forward origin. */
export function moveTaskToDate(
  docs: DailyDocument[],
  taskId: string,
  fromDate: string,
  toDate: string,
  defaultHeadings: string[],
  nowIso: string
): DailyDocument[] | null {
  if (fromDate === toDate) return null;
  const source = docs.find((d) => d.date === fromDate);
  const target = docs.find((d) => d.date === toDate);
  if (!source || target?.headings.some((h) => h.items.some((t) => t.id === taskId))) return null;
  const result = removeTaskFromDocument(source, taskId);
  if (!result) return null;
  const targetDoc: DailyDocument = target ?? {
    date: toDate,
    type: 'daily',
    headings: defaultHeadings.map((name) => ({ name, items: [], notesContent: '' })),
    updatedAt: nowIso,
  };
  const headingName = result.removed.heading;
  const matchingHeading = targetDoc.headings.find((h) => h.name.toLowerCase() === headingName.toLowerCase());
  const headings = matchingHeading ? targetDoc.headings : [...targetDoc.headings, { name: headingName, items: [], notesContent: '' }];
  const movedTask = result.removed.task;
  const { removedTaskIds, ...rest } = targetDoc;
  const remaining = (removedTaskIds ?? []).filter((id) => id !== taskId);
  const nextTarget: DailyDocument = {
    ...rest,
    updatedAt: nowIso,
    ...(remaining.length ? { removedTaskIds: remaining } : {}),
    headings: headings.map((h) => h.name !== (matchingHeading?.name ?? headingName) ? h : {
      ...h,
      items: [...h.items, {
        ...movedTask,
        heading: h.name,
        order: h.items.length + 1,
        historyLog: [...(movedTask.historyLog ?? []), {
          id: `hist-move-${taskId}-${toDate}`,
          timestamp: nowIso,
          date: fromDate,
          action: 'moved',
          details: `Moved from ${fromDate} to ${toDate}`,
        }],
      }],
    }),
  };
  return [...docs.filter((d) => d.date !== fromDate && d.date !== toDate), { ...result.doc, updatedAt: nowIso }, nextTarget]
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Undoes only this move, preserving other edits made since it. `before.doc` is the old target. */
export function undoMoveTask(
  docs: DailyDocument[],
  taskId: string,
  fromDate: string,
  toDate: string,
  before: { doc: DailyDocument | undefined; removed: RemovedTask },
  nowIso: string
): DailyDocument[] {
  return docs.flatMap((doc) => {
    if (doc.date === fromDate) return [{ ...restoreTaskToDocument(doc, before.removed), updatedAt: nowIso }];
    if (doc.date !== toDate) return [doc];
    const headings = doc.headings.map((h) => ({ ...h, items: h.items.filter((t) => t.id !== taskId) }));
    const { removedTaskIds, ...rest } = doc;
    const remaining = (removedTaskIds ?? []).filter((id) => id !== taskId);
    if (before.doc?.removedTaskIds?.includes(taskId)) remaining.push(taskId);
    if (!before.doc && !remaining.length && !doc.rawMarkdown && headings.every((h) => !h.items.length && !h.notesContent?.trim())) return [];
    return [{ ...rest, headings, ...(remaining.length ? { removedTaskIds: remaining } : {}), updatedAt: nowIso }];
  });
}

/**
 * Removes one task and records its id in `removedTaskIds` so rollover and sync do not bring it back.
 * Returns null when the task is not in the document.
 */
export function removeTaskFromDocument(
  doc: DailyDocument,
  taskId: string
): { doc: DailyDocument; removed: RemovedTask } | null {
  let removed: RemovedTask | null = null;
  const headings = doc.headings.map((h) => {
    const index = h.items.findIndex((t) => t.id === taskId);
    if (index === -1) return h;
    removed = { task: h.items[index], heading: h.name, index };
    return { ...h, items: h.items.filter((t) => t.id !== taskId) };
  });
  if (!removed) return null;
  const removedTaskIds = [...new Set([...(doc.removedTaskIds ?? []), taskId])];
  return { doc: { ...doc, headings, removedTaskIds, updatedAt: new Date().toISOString() }, removed };
}

/** Puts a removed task back where it was and clears its tombstone. Does nothing if the task is already present. */
export function restoreTaskToDocument(doc: DailyDocument, removed: RemovedTask): DailyDocument {
  if (doc.headings.some((h) => h.items.some((t) => t.id === removed.task.id))) return doc;
  const headings = doc.headings.some((h) => h.name === removed.heading)
    ? doc.headings
    : [...doc.headings, { name: removed.heading, items: [], notesContent: '' }];
  const nextHeadings = headings.map((h) => {
    if (h.name !== removed.heading) return h;
    const items = [...h.items];
    items.splice(Math.min(Math.max(removed.index, 0), items.length), 0, removed.task);
    return { ...h, items };
  });
  const { removedTaskIds, ...rest } = doc;
  const remaining = (removedTaskIds ?? []).filter((id) => id !== removed.task.id);
  return {
    ...rest,
    headings: nextHeadings,
    ...(remaining.length > 0 ? { removedTaskIds: remaining } : {}),
    updatedAt: new Date().toISOString(),
  };
}

/** Swaps one task for another version of itself (matched by id), leaving everything else as is. */
export function replaceTaskInDocument(doc: DailyDocument, task: TaskItem): DailyDocument {
  return {
    ...doc,
    headings: doc.headings.map((h) => ({ ...h, items: h.items.map((t) => (t.id === task.id ? task : t)) })),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Finishes a Markdown edit: tasks that were in `previous` but are gone from `parsed` were deleted by the edit,
 * so they join the day's tombstones (existing ones are kept).
 */
export function applyMarkdownEdit(previous: DailyDocument, parsed: DailyDocument): DailyDocument {
  const kept = new Set(parsed.headings.flatMap((h) => h.items.map((t) => t.id)));
  const dropped = previous.headings.flatMap((h) => h.items.map((t) => t.id)).filter((id) => !kept.has(id));
  const removedTaskIds = [...new Set([...(previous.removedTaskIds ?? []), ...(parsed.removedTaskIds ?? []), ...dropped])].filter(
    (id) => !kept.has(id)
  );
  const { removedTaskIds: _ignored, ...rest } = parsed;
  return removedTaskIds.length > 0 ? { ...rest, removedTaskIds } : rest;
}
