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

/** Separate relative/weekday label and month/day for compact calendar headers. */
export function formatDayParts(date: string, today: string, locale?: string): { label: string; date: string } {
  const d = parse(date);
  return {
    label: Math.abs(dayDiff(date, today)) <= 1
      ? formatDay(date, today, locale)
      : d.toLocaleDateString(locale, { weekday: 'short' }),
    date: d.toLocaleDateString(locale, {
      month: 'short', day: 'numeric', ...(date.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
    }).replace(/,/g, ''),
  };
}

// Building a DateTimeFormat is the slow part of toLocaleDateString; the notes list formats a date
// for every row on each render, so reuse one formatter per locale and shape (same output).
const shortFormats = new Map<string, Intl.DateTimeFormat>();
const shortFormat = (locale: string | undefined, withYear: boolean): Intl.DateTimeFormat => {
  const key = `${locale ?? ''}|${withYear}`;
  let format = shortFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
    shortFormats.set(key, format);
  }
  return format;
};

/** "Fri 16 Oct", with the year when it is not the current one. */
export function formatShortDate(date: string, today?: string, locale?: string): string {
  const sameYear = !today || today.slice(0, 4) === date.slice(0, 4);
  const d = parse(date);
  // An unparsable date keeps toLocaleDateString's "Invalid Date" (format() would throw).
  if (Number.isNaN(d.getTime())) return d.toLocaleDateString(locale).replace(/,/g, '');
  return shortFormat(locale, !sameYear).format(d).replace(/,/g, '');
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
