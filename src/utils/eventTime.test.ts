import { describe, expect, it } from 'vitest';
import type { EventItem } from '../types/daymark';
import { eventEndInstant, formatEventSchedule, resolveEventTime } from './eventTime';
import { validateEvent } from './events';

const event = (overrides: Partial<EventItem> = {}): EventItem => ({
  id: 'event-1',
  title: 'Planning session',
  date: '2026-11-20',
  heading: 'Work',
  order: 1,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...overrides,
});

const timing = (localTime: string, timeZone: string, startInstant: string) => ({ localTime, timeZone, startInstant });

describe('resolveEventTime', () => {
  it('resolves a regular local time with an explicit IANA zone', () => {
    expect(resolveEventTime('2026-11-20', '15:00', 'Asia/Ho_Chi_Minh')).toEqual({
      kind: 'valid',
      instants: ['2026-11-20T08:00:00.000Z'],
    });
  });

  it('rejects a New York spring-forward gap', () => {
    expect(resolveEventTime('2026-03-08', '02:30', 'America/New_York').kind).toBe('invalid');
  });

  it('returns both New York fall-back occurrences in chronological order', () => {
    expect(resolveEventTime('2026-11-01', '01:30', 'America/New_York')).toEqual({
      kind: 'valid',
      instants: ['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z'],
    });
  });

  it('handles Lord Howe half-hour folds', () => {
    expect(resolveEventTime('2026-04-05', '01:45', 'Australia/Lord_Howe')).toEqual({
      kind: 'valid',
      instants: ['2026-04-04T14:45:00.000Z', '2026-04-04T15:15:00.000Z'],
    });
  });

  it('rejects the skipped calendar day in Pacific/Apia', () => {
    expect(resolveEventTime('2011-12-30', '12:00', 'Pacific/Apia').kind).toBe('invalid');
  });

  it.each([
    ['2026-02-30', '12:00', 'UTC'],
    ['2026-01-01', '24:00', 'UTC'],
    ['2026-01-01', '7:00', 'UTC'],
    ['2026-01-01', '12:00', 'Mars/Olympus'],
  ])('rejects invalid date, time or zone (%s %s %s)', (date, time, zone) => {
    expect(resolveEventTime(date, time, zone).kind).toBe('invalid');
  });

  it('formats the saved zone first and the device-local time second', () => {
    const scheduled = event({
      timing: timing('15:00', 'Asia/Ho_Chi_Minh', '2026-11-20T08:00:00.000Z'),
    });
    const formatted = formatEventSchedule(scheduled, 'Europe/London');
    expect(formatted.primary).toContain('15:00');
    expect(formatted.primary).toContain('Asia/Ho_Chi_Minh');
    expect(formatted.secondary).toContain('08:00');
    expect(formatted.secondary).toContain('Europe/London');
  });

  it('shows a device-local date when the converted time falls on another day', () => {
    const scheduled = event({
      date: '2026-11-20',
      timing: timing('00:30', 'Asia/Ho_Chi_Minh', '2026-11-19T17:30:00.000Z'),
    });
    const formatted = formatEventSchedule(scheduled, 'America/Los_Angeles');
    expect(formatted.secondary).toContain('2026-11-19');
    expect(formatted.secondary).toContain('America/Los_Angeles');
  });

  it('uses elapsed duration across a DST jump when deriving the end instant', () => {
    const scheduled = event({
      date: '2026-03-08',
      timing: timing('01:30', 'America/New_York', '2026-03-08T06:30:00.000Z'),
      durationMinutes: 120,
    });
    expect(eventEndInstant(scheduled)).toBe('2026-03-08T08:30:00.000Z');
    expect(formatEventSchedule(scheduled, 'America/New_York').primary).toContain('04:30');
  });

  it('shows both dates for a cross-midnight span', () => {
    const scheduled = event({
      date: '2026-11-20',
      timing: timing('23:00', 'UTC', '2026-11-20T23:00:00.000Z'),
      durationMinutes: 120,
    });
    expect(formatEventSchedule(scheduled, 'UTC').primary).toContain('2026-11-20 23:00–2026-11-21 01:00');
  });

  it('keeps the original-zone schedule when the device zone is invalid', () => {
    const scheduled = event({
      timing: timing('15:00', 'Asia/Ho_Chi_Minh', '2026-11-20T08:00:00.000Z'),
    });
    const formatted = formatEventSchedule(scheduled, 'No/Such_Zone');
    expect(formatted.primary).toContain('15:00');
    expect(formatted.primary).toContain('Asia/Ho_Chi_Minh');
    expect(formatted.secondary).toBeUndefined();
  });

  it('does not infer an end time when duration is absent', () => {
    expect(eventEndInstant(event({ timing: timing('15:00', 'Asia/Ho_Chi_Minh', '2026-11-20T08:00:00.000Z') }))).toBeUndefined();
  });

  it('resolves dates in years below 100 without applying Date.UTC year remapping', () => {
    expect(resolveEventTime('0099-02-03', '04:05', 'UTC')).toEqual({
      kind: 'valid',
      instants: ['0099-02-03T04:05:00.000Z'],
    });
  });

  it('preserves historical second-level time-zone offsets', () => {
    expect(resolveEventTime('1890-01-01', '12:00', 'Europe/Paris')).toEqual({
      kind: 'valid',
      instants: ['1890-01-01T11:50:39.000Z'],
    });
  });
});

