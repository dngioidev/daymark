import { AppSettings, NoteMeta, BacklogData, BacklogItem, DailyDocument, Habit, HabitDay, HeadingSection, StandaloneNote, TaskItem } from '../types/daymark';
import { isBacklogUndoEvent, mergeBacklogHistory, taskHistoryIdentity } from '../utils/backlogHistory';
import { canonicalJson } from '../utils/canonicalJson';
import { trustedTime } from './clock';
export { canonicalJson } from '../utils/canonicalJson';

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

// Move ids encode the destination and can repeat on a later visit to that day.
const historyIdentity = taskHistoryIdentity;

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
    // The same task can be independently introduced by two backlog picks. There
    // is no shared task base, but neither writer's append-only history is stale.
    return { task: { ...theirs, historyLog: mergeBacklogHistory(ours.historyLog, theirs.historyLog) ?? [] }, conflict: true };
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
    const seen = new Set((ours.historyLog ?? []).map(historyIdentity));
    merged.historyLog = [...(ours.historyLog ?? []), ...(theirs.historyLog ?? []).filter((e) => !seen.has(historyIdentity(e)))]
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
  theirs: DailyDocument | null,
  now: number = Date.now()
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
          isBacklogUndoEvent(event) && event.date === side.date && trustedTime(event.timestamp, now) >= trustedTime(side.updatedAt, now));
        // A later explicit move into this day is not the plain stale copy the
        // tombstone removes. Compare trusted times; equal/invalid/future moves
        // cannot override the removal. Keep backlog-undo restoration unchanged.
        const movedInAfterRemoval = restored && Array.isArray(restored.historyLog) && restored.historyLog.some(event =>
          event.action === 'moved' && event.id === `hist-move-${id}-${side.date}` && event.date !== side.date &&
          trustedTime(event.timestamp, now) > trustedTime(side.updatedAt, now));
        if (!restoredAfterRemoval && !movedInAfterRemoval) mergedTasks.delete(id);
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
    // Array order already describes the merged layout. Renumbering unrelated
    // tasks here fabricates edits against other devices' bases, which can make
    // an unchanged task defeat a later deletion. Preserve explicit order edits.
    headings.push({ name, items, notesContent: text.text });
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
      updatedAt: trustedTime(o.updatedAt, now) > trustedTime(t.updatedAt, now) ? o.updatedAt : t.updatedAt,
    },
    conflicts,
  };
}

