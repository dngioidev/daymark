import type { CalendarCell, DailyDocument } from '../types/daymark';
import { getNextDate, getPreviousDate } from './lifecycleEngine';

function cellsBetween(start: string, end: string, month: string, docs: DailyDocument[], today: string): CalendarCell[] {
  const docMap = new Map(docs.map((doc) => [doc.date, doc]));
  const cells: CalendarCell[] = [];
  for (let date = start; date <= end; date = getNextDate(date)) {
    const doc = docMap.get(date);
    const tasks = doc?.headings.flatMap((heading) => heading.items) ?? [];
    cells.push({
      date, inMonth: date.slice(0, 7) === month, isToday: date === today, isFuture: date > today,
      done: tasks.filter((task) => task.status === 'done').length,
      total: tasks.length,
      hasNotes: doc?.headings.some((heading) => !!heading.notesContent?.trim()) ?? false,
      titles: tasks.map((task) => task.title),
    });
  }
  return cells;
}

export function monthCells(year: number, month0: number, docs: DailyDocument[], today: string): CalendarCell[] {
  const first = new Date(year, month0, 1);
  const last = new Date(year, month0 + 1, 0);
  const month = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`;
  const start = getPreviousDate(`${month}-01`, first.getDay());
  const end = getNextDate(`${month}-${String(last.getDate()).padStart(2, '0')}`, 6 - last.getDay());
  return cellsBetween(start, end, month, docs, today);
}

/** Sunday-first; inMonth refers to the anchor's month, including across year boundaries. */
export function weekCells(anchor: string, docs: DailyDocument[], today: string): CalendarCell[] {
  const [year, month, day] = anchor.split('-').map(Number);
  const start = getPreviousDate(anchor, new Date(year, month - 1, day).getDay());
  return cellsBetween(start, getNextDate(start, 6), anchor.slice(0, 7), docs, today);
}
