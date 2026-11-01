/** Await each browser evaluation before checking truthiness, including async IDB predicates. */
export async function pollUntil(page, fn, arg, { timeout = 20000, interval = 50, message = 'condition to become truthy' } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const value = await page.evaluate(fn, arg);
    if (value) return value;
    const remaining = end - Date.now();
    if (remaining <= 0) throw new Error(`Timed out after ${timeout}ms: ${message}`);
    await page.waitForTimeout(Math.min(interval, remaining));
  }
}
