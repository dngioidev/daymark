import type { DailyDocument, EventItem, TaskItem } from '../types/daymark';
import { eventDateAtInstant, eventDateHasInstant, eventEndInstant, isValidEventDate, isValidEventInstant, resolveEventTime } from './eventTime';

/** Recovered events are protected from save/sync until a user edit creates a new array. */
export const uneditedRecoveredEvents = new WeakSet<EventItem[]>();

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validChecklist(value: unknown): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  return value.every((item) => {
    if (!record(item) || typeof item.id !== 'string' || !item.id.trim() ||
        typeof item.text !== 'string' || typeof item.done !== 'boolean' || ids.has(item.id)) return false;
    ids.add(item.id);
    return true;
  });
}

function validEventCore(value: unknown): value is EventItem {
  if (!record(value)) return false;
  if (typeof value.id !== 'string' || !/^[\w.-]{1,200}$/.test(value.id)) return false;
  if (typeof value.title !== 'string' || !value.title.trim() || /[\r\n]/.test(value.title)) return false;
  if (typeof value.date !== 'string' || !isValidEventDate(value.date)) return false;
  if (typeof value.heading !== 'string' || !value.heading.trim() || /[\r\n]/.test(value.heading)) return false;
  if (typeof value.order !== 'number' || !Number.isFinite(value.order)) return false;
  if (value.description !== undefined && typeof value.description !== 'string') return false;
  if (!validChecklist(value.checklist)) return false;
  if (typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) return false;
  if (typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) return false;
  if (value.durationMinutes !== undefined && (!Number.isSafeInteger(value.durationMinutes) || Number(value.durationMinutes) <= 0)) return false;
  if (value.timing !== undefined) {
    if (!record(value.timing) || typeof value.timing.localTime !== 'string' ||
        typeof value.timing.timeZone !== 'string' || typeof value.timing.startInstant !== 'string' ||
        !isValidEventInstant(value.timing.startInstant)) return false;
    const result = resolveEventTime(value.date, value.timing.localTime, value.timing.timeZone);
    if (result.kind !== 'valid' || !result.instants.includes(value.timing.startInstant)) return false;
    if (value.durationMinutes !== undefined && !eventEndInstant(value as unknown as EventItem)) return false;
  }
  return true;
}

/** Runtime validation for stored, imported and synchronized event entities. */
export function validateEvent(event: unknown): event is EventItem {
  return validEventCore(event);
}

/** Returns events occupying the selected original-zone date; end instants are exclusive. */
export function eventsForDate(events: readonly EventItem[], date: string): EventItem[] {
  if (!isValidEventDate(date)) return [];
  return events.filter((event) => {
    if (!validEventCore(event)) return false;
    if (event.date === date) return true;
    if (!event.timing || event.durationMinutes === undefined) return false;
    const end = eventEndInstant(event);
    if (!end) return false;
    const startDate = eventDateAtInstant(event.timing.startInstant, event.timing.timeZone);
    const lastOccupiedDate = eventDateAtInstant(new Date(Date.parse(end) - 1).toISOString(), event.timing.timeZone);
    if (!startDate || !lastOccupiedDate || date < startDate || date > lastOccupiedDate) return false;
    // A whole-day date-line skip has no local instants and must not be treated as occupied.
    return eventDateHasInstant(date, event.timing.timeZone);
  });
}

/** Upserts an event by ID, cleaning any duplicate copies while preserving untouched item order. */
export function upsertEvent(events: readonly EventItem[], event: EventItem): EventItem[] {
  const result: EventItem[] = [];
  let inserted = false;
  for (const current of events) {
    if (current.id === event.id) {
      if (!inserted) {
        result.push(event);
        inserted = true;
      }
    } else result.push(current);
  }
  if (!inserted) result.push(event);
  return result;
}

/** Removes every copy of an event ID without modifying the source collection. */
export function removeEvent(events: readonly EventItem[], id: string): EventItem[] {
  return events.filter((event) => event.id !== id);
}

export type MixedSectionItem = { kind: 'task'; item: TaskItem } | { kind: 'event'; item: EventItem };

/** Combines a heading's tasks and events by shared order, then stable ID. */
export function mixedSectionItems(tasks: readonly TaskItem[], events: readonly EventItem[]): MixedSectionItem[] {
  return [
    ...tasks.map((item): MixedSectionItem => ({ kind: 'task', item })),
    ...events.map((item): MixedSectionItem => ({ kind: 'event', item })),
  ].sort((a, b) => a.item.order - b.item.order || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0));
}

/** Appends after the last task or event in a day/section without changing existing order values. */
export function nextEventOrder(docs: readonly DailyDocument[], events: readonly EventItem[], date: string, heading: string): number {
  const key = heading.toLowerCase();
  const taskOrders = (docs.find((doc) => doc.date === date)?.headings ?? [])
    .filter((section) => section.name.toLowerCase() === key)
    .flatMap((section) => section.items.filter((task) => !task.movedToBacklogDate).map((task) => task.order));
  const eventOrders = events.filter((event) => event.date === date && event.heading.toLowerCase() === key).map((event) => event.order);
  return Math.max(0, ...taskOrders, ...eventOrders) + 1;
}
