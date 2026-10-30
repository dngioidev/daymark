import { describe, expect, it } from 'vitest';
import { DailyDocument, TaskItem } from '../types/daymark';
import { DEFAULT_SETTINGS } from '../utils/defaultData';
import { EMPTY_BACKLOG } from '../utils/backlog';
import { EMPTY_NOTE_META } from '../types/daymark';
import { dropStaleCarries, performDailyRollover } from '../utils/lifecycleEngine';
import { toggleTaskDoneInDocument } from '../utils/taskActions';
import { mergeDailyDocument } from './merge';
import { applySyncOutcome, SyncOutcome, toEntities, VaultData } from './syncClient';

// Two devices share a task that was carried into Oct 20. Device 1 finishes it; device 2 is
// asleep (laptop lid closed, phone in a pocket) and acts on its stale copy before it syncs.

const D = '2026-10-20';
const NEXT = '2026-10-21';

const task = (extra: Partial<TaskItem> = {}): TaskItem => ({
  id: 'x', title: 'Write report', status: 'in-progress', createdDate: '2026-10-19', originalNoteDate: '2026-10-19',
  heading: 'Work', order: 1, historyLog: [{ id: 'h-created', timestamp: '2026-10-19T09:00:00.000Z', date: '2026-10-19', action: 'created', details: 'Created' }],
  ...extra,
});
const doc = (date: string, items: TaskItem[]): DailyDocument => ({
  date, type: 'daily', updatedAt: `${date}T08:00:00.000Z`, headings: [{ name: 'Work', items, notesContent: '' }],
});
const find = (docs: DailyDocument[], date: string) => docs.find((d) => d.date === date)?.headings.flatMap((h) => h.items).find((t) => t.id === 'x');
const done = (d: DailyDocument, date = d.date) => toggleTaskDoneInDocument(d, 'x', date)!.doc;
const rollover = (docs: DailyDocument[], date: string) => performDailyRollover(date, docs, DEFAULT_SETTINGS.statuses, ['Work']).updatedDocs;

describe('a task finished on one device stays finished', () => {
  it('keeps the done status when the other device dismissed its stale alert meanwhile', () => {
    const base = doc(D, [task()]);
    const finished = done(base);
    const dismissed = doc(D, [task({ dismissedAlertDate: D })]);
    const r = mergeDailyDocument(base, finished, dismissed);
    const merged = r.value!.headings[0].items[0];
    expect(merged.status).toBe('done');
    expect(merged.completedDate).toBe(D);
    expect(merged.dismissedAlertDate).toBe(D);
    expect(r.conflicts).toEqual([]);
  });

  it('keeps both history entries and both edits when different fields changed', () => {
    const base = doc(D, [task()]);
    const finished = done(base);
    const renamed = doc(D, [task({ title: 'Write the report' })]);
    const merged = mergeDailyDocument(base, renamed, finished).value!.headings[0].items[0];
    expect(merged.title).toBe('Write the report');
    expect(merged.status).toBe('done');
    expect(merged.historyLog.map((e) => e.action)).toEqual(['created', 'status_changed']);
  });

  it('still lets the incoming status win when both devices changed the status', () => {
    const base = doc(D, [task()]);
    const r = mergeDailyDocument(base, done(base), doc(D, [task({ status: 'blocked' })]));
    const merged = r.value!.headings[0].items[0];
    expect(merged.status).toBe('blocked');
    expect(merged.completedDate).toBeUndefined();
    expect(r.conflicts).toHaveLength(1);
  });

  it('a stale rollover does not reopen a task finished on the new day', () => {
    // Both devices synced Oct 20 with the task open.
    const shared = [doc(D, [task()])];
    // Device 1 rolls over to Oct 21 and finishes the carried copy there.
    const device1 = rollover(shared, NEXT);
    const serverNext = done(device1.find((d) => d.date === NEXT)!);
    // Device 2 wakes up and rolls over before pulling: same carried copy, still open.
    const device2Next = rollover(shared, NEXT).find((d) => d.date === NEXT)!;
    const r = mergeDailyDocument(null, serverNext, device2Next);
    expect(find([r.value!], NEXT)?.status).toBe('done');
    expect(r.conflicts).toEqual([]);
  });

  it('a stale rollover carry is dropped once the finished source day arrives', () => {
    const shared = [doc(D, [task()])];
    // Device 1 finishes the task on Oct 20 in the evening; nothing is carried to Oct 21.
    const finishedDay = { ...done(shared[0]) };
    finishedDay.headings[0].items[0].historyLog.at(-1)!.timestamp = '2026-10-20T15:00:00.000Z';
    // Device 2 rolls over on stale data, then pulls the finished Oct 20.
    const device2 = rollover(shared, NEXT);
    expect(find(device2, NEXT)?.status).toBe('in-progress');
    const afterPull = device2.map((d) => (d.date === D ? finishedDay : d));
    const cleaned = dropStaleCarries(afterPull);
    expect(find(cleaned, NEXT)).toBeUndefined();
    expect(find(cleaned, D)?.status).toBe('done');
  });

  it('keeps a carried copy when its earlier day was finished after the carry day began', () => {
    const shared = [doc(D, [task()])];
    const device = rollover(shared, NEXT);
    // The user later ticks the old Oct 20 copy on purpose (Oct 21, 10:00 local).
    const late = done(device.find((d) => d.date === D)!);
    late.headings[0].items[0].historyLog.at(-1)!.timestamp = new Date(2026, 9, 21, 10).toISOString();
    const docs = device.map((d) => (d.date === D ? late : d));
    expect(dropStaleCarries(docs)).toBe(docs);
  });

  it('keeps a carried copy that was edited after the carry', () => {
    const shared = [doc(D, [task()])];
    const finishedDay = done(shared[0]);
    finishedDay.headings[0].items[0].historyLog.at(-1)!.timestamp = '2026-10-20T15:00:00.000Z';
    const device2 = rollover(shared, NEXT);
    const edited = device2.map((d) => d.date !== NEXT ? d : {
      ...d, headings: d.headings.map((h) => ({ ...h, items: h.items.map((t) => ({ ...t, historyLog: [...t.historyLog,
        { id: 'h-moved', timestamp: '2026-10-21T09:00:00.000Z', date: NEXT, action: 'moved' as const, details: 'Moved' }] })) })),
    });
    const docs = edited.map((d) => (d.date === D ? finishedDay : d));
    expect(find(dropStaleCarries(docs), NEXT)).toBeDefined();
  });

  it('the sync pull removes the stale carry so the next round pushes the fix', () => {
    const shared = [doc(D, [task()])];
    const finishedDay = done(shared[0]);
    finishedDay.headings[0].items[0].historyLog.at(-1)!.timestamp = '2026-10-20T15:00:00.000Z';
    const vault: VaultData = { docs: rollover(shared, NEXT), notes: [], settings: DEFAULT_SETTINGS, habits: { habits: [], days: [] }, backlog: EMPTY_BACKLOG, notemeta: EMPTY_NOTE_META };
    const outcome = { serverValues: new Map([[`doc:${D}`, finishedDay]]), snapshot: toEntities(vault) } as unknown as SyncOutcome;
    const next = applySyncOutcome(vault, outcome);
    expect(find(next.docs, D)?.status).toBe('done');
    expect(find(next.docs, NEXT)).toBeUndefined();
  });
});
