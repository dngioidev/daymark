import { describe, expect, it } from 'vitest';
import type { EventItem } from '../types/daymark';
import { changeSpanMode, createEventDraft, resolveEventMove } from './eventDraft';

const foldedEvent: EventItem = {
  id: 'folded-event', title: 'Planning', date: '2026-10-31', heading: 'Work', order: 1,
  timing: { localTime: '01:45', timeZone: 'America/New_York', startInstant: '2026-10-31T05:45:00.000Z' },
  durationMinutes: 30, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('event draft schedule helpers', () => {
  it('requires an explicit occurrence when moving into a repeated local time', () => {
    const unresolved = resolveEventMove(foldedEvent, '2026-11-01');
    expect(unresolved).toEqual({ kind: 'choice', instants: ['2026-11-01T05:45:00.000Z', '2026-11-01T06:45:00.000Z'] });
    expect(resolveEventMove(foldedEvent, '2026-11-01', '2026-11-01T06:45:00.000Z')).toEqual({
      kind: 'ready', timing: { ...foldedEvent.timing, startInstant: '2026-11-01T06:45:00.000Z' },
    });
  });

  it('keeps a calculated repeated end-time occurrence when switching from duration mode', () => {
    const draft = {
      ...createEventDraft(null, '2026-11-01'), title: 'Planning', hasStartTime: true,
      localTime: '01:45', timeZone: 'America/New_York', startOccurrence: '2026-11-01T05:45:00.000Z',
      durationHours: '0', durationMinutes: '30',
    };
    const endMode = changeSpanMode(draft, 'end');
    expect(endMode.endDate).toBe('2026-11-01');
    expect(endMode.endTime).toBe('01:15');
    expect(endMode.endOccurrence).toBe('2026-11-01T06:15:00.000Z');
  });
});
