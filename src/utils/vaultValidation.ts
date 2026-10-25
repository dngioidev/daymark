import type { BacklogData, BacklogItem, DailyDocument, Habit, HabitData, HabitDay, HabitTick, StandaloneNote, TaskHistoryItem } from '../types/daymark';

// Pure structural checks (no DOM/React) shared by restore, load and server sync.

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isDate = (v: unknown): v is string => isString(v) && /^\d{4}-\d{2}-\d{2}$/.test(v);

const HISTORY_ACTIONS: readonly TaskHistoryItem['action'][] = [
  'created', 'status_changed', 'carried_forward', 'historical_completion', 'reopened', 'archived', 'moved',
];

export function isBacklogItem(value: unknown): value is BacklogItem {
  if (!isObject(value) || !isString(value.id) || !isString(value.title) ||
    typeof value.order !== 'number' || !Number.isFinite(value.order) ||
    !isString(value.createdAt) || !isString(value.updatedAt)) return false;
  if (!['description', 'category', 'status', 'deletedAt'].every(key => value[key] === undefined || isString(value[key]))) return false;
  if (value.pickedOn !== undefined && !isDate(value.pickedOn)) return false;
  if (value.tags !== undefined && !(Array.isArray(value.tags) && value.tags.every(isString))) return false;
  if (value.checklist !== undefined && !(Array.isArray(value.checklist) && value.checklist.every(item =>
    isObject(item) && isString(item.id) && isString(item.text) && typeof item.done === 'boolean'))) return false;
  if (value.historyLog !== undefined && !(Array.isArray(value.historyLog) && value.historyLog.every(item =>
    isObject(item) && isString(item.id) && isString(item.timestamp) && isDate(item.date) &&
    HISTORY_ACTIONS.some(action => action === item.action) && isString(item.details)))) return false;
  return true;
}

export function isBacklogData(value: unknown): value is BacklogData {
  return isObject(value) && Array.isArray(value.items) && value.items.every(isBacklogItem);
}

export function isHabit(habit: unknown): habit is Habit {
  return (
    isObject(habit) && isString(habit.id) && isString(habit.name) && isDate(habit.addedOn) &&
    (habit.removedOn === undefined || isDate(habit.removedOn)) &&
    typeof habit.order === 'number' && Number.isFinite(habit.order) &&
    typeof habit.warnAfterDays === 'number' && Number.isInteger(habit.warnAfterDays) &&
    habit.warnAfterDays >= 1 && habit.warnAfterDays <= 365 && isString(habit.updatedAt)
  );
}

export function isHabitTick(tick: unknown): tick is HabitTick {
  return isObject(tick) && typeof tick.done === 'boolean' && isString(tick.at);
}

export function isHabitDay(day: unknown): day is HabitDay {
  return isObject(day) && isDate(day.date) && isObject(day.ticks) && Object.values(day.ticks).every(isHabitTick);
}

export function isHabitData(v: unknown): v is HabitData {
  return isObject(v) && Array.isArray(v.habits) && Array.isArray(v.days) && v.habits.every(isHabit) && v.days.every(isHabitDay);
}

function isTaskLike(v: unknown): boolean {
  return isObject(v) && isString(v.id) && isString(v.title) && isString(v.status) && isString(v.createdDate);
}

export function isDailyDocument(v: unknown): v is DailyDocument {
  if (!isObject(v) || !isString(v.date) || !/^\d{4}-\d{2}-\d{2}$/.test(v.date) || !Array.isArray(v.headings)) return false;
  if (v.removedTaskIds !== undefined && !(Array.isArray(v.removedTaskIds) && v.removedTaskIds.every(isString))) return false;
  return v.headings.every((h) => isObject(h) && isString(h.name) && Array.isArray(h.items) && h.items.every(isTaskLike));
}

export function isStandaloneNote(v: unknown): v is StandaloneNote {
  return (
    isObject(v) && isString(v.id) && isString(v.title) && isString(v.content) && isString(v.folder) && Array.isArray(v.tags)
  );
}

export function isSyncedSettings(v: unknown): boolean {
  return isObject(v) && Array.isArray(v.statuses) && Array.isArray(v.defaultHeadings);
}

/** Returns null when the vault is usable, otherwise a sentence explaining why not. */
export function vaultProblem(docs: unknown, notes: unknown): string | null {
  if (!Array.isArray(docs) || !Array.isArray(notes)) return "This isn't a Daymark backup.";
  const seen = new Set<string>();
  for (let i = 0; i < docs.length; i++) {
    const doc: unknown = docs[i];
    if (!isDailyDocument(doc)) return `This backup is damaged: day ${i + 1} can't be read.`;
    if (seen.has(doc.date)) return `This backup has ${doc.date} twice.`;
    seen.add(doc.date);
  }
  for (let i = 0; i < notes.length; i++) {
    if (!isStandaloneNote(notes[i])) return `This backup is damaged: note ${i + 1} can't be read.`;
  }
  return null;
}
