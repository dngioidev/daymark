import { describe, expect, it } from 'vitest';
import type { EventItem } from '../types/daymark';
import { parseEvent, serializeEvent } from './eventMarkdown';

const event: EventItem = {
  id: 'event-2026-11-20-a',
  title: 'Launch [review]',
  date: '2026-11-20',
  heading: 'Work',
  order: 2,
  description: 'Notes before the fence.\n\n```md\n---\n[link](https://example.test)\n## Checklist\n**Date:** 2000-01-01\n# Heading\n<!-- daymark_event_notes:start -->\n\\<!-- daymark_event_notes:end -->\n\\\\<!-- daymark_event_checklist:start -->\n```\n\nAfter the fence.',
  checklist: [
    { id: 'check-a', text: 'Prepare [demo]\nwith a second line\n\n<!-- daymark_event_checklist:end -->\n\\<!-- daymark_event_notes:end -->\n\\\\<!-- daymark_event_checklist:start -->', done: true },
    { id: 'check-b', text: 'Collect feedback', done: false },
  ],
  timing: { localTime: '15:00', timeZone: 'Asia/Ho_Chi_Minh', startInstant: '2026-11-20T08:00:00.000Z' },
  durationMinutes: 90,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z',
};

describe('event Markdown', () => {
  it('round-trips readable schedule, multiline Markdown notes and checklist IDs/states', () => {
    const markdown = serializeEvent(event);
    expect(markdown).toContain('# Launch [review]');
    expect(markdown).toContain('**Date:** 2026-11-20');
    expect(markdown).toContain('Asia/Ho_Chi_Minh');
    expect(markdown).toContain('daymark_event: {"version":1');
    expect(markdown).not.toContain('<!-- daymark: task_id=');
    expect(parseEvent(markdown)).toEqual(event);
  });

  it('does not mistake Markdown headings, visible field labels or machine markers in notes for event structure', () => {
    const parsed = parseEvent(serializeEvent(event));
    expect(parsed.description).toBe(event.description);
    expect(parsed.description).toContain('## Checklist');
    expect(parsed.description).toContain('**Date:** 2000-01-01');
    expect(parsed.description).toContain('# Heading');
    expect(parsed.description).toContain('<!-- daymark_event_notes:start -->');
    expect(parsed.checklist?.[0].text).toBe(event.checklist?.[0].text);
  });

  it('uses readable notes and checklist changes instead of stale metadata copies', () => {
    const serialized = serializeEvent(event);
    const bodyIndex = serialized.lastIndexOf('After the fence.');
    const markdown = serialized.slice(0, bodyIndex).concat('Edited visible note.', serialized.slice(bodyIndex + 'After the fence.'.length))
      .replace('- [ ] Collect feedback', '- [x] Collect feedback');
    const parsed = parseEvent(markdown);
    expect(parsed.description).toContain('Edited visible note.');
    expect(parsed.checklist).toEqual([
      { id: 'check-a', text: event.checklist![0].text, done: true },
      { id: 'check-b', text: 'Collect feedback', done: true },
    ]);
  });

  it('accepts human edits to title, date, section, time and duration', () => {
    const markdown = serializeEvent(event)
      .replace('# Launch [review]', '# Launch review')
      .replace('**Date:** 2026-11-20', '**Date:** 2026-11-21')
      .replace('**Section:** Work', '**Section:** Meetings')
      .replace('**Time:** 15:00 (Asia/Ho_Chi_Minh)', '**Time:** 16:00 (Asia/Ho_Chi_Minh)')
      .replace('**Duration:** 90 minutes', '**Duration:** 120 minutes');
    const parsed = parseEvent(markdown);
    expect(parsed).toMatchObject({ title: 'Launch review', date: '2026-11-21', heading: 'Meetings', durationMinutes: 120 });
    expect(parsed.timing).toEqual({ localTime: '16:00', timeZone: 'Asia/Ho_Chi_Minh', startInstant: '2026-11-21T09:00:00.000Z' });
  });

  it('rejects unknown metadata versions and malformed event metadata', () => {
    const markdown = serializeEvent(event);
    expect(() => parseEvent(markdown.replace('"version":1', '"version":2'))).toThrow(/version/i);
    expect(() => parseEvent(markdown.replace('daymark_event: {"version":1', 'daymark_event: {"version":1,'))).toThrow(/frontmatter|metadata/i);
    expect(() => parseEvent('# no metadata')).toThrow(/frontmatter|metadata/i);
  });

  it('requires explicit selection when a human edit changes time into an ambiguous fold', () => {
    const markdown = serializeEvent(event)
      .replace('**Date:** 2026-11-20', '**Date:** 2026-11-01')
      .replace('**Time:** 15:00 (Asia/Ho_Chi_Minh)', '**Time:** 01:30 (America/New_York)');
    expect(() => parseEvent(markdown)).toThrow(/ambiguous|occurrence/i);
  });
});
