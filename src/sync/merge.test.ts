import { describe, expect, it } from 'vitest';
import { DailyDocument, Habit, HabitDay, StandaloneNote, TaskItem } from '../types/daymark';
import { DEFAULT_SETTINGS } from '../utils/defaultData';
import type { BacklogItem } from '../types/daymark';
import { isBacklogEntityKey, mergeBacklog } from './merge';
import {
  CONFLICT_SEPARATOR,
  canonicalJson,
  isValidEntityKey,
  mergeDailyDocument,
  mergeEntity,
  mergeSettings,
  mergeStandaloneNote,
  toSyncedSettings,
} from './merge';

const habit = (id: string, extra: Partial<Habit> = {}): Habit => ({
  id, name: id, order: 1, warnAfterDays: 3, addedOn: '2026-10-24', updatedAt: '2026-10-24T08:00:00Z', ...extra,
});
const habitDay = (ticks: HabitDay['ticks']): HabitDay => ({ date: '2026-10-24', ticks });
describe('backlog merges', () => {
  const early = '2026-10-26T08:00:00Z';
  const late = '2026-10-26T09:00:00Z';
  const a: BacklogItem = { id: 'a', title: 'Task', order: 1, createdAt: early, updatedAt: early };
  const base = { items: [a] };
  const edited = { items: [{ ...a, title: 'Edited', updatedAt: late }] };
  it('keeps independent additions and missing items on either side', () => {
    const b = { ...a, id: 'b' };
    expect(mergeBacklog(null, base, { items: [b] }).value?.items).toEqual([a, b]);
    expect(mergeBacklog(base, { items: [] }, base).value).toEqual(base);
    expect(mergeBacklog(base, base, { items: [] }).value).toEqual(base);
  });
  it('uses three-way equality before timestamps, newer edits win true conflicts, incoming wins ties', () => {
    const other = { items: [{ ...a, title: 'Other' }] };
    expect(mergeBacklog(base, edited, other).value).toEqual(edited);
    expect(mergeBacklog(base, other, edited).value).toEqual(edited);
    expect(mergeBacklog(base, other, { items: [{ ...a, title: 'Incoming' }] }).value?.items[0].title).toBe('Incoming');
    expect(mergeBacklog(edited, edited, other).value).toEqual(other);
    expect(mergeBacklog(base, edited, other).conflicts).toHaveLength(1);
  });
  it('keeps the newer edit when a concurrent pick occurs; reconciliation updates backlog visibility later', () => {
    const picked = { items: [{ ...a, pickedOn: '2026-10-26' }] };
    expect(mergeBacklog(base, picked, edited).value).toEqual(edited);
  });
  it('retains edits against item or whole-entity deletes, honours unchanged entity deletes', () => {
    expect(mergeBacklog(base, { items: [{ ...a, deletedAt: early }] }, edited).value).toEqual(edited);
    expect(mergeBacklog(base, null, edited).value).toEqual(edited);
    expect(mergeBacklog(base, edited, null).value).toEqual(edited);
    expect(mergeBacklog(base, base, null).value).toBeNull();
    expect(mergeBacklog(base, null, base).value).toBeNull();
    expect(mergeBacklog(base, null, null).value).toBeNull();
  });
  it('accepts and dispatches only the exact backlog entity key', () => {
    expect(isValidEntityKey('backlog')).toBe(true);
    expect(isBacklogEntityKey('backlog')).toBe(true);
    expect(isBacklogEntityKey('backlog:a')).toBe(false);
    expect(mergeEntity('backlog', base, base, edited).value).toEqual(edited);
  });
});
describe('habit merges', () => {
  const early = { done: true, at: '2026-10-24T08:00:00Z' };
  const late = { done: true, at: '2026-10-24T09:00:00Z' };
  it('two devices tick different habits on same day keep both', () => {
    expect(mergeEntity('habitday:2026-10-24', null, habitDay({ a: early }), habitDay({ b: late })).value)
      .toEqual(habitDay({ a: early, b: late }));
  });
  it('same habit later at wins', () => {
    expect(mergeEntity('habitday:2026-10-24', null, habitDay({ a: late }), habitDay({ a: early })).value)
      .toEqual(habitDay({ a: late }));
  });
  it('untick later beats tick', () => {
    expect(mergeEntity('habitday:2026-10-24', null, habitDay({ a: early }), habitDay({ a: { ...late, done: false } })).value)
      .toEqual(habitDay({ a: { ...late, done: false } }));
  });
  it('ties take theirs and whole-day deletions apply against an unchanged base', () => {
    const ours = habitDay({ a: early });
    const theirs = habitDay({ a: { ...early, done: false } });
    expect(mergeEntity('habitday:2026-10-24', null, ours, theirs).value).toEqual(theirs);
    expect(mergeEntity('habitday:2026-10-24', ours, ours, null).value).toBeNull();
    expect(mergeEntity('habitday:2026-10-24', ours, null, null).value).toBeNull();
  });
  it('removal beats rename', () => {
    const base = { habits: [habit('a')] };
    const removed = { habits: [habit('a', { removedOn: '2026-10-24' })] };
    const renamed = { habits: [habit('a', { name: 'renamed' })] };
    expect(mergeEntity('habits', base, removed, renamed).value).toEqual(removed);
    expect(mergeEntity('habits', base, renamed, removed).value).toEqual(removed);
  });
  it('habit added on each device keeps both', () => {
    const result = mergeEntity('habits', null, { habits: [habit('a')] }, { habits: [habit('b')] });
    expect(result.value).toEqual({ habits: expect.arrayContaining([habit('a'), habit('b')]) });
    expect((result.value as { habits: Habit[] }).habits).toHaveLength(2);
  });
  it('takes one-sided edits and keeps habits missing on either side', () => {
    const base = { habits: [habit('a'), habit('b')] };
    const ours = { habits: [habit('a', { name: 'renamed' })] };
    expect(mergeEntity('habits', base, ours, base).value).toEqual({ habits: [habit('a', { name: 'renamed' }), habit('b')] });
    expect(mergeEntity('habits', base, null, ours).value).toEqual(ours);
    expect(mergeEntity('habits', base, null, null).value).toBeNull();
  });
  it('validates habit entity keys', () => {
    expect(isValidEntityKey('habits')).toBe(true);
    expect(isValidEntityKey('habitday:2026-10-24')).toBe(true);
    expect(isValidEntityKey('habitday:2026-1-24')).toBe(false);
  });
  it('habit list deletion applies when other side unchanged', () => {
    const base = { habits: [habit('a')] };
    const unchanged = structuredClone(base);
    expect(mergeEntity('habits', base, unchanged, null).value).toBeNull();
    expect(mergeEntity('habits', base, null, unchanged).value).toBeNull();
    expect(mergeEntity('habits', null, unchanged, null).value).toEqual(unchanged);
    expect(mergeEntity('habits', null, null, unchanged).value).toEqual(unchanged);
  });
  it('habit list deletion loses to concurrent edit', () => {
    const base = { habits: [habit('a')] };
    const edited = { habits: [habit('a', { name: 'Edited habit' })] };
    expect(mergeEntity('habits', base, edited, null).value).toEqual(edited);
    expect(mergeEntity('habits', base, null, edited).value).toEqual(edited);
  });
  it('habit day deletion applies when other side unchanged', () => {
    const base = habitDay({ a: early });
    const unchanged = structuredClone(base);
    expect(mergeEntity('habitday:2026-10-24', base, unchanged, null).value).toBeNull();
    expect(mergeEntity('habitday:2026-10-24', base, null, unchanged).value).toBeNull();
    expect(mergeEntity('habitday:2026-10-24', null, unchanged, null).value).toEqual(unchanged);
    expect(mergeEntity('habitday:2026-10-24', null, null, unchanged).value).toEqual(unchanged);
  });
  it('habit day deletion loses to a newer tick', () => {
    const base = habitDay({ a: early });
    const edited = habitDay({ a: late });
    expect(mergeEntity('habitday:2026-10-24', base, edited, null).value).toEqual(edited);
    expect(mergeEntity('habitday:2026-10-24', base, null, edited).value).toEqual(edited);
  });
});

