import { describe, expect, it } from 'vitest';
import { DailyDocument } from '../types/daymark';
import { SEED_DAILY_DOCUMENTS, SEED_STANDALONE_NOTES } from './defaultData';
import { isDailyDocument, isStandaloneNote, isSyncedSettings, vaultProblem } from './vaultValidation';
import { DEFAULT_SETTINGS } from './defaultData';

const day = (date: string): DailyDocument => ({ date, type: 'daily', headings: [], updatedAt: `${date}T00:00:00.000Z` });

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
  it('rejects a damaged note', () => expect(vaultProblem([], [{ id: 'n' }])).toMatch(/damaged/i));
  it('validates notes and settings', () => {
    expect(isStandaloneNote(SEED_STANDALONE_NOTES[0])).toBe(true);
    expect(isStandaloneNote({ id: 'a', title: 'b', content: 'c', folder: 'd' })).toBe(false);
    expect(isSyncedSettings(DEFAULT_SETTINGS)).toBe(true);
    expect(isSyncedSettings({ statuses: [] })).toBe(false);
    expect(isSyncedSettings(null)).toBe(false);
  });
});
