import { AppSettings, DailyDocument, HabitData, HabitDay, StandaloneNote } from '../types/daymark';
import { canonicalJson, isHabitEntityKey, mergeEntity, sameValue, SyncedSettings, toSyncedSettings } from './merge';
import { SyncChange, SyncRequest, SyncResponse } from './protocol';
import { uneditedRecoveredHabits } from '../utils/habits';

/**
 * Client side of sync, kept free of React and storage so it can be tested against the real
 * server in-process. The app wires it up in src/hooks/useSync.ts.
 */

export interface VaultData {
  docs: DailyDocument[];
  notes: StandaloneNote[];
  settings: AppSettings;
  habits: HabitData;
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
  /** Canonical JSON of the last version agreed with the server, per entity key. */
  bases: Record<string, string>;
  lastSyncAt: string | null;
}

export type EntityMap = Map<string, unknown>;

export function toEntities(vault: VaultData, includeHabits = true): EntityMap {
  const map: EntityMap = new Map();
  for (const doc of vault.docs) map.set(`doc:${doc.date}`, doc);
  for (const note of vault.notes) map.set(`note:${note.id}`, note);
  map.set('settings', toSyncedSettings(vault.settings));
  if (includeHabits) {
    map.set('habits', { habits: vault.habits.habits });
    for (const day of vault.habits.days) map.set(`habitday:${day.date}`, day);
  }
  return map;
}

export function fromEntities(map: EntityMap, localSettings: AppSettings): VaultData {
  const docs: DailyDocument[] = [];
  const notes: StandaloneNote[] = [];
  const habits: HabitData = { habits: [], days: [] };
  let settings = localSettings;
  for (const [key, value] of map) {
    if (value === null || value === undefined) continue;
    if (key.startsWith('doc:')) docs.push(value as DailyDocument);
    else if (key.startsWith('note:')) notes.push(value as StandaloneNote);
    else if (key === 'habits') habits.habits = (value as Pick<HabitData, 'habits'>).habits;
    else if (key.startsWith('habitday:')) habits.days.push(value as HabitDay);
    else if (key === 'settings') {
      // Keep this device's own sync config and date override
      settings = { ...(value as SyncedSettings), syncConfig: localSettings.syncConfig, simulatedToday: localSettings.simulatedToday };
    }
  }
  docs.sort((a, b) => a.date.localeCompare(b.date));
  habits.days.sort((a, b) => a.date.localeCompare(b.date));
  return { docs, notes, settings, habits };
}

const parseBase = (state: SyncState, key: string): unknown | null =>
  key in state.bases ? JSON.parse(state.bases[key]) : null;

/** Entities that differ from what was last agreed with the server (new, edited or deleted). */
export function collectChanges(local: EntityMap, state: SyncState, includeHabits = true): SyncChange[] {
  const changes: SyncChange[] = [];
  const keys = new Set([...local.keys(), ...Object.keys(state.bases)]);
  for (const key of keys) {
    if (!includeHabits && isHabitEntityKey(key)) continue;
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
  habitsUnsupported?: boolean;
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

/** One round trip: push local changes, receive merged results and other devices' changes. */
export async function syncOnce(fetchFn: FetchLike, local: VaultData, state: SyncState, accessToken: string, habitsUnsupported = false): Promise<SyncOutcome> {
  const habitsRecovered = uneditedRecoveredHabits.has(local.habits);
  const snapshot = toEntities(local, !habitsUnsupported);
  let changes = collectChanges(snapshot, state, !habitsUnsupported && !habitsRecovered);
  const send = () => {
    const body: SyncRequest = { sinceRev: !habitsUnsupported && !state.habitsSynced ? 0 : state.lastRev, changes, features: ['habits'] };
    return request<SyncResponse>(fetchFn, `${state.serverUrl}/api/sync`, { method: 'POST', body: JSON.stringify(body) }, accessToken);
  };
  let res: SyncResponse;
  try {
    res = await send();
  } catch (err) {
    if (habitsUnsupported || !(err instanceof SyncHttpError) || err.status !== 400 ||
      !err.message.startsWith('Invalid entity key')) throw err;
    habitsUnsupported = true;
    changes = changes.filter((c) => !isHabitEntityKey(c.key));
    for (const key of snapshot.keys()) if (isHabitEntityKey(key)) snapshot.delete(key);
    res = await send();
  }

  const serverValues = new Map<string, unknown | null>();
  for (const e of res.entities) {
    if (!habitsUnsupported || !isHabitEntityKey(e.key)) serverValues.set(e.key, e.value);
  }
  // A pushed key the server never stored (e.g. deleting something it never had) is simply absent
  for (const c of changes) if (!serverValues.has(c.key)) serverValues.set(c.key, null);

  const bases = { ...state.bases };
  for (const [key, value] of serverValues) {
    if (value === null) delete bases[key];
    else bases[key] = canonicalJson(value);
  }
  return {
    habitsUnsupported,
    habitsRecovered,
    serverValues,
    snapshot,
    state: { ...state, bases, lastRev: res.rev, habitsSynced: !habitsUnsupported, lastSyncAt: new Date().toISOString() },
    conflicts: res.conflicts,
    pushed: changes.length,
    received: res.entities.length,
  };
}

/**
 * Applies a sync outcome to the vault as it is *now*. Entities edited locally while the
 * request was in flight are merged again (snapshot as base) so those edits are kept and
 * pushed next round.
 */
export function applySyncOutcome(current: VaultData, outcome: SyncOutcome): VaultData {
  const now = toEntities(current);
  const recovering = uneditedRecoveredHabits.has(current.habits);
  let receivedHabits = false;
  for (const [key, serverValue] of outcome.serverValues) {
    const sent = outcome.snapshot.has(key) ? outcome.snapshot.get(key)! : null;
    const mine = now.has(key) ? now.get(key)! : null;
    const recoveredHabit = (recovering || outcome.habitsRecovered) && isHabitEntityKey(key);
    if (recoveredHabit) receivedHabits = true;
    if (!recoveredHabit && sameValue(mine, sent)) {
      if (serverValue === null) now.delete(key);
      else now.set(key, serverValue);
    } else {
      // Recovery has no trustworthy habit base. Retain local survivors as additions
      // while restoring the server's history, including ticks on partially damaged days.
      // This can resurrect data deleted by another device; accepted without a trustworthy base.
      const merged = mergeEntity(key, recoveredHabit ? null : sent, serverValue, mine);
      if (merged.value === null) now.delete(key);
      else now.set(key, merged.value);
      for (const extra of merged.extraNotes ?? []) now.set(`note:${extra.id}`, extra);
    }
  }
  const next = fromEntities(now, current.settings);
  if (recovering && !receivedHabits) uneditedRecoveredHabits.add(next.habits);
  return next;
}
