import { describe, expect, it } from 'vitest';
import { resolveNoteLink } from './noteLinks';

const note = (id: string, title: string, folder: string, updatedAt = '2026-11-13T00:00:00Z') => ({ id, title, folder, updatedAt });

describe('resolveNoteLink', () => {
  const bug = note('bug', 'Daymark - Refresh the open page after MCP changes', 'Daymark/Bugs');
  const notes = [note('a', 'Java Record', 'Learning-hub/Java'), bug];

  it('finds a note in a nested folder by title, ignoring case and surrounding spaces', () => {
    expect(resolveNoteLink(notes, 'Daymark - Refresh the open page after MCP changes')).toBe(bug);
    expect(resolveNoteLink(notes, '  daymark - refresh the open page after mcp changes ')).toBe(bug);
  });

  it('still finds the note after it moves to another folder', () => {
    expect(resolveNoteLink([{ ...bug, folder: 'Archive' }], bug.title)?.id).toBe('bug');
  });

  it('accepts a folder path and an alias', () => {
    expect(resolveNoteLink(notes, 'Daymark/Bugs/Daymark - Refresh the open page after MCP changes')).toBe(bug);
    expect(resolveNoteLink(notes, 'learning-hub/java/java record|records')?.id).toBe('a');
    expect(resolveNoteLink(notes, 'Java Record|see this')?.id).toBe('a');
  });

  it('treats a slash as part of the title when no folder matches', () => {
    expect(resolveNoteLink([note('io', 'Input/Output', 'Learning-hub')], 'Input/Output')?.id).toBe('io');
  });

  it('prefers the same folder, then the most recently updated note', () => {
    const twins = [note('old', 'Plan', 'Work', '2026-11-01T00:00:00Z'), note('new', 'Plan', 'Home', '2026-11-10T00:00:00Z')];
    expect(resolveNoteLink(twins, 'Plan')?.id).toBe('new');
    expect(resolveNoteLink(twins, 'Plan', 'Work')?.id).toBe('old');
  });

  it('returns undefined for a missing or empty link', () => {
    expect(resolveNoteLink(notes, 'Nope')).toBeUndefined();
    expect(resolveNoteLink(notes, '  ')).toBeUndefined();
  });
});
