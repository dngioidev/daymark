import { useEffect, useState } from 'react';
import { formatLocalDate, msUntilNextLocalMidnight } from '../utils/clock';

/**
 * Returns the current local date (YYYY-MM-DD) and updates it at local midnight,
 * and whenever the tab regains focus (timers are throttled while a phone sleeps).
 */
export function useRealToday(): string {
  const [today, setToday] = useState<string>(() => formatLocalDate());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => setToday(formatLocalDate());
    const schedule = () => {
      timer = setTimeout(() => {
        refresh();
        schedule();
      }, msUntilNextLocalMidnight() + 1000);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  return today;
}
