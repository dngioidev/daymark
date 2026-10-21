import { describe, expect, it, vi } from 'vitest';
import { isStandaloneNote } from './vaultValidation';
import { SEED_STANDALONE_NOTES } from './defaultData';
import { keepValid } from './vaultStore';

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
