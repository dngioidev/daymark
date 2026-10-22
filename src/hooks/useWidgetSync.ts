import { useEffect, useRef } from 'react';
import { DailyDocument, ResolvedAppearance } from '../types/daymark';
import { consumeWidgetActions, isNativeApp, pushWidgetSnapshot, setAppColors } from '../native/daymarkBridge';
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
  onCapture: () => void,
  onConfigure: (widgetId: number) => void,
  appearance: ResolvedAppearance,
): void {
  const toggleRef = useRef(onToggleTask);
  toggleRef.current = onToggleTask;
  const captureRef = useRef(onCapture);
  captureRef.current = onCapture;
  const configureRef = useRef(onConfigure);
  configureRef.current = onConfigure;

  useEffect(() => {
    void setAppColors({ headerBg: appearance.headerBgOpaque, headerText: appearance.headerText, accent: appearance.accent, dark: appearance.theme === 'dark' });
  }, [appearance.headerBgOpaque, appearance.headerText, appearance.accent, appearance.theme]);

  // Apply widget actions on start and whenever the app returns to the foreground
  useEffect(() => {
    if (!isNativeApp()) return;
    const applyPending = async () => {
      for (const action of await consumeWidgetActions()) {
        if (action.type === 'toggle') toggleRef.current(action.taskId);
        else if (action.type === 'capture') captureRef.current();
        else if (action.type === 'configure') configureRef.current(action.widgetId);
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