describe('validateEvent timing contract', () => {
  it('accepts all four independent optional time/duration shapes', () => {
    expect(validateEvent(event())).toBe(true);
    expect(validateEvent(event({ durationMinutes: 90 }))).toBe(true);
    expect(validateEvent(event({ timing: timing('15:00', 'Asia/Ho_Chi_Minh', '2026-11-20T08:00:00.000Z') }))).toBe(true);
    expect(validateEvent(event({
      timing: timing('15:00', 'Asia/Ho_Chi_Minh', '2026-11-20T08:00:00.000Z'),
      durationMinutes: 90,
    }))).toBe(true);
  });

  it('requires positive safe whole-minute duration values', () => {
    for (const durationMinutes of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.POSITIVE_INFINITY]) {
      expect(validateEvent(event({ durationMinutes }))).toBe(false);
    }
  });

  it('rejects a duration whose elapsed end cannot fit the supported Date range', () => {
    expect(validateEvent(event({
      timing: timing('15:00', 'Asia/Ho_Chi_Minh', '2026-11-20T08:00:00.000Z'),
      durationMinutes: Number.MAX_SAFE_INTEGER,
    }))).toBe(false);
  });

  it('rejects a span end outside the supported four-digit calendar years', () => {
    const boundaryEvent = event({
      date: '9999-12-31',
      timing: timing('23:59', 'UTC', '9999-12-31T23:59:00.000Z'),
      durationMinutes: 1,
    });
    expect(eventEndInstant(boundaryEvent)).toBeUndefined();
    expect(validateEvent(boundaryEvent)).toBe(false);
  });

  it('rejects blank titles, impossible dates and invalid time fields', () => {
    expect(validateEvent(event({ title: '  \n' }))).toBe(false);
    expect(validateEvent(event({ date: '2026-02-30' }))).toBe(false);
    expect(validateEvent(event({ timing: timing('25:00', 'UTC', '2026-11-20T00:00:00.000Z') }))).toBe(false);
    expect(validateEvent(event({ timing: timing('15:00', 'No/Such_Zone', '2026-11-20T08:00:00.000Z') }))).toBe(false);
    expect(validateEvent(event({ timing: timing('15:00', 'Asia/Ho_Chi_Minh', '2026-11-20T09:00:00.000Z') }))).toBe(false);
    expect(validateEvent(event({ timing: timing('02:30', 'America/New_York', '2026-03-08T07:30:00.000Z'), date: '2026-03-08' }))).toBe(false);
  });

  it('rejects non-object values and duplicate identity fields that are missing', () => {
    expect(validateEvent(null)).toBe(false);
    expect(validateEvent({ ...event(), id: '' })).toBe(false);
    expect(validateEvent({ ...event(), heading: '' })).toBe(false);
  });

  it('rejects duplicate checklist IDs', () => {
    expect(validateEvent(event({ checklist: [
      { id: 'same', text: 'First', done: false },
      { id: 'same', text: 'Second', done: true },
    ] }))).toBe(false);
  });
});

