/**
 * One date vocabulary for the whole UI. Dates are stored as ISO `YYYY-MM-DD` strings; people
 * see relative words close to today and a short, locale-aware date otherwise. ISO stays for
 * Markdown and file names only.
 */

const parse = (date: string): Date => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const dayDiff = (from: string, to: string): number => Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);

/** "Today", "Yesterday", "Tomorrow", otherwise "Fri 16 Oct" (year added when it differs). */
export function formatDay(date: string, today: string, locale?: string): string {
  const diff = dayDiff(date, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff === -1) return 'Tomorrow';
  return formatShortDate(date, today, locale);
}

/** "Fri 16 Oct", with the year when it is not the current one. */
export function formatShortDate(date: string, today?: string, locale?: string): string {
  const d = parse(date);
  const sameYear = !today || today.slice(0, 4) === date.slice(0, 4);
  return d
    .toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
    .replace(/,/g, '');
}

/** "Tuesday, October 20, 2026" / "Tuesday 20 October 2026" (locale order and punctuation). */
export function formatLongDate(date: string, locale?: string): string {
  return parse(date).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** "20 Oct, 22:00" for timestamps (sync activity, history entries). Seconds are never shown. */
export function formatDateTime(iso: string, locale?: string): string {
  const d = new Date(iso);
  return d.toLocaleString(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** "6 days old" style age of a task that keeps rolling forward. */
export function formatAge(days: number): string {
  return days === 1 ? '1 day old' : `${days} days old`;
}
