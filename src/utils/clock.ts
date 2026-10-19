/**
 * Real-clock helpers. "Today" is the user's local calendar date unless a
 * developer override (settings.simulatedToday) is set.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function formatLocalDate(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Returns the override when it is a valid YYYY-MM-DD string, otherwise the real date. */
export function resolveToday(override: string | null | undefined, realToday: string = formatLocalDate()): string {
  return override && DATE_RE.test(override) ? override : realToday;
}

/** Milliseconds from `now` until the next local midnight. */
export function msUntilNextLocalMidnight(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return next.getTime() - now.getTime();
}
