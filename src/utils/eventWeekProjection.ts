import type { EventItem } from '../types/daymark';
import { eventEndInstant, eventZoneOffsetSeconds, eventZonedPartsAt, isValidEventDate } from './eventTime';
import { validateEvent } from './events';

export type EventWeekUnavailableKind = 'gap' | 'repeated' | 'skipped-date';

export interface EventWeekUnavailableInterval {
  kind: EventWeekUnavailableKind;
  topMinutes: number;
  spanMinutes: number;
  label: string;
}

export interface EventWeekDay {
  date: string;
  unavailableIntervals: EventWeekUnavailableInterval[];
}

export interface EventWeekAxisBand {
  key: string;
  wallStartMinute: number;
  wallEndMinute: number;
  occurrence: 1 | 2;
  topMinutes: number;
  spanMinutes: number;
  label: string;
  availableDates: string[];
}

export interface EventWeekSegment {
  key: string;
  event: EventItem;
  date: string;
  startInstant: string;
  endInstant?: string;
  topMinutes: number;
  spanMinutes: number;
  startOnly: boolean;
  continuesBefore: boolean;
  continuesAfter: boolean;
  localLabel: string;
}

export interface EventWeekModel {
  zone: string;
  weekStart: string;
  days: EventWeekDay[];
  axis: EventWeekAxisBand[];
  totalMinutes: number;
  segments: EventWeekSegment[];
  untimedByDate: Record<string, EventItem[]>;
  fallbackEvents: EventWeekFallback[];
  fallbackReason?: string;
}

export interface EventWeekFallback {
  event: EventItem;
  reason: string;
}

interface DayClock {
  date: string;
  zone: string;
  skippedDate: boolean;
  /** Candidate epoch millisecond values, in chronological occurrence order, for every wall minute. */
  minutes: number[][];
}

interface BandInstantRange {
  band: EventWeekAxisBand;
  startMs: number;
  endMs: number;
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const MAX_DAY_CLOCKS = 256;
const dayClockCache = new Map<string, DayClock>();
const dateBoundaryCache = new Map<string, number | null>();
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function civilEpoch(date: string, minute = 0): number | undefined {
  const match = DATE_RE.exec(date);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidEventDate(date) || !Number.isInteger(minute) || minute < 0 || minute > 1440) return undefined;
  const value = new Date(0);
  value.setUTCFullYear(year, month - 1, day);
  value.setUTCHours(0, minute, 0, 0);
  return value.getTime();
}

