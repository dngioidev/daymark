// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { MobileAppShell } from './MobileAppShell';
import { DEFAULT_SETTINGS } from '../../utils/defaultData';
import { installBackButton } from '../../native/backButton';
import * as bridge from '../../native/daymarkBridge';

const native = vi.hoisted(() => ({ back: undefined as (() => void) | undefined, minimize: vi.fn() }));
vi.mock('@capacitor/app', () => ({ App: {
  addListener: vi.fn(async (_event: string, listener: () => void) => { native.back = listener; }),
  minimizeApp: native.minimize,
} }));

function shellProps(): React.ComponentProps<typeof MobileAppShell> {
  const noop = vi.fn();
  return {
    habits: { habits: [], days: [] }, onHabitsChange: noop,
    currentDocument: { date: '2026-10-26', type: 'daily', headings: [], updatedAt: '' },
    dailyDocs: [], notes: [], settings: DEFAULT_SETTINGS, simulatedToday: '2026-10-26',
    onDateChange: noop, onUpdateDocument: noop, onPatchDocument: noop, onUpdateNotes: noop,
    onOpenQuickCapture: noop, onOpenSearch: noop, onOpenHistoricalModal: noop,
    onOpenHistoryDrawer: noop, onQuickHistoricalDone: noop, onMoveTask: noop,
    onReopenTask: noop, onTriggerRollover: noop, onOpenDay: noop,
    syncStatus: 'idle', activeTab: 'backlog', onTabChange: noop, onOpenSettings: noop,
    backlogSlot: React.createElement('h1', null, 'Backlog content'),
  };
}

it('makes Backlog reachable in the five-slot phone navigation and shows its content', () => {
  const props = shellProps();
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(React.createElement(MobileAppShell, props));
  const nav = host.querySelector('nav')!;
  expect([...nav.querySelectorAll('button')].map(b => b.getAttribute('aria-label') ?? b.textContent))
    .toEqual(['Today', 'Calendar', 'New task', 'Backlog', 'Notes']);
  expect(nav.querySelector('[aria-current="page"]')?.textContent).toBe('Backlog');
  expect(host.querySelector('main h1')?.textContent).toBe('Backlog content');
  expect(host.querySelector('.dm-side-rail')).toBeNull();
});

it('routes Android Back from Backlog to Today before minimising the app', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const platform = vi.spyOn(bridge, 'isNativeApp').mockReturnValue(true);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host), props = shellProps();
  try {
    await installBackButton();
    await act(async () => root.render(React.createElement(MobileAppShell, props)));
    act(() => native.back!());
    expect(props.onTabChange).toHaveBeenCalledWith('today');
    expect(native.minimize).not.toHaveBeenCalled();
    await act(async () => root.render(React.createElement(MobileAppShell, { ...props, activeTab: 'today' })));
    act(() => native.back!());
    expect(native.minimize).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount()); host.remove(); platform.mockRestore(); vi.unstubAllGlobals();
  }
});

it('opens Settings from a 44px header icon and preserves the sync shortcut', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host), props = shellProps();
  try {
    await act(async () => root.render(React.createElement(MobileAppShell, props)));
    const settings = host.querySelector<HTMLButtonElement>('header [aria-label="Settings"]')!;
    expect(settings).not.toBeNull(); expect(settings.title).toBe('Settings');
    expect(settings.classList.contains('w-[44px]')).toBe(true);
    expect(settings.classList.contains('h-[44px]')).toBe(true);
    act(() => settings.click()); expect(props.onOpenSettings).toHaveBeenLastCalledWith();
    act(() => host.querySelector<HTMLButtonElement>('header [aria-label^="Sync:"]')!.click());
    expect(props.onOpenSettings).toHaveBeenLastCalledWith('sync');
    expect(host.querySelector('nav [aria-label="Settings"]')).toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