const task = (id: string, status = 'in-progress', heading = 'Work'): TaskItem => ({
  id,
  title: `Task ${id}`,
  status,
  createdDate: '2026-10-20',
  originalNoteDate: '2026-10-20',
  heading,
  order: 1,
  historyLog: [],
});

const doc = (items: TaskItem[], notes = '', extra: Partial<DailyDocument> = {}): DailyDocument => ({
  date: '2026-10-20',
  type: 'daily',
  updatedAt: '2026-10-20T08:00:00Z',
  headings: [{ name: 'Work', items, notesContent: notes }],
  ...extra,
});

const ids = (d: DailyDocument | null) => d!.headings.flatMap((h) => h.items.map((t) => `${t.id}:${t.status}`));

describe('mergeDailyDocument', () => {
  it('unions tombstones from both devices', () => {
    const base = doc([task('a'), task('b'), task('c')]);
    const ours = doc([task('b'), task('c')], '', { removedTaskIds: ['a'] });
    const theirs = doc([task('a'), task('c')], '', { removedTaskIds: ['b'] });
    const merged = mergeDailyDocument(base, ours, theirs).value!;
    expect(merged.removedTaskIds?.slice().sort()).toEqual(['a', 'b']);
    expect(ids(merged)).toEqual(['c:in-progress']);
  });

  it('a deletion wins when neither device has synced the day (ours deleted)', () => {
    const ours = doc([], '', { removedTaskIds: ['a'] });
    const theirs = doc([task('a')]);
    const merged = mergeDailyDocument(null, ours, theirs).value!;
    expect(ids(merged)).toEqual([]);
    expect(merged.removedTaskIds).toEqual(['a']);
  });

  it('a deletion wins when neither device has synced the day (theirs deleted)', () => {
    const ours = doc([task('a')]);
    const theirs = doc([], '', { removedTaskIds: ['a'] });
    const merged = mergeDailyDocument(null, ours, theirs).value!;
    expect(ids(merged)).toEqual([]);
    expect(merged.removedTaskIds).toEqual(['a']);
  });

  it('drops tombstones for tasks that are present', () => {
    const base = doc([task('a')]);
    const ours = doc([], '', { removedTaskIds: ['a'] });
    const theirs = doc([task('a', 'done')]);
    const merged = mergeDailyDocument(base, ours, theirs).value!;
    expect(ids(merged)).toContain('a:done');
    expect(merged.removedTaskIds).toBeUndefined();
  });

  it('takes the only side that changed', () => {
    const base = doc([task('a')]);
    const theirs = doc([task('a', 'done')]);
    expect(ids(mergeDailyDocument(base, base, theirs).value)).toEqual(['a:done']);
    expect(ids(mergeDailyDocument(base, theirs, base).value)).toEqual(['a:done']);
  });

  it('keeps tasks added on both devices (no data loss)', () => {
    const base = doc([task('a')]);
    const ours = doc([task('a'), task('b')]);
    const theirs = doc([task('a'), task('c')]);
    const r = mergeDailyDocument(base, ours, theirs);
    expect(ids(r.value).sort()).toEqual(['a:in-progress', 'b:in-progress', 'c:in-progress']);
    expect(r.conflicts).toEqual([]);
  });

  it('merges different edits to different tasks of the same day', () => {
    const base = doc([task('a'), task('b')]);
    const ours = doc([task('a', 'done'), task('b')]);
    const theirs = doc([task('a'), task('b', 'blocked')]);
    expect(ids(mergeDailyDocument(base, ours, theirs).value)).toEqual(['a:done', 'b:blocked']);
  });

  it('applies a deletion made on one side only', () => {
    const base = doc([task('a'), task('b')]);
    const ours = doc([task('a'), task('b')]);
    const theirs = doc([task('a')], 'note');
    expect(ids(mergeDailyDocument(base, ours, theirs).value)).toEqual(['a:in-progress']);
  });

  it('keeps an edit over a concurrent deletion', () => {
    const base = doc([task('a'), task('b')]);
    const ours = doc([task('a'), task('b', 'done')]);
    const theirs = doc([task('a')], 'x');
    expect(ids(mergeDailyDocument(base, ours, theirs).value)).toEqual(['a:in-progress', 'b:done']);
  });

  it('reports a conflict and keeps the incoming change when the same task changed on both', () => {
    const base = doc([task('a')]);
    const r = mergeDailyDocument(base, doc([task('a', 'done')]), doc([task('a', 'blocked')]));
    expect(ids(r.value)).toEqual(['a:blocked']);
    expect(r.conflicts).toHaveLength(1);
  });

  it('unions two independent rollovers of the same new day without duplicates', () => {
    // Both devices created today's note (no common base) carrying the same task
    const ours = doc([{ ...task('a'), historyLog: [{ id: 'h1', timestamp: 't1', date: 'd', action: 'carried_forward', details: '' }] }]);
    const theirs = doc([{ ...task('a'), historyLog: [{ id: 'h2', timestamp: 't2', date: 'd', action: 'carried_forward', details: '' }] }, task('n')]);
    const r = mergeDailyDocument(null, ours, theirs);
    expect(ids(r.value)).toEqual(['a:in-progress', 'n:in-progress']);
  });

  it('keeps both versions of notes text edited on two devices', () => {
    const base = doc([], 'start');
    const r = mergeDailyDocument(base, doc([], 'start + server'), doc([], 'start + phone'));
    expect(r.value!.headings[0].notesContent).toBe(`start + server${CONFLICT_SEPARATOR}start + phone`);
    expect(r.conflicts).toHaveLength(1);
  });

  it('keeps a document modified on one side over a deletion on the other', () => {
    const base = doc([task('a')]);
    expect(mergeDailyDocument(base, null, doc([task('a', 'done')])).value).not.toBeNull();
    expect(mergeDailyDocument(base, base, null).value).toBeNull();
  });
});

