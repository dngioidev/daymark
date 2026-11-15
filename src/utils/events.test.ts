import { describe, expect, it } from 'vitest';
import type { EventItem, TaskItem } from '../types/daymark';
import { eventsForDate, mixedSectionItems, nextEventOrder, removeEvent, upsertEvent, validateEvent } from './events';

const event = (id: string, order: number, date = '2026-11-20', overrides: Partial<EventItem> = {}): EventItem => ({
  id,
  title: `Event ${id}`,
  date,
  heading: 'Work',
  order,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...overrides,
});

const task = (id: string, order: number): TaskItem => ({
  id,
  title: `Task ${id}`,
  status: 'in-progress',
  createdDate: '2026-11-20',
  originalNoteDate: '2026-11-20',
  heading: 'Work',
  order,
  historyLog: [],
});

describe('event domain helpers', () => {
  it('validates date-only, duration-only, start-only, and scheduled spans', () => {
    expect(validateEvent(event('date-only', 1))).toBe(true);
    expect(validateEvent(event('duration-only', 1, '2026-11-20', { durationMinutes: 45 }))).toBe(true);
    const timed = { localTime: '15:00', timeZone: 'Asia/Ho_Chi_Minh', startInstant: '2026-11-20T08:00:00.000Z' };
    expect(validateEvent(event('start-only', 1, '2026-11-20', { timing: timed }))).toBe(true);
    expect(validateEvent(event('scheduled-span', 1, '2026-11-20', { timing: timed, durationMinutes: 45 }))).toBe(true);
  });

  it('returns only events with the requested original date', () => {
    const events = [
      event('a', 1),
      event('b', 2, '2026-11-21'),
      event('c', 3),
      event('span', 4, '2026-11-20', {
        timing: { localTime: '23:00', timeZone: 'UTC', startInstant: '2026-11-20T23:00:00.000Z' },
        durationMinutes: 120,
      }),
      event('midnight-end', 5, '2026-11-20', {
        timing: { localTime: '22:00', timeZone: 'UTC', startInstant: '2026-11-20T22:00:00.000Z' },
        durationMinutes: 120,
      }),
    ];
    expect(eventsForDate(events, '2026-11-20').map(({ id }) => id)).toEqual(['a', 'c', 'span', 'midnight-end']);
    expect(eventsForDate(events, '2026-11-21').map(({ id }) => id)).toEqual(['b', 'span']);
    expect(eventsForDate(events, '2026-11-22')).toEqual([]);
  });

  it('includes an occupied date even when its noon is a DST gap', () => {
    const span = event('khartoum-span', 1, '2000-01-14', {
      timing: { localTime: '23:00', timeZone: 'Africa/Khartoum', startInstant: '2000-01-14T21:00:00.000Z' },
      durationMinutes: 1500,
    });
    expect(eventsForDate([span], '2000-01-15')).toEqual([span]);
  });

  it('does not project a span onto a skipped whole local date', () => {
    const span = event('apia-span', 1, '2011-12-29', {
      timing: { localTime: '12:00', timeZone: 'Pacific/Apia', startInstant: '2011-12-29T22:00:00.000Z' },
      durationMinutes: 2880,
    });
    expect(eventsForDate([span], '2011-12-30')).toEqual([]);
  });

  it('upserts by ID exactly once without mutating the source list', () => {
    const first = event('same', 1, '2026-11-20', { title: 'First' });
    const replacement = event('same', 3, '2026-11-21', { title: 'Updated' });
    const untouched = event('other', 2);
    const duplicate = event('same', 4, '2026-11-20', { title: 'Duplicate stale copy' });
    const original = [first, duplicate, untouched];
    const result = upsertEvent(original, replacement);

    expect(result).toEqual([replacement, untouched]);
    expect(result.filter(({ id }) => id === 'same')).toHaveLength(1);
    expect(original).toEqual([first, duplicate, untouched]);
    expect(original[0]).toBe(first);
  });

  it('appends new IDs and returns an independent array', () => {
    const original = [event('existing', 1)];
    const added = event('new', 2);
    const result = upsertEvent(original, added);
    expect(result).toEqual([original[0], added]);
    expect(result).not.toBe(original);
  });

  it('removes only the matching event without mutating the source list', () => {
    const first = event('remove', 1);
    const keep = event('keep', 2);
    const duplicate = event('remove', 3);
    const original = [first, duplicate, keep];
    expect(removeEvent(original, 'remove')).toEqual([keep]);
    expect(original).toEqual([first, duplicate, keep]);
    expect(removeEvent(original, 'missing')).toEqual(original);
  });

  it('mixes task and event rows by order with a stable ID tie-break', () => {
    const items = mixedSectionItems(
      [task('task-b', 2), task('task-a', 2), task('task-last', 4)],
      [event('event-a', 2), event('event-first', 1)],
    );
    expect(items.map(({ kind, item }) => `${kind}:${item.id}`)).toEqual([
      'event:event-first',
      'event:event-a',
      'task:task-a',
      'task:task-b',
      'task:task-last',
    ]);
  });

  it('supports an event-only heading without fabricating task rows or renumbering tasks', () => {
    const onlyEvent = event('only-event', 1);
    expect(mixedSectionItems([], [onlyEvent])).toEqual([{ kind: 'event', item: onlyEvent }]);
    const existingTasks = [task('kept', 9)];
    mixedSectionItems(existingTasks, [event('new-event', 9)]);
    expect(existingTasks[0].order).toBe(9);
  });

  it('appends after the last task and event order within a section', () => {
    const docs = [{ date: '2026-11-20', type: 'daily' as const, updatedAt: '', headings: [{ name: 'Work', items: [task('one', 3), { ...task('backlog', 11), movedToBacklogDate: '2026-11-20' }] }] }];
    expect(nextEventOrder(docs, [event('older', 7)], '2026-11-20', 'work')).toBe(8);
    expect(nextEventOrder(docs, [], '2026-11-20', 'Personal')).toBe(1);
  });
});


