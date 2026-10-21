import { DailyDocument, TaskItem } from '../types/daymark';

/**
 * Toggles a task between done and in-progress inside one daily document.
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
      const wasDone = task.status === 'done';
      task.status = wasDone ? 'in-progress' : 'done';
      task.completedDate = wasDone ? undefined : date;
      copy.updatedAt = new Date().toISOString();
      return { doc: copy, task, nowDone: !wasDone };
    }
  }
  return null;
}

export interface RemovedTask {
  task: TaskItem;
  heading: string;
  index: number;
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
