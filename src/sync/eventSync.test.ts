import { describe, expect, it } from 'vitest';
import type { EventItem } from '../types/daymark';
import { DEFAULT_SETTINGS } from '../utils/defaultData';
import { uneditedRecoveredEvents } from '../utils/events';
import { canonicalJson } from './merge';
import { applySyncOutcome, collectChanges, fromEntities, syncOnce, toEntities, type SyncState, type VaultData } from './syncClient';
import { startSyncRig } from './testkit/devices';

const event: EventItem = {
  id: 'sync-event', title: 'Planning', date: '2026-11-15', heading: 'Work', order: 1,
  description: 'Bring notes', createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z',
};
const emptyVault = (): VaultData => ({ ink: [], docs: [], notes: [], events: [], settings: DEFAULT_SETTINGS,
  habits: { habits: [], days: [] }, backlog: { items: [] }, notemeta: { folders: [], dismissed: [] } });
const state: SyncState = { serverUrl: 'https://test', username: 'a', deviceId: 'a', deviceName: 'a',
  lastRev: 8, habitsSynced: true, backlogSynced: true, notemetaSynced: true, inkSynced: true,
  eventsSynced: false, bases: {}, lastSyncAt: null };

describe('event sync entities', () => {
  it('round-trips events and collects independent per-ID changes', () => {
    const local = { ...emptyVault(), events: [event] };
    expect(toEntities(local).get(`event:${event.id}`)).toEqual(event);
    expect(fromEntities(toEntities(local), DEFAULT_SETTINGS).events).toEqual([event]);
    expect(fromEntities(new Map(), DEFAULT_SETTINGS).events).toEqual([]);
    const bases = Object.fromEntries([...toEntities(emptyVault())].map(([key, value]) => [key, canonicalJson(value)]));
    expect(collectChanges(toEntities(local), { ...state, bases })).toContainEqual({ key: `event:${event.id}`, base: null, value: event });
  });

  it('backfills events from revision zero on upgrade', async () => {
    const calls: { sinceRev: number; features?: string[] }[] = [];
    const outcome = await syncOnce(async (_url, init) => {
      const body = JSON.parse(String(init?.body)); calls.push(body);
      return Response.json({ rev: 12, entities: [{ key: `event:${event.id}`, rev: 5, value: event }], conflicts: [], supportedFeatures: ['events'] });
    }, emptyVault(), state, 'token');
    expect(calls[0]).toMatchObject({ sinceRev: 0, features: expect.arrayContaining(['events']) });
    expect(outcome.state.eventsSynced).toBe(true);
    expect(applySyncOutcome(emptyVault(), outcome).events).toEqual([event]);
  });

  it('continues task sync when an old server rejects event keys and leaves events pending', async () => {
    const baseline = emptyVault();
    const local: VaultData = { ...baseline, docs: [{ date: '2026-11-15', type: 'daily', headings: [], updatedAt: '2026-11-15T12:00:00Z' }], events: [event] };
    const bases = Object.fromEntries([...toEntities(baseline)].map(([key, value]) => [key, canonicalJson(value)]));
    const calls: { changes: { key: string }[]; features?: string[] }[] = [];
    const outcome = await syncOnce(async (_url, init) => {
      const body = JSON.parse(String(init?.body)); calls.push(body);
      if (body.changes.some((change: { key: string }) => change.key.startsWith('event:'))) {
        return Response.json({ error: 'Invalid entity key in sync request.' }, { status: 400 });
      }
      return Response.json({ rev: 11, entities: body.changes.map((change: object) => ({ ...change, rev: 11 })), conflicts: [], supportedFeatures: [] });
    }, local, { ...state, bases, eventsSynced: true }, 'token');
    expect(calls).toHaveLength(2);
    expect(calls[0].features).toContain('events');
    expect(calls[1].changes.some(change => change.key.startsWith('event:'))).toBe(false);
    expect(calls[1].changes.some(change => change.key.startsWith('doc:'))).toBe(true);
    expect(outcome.unsupported.has('events')).toBe(true);
    expect(outcome.state.eventsSynced).toBe(false);
    expect(outcome.conflicts.join(' ')).toMatch(/server.*updated|update.*server/i);
    expect(applySyncOutcome(local, outcome).events).toEqual([event]);
    expect(collectChanges(toEntities(local), outcome.state).some(change => change.key.startsWith('event:'))).toBe(true);
  });

  it('does not send recovered events before an authoritative server copy arrives', async () => {
    const recovered = [event];
    uneditedRecoveredEvents.add(recovered);
    const local = { ...emptyVault(), events: recovered };
    const sent: { key: string }[] = [];
    const outcome = await syncOnce(async (_url, init) => {
      const body = JSON.parse(String(init?.body)); sent.push(...body.changes);
      return Response.json({ rev: 9, entities: [], conflicts: [], supportedFeatures: ['events'] });
    }, local, state, 'token');
    expect(sent.some(change => change.key.startsWith('event:'))).toBe(false);
    const waiting = applySyncOutcome(local, outcome);
    expect(uneditedRecoveredEvents.has(waiting.events)).toBe(true);
    const received = await syncOnce(async () => Response.json({ rev: 10,
      entities: [{ key: `event:${event.id}`, rev: 5, value: event }], conflicts: [], supportedFeatures: ['events'] }), waiting, state, 'token');
    const next = applySyncOutcome(waiting, received);
    expect(next.events).toEqual([event]);
    expect(uneditedRecoveredEvents.has(next.events)).toBe(false);
  });

  it('does not resurrect an event deleted while its sync response is in flight', async () => {
    const local = { ...emptyVault(), events: [event] };
    let respond!: (response: Response) => void;
    const pending = syncOnce(() => new Promise<Response>(resolve => { respond = resolve; }), local, { ...state, eventsSynced: true }, 'token');
    respond(Response.json({ rev: 10, entities: [{ key: `event:${event.id}`, rev: 9, value: event }], conflicts: [], supportedFeatures: ['events'] }));
    const outcome = await pending;
    const deleted = { ...local, events: [] };
    expect(applySyncOutcome(deleted, outcome).events).toEqual([]);
  });

  it('reports a conflict when an event is edited while a sync response with another edit is in flight', async () => {
    const local = { ...emptyVault(), events: [event] };
    let respond!: (response: Response) => void;
    const pending = syncOnce(() => new Promise<Response>(resolve => { respond = resolve; }), local, { ...state, eventsSynced: true }, 'token');
    respond(Response.json({ rev: 10, entities: [{ key: `event:${event.id}`, rev: 9,
      value: { ...event, description: 'Server edit' } }], conflicts: [], supportedFeatures: ['events'] }));
    const outcome = await pending;
    const duringRequest = { ...local, events: [{ ...event, description: 'Local edit' }] };
    const next = applySyncOutcome(duringRequest, outcome);
    expect(next.events[0].description).toContain('Server edit');
    expect(next.events[0].description).toContain('Local edit');
    expect(outcome.conflicts.join(' ')).toMatch(/notes were edited on two devices/);
  });
});

