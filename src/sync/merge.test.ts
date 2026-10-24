import { describe, expect, it } from 'vitest';
import { DailyDocument, Habit, HabitDay, StandaloneNote, TaskItem } from '../types/daymark';
import { DEFAULT_SETTINGS } from '../utils/defaultData';
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
  it('ties take theirs and null never deletes a day', () => {
    const ours = habitDay({ a: early });
    const theirs = habitDay({ a: { ...early, done: false } });
    expect(mergeEntity('habitday:2026-10-24', null, ours, theirs).value).toEqual(theirs);
    expect(mergeEntity('habitday:2026-10-24', ours, ours, null).value).toEqual(ours);
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

  it('applies a delete from one side', () => {
    expect(mergeStandaloneNote(note('v1'), note('v1'), null).value).toBeNull();
  });
});

describe('settings and helpers', () => {
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
