import { describe, expect, it } from 'vitest';
import type { EventWeekSegment } from './eventWeekProjection';
import { layoutEventWeekSegments } from './eventWeekLayout';

const segment = (id: string, topMinutes: number, spanMinutes: number, date = '2026-11-01', startOnly = false): EventWeekSegment => ({
  key: `${id}:${date}:${topMinutes}`, event: {
    id, title: id, date, heading: 'Work', order: 1,
    createdAt: `${date}T00:00:00.000Z`, updatedAt: `${date}T00:00:00.000Z`,
  }, date,
  startInstant: `${date}T10:00:00.000Z`, endInstant: spanMinutes ? `${date}T11:00:00.000Z` : undefined,
  topMinutes, spanMinutes, startOnly, continuesBefore: false, continuesAfter: false, localLabel: id,
});

describe('layoutEventWeekSegments', () => {
  it('places identical starts in separate deterministic lanes', () => {
    const layout = layoutEventWeekSegments([segment('b', 60, 30), segment('a', 60, 30)], 44);
    expect(layout.map(({ event, lane, laneCount }) => ({ id: event.id, lane, laneCount })))
      .toEqual([{ id: 'a', lane: 0, laneCount: 2 }, { id: 'b', lane: 1, laneCount: 2 }]);
  });

  it('reuses lanes for nested and transitive overlaps within one connected group', () => {
    const layout = layoutEventWeekSegments([
      segment('long', 0, 90), segment('middle', 10, 30), segment('tail', 50, 30),
    ], 20);
    expect(layout.map(({ event, lane, laneCount }) => ({ id: event.id, lane, laneCount })))
      .toEqual([
        { id: 'long', lane: 0, laneCount: 2 },
        { id: 'middle', lane: 1, laneCount: 2 },
        { id: 'tail', lane: 1, laneCount: 2 },
      ]);
  });

  it('treats end-exclusive adjacent timed spans as non-overlapping', () => {
    const layout = layoutEventWeekSegments([segment('first', 0, 30), segment('second', 30, 30)], 20);
    expect(layout.map(({ lane, laneCount }) => ({ lane, laneCount }))).toEqual([{ lane: 0, laneCount: 1 }, { lane: 0, laneCount: 1 }]);
  });

  it('keeps unrelated dates in independent overlap groups', () => {
    const layout = layoutEventWeekSegments([segment('one', 30, 60), segment('other-day', 30, 60, '2026-11-02')], 20);
    expect(layout.map(({ lane, laneCount }) => ({ lane, laneCount }))).toEqual([{ lane: 0, laneCount: 1 }, { lane: 0, laneCount: 1 }]);
  });

  it('uses readable callout rectangles for short and start-only entries without changing actual spans', () => {
    const source = [segment('short', 10, 5), segment('marker', 20, 0, '2026-11-01', true)];
    const layout = layoutEventWeekSegments(source, 44);
    expect(layout.map(({ event, lane, laneCount, calloutMinutes, spanMinutes }) => ({ id: event.id, lane, laneCount, calloutMinutes, spanMinutes })))
      .toEqual([
        { id: 'short', lane: 0, laneCount: 2, calloutMinutes: 44, spanMinutes: 5 },
        { id: 'marker', lane: 1, laneCount: 2, calloutMinutes: 44, spanMinutes: 0 },
      ]);
    expect(source.map(item => item.spanMinutes)).toEqual([5, 0]);
  });
});
