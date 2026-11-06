// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { isStylusButtonHeld, onStylusButtonChange, setStylusButtonHeld, STYLUS_BUTTON_EVENT } from './stylusButton';

afterEach(() => setStylusButtonHeld(false));

it('follows the event the Android app dispatches', () => {
  window.dispatchEvent(new CustomEvent(STYLUS_BUTTON_EVENT, { detail: { pressed: true } }));
  expect(isStylusButtonHeld()).toBe(true);
  window.dispatchEvent(new CustomEvent(STYLUS_BUTTON_EVENT, { detail: { pressed: false } }));
  expect(isStylusButtonHeld()).toBe(false);
});

it('notifies listeners only on a change, and stops after unsubscribe', () => {
  const listener = vi.fn();
  const off = onStylusButtonChange(listener);
  setStylusButtonHeld(true); setStylusButtonHeld(true); setStylusButtonHeld(false);
  expect(listener.mock.calls).toEqual([[true], [false]]);
  off(); setStylusButtonHeld(true);
  expect(listener).toHaveBeenCalledTimes(2);
});

it('treats a malformed event as released', () => {
  setStylusButtonHeld(true);
  window.dispatchEvent(new CustomEvent(STYLUS_BUTTON_EVENT, { detail: null }));
  expect(isStylusButtonHeld()).toBe(false);
});
