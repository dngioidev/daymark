import React from 'react';
import type { EventItem } from '../../types/daymark';
import type { EventWarningNotice } from '../../hooks/useEventWarnings';
import { formatEventSchedule } from '../../utils/eventTime';

export function EventWarningQueue({
  notices,
  onDismiss,
  onOpen,
  deviceZone,
}: {
  notices: EventWarningNotice[];
  onDismiss: (notice: EventWarningNotice) => void;
  onOpen: (event: EventItem) => void;
  deviceZone: string;
}) {
  if (!notices.length) return null;
  return (
    <section aria-label="Upcoming event warnings" className="fixed z-40 bottom-[calc(env(safe-area-inset-bottom)+5rem)] sm:bottom-4 right-4 max-h-[min(70vh,36rem)] w-[min(24rem,calc(100vw-2rem))] space-y-2 overflow-y-auto">
      {notices.map((notice) => {
        const schedule = formatEventSchedule(notice.event, deviceZone);
        return (
          <article key={notice.key} className="rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-lg text-stone-900 dark:border-amber-800 dark:bg-stone-900 dark:text-stone-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">Upcoming event</p>
            <h2 className="mt-1 font-semibold">{notice.event.title}</h2>
            <p className="text-sm font-medium text-stone-700 dark:text-stone-200">{notice.event.date}</p>
            <p className="text-sm text-stone-600 dark:text-stone-300">
              {schedule.primary}
              {schedule.secondary && <span className="block">{schedule.secondary}</span>}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" aria-label={`Open ${notice.event.title}`} onClick={() => onOpen(notice.event)}
                className="min-h-11 rounded-lg bg-amber-800 px-3 text-sm font-semibold text-white hover:bg-amber-900 dark:bg-amber-200 dark:text-stone-900">
                Open event
              </button>
              <button type="button" aria-label={`Dismiss ${notice.event.title}`} onClick={() => onDismiss(notice)}
                className="min-h-11 rounded-lg border border-stone-300 px-3 text-sm font-semibold text-stone-700 hover:bg-white dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800">
                Dismiss
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

