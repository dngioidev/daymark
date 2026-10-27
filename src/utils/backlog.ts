import type { BacklogData, BacklogItem, DailyDocument, TaskHistoryItem, TaskItem } from '../types/daymark';
import { isClosedCopy, mapEarlierCopies, removeTaskFromDocument, restoreTaskToDocument } from './taskActions';
import { BACKLOG_UNDO_PREFIX, isBacklogUndoEvent, mergeBacklogHistory } from './backlogHistory';

export const uneditedRecoveredBacklog = new WeakSet<BacklogData>();

export const EMPTY_BACKLOG: BacklogData = { items: [] };

const categoryKey = (category?: string): string => (category ?? '').trim().toLowerCase();
const isVisible = (item: BacklogItem): boolean => !item.pickedOn && !item.deletedAt;

/** Category groups are alphabetical, with unlabelled items last. Never sorts the input. */
export function visibleBacklog(data: BacklogData): BacklogItem[] {
  return data.items.filter(isVisible).sort((a, b) => {
    const left = categoryKey(a.category);
    const right = categoryKey(b.category);
    return left === right ? a.order - b.order : !left ? 1 : !right ? -1 : left.localeCompare(right);
  });
}

function nextOrder(data: BacklogData, category?: string): number {
  return Math.max(0, ...visibleBacklog(data).filter((i) => categoryKey(i.category) === categoryKey(category)).map((i) => i.order)) + 1;
}

export function addBacklogItem(data: BacklogData, input: { title: string; description?: string; category?: string }, nowIso: string, id = `task-${nowIso}-${Math.random().toString(36).slice(2, 8)}`): BacklogData {
  if (data.items.some((item) => item.id === id)) return data;
  return { items: [...data.items, { ...input, id, order: nextOrder(data, input.category), createdAt: nowIso, updatedAt: nowIso }] };
}

export function editBacklogItem(data: BacklogData, id: string, patch: Partial<Pick<BacklogItem, 'title' | 'description' | 'category'>>, nowIso: string): BacklogData {
  return { items: data.items.map((item) => {
    if (item.id !== id || !isVisible(item)) return item;
    const categoryChanged = Object.hasOwn(patch, 'category') && categoryKey(patch.category) !== categoryKey(item.category);
    return { ...item, ...patch, order: categoryChanged ? nextOrder(data, patch.category) : item.order, updatedAt: nowIso };
  }) };
}

export function removeBacklogItem(data: BacklogData, id: string, nowIso: string): BacklogData {
  return { items: data.items.map((item) => item.id === id && isVisible(item) ? { ...item, deletedAt: nowIso, updatedAt: nowIso } : item) };
}

export function restoreBacklogItem(data: BacklogData, id: string, nowIso: string): BacklogData {
  return { items: data.items.map((item) => {
    if (item.id !== id || !item.deletedAt) return item;
    const { deletedAt: _deleted, ...rest } = item;
    return { ...rest, updatedAt: nowIso };
  }) };
}

export function reorderBacklogItem(data: BacklogData, id: string, direction: 'up' | 'down', nowIso: string): BacklogData {
  const item = data.items.find((i) => i.id === id && isVisible(i));
  if (!item) return data;
  const group = visibleBacklog(data).filter((i) => categoryKey(i.category) === categoryKey(item.category));
  const index = group.findIndex((i) => i.id === id);
  const adjacent = index + (direction === 'up' ? -1 : 1);
  if (adjacent < 0 || adjacent >= group.length) return data;
  [group[index], group[adjacent]] = [group[adjacent], group[index]];
  const orders = new Map(group.map((i, position) => [i.id, position + 1]));
  return { items: data.items.map((i) => orders.has(i.id) && i.order !== orders.get(i.id) ? { ...i, order: orders.get(i.id)!, updatedAt: nowIso } : i) };
}

export function sectionForCategory(headings: string[], category: string | undefined, fallback: string): { name: string; isNew: boolean } {
  const wanted = category?.trim() || fallback.trim();
  const existing = headings.find((name) => categoryKey(name) === categoryKey(wanted));
  return { name: existing ?? wanted, isNew: existing === undefined };
}

function history(id: string, date: string, nowIso: string, details: string): TaskHistoryItem {
  return { id: `hist-backlog-${id}-${nowIso}-${details}`, timestamp: nowIso, date, action: 'moved', details };
}

