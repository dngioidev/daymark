// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDeviceTimeZone } from './useDeviceTimeZone';

const native = vi.hoisted(() => ({ enabled: false, zone: 'Europe/London', listener: undefined as ((state: { isActive: boolean }) => void) | undefined, remove: vi.fn() }));
vi.mock('../native/daymarkBridge', () => ({ isNativeApp: () => native.enabled }));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(async (_event: string, callback: typeof native.listener) => { native.listener = callback; return { remove: native.remove }; }) } }));

function Probe({ onZone }: { onZone: (zone: string) => void }) { onZone(useDeviceTimeZone()); return null; }

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.replaceChildren(); native.enabled = false; native.zone = 'Europe/London'; native.listener = undefined; native.remove.mockClear(); });

function stubZone() {
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation((function () {
    return { resolvedOptions: () => ({ timeZone: native.zone }) } as Intl.DateTimeFormat;
  }) as typeof Intl.DateTimeFormat);
}

describe('useDeviceTimeZone', () => {
  it('refreshes on focus, visible-page timer, and cleans up after unmount', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    stubZone();
    const seen: string[] = [];
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(React.createElement(Probe, { onZone: value => seen.push(value) })));
    expect(seen.at(-1)).toBe('Europe/London');
    native.zone = 'Asia/Tokyo';
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(seen.at(-1)).toBe('Asia/Tokyo');
    native.zone = 'America/Los_Angeles';
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(seen.at(-1)).toBe('America/Los_Angeles');
    await act(async () => root.unmount());
    native.zone = 'UTC';
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(seen.at(-1)).toBe('America/Los_Angeles');
  });

  it('refreshes on native resume and removes the Capacitor listener', async () => {
    native.enabled = true;
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    stubZone();
    const addListener = (await import('@capacitor/app')).App.addListener;
    const seen: string[] = [];
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(React.createElement(Probe, { onZone: value => seen.push(value) })));
    await act(async () => Promise.resolve());
    expect(addListener).toHaveBeenCalledWith('appStateChange', expect.any(Function));
    expect(native.listener).toBeDefined();
    native.zone = 'Asia/Tokyo';
    await act(async () => native.listener!({ isActive: true }));
    expect(seen.at(-1)).toBe('Asia/Tokyo');
    await act(async () => root.unmount());
    expect(native.remove).toHaveBeenCalledOnce();
    expect(seen.length).toBeGreaterThan(0);
  });

  it('pauses polling while hidden and refreshes immediately when visible again', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    stubZone();
    let visibility: DocumentVisibilityState = 'hidden';
    const original = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    const seen: string[] = [];
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(React.createElement(Probe, { onZone: value => seen.push(value) })));
      expect(seen.at(-1)).toBe('Europe/London');
      native.zone = 'Asia/Tokyo';
      await act(async () => vi.advanceTimersByTimeAsync(60_000));
      expect(seen.at(-1)).toBe('Europe/London');
      visibility = 'visible';
      await act(async () => document.dispatchEvent(new Event('visibilitychange')));
      expect(seen.at(-1)).toBe('Asia/Tokyo');
      native.zone = 'America/Los_Angeles';
      await act(async () => vi.advanceTimersByTimeAsync(30_000));
      expect(seen.at(-1)).toBe('America/Los_Angeles');
    } finally {
      await act(async () => root.unmount());
      if (original) Object.defineProperty(document, 'visibilityState', original);
      else Reflect.deleteProperty(document, 'visibilityState');
    }
  });

  it('falls back to UTC when the runtime reports an unusable zone', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation((function (...args: unknown[]) {
      if (args.length > 1 && typeof args[1] === 'object' && args[1] && 'timeZone' in args[1]) throw new RangeError('Unknown time zone');
      return { resolvedOptions: () => ({ timeZone: 'Not/AZone' }) } as Intl.DateTimeFormat;
    }) as typeof Intl.DateTimeFormat);
    const seen: string[] = [];
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(React.createElement(Probe, { onZone: value => seen.push(value) })));
    expect(seen.at(-1)).toBe('UTC');
    await act(async () => root.unmount());
  });
});
