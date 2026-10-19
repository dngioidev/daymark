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
