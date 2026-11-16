import { describe, expect, it } from 'vitest';
import type { EventItem } from '../types/daymark';
import { buildEventWeek } from './eventWeekProjection';

const item = (id: string, date: string, overrides: Partial<EventItem> = {}): EventItem => ({
  id, title: id, date, heading: 'Work', order: 1,
  createdAt: `${date}T00:00:00.000Z`, updatedAt: `${date}T00:00:00.000Z`,
  ...overrides,
});

const timed = (id: string, date: string, localTime: string, timeZone: string, startInstant: string, durationMinutes?: number): EventItem => item(id, date, {
  timing: { localTime, timeZone, startInstant }, ...(durationMinutes === undefined ? {} : { durationMinutes }),
});
const expectNoUnavailableOverlap = (day: { unavailableIntervals: { topMinutes: number; spanMinutes: number }[] }, segments: { topMinutes: number; spanMinutes: number }[]) => {
  for (const segment of segments) for (const unavailable of day.unavailableIntervals) {
    expect(segment.topMinutes + segment.spanMinutes <= unavailable.topMinutes ||
      segment.topMinutes >= unavailable.topMinutes + unavailable.spanMinutes).toBe(true);
  }
};

describe('buildEventWeek', () => {
  it('places a Saturday original-zone start on Sunday when it is Sunday in the device zone', () => {
    const saturday = timed('cross-zone', '2026-10-31', '23:30', 'America/Los_Angeles', '2026-11-01T06:30:00.000Z', 60);
    const week = buildEventWeek([saturday], '2026-11-01', 'Asia/Tokyo');
    expect(week.days.map(day => day.date)).toEqual([
      '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07',
    ]);
    expect(week.segments.map(segment => ({ date: segment.date, id: segment.event.id }))).toEqual([{ date: '2026-11-01', id: 'cross-zone' }]);
  });

  it('keeps a start-only event as a zero-span marker on its device-local date', () => {
    const event = timed('start-only', '2026-10-31', '23:30', 'America/Los_Angeles', '2026-11-01T06:30:00.000Z');
    const week = buildEventWeek([event], '2026-11-01', 'Asia/Tokyo');
    expect(week.segments).toHaveLength(1);
    expect(week.segments[0]).toMatchObject({ date: '2026-11-01', startOnly: true, spanMinutes: 0, continuesBefore: false, continuesAfter: false });
    expect(week.segments[0].endInstant).toBeUndefined();
  });

  it('groups date-only and duration-only entries in the untimed strip on their selected date', () => {
    const dateOnly = item('date-only', '2026-11-03');
    const durationOnly = item('duration-only', '2026-11-03', { durationMinutes: 45 });
    const week = buildEventWeek([dateOnly, durationOnly], '2026-11-01', 'America/New_York');
    expect(week.segments).toEqual([]);
    expect(week.untimedByDate['2026-11-03'].map(event => event.id)).toEqual(['date-only', 'duration-only']);
  });

  it('splits overnight and multi-day spans at device-local midnight and marks continuations', () => {
    const overnight = timed('overnight', '2026-11-02', '23:30', 'UTC', '2026-11-02T23:30:00.000Z', 120);
    const multiDay = timed('multi-day', '2026-11-03', '00:00', 'UTC', '2026-11-03T00:00:00.000Z', 6000);
    const week = buildEventWeek([overnight, multiDay], '2026-11-01', 'UTC');
    expect(week.segments.filter(segment => segment.event.id === 'overnight').map(segment => ({
      date: segment.date, continuesBefore: segment.continuesBefore, continuesAfter: segment.continuesAfter,
    }))).toEqual([
      { date: '2026-11-02', continuesBefore: false, continuesAfter: true },
      { date: '2026-11-03', continuesBefore: true, continuesAfter: false },
    ]);
    expect(week.segments.filter(segment => segment.event.id === 'multi-day').map(segment => segment.date)).toEqual([
      '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07',
    ]);
    expect(week.segments.filter(segment => segment.event.id === 'multi-day').at(-1)).toMatchObject({ continuesBefore: true, continuesAfter: false });
  });

  it('treats an end exactly at midnight as exclusive on the following day', () => {
    const event = timed('midnight-end', '2026-11-02', '23:00', 'UTC', '2026-11-02T23:00:00.000Z', 60);
    const week = buildEventWeek([event], '2026-11-01', 'UTC');
    expect(week.segments.map(segment => segment.date)).toEqual(['2026-11-02']);
    expect(week.segments[0]).toMatchObject({ spanMinutes: 60, continuesAfter: false });
    expect(week.segments[0].endInstant).toBe('2026-11-03T00:00:00.000Z');
  });

  it('clips event spans at both visible week edges and reports the hidden portions', () => {
    const before = timed('before-week', '2026-10-31', '23:30', 'UTC', '2026-10-31T23:30:00.000Z', 120);
    const after = timed('after-week', '2026-11-07', '23:00', 'UTC', '2026-11-07T23:00:00.000Z', 120);
    const week = buildEventWeek([before, after], '2026-11-01', 'UTC');
    const first = week.segments.find(segment => segment.event.id === before.id)!;
    const last = week.segments.find(segment => segment.event.id === after.id)!;
    expect(first).toMatchObject({ date: '2026-11-01', continuesBefore: true, continuesAfter: false, topMinutes: 0, spanMinutes: 90 });
    expect(last).toMatchObject({ date: '2026-11-07', continuesBefore: false, continuesAfter: true, topMinutes: 1380, spanMinutes: 60 });
    expect(first.spanMinutes + last.spanMinutes).toBe(150);
  });

  it('reprojects when the device zone changes without mutating source events', () => {
    const source = timed('immutable', '2026-11-02', '00:30', 'UTC', '2026-11-02T00:30:00.000Z', 45);
    const before = JSON.stringify(source);
    const utcWeek = buildEventWeek([source], '2026-11-01', 'UTC');
    const hawaiiWeek = buildEventWeek([source], '2026-11-01', 'Pacific/Honolulu');
    expect(utcWeek.segments[0].date).toBe('2026-11-02');
    expect(hawaiiWeek.segments[0].date).toBe('2026-11-01');
    expect(JSON.stringify(source)).toBe(before);
  });

  it('falls back to UTC for an invalid device zone without losing the source event', () => {
    const event = timed('invalid-device-zone', '2026-11-02', '10:00', 'America/New_York', '2026-11-02T15:00:00.000Z', 30);
    const week = buildEventWeek([event], '2026-11-01', 'Not/A_Zone');
    expect(week.zone).toBe('UTC');
    expect(week.segments).toHaveLength(1);
    expect(week.segments[0]).toMatchObject({ event, date: '2026-11-02', localLabel: expect.stringContaining('15:00') });
  });

  it('returns the current events on repeated builds for the same week and zone', () => {
    const oldEvent = item('old', '2026-11-02');
    const newEvent = item('new', '2026-11-02', { title: 'Edited current title' });
    const first = buildEventWeek([oldEvent], '2026-11-01', 'UTC');
    const second = buildEventWeek([newEvent], '2026-11-01', 'UTC');
    expect(first.untimedByDate['2026-11-02'].map(event => event.id)).toEqual(['old']);
    expect(second.untimedByDate['2026-11-02']).toEqual([newEvent]);
  });

  it('coalesces adjacent same-offset segments split only by an axis boundary', () => {
    const event = timed('ordinary-day', '2026-11-02', '00:30', 'America/New_York', '2026-11-02T05:30:00.000Z', 90);
    const week = buildEventWeek([event], '2026-11-01', 'America/New_York');
    expect(week.segments.filter(segment => segment.event.id === event.id)).toHaveLength(1);
    expect(week.segments.find(segment => segment.event.id === event.id)).toMatchObject({ topMinutes: 30, spanMinutes: 90 });
  });

  it('keeps the full source event in an explicit fallback when a historical second-level transition is not representable', () => {
    const event = timed('historical-second-transition', '1911-03-10', '23:40', 'UTC', '1911-03-10T23:40:00.000Z', 60);
    const week = buildEventWeek([event], '1911-03-10', 'Europe/Paris');
    expect(week.segments.filter(segment => segment.event.id === event.id)).toEqual([]);
    expect(week.fallbackEvents).toEqual([expect.objectContaining({
      event, reason: expect.stringMatching(/minute|transition|second/i),
    })]);
    expect(week.fallbackEvents[0].event.durationMinutes).toBe(60);
  });

  it('uses the exact week-start instant when midnight shifts by seconds at a date boundary', () => {
    const event = timed('partial-week-start', '1921-04-30', '22:20', 'UTC', '1921-04-30T22:20:00.000Z', 60);
    const week = buildEventWeek([event], '1921-05-01', 'Europe/Helsinki');
    expect(week.segments.filter(segment => segment.event.id === event.id)).toEqual([]);
    expect(week.fallbackEvents).toEqual([expect.objectContaining({
      event, reason: expect.stringMatching(/minute|transition|second/i),
    })]);
  });

  it('returns a readable no-throw fallback when the anchor is invalid or its week exceeds supported dates', () => {
    const source = item('valid-source-event', '2026-11-02');
    for (const anchor of ['not-a-date', '0001-01-01', '9999-12-31']) {
      const week = buildEventWeek([source], anchor, 'UTC');
      expect(week.fallbackReason).toMatch(/week|date|anchor/i);
      expect(week.days).toEqual([]);
      expect(week.fallbackEvents.map(entry => entry.event.id)).toContain(source.id);
    }
  });

  it('maps a New York spring-forward span around the unavailable clock gap', () => {
    const event = timed('spring-forward', '2026-03-08', '01:30', 'America/New_York', '2026-03-08T06:30:00.000Z', 60);
    const week = buildEventWeek([event], '2026-03-08', 'America/New_York');
    expect(week.totalMinutes).toBe(1440);
    const segments = week.segments.filter(segment => segment.event.id === event.id);
    expect(segments.reduce((sum, segment) => sum + segment.spanMinutes, 0)).toBe(60);
    expect(segments.map(segment => ({ top: segment.topMinutes, span: segment.spanMinutes })))
      .toEqual([{ top: 90, span: 30 }, { top: 180, span: 30 }]);
    expect(week.days[0].unavailableIntervals).toContainEqual(expect.objectContaining({ kind: 'gap', topMinutes: 120, spanMinutes: 60 }));
    expectNoUnavailableOverlap(week.days[0], segments);
  });

  it('inserts and maps both New York fall-back occurrences in the shared axis', () => {
    const event = timed('fall-fold', '2026-11-01', '01:30', 'America/New_York', '2026-11-01T05:30:00.000Z', 60);
    const week = buildEventWeek([event], '2026-11-01', 'America/New_York');
    expect(week.totalMinutes).toBe(1500);
    expect(week.axis).toContainEqual(expect.objectContaining({ wallStartMinute: 60, wallEndMinute: 120, occurrence: 2, spanMinutes: 60 }));
    const segments = week.segments.filter(segment => segment.event.id === event.id);
    expect(segments.reduce((sum, segment) => sum + segment.spanMinutes, 0)).toBe(60);
    expect(segments.map(segment => ({ top: segment.topMinutes, span: segment.spanMinutes })))
      .toEqual([{ top: 90, span: 30 }, { top: 120, span: 30 }]);
    expect(segments.map(segment => segment.localLabel).join(' ')).toContain('UTC-04:00');
    expect(segments.map(segment => segment.localLabel).join(' ')).toContain('UTC-05:00');
  });

  it('coalesces a second-occurrence block into the following base interval when the offset stays fixed', () => {
    const event = timed('second-fold-occurrence', '2026-11-01', '01:30', 'America/New_York', '2026-11-01T06:30:00.000Z', 90);
    const week = buildEventWeek([event], '2026-11-01', 'America/New_York');
    expect(week.segments.filter(segment => segment.event.id === event.id)).toHaveLength(1);
    expect(week.segments.find(segment => segment.event.id === event.id)).toMatchObject({
      topMinutes: 150, spanMinutes: 90, localLabel: expect.stringContaining('second occurrence'),
    });
  });

  it('leaves the repeated-hour band unavailable on a normal day in a fall-back week', () => {
    const event = timed('normal-day-fall-week', '2026-11-02', '01:30', 'America/New_York', '2026-11-02T06:30:00.000Z', 60);
    const week = buildEventWeek([event], '2026-11-01', 'America/New_York');
    const day = week.days.find(entry => entry.date === '2026-11-02')!;
    expect(week.totalMinutes).toBe(1500);
    const segments = week.segments.filter(segment => segment.event.id === event.id);
    expect(segments.reduce((sum, segment) => sum + segment.spanMinutes, 0)).toBe(60);
    expect(segments.map(segment => ({ top: segment.topMinutes, span: segment.spanMinutes })))
      .toEqual([{ top: 90, span: 30 }, { top: 180, span: 30 }]);
    expect(day.unavailableIntervals).toContainEqual(expect.objectContaining({ kind: 'repeated', topMinutes: 120, spanMinutes: 60 }));
    expectNoUnavailableOverlap(day, segments);
  });

  it('inserts a 30-minute repeated band for Lord Howe and represents Apia’s skipped date', () => {
    const lordHowe = timed('lord-howe-fold', '2026-04-05', '01:45', 'Australia/Lord_Howe', '2026-04-04T14:45:00.000Z', 30);
    const foldWeek = buildEventWeek([lordHowe], '2026-04-05', 'Australia/Lord_Howe');
    expect(foldWeek.totalMinutes).toBe(1470);
    expect(foldWeek.axis).toContainEqual(expect.objectContaining({ wallStartMinute: 90, wallEndMinute: 120, occurrence: 2, spanMinutes: 30 }));
    const lordHoweSegments = foldWeek.segments.filter(segment => segment.event.id === lordHowe.id);
    expect(lordHoweSegments.reduce((sum, segment) => sum + segment.spanMinutes, 0)).toBe(30);
    expect(lordHoweSegments.map(segment => ({ top: segment.topMinutes, span: segment.spanMinutes })))
      .toEqual([{ top: 105, span: 15 }, { top: 120, span: 15 }]);

    const apiaUntimed = [item('apia-date-only', '2011-12-30'), item('apia-duration-only', '2011-12-30', { durationMinutes: 30 })];
    const apiaWeek = buildEventWeek(apiaUntimed, '2011-12-30', 'Pacific/Apia');
    const skippedDay = apiaWeek.days.find(day => day.date === '2011-12-30');
    expect(apiaWeek.weekStart).toBe('2011-12-25');
    expect(apiaWeek.days.map(day => day.date)).toEqual([
      '2011-12-25', '2011-12-26', '2011-12-27', '2011-12-28', '2011-12-29', '2011-12-30', '2011-12-31',
    ]);
    expect(skippedDay?.unavailableIntervals).toContainEqual(expect.objectContaining({ kind: 'skipped-date', topMinutes: 0, spanMinutes: apiaWeek.totalMinutes }));
    expect(apiaWeek.untimedByDate['2011-12-30'].map(event => event.id)).toEqual(['apia-date-only', 'apia-duration-only']);
    expect(apiaWeek.segments).toEqual([]);
  });
});
