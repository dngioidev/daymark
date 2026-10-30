import { AppSettings, NoteMeta, BacklogData, BacklogItem, DailyDocument, Habit, HabitDay, HeadingSection, StandaloneNote, TaskItem } from '../types/daymark';
import { isBacklogUndoEvent, mergeBacklogHistory } from '../utils/backlogHistory';

/**
 * Three-way merge used by both the sync server and the client.
 *
 * `base` is the last version both sides agreed on (null when the entity is new to one side),
 * `ours` is the server's current version and `theirs` is the incoming client version.
 * `null` as ours/theirs means "deleted / not present".
 *
 * Rules, applied per daily-note task, per heading's notes text, per standalone note and for
 * the synced settings object:
 *  - only one side changed            -> take that side
 *  - both changed to the same thing   -> take it
 *  - one deleted, the other modified  -> keep the modified version (never lose edits)
 *  - both modified differently        -> tasks: field by field, the incoming change wins per field;
 *                                        settings: field by field, the incoming change wins per field;
 *                                        notes text: both texts are kept with a separator;
 *                                        standalone notes: server copy kept, incoming saved as a conflict copy
 * Every "both modified" case is reported in `conflicts`.
 */

export interface MergeResult<T> {
  value: T | null;
  conflicts: string[];
  /** Extra notes produced by conflicts (standalone notes only). */
  extraNotes?: StandaloneNote[];
}

/** Stable JSON so equality does not depend on key order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.keys(v)
          .sort()
          .reduce<Record<string, unknown>>((acc, k) => {
            if (v[k] !== undefined) acc[k] = v[k];
            return acc;
          }, {})
      : v
  );
}

export const sameValue = (a: unknown, b: unknown): boolean => canonicalJson(a ?? null) === canonicalJson(b ?? null);

type Pick3<T> = { kind: 'value'; value: T | null } | { kind: 'conflict' };

function pick3<T>(base: T | null | undefined, ours: T | null | undefined, theirs: T | null | undefined): Pick3<T> {
  const b = base ?? null;
  const o = ours ?? null;
  const t = theirs ?? null;
  if (sameValue(o, t)) return { kind: 'value', value: o };
  if (sameValue(b, o)) return { kind: 'value', value: t };
  if (sameValue(b, t)) return { kind: 'value', value: o };
  // both sides changed: a deletion never beats an edit
  if (o === null) return { kind: 'value', value: t };
  if (t === null) return { kind: 'value', value: o };
  return { kind: 'conflict' };
}

export const CONFLICT_SEPARATOR = '\n\n---\n*Edited on another device at the same time:*\n\n';

function mergeText(base: string, ours: string, theirs: string): { text: string; conflict: boolean } {
  const result = pick3(base, ours, theirs);
  if (result.kind === 'value') return { text: result.value ?? '', conflict: false };
  if (ours.includes(theirs)) return { text: ours, conflict: false };
  if (theirs.includes(ours)) return { text: theirs, conflict: false };
  return { text: `${ours}${CONFLICT_SEPARATOR}${theirs}`, conflict: true };
}

function tasksById(doc: DailyDocument | null): Map<string, TaskItem> {
  const map = new Map<string, TaskItem>();
  for (const h of doc?.headings ?? []) for (const t of h.items) map.set(t.id, { ...t, heading: h.name });
  return map;
}

// Completion fields change together; merging them one by one could pair a done status with no date.
const STATUS_FIELDS = ['status', 'statusBeforeDone', 'completedDate', 'doneLaterDate', 'movedToBacklogDate'] as const;

/** `longer` is `shorter` plus later history, and `shorter` was last touched by a rollover. */
function extendsCarry(longer: TaskItem, shorter: TaskItem): boolean {
  const short = shorter.historyLog ?? [];
  const long = longer.historyLog ?? [];
  return short.at(-1)?.action === 'carried_forward' && long.length > short.length && short.every((e, i) => e.id === long[i].id);
}

/**
 * Both devices changed the same task: fields changed on one side only are combined, history is
 * unioned and only fields changed on both sides take the incoming value (reported as a conflict).
 * Without a base, a copy that is the other's rollover plus later edits wins over that stale carry.
 */
