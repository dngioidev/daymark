import type { EventWeekSegment } from './eventWeekProjection';

export interface PositionedEventWeekSegment extends EventWeekSegment {
  lane: number;
  laneCount: number;
  calloutMinutes: number;
}

function stableCompare(a: EventWeekSegment, b: EventWeekSegment): number {
  return a.topMinutes - b.topMinutes || a.event.id.localeCompare(b.event.id) || a.key.localeCompare(b.key);
}

function calloutHeight(segment: EventWeekSegment, minimumCalloutMinutes: number): number {
  return Math.max(segment.spanMinutes, minimumCalloutMinutes);
}

/** Assign deterministic overlap lanes using displayed callout rectangles, preserving actual spans. */
export function layoutEventWeekSegments(
  segments: readonly EventWeekSegment[],
  minimumCalloutMinutes: number,
): PositionedEventWeekSegment[] {
  const minimum = Number.isFinite(minimumCalloutMinutes) ? Math.max(0, minimumCalloutMinutes) : 0;
  const sorted = [...segments].sort((a, b) => a.date.localeCompare(b.date) || stableCompare(a, b));
  const result: PositionedEventWeekSegment[] = [];

  for (let dateStart = 0; dateStart < sorted.length;) {
    let dateEnd = dateStart + 1;
    while (dateEnd < sorted.length && sorted[dateEnd].date === sorted[dateStart].date) dateEnd += 1;
    const daySegments = sorted.slice(dateStart, dateEnd);

    for (let groupStart = 0; groupStart < daySegments.length;) {
      let groupEnd = groupStart + 1;
      let groupBottom = daySegments[groupStart].topMinutes + calloutHeight(daySegments[groupStart], minimum);
      while (groupEnd < daySegments.length && daySegments[groupEnd].topMinutes < groupBottom) {
        groupBottom = Math.max(groupBottom, daySegments[groupEnd].topMinutes + calloutHeight(daySegments[groupEnd], minimum));
        groupEnd += 1;
      }

      const group = daySegments.slice(groupStart, groupEnd);
      const laneEnds: number[] = [];
      const placed = group.map(segment => {
        const calloutMinutes = calloutHeight(segment, minimum);
        let lane = laneEnds.findIndex(end => end <= segment.topMinutes);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = segment.topMinutes + calloutMinutes;
        return { ...segment, lane, laneCount: 0, calloutMinutes };
      });
      const laneCount = laneEnds.length;
      for (const segment of placed) result.push({ ...segment, laneCount });
      groupStart = groupEnd;
    }
    dateStart = dateEnd;
  }

  return result;
}
