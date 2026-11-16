import type { EventItem } from '../types/daymark';

export type EventTimeResolution =
  | { kind: 'valid'; instants: string[] }
  | { kind: 'invalid'; message: string };

type WallParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };
const formatterCache = new Map<string, Intl.DateTimeFormat>();
const resolutionCache = new Map<string, EventTimeResolution>();
const dateExistenceCache = new Map<string, boolean>();
const MAX_DATE_MS = 8.64e15;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function utcMillis(parts: WallParts): number {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, 0);
  return date.getTime();
}

function parseDate(date: string): Omit<WallParts, 'hour' | 'minute' | 'second'> | undefined {
  const match = DATE_RE.exec(date);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const ms = utcMillis({ year, month, day, hour: 0, minute: 0, second: 0 });
  if (!Number.isFinite(ms)) return undefined;
  const check = new Date(ms);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) return undefined;
  return { year, month, day };
}

function getFormatter(zone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB-u-ca-gregory-nu-latn', {
      timeZone: zone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(zone, formatter);
  }
  return formatter;
}

function partsAt(epochMs: number, formatter: Intl.DateTimeFormat): WallParts {
  const values: Record<string, number> = {};
  for (const part of formatter.formatToParts(new Date(epochMs))) {
    if (['year', 'month', 'day', 'hour', 'minute', 'second'].includes(part.type)) values[part.type] = Number(part.value);
  }
  return {
    year: values.year, month: values.month, day: values.day,
    hour: values.hour, minute: values.minute, second: values.second,
  };
}

function sameWallTime(a: WallParts, b: WallParts): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day &&
    a.hour === b.hour && a.minute === b.minute && a.second === b.second;
}

function isIsoInstant(value: string): boolean {
  if (!ISO_INSTANT_RE.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed >= -MAX_DATE_MS && parsed <= MAX_DATE_MS && new Date(parsed).toISOString() === value;
}

/** Resolve wall-clock input by discovering nearby zone offsets, then round-tripping every candidate. */
function resolveEventTimeUncached(date: string, time: string, zone: string): EventTimeResolution {
  const dateParts = parseDate(date);
  const timeMatch = TIME_RE.exec(time);
  if (!dateParts) return { kind: 'invalid', message: 'Enter a valid calendar date.' };
  if (!timeMatch || Number(timeMatch[1]) > 23 || Number(timeMatch[2]) > 59) {
    return { kind: 'invalid', message: 'Enter a time in 24-hour HH:mm format.' };
  }

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = getFormatter(zone);
  } catch {
    return { kind: 'invalid', message: 'Choose a valid IANA time zone.' };
  }

  const wanted: WallParts = { ...dateParts, hour: Number(timeMatch[1]), minute: Number(timeMatch[2]), second: 0 };
  const wallMs = utcMillis(wanted);
  if (!Number.isFinite(wallMs) || Math.abs(wallMs) > MAX_DATE_MS) {
    return { kind: 'invalid', message: 'The date is outside the supported calendar range.' };
  }

  // The wide window includes date-line shifts; three-hour samples include both sides of short transitions.
  const offsets = new Set<number>();
  for (let delta = -48; delta <= 48; delta += 3) {
    const sample = wallMs + delta * 60 * 60 * 1000;
    if (!Number.isFinite(sample) || Math.abs(sample) > MAX_DATE_MS) continue;
    try {
      const offset = utcMillis(partsAt(sample, formatter)) - sample;
      if (Number.isFinite(offset)) offsets.add(offset);
    } catch {
      // Samples outside Intl's supported range do not contribute candidates.
    }
  }

  const instants = new Set<string>();
  for (const offset of offsets) {
    const candidate = wallMs - offset;
    if (!Number.isFinite(candidate) || Math.abs(candidate) > MAX_DATE_MS) continue;
    try {
      if (sameWallTime(partsAt(candidate, formatter), wanted)) instants.add(new Date(candidate).toISOString());
    } catch {
      // Out-of-range candidates are not valid occurrences.
    }
  }
  const sorted = [...instants].sort((a, b) => Date.parse(a) - Date.parse(b));
  if (!sorted.length) return { kind: 'invalid', message: 'That local time does not exist in this time zone.' };
  return { kind: 'valid', instants: sorted };
}

