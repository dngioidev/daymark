import { describe, expect, it, vi } from 'vitest';
import { isStandaloneNote } from './vaultValidation';
import { DEFAULT_SETTINGS, SEED_STANDALONE_NOTES } from './defaultData';
import { keepValid, parseVaultMessage } from './vaultStore';

describe('keepValid (load-time filter)', () => {
  it('returns the same array when nothing is dropped', () => {
    const notes: unknown[] = [...SEED_STANDALONE_NOTES];
    expect(keepValid(notes, isStandaloneNote, 'note')).toBe(notes);
  });

  it('drops damaged entries, keeps valid ones and reports the count', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const notes: unknown[] = [SEED_STANDALONE_NOTES[0], { foo: 1 }];
    const result = keepValid(notes, isStandaloneNote, 'note');
    expect(result).toEqual([SEED_STANDALONE_NOTES[0]]);
    expect(result).not.toBe(notes);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('1 damaged note'));
    spy.mockRestore();
  });
});

describe('parseVaultMessage (cross-tab messages)', () => {
  it('accepts arrays for docs and notes and objects for settings', () => {
    expect(parseVaultMessage({ key: 'daily_docs', value: [] })).toEqual({ key: 'daily_docs', value: [] });
    expect(parseVaultMessage({ key: 'notes', value: [] })).toEqual({ key: 'notes', value: [] });
    expect(parseVaultMessage({ key: 'settings', value: DEFAULT_SETTINGS })).toEqual({ key: 'settings', value: DEFAULT_SETTINGS });
  });

  it('ignores unknown keys and wrongly shaped values', () => {
    expect(parseVaultMessage({ key: 'sync_state', value: {} })).toBeNull();
    expect(parseVaultMessage({ key: 'daily_docs', value: {} })).toBeNull();
    expect(parseVaultMessage({ key: 'settings', value: [] })).toBeNull();
    expect(parseVaultMessage({ key: 'settings', value: {} })).toBeNull();
    expect(parseVaultMessage({ key: 'settings', value: null })).toBeNull();
    expect(parseVaultMessage(null)).toBeNull();
    expect(parseVaultMessage('x')).toBeNull();
  });
});
