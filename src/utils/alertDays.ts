import type { AlertDaysSettings, AppSettings, CountingDays } from '../types/daymark';

const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeCountingDays(value: unknown): CountingDays {
  return value === 'weekdays' || value === 'weekend' ? value : 'all';
}

export function resolveAlertDays(settings: Pick<AppSettings, 'alertDays'>): AlertDaysSettings {
  return {
    tasks: normalizeCountingDays(settings.alertDays?.tasks),
    habits: normalizeCountingDays(settings.alertDays?.habits),
  };
}

// The strings already represent device-local calendar days. UTC is only used
// for arithmetic, so timezone offsets and DST cannot change their weekdays.
function calendarTime(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function countsWeekday(weekday: number, mode: CountingDays): boolean {
  const weekend = weekday === 0 || weekday === 6;
  return mode === 'all' || (mode === 'weekend' ? weekend : !weekend);
}

export function isCountedDay(date: string, mode: CountingDays): boolean {
  return countsWeekday(new Date(calendarTime(date)).getUTCDay(), mode);
}

/** Count calendar days in (from, to], excluding the origin day. */
export function countCountedDays(from: string, to: string, mode: CountingDays): number {
  if (to <= from) return 0;
  const start = calendarTime(from);
  const end = calendarTime(to);
  if (mode === 'all') return (end - start) / DAY_MS;
  let count = 0;
  for (let day = start + DAY_MS; day <= end; day += DAY_MS) {
    if (countsWeekday(new Date(day).getUTCDay(), mode)) count++;
  }
  return count;
}
