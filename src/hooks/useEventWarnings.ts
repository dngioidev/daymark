import { useCallback, useEffect, useRef, useState } from 'react';
import type { EventItem } from '../types/daymark';
import { isNativeApp } from '../native/daymarkBridge';
import { dueEventWarnings } from '../utils/events';

export interface EventWarningNotice {
  key: string;
  event: EventItem;
}

export interface EventWarningState {
  notices: EventWarningNotice[];
  dismiss: (notice: EventWarningNotice) => void;
}

const noticeKey = (event: EventItem) => `${event.id}|${event.timing?.startInstant ?? ''}`;

/** Tracks upcoming event notices only while the application is visible and active. */
export function useEventWarnings(
  events: EventItem[],
  leadMinutes: number | null,
  notify: (event: EventItem) => void,
): EventWarningState {
  const [notices, setNotices] = useState<EventWarningNotice[]>([]);
  const noticesRef = useRef(notices);
  const seen = useRef(new Set<string>());
  const dismissed = useRef(new Set<string>());
  const eventsRef = useRef(events);
  const leadRef = useRef(leadMinutes);
  const notifyRef = useRef(notify);
  const active = useRef(!isNativeApp());
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const nextStartTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  eventsRef.current = events;
  leadRef.current = leadMinutes;
  notifyRef.current = notify;

  const evaluate = useCallback(() => {
    const isVisible = document.visibilityState === 'visible';
    if (!active.current || !isVisible) return;
    const nowMs = Date.now();
    const due = dueEventWarnings(eventsRef.current, nowMs, leadRef.current);
    if (nextStartTimer.current !== undefined) clearTimeout(nextStartTimer.current);
    const nextStart = due.length ? Date.parse(due[0].timing!.startInstant) : undefined;
    if (nextStart !== undefined) {
      nextStartTimer.current = setTimeout(evaluate, Math.min(2_147_483_647, Math.max(1, nextStart - nowMs)));
    } else nextStartTimer.current = undefined;
    const currentKeys = new Set(due.map(noticeKey));
    const latestByKey = new Map(due.map((event) => [noticeKey(event), event]));
    const next = noticesRef.current.filter((notice) => currentKeys.has(notice.key)).map((notice) => ({
      ...notice,
      event: latestByKey.get(notice.key)!,
    }));
    const retained = new Set(next.map((notice) => notice.key));
    for (const event of due) {
      const key = noticeKey(event);
      if (retained.has(key) || dismissed.current.has(key) || seen.current.has(key)) continue;
      seen.current.add(key);
      notifyRef.current(event);
      next.push({ key, event });
    }
    const unchanged = next.length === noticesRef.current.length && next.every((notice, index) =>
      notice.key === noticesRef.current[index].key && notice.event === noticesRef.current[index].event);
    if (!unchanged) {
      noticesRef.current = next;
      setNotices(next);
    }
  }, []);

  const startTimer = useCallback(() => {
    if (!active.current || document.visibilityState !== 'visible' || timer.current !== undefined) return;
    timer.current = setInterval(evaluate, 30_000);
  }, [evaluate]);
  const stopTimer = useCallback(() => {
    if (timer.current !== undefined) clearInterval(timer.current);
    timer.current = undefined;
    if (nextStartTimer.current !== undefined) clearTimeout(nextStartTimer.current);
    nextStartTimer.current = undefined;
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        evaluate();
        startTimer();
      } else stopTimer();
    };
    const onFocus = () => evaluate();
    if (!isNativeApp()) {
      active.current = true;
      evaluate();
      startTimer();
    } else {
      active.current = false;
      stopTimer();
    }
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    let disposed = false;
    let nativeListener: { remove: () => Promise<void> } | undefined;
    if (isNativeApp()) {
      let activationVersion = 0;
      void import('@capacitor/app').then(async ({ App }) => {
        const listener = await App.addListener('appStateChange', ({ isActive }) => {
          activationVersion += 1;
          active.current = isActive;
          if (isActive) {
            evaluate();
            startTimer();
          } else stopTimer();
        });
        if (disposed) { void listener.remove(); return; }
        nativeListener = listener;
        const version = activationVersion;
        const state = await App.getState();
        if (disposed || version !== activationVersion) return;
        active.current = state.isActive;
        if (state.isActive) { evaluate(); startTimer(); }
        else stopTimer();
      }).catch(() => {
        // Until the native bridge confirms foreground state, remain inactive.
      });
    }
    return () => {
      disposed = true;
      stopTimer();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      if (nativeListener) void nativeListener.remove();
    };
  }, [evaluate, startTimer, stopTimer]);

  useEffect(() => { evaluate(); }, [events, leadMinutes, evaluate]);

  const dismiss = useCallback((notice: EventWarningNotice) => {
    dismissed.current.add(notice.key);
    const next = noticesRef.current.filter(({ key }) => key !== notice.key);
    noticesRef.current = next;
    setNotices(next);
  }, []);

  return { notices, dismiss };
}
