// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventItem } from '../../types/daymark';
import type { EventWarningNotice } from '../../hooks/useEventWarnings';
import { EventWarningQueue } from './EventWarningQueue';

const event = (id: string): EventItem => ({ id, title: `Event ${id}`, date: '2026-11-20', heading: 'Work', order: 1,
  timing: { localTime: '10:00', timeZone: 'UTC', startInstant: '2026-11-20T10:00:00.000Z' },
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' });
const notice = (item: EventItem): EventWarningNotice => ({ key: `${item.id}|${item.timing!.startInstant}`, event: item });
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
function render(notices: EventWarningNotice[], onDismiss: (n: EventWarningNotice) => void, onOpen: (e: EventItem) => void, mobileNavigation = false) {
  act(() => root.render(React.createElement(EventWarningQueue, { notices, onDismiss, onOpen, deviceZone: 'America/Los_Angeles', mobileNavigation })));
}
afterEach(() => { root?.unmount(); document.body.replaceChildren(); vi.restoreAllMocks(); });

describe('EventWarningQueue', () => {
  it('keeps simultaneous warnings visible with independent dismiss and open actions', () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    const a = notice(event('a')); const b = notice(event('b'));
    const dismiss = vi.fn(); const open = vi.fn();
    render([a, b], dismiss, open);
    expect(host.textContent).toContain('Event a');
    expect(host.textContent).toContain('Event b');
    expect(host.textContent).toContain('2026-11-20');
    expect(host.textContent).toContain('Your local time:');
    expect(host.querySelector('section')?.className).toContain('max-h-');
    expect(host.querySelectorAll('button')[1].className).toContain('min-h-11');
    const dismissButton = Array.from(host.querySelectorAll('button')).find(button => button.getAttribute('aria-label') === 'Dismiss Event a');
    const openButton = Array.from(host.querySelectorAll('button')).find(button => button.getAttribute('aria-label') === 'Open Event b');
    expect(dismissButton).toBeTruthy(); expect(openButton).toBeTruthy();
    act(() => dismissButton!.click()); act(() => openButton!.click());
    expect(dismiss).toHaveBeenCalledWith(a); expect(open).toHaveBeenCalledWith(b.event);
  });

  it('offsets the queue from bottom navigation whenever the app is in mobile mode', () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    render([notice(event('mobile'))], vi.fn(), vi.fn());
    expect(host.querySelector('section')?.className).toContain('bottom-4');
    render([notice(event('mobile'))], vi.fn(), vi.fn(), true);
    expect(host.querySelector('section')?.className).toContain('bottom-[calc(env(safe-area-inset-bottom)+5rem)]');
  });
});