/** Cancel this specific park while retaining the sync tombstone and its causal history. */
export function undoBacklogMove(beforeDocs: DailyDocument[], data: BacklogData, id: string, previous: BacklogItem | undefined, nowIso: string): { data: BacklogData; docs: DailyDocument[] } {
  let cancellation: TaskHistoryItem | undefined;
  const restored = { items: data.items.map(item => {
    if (item.id !== id) return item;
    const historyLog = mergeBacklogHistory(item.historyLog, previous?.historyLog) ?? [];
    const park = [...historyLog].reverse().find(event => event.action === 'moved' && event.details === 'Moved to backlog');
    cancellation = park ? { ...history(id, park.date, nowIso, 'Undid move to backlog'), id: `${BACKLOG_UNDO_PREFIX}${park.id}` } : undefined;
    return { ...(previous ?? { ...item, deletedAt: nowIso }), updatedAt: nowIso,
      historyLog: cancellation ? [...historyLog, cancellation] : historyLog };
  }) };
  const docs = beforeDocs.map(doc => {
    let changed = false;
    const headings = doc.headings.map(heading => ({ ...heading, items: heading.items.map(task => {
      if (!cancellation || task.id !== id || task.status === 'done' || task.status === 'archived' || isClosedCopy(task)) return task;
      changed = true;
      return { ...task, historyLog: [...(task.historyLog ?? []), cancellation] };
    }) }));
    return changed ? { ...doc, headings, updatedAt: nowIso } : doc;
  });
  return { data: restored, docs };
}

export function pickBacklogItem(docs: DailyDocument[], data: BacklogData, id: string, date: string, defaultHeadings: string[], nowIso: string): { docs: DailyDocument[]; data: BacklogData } | null {
  const item = data.items.find((i) => i.id === id && isVisible(i));
  // Closed history elsewhere is retained; an active copy or any destination copy blocks a duplicate.
  if (!item || docs.some((d) => d.headings.some((h) => h.items.some((t) => t.id === id && (d.date === date || !isClosedCopy(t)))))) return null;
  const target = docs.find((d) => d.date === date) ?? {
    date, type: 'daily' as const, headings: defaultHeadings.map((name) => ({ name, items: [], notesContent: '' })), updatedAt: nowIso,
  };
  const section = sectionForCategory(target.headings.map((h) => h.name), item.category, defaultHeadings[0] || 'Work');
  const picked = history(id, date, nowIso, 'Picked from backlog');
  const task: TaskItem = {
    id, title: item.title, description: item.description, checklist: item.checklist, tags: item.tags,
    status: !item.status || item.status === 'done' || item.status === 'archived' ? 'not-started' : item.status,
    createdDate: date, originalNoteDate: date, heading: section.name,
    order: (target.headings.find((h) => h.name === section.name)?.items.length ?? 0) + 1,
    historyLog: [...(item.historyLog ?? []), picked],
  };
  const restored = restoreTaskToDocument(target, { task, heading: section.name, index: task.order - 1 });
  const nextTarget = { ...restored, updatedAt: nowIso };
  return {
    docs: [...docs.filter((d) => d.date !== date), nextTarget].sort((a, b) => a.date.localeCompare(b.date)),
    data: { items: data.items.map((i) => i.id === id ? { ...i, historyLog: task.historyLog, pickedOn: date, updatedAt: nowIso } : i) },
  };
}

export function moveTaskToBacklog(docs: DailyDocument[], data: BacklogData, taskId: string, fromDate: string, nowIso: string): { docs: DailyDocument[]; data: BacklogData } | null {
  const source = docs.find((d) => d.date === fromDate);
  if (!source) return null;
  const removed = removeTaskFromDocument(source, taskId);
  if (!removed) return null;
  const task = removed.removed.task;
  if (task.status === 'done' || task.status === 'archived' || isClosedCopy(task)) return null;
  const previous = data.items.find((i) => i.id === taskId);
  const category = removed.removed.heading;
  const item: BacklogItem = {
    id: taskId, title: task.title, description: task.description, category, status: task.status,
    checklist: task.checklist, tags: task.tags,
    historyLog: [...(mergeBacklogHistory(previous?.historyLog, task.historyLog) ?? []), history(taskId, fromDate, nowIso, 'Moved to backlog')],
    order: nextOrder(data, category),
    createdAt: previous?.createdAt ?? nowIso, updatedAt: nowIso,
  };
  const withoutSource = docs.map((d) => d.date === fromDate ? { ...removed.doc, updatedAt: nowIso } : d);
  const closed = mapEarlierCopies(withoutSource, taskId, fromDate, (t) => t.status === 'done' || t.status === 'archived' || isClosedCopy(t) ? t : {
    ...t, status: 'done', statusBeforeDone: t.status, movedToBacklogDate: fromDate,
    historyLog: [...(t.historyLog ?? []), history(taskId, fromDate, nowIso, `Moved to backlog on ${fromDate}`)],
  }, nowIso);
  return { docs: closed, data: { items: previous ? data.items.map((i) => i.id === taskId ? item : i) : [...data.items, item] } };
}

const isBacklogEvent = (event: TaskHistoryItem) => !!event && event.action === 'moved' &&
  typeof event.id === 'string' && typeof event.timestamp === 'string' && typeof event.date === 'string' &&
  ['Moved to backlog', 'Picked from backlog', 'Undid move to backlog'].includes(event.details);
