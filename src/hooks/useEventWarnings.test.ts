// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventItem } from '../types/daymark';
import { useEventWarnings } from './useEventWarnings';
const native = vi.hoisted(() => ({ enabled: false, active: false, listener: undefined as ((state: { isActive: boolean }) => void) | undefined, remove: vi.fn() }));
vi.mock('../native/daymarkBridge', () => ({ isNativeApp: () => native.enabled }));
vi.mock('@capacitor/app', () => ({ App: {
  addListener: vi.fn(async (_event: string, callback: typeof native.listener) => { native.listener = callback; return { remove: native.remove }; }),
  getState: vi.fn(async () => ({ isActive: native.active })),
} }));

const event = (startInstant: string): EventItem => ({
  id: 'event-a', title: 'Appointment', date: '2026-11-20', heading: 'Work', order: 1,
  timing: { localTime: startInstant.slice(11, 16), timeZone: 'UTC', startInstant },
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
});
let latest: ReturnType<typeof useEventWarnings> | undefined;
function Probe({ events, lead = 15, notify }: { events: EventItem[]; lead?: number | null; notify: (item: EventItem) => void }) {
  latest = useEventWarnings(events, lead, notify);
  return null;
}
const host = document.createElement('div');
let root: ReturnType<typeof createRoot>;

function render(events: EventItem[], notify: (item: EventItem) => void, lead?: number | null) {
  act(() => root.render(React.createElement(Probe, { events, lead, notify })));
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); root?.unmount(); document.body.replaceChildren(); latest = undefined; native.enabled = false; native.active = false; native.listener = undefined; native.remove.mockClear(); });

describe('useEventWarnings', () => {
  it('warns once per event start, retains a dismissible notice, and drops it when the start passes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T09:50:00.000Z'));
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const notify = vi.fn();
    document.body.append(host); root = createRoot(host);
    const first = event('2026-11-20T10:00:00.000Z');
    render([first], notify);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(latest?.notices.map(({ event: item }) => item.id)).toEqual(['event-a']);
    render([{ ...first }], notify);
    act(() => window.dispatchEvent(new Event('focus')));
    expect(notify).toHaveBeenCalledTimes(1);
    act(() => latest?.dismiss(latest.notices[0]));
    expect(latest?.notices).toEqual([]);
    render([first], notify);
    expect(notify).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-11-20T10:00:00.000Z'));
    act(() => vi.advanceTimersByTime(30_000));
    expect(latest?.notices).toEqual([]);
    act(() => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
  });

  it('refreshes on foreground, ignores a start already in the past, and treats an edited start as new', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T09:50:00.000Z'));
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const notify = vi.fn();
    document.body.append(host); root = createRoot(host);
    render([], notify);
    const due = event('2026-11-20T10:00:00.000Z');
    render([due], notify);
    expect(notify).toHaveBeenCalledTimes(1);
    render([event('2026-11-20T09:49:00.000Z')], notify);
    expect(latest?.notices).toEqual([]);
    render([event('2026-11-20T10:04:00.000Z')], notify);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('does not warn while hidden and reevaluates immediately when visible', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T09:50:00.000Z'));
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const original = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    let visibility: DocumentVisibilityState = 'hidden';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    const notify = vi.fn(); document.body.append(host); root = createRoot(host);
    const due = event('2026-11-20T10:00:00.000Z');
    try {
      render([due], notify);
      expect(notify).not.toHaveBeenCalled();
      visibility = 'visible';
      act(() => document.dispatchEvent(new Event('visibilitychange')));
      expect(notify).toHaveBeenCalledTimes(1);
      visibility = 'hidden'; act(() => document.dispatchEvent(new Event('visibilitychange')));
      vi.setSystemTime(new Date('2026-11-20T10:01:00.000Z'));
      act(() => vi.advanceTimersByTime(60_000));
      expect(notify).toHaveBeenCalledTimes(1);
      visibility = 'visible'; act(() => document.dispatchEvent(new Event('visibilitychange')));
      expect(latest?.notices).toEqual([]);
    } finally {
      if (original) Object.defineProperty(document, 'visibilityState', original); else Reflect.deleteProperty(document, 'visibilityState');
    }
  });
  it('does not notify in native background and immediately reevaluates on resume', async () => {
    native.enabled = true; native.active = false;
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-20T09:50:00.000Z'));
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const notify = vi.fn(); document.body.append(host); root = createRoot(host);
    const due = event('2026-11-20T10:00:00.000Z');
    await act(async () => root.render(React.createElement(Probe, { events: [due], lead: 15, notify })));
    await act(async () => Promise.resolve());
    expect(notify).not.toHaveBeenCalled();
    await act(async () => native.listener!({ isActive: true }));
    expect(notify).toHaveBeenCalledOnce();
    await act(async () => native.listener!({ isActive: false }));
    vi.setSystemTime(new Date('2026-11-20T10:01:00.000Z'));
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    await act(async () => native.listener!({ isActive: true }));
    expect(latest?.notices).toEqual([]);
    expect(notify).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    expect(native.remove).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not repeat a seen warning when synced event objects and notify callbacks are replaced', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-20T09:50:00.000Z'));
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const notify = vi.fn(); document.body.append(host); root = createRoot(host);
    const due = event('2026-11-20T10:00:00.000Z');
    render([due], notify);
    render([{ ...due, title: 'Synced update' }], vi.fn());
    expect(notify).toHaveBeenCalledOnce();
    expect(latest?.notices[0].event.title).toBe('Synced update');
  });
});
