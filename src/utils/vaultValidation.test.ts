import { describe, expect, it } from 'vitest';
import { DailyDocument } from '../types/daymark';
import { DEFAULT_SETTINGS, SEED_DAILY_DOCUMENTS, SEED_STANDALONE_NOTES } from './defaultData';
import { isNoteFolder, isDismissedPair, isNoteMeta, isBacklogItem, isBacklogData, isDailyDocument, isHabitData, isStandaloneNote, isSyncedSettings, vaultProblem } from './vaultValidation';

const day = (date: string): DailyDocument => ({ date, type: 'daily', headings: [], updatedAt: `${date}T00:00:00.000Z` });

const folder = { path: 'Tech/Java', updatedAt: 'now' };
const pair = { key: 'a|b', at: 'now' };
describe('note metadata validation', () => {
  it('accepts empty data, folders, dismissed pairs and tombstones', () => {
    expect(isNoteMeta({ folders: [], dismissed: [] })).toBe(true);
    expect(isNoteFolder({ ...folder, removed: true })).toBe(true);
    expect(isDismissedPair({ ...pair, restored: false })).toBe(true);
    expect(isNoteMeta({ folders: [folder], dismissed: [pair] })).toBe(true);
  });
  it.each([null, [], {}, { folders: [], dismissed: null }, { folders: null, dismissed: [] },
    ...[{ path: 1 }, { updatedAt: null }, { removed: 'yes' }].map(change => ({ folders: [{ ...folder, ...change }], dismissed: [] })),
    ...[{ key: 1 }, { at: null }, { restored: 'yes' }].map(change => ({ folders: [], dismissed: [{ ...pair, ...change }] })),
    { folders: [null], dismissed: [] }, { folders: [], dismissed: [null] },
  ].map(value => [value]))('rejects damaged metadata: %j', value => expect(isNoteMeta(value)).toBe(false));
});

const habit = { id: 'h1', name: 'Read', order: 0, warnAfterDays: 3, addedOn: '2026-10-24', updatedAt: '2026-10-24T10:00:00Z' };
const habitDay = { date: '2026-10-24', ticks: { h1: { done: false, at: '2026-10-24T10:00:00Z' } } };

const backlogItem = { id: 'idea', title: 'Build it', order: 1, createdAt: 'now', updatedAt: 'now' };
describe('backlog validation', () => {
  it('accepts empty data, full metadata and tombstones', () => {
    expect(isBacklogData({ items: [] })).toBe(true);
    expect(isBacklogItem({ ...backlogItem, description: 'Details', category: 'Ideas', status: 'custom', tags: ['tag'],
      checklist: [{ id: 'c', text: 'Step', done: false }],
      historyLog: [{ id: 'h', timestamp: 'now', date: '2026-10-26', action: 'moved', details: 'Moved' }],
      pickedOn: '2026-10-27', deletedAt: 'now' })).toBe(true);
  });
  it.each([null, [], {}, { items: null }, { items: [null] },
    ...[{ id: 2 }, { title: null }, { order: NaN }, { order: Infinity }, { order: '1' }, { createdAt: null },
      { updatedAt: 2 }, { category: 2 }, { description: null }, { status: false }, { pickedOn: 'tomorrow' },
      { deletedAt: false }, { tags: [2] }, { checklist: [{}] }, { checklist: [{ id: 'c', text: 'x', done: 'yes' }] },
      { historyLog: [{}] }, { historyLog: [{ id: 'h', timestamp: 'now', date: '2026-10-26', action: 'unknown', details: 'x' }] },
    ].map(patch => ({ items: [{ ...backlogItem, ...patch }] })),
  ].map(value => [value]))('rejects damaged backlog: %j', value => expect(isBacklogData(value)).toBe(false));
});

describe('isHabitData', () => {
  it('accepts empty data, tombstones and explicit unticks', () => {
    expect(isHabitData({ habits: [], days: [] })).toBe(true);
    expect(isHabitData({ habits: [{ ...habit, removedOn: '2026-10-25' }], days: [habitDay] })).toBe(true);
  });

  it.each([null, [], {}, { habits: [], days: {} }, { habits: [null], days: [] },
    ...[{ id: 1 }, { name: null }, { order: '0' }, { order: NaN }, { warnAfterDays: 0 },
      { warnAfterDays: 366 }, { warnAfterDays: 1.5 }, { updatedAt: null }].map((change) => ({ habits: [{ ...habit, ...change }], days: [] })),
    ...[null, { ...habitDay, ticks: [] }, { ...habitDay, ticks: { h1: { done: 'yes', at: 'now' } } },
      { ...habitDay, ticks: { h1: { done: true, at: null } } }].map((value) => ({ habits: [habit], days: [value] })),
  ].map((value) => [value]))('rejects damaged data: %j', (value) => expect(isHabitData(value)).toBe(false));

  it.each(['addedOn', 'removedOn'] as const)('rejects malformed %s dates (R4)', (field) => {
    for (const value of ['yesterday', '', '2026-1-24', 20261024, null]) {
      expect(isHabitData({ habits: [{ ...habit, [field]: value }], days: [] })).toBe(false);
    }
  });

  it('rejects malformed day dates (R4)', () => {
    expect(isHabitData({ habits: [habit], days: [{ ...habitDay, date: 'yesterday' }] })).toBe(false);
  });
});

describe('vault validation', () => {
  it('accepts the sample vault', () => expect(vaultProblem(SEED_DAILY_DOCUMENTS, SEED_STANDALONE_NOTES)).toBeNull());
  it('rejects a day without headings', () => expect(vaultProblem([{ foo: 1 }], [])).toMatch(/damaged/i));
  it('rejects non-arrays', () => expect(vaultProblem('x', [])).not.toBeNull());
  it('rejects two copies of one day', () =>
    expect(vaultProblem([day('2026-10-20'), day('2026-10-20')], [])).toMatch(/twice/i));
  it('rejects a task without an id', () =>
    expect(
      isDailyDocument({ ...day('2026-10-20'), headings: [{ name: 'Work', items: [{ title: 'x' }] }] })
    ).toBe(false));
  it('checks removedTaskIds is a list of strings', () => {
    expect(isDailyDocument({ ...day('2026-10-20'), removedTaskIds: ['a'] })).toBe(true);
    expect(isDailyDocument({ ...day('2026-10-20'), removedTaskIds: 'a' })).toBe(false);
    expect(isDailyDocument({ ...day('2026-10-20'), removedTaskIds: [1] })).toBe(false);
  });
  it('rejects a damaged note', () => expect(vaultProblem([], [{ id: 'n' }])).toMatch(/damaged/i));
  it('validates notes and settings', () => {
    expect(isStandaloneNote(SEED_STANDALONE_NOTES[0])).toBe(true);
    expect(isStandaloneNote({ id: 'a', title: 'b', content: 'c', folder: 'd' })).toBe(false);
    expect(isSyncedSettings(DEFAULT_SETTINGS)).toBe(true);
    expect(isSyncedSettings({ statuses: [] })).toBe(false);
    expect(isSyncedSettings(null)).toBe(false);
  });
});