function civilDate(epochMs: number): string | undefined {
  const value = new Date(epochMs);
  const year = value.getUTCFullYear();
  if (year < 1 || year > 9999) return undefined;
  return `${String(year).padStart(4, '0')}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}

function civilWeek(anchor: string): { weekStart: string; dates: string[] } | undefined {
  const anchorMs = civilEpoch(anchor);
  if (anchorMs === undefined) return undefined;
  const firstMs = anchorMs - new Date(anchorMs).getUTCDay() * DAY_MS;
  const dates = Array.from({ length: 7 }, (_, index) => civilDate(firstMs + index * DAY_MS));
  if (dates.some((date): date is undefined => date === undefined)) return undefined;
  return { weekStart: dates[0]!, dates: dates as string[] };
}

function clockLabel(minute: number): string {
  if (minute === 1440) return '24:00';
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function rememberDayClock(clock: DayClock): DayClock {
  const key = `${clock.date}|${clock.zone}`;
  if (dayClockCache.size >= MAX_DAY_CLOCKS && !dayClockCache.has(key)) dayClockCache.delete(dayClockCache.keys().next().value as string);
  dayClockCache.set(key, clock);
  return clock;
}

function buildDayClock(date: string, zone: string): DayClock {
  const cacheKey = `${date}|${zone}`;
  const cached = dayClockCache.get(cacheKey);
  if (cached) return cached;

  const wallNoon = civilEpoch(date, 720)!;
  const offsets = new Set<number>();
  for (let deltaHours = -48; deltaHours <= 48; deltaHours += 3) {
    const offset = eventZoneOffsetSeconds(wallNoon + deltaHours * 60 * MINUTE_MS, zone);
    if (offset !== undefined) offsets.add(offset);
  }

  const minutes = Array.from({ length: 1440 }, () => [] as number[]);
  if (offsets.size > 0) {
    for (let minute = 0; minute < 1440; minute += 1) {
      const wallMs = wallNoon + (minute - 720) * MINUTE_MS;
      for (const offsetSeconds of offsets) {
        const candidate = wallMs - offsetSeconds * 1000;
        const parts = eventZonedPartsAt(candidate, zone);
        if (parts?.date === date && parts.hour * 60 + parts.minute === minute && parts.second === 0) minutes[minute].push(candidate);
      }
      minutes[minute] = [...new Set(minutes[minute])].sort((a, b) => a - b);
    }
  }

  const skippedDate = minutes.every(occurrences => occurrences.length === 0);
  return rememberDayClock({ date, zone, skippedDate, minutes });
}

function validZone(zone: string, anchor: string): boolean {
  const epoch = civilEpoch(anchor, 720);
  return epoch !== undefined && eventZoneOffsetSeconds(epoch, zone) !== undefined;
}

function findRuns(minutes: number[][], predicate: (occurrenceCount: number) => boolean): Array<{ start: number; end: number }> {
  const runs: Array<{ start: number; end: number }> = [];
  let start: number | undefined;
  for (let minute = 0; minute <= 1440; minute += 1) {
    const matches = minute < 1440 && predicate(minutes[minute].length);
    if (matches && start === undefined) start = minute;
    if (!matches && start !== undefined) {
      runs.push({ start, end: minute });
      start = undefined;
    }
  }
  return runs;
}

function buildAxis(clocks: DayClock[]): { axis: EventWeekAxisBand[]; totalMinutes: number } {
  const folds = clocks.flatMap(clock => findRuns(clock.minutes, count => count > 1));
  const boundaries = new Set<number>([0, 1440]);
  for (const clock of clocks) {
    for (const run of findRuns(clock.minutes, count => count === 0)) { boundaries.add(run.start); boundaries.add(run.end); }
    for (const run of findRuns(clock.minutes, count => count > 1)) { boundaries.add(run.start); boundaries.add(run.end); }
    for (let minute = 1; minute < 1440; minute += 1) {
      const current = clock.minutes[minute];
      const previous = clock.minutes[minute - 1];
      for (let occurrence = 0; occurrence < Math.min(current.length, previous.length); occurrence += 1) {
        if (current[occurrence] !== previous[occurrence] + MINUTE_MS) boundaries.add(minute);
      }
    }
  }
  const points = [...boundaries].sort((a, b) => a - b);
  const axis: EventWeekAxisBand[] = [];
  let topMinutes = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (end <= start) continue;
    const baseAvailable = (clock: DayClock) => clock.minutes.slice(start, end).every(occurrences => occurrences.length > 0);
    axis.push({
      key: `base:${start}-${end}`, wallStartMinute: start, wallEndMinute: end, occurrence: 1,
      topMinutes, spanMinutes: end - start, label: `${clockLabel(start)}–${clockLabel(end)}`,
      availableDates: clocks.filter(baseAvailable).map(clock => clock.date),
    });
    topMinutes += end - start;
    const repeatedHere = folds.some(run => run.start <= start && run.end >= end);
    if (repeatedHere) {
      const repeatedAvailable = (clock: DayClock) => clock.minutes.slice(start, end).every(occurrences => occurrences.length > 1);
      axis.push({
        key: `repeat:${start}-${end}`, wallStartMinute: start, wallEndMinute: end, occurrence: 2,
        topMinutes, spanMinutes: end - start, label: `${clockLabel(start)}–${clockLabel(end)} second occurrence`,
        availableDates: clocks.filter(repeatedAvailable).map(clock => clock.date),
      });
      topMinutes += end - start;
    }
  }
  return { axis, totalMinutes: topMinutes };
}

function dayUnavailableIntervals(clock: DayClock, axis: EventWeekAxisBand[]): EventWeekUnavailableInterval[] {
  return axis.flatMap(band => {
    if (band.availableDates.includes(clock.date)) return [];
    const kind: EventWeekUnavailableKind = clock.skippedDate ? 'skipped-date' : band.occurrence === 2 ? 'repeated' : 'gap';
    return [{ kind, topMinutes: band.topMinutes, spanMinutes: band.spanMinutes,
      label: kind === 'skipped-date' ? 'Calendar date does not exist in this time zone' : kind === 'repeated' ? 'Second occurrence unavailable on this date' : 'Clock skips forward' }];
  });
}

function bandInstantRange(clock: DayClock, band: EventWeekAxisBand): BandInstantRange | undefined {
  if (!band.availableDates.includes(clock.date)) return undefined;
  const occurrenceIndex = band.occurrence - 1;
  const { wallStartMinute, wallEndMinute } = band;
  const start = clock.minutes[wallStartMinute]?.[occurrenceIndex];
  if (start === undefined) return undefined;
  for (let minute = wallStartMinute; minute < wallEndMinute; minute += 1) {
    if (clock.minutes[minute]?.[occurrenceIndex] !== start + (minute - wallStartMinute) * MINUTE_MS) return undefined;
  }
  return { band, startMs: start, endMs: start + band.spanMinutes * MINUTE_MS };
}

function segmentLocalLabel(epochMs: number, zone: string, clock: DayClock, occurrence: 1 | 2): string {
  const parts = eventZonedPartsAt(epochMs, zone);
  if (!parts) return 'Local time unavailable';
  const minute = parts.hour * 60 + parts.minute;
  const repeated = clock.minutes[minute]?.length > 1;
  const occurrenceLabel = repeated ? `, ${occurrence === 1 ? 'first' : 'second'} occurrence` : '';
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')} ${parts.offsetLabel}${occurrenceLabel}`;
}

