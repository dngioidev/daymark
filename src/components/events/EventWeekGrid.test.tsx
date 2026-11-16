// @vitest-environment jsdom
import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import type { EventItem } from '../../types/daymark';
import { EventWeekGrid } from './EventWeekGrid';

afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

const event = (id: string, date: string, overrides: Partial<EventItem> = {}): EventItem => ({
  id, title: id, date, heading: 'Work', order: 1,
  createdAt: `${date}T00:00:00.000Z`, updatedAt: `${date}T00:00:00.000Z`,
  ...overrides,
});

const timed = (id: string, date: string, localTime: string, timeZone: string, startInstant: string, durationMinutes?: number) => event(id, date, {
  timing: { localTime, timeZone, startInstant }, ...(durationMinutes === undefined ? {} : { durationMinutes }),
});

async function mount(props: Partial<React.ComponentProps<typeof EventWeekGrid>> = {}) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const onEdit = vi.fn();
  const defaults: React.ComponentProps<typeof EventWeekGrid> = {
    events: [], anchor: '2026-11-01', deviceZone: 'UTC', onEdit,
  };
  await act(async () => root.render(React.createElement(EventWeekGrid, { ...defaults, ...props, onEdit: props.onEdit ?? onEdit })));
  return { host, root, onEdit: props.onEdit ?? onEdit, unmount: () => act(async () => root.unmount()) };
}

