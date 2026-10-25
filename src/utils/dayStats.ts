import type { DailyDocument } from '../types/daymark';
import { getPreviousDate } from './lifecycleEngine';
import { isDoneLater } from './taskActions';

/** Seven calendar days ending today, including days without a document. */
export function weekTrend(docs: DailyDocument[], today: string): { date: string; done: number; total: number }[] {
  const byDate = new Map(docs.map((doc) => [doc.date, doc]));
  return Array.from({ length: 7 }, (_, i) => {
    const date = getPreviousDate(today, 6 - i);
    const tasks = (byDate.get(date)?.headings.flatMap((heading) => heading.items) ?? []).filter((task) => !isDoneLater(task));
    return { date, done: tasks.filter((task) => task.status === 'done').length, total: tasks.length };
  });
}

/** The nearest future document containing tasks, even if all are already done. */
export function nextPlannedDay(docs: DailyDocument[], today: string): { date: string; open: number } | null {
  let next: DailyDocument | undefined;
  for (const doc of docs) {
    if (doc.date > today && (!next || doc.date < next.date) && doc.headings.some((heading) => heading.items.length > 0)) next = doc;
  }
  return next ? { date: next.date, open: next.headings.flatMap((heading) => heading.items).filter((task) => task.status !== 'done').length } : null;
}
