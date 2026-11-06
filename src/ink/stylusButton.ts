// The Android app forwards the S Pen side button (MainActivity → 'daymark-stylus-button'),
// because its WebView leaves the button out of pointer events. Browsers that do report it
// set `buttons` on the pen pointer instead (see pointerPolicy.isPenEraserButton).
export const STYLUS_BUTTON_EVENT = 'daymark-stylus-button';

let held = false;
const listeners = new Set<(pressed: boolean) => void>();

export function isStylusButtonHeld(): boolean {
  return held;
}

/** Subscribe to changes of the forwarded button; returns an unsubscribe function. */
export function onStylusButtonChange(listener: (pressed: boolean) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function setStylusButtonHeld(pressed: boolean): void {
  if (pressed === held) return;
  held = pressed;
  for (const listener of [...listeners]) listener(pressed);
}

if (typeof window !== 'undefined') {
  window.addEventListener(STYLUS_BUTTON_EVENT, event => {
    setStylusButtonHeld(Boolean((event as CustomEvent<{ pressed?: unknown }>).detail?.pressed));
  });
}