function eventSegments(event: EventItem, zone: string, clocks: DayClock[], axis: EventWeekAxisBand[]): EventWeekSegment[] {
  if (!event.timing) return [];
  const startMs = Date.parse(event.timing.startInstant);
  const endIso = eventEndInstant(event);
  if (!Number.isFinite(startMs)) return [];
  if (!endIso) {
    const startDate = eventZonedPartsAt(startMs, zone)?.date;
    const clock = clocks.find(day => day.date === startDate);
    if (!clock) return [];
    for (const band of axis) {
      const range = bandInstantRange(clock, band);
      if (!range || startMs < range.startMs || startMs >= range.endMs) continue;
      const topMinutes = band.topMinutes + (startMs - range.startMs) / MINUTE_MS;
      return [{
        key: `${event.id}:${clock.date}:${event.timing.startInstant}:${band.key}`,
        event, date: clock.date, startInstant: event.timing.startInstant, topMinutes, spanMinutes: 0, startOnly: true,
        continuesBefore: false, continuesAfter: false, localLabel: segmentLocalLabel(startMs, zone, clock, band.occurrence),
      }];
    }
    return [];
  }

  const endMs = Date.parse(endIso);
  if (!Number.isFinite(endMs) || endMs <= startMs) return [];
  const segments: EventWeekSegment[] = [];
  for (const clock of clocks) {
    for (const band of axis) {
      const range = bandInstantRange(clock, band);
      if (!range) continue;
      const clippedStart = Math.max(startMs, range.startMs);
      const clippedEnd = Math.min(endMs, range.endMs);
      if (clippedEnd <= clippedStart) continue;
      const startInstant = new Date(clippedStart).toISOString();
      const clippedEndInstant = new Date(clippedEnd).toISOString();
      segments.push({
        key: `${event.id}:${clock.date}:${startInstant}:${band.key}`,
        event, date: clock.date, startInstant, endInstant: clippedEndInstant,
        topMinutes: band.topMinutes + (clippedStart - range.startMs) / MINUTE_MS,
        spanMinutes: (clippedEnd - clippedStart) / MINUTE_MS,
        startOnly: false, continuesBefore: startMs < clippedStart, continuesAfter: endMs > clippedEnd,
        localLabel: segmentLocalLabel(clippedStart, zone, clock, band.occurrence),
      });
    }
  }
  return segments;
}

