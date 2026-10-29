import { describe, expect, it } from 'vitest';
import { StandaloneNote } from '../types/daymark';
import { notePreview, sortNotes } from './notes';

const note = (id: string, updatedAt: string, pinned = false): StandaloneNote => ({
  id,
  title: id,
  folder: 'General',
  content: '',
  tags: [],
  createdAt: updatedAt,
  updatedAt,
  pinned,
});

describe('notes helpers', () => {
  it('strips Markdown syntax from previews', () => {
    const md = '# Q4 Reading List\n\n- [ ] *Local-First Software* (Kleppmann)\n- [x] **Designing** [[Data]] [link](http://x)';
    expect(notePreview(md)).toBe('Q4 Reading List Local-First Software (Kleppmann) Designing Data link');
  });

  it('sorts pinned notes first, then newest', () => {
    const sorted = sortNotes([note('old', '2026-10-01'), note('pinned', '2026-09-01', true), note('new', '2026-10-10')]);
    expect(sorted.map((n) => n.id)).toEqual(['pinned', 'new', 'old']);
  });
});
