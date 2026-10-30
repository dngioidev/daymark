import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { AppSettings, DailyDocument, HabitData, ResolvedAppearance } from '../types/daymark';
import { consumeWidgetActions, isNativeApp, pushWidgetSnapshot, setAppColors, setHabitSnapshot } from '../native/daymarkBridge';
import { resolveAlertDays } from '../utils/alertDays';
import { buildWidgetSnapshot } from '../utils/widgetSnapshot';
import { applyWidgetAction, buildHabitWidgetSnapshot } from '../utils/habitWidgetSnapshot';

/**
 * Keeps the Android home-screen widgets in sync (no-op in the browser/PWA):
 *  - applies actions queued by the widgets when the app starts or resumes;
 *  - pushes snapshots whenever today's tasks or habits change.
 * Actions are consumed before snapshots are pushed so stale snapshots cannot undo them.
 */
export function useWidgetSync(
  today: string,
  todayDoc: DailyDocument | undefined,
  onToggleTask: (taskId: string) => void,
  onCapture: () => void,
  onConfigure: (widgetId: number) => void,
  appearance: ResolvedAppearance,
  habits: HabitData,
  onHabitsChange: Dispatch<SetStateAction<HabitData>>,
  onOpenHabits: () => void,
  settings: Pick<AppSettings, 'alertDays'> = {},
): void {
  const { tasks: taskDays, habits: habitDays } = resolveAlertDays(settings);
  const toggleRef = useRef(onToggleTask);
  toggleRef.current = onToggleTask;
  const captureRef = useRef(onCapture);
  captureRef.current = onCapture;
  const configureRef = useRef(onConfigure);
  configureRef.current = onConfigure;
  const habitsChangeRef = useRef(onHabitsChange);
  habitsChangeRef.current = onHabitsChange;
  const openHabitsRef = useRef(onOpenHabits);
  openHabitsRef.current = onOpenHabits;
  const todayRef = useRef(today);
  todayRef.current = today;
  const applying = useRef(false);
  const actionRevision = useRef(0);
  const [settledRevision, setSettledRevision] = useState(0);

  useEffect(() => {
    void setAppColors({ headerBg: appearance.headerBgOpaque, headerText: appearance.headerText, accent: appearance.accent, dark: appearance.theme === 'dark' });
  }, [appearance.headerBgOpaque, appearance.headerText, appearance.accent, appearance.theme]);

  useEffect(() => {
    if (!isNativeApp()) return;
    const applyPending = async () => {
      // Focus and visibilitychange can arrive together. Never replay queues concurrently.
      if (applying.current) return;
      applying.current = true;
      ++actionRevision.current;
      try {
        for (const action of await consumeWidgetActions()) {
          if (action.type === 'toggle') toggleRef.current(action.taskId);
          else if (action.type === 'capture') captureRef.current();
          else if (action.type === 'configure') configureRef.current(action.widgetId);
          else if (action.type === 'habits') openHabitsRef.current();
          else if (action.type === 'habit') {
            const resolvedToday = todayRef.current;
            habitsChangeRef.current((current) => applyWidgetAction(current, action, resolvedToday));
          }
        }
      } finally {
        applying.current = false;
        // Batched with functional updates above so snapshots see the committed habit state.
        setSettledRevision(actionRevision.current);
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

  useEffect(() => {
    if (!isNativeApp() || !settledRevision || applying.current) return;
    const timer = setTimeout(() => {
      if (applying.current || settledRevision !== actionRevision.current) return;
      void pushWidgetSnapshot(buildWidgetSnapshot(todayDoc, today, taskDays));
      void setHabitSnapshot(buildHabitWidgetSnapshot(habits, today, habitDays));
    }, 300);
    return () => clearTimeout(timer);
  }, [today, todayDoc, habits, settledRevision, taskDays, habitDays]);
}