function coalesceSegments(segments: EventWeekSegment[], zone: string): EventWeekSegment[] {
  const result: EventWeekSegment[] = [];
  for (const current of segments) {
    const previous = result.at(-1);
    const previousOffset = previous ? eventZoneOffsetSeconds(Date.parse(previous.startInstant), zone) : undefined;
    const currentOffset = eventZoneOffsetSeconds(Date.parse(current.startInstant), zone);
    if (!previous || previous.event !== current.event || previous.date !== current.date || previous.startOnly || current.startOnly ||
        !previous.endInstant || previous.endInstant !== current.startInstant ||
        Math.abs(previous.topMinutes + previous.spanMinutes - current.topMinutes) > 1e-8 ||
        previousOffset === undefined || currentOffset === undefined || previousOffset !== currentOffset) {
      result.push(current);
      continue;
    }
    result[result.length - 1] = {
      ...previous,
      endInstant: current.endInstant,
      spanMinutes: previous.spanMinutes + current.spanMinutes,
      continuesAfter: current.continuesAfter,
    };
  }
  return result;
}

function firstInstantOnOrAfterDate(date: string, zone: string): number | undefined {
  const key = `${date}|${zone}`;
  const cached = dateBoundaryCache.get(key);
  if (cached !== undefined) return cached === null ? undefined : cached;
  const wallMidnight = civilEpoch(date);
  if (wallMidnight === undefined) return undefined;

  const offsets = new Set<number>();
  for (let deltaHours = -48; deltaHours <= 48; deltaHours += 3) {
    const offset = eventZoneOffsetSeconds(wallMidnight + deltaHours * 60 * MINUTE_MS, zone);
    if (offset !== undefined) offsets.add(offset);
  }
  const exactCandidates = [...offsets].map(offset => wallMidnight - offset * 1000).filter(candidate => {
    const currentDate = eventZonedPartsAt(candidate, zone)?.date;
    const previousDate = eventZonedPartsAt(candidate - 1000, zone)?.date;
    return !!currentDate && !!previousDate && currentDate >= date && previousDate < date;
  });
  if (exactCandidates.length) {
    const result = Math.min(...exactCandidates);
    if (dateBoundaryCache.size >= MAX_DAY_CLOCKS && !dateBoundaryCache.has(key)) dateBoundaryCache.delete(dateBoundaryCache.keys().next().value as string);
    dateBoundaryCache.set(key, result);
    return result;
  }

  // Rare midnight transitions may not be represented by a sampled offset; find the civil boundary directly.
  const searchStart = wallMidnight - 48 * 60 * MINUTE_MS;
  const searchEnd = wallMidnight + 48 * 60 * MINUTE_MS;
  const step = 5 * MINUTE_MS;
  let previousMs = searchStart;
  let previousDate = eventZonedPartsAt(previousMs, zone)?.date;
  for (let sampleMs = searchStart + step; sampleMs <= searchEnd; sampleMs += step) {
    const sampleDate = eventZonedPartsAt(sampleMs, zone)?.date;
    if (previousDate && sampleDate && previousDate < date && sampleDate >= date) {
      let low = previousMs;
      let high = sampleMs;
      while (high - low > 1000) {
        const middle = Math.floor((low + high) / 2000) * 1000;
        const middleDate = eventZonedPartsAt(middle, zone)?.date;
        if (middleDate && middleDate >= date) high = middle;
        else low = middle;
      }
      const result = Math.ceil(high / 1000) * 1000;
      if (dateBoundaryCache.size >= MAX_DAY_CLOCKS && !dateBoundaryCache.has(key)) dateBoundaryCache.delete(dateBoundaryCache.keys().next().value as string);
      dateBoundaryCache.set(key, result);
      return result;
    }
    previousMs = sampleMs;
    previousDate = sampleDate;
  }
  if (dateBoundaryCache.size >= MAX_DAY_CLOCKS && !dateBoundaryCache.has(key)) dateBoundaryCache.delete(dateBoundaryCache.keys().next().value as string);
  dateBoundaryCache.set(key, null);
  return undefined;
}

