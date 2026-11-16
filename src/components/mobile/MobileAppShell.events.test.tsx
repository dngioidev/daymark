// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { EventItem, MobileTab } from '../../types/daymark';
import { DEFAULT_SETTINGS } from '../../utils/defaultData';
import { MobileAppShell } from './MobileAppShell';

const selectedEvent: EventItem = {
  id: 'mobile-event', title: 'Mobile event', date: '2026-10-25', heading: 'Work', order: 1,
  timing: { localTime: '09:30', timeZone: 'Asia/Tokyo', startInstant: '2026-10-25T00:30:00.000Z' },
  createdAt: '2026-10-20T00:00:00.000Z', updatedAt: '2026-10-20T00:00:00.000Z',
};

vi.mock('../TodayView', () => ({ TodayView: ({ events = [], deviceZone = '', onEditEvent, onUpdateEvent, onDeleteEvent, onMoveEvent }: {
  events?: EventItem[]; deviceZone?: string; onEditEvent?: (event: EventItem) => void; onUpdateEvent?: (event: EventItem, base?: EventItem | null) => void;
  onDeleteEvent?: (id: string) => void; onMoveEvent?: (id: string, change: { date?: string; heading?: string; startInstant?: string }) => void;
}) => <section data-testid="mobile-today" data-zone={deviceZone}>
  {events.map(event => <span key={event.id}>{event.title}</span>)}
  <button aria-label="Edit event" onClick={() => events[0] && onEditEvent?.(events[0])}>Edit event</button>
  <button aria-label="Update event" onClick={() => events[0] && onUpdateEvent?.({ ...events[0], title: 'Checklist changed' }, events[0])}>Update event</button>
  <button aria-label="Delete event" onClick={() => events[0] && onDeleteEvent?.(events[0].id)}>Delete event</button>
  <button aria-label="Move event" onClick={() => events[0] && onMoveEvent?.(events[0].id, { date: '2026-10-26', startInstant: '2026-10-26T00:30:00.000Z' })}>Move event</button>
</section> }));

vi.mock('../CalendarView', () => ({ CalendarView: ({ events = [], deviceZone = '', selectedDate, onEditEvent, onSelectDate }: {
  events?: EventItem[]; deviceZone?: string; selectedDate: string; onEditEvent?: (event: EventItem) => void; onSelectDate: (date: string) => void;
}) => <section data-testid="mobile-calendar" data-zone={deviceZone} data-selected-date={selectedDate}>
  {events.map(event => <span key={event.id}>{event.title}</span>)}
  <button aria-label="Edit event" onClick={() => events[0] && onEditEvent?.(events[0])}>Edit event</button>
  <button aria-label="Select event-only day" onClick={() => events[0] && onSelectDate(events[0].date)}>Select event-only day</button>
</section> }));
vi.mock('../../hooks/usePwa', () => ({ useOnlineStatus: () => true, usePwaInstall: () => ({ canInstall: false, install: vi.fn() }) }));
vi.mock('../../native/backButton', () => ({ useBackHandler: vi.fn() }));

const noop = () => {};
function shellProps(activeTab: 'today' | 'calendar' = 'today', events: EventItem[] = [selectedEvent]) {
  return {
    habits: { habits: [], days: [] }, onHabitsChange: noop,
    currentDocument: { date: '2026-10-26', type: 'daily' as const, headings: [], updatedAt: '' },
    dailyDocs: [{ date: '2026-10-24', type: 'daily' as const, headings: [], updatedAt: '' }],
    notes: [], settings: DEFAULT_SETTINGS, simulatedToday: '2026-10-26', events, deviceZone: 'America/Los_Angeles',
    onDateChange: noop, onUpdateDocument: noop, onPatchDocument: noop, onUpdateNotes: noop,
    onOpenQuickCapture: noop, onOpenSearch: noop, onOpenHistoricalModal: noop, onOpenHistoryDrawer: noop,
    onQuickHistoricalDone: noop, onMoveTask: noop, onReopenTask: noop, onTriggerRollover: noop,
    onOpenDay: noop, onEditEvent: vi.fn(), onUpdateEvent: vi.fn(), onDeleteEvent: vi.fn(), onMoveEvent: vi.fn(),
    syncStatus: 'idle' as const, activeTab, onTabChange: noop, onOpenSettings: noop,
  };
}

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => { if (root) act(() => root!.unmount()); host?.remove(); root = undefined; host = undefined; vi.restoreAllMocks(); });

it('passes events, device zone, and edit/checklist/delete/move actions into the phone Today view', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const props = shellProps();
  act(() => root!.render(<MobileAppShell {...props} />));
  expect(host.querySelector('[data-testid="mobile-today"]')?.textContent).toContain('Mobile event');
  expect(host.querySelector('[data-testid="mobile-today"]')?.getAttribute('data-zone')).toBe('America/Los_Angeles');
  for (const label of ['Edit event', 'Update event', 'Delete event', 'Move event']) act(() => host!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.click());
  expect(props.onEditEvent).toHaveBeenCalledWith(selectedEvent);
  expect(props.onUpdateEvent).toHaveBeenCalledWith(expect.objectContaining({ id: selectedEvent.id, title: 'Checklist changed' }), selectedEvent);
  expect(props.onDeleteEvent).toHaveBeenCalledWith(selectedEvent.id);
  expect(props.onMoveEvent).toHaveBeenCalledWith(selectedEvent.id, { date: '2026-10-26', startInstant: '2026-10-26T00:30:00.000Z' });
});

it('starts on an event-only today when the latest daily document is older', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const todayEvent = { ...selectedEvent, id: 'today-only-event', title: 'Today-only event', date: '2026-10-26',
    timing: { localTime: '09:30', timeZone: 'Asia/Tokyo', startInstant: '2026-10-26T00:30:00.000Z' } };
  const props = shellProps('calendar', [todayEvent]);
  act(() => root!.render(<MobileAppShell {...props} />));
  expect(host.querySelector('[data-testid="mobile-calendar"]')?.getAttribute('data-selected-date')).toBe('2026-10-26');
  expect(host.querySelector('[data-testid="mobile-calendar"]')?.textContent).toContain('Today-only event');
});

it('keeps an event-only Calendar date selected when changing tabs and reopening Calendar', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const props = shellProps('calendar');
  function Harness() {
    const [activeTab, setActiveTab] = useState<MobileTab>('calendar');
    return <MobileAppShell {...props} activeTab={activeTab} onTabChange={setActiveTab} />;
  }
  act(() => root!.render(<Harness />));
  act(() => host!.querySelector<HTMLButtonElement>('button[aria-label="Select event-only day"]')?.click());
  act(() => host!.querySelector<HTMLButtonElement>('nav button[aria-label="Today"]')?.click());
  act(() => host!.querySelector<HTMLButtonElement>('nav button[aria-label="Calendar"]')?.click());
  expect(host.querySelector('[data-testid="mobile-calendar"]')?.getAttribute('data-selected-date')).toBe(selectedEvent.date);
  expect(host.querySelector('[data-testid="mobile-calendar"]')?.textContent).toContain('Mobile event');
});
