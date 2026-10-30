export const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

/** Rank invalid or far-future device stamps lowest without changing stored values. */
export function trustedTime(value: string, now: number): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) || parsed > now + MAX_FUTURE_SKEW_MS ? -Infinity : parsed;
}