function remember<K, V>(cache: Map<K, V>, key: K, value: V, limit = 4000): void {
  if (cache.size >= limit && !cache.has(key)) cache.delete(cache.keys().next().value as K);
  cache.set(key, value);
}

export function resolveEventTime(date: string, time: string, zone: string): EventTimeResolution {
  const key = `${date}|${time}|${zone}`;
  const cached = resolutionCache.get(key);
  if (cached) return cached.kind === 'valid' ? { kind: 'valid', instants: [...cached.instants] } : { ...cached };
  const result = resolveEventTimeUncached(date, time, zone);
  const saved = result.kind === 'valid' ? { kind: 'valid' as const, instants: [...result.instants] } : { ...result };
  remember(resolutionCache, key, saved);
  return result;
}

function validCanonicalStart(event: EventItem): boolean {
  const { timing } = event;
  if (!timing || !isIsoInstant(timing.startInstant)) return false;
  const resolved = resolveEventTime(event.date, timing.localTime, timing.timeZone);
  return resolved.kind === 'valid' && resolved.instants.includes(timing.startInstant);
}

/** Returns the end as elapsed time from the saved instant; absent timing or duration has no end. */
export function eventEndInstant(event: EventItem): string | undefined {
  const duration = event.durationMinutes;
  if (!event.timing || typeof duration !== 'number' || !Number.isSafeInteger(duration) || duration <= 0 || !validCanonicalStart(event)) return undefined;
  const endMs = Date.parse(event.timing.startInstant) + duration * 60_000;
  if (!Number.isFinite(endMs) || Math.abs(endMs) > MAX_DATE_MS) return undefined;
  try {
    const endIso = new Date(endMs).toISOString();
    return isIsoInstant(endIso) ? endIso : undefined;
  } catch {
    return undefined;
  }
}

