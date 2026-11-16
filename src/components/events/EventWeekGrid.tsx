import React, { useEffect, useMemo, useRef } from 'react';
import type { EventItem } from '../../types/daymark';
import { formatEventSchedule } from '../../utils/eventTime';
import { buildEventWeek, type EventWeekDay, type EventWeekSegment } from '../../utils/eventWeekProjection';
import { layoutEventWeekSegments, type PositionedEventWeekSegment } from '../../utils/eventWeekLayout';

export interface EventWeekGridProps {
  events: readonly EventItem[];
  anchor: string;
  deviceZone: string;
  onEdit: (event: EventItem) => void;
}

const GUTTER_WIDTH = 56;
const MIN_DAY_WIDTH = 160;
const MIN_LANE_WIDTH = 72;
const MIN_CALLOUT_MINUTES = 44;
const UNSCHEDULED_STRIP_HEIGHT = 96;

interface AxisTick {
  key: string;
  topMinutes: number;
  label: string;
  accessibleLabel: string;
}

function civilDateValue(date: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return undefined;
  const value = new Date(0);
  value.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  value.setUTCHours(12, 0, 0, 0);
  return Number.isFinite(value.getTime()) ? value : undefined;
}

function formatCivilDate(date: string, options: Intl.DateTimeFormatOptions): string {
  const value = civilDateValue(date);
  if (!value) return date;
  try { return new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' }).format(value); }
  catch { return date; }
}

function formatSpan(minutes: number): string {
  const rounded = Math.round(minutes);
  return Math.abs(minutes - rounded) < 1e-8 ? `${rounded} ${rounded === 1 ? 'minute' : 'minutes'}` : `${minutes.toFixed(2)} minutes`;
}

function eventAccessibleName(segment: EventWeekSegment, originalSchedule: string, deviceSchedule: string): string {
  const continuation = [
    ...(segment.continuesBefore ? ['Continuation from the previous day or time band'] : []),
    ...(segment.continuesAfter ? ['Continuation to the next day or time band'] : []),
  ];
  const duration = segment.startOnly ? 'No duration' : `This segment occupies ${formatSpan(segment.spanMinutes)}`;
  return `${segment.event.title}. Original schedule: ${originalSchedule}. ${deviceSchedule}. ${duration}.${continuation.length ? ` ${continuation.join('. ')}.` : ''}`;
}

function dayLabel(day: EventWeekDay): string {
  return formatCivilDate(day.date, { weekday: 'short', month: 'short', day: 'numeric' });
}

function segmentStyle(segment: PositionedEventWeekSegment): React.CSSProperties {
  return {
    top: `${segment.topMinutes}px`,
    height: `${segment.calloutMinutes}px`,
    left: `${segment.lane / segment.laneCount * 100}%`,
    width: `${100 / segment.laneCount}%`,
  };
}

function axisTicks(axis: ReturnType<typeof buildEventWeek>['axis']): AxisTick[] {
  const ticks: AxisTick[] = [];
  for (const band of axis) {
    if (band.occurrence === 2) {
      const time = clockLabel(band.wallStartMinute);
      ticks.push({ key: `${band.key}:tick`, topMinutes: band.topMinutes, label: `${time} · 2nd`, accessibleLabel: `${time} second occurrence` });
      continue;
    }
    const firstHour = Math.ceil(band.wallStartMinute / 60) * 60;
    for (let minute = firstHour; minute < band.wallEndMinute; minute += 60) {
      const time = clockLabel(minute);
      ticks.push({ key: `${band.key}:hour:${minute}`, topMinutes: band.topMinutes + minute - band.wallStartMinute, label: time, accessibleLabel: time });
    }
    if (band.wallEndMinute === 1440) {
      ticks.push({ key: `${band.key}:midnight`, topMinutes: band.topMinutes + band.spanMinutes, label: '24:00', accessibleLabel: '24:00' });
    }
  }
  return ticks.sort((a, b) => a.topMinutes - b.topMinutes || a.key.localeCompare(b.key));
}

function clockLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function TimelineEvent({ segment, zone, onEdit }: { segment: PositionedEventWeekSegment; zone: string; onEdit: (event: EventItem) => void }) {
  const schedule = formatEventSchedule(segment.event, zone);
  const shiftedOriginalDate = segment.date !== segment.event.date;
  const originalDateLabel = formatCivilDate(segment.event.date, { month: 'short', day: 'numeric', year: 'numeric' });
  const original = shiftedOriginalDate && !schedule.primary.includes(segment.event.date)
    ? `${originalDateLabel} · ${schedule.primary}`
    : schedule.primary;
  const originalVisibleBase = schedule.primary.startsWith(segment.event.date)
    ? schedule.primary.slice(segment.event.date.length).trimStart()
    : schedule.primary;
  const compactOriginalDate = formatCivilDate(segment.event.date, { month: 'short', day: 'numeric' });
  const originalClock = segment.event.timing?.localTime;
  const originalVisible = shiftedOriginalDate && originalClock && originalVisibleBase.startsWith(originalClock)
    ? `${originalClock} · ${compactOriginalDate}${originalVisibleBase.slice(originalClock.length)}`
    : shiftedOriginalDate ? `${originalVisibleBase} · ${compactOriginalDate}` : originalVisibleBase;
  const deviceVisible = `${segment.localLabel} · ${zone}`;
  const deviceAccessible = schedule.secondary
    ? `${schedule.secondary.replace(/^Your local time:\s*/, '')} · ${segment.localLabel}`
    : deviceVisible;
  const accessibleName = eventAccessibleName(segment, original, deviceAccessible);
  const continuationText = segment.continuesBefore || segment.continuesAfter ? 'Continues' : '';
  const spanLabel = segment.startOnly ? 'No duration' : `Exact span: ${formatSpan(segment.spanMinutes)}`;

  return <button
    type="button"
    data-event-week-event-id={segment.event.id}
    data-event-week-segment-id={segment.key}
    data-event-week-date={segment.date}
    data-lane={segment.lane}
    aria-label={accessibleName}
    title={accessibleName}
    onClick={() => onEdit(segment.event)}
    className="absolute z-10 flex min-w-0 items-stretch overflow-hidden rounded-md border border-stone-300 bg-white text-left text-stone-900 shadow-sm hover:bg-stone-50 focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800 dark:focus-visible:outline-amber-300"
    style={segmentStyle(segment)}
  >
    <span
      aria-label={spanLabel}
      data-exact-span
      data-span-minutes={segment.spanMinutes}
      className="absolute left-0 top-0 w-1 bg-amber-700 dark:bg-amber-300"
      style={{ height: `${segment.spanMinutes}px` }}
    />
    {segment.startOnly && <span data-start-marker aria-hidden="true" className="absolute left-1 top-0 h-1 w-2 rounded-full bg-amber-800 dark:bg-amber-200" />}
    <span className="flex min-w-0 flex-1 flex-col overflow-hidden px-2 py-0.5 pl-3 leading-3">
      <span className="flex min-w-0 items-center gap-1 leading-3">
        <span className="truncate text-xs font-semibold">{segment.event.title}</span>
        {continuationText && <span className="shrink-0 text-[9px] font-medium text-stone-600 dark:text-stone-300">{continuationText}</span>}
        {segment.startOnly && <span data-no-duration className="shrink-0 rounded bg-stone-100 px-1 text-[9px] font-medium leading-3 text-stone-700 dark:bg-stone-800 dark:text-stone-200">No duration</span>}
      </span>
      <span data-original-schedule className="truncate text-[10px] font-medium leading-3">{originalVisible}</span>
      <span data-device-schedule className="truncate text-[10px] leading-3 text-stone-700 dark:text-stone-300">{deviceVisible}</span>
    </span>
  </button>;
}

function UnavailableBand({ interval, date }: { interval: EventWeekDay['unavailableIntervals'][number]; date: string }) {
  const label = interval.kind === 'gap' ? 'Clock skips forward' : interval.kind === 'repeated'
    ? 'Repeated clock interval unavailable on this date' : 'This calendar date has no local clock time';
  return <div
    data-unavailable-kind={interval.kind}
    data-event-week-date={date}
    aria-label={`${label}, ${date}`}
    className="pointer-events-none absolute left-0 right-0 z-0 overflow-hidden border-y border-dashed border-stone-400 bg-stone-100/80 px-1 text-[10px] leading-4 text-stone-700 dark:border-stone-600 dark:bg-stone-800/80 dark:text-stone-200"
    style={{ top: `${interval.topMinutes}px`, height: `${interval.spanMinutes}px`, backgroundImage: 'repeating-linear-gradient(135deg, rgb(120 113 108 / .16) 0 5px, transparent 5px 10px)' }}
  >{interval.spanMinutes >= 24 ? label : null}</div>;
}

function EmptyFallback({ reason, event, onEdit, zone }: { reason: string; event: EventItem; onEdit: (event: EventItem) => void; zone: string }) {
  const schedule = formatEventSchedule(event, zone);
  const original = schedule.primary.includes(event.date)
    ? schedule.primary
    : `${formatCivilDate(event.date, { month: 'short', day: 'numeric', year: 'numeric' })} · ${schedule.primary}`;
  return <button
    type="button"
    data-fallback-event-id={event.id}
    onClick={() => onEdit(event)}
    className="flex min-h-11 w-full flex-col items-start justify-center rounded-lg border border-amber-300 border-l-4 border-l-amber-600 bg-amber-50 px-3 py-2 text-left text-stone-900 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 dark:border-amber-800 dark:border-l-amber-400 dark:bg-amber-950/50 dark:text-stone-100 dark:hover:bg-amber-900/60 dark:focus-visible:outline-amber-300"
  >
    <span className="font-semibold">{event.title}</span>
    <span data-original-schedule className="text-xs">{original}</span>
    {schedule.secondary && <span className="text-xs text-stone-700 dark:text-stone-300">{schedule.secondary}</span>}
    <span className="text-xs text-stone-600 dark:text-stone-400">{reason}</span>
  </button>;
}

export const EventWeekGrid: React.FC<EventWeekGridProps> = ({ events, anchor, deviceZone, onEdit }) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const model = useMemo(() => buildEventWeek(events, anchor, deviceZone), [events, anchor, deviceZone]);
  const positioned = useMemo(() => layoutEventWeekSegments(model.segments, MIN_CALLOUT_MINUTES), [model.segments]);
  const eightAmAxisMinute = model.axis.find(band => band.occurrence === 1 && band.wallStartMinute <= 480 && band.wallEndMinute > 480);
  const scrollToEightAm = eightAmAxisMinute ? eightAmAxisMinute.topMinutes + 480 - eightAmAxisMinute.wallStartMinute : 8 * 60;
  const scrollToEightAmRef = useRef(scrollToEightAm);
  scrollToEightAmRef.current = scrollToEightAm;
  const laneCounts = useMemo(() => {
    const counts = new Map(model.days.map(day => [day.date, 1]));
    for (const segment of positioned) counts.set(segment.date, Math.max(counts.get(segment.date) ?? 1, segment.laneCount));
    return counts;
  }, [model.days, positioned]);
  const widestLaneCount = Math.max(1, ...laneCounts.values());
  const dayColumnMinWidth = Math.max(MIN_DAY_WIDTH, widestLaneCount * MIN_LANE_WIDTH);
  const columns = `${GUTTER_WIDTH}px repeat(7, minmax(${dayColumnMinWidth}px, 1fr))`;
  const contentMinWidth = GUTTER_WIDTH + 7 * dayColumnMinWidth;
  const rangeLabel = model.days.length === 7
    ? `${formatCivilDate(model.days[0].date, { month: 'long', day: 'numeric' })} – ${formatCivilDate(model.days[6].date, { month: 'long', day: 'numeric', year: 'numeric' })}`
    : 'Week dates unavailable';

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollToEightAmRef.current;
  }, [model.weekStart]);

  const segmentsByDate = new Map<string, PositionedEventWeekSegment[]>();
  for (const segment of positioned) segmentsByDate.set(segment.date, [...(segmentsByDate.get(segment.date) ?? []), segment]);
  return <section aria-label="Events week" className="w-full min-w-0 space-y-3 mb-20 md:mb-0">
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
      <div>
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Events week</h2>
        <p className="text-sm text-stone-600 dark:text-stone-400">{rangeLabel}</p>
      </div>
      <p className="text-sm font-medium text-stone-700 dark:text-stone-300">Device timezone: {model.zone}</p>
    </div>

    {(model.fallbackReason || model.fallbackEvents.length > 0) && <section aria-label="Events shown as a readable schedule" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/70 p-3 dark:border-amber-800 dark:bg-amber-950/30">
      <div>
        <h3 className="font-semibold text-stone-900 dark:text-stone-100">Some events need a readable schedule</h3>
        {model.fallbackReason && <p role="status" className="text-sm text-stone-700 dark:text-stone-300">{model.fallbackReason}</p>}
      </div>
      {model.fallbackEvents.map(({ event, reason }) => <EmptyFallback key={event.id} event={event} reason={reason} onEdit={onEdit} zone={model.zone} />)}
    </section>}

    {model.days.length === 7 && <div
      ref={scrollRef}
      data-event-week-scroll
      role="region"
      aria-label="Events week time grid"
      tabIndex={0}
      className="relative max-h-[min(68vh,700px)] min-h-[360px] overflow-auto overscroll-contain rounded-xl border border-stone-300 bg-white outline-none focus-visible:ring-2 focus-visible:ring-accent dark:border-stone-700 dark:bg-stone-900"
      style={{ scrollbarGutter: 'stable' }}
    >
      <div className="min-w-0" style={{ width: `max(100%, ${contentMinWidth}px)` }}>
        <div className="sticky top-0 z-30 grid h-14 border-b border-stone-300 bg-stone-100 text-stone-900 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100" style={{ gridTemplateColumns: columns }}>
          <div className="sticky left-0 z-40 flex h-14 items-center justify-center border-r border-stone-300 bg-stone-100 text-[10px] font-semibold text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">Time</div>
          {model.days.map(day => <div key={day.date} data-event-week-day-heading={day.date} className="flex h-14 min-w-0 flex-col justify-center border-r border-stone-300 px-2 dark:border-stone-700">
            <span className="truncate text-xs font-semibold">{dayLabel(day)}</span>
            {day.unavailableIntervals.some(interval => interval.kind === 'skipped-date') && <span className="text-[10px] text-stone-600 dark:text-stone-400">No local time</span>}
          </div>)}
        </div>

        <div
          aria-label="No set time events"
          role="group"
          className="sticky top-14 z-20 grid border-b border-stone-300 bg-white dark:border-stone-700 dark:bg-stone-900"
          style={{ gridTemplateColumns: columns, minHeight: `${UNSCHEDULED_STRIP_HEIGHT}px`, maxHeight: `${UNSCHEDULED_STRIP_HEIGHT}px` }}
        >
          <div className="sticky left-0 z-30 flex h-24 items-start justify-center border-r border-stone-300 bg-stone-50 px-1 pt-2 text-center text-[10px] font-semibold text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">No set time</div>
          {model.days.map(day => <div key={day.date} data-no-set-time-date={day.date} className="h-24 min-w-0 space-y-1 overflow-y-auto border-r border-stone-200 p-1.5 dark:border-stone-800">
            {(model.untimedByDate[day.date] ?? []).map(item => {
              const schedule = formatEventSchedule(item, model.zone);
              const duration = item.durationMinutes === undefined ? '' : ` · ${schedule.primary.replace(/^No set time · /, '')}`;
              return <button key={item.id} type="button" data-untimed-event-id={item.id} onClick={() => onEdit(item)}
                aria-label={`${item.title}, ${schedule.primary}, ${day.date}`} title={`${item.title} · ${schedule.primary}`}
                className="block min-h-11 w-full truncate rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-left text-[11px] font-medium text-stone-900 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-stone-100 dark:hover:bg-amber-900/60 dark:focus-visible:outline-amber-300">
                <span className="font-semibold">{item.title}</span><span className="ml-1 text-stone-700 dark:text-stone-300">{duration || ' · Date only'}</span>
              </button>;
            })}
          </div>)}
        </div>

        <div className="grid" style={{ gridTemplateColumns: columns, width: '100%' }}>
          <div aria-label="Time of day" className="sticky left-0 z-10 border-r border-stone-300 bg-white dark:border-stone-700 dark:bg-stone-900" style={{ height: `${model.totalMinutes + MIN_CALLOUT_MINUTES}px` }}>
            {axisTicks(model.axis).map(tick => <React.Fragment key={tick.key}>
              <span aria-label={tick.accessibleLabel} title={tick.accessibleLabel} className="absolute right-1 z-10 -translate-y-1/2 whitespace-nowrap text-[9px] font-medium text-stone-600 dark:text-stone-400" style={{ top: `${tick.topMinutes}px` }}>{tick.label}</span>
              <span aria-hidden="true" className="absolute right-0 border-t border-stone-200 dark:border-stone-800" style={{ top: `${tick.topMinutes}px`, width: '5px' }} />
            </React.Fragment>)}
          </div>
          {model.days.map(day => {
            const daySegments = segmentsByDate.get(day.date) ?? [];
            return <div key={day.date} role="group" aria-label={`Events on ${dayLabel(day)}`} data-event-week-date-column={day.date}
              className="relative isolate min-w-0 border-r border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900" style={{ height: `${model.totalMinutes + MIN_CALLOUT_MINUTES}px` }}>
              {axisTicks(model.axis).map(tick => <span key={tick.key} aria-hidden="true" className="absolute left-0 right-0 border-t border-stone-200 dark:border-stone-800" style={{ top: `${tick.topMinutes}px` }} />)}
              {model.axis.map(band => <span key={band.key} aria-hidden="true" className="absolute left-0 right-0 border-b border-stone-100 dark:border-stone-800" style={{ top: `${band.topMinutes + band.spanMinutes}px` }} />)}
              {day.unavailableIntervals.map((interval, index) => <UnavailableBand key={`${interval.kind}:${interval.topMinutes}:${index}`} interval={interval} date={day.date} />)}
              {daySegments.map(segment => <TimelineEvent key={segment.key} segment={segment} zone={model.zone} onEdit={onEdit} />)}
            </div>;
          })}
        </div>
      </div>
    </div>}
  </section>;
};