describe('EventWeekGrid', () => {
  it('shows seven Sunday-first civil date headings and the device timezone', async () => {
    const ui = await mount({ anchor: '2011-12-30', deviceZone: 'Pacific/Apia' });
    try {
      expect([...ui.host.querySelectorAll<HTMLElement>('[data-event-week-day-heading]')].map(node => node.dataset.eventWeekDayHeading))
        .toEqual(['2011-12-25', '2011-12-26', '2011-12-27', '2011-12-28', '2011-12-29', '2011-12-30', '2011-12-31']);
      expect(ui.host.textContent).toContain('Fri, Dec 30');
      expect(ui.host.textContent).toContain('Device timezone: Pacific/Apia');
    } finally { await ui.unmount(); }
  });

  it('keeps the original schedule primary and shows the device-local schedule secondarily', async () => {
    const appointment = timed('original-zone', '2026-11-01', '15:00', 'Asia/Ho_Chi_Minh', '2026-11-01T08:00:00.000Z', 60);
    const ui = await mount({ events: [appointment], deviceZone: 'Europe/London' });
    try {
      const segment = ui.host.querySelector<HTMLElement>('[data-event-week-event-id="original-zone"]')!;
      expect(segment.querySelector('[data-original-schedule]')?.textContent).toContain('15:00');
      expect(segment.querySelector('[data-original-schedule]')?.textContent).toContain('Asia/Ho_Chi_Minh');
      expect(segment.querySelector('[data-device-schedule]')?.textContent).toContain('08:00');
      expect(segment.querySelector('[data-device-schedule]')?.textContent).toContain('Europe/London');
    } finally { await ui.unmount(); }
  });

  it('keeps the original start clock first on the first piece of an overnight event', async () => {
    const overnight = timed('overnight-first-label', '2026-11-02', '23:00', 'UTC', '2026-11-02T23:00:00.000Z', 180);
    const ui = await mount({ events: [overnight], anchor: '2026-11-02' });
    try {
      const segment = ui.host.querySelector<HTMLElement>('[data-event-week-event-id="overnight-first-label"]')!;
      expect(segment.dataset.eventWeekDate).toBe('2026-11-02');
      expect(segment.querySelector('[data-original-schedule]')?.textContent?.startsWith('23:00')).toBe(true);
      expect(segment.getAttribute('aria-label')).toContain('2026-11-02');
    } finally { await ui.unmount(); }
  });

  it('shows the original event date when a zone shift places the event in another device day', async () => {
    const shifted = timed('cross-date', '2026-10-31', '23:30', 'America/Los_Angeles', '2026-11-01T06:30:00.000Z', 45);
    const ui = await mount({ events: [shifted], anchor: '2026-11-01', deviceZone: 'America/New_York' });
    try {
      const segment = ui.host.querySelector<HTMLElement>('[data-event-week-event-id="cross-date"]')!;
      expect(segment.dataset.eventWeekDate).toBe('2026-11-01');
      const originalLabel = segment.querySelector('[data-original-schedule]')?.textContent ?? '';
      expect(originalLabel).toContain('Oct 31');
      expect(originalLabel.indexOf('Oct 31')).toBeLessThan(originalLabel.indexOf('2026-11-01'));
      expect(segment.getAttribute('aria-label')).toContain('2026-10-31');
      expect(segment.querySelector('[data-device-schedule]')?.textContent).toContain('01:30');
    } finally { await ui.unmount(); }
  });

  it('keeps date-only and duration-only events in the bounded No set time strip', async () => {
    const dateOnly = event('date-only', '2026-11-03', { title: 'Date only planning' });
    const durationOnly = event('duration-only', '2026-11-03', { title: 'Repair estimate', durationMinutes: 90 });
    const ui = await mount({ events: [dateOnly, durationOnly] });
    try {
      const strip = ui.host.querySelector('[aria-label="No set time events"]')!;
      expect(strip).not.toBeNull();
      expect(strip.textContent).toContain('No set time');
      expect(strip.querySelector('[data-untimed-event-id="date-only"]')?.textContent).toContain('Date only');
      expect(strip.querySelector('[data-untimed-event-id="duration-only"]')?.textContent).toContain('1 hour 30 minutes');
      const button = strip.querySelector<HTMLButtonElement>('[data-untimed-event-id="duration-only"]')!;
      expect(button.className).toContain('min-h-11');
      act(() => button.click());
      expect(ui.onEdit).toHaveBeenCalledWith(durationOnly);
    } finally { await ui.unmount(); }
  });

  it('shows a start-only event as a point with No duration', async () => {
    const marker = timed('start-only', '2026-11-02', '09:15', 'UTC', '2026-11-02T09:15:00.000Z');
    const ui = await mount({ events: [marker] });
    try {
      const button = ui.host.querySelector<HTMLButtonElement>('[data-event-week-event-id="start-only"]')!;
      expect(button.getAttribute('aria-label')).toContain('No duration');
      expect(button.querySelector('[data-no-duration]')?.textContent).toBe('No duration');
      expect(button.querySelector('[data-no-duration]')?.className).not.toContain('sr-only');
      expect(button.querySelector('[data-exact-span]')?.getAttribute('data-span-minutes')).toBe('0');
    } finally { await ui.unmount(); }
  });

  it('keeps a 23:59 minimum-height callout scrollable below the 24:00 timeline edge', async () => {
    const late = timed('late-event', '2026-11-02', '23:59', 'UTC', '2026-11-02T23:59:00.000Z', 1);
    const ui = await mount({ events: [late] });
    try {
      const button = ui.host.querySelector<HTMLButtonElement>('[data-event-week-event-id="late-event"]')!;
      const column = ui.host.querySelector<HTMLElement>('[data-event-week-date-column="2026-11-02"]')!;
      expect(button.style.top).toBe('1439px');
      expect(button.style.height).toBe('44px');
      expect(button.querySelector<HTMLElement>('[data-exact-span]')?.style.height).toBe('1px');
      expect(column.style.height).toBe('1484px');
      expect(Number.parseFloat(button.style.top) + Number.parseFloat(button.style.height)).toBeLessThanOrEqual(Number.parseFloat(column.style.height));
    } finally { await ui.unmount(); }
  });

  it('fills desktop width without forcing the seven columns to max-content width', async () => {
    const ui = await mount();
    try {
      const content = ui.host.querySelector<HTMLElement>('[data-event-week-scroll] > div')!;
      expect(content.className).toContain('min-w-0');
      expect(content.className).not.toContain('min-w-max');
    } finally { await ui.unmount(); }
  });

  it('lays overlapping events in separate lanes and marks the true span independently of callout height', async () => {
    const first = timed('overlap-a', '2026-11-02', '10:00', 'UTC', '2026-11-02T10:00:00.000Z', 30);
    const second = timed('overlap-b', '2026-11-02', '10:00', 'UTC', '2026-11-02T10:00:00.000Z', 30);
    const third = timed('overlap-c', '2026-11-02', '10:00', 'UTC', '2026-11-02T10:00:00.000Z', 30);
    const ui = await mount({ events: [first, second, third] });
    try {
      const a = ui.host.querySelector<HTMLButtonElement>('[data-event-week-event-id="overlap-a"]')!;
      const b = ui.host.querySelector<HTMLButtonElement>('[data-event-week-event-id="overlap-b"]')!;
      const c = ui.host.querySelector<HTMLButtonElement>('[data-event-week-event-id="overlap-c"]')!;
      expect(new Set([a.dataset.lane, b.dataset.lane, c.dataset.lane]).size).toBe(3);
      expect(a.style.height).toBe('44px');
      expect(a.querySelector('[data-exact-span]')?.getAttribute('data-span-minutes')).toBe('30');
      expect(a.querySelector('[data-exact-span]')?.getAttribute('aria-label')).toContain('30 minutes');
      expect(a.className).not.toContain('border-l-4');
      expect(a.parentElement?.parentElement?.style.gridTemplateColumns).toContain('216px');
    } finally { await ui.unmount(); }
  });

  it('labels both fall-back occurrences with their offsets and a visible hour axis', async () => {
    const source = timed('fall-labels', '2026-11-01', '01:30', 'America/New_York', '2026-11-01T05:30:00.000Z', 60);
    const ui = await mount({ events: [source], anchor: '2026-11-01', deviceZone: 'America/New_York' });
    try {
      const segments = [...ui.host.querySelectorAll<HTMLButtonElement>('[data-event-week-event-id="fall-labels"]')];
      expect(segments).toHaveLength(2);
      expect(segments[0].getAttribute('aria-label')).toContain('UTC-04:00, first occurrence');
      expect(segments[1].getAttribute('aria-label')).toContain('UTC-05:00, second occurrence');
      expect(ui.host.querySelector('[aria-label="Time of day"] [aria-label="01:00 second occurrence"]')?.textContent).toBe('01:00 · 2nd');
      expect(ui.host.querySelector('[aria-label="Time of day"]')?.textContent).toContain('08:00');
      expect(ui.host.querySelector('[aria-label="Time of day"] [aria-label="24:00"]')?.textContent).toBe('24:00');
      const monday = ui.host.querySelector<HTMLElement>('[data-event-week-date-column="2026-11-02"]')!;
      expect(monday.querySelector('span[style*="top: 540px"]')).not.toBeNull();
    } finally { await ui.unmount(); }
  });

  it('shows unavailable spring-forward time and opens the source event from a continuation segment', async () => {
    const source = timed('spring-event', '2026-03-08', '01:30', 'America/New_York', '2026-03-08T06:30:00.000Z', 60);
    const ui = await mount({ events: [source], anchor: '2026-03-08', deviceZone: 'America/New_York' });
    try {
      const gap = ui.host.querySelector('[data-unavailable-kind="gap"][data-event-week-date="2026-03-08"]');
      expect(gap?.getAttribute('aria-label')).toContain('Clock skips forward');
      const segments = [...ui.host.querySelectorAll<HTMLButtonElement>('[data-event-week-event-id="spring-event"]')];
      expect(segments).toHaveLength(2);
      expect(segments[1].getAttribute('aria-label')).toContain('Continuation');
      act(() => segments[1].click());
      expect(ui.onEdit).toHaveBeenCalledWith(source);
    } finally { await ui.unmount(); }
  });

  it('renders whole-event fallbacks with their schedule and reason instead of dropping them', async () => {
    const source = timed('historical-fallback', '1911-03-10', '23:40', 'UTC', '1911-03-10T23:40:00.000Z', 60);
    const ui = await mount({ events: [source], anchor: '1911-03-10', deviceZone: 'Europe/Paris' });
    try {
      const fallback = ui.host.querySelector<HTMLButtonElement>('[data-fallback-event-id="historical-fallback"]')!;
      expect(fallback).not.toBeNull();
      expect(fallback.textContent).toContain('23:40');
      expect(fallback.textContent).toContain('1911-03-10');
      expect(fallback.textContent).toContain('A historical time-zone transition');
      act(() => fallback.click());
      expect(ui.onEdit).toHaveBeenCalledWith(source);
    } finally { await ui.unmount(); }
  });

  it('reports invalid week ranges and still keeps valid source events reachable', async () => {
    const source = event('out-of-range-event', '2026-11-02', { title: 'Keep this source' });
    const ui = await mount({ events: [source], anchor: '0001-01-01' });
    try {
      expect(ui.host.textContent).toContain('invalid or unsupported date');
      expect(ui.host.querySelector('[data-fallback-event-id="out-of-range-event"]')?.textContent).toContain('Nov 2, 2026');
      expect(ui.host.querySelector('[data-fallback-event-id="out-of-range-event"]')?.textContent).toContain('Date only');
    } finally { await ui.unmount(); }
  });

  it('scrolls to 08:00 initially and on week changes, but not on event edits or zone changes', async () => {
    const first = timed('scroll-a', '2026-11-02', '10:00', 'UTC', '2026-11-02T10:00:00.000Z', 30);
    const ui = await mount({ events: [first] });
    try {
      const scroller = ui.host.querySelector<HTMLElement>('[data-event-week-scroll]')!;
      expect(scroller.scrollTop).toBe(480);
      scroller.scrollTop = 590;
      const second = { ...first, title: 'Edited title' };
      await act(async () => ui.root.render(React.createElement(EventWeekGrid, { events: [second], anchor: '2026-11-02', deviceZone: 'Europe/London', onEdit: ui.onEdit })));
      expect(scroller.scrollTop).toBe(590);
      await act(async () => ui.root.render(React.createElement(EventWeekGrid, { events: [second], anchor: '2026-11-08', deviceZone: 'Europe/London', onEdit: ui.onEdit })));
      expect(scroller.scrollTop).toBe(480);
    } finally { await ui.unmount(); }

    const fall = await mount({ anchor: '2026-11-01', deviceZone: 'America/New_York' });
    try { expect(fall.host.querySelector<HTMLElement>('[data-event-week-scroll]')?.scrollTop).toBe(540); }
    finally { await fall.unmount(); }
  });
});
