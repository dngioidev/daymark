import { uneditedRecoveredNoteMeta } from '../utils/noteFolders';
import { AppSettings, NoteMeta, EMPTY_NOTE_META, BacklogData, DailyDocument, HabitData, HabitDay, StandaloneNote } from '../types/daymark';
import { canonicalJson, isNoteMetaEntityKey, isBacklogEntityKey, isHabitEntityKey, mergeEntity, sameValue, SyncedSettings, toSyncedSettings } from './merge';
import { MAX_CHANGES_PER_SYNC, MAX_SYNC_BATCH_BYTES, SyncChange, SyncRequest, SyncResponse } from './protocol';
import { EMPTY_BACKLOG, reconcileBacklogVault, uneditedRecoveredBacklog } from '../utils/backlog';
import { uneditedRecoveredHabits } from '../utils/habits';
import { dropStaleCarries } from '../utils/lifecycleEngine';

/**
 * Client side of sync, kept free of React and storage so it can be tested against the real
 * server in-process. The app wires it up in src/hooks/useSync.ts.
 */

export interface VaultData {
  docs: DailyDocument[];
  notes: StandaloneNote[];
  settings: AppSettings;
  habits: HabitData;
  backlog: BacklogData;
  notemeta: NoteMeta;
}

/** Per-device sync bookkeeping, stored next to the vault (never synced). */
export interface SyncState {
  serverUrl: string;
  /** Native only; web refresh credentials stay in the HttpOnly cookie. */
  refreshToken?: string;
  username: string;
  deviceId: string;
  deviceName: string;
  lastRev: number;
  /** Whether this device has backfilled habit history at least once. */
  habitsSynced?: boolean;
  /** Whether this device has backfilled the backlog at least once. */
  backlogSynced?: boolean;
  /** Whether this device has backfilled note metadata at least once. */
  notemetaSynced?: boolean;
  /** Canonical JSON of the last version agreed with the server, per entity key. */
  bases: Record<string, string>;
  lastSyncAt: string | null;
}

export type EntityMap = Map<string, unknown>;

export function toEntities(vault: VaultData, includeHabits = true, includeBacklog = true, includeNoteMeta = true): EntityMap {
  const map: EntityMap = new Map();
  for (const doc of vault.docs) map.set(`doc:${doc.date}`, doc);
  for (const note of vault.notes) map.set(`note:${note.id}`, note);
  map.set('settings', toSyncedSettings(vault.settings));
  if (includeHabits) {
    map.set('habits', { habits: vault.habits.habits });
    for (const day of vault.habits.days) map.set(`habitday:${day.date}`, day);
  }
  if (includeBacklog) map.set('backlog', vault.backlog);
  if (includeNoteMeta) map.set('notemeta', vault.notemeta);
  return map;
}

export function fromEntities(map: EntityMap, localSettings: AppSettings): VaultData {
  const docs: DailyDocument[] = [];
  const notes: StandaloneNote[] = [];
  const habits: HabitData = { habits: [], days: [] };
  let settings = localSettings;
  let backlog = EMPTY_BACKLOG;
  let notemeta = EMPTY_NOTE_META;
  for (const [key, value] of map) {
    if (value === null || value === undefined) continue;
    if (key.startsWith('doc:')) docs.push(value as DailyDocument);
    else if (key.startsWith('note:')) notes.push(value as StandaloneNote);
    else if (key === 'notemeta') notemeta = value as NoteMeta;
    else if (key === 'backlog') backlog = value as BacklogData;
    else if (key === 'habits') habits.habits = (value as Pick<HabitData, 'habits'>).habits;
    else if (key.startsWith('habitday:')) habits.days.push(value as HabitDay);
    else if (key === 'settings') {
      // Keep this device's own sync config and date override
      settings = { ...(value as SyncedSettings), syncConfig: localSettings.syncConfig, simulatedToday: localSettings.simulatedToday };
    }
  }
  docs.sort((a, b) => a.date.localeCompare(b.date));
  habits.days.sort((a, b) => a.date.localeCompare(b.date));
  return { docs, notes, settings, habits, backlog, notemeta };
}

const parseBase = (state: SyncState, key: string): unknown | null =>
  key in state.bases ? JSON.parse(state.bases[key]) : null;

/** Entities that differ from what was last agreed with the server (new, edited or deleted). */
export function collectChanges(local: EntityMap, state: SyncState, includeHabits = true, includeBacklog = true, includeNoteMeta = true): SyncChange[] {
  const changes: SyncChange[] = [];
  const keys = new Set([...local.keys(), ...Object.keys(state.bases)]);
  for (const key of keys) {
    if (!includeHabits && isHabitEntityKey(key)) continue;
    if (!includeBacklog && isBacklogEntityKey(key)) continue;
    if (!includeNoteMeta && isNoteMetaEntityKey(key)) continue;
    const value = local.has(key) ? local.get(key)! : null;
    const base = parseBase(state, key);
    if (!sameValue(value, base)) changes.push({ key, base, value });
  }
  return changes;
}

