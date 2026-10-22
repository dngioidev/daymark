import { describe, expect, it } from 'vitest';
import { NOTE_TEMPLATES, wordCount } from './noteTemplates';

describe('built-in note templates', () => {
  it('offers the specified templates and suggested folders in order', () => {
    expect(NOTE_TEMPLATES.map((t) => t.id)).toEqual(['blank', 'meeting', 'daily-review', 'adr']);
    expect(NOTE_TEMPLATES.map((t) => t.label)).toEqual(['Blank', 'Meeting', 'Daily review', 'Decision record']);
    expect(NOTE_TEMPLATES.map((t) => t.folder)).toEqual([null, 'Meetings', 'Personal', 'Technical']);
  });
  it('creates plain Markdown starters', () => {
    expect(NOTE_TEMPLATES[0].body('2026-10-22')).toBe('');
    expect(NOTE_TEMPLATES[0].title('2026-10-22')).toBe('Untitled');
    expect(NOTE_TEMPLATES[1].body('2026-10-22')).toContain('## Attendees');
    expect(NOTE_TEMPLATES[2].title('2026-10-22')).toContain('Daily review');
    expect(NOTE_TEMPLATES[3].body('2026-10-22')).toMatch(/## Context[\s\S]*## Decision[\s\S]*## Consequences/);
  });
});

describe('wordCount', () => {
  it('counts words without Markdown markers', () => {
    expect(wordCount('# Hi there\n- [ ] one two')).toBe(4);
    expect(wordCount('  \n')).toBe(0);
    expect(wordCount('## \n- [ ] \n---')).toBe(0);
    expect(wordCount('**Hello** [world](https://example.com) <!-- hidden metadata -->')).toBe(2);
    expect(wordCount('```ts\nconst answer = 42;\n```')).toBe(3);
  });
});
