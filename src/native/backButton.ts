import { useEffect, useRef } from 'react';
import { isNativeApp } from './daymarkBridge';

/**
 * Android hardware/gesture Back: closes the topmost open thing (dialog, editor, tab) instead
 * of quitting the app. Handlers are tried newest first; the first that returns true wins.
 * If none handles it, the app is minimised (like other Android apps) rather than killed.
 */
type BackHandler = () => boolean;
const handlers: BackHandler[] = [];

export function useBackHandler(handler: BackHandler, active = true): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return;
    const fn: BackHandler = () => ref.current();
    handlers.push(fn);
    return () => {
      const i = handlers.lastIndexOf(fn);
      if (i >= 0) handlers.splice(i, 1);
    };
  }, [active]);
}

let installed = false;
export async function installBackButton(): Promise<void> {
  if (installed || !isNativeApp()) return;
  installed = true;
  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', () => {
    for (let i = handlers.length - 1; i >= 0; i--) {
      if (handlers[i]()) return;
    }
    void App.minimizeApp();
  });
}
