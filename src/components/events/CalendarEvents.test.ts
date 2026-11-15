// @vitest-environment jsdom
import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import type { EventItem } from '../../types/daymark';
import { CalendarEvents } from './CalendarEvents';

afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

const event = (id: string, title: string, date: string, order: number, extra: Partial<EventItem> = {}): EventItem => ({
  id, title, date, heading: 'Work', order, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...extra,
});

async function render(events: EventItem[], selectedDate: string, deviceZone = 'UTC') {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const onEdit = vi.fn();
  await act(async () => root.render(React.createElement(CalendarEvents, { events, selectedDate, deviceZone, onEdit } as React.ComponentProps<typeof CalendarEvents>)));
  return { host, root, onEdit, unmount: () => act(async () => root.unmount()) };
}

describe('CalendarEvents', () => {
  it('shows overlaps and continuations on an event-only selected date in timed-first order', async () => {
    const ongoing = event('ongoing', 'Overnight maintenance', '2026-11-14', 9, {
      timing: { localTime: '23:00', timeZone: 'UTC', startInstant: '2026-11-14T23:00:00.000Z' }, durationMinutes: 3000,
    });
    const timed = event('timed', 'Morning meeting', '2026-11-15', 5, {
      timing: { localTime: '09:00', timeZone: 'UTC', startInstant: '2026-11-15T09:00:00.000Z' }, durationMinutes: 60,
    });
    const durationOnly = event('effort', 'Car repair', '2026-11-15', 1, { durationMinutes: 120 });
    const dateOnly = event('date-only', 'Birthday', '2026-11-15', 2);
    const ui = await render([ongoing, durationOnly, dateOnly, timed], '2026-11-15');
    try {
      const articles = [...ui.host.querySelectorAll<HTMLElement>('[data-calendar-event-id]')];
      expect(articles.map(row => row.dataset.calendarEventId)).toEqual(['ongoing', 'timed', 'effort', 'date-only']);
      expect(ui.host.textContent).toContain('Continues from');
      expect(ui.host.textContent).toContain('No set time · 2 hours');
      expect(ui.host.textContent).toContain('Date only');
      expect(ui.host.textContent).toContain('Morning meeting');
      act(() => articles[0].querySelector('button')!.click());
      expect(ui.onEdit).toHaveBeenCalledWith(ongoing);
    } finally { await ui.unmount(); }
    for (const continuationDate of ['2026-11-16', '2026-11-17']) {
      const continuation = await render([ongoing], continuationDate);
      expect(continuation.host.querySelector('[data-calendar-event-id="ongoing"]')).not.toBeNull();
      expect(continuation.host.textContent).toContain('Continues from');
      await continuation.unmount();
    }
  });

  it('keeps end-at-midnight exclusive and changes only the local secondary label with device zone', async () => {
    const eventUtc = event('midnight', 'Late call', '2026-11-15', 1, {
      timing: { localTime: '22:00', timeZone: 'UTC', startInstant: '2026-11-15T22:00:00.000Z' }, durationMinutes: 120,
    });
    const nextDay = await render([eventUtc], '2026-11-16', 'Asia/Tokyo');
    expect(nextDay.host.textContent).toContain('No events on this date.');
    await nextDay.unmount();

    const first = await render([eventUtc], '2026-11-15', 'Europe/London');
    const primary = first.host.querySelector('[data-calendar-event-id]')!.querySelector('[data-schedule-primary]')!.textContent;
    const london = first.host.textContent;
    await first.unmount();
    const second = await render([eventUtc], '2026-11-15', 'Asia/Tokyo');
    expect(second.host.querySelector('[data-calendar-event-id]')!.querySelector('[data-schedule-primary]')!.textContent).toBe(primary);
    expect(london).toContain('Your local time:');
    expect(london).toContain('Europe/London');
    expect(london).toContain('2026-11-15 22:00–2026-11-16 00:00');
    expect(second.host.textContent).toContain('07:00–09:00');
    expect(second.host.textContent).toContain('2026-11-16 07:00–09:00');
    expect(second.host.textContent).toContain('Asia/Tokyo');
    await second.unmount();
  });

  it('keeps the original schedule readable when the device zone is unavailable', async () => {
    const eventUtc = event('fallback', 'Planning', '2026-11-15', 1, {
      timing: { localTime: '09:00', timeZone: 'UTC', startInstant: '2026-11-15T09:00:00.000Z' },
    });
    const ui = await render([eventUtc], '2026-11-15', 'Not/AZone');
    expect(ui.host.textContent).toContain('09:00 · UTC');
    expect(ui.host.textContent).not.toContain('Schedule unavailable');
    await ui.unmount();
  });
});
