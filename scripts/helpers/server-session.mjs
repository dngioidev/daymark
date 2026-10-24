/** Cookie login shared by production browser suites; request and page share the cookie jar. */
export async function signIn(context, origin, password, extra = {}) {
  const response = await context.request.post(origin + '/api/auth/login', {
    headers: { 'X-Daymark-Client': 'web' },
    data: { username: 'admin', password, deviceName: 'e2e', platform: 'web', ...extra },
  });
  if (!response.ok()) throw new Error(`Sign-in failed at ${origin}: ${response.status()}`);
  return response.json();
}

/** Only call against a suite's disposable server, with no other app contexts open. */
export async function resetServerVault(context, origin, accessToken) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const response = await context.request.post(origin + '/api/sync', {
    headers, data: { sinceRev: 0, changes: [], features: ['habits'] },
  });
  if (!response.ok()) throw new Error(`Read test vault failed: ${response.status()}`);
  const { entities } = await response.json();
  const changes = entities.filter((entity) => entity.value !== null).map(({ key, value }) => ({ key, base: value, value: null }));
  if (!changes.length) return;
  const cleared = await context.request.post(origin + '/api/sync', { headers, data: { sinceRev: 0, changes, features: ['habits'] } });
  if (!cleared.ok()) throw new Error(`Reset test vault failed: ${cleared.status()}`);
}

/** Seed storage before React/sync starts. The server app deliberately has no welcome/sample flow. */
export async function seedVault(page, origin, { docs = [], notes = [], settings, habits } = {}) {
  const url = origin + '/__daymark_e2e_seed';
  await page.route(url, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Test vault setup</title>' }));
  await page.goto(url);
  await page.evaluate(async ({ docs, notes, settings, habits }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('daymark', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('kv');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite');
        const store = tx.objectStore('kv');
        store.put(docs, 'daily_docs');
        store.put(notes, 'notes');
        store.put(true, 'onboarded');
        if (settings) store.put(settings, 'settings');
        if (habits !== undefined) store.put(habits, 'habits');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  }, { docs, notes, settings, habits });
  await page.unroute(url);
}

export async function seedSample(page, origin) {
  const { tsImport } = await import('tsx/esm/api');
  const { DEFAULT_SETTINGS, SEED_DAILY_DOCUMENTS, SEED_STANDALONE_NOTES } = await tsImport('../../src/utils/defaultData.ts', import.meta.url);
  await seedVault(page, origin, { docs: SEED_DAILY_DOCUMENTS, notes: SEED_STANDALONE_NOTES, settings: DEFAULT_SETTINGS });
}
