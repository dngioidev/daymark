import { describe, expect, it } from 'vitest';
import { BacklogData, Habit, HabitDay, NoteMeta, StandaloneNote } from '../types/daymark';
import { mergeEntity } from './merge';

const now = Date.parse('2026-10-30T12:00:00Z');
const past = '2026-10-29T12:00:00Z';
const minute = '2026-10-30T12:01:00Z';
const later = '2026-10-30T12:02:00Z';
const future = '2027-10-30T12:00:00Z';

const backlog = (title: string, updatedAt: string): BacklogData => ({
  items: [{ id: 'a', title, order: 1, createdAt: past, updatedAt }],
});
const habits = (name: string, updatedAt: string): { habits: Habit[] } => ({
  habits: [{ id: 'a', name, order: 1, warnAfterDays: 3, addedOn: '2026-10-29', updatedAt }],
});
const day = (done: boolean, at: string): HabitDay => ({ date: '2026-10-30', ticks: { a: { done, at } } });
const folders = (removed: boolean, updatedAt: string): NoteMeta => ({ folders: [{ path: 'Work', removed, updatedAt }], dismissed: [] });
const dismissed = (restored: boolean, at: string): NoteMeta => ({ folders: [], dismissed: [{ key: 'a|b', restored, at }] });
const note = (title: string, updatedAt: string): StandaloneNote => ({
  id: 'a', title, folder: '', content: 'Unchanged content', tags: [], createdAt: past, updatedAt,
});

// Each fixture exercises a separate winner comparison through the public dispatcher.
const cases = [
  { name: 'backlog conflict', key: 'backlog', base: backlog('Base', past), edit: (incoming: boolean, at: string) => backlog(incoming ? 'B' : 'A', at), conflict: true },
  { name: 'habit conflict', key: 'habits', base: habits('Base', past), edit: (incoming: boolean, at: string) => habits(incoming ? 'B' : 'A', at), conflict: true },
  { name: 'habit tick', key: 'habitday:2026-10-30', base: day(false, past), edit: (incoming: boolean, at: string) => day(incoming, at) },
  { name: 'folder tombstone', key: 'notemeta', base: folders(false, past), edit: (incoming: boolean, at: string) => folders(!incoming, at) },
  { name: 'dismissed pair', key: 'notemeta', base: dismissed(false, past), edit: (incoming: boolean, at: string) => dismissed(incoming, at) },
  { name: 'standalone note metadata', key: 'note:a', base: note('Base', past), edit: (incoming: boolean, at: string) => note(incoming ? 'B' : 'A', at) },
];

describe.each(cases)('clock protection: $name', ({ key, base, edit, conflict }) => {
  it('a device with a clock a year ahead does not win', () => {
    const a = edit(false, future);
    const b = edit(true, minute);
    const before = structuredClone({ base, a, b });
    const result = mergeEntity(key, base, a, b, now);
    expect(result.value).toEqual(b);
    if (conflict) expect(result.conflicts).toHaveLength(1);
    expect(mergeEntity(key, base, b, a, now).value).toEqual(b);
    expect({ base, a, b }).toEqual(before);
  });
  it('keeps newer wins within the window in either direction', () => {
    const a = edit(false, later);
    const b = edit(true, minute);
    expect(mergeEntity(key, base, a, b, now).value).toEqual(a);
    expect(mergeEntity(key, base, b, a, now).value).toEqual(a);
  });
  it.each([minute, future, 'garbage'])('keeps incoming on a comparison tie at %s', at => {
    const a = edit(false, at);
    const b = edit(true, at);
    expect(mergeEntity(key, base, a, b, now).value).toEqual(b);
  });
});
