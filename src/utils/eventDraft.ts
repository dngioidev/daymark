import type { ChecklistItem, EventItem, EventTiming } from '../types/daymark';
import { eventDateAtInstant, eventEndInstant, isValidEventDate, resolveEventTime } from './eventTime';
import { validateEvent } from './events';

export type EventSpanMode = 'duration' | 'end';

export interface EventDraft {
  title: string;
  date: string;
  heading: string;
  order: number;
  description: string;
  checklist: ChecklistItem[];
  hasStartTime: boolean;
  localTime: string;
  timeZone: string;
  startOccurrence: string;
  spanMode: EventSpanMode;
  durationHours: string;
  durationMinutes: string;
  endDate: string;
  endTime: string;
  endOccurrence: string;
}

export interface EventBuildResult { event?: EventItem; error?: string }

const deviceTimeZone = (): string => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
};

function timeAtInstant(instant: string, zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant));
    return `${parts.find(part => part.type === 'hour')?.value ?? '00'}:${parts.find(part => part.type === 'minute')?.value ?? '00'}`;
  } catch { return ''; }
}

export function createEventDraft(event?: EventItem | null, date = '', headings: string[] = [], initialDate?: string): EventDraft {
  const zone = event?.timing?.timeZone ?? deviceTimeZone();
  const endInstant = event?.timing && event.durationMinutes !== undefined && (!initialDate || initialDate === event.date) ? eventEndInstant(event) : undefined;
  const total = event?.durationMinutes ?? 0;
  return {
    title: event?.title ?? '', date: initialDate ?? event?.date ?? date,
    heading: event?.heading ?? headings[0] ?? 'Work', order: event?.order ?? 1,
    description: event?.description ?? '', checklist: event?.checklist?.map(item => ({ ...item })) ?? [],
    hasStartTime: !!event?.timing,
    localTime: event?.timing?.localTime ?? '', timeZone: zone,
    startOccurrence: initialDate && initialDate !== event?.date ? '' : event?.timing?.startInstant ?? '',
    spanMode: endInstant ? 'end' : 'duration',
    durationHours: event?.durationMinutes === undefined ? '' : String(Math.floor(total / 60)),
    durationMinutes: event?.durationMinutes === undefined ? '' : String(total % 60),
    endDate: endInstant ? eventDateAtInstant(endInstant, zone) ?? initialDate ?? event!.date : initialDate ?? event?.date ?? date,
    endTime: endInstant ? timeAtInstant(endInstant, zone) : '',
    endOccurrence: endInstant ?? '',
  };
}

function getDuration(draft: EventDraft, startInstant?: string): { duration?: number; error?: string } {
  if (draft.spanMode === 'duration' || !draft.hasStartTime) {
    if (!draft.durationHours.trim() && !draft.durationMinutes.trim()) return {};
    if (!/^\d+$/.test(draft.durationHours || '0') || !/^\d+$/.test(draft.durationMinutes || '0')) return { error: 'Enter a whole number of hours and minutes.' };
    const hours = Number(draft.durationHours || 0), minutes = Number(draft.durationMinutes || 0);
    if (minutes > 59) return { error: 'Minutes must be less than 60.' };
    const duration = hours * 60 + minutes;
    if (!Number.isSafeInteger(duration) || duration <= 0) return { error: 'Duration must be at least one minute.' };
    return { duration };
  }

  if (!draft.endTime) return {};
  if (!draft.endDate) return { error: 'Choose an end date.' };
  if (draft.endDate < draft.date) return { error: 'End date must be on or after the event date.' };
  const end = resolveEventTime(draft.endDate, draft.endTime, draft.timeZone);
  if (end.kind === 'invalid') return { error: end.message };
  const endInstant = end.instants.length === 1 ? end.instants[0] : end.instants.includes(draft.endOccurrence) ? draft.endOccurrence : undefined;
  if (!endInstant) return { error: 'Choose which occurrence of the end time to use.' };
  const duration = (Date.parse(endInstant) - Date.parse(startInstant ?? '')) / 60_000;
  if (!Number.isSafeInteger(duration) || duration <= 0) {
    if (draft.endDate === draft.date && draft.endTime < draft.localTime) return { error: 'Choose whether this end time is on the next day.' };
    return { error: 'End time must be later than the start time.' };
  }
  return { duration };
}

export function shouldOfferNextDay(draft: EventDraft): boolean {
  if (!draft.hasStartTime || draft.spanMode !== 'end' || draft.endDate !== draft.date ||
      !draft.localTime || !draft.endTime || draft.endTime >= draft.localTime) return false;
  const start = resolveEventTime(draft.date, draft.localTime, draft.timeZone);
  const end = resolveEventTime(draft.endDate, draft.endTime, draft.timeZone);
  if (start.kind !== 'valid' || end.kind !== 'valid') return false;
  const startInstant = start.instants.length === 1 ? start.instants[0] : start.instants.includes(draft.startOccurrence) ? draft.startOccurrence : undefined;
  const endInstant = end.instants.length === 1 ? end.instants[0] : end.instants.includes(draft.endOccurrence) ? draft.endOccurrence : undefined;
  return !!startInstant && !!endInstant && Date.parse(endInstant) <= Date.parse(startInstant);
}

function formatLocalEnd(instant: string, zone: string): { date: string; time: string } | undefined {
  const date = eventDateAtInstant(instant, zone);
  if (!date) return undefined;
  return { date, time: timeAtInstant(instant, zone) };
}

