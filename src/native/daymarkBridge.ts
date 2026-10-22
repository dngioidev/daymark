import { Capacitor, registerPlugin } from '@capacitor/core';
import { WidgetSnapshot } from '../utils/widgetSnapshot';

/** An action the user performed on the Android home-screen widget while the app was closed. */
export type WidgetAction = { type: 'toggle'; taskId: string } | { type: 'capture' };

interface DaymarkBridgePlugin {
  setSystemBars(options: { color: string; lightIcons: boolean }): Promise<void>;
  setSnapshot(snapshot: WidgetSnapshot): Promise<void>;
  consumeActions(): Promise<{ actions: WidgetAction[] }>;
  pinWidget(): Promise<{ requested: boolean }>;
}

// Implemented natively in mobile/android (DaymarkBridgePlugin.kt); absent on the web.
const Bridge = registerPlugin<DaymarkBridgePlugin>('DaymarkBridge');

/** True when running inside the Android app shell (not the browser/PWA). */
export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

/** Matches Android's status bar to the resolved header; browsers need no native update. */
export async function applySystemBars(color: string, lightIcons: boolean): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await Bridge.setSystemBars({ color, lightIcons });
  } catch (err) {
    console.error('Could not update the system bars', err);
  }
}

export async function pushWidgetSnapshot(snapshot: WidgetSnapshot): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await Bridge.setSnapshot(snapshot);
  } catch (err) {
    console.error('Could not update the home-screen widget', err);
  }
}

/** Asks Android to pin the Daymark widget to the home screen. False if the launcher does not support it. */
export async function requestPinWidget(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    return (await Bridge.pinWidget()).requested;
  } catch (err) {
    console.error('Could not request the home-screen widget', err);
    return false;
  }
}

export async function consumeWidgetActions(): Promise<WidgetAction[]> {
  if (!isNativeApp()) return [];
  try {
    return (await Bridge.consumeActions()).actions ?? [];
  } catch (err) {
    console.error('Could not read widget actions', err);
    return [];
  }
}
