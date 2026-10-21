import { useEffect, useRef } from 'react';
import { DailyDocument } from '../types/daymark';
import { consumeWidgetActions, isNativeApp, pushWidgetSnapshot } from '../native/daymarkBridge';
import { buildWidgetSnapshot } from '../utils/widgetSnapshot';

/**
 * Keeps the Android home-screen widget in sync (no-op in the browser/PWA):
 *  - applies actions queued by the widget (checkbox taps, the + button) when the app starts or resumes;
 *  - pushes a snapshot of today's tasks to the widget whenever they change.
 * Actions are consumed before a snapshot is pushed so a stale snapshot can never undo them.
 */
export function useWidgetSync(
  today: string,
  todayDoc: DailyDocument | undefined,
  onToggleTask: (taskId: string) => void,
  onCapture: () => void
): void {
  const toggleRef = useRef(onToggleTask);
  toggleRef.current = onToggleTask;
  const captureRef = useRef(onCapture);
  captureRef.current = onCapture;

  // Apply widget actions on start and whenever the app returns to the foreground
  useEffect(() => {
    if (!isNativeApp()) return;
    const applyPending = async () => {
      for (const action of await consumeWidgetActions()) {
        if (action.type === 'toggle') toggleRef.current(action.taskId);
        else if (action.type === 'capture') captureRef.current();
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void applyPending();
    };
    void applyPending();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', applyPending);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', applyPending);
    };
  }, []);

  // Push today's tasks to the widget (debounced)
  useEffect(() => {
    if (!isNativeApp()) return;
    const timer = setTimeout(() => void pushWidgetSnapshot(buildWidgetSnapshot(todayDoc, today)), 300);
    return () => clearTimeout(timer);
  }, [today, todayDoc]);
}