describe('mergeStandaloneNote', () => {
  const note = (content: string, title = 'Ideas'): StandaloneNote => ({
    id: 'n1',
    title,
    folder: 'General',
    content,
    tags: [],
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-20T00:00:00Z',
  });

  it('saves a conflict copy when content diverged', () => {
    const r = mergeStandaloneNote(note('v1'), note('server'), note('phone'), () => 'copy-1');
    expect(r.value!.content).toBe('server');
    expect(r.extraNotes).toEqual([expect.objectContaining({ id: 'copy-1', content: 'phone', title: 'Ideas (conflict copy)' })]);
    expect(r.conflicts).toHaveLength(1);
  });

  it('lets the incoming metadata win when content is identical', () => {
    const r = mergeStandaloneNote(note('v1'), note('same', 'A'), note('same', 'B'));
    expect(r.value!.title).toBe('B');
    expect(r.extraNotes).toBeUndefined();
  });

  it.each([['rename', 'Code/Java'], ['move', 'Projects/Java'], ['delete-folder', 'Tech']])('merges %s with an independent content edit in either direction', (_action, folder) => {
    const base = { ...note('original', 'Streams'), folder: 'Tech/Java' };
    const relocated = { ...base, folder, updatedAt: '2026-10-22T00:00:00Z' };
    const edited = { ...base, content: 'phone edit', updatedAt: '2026-10-21T00:00:00Z' };
    for (const [ours, theirs] of [[relocated, edited], [edited, relocated]]) {
      const result = mergeStandaloneNote(base, ours, theirs);
      expect(result.value).toMatchObject({ folder, content: 'phone edit', updatedAt: relocated.updatedAt });
      expect(result.extraNotes).toBeUndefined();
      expect(result.conflicts).toEqual([]);
    }
  });

  it.each([
    ['2026-10-22T00:00:00Z', '2026-10-21T00:00:00Z', 'Code'],
    ['2026-10-21T00:00:00Z', '2026-10-22T00:00:00Z', 'Projects'],
    ['2026-10-22T00:00:00Z', '2026-10-22T00:00:00Z', 'Projects'],
  ])('resolves competing folders by timestamps, incoming on ties (%s, %s)', (oursAt, theirsAt, folder) => {
    const base = note('original');
    const result = mergeStandaloneNote(base, { ...base, folder: 'Code', updatedAt: oursAt }, { ...base, folder: 'Projects', updatedAt: theirsAt });
    expect(result.value?.folder).toBe(folder);
    expect(result.extraNotes).toBeUndefined();
  });

  it('merges independent metadata and resolves competing metadata by the newer timestamp', () => {
    const base = note('original');
    const result = mergeStandaloneNote(base,
      { ...base, title: 'Desktop', pinned: true, updatedAt: '2026-10-22T00:00:00Z' },
      { ...base, title: 'Phone', tags: ['java'], updatedAt: '2026-10-21T00:00:00Z' });
    expect(result.value).toMatchObject({ title: 'Desktop', tags: ['java'], pinned: true });
    expect(result.conflicts).toEqual([]);
  });

  it('combines a title rename with a content edit', () => {
    const base = note('original');
    const result = mergeStandaloneNote(base, { ...base, title: 'Streams' }, { ...base, content: 'edited' });
    expect(result.value).toMatchObject({ title: 'Streams', content: 'edited' });
    expect(result.extraNotes).toBeUndefined();
  });

  it('keeps no-base conflict and incoming metadata behavior unchanged', () => {
    expect(mergeStandaloneNote(null, note('ours'), note('theirs'), () => 'copy').extraNotes?.[0].content).toBe('theirs');
    expect(mergeStandaloneNote(null, { ...note('same', 'Ours'), updatedAt: '2026-10-23' }, note('same', 'Incoming')).value?.title).toBe('Incoming');
  });

  it('applies a delete from one side', () => {
    expect(mergeStandaloneNote(note('v1'), note('v1'), null).value).toBeNull();
  });
});