export function mergeStandaloneNote(
  base: StandaloneNote | null,
  ours: StandaloneNote | null,
  theirs: StandaloneNote | null,
  conflictId: () => string = () => `note-conflict-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  now: number = Date.now()
): MergeResult<StandaloneNote> {
  const metadataConflicts = ours && theirs
    ? [...new Set([...Object.keys(ours), ...Object.keys(theirs)])]
      .filter(field => !['id', 'content', 'createdAt', 'updatedAt'].includes(field))
      .filter(field => {
        const key = field as keyof StandaloneNote;
        return !sameValue(ours[key], theirs[key]) && (!base ||
          (!sameValue(base[key], ours[key]) && !sameValue(base[key], theirs[key])));
      })
      .map(field => `Note "${theirs.title}" (id: ${theirs.id}): field "${field}" was changed on two devices; kept the latest change`)
    : [];
  if (base && ours && theirs) {
    const newer = trustedTime(ours.updatedAt, now) > trustedTime(theirs.updatedAt, now) ? ours : theirs;
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
    if (!contentConflict) return { value, conflicts: metadataConflicts };
    const copy: StandaloneNote = { ...theirs, id: conflictId(), title: `${theirs.title} (conflict copy)` };
    return {
      value,
      extraNotes: [copy],
      conflicts: [...metadataConflicts, `Note "${theirs.title}" was edited on two devices; the other version was saved as "${copy.title}"`],
    };
  }
  const r = pick3(base, ours, theirs);
  if (r.kind === 'value') return { value: r.value, conflicts: [] };
  const o = ours as StandaloneNote;
  const t = theirs as StandaloneNote;
  if (o.content === t.content) {
    // Only metadata differs (title, tags, pin, folder): the incoming change wins
    return { value: t, conflicts: metadataConflicts };
  }
  const copy: StandaloneNote = { ...t, id: conflictId(), title: `${t.title} (conflict copy)` };
  return {
    value: o,
    extraNotes: [copy],
    conflicts: [...metadataConflicts, `Note "${t.title}" was edited on two devices; the other version was saved as "${copy.title}"`],
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

/** Missing individual habits are retained; whole-entity deletions use three-way equality. */
export function mergeHabitList(
  base: { habits: Habit[] } | null,
  ours: { habits: Habit[] } | null,
  theirs: { habits: Habit[] } | null,
  now: number = Date.now()
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
      const newerWins = trustedTime(mineAt, now) > trustedTime(incomingAt, now) ? 'mine' : 'incoming';
      const merged = mergeFields(b.has(id) ? baseFields : undefined, mineFields, incomingFields, newerWins, { absentMeans: 'cleared' });
      habits.push({ ...merged.value, updatedAt: newerWins === 'mine' ? mineAt : incomingAt });
      if (merged.conflicts.length) conflicts.push(`Habit "${incoming.name}" was changed on two devices; kept the edit with the newer timestamp (incoming on ties)`);
    }
  }
  return { value: { habits }, conflicts };
}

/** Tick records form a last-write-wins map; an untick is a record, never a deletion. */
export function mergeHabitDay(base: HabitDay | null, ours: HabitDay | null, theirs: HabitDay | null, now: number = Date.now()): MergeResult<HabitDay> {
  if ((theirs === null && sameValue(base, ours)) || (ours === null && sameValue(base, theirs))) {
    return { value: null, conflicts: [] };
  }
  if (!ours || !theirs) return { value: ours ?? theirs, conflicts: [] };
  const ticks = { ...ours.ticks };
  for (const [id, tick] of Object.entries(theirs.ticks)) {
    if (!Object.hasOwn(ticks, id) || trustedTime(tick.at, now) >= trustedTime(ticks[id].at, now)) ticks[id] = tick;
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
export function mergeBacklog(base: BacklogData | null, ours: BacklogData | null, theirs: BacklogData | null, now: number = Date.now()): MergeResult<BacklogData> {
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
      const newerWins = trustedTime(mineAt, now) > trustedTime(incomingAt, now) ? 'mine' : 'incoming';
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
export function mergeNoteMeta(base: NoteMeta | null, ours: NoteMeta | null, theirs: NoteMeta | null, now: number = Date.now()): MergeResult<NoteMeta> {
  if ((theirs === null && sameValue(base, ours)) || (ours === null && sameValue(base, theirs))) {
    return { value: null, conflicts: [] };
  }
  if (!ours || !theirs) return { value: ours ?? theirs, conflicts: [] };
  const folders = new Map<string, NoteMeta['folders'][number]>();
  for (const folder of [...ours.folders, ...theirs.folders]) {
    const key = folder.path.toLowerCase();
    const previous = folders.get(key);
    if (!previous || trustedTime(folder.updatedAt, now) >= trustedTime(previous.updatedAt, now)) folders.set(key, folder);
  }
  const dismissed = new Map<string, NoteMeta['dismissed'][number]>();
  for (const pair of [...ours.dismissed, ...theirs.dismissed]) {
    const previous = dismissed.get(pair.key);
    if (!previous || trustedTime(pair.at, now) >= trustedTime(previous.at, now)) dismissed.set(pair.key, pair);
  }
  return { value: { folders: [...folders.values()], dismissed: [...dismissed.values()] }, conflicts: [] };
}

export const isNoteMetaEntityKey = (key: string): boolean => key === 'notemeta';

export const isBacklogEntityKey = (key: string): boolean => key === 'backlog';

/** Entity keys: `doc:<YYYY-MM-DD>`, `note:<id>`, `settings`, `habits`, `habitday:<YYYY-MM-DD>`, `backlog`, `notemeta`. */
export type EntityKey = string;

export function mergeEntity(key: EntityKey, base: unknown, ours: unknown, theirs: unknown, now: number = Date.now()): MergeResult<unknown> {
  if (isNoteMetaEntityKey(key)) {
    return mergeNoteMeta(base as NoteMeta | null, ours as NoteMeta | null, theirs as NoteMeta | null, now);
  }
  if (isBacklogEntityKey(key)) {
    return mergeBacklog(base as BacklogData | null, ours as BacklogData | null, theirs as BacklogData | null, now);
  }
  if (key === 'habits') {
    return mergeHabitList(base as { habits: Habit[] } | null, ours as { habits: Habit[] } | null, theirs as { habits: Habit[] } | null, now);
  }
  if (key.startsWith('habitday:')) {
    return mergeHabitDay(base as HabitDay | null, ours as HabitDay | null, theirs as HabitDay | null, now);
  }
  if (key.startsWith('doc:')) {
    return mergeDailyDocument(base as DailyDocument | null, ours as DailyDocument | null, theirs as DailyDocument | null, now);
  }
  if (key.startsWith('note:')) {
    return mergeStandaloneNote(base as StandaloneNote | null, ours as StandaloneNote | null, theirs as StandaloneNote | null, undefined, now);
  }
  if (key === 'settings') {
    return mergeSettings(base as SyncedSettings | null, ours as SyncedSettings | null, theirs as SyncedSettings | null);
  }
  throw new Error(`Unknown sync entity: ${key}`);
}

export function isValidEntityKey(key: unknown): key is EntityKey {
  return typeof key === 'string' && (/^doc:\d{4}-\d{2}-\d{2}$/.test(key) || /^note:[\w.-]{1,200}$/.test(key) || key === 'settings' || key === 'habits' || isBacklogEntityKey(key) || isNoteMetaEntityKey(key) || /^habitday:\d{4}-\d{2}-\d{2}$/.test(key));
}

/**
 * Reconcile placement after per-document merge. Remove a stale branch only with a live
 * replacement; historical carries that observed the winning move remain in the ledger.
 * Real bases distinguish unchanged stale fields from independent user edits.
 */
export function reconcileMovedTasks(docs: DailyDocument[], bases: DailyDocument[] = [], conflicts: string[] = []): DailyDocument[] {
  type Copy = { date: string; task: TaskItem };
  type Move = { event: TaskItem['historyLog'][number]; to: string };
  const eventKey = (e: TaskItem['historyLog'][number]) => canonicalJson(e);
  const byId = new Map<string, Copy[]>();
  for (const doc of docs) for (const task of tasksById(doc).values()) {
    const copies = byId.get(task.id) ?? [];
    copies.push({ date: doc.date, task });
    byId.set(task.id, copies);
  }
  const byDate = new Map(docs.map(d => [d.date, d]));
  for (const [id, copies] of byId) {
    if (copies.length < 2) continue;
    const moves = new Map<string, Move>();
    for (const { task } of copies) for (const event of task.historyLog ?? []) {
      const prefix = `hist-move-${id}-`;
      const to = event.id.slice(prefix.length);
      if (event.action === 'moved' && event.id.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}$/.test(to) && event.date !== to) {
        moves.set(eventKey(event), { event, to });
      }
    }
    const has = (copy: Copy, move: Move) => (copy.task.historyLog ?? []).some(e => eventKey(e) === eventKey(move.event));
    // Observed subsequent moves beat their ancestors, even with skewed clocks.
    const superseded = new Set<string>();
    for (const { task } of copies) {
      const log = (task.historyLog ?? []).filter(e => moves.has(eventKey(e)));
      for (const e of log.slice(0, -1)) superseded.add(eventKey(e));
    }
    const candidates = [...moves.values()].filter(m => !superseded.has(eventKey(m.event)) && copies.some(c => c.date === m.to && has(c, m)));
    // Concurrent branches: timestamp, then destination/event lexical order, never array order.
    candidates.sort((a, b) => a.event.timestamp.localeCompare(b.event.timestamp) || a.to.localeCompare(b.to) || eventKey(a.event).localeCompare(eventKey(b.event)));
    const winner = candidates.at(-1);
    if (!winner) continue;
    const target = copies.find(c => c.date === winner.to && has(c, winner))!;
    const related = new Set([winner.event.date, winner.to]);
    let expanded = true;
    while (expanded) {
      const size = related.size;
      for (const m of moves.values()) if (related.has(m.event.date) || related.has(m.to)) { related.add(m.event.date); related.add(m.to); }
      for (const c of copies) if (c.task.carriedFromDate && related.has(c.task.carriedFromDate)) related.add(c.date);
      expanded = size !== related.size;
    }
    const stale = copies.filter(c => c !== target && related.has(c.date) && !has(c, winner)).sort((a,b) => a.date.localeCompare(b.date));
    if (!stale.length) continue;
    let merged = target.task;
    for (const c of stale) {
      const base = [c.date, c.task.carriedFromDate, ...related].flatMap(date => bases.flatMap(d => d.date === date ? [...tasksById(d).values()] : []))
        .find(t => t.id === id && !(t.historyLog ?? []).some(e => eventKey(e) === eventKey(winner.event)));
      // A rollover is not an edit, even when its clock is later than the move.
      // Without an ancestor we cannot interpret every difference as a stale-side
      // edit. Prefer the moved value and report ambiguous real edits per field.
      const staleLog = c.task.historyLog ?? [];
      const untouchedCarry = staleLog.at(-1)?.action === 'carried_forward';
      const edits = (t: TaskItem) => (t.historyLog ?? []).filter(e => !['moved', 'carried_forward', 'created'].includes(e.action));
      const movedEdits = edits(merged), staleEdits = edits(c.task);
      // Causality requires observed history, not a later wall-clock timestamp.
      const causallyLater = movedEdits.length > 0 && staleEdits.length > movedEdits.length &&
        movedEdits.every((e, i) => eventKey(staleEdits[i]) === eventKey(e));
      const result = base ? mergeTask(base, merged, c.task).task : { ...(causallyLater && !untouchedCarry ? c.task : merged) };
      const fields = new Set([...Object.keys(merged), ...Object.keys(c.task)]);
      for (const field of ['historyLog', 'order', 'carriedFromDate', 'id']) fields.delete(field);
      for (const field of fields) {
        const value = (t: TaskItem) => (t as unknown as Record<string, unknown>)[field];
        if (sameValue(value(merged), value(c.task))) continue;
        if (!base || pick3(value(base), value(merged), value(c.task)).kind === 'conflict') {
          // Some legacy title/detail edits do not append history. Report even
          // apparent carry differences so such an edit cannot disappear silently.
          conflicts.push(`${target.date}: task "${id}" (${target.task.title}) field "${field}" differs between copies; resolved during move reconciliation`);
        }
      }
      // Completion is evidence of a real user action, including legacy copies
      // without history. Preserve its coupled fields even without an ancestor.
      if (!base && c.task.status === 'done') {
        for (const key of STATUS_FIELDS) {
          if (key === 'status') result.status = c.task.status;
          else if (c.task[key] === undefined) delete result[key];
          else result[key] = c.task[key];
        }
      }
      // A recovery carry with no base cannot prove that a completion was
      // deliberately reopened. Keep the completion and all its coupled fields.
      if (!base && merged.status === 'done' && c.task.status !== 'done') {
        for (const key of STATUS_FIELDS) {
          if (key === 'status') result.status = merged.status;
          else if (merged[key] === undefined) delete result[key];
          else result[key] = merged[key];
        }
      }
      const history = new Map([...merged.historyLog, ...c.task.historyLog].map(e => [eventKey(e), e]));
      const historyLog = [...history.values()].sort((a,b) => a.timestamp.localeCompare(b.timestamp) || eventKey(a).localeCompare(eventKey(b)));
      // Preserve the resolved causal order if a later move has an earlier clock.
      // Keep non-move events in their slots (dropStaleCarries uses the final carry).
      const orderedMoves = historyLog.filter(e => moves.has(eventKey(e)) && eventKey(e) !== eventKey(winner.event));
      orderedMoves.push(winner.event);
      let moveIndex = 0;
      merged = { ...result, order: target.task.order, carriedFromDate: target.task.carriedFromDate,
        historyLog: historyLog.map(e => moves.has(eventKey(e)) ? orderedMoves[moveIndex++] : e) };
    }
    const targetDoc = byDate.get(target.date)!;
    const headings = targetDoc.headings.map(h => ({ ...h, items: h.items.flatMap(t => t.id !== id ? [t] : h.name === merged.heading ? [merged] : []) }));
    if (merged.heading !== target.task.heading) {
      const heading = headings.find(h => h.name === merged.heading);
      if (heading) heading.items.push(merged);
      else headings.push({ name: merged.heading, items: [merged], notesContent: '' });
    }
    byDate.set(target.date, { ...targetDoc, headings });
    for (const c of stale) {
      const doc = byDate.get(c.date)!;
      byDate.set(c.date, { ...doc, headings: doc.headings.map(h => ({ ...h, items: h.items.filter(t => t.id !== id) })),
        removedTaskIds: [...new Set([...(doc.removedTaskIds ?? []), id])] });
    }
  }
  return docs.map(d => byDate.get(d.date)!);
}
