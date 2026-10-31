/** Stable JSON so equality does not depend on key order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.keys(v)
          .sort()
          .reduce<Record<string, unknown>>((acc, k) => {
            if (v[k] !== undefined) acc[k] = v[k];
            return acc;
          }, {})
      : v
  );
}