describe('events with legacy clients', () => {
  it('hides event entities from clients without the capability and preserves them through task sync', async () => {
    const rig = await startSyncRig();
    try {
      const modern = rig.device('modern');
      const old = rig.device('old', { legacyEvents: true });
      modern.edit(vault => ({ ...vault, events: [event] }));
      await modern.sync();
      const oldOutcome = await old.sync();
      expect(oldOutcome.serverValues.has(`event:${event.id}`)).toBe(false);
      expect(Object.keys(oldOutcome.state.bases).some(key => key.startsWith('event:'))).toBe(false);
      expect(old.vault.events).toEqual([]);
      old.edit(vault => ({ ...vault, docs: [{ ...vault.docs[0], headings: [{ name: 'Work', items: [], notesContent: '' }] }] }));
      await old.sync();
      const pulled = await modern.sync();
      expect(modern.vault.events).toEqual([event]);
      expect(pulled.unsupported.has('events')).toBe(false);
    } finally { await rig.stop(); }
  });

  it('converges per-ID edits through the real server without duplicating moved events', async () => {
    const rig = await startSyncRig();
    try {
      const first = rig.device('event-editor-a');
      const second = rig.device('event-editor-b');
      first.edit(vault => ({ ...vault, events: [event] }));
      await first.sync();
      await second.sync();
      first.edit(vault => ({ ...vault, events: [{ ...vault.events[0], date: '2026-11-16', description: 'Agenda' }] }));
      second.edit(vault => ({ ...vault, events: [{ ...vault.events[0], title: 'Updated planning' }] }));
      await first.sync();
      await second.sync();
      expect(second.vault.events).toHaveLength(1);
      expect(second.vault.events[0]).toMatchObject({ id: event.id, date: '2026-11-16', title: 'Updated planning', description: 'Agenda' });
      await first.sync();
      expect(first.vault.events).toEqual(second.vault.events);
    } finally { await rig.stop(); }
  });

  it('persists event entities when the server process restarts', async () => {
    const rig = await startSyncRig();
    try {
      const writer = rig.device('event-persistence-writer');
      writer.edit(vault => ({ ...vault, events: [event] }));
      await writer.sync();
      await rig.restartServer();
      const reader = rig.device('event-persistence-reader');
      await reader.sync();
      expect(reader.vault.events).toEqual([event]);
    } finally { await rig.stop(); }
  });

  it('preserves the shared event warning setting when an older client writes settings', async () => {
    const rig = await startSyncRig();
    try {
      const modern = rig.device('modern-settings');
      const old = rig.device('old-settings', { legacySettings: true });
      modern.edit(vault => ({ ...vault, settings: { ...vault.settings, eventWarningMinutes: 30 } }));
      await modern.sync();
      await old.sync();
      old.edit(vault => ({ ...vault, settings: { ...vault.settings, timeZone: 'Asia/Saigon' } }));
      await old.sync();
      await modern.sync();
      expect(modern.vault.settings.eventWarningMinutes).toBe(30);
      expect(modern.vault.settings.timeZone).toBe('Asia/Saigon');
    } finally { await rig.stop(); }
  });
});