function mergeTask(base: TaskItem | undefined, ours: TaskItem, theirs: TaskItem): { task: TaskItem; conflict: boolean } {
  if (!base) {
    if (extendsCarry(ours, theirs)) return { task: ours, conflict: false };
    if (extendsCarry(theirs, ours)) return { task: theirs, conflict: false };
    return { task: theirs, conflict: true };
  }
  const merged: Record<string, unknown> = {};
  let conflict = false;
  const take = (keys: readonly string[]) => {
    const part = (task: TaskItem) => Object.fromEntries(keys.map((k) => [k, (task as unknown as Record<string, unknown>)[k]]));
    const r = pick3(part(base), part(ours), part(theirs));
    if (r.kind === 'conflict') conflict = true;
    const chosen = r.kind === 'value' ? r.value! : part(theirs);
    for (const k of keys) if (chosen[k] !== undefined && chosen[k] !== null) merged[k] = chosen[k];
  };
  take(STATUS_FIELDS);
  const others = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]);
  for (const k of [...STATUS_FIELDS, 'historyLog']) others.delete(k);
  for (const k of others) take([k]);
  const history = pick3(base.historyLog, ours.historyLog, theirs.historyLog);
  if (history.kind === 'value') merged.historyLog = history.value ?? [];
  else {
    const seen = new Set((ours.historyLog ?? []).map((e) => e.id));
    merged.historyLog = [...(ours.historyLog ?? []), ...(theirs.historyLog ?? []).filter((e) => !seen.has(e.id))]
      .map((e, i) => [e, i] as const)
      .sort(([a, ai], [b, bi]) => (Date.parse(a.timestamp) - Date.parse(b.timestamp)) || ai - bi)
      .map(([e]) => e);
  }
  return { task: merged as unknown as TaskItem, conflict };
}

function headingNotes(doc: DailyDocument | null): Map<string, string> {
  const map = new Map<string, string>();
  for (const h of doc?.headings ?? []) map.set(h.name, h.notesContent ?? '');
  return map;
}

export function mergeDailyDocument(
  base: DailyDocument | null,
  ours: DailyDocument | null,
  theirs: DailyDocument | null
): MergeResult<DailyDocument> {
  const whole = pick3(base, ours, theirs);
  if (whole.kind === 'value') return { value: whole.value, conflicts: [] };
  // Both sides have a (different) version of this day: merge task by task.
  const o = ours as DailyDocument;
  const t = theirs as DailyDocument;
  const conflicts: string[] = [];

  const bTasks = tasksById(base);
  const oTasks = tasksById(o);
  const tTasks = tasksById(t);
  const taskIds = [...new Set([...tTasks.keys(), ...oTasks.keys(), ...bTasks.keys()])];
  const mergedTasks = new Map<string, TaskItem>();
  for (const id of taskIds) {
    const r = pick3(bTasks.get(id), oTasks.get(id), tTasks.get(id));
    if (r.kind === 'value') {
      if (r.value) mergedTasks.set(id, r.value);
    } else {
      const merged = mergeTask(bTasks.get(id), oTasks.get(id)!, tTasks.get(id)!);
      mergedTasks.set(id, merged.task);
      if (merged.conflict) conflicts.push(`${o.date}: task "${tTasks.get(id)!.title}" was changed on two devices; kept the latest change`);
    }
  }

  // Neither device has synced this day yet: a deletion on either side wins over the other side's plain copy
  if (!base) {
    for (const side of [o, t]) {
      const own = tasksById(side);
      for (const id of side.removedTaskIds ?? []) if (!own.has(id)) {
        const restored = mergedTasks.get(id);
        // A cancellation after this removal restores the task even if the park response was lost.
        // Older cancellations must not override a later ordinary deletion.
        const restoredAfterRemoval = restored && Array.isArray(restored.historyLog) && restored.historyLog.some(event =>
          isBacklogUndoEvent(event) && event.date === side.date && Date.parse(event.timestamp) >= Date.parse(side.updatedAt));
        if (!restoredAfterRemoval) mergedTasks.delete(id);
      }
    }
  }

  // Heading order: incoming order first, then headings only the server has.
  const bNotes = headingNotes(base);
  const oNotes = headingNotes(o);
  const tNotes = headingNotes(t);
  const headingNames: string[] = [];
  for (const h of [...t.headings, ...o.headings]) if (!headingNames.includes(h.name)) headingNames.push(h.name);
  for (const task of mergedTasks.values()) if (!headingNames.includes(task.heading)) headingNames.push(task.heading);

  const headings: HeadingSection[] = [];
  for (const name of headingNames) {
    const inO = oNotes.has(name);
    const inT = tNotes.has(name);
    const inB = bNotes.has(name);
    const items = [...mergedTasks.values()].filter((task) => task.heading === name);
    // A heading removed on one side (and untouched on the other) goes away unless tasks still live in it
    const removed = inB && ((!inO && inT && sameValue(bNotes.get(name), tNotes.get(name))) || (!inT && inO && sameValue(bNotes.get(name), oNotes.get(name))));
    if (removed && items.length === 0) continue;
    const text = mergeText(bNotes.get(name) ?? '', oNotes.get(name) ?? '', tNotes.get(name) ?? '');
    if (text.conflict) conflicts.push(`${o.date}: notes under "${name}" were edited on two devices; both versions kept`);
    // Keep incoming item order, then server-only items
    const orderOf = (id: string) => {
      const ti = t.headings.flatMap((h) => h.items).findIndex((x) => x.id === id);
      if (ti >= 0) return ti;
      const oi = o.headings.flatMap((h) => h.items).findIndex((x) => x.id === id);
      return 10_000 + (oi >= 0 ? oi : 0);
    };
    items.sort((a, b) => orderOf(a.id) - orderOf(b.id));
    headings.push({ name, items: items.map((task, i) => ({ ...task, order: i + 1 })), notesContent: text.text });
  }

  // Deletions from either device stick, unless the task is present in the merge
  const present = new Set(headings.flatMap((h) => h.items.map((x) => x.id)));
  const removedTaskIds = [...new Set([...(o.removedTaskIds ?? []), ...(t.removedTaskIds ?? [])])].filter((id) => !present.has(id));
  const { removedTaskIds: _oRemoved, ...oRest } = o;
  const { removedTaskIds: _tRemoved, ...tRest } = t;
  return {
    value: {
      ...oRest,
      ...tRest,
      headings,
      ...(removedTaskIds.length > 0 ? { removedTaskIds } : {}),
      updatedAt: o.updatedAt > t.updatedAt ? o.updatedAt : t.updatedAt,
    },
    conflicts,
  };
}

