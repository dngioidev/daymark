import type { BacklogData, BacklogItem, DailyDocument, TaskHistoryItem, TaskItem } from '../types/daymark';
import { isClosedCopy, mapEarlierCopies, removeTaskFromDocument, restoreTaskToDocument } from './taskActions';

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

export function pickBacklogItem(docs: DailyDocument[], data: BacklogData, id: string, date: string, defaultHeadings: string[], nowIso: string): { docs: DailyDocument[]; data: BacklogData } | null {
  const item = data.items.find((i) => i.id === id && isVisible(i));
  // Closed history elsewhere is retained; an active copy or any destination copy blocks a duplicate.
  if (!item || docs.some((d) => d.headings.some((h) => h.items.some((t) => t.id === id && (d.date === date || !isClosedCopy(t)))))) return null;
  const target = docs.find((d) => d.date === date) ?? {
    date, type: 'daily' as const, headings: defaultHeadings.map((name) => ({ name, items: [], notesContent: '' })), updatedAt: nowIso,
  };
  const section = sectionForCategory(target.headings.map((h) => h.name), item.category, defaultHeadings[0] || 'Work');
  const task: TaskItem = {
    id, title: item.title, description: item.description, checklist: item.checklist, tags: item.tags,
    status: !item.status || item.status === 'done' || item.status === 'archived' ? 'not-started' : item.status,
    createdDate: date, originalNoteDate: date, heading: section.name,
    order: (target.headings.find((h) => h.name === section.name)?.items.length ?? 0) + 1,
    historyLog: [...(item.historyLog ?? []), history(id, date, nowIso, 'Picked from backlog')],
  };
  const restored = restoreTaskToDocument(target, { task, heading: section.name, index: task.order - 1 });
  const nextTarget = { ...restored, updatedAt: nowIso };
  return {
    docs: [...docs.filter((d) => d.date !== date), nextTarget].sort((a, b) => a.date.localeCompare(b.date)),
    data: { items: data.items.map((i) => i.id === id ? { ...i, pickedOn: date, updatedAt: nowIso } : i) },
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
    historyLog: [...(task.historyLog ?? []), history(taskId, fromDate, nowIso, 'Moved to backlog')],
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

export function reconcileBacklog(data: BacklogData, docs: DailyDocument[], nowIso: string): BacklogData {
  const earliest = new Map<string, string>();
  for (const doc of docs) for (const heading of doc.headings) for (const task of heading.items) {
    if (task.status === 'done' || task.status === 'archived' || isClosedCopy(task)) continue;
    if (!earliest.has(task.id) || doc.date < earliest.get(task.id)!) earliest.set(task.id, doc.date);
  }
  return { items: data.items.map((item) => isVisible(item) && earliest.has(item.id) ? { ...item, pickedOn: earliest.get(item.id)!, updatedAt: nowIso } : item) };
}
