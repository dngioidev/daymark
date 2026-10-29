// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Menu } from './Menu';

let root: Root;
let host: HTMLDivElement;
let underneath: HTMLButtonElement;
let onUnderlyingClick: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  host = document.createElement('div');
  underneath = document.createElement('button');
  onUnderlyingClick = vi.fn();
  underneath.addEventListener('click', onUnderlyingClick);
  document.body.append(host, underneath);
  root = createRoot(host);
  act(() => root.render(React.createElement(Menu, {
    trigger: (props) => React.createElement('button', props, 'Open menu'),
    items: [{ label: 'Action', onSelect: vi.fn() }],
  })));
});

afterEach(() => {
  act(() => root.unmount());
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function openMenu() {
  const trigger = host.querySelector('button')!;
  act(() => trigger.click());
  return trigger;
}

it('dismisses a phone backdrop tap and swallows the follow-up click on the control underneath', () => {
  openMenu();
  const backdrop = document.querySelector('[role="menu"]')!.previousElementSibling!;
  const pointer = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
  act(() => backdrop.dispatchEvent(pointer));
  expect(document.querySelector('[role="menu"]')).toBeNull();
  // Simulate the browser retargeting click after the backdrop has unmounted.
  act(() => underneath.click());
  expect(onUnderlyingClick).not.toHaveBeenCalled();
  expect(pointer.defaultPrevented).toBe(true);
  act(() => underneath.click());
  expect(onUnderlyingClick).toHaveBeenCalledTimes(1);
});

it('expires the phone click guard when no follow-up click arrives', () => {
  openMenu();
  const backdrop = document.querySelector('[role="menu"]')!.previousElementSibling!;
  act(() => backdrop.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })));
  act(() => vi.advanceTimersByTime(1000));
  act(() => underneath.click());
  expect(onUnderlyingClick).toHaveBeenCalledTimes(1);
});

it('closes a desktop outside pointerdown without restoring trigger focus or blocking the outside click', () => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
  const trigger = openMenu();
  document.querySelector<HTMLElement>('[role="menuitem"]')!.focus();
  const restoreFocus = vi.spyOn(trigger, 'focus');
  act(() => underneath.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(restoreFocus).not.toHaveBeenCalled();
  act(() => underneath.click());
  expect(onUnderlyingClick).toHaveBeenCalledTimes(1);
});

it.each(['Escape', 'select'])('keeps default trigger focus restoration on %s', closeWith => {
  const trigger = openMenu(); const action = document.querySelector<HTMLElement>('[role=menuitem]')!;
  act(() => action.focus());
  if (closeWith === 'Escape') act(() => action.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  else act(() => action.click());
  expect(document.activeElement).toBe(trigger);
});
it('allows an opener to override the menu focus return target', () => {
  act(() => root.render(React.createElement(Menu, {
    returnFocusTo: () => underneath,
    trigger: props => React.createElement('button', props, 'Open menu'),
    items: [{ label: 'Action', onSelect: vi.fn() }],
  })));
  openMenu(); const action = document.querySelector<HTMLElement>('[role=menuitem]')!;
  act(() => action.focus()); act(() => action.click());
  expect(document.activeElement).toBe(underneath);
});