describe('settings and helpers', () => {
  it('settings: different fields changed on two devices both survive', () => {
    const base = toSyncedSettings(DEFAULT_SETTINGS);
    const ours = { ...base, agingThresholds: { ...base.agingThresholds, criticalDays: 9 } };
    const theirs = { ...base, appearance: { ...base.appearance!, theme: 'dark' as const } };
    const result = mergeSettings(base, ours, theirs);
    expect(result.value).toMatchObject({ agingThresholds: { criticalDays: 9 }, appearance: { theme: 'dark' } });
    expect(result.conflicts).toEqual([]);
  });

  it('settings: same field changed on both takes incoming and reports it', () => {
    const base = toSyncedSettings(DEFAULT_SETTINGS);
    const ours = { ...base, agingThresholds: { ...base.agingThresholds, criticalDays: 9 } };
    const theirs = { ...base, agingThresholds: { ...base.agingThresholds, criticalDays: 11 } };
    const result = mergeSettings(base, ours, theirs);
    expect(result.value?.agingThresholds.criticalDays).toBe(11);
    expect(result.conflicts).toEqual([expect.stringContaining('agingThresholds.criticalDays')]);
  });

  it('settings: a key missing on the incoming side is not a deletion', () => {
    const old = toSyncedSettings(DEFAULT_SETTINGS);
    const base = { ...old, alertDays: { tasks: 'weekdays', habits: 'all' } };
    const result = mergeSettings(base, base, old);
    expect(result.value).toHaveProperty('alertDays', { tasks: 'weekdays', habits: 'all' });
    expect(result.conflicts).toEqual([]);
    expect(mergeSettings(base, old, base).value).toHaveProperty('alertDays', base.alertDays);
    expect(mergeSettings(base, old, old).value).toHaveProperty('alertDays', base.alertDays);
  });

  it('settings: nested agingThresholds subfields merge independently', () => {
    const base = toSyncedSettings(DEFAULT_SETTINGS);
    const ours = { ...base, agingThresholds: { ...base.agingThresholds, criticalDays: 9 } };
    const theirs = { ...base, agingThresholds: { ...base.agingThresholds, attentionDays: 5 } };
    const result = mergeSettings(base, ours, theirs);
    expect(result.value?.agingThresholds).toEqual({ ...base.agingThresholds, criticalDays: 9, attentionDays: 5 });
    expect(result.conflicts).toEqual([]);
  });

  it('settings: nested appearance colors and alert days merge independently', () => {
    const base = { ...toSyncedSettings(DEFAULT_SETTINGS), alertDays: { tasks: 'all', habits: 'all' } };
    const ours = { ...base, appearance: { ...base.appearance!, light: { ...base.appearance!.light, accent: '#123456' } }, alertDays: { ...base.alertDays, tasks: 'weekdays' } };
    const theirs = { ...base, appearance: { ...base.appearance!, light: { ...base.appearance!.light, headerOpacity: 70 }, dark: { ...base.appearance!.dark, accent: '#abcdef' } }, alertDays: { ...base.alertDays, habits: 'weekdays' } };
    const result = mergeSettings(base, ours, theirs);
    expect(result.value).toMatchObject({ appearance: { light: { accent: '#123456', headerOpacity: 70 }, dark: { accent: '#abcdef' } }, alertDays: { tasks: 'weekdays', habits: 'weekdays' } });
    expect(result.conflicts).toEqual([]);
  });

  it('settings: missing nested keys keep the other side while arrays remain leaves', () => {
    const base = toSyncedSettings(DEFAULT_SETTINGS);
    const ours = { ...base, agingThresholds: { ...base.agingThresholds, statuses: ['blocked'] } };
    const theirs = { ...base, agingThresholds: { attentionDays: 5, statuses: ['waiting'] } };
    const result = mergeSettings(base, ours, theirs as never);
    expect(result.value?.agingThresholds).toEqual({ attentionDays: 5, criticalDays: 7, enabled: true, statuses: ['waiting'] });
    expect(result.conflicts).toEqual([expect.stringContaining('agingThresholds.statuses')]);
  });

  it('never syncs the device-local sync config or date override', () => {
    const synced = toSyncedSettings(DEFAULT_SETTINGS);
    expect(synced).not.toHaveProperty('syncConfig');
    expect(synced).not.toHaveProperty('simulatedToday');
  });

  it('takes the incoming settings on conflict', () => {
    const base = toSyncedSettings(DEFAULT_SETTINGS);
    const ours = { ...base, defaultHeadings: ['A'] };
    const theirs = { ...base, defaultHeadings: ['B'] };
    expect(mergeSettings(base, ours, theirs).value!.defaultHeadings).toEqual(['B']);
  });

  it('fresh device adopts server settings', () => {
    const server = toSyncedSettings({ ...DEFAULT_SETTINGS, defaultHeadings: ['Deep work', 'Admin'] });
    const r = mergeSettings(null, server, toSyncedSettings(DEFAULT_SETTINGS));
    expect(r.value?.defaultHeadings).toEqual(['Deep work', 'Admin']);
    expect(r.conflicts).toEqual(['This device now uses the settings from your other devices.']);
  });

  it('canonical JSON ignores key order and undefined fields', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: undefined } })).toBe(canonicalJson({ a: { d: 2 }, b: 1 }));
  });

  it('validates entity keys', () => {
    expect(isValidEntityKey('doc:2026-10-20')).toBe(true);
    expect(isValidEntityKey('note:note-123')).toBe(true);
    expect(isValidEntityKey('settings')).toBe(true);
    expect(isValidEntityKey('doc:../../etc')).toBe(false);
    expect(isValidEntityKey('__proto__')).toBe(false);
  });
});
