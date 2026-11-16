// @vitest-environment jsdom
import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import type { EventItem } from '../../types/daymark';
vi.mock('../../native/backButton', () => ({ useBackHandler: vi.fn() }));
import { EventCard } from './EventCard';
import { useBackHandler } from '../../native/backButton';

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); document.body.replaceChildren(); });

describe('EventCard date move', () => {
  it('requires an explicit offset choice before moving into a repeated local time', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const event: EventItem = { id: 'event-fold', title: 'Planning', date: '2026-10-31', heading: 'Work', order: 1,
      timing: { localTime: '01:45', timeZone: 'America/New_York', startInstant: '2026-10-31T05:45:00.000Z' },
      createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z' };
    const onMove = vi.fn();
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(React.createElement(EventCard, {
      event, sectionNames: ['Work'], onEdit: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn(), onMove,
    })));
    const clickText = (text: string) => {
      const button = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === text);
      if (!button) throw new Error(`Missing button: ${text}`);
      act(() => button.click());
    };
    try {
      const menuButton = document.body.querySelector<HTMLButtonElement>('button[aria-label^="More actions for event"]');
      expect(menuButton).not.toBeNull();
      act(() => menuButton!.click());
      clickText('Move to date…');
      const date = document.body.querySelector<HTMLInputElement>('#event-move-date-input')!;
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(date, '2026-11-01');
        date.dispatchEvent(new Event('input', { bubbles: true }));
        date.dispatchEvent(new Event('change', { bubbles: true }));
      });
      const form = document.body.querySelector<HTMLFormElement>('#event-move-date')!;
      act(() => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      expect(onMove).not.toHaveBeenCalled();
      const occurrence = document.body.querySelector<HTMLSelectElement>('[aria-label="Move time occurrence"]');
      expect(occurrence).not.toBeNull();
      expect(occurrence!.textContent).toContain('UTC-05:00');
      act(() => { occurrence!.value = '2026-11-01T06:45:00.000Z'; occurrence!.dispatchEvent(new Event('change', { bubbles: true })); });
      act(() => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      expect(onMove).toHaveBeenCalledWith('event-fold', { date: '2026-11-01', startInstant: '2026-11-01T06:45:00.000Z' });

      act(() => menuButton!.click());
      clickText('Move to date…');
      const backHandler = vi.mocked(useBackHandler).mock.calls.filter(([, active]) => active).at(-1)![0];
      let handled = false;
      act(() => { handled = backHandler(); });
      expect(handled).toBe(true);
      expect(document.body.querySelector('#event-move-date-input')).toBeNull();
    } finally { await act(async () => root.unmount()); }
  });
});
