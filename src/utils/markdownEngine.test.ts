import { describe, expect, it } from 'vitest';
import { DailyDocument } from '../types/daymark';
import { parseDailyDocument, serializeDailyDocument } from './markdownEngine';

const sample: DailyDocument = {
  date: '2026-10-16',
  type: 'daily',
  updatedAt: '2026-10-16T00:00:00Z',
  headings: [
    {
      name: 'Work',
      notesContent: '',
      items: [
        {
          id: 'task-1',
          title: 'Write roadmap',
          status: 'in-progress',
          createdDate: '2026-10-14',
          originalNoteDate: '2026-10-14',
          carriedFromDate: '2026-10-15',
          heading: 'Work',
          order: 1,
          historyLog: [],
        },
      ],
    },
  ],
};

describe('markdown round trip', () => {
  it('preserves the daymark metadata comment', () => {
    const md = serializeDailyDocument(sample);
    expect(md).toContain('<!-- daymark:');
    expect(md).toContain('task_id=task-1');
  });

  it('parse(serialize(doc)) keeps task identity and provenance', () => {
    const parsed = parseDailyDocument(serializeDailyDocument(sample), sample.date);
    const item = parsed.headings.find((h) => h.name === 'Work')!.items[0];
    expect(item.id).toBe('task-1');
    expect(item.title).toBe('Write roadmap');
    expect(item.carriedFromDate).toBe('2026-10-15');
  });
});

describe('markdown parsing edge cases', () => {
  it('keeps section notes that follow tasks (full round trip)', () => {
    const doc: DailyDocument = JSON.parse(JSON.stringify(sample));
    doc.headings[0].notesContent = 'Priority today: ship it.\n\nSecond paragraph.';
    const parsed = parseDailyDocument(serializeDailyDocument(doc), doc.date);
    const work = parsed.headings.find((h) => h.name === 'Work')!;
    expect(work.items).toHaveLength(1);
    expect(work.notesContent).toBe('Priority today: ship it.\n\nSecond paragraph.');
  });

  it('parses an indented checklist as sub-items, not new tasks', () => {
    const doc: DailyDocument = JSON.parse(JSON.stringify(sample));
    doc.headings[0].items[0].checklist = [
      { id: 'c1', text: 'step one', done: true },
      { id: 'c2', text: 'step two', done: false },
    ];
    const parsed = parseDailyDocument(serializeDailyDocument(doc), doc.date);
    const items = parsed.headings.find((h) => h.name === 'Work')!.items;
    expect(items).toHaveLength(1);
    expect(items[0].checklist?.map((c) => [c.text, c.done])).toEqual([
      ['step one', true],
      ['step two', false],
    ]);
  });

  it('handles Windows line endings', () => {
    const md = serializeDailyDocument(sample).replace(/\n/g, '\r\n');
    const item = parseDailyDocument(md, sample.date).headings.find((h) => h.name === 'Work')!.items[0];
    expect(item.id).toBe('task-1');
    expect(item.title).toBe('Write roadmap');
  });

  it('parses plain Markdown checklists without metadata', () => {
    const parsed = parseDailyDocument('# Work\n\n- [ ] plain task\n- [x] finished task\n', '2026-10-16');
    const items = parsed.headings.find((h) => h.name === 'Work')!.items;
    expect(items.map((i) => [i.title, i.status])).toEqual([
      ['plain task', 'in-progress'],
      ['finished task', 'done'],
    ]);
  });

  it('returns default headings for empty input', () => {
    expect(parseDailyDocument('', '2026-10-16').headings.map((h) => h.name)).toEqual([
      'Work', 'Meetings', 'Ideas', 'Attention',
    ]);
  });

  it('keeps an explicitly written empty custom heading', () => {
    const parsed = parseDailyDocument('# Errands\n\n# Work\n', '2026-10-16');
    expect(parsed.headings.map((h) => h.name)).toContain('Errands');
  });
});
