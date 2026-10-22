// Daymark QA regression suite (from the 2026-10-21 QA e2e report). Each check asserts CORRECT behaviour; FAIL = open bug. Exits 1 if any check fails. Run from repo root after `npm run build`: npm run test:qa [-- scenarioPrefix] (prefix match: "B1" also runs B10..B14).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { signIn, resetServerVault, seedVault } from './helpers/server-session.mjs';

const PORT = 3111;
const base = `http://localhost:${PORT}`;
const only = process.argv[2];
const results = [];
const check = (id, ok, label, detail = '') => {
  results.push({ id, ok, label, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${label}${!ok && detail ? `  -> ${detail}` : ''}`);
};

const server = spawn('npx', ['tsx', 'server.ts'], {
  env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT), DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-qa-')), DAYMARK_PASSWORD: 'qa-password-123' },
  shell: true,
  stdio: 'ignore',
});
let browser;
try {
let ready = false;
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

if (!ready) throw new Error('production server did not start');

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return ymd(d); };
const TODAY = day(0), Y1 = day(-1), Y2 = day(-2), Y5 = day(-5);

const task = (id, status, created, extra = {}) => ({ id, title: `Task ${id}`, status, createdDate: created, originalNoteDate: created, heading: 'Work', order: 1, historyLog: [], ...extra });
const doc = (date, items, notes = '') => ({ date, type: 'daily', headings: [{ name: 'Work', items, notesContent: notes }, { name: 'Ideas', items: [], notesContent: '' }], updatedAt: `${date}T08:00:00Z` });

browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' }));

async function fresh({ docs = [], notes = [], mobile = false, origin = base, colorScheme = 'light', pristine = false } = {}) {
  const context = await browser.newContext({ locale: 'en-US', colorScheme, ...(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } }) });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const session = await signIn(context, origin, 'qa-password-123');
  await resetServerVault(context, origin, session.accessToken);
  // Empty seeded arrays count as an existing vault. A fresh-install test must seed nothing.
  if (!pristine) await seedVault(page, origin, { docs, notes });
  await page.goto(origin, { waitUntil: 'networkidle' });
  return { context, page, errors };
}
const readDocs = (page) => page.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('daymark', 1); r.onsuccess = () => res(r.result); });
  return new Promise((res) => { const r = db.transaction('kv').objectStore('kv').get('daily_docs'); r.onsuccess = () => res(r.result); });
});
const titlesOn = (docs, date) => (docs.find((d) => d.date === date)?.headings ?? []).flatMap((h) => h.items.map((t) => `${t.title}|${t.status}`));
const settle = (page, ms = 600) => page.waitForTimeout(ms);
const run = async (id, fn) => {
  if (only && !id.startsWith(only)) return;
  try { await fn(); } catch (e) { check(id, false, 'scenario crashed', e.message.split('\n')[0]); }
  finally { for (const context of browser.contexts()) await context.close(); }
};


const synced = (page) => page.getByRole('button', { name: /sync: synced/i }).waitFor({ timeout: 20000 });
const openSync = (page) => page.getByRole('button', { name: /open sync settings/i }).click();
const addTask = async (page, title) => {
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/what do you need to do/i).fill(title);
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await page.getByRole('button', { name: `Mark "${title}" done` }).waitFor();
};
const signedIn = async () => {
  const context = await browser.newContext();
  const session = await signIn(context, base, 'qa-password-123');
  await resetServerVault(context, base, session.accessToken);
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await synced(page);
  return { context, page, session };
};
const onlyPublicShellCaches = (entries) => entries.every((cache) =>
  cache.name.startsWith('daymark-shell-') && cache.urls.every((url) => !url.includes('/api/')));
const assertWiped = async (page, id) => {
  await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor();
  // Wait for the sign-in startup checks to finish before inspecting storage.
  await page.getByLabel('Password', { exact: true }).waitFor();
  const storage = await page.evaluate(async () => ({
    databases: (await indexedDB.databases()).map((db) => db.name),
    keys: Object.keys(localStorage).filter((key) => key.startsWith('daymark')),
    caches: await Promise.all((await caches.keys()).map(async (name) => ({
      name,
      urls: (await caches.open(name).then((c) => c.keys())).map((request) => request.url),
    }))),
  }));
  check(id, !storage.databases.includes('daymark') && storage.keys.length === 0 && onlyPublicShellCaches(storage.caches),
    'sign-out shows sign-in and wipes IndexedDB and daymark localStorage, allowing only public shell caches without API requests', JSON.stringify(storage));
};

await run('A1', async () => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const response = await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByLabel('Password', { exact: true }).waitFor();
    check('A1a', response.status() === 401 && await page.getByRole('heading', { name: 'Sign in', exact: true }).isVisible(), 'fresh navigation returns the 401 sign-in form');
    await page.getByLabel('Username', { exact: true }).fill('admin');
    await page.getByLabel('Password', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Wrong username or password' }).waitFor();
    check('A1b', true, 'wrong password shows Wrong username or password');
    await page.getByLabel('Password', { exact: true }).fill('qa-password-123');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('heading', { name: 'Today', exact: true }).waitFor();
    check('A1c', true, 'right password opens Today');
  } finally { await context.close(); }
});

await run('A2', async () => {
  const { context, page } = await signedIn();
  try {
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const response = await context.request.post(base + '/api/auth/logout', { headers: { 'X-Daymark-Client': 'web' } });
    if (!response.ok()) throw new Error('logout failed: ' + response.status());
    const navigation = await page.reload({ waitUntil: 'networkidle' });
    await page.getByLabel('Password', { exact: true }).waitFor();
    check('A2', navigation.status() === 401 && !(await page.getByRole('heading', { name: 'Today', exact: true }).isVisible()), 'installed service worker does not serve the app after logout');
  } finally { await context.close(); }
});

await run('A3', async () => {
  const { context, page, session } = await signedIn();
  try {
    const second = await context.newPage();
    await second.goto(base, { waitUntil: 'networkidle' });
    await synced(second);
    // Playwright's page clock applies to every page in this context.
    await page.clock.install();
    await Promise.all([page, second].map(openSync));
    const rotations = [];
    for (const p of [page, second]) p.on('response', (r) => { if (r.url().endsWith('/api/auth/refresh')) rotations.push(r.status()); });
    await page.clock.setSystemTime(Date.now() + 16 * 60 * 1000);
    await Promise.all([page, second].map(async (p) => {
      const sync = p.waitForResponse((r) => r.url().endsWith('/api/sync') && r.request().method() === 'POST');
      await p.getByRole('button', { name: 'Sync now', exact: true }).click();
      if (!(await sync).ok()) throw new Error('sync after expiration failed');
      await p.getByText(/up to date/i).first().waitFor();
    }));
    const response = await context.request.get(base + '/api/devices', { headers: { Authorization: 'Bearer ' + session.accessToken } });
    if (!response.ok()) throw new Error('device list failed: ' + response.status());
    const { devices } = await response.json();
    check('A3', rotations.length > 0 && rotations.every((status) => status === 200) && devices.some((d) => d.id === session.device.id && !d.revoked)
      && await page.getByRole('button', { name: 'Sign out', exact: true }).isVisible()
      && await second.getByRole('button', { name: 'Sign out', exact: true }).isVisible(), 'two tabs rotate after a 16 min clock jump and keep their device active', JSON.stringify({ rotations, deviceActive: devices.some((d) => d.id === session.device.id) }));
  } finally { await context.close(); }
});

await run('A4', async () => {
  const { context, page } = await signedIn();
  try {
    await addTask(page, 'A4 synced task');
    await openSync(page);
    const pushed = page.waitForResponse((r) => r.url().endsWith('/api/sync') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Sync now', exact: true }).click();
    if (!(await pushed).ok()) throw new Error('task sync failed');
    await page.getByText(/up to date/i).first().waitFor();
    await page.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
    await synced(page);
    await page.getByRole('button', { name: 'Settings', exact: true }).first().click();
    await page.getByRole('tab', { name: 'Sync', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await assertWiped(page, 'A4');
  } finally { await context.close(); }
});

await run('A5', async () => {
  const { context, page, session } = await signedIn();
  try {
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    // Keep document/assets reachable while sync and logout see network failures.
    // useSync treats fetch failures (status 0) as offline even with navigator.onLine.
    await context.route('**/api/**', (r) => r.abort('internetdisconnected'));
    await addTask(page, 'A5 unsent task');
    await openSync(page);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Sign out?' });
    await dialog.waitFor();
    check('A5a', (await dialog.innerText()).includes('1 change'), 'offline sign-out warns about 1 change', await dialog.innerText());
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
    check('A5b', await page.getByRole('button', { name: 'Mark "A5 unsent task" done' }).isVisible(), 'Cancel keeps the offline task visible');
    await openSync(page);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    // Load the real app: the live refresh cookie passes the gate, but pending
    // logout blocks startup before vault hydration, rendering or sync. Bypass
    // the service worker so navigation cannot recreate its shell cache.
    const navigation = await context.newCDPSession(page);
    await navigation.send('Network.setBypassServiceWorker', { bypass: true });
    const leaving = page.waitForNavigation({ waitUntil: 'networkidle' });
    await dialog.getByRole('button', { name: 'Sign out anyway', exact: true }).click();
    const landing = await leaving;
    if (!landing?.ok() || page.url() !== base + '/') throw new Error('forced sign-out did not land on the app origin');
    await page.getByText('Unable to reach the server to finish signing out. Reconnect to continue.', { exact: true }).waitFor();
    const storage = await page.evaluate(async () => ({
      databases: (await indexedDB.databases()).map((db) => db.name),
      keys: Object.keys(localStorage).filter((key) => key.startsWith('daymark') && key !== 'daymark_logout_pending'),
      caches: await Promise.all((await caches.keys()).map(async (name) => ({
        name,
        urls: (await caches.open(name).then((c) => c.keys())).map((request) => request.url),
      }))),
      pendingLogout: localStorage.getItem('daymark_logout_pending'),
      marker: document.cookie.split(';').some((cookie) => cookie.trim().startsWith('daymark_signed_in=')),
    }));
    check('A5c', !storage.databases.includes('daymark') && storage.keys.length === 0
      && onlyPublicShellCaches(storage.caches)
      && !storage.marker && storage.pendingLogout === '1',
      'unreachable-server forced sign-out wipes local storage and marker, allowing only public shell caches without API requests and retaining pending logout', JSON.stringify(storage));
    await context.unroute('**/api/**');
    await page.reload({ waitUntil: 'networkidle' });
    await assertWiped(page, 'A5d');
    check('A5e', await page.evaluate(() => localStorage.getItem('daymark_logout_pending') === null),
      'reconnected sign-in completes pending logout and clears its flag');
    await navigation.send('Network.setBypassServiceWorker', { bypass: false });
    await navigation.detach();
    // A separate cookie jar ensures the verification login cannot replace the
    // signed-out session before pending logout has revoked that exact device.
    const observer = await browser.newContext();
    try {
      const freshSession = await signIn(observer, base, 'qa-password-123');
      const response = await observer.request.get(base + '/api/devices', { headers: { Authorization: 'Bearer ' + freshSession.accessToken } });
      if (!response.ok()) throw new Error('device list after pending logout failed: ' + response.status());
      const { devices } = await response.json();
      // /api/devices omits revoked devices; also require the fresh login to be listed.
      check('A5f', devices.some((d) => d.id === freshSession.device.id) && !devices.some((d) => d.id === session.device.id),
        'pending logout revokes the original server device');
    } finally { await observer.close(); }
  } finally { await context.close(); }
});

// ---------------------------------------------------------------------------
await run('A6', async () => {
  const observer = await browser.newContext();
  const admin = await signIn(observer, base, 'qa-password-123');
  await resetServerVault(observer, base, admin.accessToken);
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const title = 'A6 pre-upgrade local task';
    await seedVault(page, base, { docs: [doc(TODAY, [task('upgrade-v1', 'in-progress', TODAY, { title })])] });
    await page.evaluate(async (origin) => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('daymark', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put({ serverUrl: origin, token: 'legacy-v1-token', username: 'admin',
            deviceId: 'legacy-browser', deviceName: 'Old browser', lastRev: 99, bases: {}, lastSyncAt: null }, 'sync_state');
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
      } finally { db.close(); }
    }, base);
    if ((await context.cookies()).length) throw new Error('upgrade fixture must have no cookies');
    const response = await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByLabel('Password', { exact: true }).waitFor();
    check('A6a', response.status() === 401 && titlesOn(await readDocs(page), TODAY).some((t) => t.startsWith(title + '|')),
      'upgrade sign-in page preserves the pre-v2 IndexedDB vault without cookies');
    await page.getByLabel('Username', { exact: true }).fill('admin');
    await page.getByLabel('Password', { exact: true }).fill('qa-password-123');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('button', { name: `Mark "${title}" done`, exact: true }).waitFor();
    await synced(page);
    const serverVault = await observer.request.get(base + '/api/sync?since=0', {
      headers: { Authorization: 'Bearer ' + admin.accessToken },
    });
    if (!serverVault.ok()) throw new Error('observer could not read merged vault');
    const { entities } = await serverVault.json();
    check('A6b', entities.some((e) => e.key === 'doc:' + TODAY && e.value?.headings.some((h) => h.items.some((t) => t.title === title))),
      'first sign-in keeps the seeded task visible and merges it to the server');
  } finally { await context.close(); await observer.close(); }
});

await run('B1', async () => {
  const { page, context } = await fresh({ docs: [doc(Y1, [task('a', 'in-progress', Y1, { title: 'Carried task' })])] });
  check('B1a', await page.getByRole('button', { name: 'Mark "Carried task" done' }).isVisible(), 'unfinished task from yesterday is carried to today on open');
  await page.getByRole('button', { name: 'More actions for "Carried task"' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
  await settle(page);
  check('B1b', !(await page.getByRole('button', { name: 'Mark "Carried task" done' }).isVisible()), 'task disappears after delete');
  await page.reload({ waitUntil: 'networkidle' });
  await settle(page);
  check('B1c', !(await page.getByRole('button', { name: 'Mark "Carried task" done' }).isVisible()), 'deleted carried task stays deleted after reload', 'task came back after reload');
  await context.close();
});

await run('B2', async () => {
  const { page, context } = await fresh({ docs: [doc(Y1, [task('y', 'done', Y1, { title: 'Yesterday item', completedDate: Y1 })]), doc(TODAY, [task('t', 'in-progress', TODAY, { title: 'Today item' })])] });
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const area = page.locator('textarea').first();
  const text = await area.inputValue();
  await area.fill(text.replace('Today item', 'Today item EDITED IN MARKDOWN'));
  await page.getByRole('button', { name: 'Previous day' }).click();
  await settle(page, 300);
  const asks = (await page.getByRole('dialog').count()) + (await page.getByRole('alertdialog').count()) > 0;
  await page.locator('[role=dialog],[role=alertdialog]').getByRole('button', { name: 'Cancel', exact: true }).click();
  await settle(page, 300);
  const stillToday = await page.getByRole('heading', { level: 1, name: 'Today' }).isVisible();
  const keptDraft = (await page.locator('textarea').first().inputValue().catch(() => '')).includes('EDITED IN MARKDOWN');
  check('B2a', asks && stillToday && keptDraft, 'changing day with unsaved Markdown asks first; Cancel stays on the same day and keeps the draft', `asked=${asks}, still today=${stillToday}, draft kept=${keptDraft}`);
  await page.getByRole('button', { name: /^save/i }).first().click();
  await settle(page);
  const docs = await readDocs(page);
  check('B2b', !titlesOn(docs, Y1).some((t) => t.includes('Today item')) && titlesOn(docs, TODAY).some((t) => t.includes('EDITED IN MARKDOWN')), "saving after Cancel lands on today and does not overwrite yesterday", JSON.stringify({ y: titlesOn(docs, Y1), t: titlesOn(docs, TODAY) }));
  await context.close();
});

await run('B3', async () => {
  const { page, context } = await fresh({ docs: [doc(TODAY, [task('a', 'in-progress', TODAY, { title: 'Call vendor', description: '#urgent ask about invoice' })], 'Shopping:\n- [ ] milk\n- [x] eggs\n\n## Agenda\nitem')] });
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const area = page.locator('textarea').first();
  await area.fill((await area.inputValue()) + '\n');
  await page.getByRole('button', { name: /^save/i }).first().click();
  await settle(page);
  const docs = await readDocs(page);
  const d = docs.find((x) => x.date === TODAY);
  check('B3a', d.headings.map((h) => h.name).join(',') === 'Work,Ideas', 'saving Markdown without real changes keeps the same sections', d.headings.map((h) => h.name).join(','));
  check('B3b', titlesOn(docs, TODAY).length === 1, 'note checklist lines do not turn into tasks', JSON.stringify(titlesOn(docs, TODAY)));
  await context.close();
});

await run('B4', async () => {
  const { page, context } = await fresh({ docs: [doc(Y2, [task('a', 'in-progress', Y2, { title: 'Old name' })]), doc(Y1, [task('a', 'in-progress', Y2, { title: 'Old name', carriedFromDate: Y2 })])] });
  await page.getByRole('button', { name: 'More actions for "Old name"' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const input = page.getByRole('textbox', { name: 'Task title' });
  await input.fill('New name');
  await input.press('Enter');
  await settle(page);
  await page.getByRole('button', { name: 'More actions for "New name"' }).click();
  await page.getByRole('menuitem', { name: /^Mark done yesterday/i }).click();
  await settle(page);
  const docs = await readDocs(page);
  check('B4', titlesOn(docs, Y1).some((t) => t.startsWith('New name|done')), "'Mark done yesterday' keeps today's rename", JSON.stringify(titlesOn(docs, Y1)));
  await context.close();
});

await run('B5', async () => {
  const { page, context } = await fresh({ docs: [doc(Y1, [task('a', 'in-progress', Y1, { title: 'Finish report' })]), doc(TODAY, [task('a', 'done', Y1, { title: 'Finish report', carriedFromDate: Y1, completedDate: TODAY })])] });
  await page.getByRole('button', { name: /done/i }).filter({ hasText: /done/i }).first().click().catch(() => {});
  await page.getByText('Finish report').first().click().catch(() => {});
  // open details via the menu
  await page.keyboard.press('Escape');
  const more = page.getByRole('button', { name: 'More actions for "Finish report"' });
  if (!(await more.isVisible())) await page.getByRole('button', { name: /done today|1 done|done/i }).first().click();
  await more.click();
  await page.getByRole('menuitem', { name: /Details/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reopen' }).click();
  await settle(page);
  const docs = await readDocs(page);
  check('B5', titlesOn(docs, TODAY)[0]?.endsWith('|in-progress'), "Details > Reopen on a carried task done today reopens it", JSON.stringify(titlesOn(docs, TODAY)));
  await context.close();
});

await run('B6', async () => {
  const { page, context } = await fresh({ docs: [doc(Y2, [task('a', 'in-progress', Y2, { title: 'Past task' })]), doc(Y1, [task('a', 'done', Y2, { title: 'Past task', carriedFromDate: Y2, completedDate: Y1 })]), doc(TODAY, [task('z', 'in-progress', TODAY, { title: 'filler' })])] });
  await page.getByRole('button', { name: /^Calendar$/ }).first().click();
  await settle(page);
  await page.getByRole('button', { name: 'Reopen' }).first().click();
  await settle(page);
  const docs = await readDocs(page);
  check('B6a', titlesOn(docs, Y1)[0]?.endsWith('|in-progress'), 'Calendar > Reopen marks the task not done on that day', JSON.stringify(titlesOn(docs, Y1)));
  await page.getByRole('button', { name: /^Today$/ }).first().click();
  await settle(page);
  check('B6b', await page.getByRole('button', { name: 'Mark "Past task" done' }).isVisible(), 'a task reopened in Calendar shows up on Today', 'not on Today until tomorrow / manual refresh');
  await context.close();
});

await run('B7', async () => {
  const xssNote = { id: 'n1', title: 'XSS', folder: 'General', content: 'hello <img src=x onerror="window.__xss=1"> [[<img src=y onerror="window.__xss2=1">]]', tags: [], createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' };
  const safeNote = { id: 'n2', title: 'Safe', folder: 'General', content: ['[x](javascript:window.__xss4=1)', '', '> [!TIP] Title', '> body', '', 'see [[Plan]]', '', '- [ ] todo'].join(String.fromCharCode(10)), tags: [], createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' };
  const { page, context } = await fresh({ notes: [xssNote, safeNote], docs: [doc(TODAY, [], 'notes <img src=z onerror="window.__xss3=1">')] });
  await settle(page, 800);
  const todayXss = await page.evaluate(() => window.__xss3);
  await page.getByRole('button', { name: /^Notes$/ }).first().click();
  await page.getByText('XSS', { exact: true }).first().click();
  await settle(page, 800);
  const prev = page.getByRole('button', { name: /preview/i }).first();
  if (await prev.isVisible().catch(() => false)) { await prev.click(); await settle(page, 800); }
  const r = await page.evaluate(() => [window.__xss, window.__xss2]);
  check('B7a', !todayXss, 'HTML in day notes is not executed', 'onerror handler ran on Today');
  check('B7b', !r[0] && !r[1], 'HTML in standalone notes is not executed', JSON.stringify(r));
  await page.getByText('Safe', { exact: true }).first().click();
  await settle(page, 800);
  const prev2 = page.getByRole('button', { name: /preview/i }).first();
  if (await prev2.isVisible().catch(() => false)) { await prev2.click(); await settle(page, 800); }
  await page.locator('.daymark-markdown-body a', { hasText: 'x' }).first().click({ timeout: 2000 }).catch(() => {});
  await settle(page, 300);
  check('B7c', !(await page.evaluate(() => window.__xss4)), 'javascript: links are not executed', 'javascript: URL ran');
  check('B7d', (await page.locator('.daymark-callout-tip').count()) > 0, 'callouts still render');
  check('B7f', (await page.locator('.daymark-markdown-body input[type=checkbox][data-task-index]').count()) > 0, 'task checkboxes still render');
  check('B7e', (await page.locator('button[data-internal-note="Plan"]').count()) > 0, '[[Plan]] link button still renders');
  await context.close();
});

await run('B8', async () => {
  const { page, context, errors } = await fresh({ docs: [doc(TODAY, [task('a', 'in-progress', TODAY, { title: 'keep me' })])] });
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.getByRole('tab', { name: 'Backup & restore', exact: true }).click();
  const fileInput = page.locator('input[type=file]').first();
  const bad = path.join(os.tmpdir(), 'qa-bad.json');
  fs.writeFileSync(bad, JSON.stringify({ daily_documents: [{ foo: 1 }], standalone_notes: [] }));
  await fileInput.setInputFiles(bad);
  await settle(page);
  const restore = page.getByRole('button', { name: 'Restore' });
  if (await restore.isVisible().catch(() => false)) await restore.click();
  await settle(page, 1000);
  const stored = JSON.stringify(await readDocs(page));
  const refused = await page.getByRole('alertdialog', { name: /can't be restored/i }).isVisible().catch(() => false);
  check('B8a', stored.includes('keep me') && refused && errors.length === 0, 'restoring a malformed backup is refused: vault untouched and an error is shown', `vault has "keep me"=${stored.includes('keep me')}, alert visible=${refused}, errors=${errors.slice(0, 2).join(' | ')}`);
  await page.reload({ waitUntil: 'networkidle' });
  await settle(page);
  const alive2 = await page.getByRole('button', { name: 'Settings' }).first().isVisible().catch(() => false);
  check('B8b', alive2, 'app still opens after attempting a malformed restore', 'blank page after reload (vault bricked)');
  await context.close();
});

await run('B9', async () => {
  const { page, context } = await fresh({ docs: [doc(TODAY, [])] });
  const page2 = await context.newPage();
  await page2.goto(base, { waitUntil: 'networkidle' });
  const add = async (p, title) => {
    await p.keyboard.press('Control+k');
    await p.getByPlaceholder(/what do you need to do/i).fill(title);
    await p.keyboard.press('Enter');
    await settle(p);
  };
  await add(page, 'from tab A');
  await add(page2, 'from tab B');
  await settle(page, 1000);
  const p3 = await context.newPage();
  await p3.goto(base, { waitUntil: 'networkidle' });
  await settle(p3);
  const docs = await readDocs(p3);
  const t = titlesOn(docs, TODAY).join(',');
  check('B9', t.includes('from tab A') && t.includes('from tab B'), 'tasks added in two open tabs are both kept', t);
  await context.close();
});

await run('B10', async () => {
  const { page, context } = await fresh({ docs: [doc(TODAY, [task('a', 'in-progress', TODAY, { title: 'aging task' })])] });
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.getByRole('tab', { name: /warn|aging|old/i }).first().click();
  await page.locator('#aging-attentionDays').fill('20');
  await page.locator('#aging-criticalDays').fill('5');
  await page.locator('#aging-criticalDays').press('Enter');
  await settle(page);
  const s = await page.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('daymark', 1); r.onsuccess = () => res(r.result); });
    return new Promise((res) => { const r = db.transaction('kv').objectStore('kv').get('settings'); r.onsuccess = () => res(r.result?.agingThresholds); });
  });
  check('B10', s && s.criticalDays > s.attentionDays, 'urgent threshold can not be saved below the attention threshold', JSON.stringify(s));
  await context.close();
});

await run('B11', async () => {
  const { page, context } = await fresh({ docs: [doc(TODAY, [])] });
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.getByRole('tab', { name: /sections/i }).first().click();
  for (const h of ['Work', 'Meetings', 'Ideas', 'Attention']) {
    const remove = page.getByRole('button', { name: `Remove section ${h}` });
    if (await remove.isEnabled()) await remove.click();
  }
  check('B11-last-section', await page.getByRole('button', { name: 'Remove section Attention' }).isDisabled(), 'settings keeps at least one section');
  await page.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
  await settle(page);
  await page.getByRole('button', { name: 'Next day' }).click();
  await page.keyboard.press('Control+k');
  await settle(page);
  const opts = await page.locator('#capture-section option').evaluateAll((os) => os.filter((o) => o.value !== '').length).catch(() => 0);
  check('B11', opts >= 1, 'with every default section removed, a new task still has a section to go into', `options=${opts}`);
  await context.close();
});

await run('B12', async () => {
  const { page, context } = await fresh({ docs: [doc(TODAY, [])] });
  await page.keyboard.press('Control+k');
  const input = page.getByPlaceholder(/what do you need to do/i);
  await input.fill('     ');
  await page.keyboard.press('Enter');
  await settle(page);
  let docs = await readDocs(page);
  check('B12a', titlesOn(docs, TODAY).length === 0, 'whitespace-only title is not saved', JSON.stringify(titlesOn(docs, TODAY)));
  const long = 'L'.repeat(5000);
  await input.fill(long).catch(() => {});
  await page.keyboard.press('Enter');
  await settle(page);
  const w = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check('B12b', w, 'a 5000-character title does not make the page scroll sideways');
  await context.close();
});

await run('B13', async () => {
  // Midnight rollover while the app is open
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const now = new Date(); now.setHours(23, 59, 0, 0);
  await page.clock.install({ time: now });
  const session = await signIn(context, base, 'qa-password-123');
  await resetServerVault(context, base, session.accessToken);
  await seedVault(page, base, { docs: [doc(TODAY, [task('m', 'in-progress', TODAY, { title: 'Overnight task' })])] });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.clock.fastForward('02:00');
  await settle(page, 1000);
  const docs = await readDocs(page);
  check('B13b', titlesOn(docs, day(1)).some((t) => t.startsWith('Overnight task')), 'after midnight the open task is carried to the new day automatically', JSON.stringify(docs.map((d) => d.date)));
  await context.close();
});

await run('B14', async () => {
  // Mobile: complete flow - capture, toggle, calendar, notes
  const { page, context, errors } = await fresh({ mobile: true, docs: [doc(Y1, [task('a', 'in-progress', Y5, { title: 'Phone carried task' })])] });
  check('B14a', await page.getByText('Phone carried task').isVisible(), 'phone: carried task visible');
  await page.getByRole('button', { name: 'Mark "Phone carried task" done' }).click();
  await settle(page);
  const docs = await readDocs(page);
  check('B14b', titlesOn(docs, TODAY).some((t) => t === 'Phone carried task|done'), 'phone: tick marks the task done');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('B14c', overflow <= 1, 'phone: no sideways scroll', `overflow=${overflow}`);
  check('B14d', errors.length === 0, 'phone: no console errors', errors.slice(0, 2).join(' | '));
  await context.close();
});

await run('C1', async () => {
  const { page, context } = await fresh({ docs: [doc(TODAY, [])] });
  await page.getByRole('button', { name: 'Previous day' }).click();
  await page.keyboard.press('Control+k');
  const title = await page.getByRole('dialog').locator('h2').first().innerText();
  await page.getByPlaceholder(/what do you need to do/i).fill('Captured while viewing yesterday');
  await page.keyboard.press('Enter');
  await settle(page);
  const docs = await readDocs(page);
  const where = docs.filter((d) => titlesOn(docs, d.date).some((t) => t.startsWith('Captured'))).map((d) => d.date);
  check('C1', title === 'New task · Yesterday' && where.length === 1 && where[0] === Y1, 'quick-capture dialog names the day the task is saved to', `title="${title}" saved to ${where}`);
  await context.close();
});

await run('C2', async () => {
  const { page, context } = await fresh({ docs: [doc(TODAY, [])] });
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Escape');
  await settle(page, 300);
  check('C2a', (await page.getByRole('dialog').count()) === 0, 'Escape closes the new-task dialog');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const area = page.locator('textarea').first();
  await area.fill((await area.inputValue()) + '\nsome unsaved text');
  await page.getByRole('button', { name: 'More options for this day' }).click();
  await page.getByRole('menuitem', { name: 'New section' }).click();
  await settle(page, 300);
  const asked = (await page.getByRole('dialog').count()) > 0 || (await page.getByRole('alertdialog').count()) > 0;
  check('C2b', asked, "'New section' from the menu warns before discarding unsaved Markdown", 'draft silently discarded');
  await context.close();
});

await run('C3', async () => {
  const { page, context } = await fresh({ docs: [doc(TODAY, [task('a', 'blocked', TODAY, { title: 'Blocked thing' })])] });
  await page.getByRole('button', { name: 'Mark "Blocked thing" done' }).click();
  await settle(page, 300);
  const undoneBtn = page.getByRole('button', { name: 'Mark "Blocked thing" not done' });
  if (!(await undoneBtn.isVisible())) await page.getByRole('button', { name: /done/i }).last().click().catch(() => {});
  await undoneBtn.click();
  await settle(page);
  const docs = await readDocs(page);
  check('C3', titlesOn(docs, TODAY)[0] === 'Blocked thing|blocked', 'unticking a task returns it to its previous status', JSON.stringify(titlesOn(docs, TODAY)));
  await context.close();
});

await run('C4', async () => {
  // Undo of a delete must not revert a rename done in between
  const { page, context } = await fresh({ docs: [doc(TODAY, [task('a', 'in-progress', TODAY, { title: 'Alpha' }), task('b', 'in-progress', TODAY, { title: 'Beta' })])] });
  await page.getByRole('button', { name: 'More actions for "Alpha"' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
  await settle(page, 300);
  await page.getByRole('button', { name: 'More actions for "Beta"' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByRole('textbox', { name: 'Task title' }).fill('Beta renamed');
  await page.getByRole('textbox', { name: 'Task title' }).press('Enter');
  await settle(page, 300);
  const undo = page.getByRole('button', { name: 'Undo' }).first();
  const hasUndo = await undo.isVisible().catch(() => false);
  if (hasUndo) await undo.click();
  await settle(page);
  const docs = await readDocs(page);
  const t = titlesOn(docs, TODAY);
  check('C4', !hasUndo || (t.includes('Alpha|in-progress') && t.includes('Beta renamed|in-progress')), 'Undo delete keeps a rename made after the delete', JSON.stringify(t));
  await context.close();
});

await run('C4b', async () => {
  // Undo of a Done must bring back only that task, not revert a rename done in between
  const { page, context } = await fresh({ docs: [doc(TODAY, [task('a', 'in-progress', TODAY, { title: 'Alpha' }), task('b', 'in-progress', TODAY, { title: 'Beta' })])] });
  await page.getByRole('button', { name: 'Mark "Beta" done' }).click();
  await settle(page, 300);
  await page.getByRole('button', { name: 'More actions for "Alpha"' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByRole('textbox', { name: 'Task title' }).fill('Alpha renamed');
  await page.getByRole('textbox', { name: 'Task title' }).press('Enter');
  await settle(page, 300);
  const undo = page.getByRole('button', { name: 'Undo' }).first();
  const hasUndo = await undo.isVisible().catch(() => false);
  if (hasUndo) await undo.click();
  await settle(page);
  const t = titlesOn(await readDocs(page), TODAY);
  check('C4b', hasUndo && t.includes('Beta|in-progress') && t.includes('Alpha renamed|in-progress'), 'Undo Done keeps a rename made after the tick', JSON.stringify(t));
  await context.close();
});

await run('C5', async () => {
  // Reported by the user: filter to old tasks, complete them all -> page empty, no way back
  const seed = () => [doc(TODAY, [task('old', 'in-progress', day(-8), { title: 'Old task' }), task('new', 'in-progress', TODAY, { title: 'Fresh task' })])];
  for (const mobile of [false, true]) {
    const sfx = mobile ? '-mobile' : '';
    for (const how of ['complete', 'hide-warning']) {
      const { page, context } = await fresh({ docs: seed(), mobile });
      await page.getByRole('button', { name: 'Show', exact: true }).click();
      await settle(page, 300);
      if (how === 'complete') await page.getByRole('button', { name: 'Mark "Old task" done' }).click();
      else {
        await page.getByRole('button', { name: 'More actions for "Old task"' }).click();
        await page.getByRole('menuitem', { name: 'Hide warning today' }).click();
      }
      await settle(page);
      const fresh_ = await page.getByRole('button', { name: 'Mark "Fresh task" done' }).isVisible();
      const showAll = await page.getByRole('button', { name: 'Show all' }).isVisible();
      let detail = `fresh task visible=${fresh_}, Show all visible=${showAll}`;
      let ok = fresh_ && !showAll;
      if (how === 'complete') {
        const oldInDone = await page.getByText('Old task').first().isVisible().catch(() => false);
        ok = ok && oldInDone;
        detail += `, done Old task visible=${oldInDone}`;
      }
      check(`C5-${how}${sfx}`, ok, `after the last old task is cleared (${how}), the full list is shown (Fresh task visible, filter off)`, detail);
      if (how === 'complete') {
        // Undo brings the old-tasks bar back and the filter stays off
        await page.getByRole('button', { name: 'Undo' }).click();
        await settle(page);
        const bar = await page.getByRole('button', { name: 'Show', exact: true }).isVisible();
        const freshStill = await page.getByRole('button', { name: 'Mark "Fresh task" done' }).isVisible();
        check(`C5-undo${sfx}`, bar && freshStill, 'Undo of the completion brings the old-tasks bar back with the filter still off', `bar (Show)=${bar}, fresh visible=${freshStill}`);
      }
      await context.close();
    }
  }
});

await run('C6', async () => {
  // Self-hosted servers are often opened as http://<lan-ip>:3000, which browsers treat as an insecure context
  const lanIp = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  if (!lanIp) return check('C6', true, 'ticking a task works over plain HTTP on a LAN address (skipped: no LAN IPv4 address)');
  const { page, context, errors } = await fresh({ origin: `http://${lanIp}:${PORT}`, docs: [doc(TODAY, [task('a', 'blocked', TODAY, { title: 'LAN task' })])] });
  const secure = await page.evaluate(() => isSecureContext);
  await page.getByRole('button', { name: 'Mark "LAN task" done' }).click();
  await settle(page);
  const docs = await readDocs(page);
  check('C6', !secure && titlesOn(docs, TODAY)[0] === 'LAN task|done' && errors.length === 0, 'ticking a task works over plain HTTP on a LAN address', `secure=${secure} stored=${JSON.stringify(titlesOn(docs, TODAY))} errors=${errors.slice(0, 2).join(' | ')}`);
  await context.close();
});

// Cycle 6: R4 maps the brief's C1–C8 to D1–D8.
const settingsBox = (page) => page.getByRole('dialog', { name: 'Settings', exact: true });
const settingsOpen = (page) => page.getByRole('button', { name: 'Settings', exact: true }).first().click();
const settingsClose = (page) => settingsBox(page).getByRole('button', { name: 'Close', exact: true }).click();
// Evaluate a predicate against committed IDB data, closing every polling connection.
const persisted = (page, key, predicate, arg) => page.waitForFunction(async ({ key, predicate, arg }) => {
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open('daymark', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  try {
    const value = await new Promise((resolve, reject) => {
      const r = db.transaction('kv').objectStore('kv').get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    return new Function('value', 'arg', `return (${predicate})(value, arg)`)(value, arg);
  } finally { db.close(); }
}, { key, predicate: predicate.toString(), arg });
const themeSaved = async (page, theme) => {
  await persisted(page, 'settings', (s, t) => s?.appearance?.theme === t, theme);
  await page.waitForFunction((t) => document.documentElement.classList.contains('dark') === (t === 'dark')
    && JSON.parse(localStorage.getItem('daymark_theme') || 'null')?.theme === t, theme);
};
const png = async (page, i) => ({ name: `photo-${i}.png`, mimeType: 'image/png', buffer: Buffer.from(await page.evaluate((i) => {
  const c = document.createElement('canvas'); c.width = 96; c.height = 64;
  const ctx = c.getContext('2d'); ctx.fillStyle = `hsl(${i * 51}, 50%, 45%)`; ctx.fillRect(0, 0, 96, 64);
  return c.toDataURL('image/png').split(',')[1];
}, i), 'base64') });

await run('D1', async () => {
  const { page } = await fresh({ pristine: true, colorScheme: 'dark' });
  await themeSaved(page, 'light');
  check('D1a', true, 'fresh install persists Light despite system Dark');
  await settingsOpen(page);
  await settingsBox(page).getByRole('button', { name: /Dark$/ }).click();
  await themeSaved(page, 'dark');
  await settingsClose(page);
  await page.reload({ waitUntil: 'networkidle' });
  await themeSaved(page, 'dark');
  check('D1b', true, 'Dark selection persists in settings and daymark_theme and survives reload');
});
await run('D2', async () => {
  const { page } = await fresh({ colorScheme: 'dark', docs: [doc(TODAY, [task('upgrade', 'not-started', TODAY)])] });
  await themeSaved(page, 'dark');
  check('D2', true, 'existing vault without appearance keeps system Dark and persists it once');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload({ waitUntil: 'networkidle' });
  await themeSaved(page, 'dark');
  check('D2b', true, 'upgraded vault keeps saved Dark after the system changes to Light');
});
await run('D3', async () => {
  const { page } = await fresh();
  await settingsOpen(page);
  const input = page.getByLabel('Add background photo', { exact: true });
  for (let i = 0; i < 5; i++) {
    await input.setInputFiles(await png(page, i));
    await page.getByRole('button', { name: `Select photo ${i + 1}`, exact: true }).waitFor();
    await persisted(page, `bgPhoto:${i}`, (v) => v instanceof Blob);
    await persisted(page, `bgThumb:${i}`, (v) => v instanceof Blob);
  }
  const originalPhoto = await (await persisted(page, 'bgPhoto:1', async (v) =>
    v instanceof Blob && [...new Uint8Array(await v.arrayBuffer())].join(','))).jsonValue();
  await input.setInputFiles(await png(page, 5));
  const replace = page.getByRole('dialog', { name: 'Replace which photo?', exact: true });
  await replace.waitFor();
  check('D3a', await replace.getByRole('button', { name: /^Replace photo / }).count() === 5, 'sixth photo asks which of five slots to replace');
  await replace.getByRole('button', { name: 'Replace photo 2', exact: true }).click();
  await replace.waitFor({ state: 'hidden' });
  await persisted(page, 'bgPhoto:1', async (v, original) => v instanceof Blob
    && [...new Uint8Array(await v.arrayBuffer())].join(',') !== original, originalPhoto);
  check('D3b', await settingsBox(page).getByRole('button', { name: /^Select photo / }).count() === 5, 'replacing photo 2 leaves exactly five thumbnails');
  await page.getByRole('button', { name: 'Select photo 2', exact: true }).click();
  await persisted(page, 'ui:bgSlot', (v) => v === 1);
  await settingsClose(page);
  await synced(page);
  await openSync(page);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await assertWiped(page, 'D3c'); // Database absence proves all bgPhoto:* keys are gone too.
});
await run('D4', async () => {
  const { page } = await fresh();
  await settingsOpen(page);
  const dialog = settingsBox(page), initial = await dialog.boundingBox();
  for (const tab of await dialog.getByRole('tab').all()) {
    const name = await tab.innerText();
    await tab.click();
    await page.waitForFunction(() => document.querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby') === document.querySelector('[role="tab"][aria-selected="true"]')?.id);
    const box = await dialog.boundingBox();
    check(`D4-${name}`, !!box && box.width === initial.width && box.height === initial.height,
      `Settings ${name} keeps the same size at 1440×900`, JSON.stringify({ initial, box }));
  }
});
await run('D5', async () => {
  const title = 'D5 move once';
  const { page } = await fresh({ docs: [doc(TODAY, [
    task('d5', 'not-started', TODAY, { title }),
    task('d5-rollover', 'in-progress', TODAY, { title: 'D5 unfinished rollover witness' }),
  ])] });
  const move = async () => {
    await page.getByRole('button', { name: `More actions for "${title}"` }).click();
    await page.getByRole('menuitem', { name: 'Move to tomorrow', exact: true }).click();
    await persisted(page, 'daily_docs', (ds, today) => ds.find((d) => d.date === today)?.removedTaskIds?.includes('d5'), TODAY);
  };
  await move();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: `Mark "${title}" done` }).waitFor();
  await persisted(page, 'daily_docs', (ds, today) => ds.find((d) => d.date === today)?.headings.some((h) => h.items.some((t) => t.id === 'd5'))
    && !ds.some((d) => d.date !== today && d.headings.some((h) => h.items.some((t) => t.id === 'd5'))), TODAY);
  check('D5a', true, 'Undo restores moved task to today and removes the target copy');
  await move();
  await settingsOpen(page);
  await page.getByRole('tab', { name: 'Advanced', exact: true }).click();
  await page.getByLabel('Date override', { exact: true }).fill(day(1));
  await page.getByLabel('Date override', { exact: true }).press('Enter');
  await persisted(page, 'settings', (s, date) => s.simulatedToday === date, day(1));
  await settingsClose(page);
  await page.getByRole('button', { name: `Mark "${title}" done` }).waitFor();
  await persisted(page, 'daily_docs', (ds, dates) => {
    const items = ds.find((d) => d.date === dates.target)?.headings.flatMap((h) => h.items) ?? [];
    return items.filter((t) => t.id === 'd5').length === 1
      && items.some((t) => t.id === 'd5-rollover' && t.carriedFromDate === dates.source);
  }, { source: TODAY, target: day(1) });
  const docs = await readDocs(page);
  const copies = (date) => (docs.find((d) => d.date === date)?.headings ?? []).flatMap((h) => h.items).filter((t) => t.id === 'd5').length;
  const witness = docs.find((d) => d.date === day(1))?.headings.flatMap((h) => h.items)
    .some((t) => t.id === 'd5-rollover' && t.carriedFromDate === TODAY);
  check('D5b', witness && copies(TODAY) === 0 && copies(day(1)) === 1 && copies(day(2)) === 0,
    'another unfinished task proves next-day rollover ran; moved task appears once on target, absent on source and unvisited day after',
    JSON.stringify({ rolloverWitness: witness, source: copies(TODAY), target: copies(day(1)), after: copies(day(2)) }));
});
const longDay = (date) => new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const cellFor = (page, date) => page.getByRole('button', { name: new RegExp('^' + longDay(date) + ':') });
const calendarDay = async (page, date) => {
  await page.getByRole('button', { name: 'Calendar', exact: true }).first().click();
  const months = Array.from({ length: 12 }, (_, month) => new Date(2000, month, 1).toLocaleDateString('en-US', { month: 'long' }));
  const heading = page.getByRole('heading', { name: new RegExp(`^(${months.join('|')}) \\d{4}$`) });
  const target = Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
  for (let step = 0; step <= 24; step++) {
    const visible = (await heading.innerText()).trim();
    const [month, year] = visible.split(' ');
    const current = Number(year) * 12 + months.indexOf(month);
    if (current === target) break;
    if (step === 24) throw new Error(`Calendar did not reach ${date.slice(0, 7)} within 24 month steps; showing ${visible}`);
    const direction = current < target ? 1 : -1;
    const next = current + direction;
    await page.getByRole('button', { name: direction === 1 ? 'Next month' : 'Previous month', exact: true }).click();
    await page.getByRole('heading', { name: `${months[next % 12]} ${Math.floor(next / 12)}`, exact: true }).waitFor();
  }
  await cellFor(page, date).click();
  await page.getByRole('button', { name: 'Open this day', exact: true }).click();
};
await run('D6', async () => {
  const { page } = await fresh();
  await calendarDay(page, day(7));
  await addTask(page, 'D6 planned ahead');
  await persisted(page, 'daily_docs', (ds, date) => ds.some((d) => d.date === date && d.headings.some((h) => h.items.some((t) => t.title === 'D6 planned ahead'))), day(7));
  await page.keyboard.press('g'); await page.keyboard.press('t');
  await page.getByRole('heading', { name: 'Today', exact: true }).waitFor();
  check('D6a', await page.getByRole('button', { name: 'Mark "D6 planned ahead" done' }).count() === 0, 'task planned seven days ahead is absent on Today');
  await page.getByRole('button', { name: 'Calendar', exact: true }).first().click();
  const cell = cellFor(page, day(7));
  await cell.waitFor();
  check('D6b', (await cell.innerText()).includes('0/1'), 'future Calendar cell shows 0/1 for the planned task', await cell.innerText());
  const before = (await readDocs(page)).length;
  await calendarDay(page, day(8));
  await page.keyboard.press('g'); await page.keyboard.press('t');
  await page.reload({ waitUntil: 'networkidle' });
  await synced(page);
  const after = await readDocs(page);
  check('D6c', after.length === before && !after.some((d) => d.date === day(8)), 'opening another future day without editing creates no daily document', `before=${before}, after=${after.length}`);
});
await run('D7', async () => {
  const date = day(-3), title = 'D7 heliotrope record';
  // Completion prevents rollover creating a newer searchable copy.
  const { page } = await fresh({ docs: [doc(date, [task('d7', 'done', date, { title, completedDate: date })])] });
  await page.keyboard.press('Control+Shift+f');
  await page.getByRole('combobox', { name: 'Search tasks and notes' }).fill('heliotrope');
  const result = page.getByRole('option').filter({ hasText: title });
  await result.waitFor();
  const short = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/,/g, '');
  check('D7a', (await result.innerText()).includes(short), 'search result shows the task’s three-day-old date', await result.innerText());
  await page.getByRole('combobox').press('Enter');
  const details = page.getByRole('dialog', { name: title, exact: true });
  await details.waitFor();
  // The daily editor is inert behind the details dialog, so inspect its DOM
  // rather than looking for it in the dialog-only accessibility tree.
  check('D7b', (await page.locator('main h1').allTextContents()).includes(short)
    && (await page.locator('main').innerText()).includes(longDay(date)), 'Enter opens Today at the result date with the details sheet open');
  await page.keyboard.press('Escape');
  await details.waitFor({ state: 'hidden' });
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/what do you need to do/i).waitFor();
  check('D7c', true, 'Ctrl K still opens the New task sheet after search');
});
await run('D8', async () => {
  const { page } = await fresh({ notes: [{ id: 'd8', title: 'D8 long note', content: 'A long line of writing.\n'.repeat(300), folder: '', tags: [], pinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] });
  await page.getByRole('button', { name: 'Notes', exact: true }).first().click();
  await page.getByRole('button', { name: /D8 long note/ }).click();
  const editor = page.getByLabel('Note text (Markdown)', { exact: true });
  await editor.waitFor();
  const sizes = await editor.evaluate((el) => ({ page: document.scrollingElement.scrollHeight, viewport: innerHeight, scroll: el.scrollHeight, client: el.clientHeight }));
  check('D8a', sizes.page <= sizes.viewport && sizes.scroll > sizes.client, 'Notes page fits 1440×900 and long note scrolls inside the editor', JSON.stringify(sizes));
  const search = await page.getByPlaceholder('Search notes', { exact: true }).boundingBox();
  const add = await page.getByRole('button', { name: 'New note', exact: true }).first().boundingBox();
  check('D8b', !!search && !!add && add.y >= search.y + search.height && add.x < search.x + search.width, 'New note sits under the Notes search box', JSON.stringify({ search, add }));
});

console.log(`\n${results.filter((r) => !r.ok).length} failed / ${results.length} checks`);
fs.writeFileSync(path.join(os.tmpdir(), 'qa-results.json'), JSON.stringify(results, null, 2));
process.exitCode = results.some((r) => !r.ok) ? 1 : 0;
} finally {
  await browser?.close();
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  else server.kill();
}
