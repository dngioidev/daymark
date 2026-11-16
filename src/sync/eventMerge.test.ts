import { describe, expect, it } from 'vitest';
import type { EventItem } from '../types/daymark';
import { CONFLICT_SEPARATOR } from './merge';
import { mergeEvent } from './eventMerge';
import { validateEvent } from '../utils/events';

const base: EventItem = {
  id: 'event-1', title: 'Planning', date: '2026-11-15', heading: 'Work', order: 2,
  description: 'Bring notes', createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z',
  checklist: [{ id: 'agenda', text: 'Agenda', done: false }, { id: 'room', text: 'Book room', done: false }],
  timing: { localTime: '09:00', timeZone: 'America/New_York', startInstant: '2026-11-15T14:00:00.000Z' }, durationMinutes: 60,
};

describe('mergeEvent', () => {
  it('combines disjoint edits to one event', () => {
    const ours = { ...base, title: 'Planning and review' };
    const theirs = { ...base, heading: 'Personal' };
    expect(mergeEvent(base, ours, theirs).value).toMatchObject({ title: ours.title, heading: theirs.heading });
  });

  it('merges date, timing and duration as one atomic schedule', () => {
    const ours = { ...base, date: '2026-11-16', timing: undefined, durationMinutes: undefined };
    const theirs = { ...base, timing: { ...base.timing!, localTime: '10:00', startInstant: '2026-11-15T15:00:00.000Z' }, durationMinutes: 90 };
    const result = mergeEvent(base, ours, theirs);
    expect(result.value).toMatchObject({ date: base.date, timing: theirs.timing, durationMinutes: theirs.durationMinutes });
    expect(result.conflicts).toHaveLength(1);
    expect(validateEvent(result.value)).toBe(true);
  });

  it('merges checklist completion by stable item ID', () => {
    const ours = { ...base, checklist: base.checklist!.map(item => item.id === 'agenda' ? { ...item, done: true } : item) };
    const theirs = { ...base, checklist: base.checklist!.map(item => item.id === 'room' ? { ...item, done: true } : item) };
    expect(mergeEvent(base, ours, theirs).value?.checklist).toEqual([
      { id: 'agenda', text: 'Agenda', done: true }, { id: 'room', text: 'Book room', done: true },
    ]);
  });

  it('keeps both concurrently edited description texts with the standard separator', () => {
    const result = mergeEvent(base, { ...base, description: 'Bring paper notes' }, { ...base, description: 'Bring laptop notes' });
    expect(result.value?.description).toBe(`Bring paper notes${CONFLICT_SEPARATOR}Bring laptop notes`);
    expect(result.conflicts).toHaveLength(1);
  });

  it('reports a conflict when one device clears notes while the other edits them', () => {
    const result = mergeEvent(base, { ...base, description: undefined }, { ...base, description: 'Updated notes' });
    expect(result.value?.description).toBe(`${CONFLICT_SEPARATOR}Updated notes`);
    expect(result.conflicts).toHaveLength(1);
  });

  it('keeps an edited event when the other side deleted it and reports the conflict', () => {
    const result = mergeEvent(base, { ...base, title: 'Updated planning' }, null);
    expect(result.value?.title).toBe('Updated planning');
    expect(result.conflicts).toHaveLength(1);
  });

  it('keeps a deletion when the other side still has the unchanged base copy', () => {
    expect(mergeEvent(base, null, base)).toEqual({ value: null, conflicts: [] });
  });

  it('combines a move with an independent description edit on the same event', () => {
    const moved = { ...base, date: '2026-11-16', heading: 'Personal', order: 1,
      timing: { ...base.timing!, startInstant: '2026-11-16T14:00:00.000Z' } };
    const noted = { ...base, description: 'Bring updated notes' };
    const result = mergeEvent(base, moved, noted);
    expect(result.value).toMatchObject({ date: moved.date, heading: moved.heading, order: moved.order, description: noted.description });
    expect(validateEvent(result.value)).toBe(true);
  });
});
