import { useEffect, useState } from 'react';
import { isNativeApp } from '../native/daymarkBridge';

function readDeviceTimeZone(): string {
  try {
    const candidate = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (candidate) {
      new Intl.DateTimeFormat('en', { timeZone: candidate });
      return candidate;
    }
  } catch {
    // Some embedded runtimes expose no usable default time zone.
  }
  return 'UTC';
}

/** Tracks a device-zone change after resume, focus, visibility and while the page is active. */
export function useDeviceTimeZone(): string {
  const [zone, setZone] = useState(readDeviceTimeZone);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let disposed = false;
    let nativeListener: { remove: () => Promise<void> } | undefined;
    const refresh = () => setZone(readDeviceTimeZone());
    const startTimer = () => {
      if (document.visibilityState === 'visible' && timer === undefined) timer = setInterval(refresh, 30_000);
    };
    const stopTimer = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh();
        startTimer();
      } else stopTimer();
    };
    const onFocus = () => refresh();

    startTimer();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    if (isNativeApp()) {
      void import('@capacitor/app').then(({ App }) => App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) refresh();
      })).then((listener) => {
        if (disposed) void listener.remove();
        else nativeListener = listener;
      }).catch(() => undefined);
    }

    return () => {
      disposed = true;
      stopTimer();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      if (nativeListener) void nativeListener.remove();
    };
  }, []);

  return zone;
}