export function changeSpanMode(draft: EventDraft, spanMode: EventSpanMode): EventDraft {
  if (draft.spanMode === spanMode) return draft;
  const start = draft.hasStartTime ? resolveEventTime(draft.date, draft.localTime, draft.timeZone) : null;
  const startInstant = start?.kind === 'valid'
    ? start.instants.length === 1 ? start.instants[0] : start.instants.includes(draft.startOccurrence) ? draft.startOccurrence : undefined
    : undefined;
  if (!startInstant) return { ...draft, spanMode };
  const current = getDuration(draft, startInstant);
  if (current.duration === undefined || current.error) {
    return spanMode === 'duration'
      ? { ...draft, spanMode, durationHours: '', durationMinutes: '' }
      : { ...draft, spanMode, endDate: draft.date, endTime: '', endOccurrence: '' };
  }
  if (spanMode === 'duration') {
    return { ...draft, spanMode, durationHours: String(Math.floor(current.duration / 60)), durationMinutes: String(current.duration % 60) };
  }
  const endMillis = Date.parse(startInstant) + current.duration * 60_000;
  if (!Number.isFinite(endMillis) || Math.abs(endMillis) > 8.64e15) return { ...draft, spanMode, endDate: '', endTime: '' };
  let endInstant: string;
  try { endInstant = new Date(endMillis).toISOString(); } catch { return { ...draft, spanMode, endDate: '', endTime: '' }; }
  const end = formatLocalEnd(endInstant, draft.timeZone);
  return end ? { ...draft, spanMode, endDate: end.date, endTime: end.time, endOccurrence: endInstant } : { ...draft, spanMode };
}

export type EventMoveResolution =
  | { kind: 'ready'; timing?: EventTiming }
  | { kind: 'choice'; instants: string[] }
  | { kind: 'invalid'; message: string };

/** Resolve a date move without silently choosing between repeated local times. */
export function resolveEventMove(event: EventItem, date: string, chosenStartInstant?: string): EventMoveResolution {
  if (!event.timing) return { kind: 'ready' };
  const resolution = resolveEventTime(date, event.timing.localTime, event.timing.timeZone);
  if (resolution.kind === 'invalid') return { kind: 'invalid', message: resolution.message };
  if (resolution.instants.length > 1 && !chosenStartInstant) return { kind: 'choice', instants: resolution.instants };
  const startInstant = chosenStartInstant ?? resolution.instants[0];
  if (!resolution.instants.includes(startInstant)) return { kind: 'invalid', message: 'Choose a valid occurrence of this local time.' };
  const timing = { ...event.timing, startInstant };
  const moved = { ...event, date, timing };
  if (!validateEvent(moved)) return { kind: 'invalid', message: 'The event schedule is not valid on that date.' };
  return { kind: 'ready', timing };
}

export function validateEventDraft(draft: EventDraft): string | undefined {
  if (!draft.title.trim()) return 'Enter an event title.';
  if (/[\r\n]/.test(draft.title)) return 'Event title must fit on one line.';
  if (!isValidEventDate(draft.date)) return 'Choose a valid event date.';
  if (!draft.heading.trim() || /[\r\n]/.test(draft.heading)) return 'Choose a section.';
  let startInstant: string | undefined;
  if (draft.hasStartTime) {
    const start = resolveEventTime(draft.date, draft.localTime, draft.timeZone);
    if (start.kind === 'invalid') return start.message;
    startInstant = start.instants.length === 1 ? start.instants[0] : start.instants.includes(draft.startOccurrence) ? draft.startOccurrence : undefined;
    if (!startInstant) return 'Choose which occurrence of the repeated start time to use.';
  }
  const span = getDuration(draft, startInstant);
  return span.error;
}

export function eventFromDraft(draft: EventDraft, previous?: EventItem | null, nowIso = new Date().toISOString()): EventBuildResult {
  const error = validateEventDraft(draft);
  if (error) return { error };
  let timing: EventTiming | undefined;
  let startInstant: string | undefined;
  if (draft.hasStartTime) {
    const start = resolveEventTime(draft.date, draft.localTime, draft.timeZone);
    if (start.kind !== 'valid') return { error: start.message };
    startInstant = start.instants.length === 1 ? start.instants[0] : start.instants.includes(draft.startOccurrence) ? draft.startOccurrence : undefined;
    if (!startInstant) return { error: 'Choose which occurrence of the repeated start time to use.' };
    timing = { localTime: draft.localTime, timeZone: draft.timeZone, startInstant };
  }
  const span = getDuration(draft, startInstant);
  if (span.error) return { error: span.error };
  const event: EventItem = {
    id: previous?.id ?? `event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: draft.title.trim(), date: draft.date, heading: draft.heading.trim(), order: draft.order,
    ...(draft.description.length ? { description: draft.description } : {}),
    ...(draft.checklist.length ? { checklist: draft.checklist.map(item => ({ ...item })) } : {}),
    ...(timing ? { timing } : {}), ...(span.duration !== undefined ? { durationMinutes: span.duration } : {}),
    createdAt: previous?.createdAt ?? nowIso, updatedAt: nowIso,
  };
  if (!validateEvent(event)) return { error: 'The event schedule is not valid. Check the date, time, time zone, and duration.' };
  return { event };
}
