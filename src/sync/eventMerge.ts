import type { ChecklistItem, EventItem } from '../types/daymark';
import type { MergeResult } from './merge';
import { trustedTime } from './clock';
import { CONFLICT_SEPARATOR, sameValue } from './mergeShared';

type EventSchedule = Pick<EventItem, 'date' | 'timing' | 'durationMinutes'>;

function pick<T>(base: T | null, ours: T | null, theirs: T | null): { value: T | null; conflict: boolean } {
  if (sameValue(ours, theirs)) return { value: ours, conflict: false };
  if (sameValue(base, ours)) return { value: theirs, conflict: false };
  if (sameValue(base, theirs)) return { value: ours, conflict: false };
  if (ours === null) return { value: theirs, conflict: true };
  if (theirs === null) return { value: ours, conflict: true };
  // On a true concurrent conflict, the incoming writer wins consistently.
  return { value: theirs, conflict: true };
}

function mergeDescription(base: string | undefined, ours: string | undefined, theirs: string | undefined): { value: string | undefined; conflict: boolean } {
  const result = pick(base, ours, theirs);
  if (!result.conflict) return { value: result.value ?? undefined, conflict: false };
  const left = ours ?? '';
  const right = theirs ?? '';
  if (left && right && left.includes(right)) return { value: left, conflict: false };
  if (left && right && right.includes(left)) return { value: right, conflict: false };
  return { value: `${left}${CONFLICT_SEPARATOR}${right}`, conflict: true };
}

function mergeChecklistItem(base: ChecklistItem | undefined, ours: ChecklistItem | undefined, theirs: ChecklistItem | undefined): { value?: ChecklistItem; conflict: boolean } {
  const whole = pick(base ?? null, ours ?? null, theirs ?? null);
  if (!whole.conflict) return { value: whole.value ?? undefined, conflict: false };
  if (!ours || !theirs) return { value: ours ?? theirs, conflict: true };
  const choose = <K extends keyof ChecklistItem>(field: K) => {
    const selected = pick(base?.[field] ?? null, ours[field] ?? null, theirs[field] ?? null);
    return { value: selected.value, conflict: selected.conflict };
  };
  const text = choose('text');
  const done = choose('done');
  return { value: { id: ours.id, text: text.value ?? ours.text, done: done.value ?? ours.done }, conflict: text.conflict || done.conflict };
}

function mergeChecklist(base: ChecklistItem[] | undefined, ours: ChecklistItem[] | undefined, theirs: ChecklistItem[] | undefined): { value?: ChecklistItem[]; conflicts: string[] } {
  const baseItems = new Map((base ?? []).map(item => [item.id, item]));
  const ourItems = new Map((ours ?? []).map(item => [item.id, item]));
  const theirItems = new Map((theirs ?? []).map(item => [item.id, item]));
  const ids = [...new Set([...(theirs ?? []).map(item => item.id), ...(ours ?? []).map(item => item.id), ...(base ?? []).map(item => item.id)])];
  const value: ChecklistItem[] = [];
  const conflicts: string[] = [];
  for (const id of ids) {
    const merged = mergeChecklistItem(baseItems.get(id), ourItems.get(id), theirItems.get(id));
    if (merged.value) value.push(merged.value);
    if (merged.conflict) conflicts.push(`Checklist item "${id}" was changed on two devices; kept the latest change`);
  }
  return { ...(value.length || base || ours || theirs ? { value } : {}), conflicts };
}

export function mergeEvent(base: EventItem | null, ours: EventItem | null, theirs: EventItem | null): MergeResult<EventItem> {
  return mergeEventAt(base, ours, theirs, Date.now());
}

export function mergeEventAt(base: EventItem | null, ours: EventItem | null, theirs: EventItem | null, now: number): MergeResult<EventItem> {
  if (sameValue(ours, theirs)) return { value: ours, conflicts: [] };
  if (sameValue(base, ours)) return { value: theirs, conflicts: [] };
  if (sameValue(base, theirs)) return { value: ours, conflicts: [] };
  if (!ours || !theirs) {
    const survivor = ours ?? theirs;
    return survivor
      ? { value: survivor, conflicts: [`Event "${survivor.title}" was edited while it was deleted on another device; kept the event`] }
      : { value: null, conflicts: [] };
  }

  const conflicts: string[] = [];
  const select = <K extends keyof EventItem>(field: K): EventItem[K] => {
    const result = pick(base?.[field] ?? null, ours[field] ?? null, theirs[field] ?? null);
    if (result.conflict) conflicts.push(`Event "${theirs.title}" field "${String(field)}" was changed on two devices; kept the latest change`);
    return result.value as EventItem[K];
  };

  const schedule = (event: EventItem | null): EventSchedule | null => event ? ({
    date: event.date,
    ...(event.timing ? { timing: event.timing } : {}),
    ...(event.durationMinutes !== undefined ? { durationMinutes: event.durationMinutes } : {}),
  }) : null;
  const scheduleResult = pick(schedule(base), schedule(ours), schedule(theirs));
  if (scheduleResult.conflict) conflicts.push(`Event "${theirs.title}" schedule was changed on two devices; kept the latest schedule`);
  const chosenSchedule = scheduleResult.value ?? schedule(theirs)!;
  const description = mergeDescription(base?.description, ours.description, theirs.description);
  if (description.conflict) conflicts.push(`Event "${theirs.title}" notes were edited on two devices; both versions kept`);
  const checklist = mergeChecklist(base?.checklist, ours.checklist, theirs.checklist);
  conflicts.push(...checklist.conflicts.map(message => `Event "${theirs.title}": ${message}`));

  const result: EventItem = {
    id: theirs.id,
    title: select('title') ?? theirs.title,
    ...chosenSchedule,
    heading: select('heading') ?? theirs.heading,
    order: select('order') ?? theirs.order,
    createdAt: select('createdAt') ?? theirs.createdAt,
    updatedAt: trustedTime(ours.updatedAt, now) >= trustedTime(theirs.updatedAt, now) ? ours.updatedAt : theirs.updatedAt,
    ...(description.value !== undefined ? { description: description.value } : {}),
    ...(checklist.value !== undefined ? { checklist: checklist.value } : {}),
  };
  return { value: result, conflicts };
}