function dateKey(parts: WallParts): string {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function timeText(parts: WallParts): string {
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function durationText(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [
    ...(hours ? [`${hours} ${hours === 1 ? 'hour' : 'hours'}`] : []),
    ...(remainder ? [`${remainder} ${remainder === 1 ? 'minute' : 'minutes'}`] : []),
  ].join(' ');
}

function scheduleRange(event: EventItem, zone: string, includeDate: boolean): string {
  const start = partsAt(Date.parse(event.timing!.startInstant), getFormatter(zone));
  const endIso = eventEndInstant(event);
  const startLabel = `${includeDate ? `${dateKey(start)} ` : ''}${timeText(start)}`;
  if (!endIso) return startLabel;
  const end = partsAt(Date.parse(endIso), getFormatter(zone));
  const endDate = dateKey(end);
  const startDate = dateKey(start);
  const crossesDate = endDate !== startDate;
  const datedStart = crossesDate && !includeDate ? `${startDate} ${timeText(start)}` : startLabel;
  const endLabel = `${(includeDate || crossesDate) && crossesDate ? `${endDate} ` : ''}${timeText(end)}`;
  return `${datedStart}–${endLabel}`;
}

/** Original zone/time is primary; a differing device zone is shown only as secondary context. */
export function formatEventSchedule(event: EventItem, deviceZone: string): { primary: string; secondary?: string } {
  try {
    if (!event.timing) {
      return { primary: event.durationMinutes === undefined ? 'Date only' : `No set time · ${durationText(event.durationMinutes)}` };
    }
    if (!validCanonicalStart(event)) return { primary: 'Schedule unavailable' };
    if (event.durationMinutes !== undefined && !eventEndInstant(event)) return { primary: 'Schedule unavailable' };
    const originalZone = getFormatter(event.timing.timeZone).resolvedOptions().timeZone;
    const primaryRange = scheduleRange(event, event.timing.timeZone, false);
    const primary = `${primaryRange} · ${event.timing.timeZone}${event.durationMinutes === undefined ? '' : ` · ${durationText(event.durationMinutes)}`}`;
    try {
      const localZone = getFormatter(deviceZone).resolvedOptions().timeZone;
      if (originalZone === localZone) return { primary };
      const localStart = partsAt(Date.parse(event.timing.startInstant), getFormatter(deviceZone));
      const localRange = scheduleRange(event, deviceZone, dateKey(localStart) !== event.date);
      return { primary, secondary: `Your local time: ${localRange} · ${deviceZone}` };
    } catch {
      return { primary };
    }
  } catch {
    return { primary: 'Schedule unavailable' };
  }
}

/** True only for a real YYYY-MM-DD date within JavaScript's finite Gregorian calendar range. */
export function isValidEventDate(date: string): boolean {
  return !!parseDate(date);
}

/** Whether an instant uses the canonical millisecond precision persisted by Daymark. */
export function isValidEventInstant(instant: string): boolean {
  return isIsoInstant(instant);
}

/** Returns the date rendered by Intl in the requested zone, or undefined for invalid input. */
export function eventDateAtInstant(instant: string, zone: string): string | undefined {
  if (!isIsoInstant(instant)) return undefined;
  try {
    return dateKey(partsAt(Date.parse(instant), getFormatter(zone)));
  } catch {
    return undefined;
  }
}

export interface EventZonedParts {
  date: string;
  hour: number;
  minute: number;
  second: number;
  offsetSeconds: number;
  offsetLabel: string;
}

function formatOffset(offsetSeconds: number): string {
  const sign = offsetSeconds < 0 ? '-' : '+';
  const absolute = Math.abs(offsetSeconds);
  const hours = Math.floor(absolute / 3600);
  const minutes = Math.floor((absolute % 3600) / 60);
  const seconds = absolute % 60;
  return `UTC${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}${seconds ? `:${String(seconds).padStart(2, '0')}` : ''}`;
}

/** Local wall-clock fields and offset for a finite epoch value in an IANA zone. */
export function eventZonedPartsAt(epochMs: number, zone: string): EventZonedParts | undefined {
  if (!Number.isFinite(epochMs) || Math.abs(epochMs) > MAX_DATE_MS) return undefined;
  try {
    const wholeSecondMs = Math.floor(epochMs / 1000) * 1000;
    const parts = partsAt(wholeSecondMs, getFormatter(zone));
    const offsetSeconds = (utcMillis(parts) - wholeSecondMs) / 1000;
    return {
      date: dateKey(parts), hour: parts.hour, minute: parts.minute, second: parts.second,
      offsetSeconds, offsetLabel: formatOffset(offsetSeconds),
    };
  } catch {
    return undefined;
  }
}

/** UTC offset at an instant, including historical second-level offsets. */
export function eventZoneOffsetSeconds(epochMs: number, zone: string): number | undefined {
  return eventZonedPartsAt(epochMs, zone)?.offsetSeconds;
}

/** Checks whether any local clock time exists on a calendar date in a zone. */
export function eventDateHasInstant(date: string, zone: string): boolean {
  if (!isValidEventDate(date)) return false;
  const key = `${date}|${zone}`;
  const cached = dateExistenceCache.get(key);
  if (cached !== undefined) return cached;
  const coarseTimes = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00'];
  if (coarseTimes.some((time) => resolveEventTime(date, time, zone).kind === 'valid')) {
    remember(dateExistenceCache, key, true, 2000);
    return true;
  }
  // Rare partial-day transitions may remove each coarse sample; check every minute-resolution time.
  for (let minute = 0; minute < 1440; minute += 1) {
    const time = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
    if (resolveEventTime(date, time, zone).kind === 'valid') {
      remember(dateExistenceCache, key, true, 2000);
      return true;
    }
  }
  remember(dateExistenceCache, key, false, 2000);
  return false;
}