/**
 * After the whole vault was replaced locally (restore a backup, load sample data), the old
 * bases no longer describe this device's history: diffing against them would turn every
 * missing entity into a deletion on the server. Forget them so the next sync is a fresh
 * merge that adds the new vault to the server and keeps what other devices have.
 */
export function rebaseAfterVaultReplace(state: SyncState): SyncState {
  return { ...state, bases: {}, lastRev: 0 };
}

export class SyncHttpError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export type SyncFeature = 'habits' | 'backlog' | 'notemeta';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function normalizeServerUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/api(\/sync)?$/i, '');
}

async function request<T>(fetchFn: FetchLike, url: string, init: RequestInit, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
    });
  } catch {
    throw new SyncHttpError('Cannot reach the server. Check the address and your connection.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new SyncHttpError(data.error || `Server error (${res.status})`, res.status);
  return data as T;
}

export interface SyncOutcome {
  unsupported: Set<SyncFeature>;
  habitsUnsupported?: boolean;
  backlogRecovered: boolean;
  notemetaRecovered: boolean;
  /** Whether the sent habit snapshot came from damaged-storage recovery. */
  habitsRecovered: boolean;
  /** Server value for every entity it returned (null = deleted). */
  serverValues: Map<string, unknown | null>;
  /** Snapshot of local entities sent in this round (to reconcile edits made meanwhile). */
  snapshot: EntityMap;
  state: SyncState;
  conflicts: string[];
  pushed: number;
  received: number;
}

const encoder = new TextEncoder();

/** Leading changes that fit the count and byte budgets; one change over the budget goes alone. */
export function takeBatch(changes: SyncChange[], maxBytes: number = MAX_SYNC_BATCH_BYTES): SyncChange[] {
  let bytes = 0;
  let count = 0;
  while (count < changes.length && count < MAX_CHANGES_PER_SYNC) {
    const size = encoder.encode(JSON.stringify(changes[count])).length + 1;
    if (count > 0 && bytes + size > maxBytes) break;
    bytes += size;
    count++;
  }
  return changes.slice(0, count);
}

/** Push local changes in bounded batches, receiving merged results and other devices' changes. */
export async function syncOnce(fetchFn: FetchLike, local: VaultData, state: SyncState, accessToken: string, unsupportedFeatures: ReadonlySet<SyncFeature> | boolean = new Set()): Promise<SyncOutcome> {
  const unsupported = new Set<SyncFeature>(typeof unsupportedFeatures === 'boolean' ? unsupportedFeatures ? ['habits'] : [] : unsupportedFeatures);
  const habitsRecovered = uneditedRecoveredHabits.has(local.habits);
  const backlogRecovered = uneditedRecoveredBacklog.has(local.backlog);
  const notemetaRecovered = uneditedRecoveredNoteMeta.has(local.notemeta);
  const snapshot = toEntities(local, !unsupported.has('habits'), !unsupported.has('backlog'), !unsupported.has('notemeta'));
  let changes = collectChanges(snapshot, state, !unsupported.has('habits') && !habitsRecovered, !unsupported.has('backlog') && !backlogRecovered, !unsupported.has('notemeta') && !notemetaRecovered);
  const send = (batch: SyncChange[]) => {
    const needsBackfill = (!unsupported.has('habits') && !state.habitsSynced) || (!unsupported.has('backlog') && !state.backlogSynced) || (!unsupported.has('notemeta') && !state.notemetaSynced);
    // Keep the original pull cursor across batches: a later server reconciliation
    // may change an entity already pushed by an earlier batch.
    const body: SyncRequest = { sinceRev: needsBackfill ? 0 : state.lastRev, changes: batch, features: ['habits', 'backlog', 'notemeta'] };
    return request<SyncResponse>(fetchFn, `${state.serverUrl}/api/sync`, { method: 'POST', body: JSON.stringify(body) }, accessToken);
  };
  let res: SyncResponse;
  const serverValues = new Map<string, unknown | null>();
  const receivedKeys = new Set<string>();
  const conflicts: string[] = [];
  let pushed = 0;
  for (;;) {
    const batch = takeBatch(changes);
    try {
      res = await send(batch);
      for (const e of res.entities) {
        receivedKeys.add(e.key);
        if (!(unsupported.has('habits') && isHabitEntityKey(e.key)) && !(unsupported.has('backlog') && isBacklogEntityKey(e.key)) && !(unsupported.has('notemeta') && isNoteMetaEntityKey(e.key))) serverValues.set(e.key, e.value);
      }
      // Deleting an entity the server never had produces no returned entity.
      const returnedKeys = new Set(res.entities.map(e => e.key));
      for (const c of batch) if (!returnedKeys.has(c.key)) serverValues.set(c.key, null);
      conflicts.push(...res.conflicts);
      pushed += batch.length;
      changes = changes.slice(batch.length);
      if (changes.length === 0) break;
    } catch (err) {
      if (!(err instanceof SyncHttpError) || err.status !== 400 || !err.message.startsWith('Invalid entity key')) throw err;
      // Older servers report no offending key. Probe the newest entity first so a
      // 1.6 server retains habits; servers predating habits need one further retry.
      const feature = (['notemeta', 'backlog', 'habits'] as const).find(f => !unsupported.has(f) && changes.some(c => f === 'notemeta' ? isNoteMetaEntityKey(c.key) : f === 'backlog' ? isBacklogEntityKey(c.key) : isHabitEntityKey(c.key)));
      if (!feature) throw err;
      unsupported.add(feature);
      const matches = feature === 'notemeta' ? isNoteMetaEntityKey : feature === 'backlog' ? isBacklogEntityKey : isHabitEntityKey;
      changes = changes.filter(c => !matches(c.key));
      for (const key of snapshot.keys()) if (matches(key)) snapshot.delete(key);
      for (const key of serverValues.keys()) if (matches(key)) serverValues.delete(key);
    }
  }

  const bases = { ...state.bases };
  for (const [key, value] of serverValues) {
    if (value === null) delete bases[key];
    else bases[key] = canonicalJson(value);
  }
  return {
    unsupported,
    habitsUnsupported: unsupported.has('habits'),
    backlogRecovered,
    notemetaRecovered,
    habitsRecovered,
    serverValues,
    snapshot,
    state: { ...state, bases, lastRev: res.rev, habitsSynced: !unsupported.has('habits'), backlogSynced: !unsupported.has('backlog'), notemetaSynced: !unsupported.has('notemeta'), lastSyncAt: new Date().toISOString() },
    conflicts,
    pushed,
    received: receivedKeys.size,
  };
}

/**
 * Applies a sync outcome to the vault as it is *now*. Entities edited locally while the
 * request was in flight are merged again (snapshot as base) so those edits are kept and
 * pushed next round.
 */
export function applySyncOutcome(current: VaultData, outcome: SyncOutcome): VaultData {
  const mergeTime = Date.now();
  const now = toEntities(current);
  const recovering = uneditedRecoveredHabits.has(current.habits);
  let receivedHabits = false;
  const recoveringBacklog = uneditedRecoveredBacklog.has(current.backlog);
  let receivedBacklog = false;
  const recoveringNoteMeta = uneditedRecoveredNoteMeta.has(current.notemeta);
  let receivedNoteMeta = false;
  for (const [key, serverValue] of outcome.serverValues) {
    const sent = outcome.snapshot.has(key) ? outcome.snapshot.get(key)! : null;
    const mine = now.has(key) ? now.get(key)! : null;
    const recoveredHabit = (recovering || outcome.habitsRecovered) && isHabitEntityKey(key);
    if (recoveredHabit) receivedHabits = true;
    const recoveredBacklog = (recoveringBacklog || outcome.backlogRecovered) && isBacklogEntityKey(key);
    if (recoveredBacklog) receivedBacklog = true;
    const recoveredNoteMeta = (recoveringNoteMeta || outcome.notemetaRecovered) && isNoteMetaEntityKey(key);
    if (recoveredNoteMeta) receivedNoteMeta = true;
    const recovered = recoveredHabit || recoveredBacklog || recoveredNoteMeta;
    if (!recovered && sameValue(mine, sent)) {
      if (serverValue === null) now.delete(key);
      else now.set(key, serverValue);
    } else {
      // Recovery has no trustworthy base. Retain local survivors as additions
      // while restoring the server's history, including ticks on partially damaged days.
      // This can resurrect data deleted by another device; accepted without a trustworthy base.
      const merged = mergeEntity(key, recovered ? null : sent, serverValue, mine, mergeTime);
      if (merged.value === null) now.delete(key);
      else now.set(key, merged.value);
      for (const extra of merged.extraNotes ?? []) now.set(`note:${extra.id}`, extra);
    }
  }
  const next = fromEntities(now, current.settings);
  if (recovering && !receivedHabits) uneditedRecoveredHabits.add(next.habits);
  // A rollover made before this pull may have carried a task finished elsewhere
  next.docs = dropStaleCarries(next.docs);
  const reconciled = reconcileBacklogVault(next.backlog, next.docs);
  next.backlog = reconciled.backlog;
  next.docs = reconciled.docs;
  if (recoveringBacklog && !receivedBacklog) uneditedRecoveredBacklog.add(next.backlog);
  if (recoveringNoteMeta && !receivedNoteMeta) uneditedRecoveredNoteMeta.add(next.notemeta);
  return next;
}