export function mergeStandaloneNote(
  base: StandaloneNote | null,
  ours: StandaloneNote | null,
  theirs: StandaloneNote | null,
  conflictId: () => string = () => `note-conflict-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
): MergeResult<StandaloneNote> {
  if (base && ours && theirs) {
    const newer = timestamp(ours.updatedAt) > timestamp(theirs.updatedAt) ? ours : theirs;
    const value = { ...ours };
    const mergeField = <K extends keyof StandaloneNote>(field: K) => {
      value[field] = sameValue(ours[field], theirs[field]) || sameValue(base[field], theirs[field])
        ? ours[field]
        : sameValue(base[field], ours[field]) ? theirs[field]
        : field === 'content' ? ours[field] : newer[field];
    };
    for (const field of new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)] as (keyof StandaloneNote)[])) mergeField(field);
    value.updatedAt = newer.updatedAt;
    const contentConflict = !sameValue(ours.content, theirs.content) && !sameValue(base.content, ours.content) && !sameValue(base.content, theirs.content);
    if (!contentConflict) return { value, conflicts: [] };
    const copy: StandaloneNote = { ...theirs, id: conflictId(), title: `${theirs.title} (conflict copy)` };
    return {
      value,
      extraNotes: [copy],
      conflicts: [`Note "${theirs.title}" was edited on two devices; the other version was saved as "${copy.title}"`],
    };
  }
  const r = pick3(base, ours, theirs);
  if (r.kind === 'value') return { value: r.value, conflicts: [] };
  const o = ours as StandaloneNote;
  const t = theirs as StandaloneNote;
  if (o.content === t.content) {
    // Only metadata differs (title, tags, pin, folder): the incoming change wins
    return { value: t, conflicts: [] };
  }
  const copy: StandaloneNote = { ...t, id: conflictId(), title: `${t.title} (conflict copy)` };
  return {
    value: o,
    extraNotes: [copy],
    conflicts: [`Note "${t.title}" was edited on two devices; the other version was saved as "${copy.title}"`],
  };
}

/** Settings fields that belong to one device and are never synced. */
export type SyncedSettings = Omit<AppSettings, 'syncConfig' | 'simulatedToday'>;

export function toSyncedSettings(settings: AppSettings): SyncedSettings {
  const { syncConfig: _sync, simulatedToday: _today, ...rest } = settings;
  return rest;
}

/** Recursive three-way fields with explicit clearing semantics; arrays remain atomic. */
function mergeFields<T>(base: T | undefined, mine: T, incoming: T, newerWins: 'mine' | 'incoming',
  options: { absentMeans: 'no-opinion' | 'cleared' }): { value: T; conflicts: string[] } {
  const conflicts: string[] = [];
  const plainObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  const mergeField = (b: unknown, o: unknown, t: unknown, path: string): unknown => {
    // Settings tolerate old clients stripping keys. Items clear known keys, while
    // a key absent from the base still has no previous value to clear.
    if (options.absentMeans === 'no-opinion' || b === undefined) {
      if (o === undefined) return t === undefined ? b : t;
      if (t === undefined) return o;
    }
    if (plainObject(o) && plainObject(t) && (b === undefined || plainObject(b))) {
      const previous = b ?? {};
      const keys = new Set([...Object.keys(previous), ...Object.keys(o), ...Object.keys(t)]);
      return Object.fromEntries([...keys].map(key => [key,
        mergeField(previous[key], o[key], t[key], path ? `${path}.${key}` : key),
      ]).filter(([, value]) => options.absentMeans === 'no-opinion' || value !== undefined));
    }
    if (options.absentMeans === 'cleared') {
      // A field clear is a real value change, so it can beat a conflicting edit.
      // Whole-entity pick3 instead protects edits against entity deletions.
      if (sameValue(o, t) || sameValue(b, t)) return o;
      if (sameValue(b, o)) return t;
    } else {
      const r = pick3(b, o, t);
      if (r.kind === 'value') return r.value;
    }
    conflicts.push(path);
    return newerWins === 'mine' ? o : t;
  };
  return { value: mergeField(base, mine, incoming, '') as T, conflicts };
}

export function mergeSettings(
  base: SyncedSettings | null,
  ours: SyncedSettings | null,
  theirs: SyncedSettings | null
): MergeResult<SyncedSettings> {
  if (base === null || ours === null || theirs === null) {
    const r = pick3(base, ours, theirs);
    if (r.kind === 'value') return { value: r.value, conflicts: [] };
    // No shared base: a device that has never synced. The server copy (ours) is the established one.
    return { value: ours, conflicts: ['This device now uses the settings from your other devices.'] };
  }

  const result = mergeFields(base, ours, theirs, 'incoming', { absentMeans: 'no-opinion' });
  return { value: result.value, conflicts: result.conflicts.map(path =>
    `Settings field "${path}" was changed on two devices; kept the latest change`) };
}

const timestamp = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? -Infinity : parsed;
};

/** Missing individual habits are retained; whole-entity deletions use three-way equality. */
export function mergeHabitList(
  base: { habits: Habit[] } | null,
  ours: { habits: Habit[] } | null,
  theirs: { habits: Habit[] } | null
): MergeResult<{ habits: Habit[] }> {
  if ((theirs === null && sameValue(base, ours)) || (ours === null && sameValue(base, theirs))) {
    return { value: null, conflicts: [] };
  }
  if (!ours || !theirs) return { value: ours ?? theirs, conflicts: [] };
  const b = new Map(base?.habits.map((h) => [h.id, h]));
  const o = new Map(ours.habits.map((h) => [h.id, h]));
  const t = new Map(theirs.habits.map((h) => [h.id, h]));
  const habits: Habit[] = [];
  const conflicts: string[] = [];
  for (const id of new Set([...o.keys(), ...t.keys()])) {
    const mine = o.get(id);
    const incoming = t.get(id);
    if (!mine || !incoming) {
      habits.push((mine ?? incoming)!);
      continue;
    }
    const result = pick3(b.get(id), mine, incoming);
    if (result.kind === 'value') habits.push(result.value!);
    else {
      if (!b.get(id)?.removedOn && (mine.removedOn || incoming.removedOn)) {
        habits.push(mine.removedOn ? mine : incoming);
        conflicts.push(`Habit "${incoming.name}" was changed on two devices; kept the removal`);
        continue;
      }
      const { updatedAt: mineAt, ...mineFields } = mine;
      const { updatedAt: incomingAt, ...incomingFields } = incoming;
      const { updatedAt: _baseAt, ...baseFields } = b.get(id) ?? mine;
      const newerWins = timestamp(mineAt) > timestamp(incomingAt) ? 'mine' : 'incoming';
      const merged = mergeFields(b.has(id) ? baseFields : undefined, mineFields, incomingFields, newerWins, { absentMeans: 'cleared' });
      habits.push({ ...merged.value, updatedAt: newerWins === 'mine' ? mineAt : incomingAt });
      if (merged.conflicts.length) conflicts.push(`Habit "${incoming.name}" was changed on two devices; kept the edit with the newer timestamp (incoming on ties)`);
    }
  }
  return { value: { habits }, conflicts };
}

/** Tick records form a last-write-wins map; an untick is a record, never a deletion. */
export function mergeHabitDay(base: HabitDay | null, ours: HabitDay | null, theirs: HabitDay | null): MergeResult<HabitDay> {
  if ((theirs === null && sameValue(base, ours)) || (ours === null && sameValue(base, theirs))) {
    return { value: null, conflicts: [] };
  }
  if (!ours || !theirs) return { value: ours ?? theirs, conflicts: [] };
  const ticks = { ...ours.ticks };
  for (const [id, tick] of Object.entries(theirs.ticks)) {
    if (!Object.hasOwn(ticks, id) || timestamp(tick.at) >= timestamp(ticks[id].at)) ticks[id] = tick;
  }
  return { value: { date: theirs.date, ticks }, conflicts: [] };
}

export const isHabitEntityKey = (key: string): boolean => key === 'habits' || key.startsWith('habitday:');

/** Distinguish a concurrent live edit from an unchanged copy next to a tombstone. */
function backlogEditBeatsDeletion(base: BacklogItem | undefined, mine: BacklogItem, incoming: BacklogItem): boolean {
  if (Boolean(mine.deletedAt) === Boolean(incoming.deletedAt)) return false;
  const payload = (item: BacklogItem) => {
    const { updatedAt: _at, historyLog: _history, deletedAt: _deleted, ...fields } = item;
    return fields;
  };
  const live = mine.deletedAt ? incoming : mine;
  // Without a base, equal payloads identify a stale copy rather than an edit.
  const previous = base ?? (mine.deletedAt ? mine : incoming);
  return !sameValue(payload(live), payload(previous));
}

/** Missing items are retained; concurrent edits survive explicit deletions. */
export function mergeBacklog(base: BacklogData | null, ours: BacklogData | null, theirs: BacklogData | null): MergeResult<BacklogData> {
  if ((theirs === null && sameValue(base, ours)) || (ours === null && sameValue(base, theirs))) {
    return { value: null, conflicts: [] };
  }
  if (!ours || !theirs) return { value: ours ?? theirs, conflicts: [] };
  const b = new Map(base?.items.map((item) => [item.id, item]));
  const o = new Map(ours.items.map((item) => [item.id, item]));
  const t = new Map(theirs.items.map((item) => [item.id, item]));
  const items: BacklogItem[] = [];
  const conflicts: string[] = [];
  for (const id of new Set([...o.keys(), ...t.keys()])) {
    const mine = o.get(id);
    const incoming = t.get(id);
    if (!mine || !incoming) {
      items.push((mine ?? incoming)!);
      continue;
    }
    const result = pick3(b.get(id), mine, incoming);
    let winner: BacklogItem;
    if (result.kind === 'value') winner = result.value!;
    else {
      const { updatedAt: mineAt, historyLog: _mineHistory, ...mineFields } = mine;
      const { updatedAt: incomingAt, historyLog: _incomingHistory, ...incomingFields } = incoming;
      const { updatedAt: _baseAt, historyLog: _baseHistory, ...baseFields } = b.get(id) ?? mine;
      const newerWins = timestamp(mineAt) > timestamp(incomingAt) ? 'mine' : 'incoming';
      const deleteAgainstEdit = backlogEditBeatsDeletion(b.get(id), mine, incoming);
      const fieldWinner = deleteAgainstEdit ? (mine.deletedAt ? 'incoming' : 'mine') : newerWins;
      const merged = mergeFields(b.has(id) ? baseFields : undefined, mineFields, incomingFields, fieldWinner, { absentMeans: 'cleared' });
      winner = { ...merged.value, updatedAt: newerWins === 'mine' ? mineAt : incomingAt };
      // A tombstone must not hide a concurrent edit, even with a newer timestamp.
      if (deleteAgainstEdit) delete winner.deletedAt;
      if (merged.conflicts.length || deleteAgainstEdit) conflicts.push(`Backlog item "${incoming.title}" was changed on two devices; kept ${deleteAgainstEdit ? 'the edit over the deletion' : 'the edit with the newer timestamp (incoming on ties)'}`);
    }
    const historyLog = mergeBacklogHistory(winner.historyLog, mine.historyLog, incoming.historyLog);
    items.push(historyLog === winner.historyLog ? winner : { ...winner, historyLog });
  }
  return { value: { items }, conflicts };
}

/** Missing records survive; tombstones and restorations compete by timestamp. */
export function mergeNoteMeta(base: NoteMeta | null, ours: NoteMeta | null, theirs: NoteMeta | null): MergeResult<NoteMeta> {
  if ((theirs === null && sameValue(base, ours)) || (ours === null && sameValue(base, theirs))) {
    return { value: null, conflicts: [] };
  }
  if (!ours || !theirs) return { value: ours ?? theirs, conflicts: [] };
  const folders = new Map<string, NoteMeta['folders'][number]>();
  for (const folder of [...ours.folders, ...theirs.folders]) {
    const key = folder.path.toLowerCase();
    const previous = folders.get(key);
    if (!previous || timestamp(folder.updatedAt) >= timestamp(previous.updatedAt)) folders.set(key, folder);
  }
  const dismissed = new Map<string, NoteMeta['dismissed'][number]>();
  for (const pair of [...ours.dismissed, ...theirs.dismissed]) {
    const previous = dismissed.get(pair.key);
    if (!previous || timestamp(pair.at) >= timestamp(previous.at)) dismissed.set(pair.key, pair);
  }
  return { value: { folders: [...folders.values()], dismissed: [...dismissed.values()] }, conflicts: [] };
}

export const isNoteMetaEntityKey = (key: string): boolean => key === 'notemeta';

export const isBacklogEntityKey = (key: string): boolean => key === 'backlog';

/** Entity keys: `doc:<YYYY-MM-DD>`, `note:<id>`, `settings`, `habits`, `habitday:<YYYY-MM-DD>`, `backlog`, `notemeta`. */
export type EntityKey = string;

export function mergeEntity(key: EntityKey, base: unknown, ours: unknown, theirs: unknown): MergeResult<unknown> {
  if (isNoteMetaEntityKey(key)) {
    return mergeNoteMeta(base as NoteMeta | null, ours as NoteMeta | null, theirs as NoteMeta | null);
  }
  if (isBacklogEntityKey(key)) {
    return mergeBacklog(base as BacklogData | null, ours as BacklogData | null, theirs as BacklogData | null);
  }
  if (key === 'habits') {
    return mergeHabitList(base as { habits: Habit[] } | null, ours as { habits: Habit[] } | null, theirs as { habits: Habit[] } | null);
  }
  if (key.startsWith('habitday:')) {
    return mergeHabitDay(base as HabitDay | null, ours as HabitDay | null, theirs as HabitDay | null);
  }
  if (key.startsWith('doc:')) {
    return mergeDailyDocument(base as DailyDocument | null, ours as DailyDocument | null, theirs as DailyDocument | null);
  }
  if (key.startsWith('note:')) {
    return mergeStandaloneNote(base as StandaloneNote | null, ours as StandaloneNote | null, theirs as StandaloneNote | null);
  }
  if (key === 'settings') {
    return mergeSettings(base as SyncedSettings | null, ours as SyncedSettings | null, theirs as SyncedSettings | null);
  }
  throw new Error(`Unknown sync entity: ${key}`);
}

export function isValidEntityKey(key: unknown): key is EntityKey {
  return typeof key === 'string' && (/^doc:\d{4}-\d{2}-\d{2}$/.test(key) || /^note:[\w.-]{1,200}$/.test(key) || key === 'settings' || key === 'habits' || isBacklogEntityKey(key) || isNoteMetaEntityKey(key) || /^habitday:\d{4}-\d{2}-\d{2}$/.test(key));
}