function visibleWeekBounds(weekStart: string, zone: string): { startMs: number; endMs: number } | undefined {
  const startMs = firstInstantOnOrAfterDate(weekStart, zone);
  const weekStartEpoch = civilEpoch(weekStart);
  const nextDate = weekStartEpoch === undefined ? undefined : civilDate(weekStartEpoch + 7 * DAY_MS);
  const endMs = nextDate ? firstInstantOnOrAfterDate(nextDate, zone) : undefined;
  return startMs !== undefined && endMs !== undefined && endMs > startMs ? { startMs, endMs } : undefined;
}

function fallbackModel(events: EventItem[], zone: string, anchor: string, reason: string): EventWeekModel {
  return {
    zone, weekStart: anchor, days: [], axis: [], totalMinutes: 0, segments: [], untimedByDate: {},
    fallbackEvents: events.map(event => ({ event, reason })), fallbackReason: reason,
  };
}

/** Project the seven civil dates and timed event instants into a device-zone week axis. */
export function buildEventWeek(events: readonly EventItem[], anchor: string, deviceZone: string): EventWeekModel {
  const validEvents = events.filter(validateEvent);
  const zone = validZone(deviceZone, anchor) ? deviceZone : 'UTC';
  const week = civilWeek(anchor);
  if (!week) return fallbackModel(validEvents, zone, anchor, 'This calendar week includes an invalid or unsupported date.');
  const { weekStart, dates } = week;
  const clocks = dates.map(date => buildDayClock(date, zone));
  const { axis, totalMinutes } = buildAxis(clocks);
  const days = clocks.map(clock => ({ date: clock.date, unavailableIntervals: dayUnavailableIntervals(clock, axis) }));
  const untimedByDate: Record<string, EventItem[]> = Object.fromEntries(dates.map(date => [date, []]));
  const fallbackEvents: EventWeekFallback[] = [];
  const weekBounds = visibleWeekBounds(weekStart, zone);
  const segments = validEvents.flatMap(event => {
    if (!event.timing) {
      if (untimedByDate[event.date]) untimedByDate[event.date].push(event);
      return [];
    }
    const projected = coalesceSegments(eventSegments(event, zone, clocks, axis), zone);
    const startMs = Date.parse(event.timing.startInstant);
    const endIso = eventEndInstant(event);
    if (!endIso) {
      const localDate = eventZonedPartsAt(startMs, zone)?.date;
      if (dates.includes(localDate ?? '') && projected.length === 0) {
        fallbackEvents.push({ event, reason: 'The event start falls in a clock interval the week grid cannot represent exactly.' });
        return [];
      }
      return projected;
    }
    const endMs = Date.parse(endIso);
    if (!weekBounds || !Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      fallbackEvents.push({ event, reason: 'The event could not be clipped safely to this week.' });
      return [];
    }
    const clippedStart = Math.max(startMs, weekBounds.startMs);
    const clippedEnd = Math.min(endMs, weekBounds.endMs);
    const expectedMinutes = Math.max(0, (clippedEnd - clippedStart) / MINUTE_MS);
    const projectedMinutes = projected.reduce((sum, segment) => sum + segment.spanMinutes, 0);
    if (Math.abs(expectedMinutes - projectedMinutes) > 1e-8) {
      fallbackEvents.push({ event, reason: 'A historical time-zone transition does not align with whole-minute grid intervals.' });
      return [];
    }
    return projected;
  });

  for (const list of Object.values(untimedByDate)) list.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  segments.sort((a, b) => a.date.localeCompare(b.date) || a.topMinutes - b.topMinutes ||
    Date.parse(a.startInstant) - Date.parse(b.startInstant) || a.event.id.localeCompare(b.event.id));
  fallbackEvents.sort((a, b) => a.event.id.localeCompare(b.event.id));
  return { zone, weekStart, days, axis, totalMinutes, segments, untimedByDate, fallbackEvents };
}