const backlogEvents = (value: TaskHistoryItem[] | undefined) => Array.isArray(value) ? value.filter(isBacklogEvent) : [];

function reconciliation(data: BacklogData, docs: DailyDocument[], nowIso?: string, markPicked = true) {
  const copies = new Map<string, { doc: DailyDocument; task: TaskItem }[]>();
  for (const doc of docs) for (const heading of doc.headings) for (const task of heading.items) {
    const list = copies.get(task.id) ?? []; list.push({ doc, task }); copies.set(task.id, list);
  }
  const stale = new Map<string, TaskHistoryItem>();
  const historiesById = new Map<string, TaskHistoryItem[]>();
  const items = data.items.map(item => {
    const daily = copies.get(item.id) ?? [];
    const knownEpisode = backlogEvents(item.historyLog).length > 0;
    const historyLog = mergeBacklogHistory(item.historyLog, ...daily.filter(({ task }) => knownEpisode || (task.status !== 'done' && task.status !== 'archived' && !isClosedCopy(task)))
      .map(({ task }) => backlogEvents(task.historyLog)));
    const events = historyLog ?? [];
    historiesById.set(item.id, events);
    const canceled = new Set(events.filter(isBacklogUndoEvent).map(event => event.id.slice(BACKLOG_UNDO_PREFIX.length)));
    const parkIndex = events.map(event => event.action === 'moved' && event.details === 'Moved to backlog' && !canceled.has(event.id)).lastIndexOf(true);
    const pickIndex = events.map(event => event.action === 'moved' && event.details === 'Picked from backlog').lastIndexOf(true);
    const park = events[parkIndex];
    const validPickIds = new Set(events.slice(parkIndex + 1).filter(event => event.details === 'Picked from backlog').map(event => event.id));
    const genuine = (task: TaskItem) => !park || backlogEvents(task.historyLog).some(event => validPickIds.has(event.id));
    if (park) stale.set(item.id, park);
    const active = daily.filter(({ task }) => task.status !== 'done' && task.status !== 'archived' && !isClosedCopy(task) && genuine(task))
      .sort((a, b) => a.doc.date.localeCompare(b.doc.date));
    if (!markPicked) return item;
    let next = historyLog === item.historyLog ? item : { ...item, historyLog };
    const pickDates = events.slice(parkIndex + 1).filter(event => event.details === 'Picked from backlog').map(event => event.date);
    if (park && next.pickedOn && !pickDates.includes(next.pickedOn)) {
      const { pickedOn: _picked, ...rest } = next; next = rest;
    }
    const date = [active[0]?.doc.date, ...pickDates].filter((value): value is string => !!value).sort()[0];
    if (!next.deletedAt && date && !next.pickedOn) {
      next = { ...next, pickedOn: date, updatedAt: nowIso ?? (active[0]?.doc.updatedAt || events[pickIndex]?.timestamp || next.updatedAt) };
    }
    return next;
  });
  let changed = false;
  const nextDocs = docs.map(doc => {
    let docChanged = false;
    const headings = doc.headings.map(heading => {
      let headingChanged = false;
      const items = heading.items.map(task => {
        const park = stale.get(task.id);
        if (!park || task.status === 'done' || task.status === 'archived' || isClosedCopy(task)) return task;
        const history = historiesById.get(task.id) ?? [];
        const parkIndex = history.map(event => event.id).lastIndexOf(park.id);
        const valid = new Set(history.slice(parkIndex + 1).filter(event => event.details === 'Picked from backlog').map(event => event.id));
        if (backlogEvents(task.historyLog).some(event => valid.has(event.id))) return task;
        headingChanged = docChanged = changed = true;
        const historyLog = Array.isArray(task.historyLog)
          ? (backlogEvents(task.historyLog).some(event => event.id === park.id) ? task.historyLog : [...task.historyLog, park])
          : task.historyLog === undefined ? [park] : undefined;
        return { ...task, status: 'done', statusBeforeDone: task.status, movedToBacklogDate: park.date,
          ...(historyLog ? { historyLog } : {}) };
      });
      return headingChanged ? { ...heading, items } : heading;
    });
    return docChanged ? { ...doc, headings } : doc;
  });
  return { backlog: markPicked ? { items } : data, docs: changed ? nextDocs : docs };
}

export function reconcileBacklog(data: BacklogData, docs: DailyDocument[], nowIso?: string): BacklogData {
  return reconciliation(data, docs, nowIso).backlog;
}

/** Close only causally stale parked copies; retain every document, task field and note. */
export function reconcileBacklogVault(data: BacklogData, docs: DailyDocument[], markPicked = true): { backlog: BacklogData; docs: DailyDocument[] } {
  return reconciliation(data, docs, undefined, markPicked);
}
