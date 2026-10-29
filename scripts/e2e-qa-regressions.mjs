// Daymark QA regression suite (from the 2026-10-21 QA e2e report). Each check asserts CORRECT behaviour; FAIL = open bug. Exits 1 if any check fails. Run from repo root after `npm run build`: npm run test:qa [-- scenarioPrefix] (prefix match: "B1" also runs B10..B14).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { signIn, resetServerVault, seedVault } from './helpers/server-session.mjs';
import { cycle10Qa } from './helpers/cycle-10-qa.mjs';
import { knowledgeGraphQa } from './helpers/knowledge-graph-qa.mjs';
import { cycle11Qa } from './helpers/cycle-11-qa.mjs';
import { notesResponsiveScenario, responsiveNotesFixture } from './helpers/cycle-12-responsive.mjs';

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

async function fresh({ docs = [], notes = [], habits, backlog, mobile = false, origin = base, colorScheme = 'light', pristine = false } = {}) {
  const context = await browser.newContext({ locale: 'en-US', colorScheme, ...(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } }) });
  // External font availability is outside this disposable app server and sandbox.
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const session = await signIn(context, origin, 'qa-password-123');
  await resetServerVault(context, origin, session.accessToken);
  // Empty seeded arrays count as an existing vault. A fresh-install test must seed nothing.
  if (!pristine) await seedVault(page, origin, { docs, notes, habits, backlog });
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
  try { await fn(); } catch (e) { check(id, false, 'scenario crashed', e.message); }
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
    await page.locator('[data-day-label]').filter({ hasText: /^Today$/ }).waitFor();
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
    check('A2', navigation.status() === 401 && !(await page.locator('[data-day-label]').filter({ hasText: /^Today$/ }).isVisible()), 'installed service worker does not serve the app after logout');
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
  const stillToday = await page.locator('[data-day-label]').filter({ hasText: /^Today$/ }).isVisible();
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
  const editor = page.getByRole('textbox', { name: 'Note rich text', exact: true });
  await editor.waitFor();
  await settle(page, 800);
  const r = await page.evaluate(() => [window.__xss, window.__xss2]);
  check('B7a', !todayXss, 'HTML in day notes is not executed', 'onerror handler ran on Today');
  check('B7b', !r[0] && !r[1], 'HTML in standalone notes is not executed', JSON.stringify(r));
  await page.getByText('Safe', { exact: true }).first().click();
  await editor.locator('[data-wiki-title="Plan"]').waitFor();
  await settle(page, 800);
  const safeLinks = await editor.locator('a[href]').evaluateAll((links) => links.every((link) => link.protocol !== 'javascript:'));
  check('B7c', safeLinks && !(await page.evaluate(() => window.__xss4)), 'javascript: links are absent and not executed', 'javascript: URL survived or ran');
  check('B7d', (await editor.locator('.daymark-callout-tip').count()) > 0, 'callouts still render');
  check('B7f', (await editor.locator('ul[data-type="taskList"] input[type=checkbox]').count()) > 0, 'task checkboxes still render');
  check('B7e', (await editor.locator('[data-wiki-title="Plan"]').count()) > 0, '[[Plan]] wiki chip still renders');
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
const calendarDay = async (page, date, { openDay = true } = {}) => {
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
  if (openDay) await page.getByRole('button', { name: 'Open this day', exact: true }).click();
};
await run('D6', async () => {
  const { page } = await fresh();
  await calendarDay(page, day(7));
  await addTask(page, 'D6 planned ahead');
  await persisted(page, 'daily_docs', (ds, date) => ds.some((d) => d.date === date && d.headings.some((h) => h.items.some((t) => t.title === 'D6 planned ahead'))), day(7));
  await page.keyboard.press('g'); await page.keyboard.press('t');
  await page.locator('[data-day-label]').filter({ hasText: /^Today$/ }).waitFor();
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
  check('D7b', (await page.locator('main [data-day-label]').allTextContents()).includes(short)
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
  await page.getByRole('treeitem', { name: /D8 long note/ }).click();
  const editor = page.getByRole('textbox', { name: 'Note rich text', exact: true });
  await editor.waitFor();
  const sizes = await editor.evaluate((el) => {
    const scroller = el.closest('.overflow-auto');
    if (!scroller) throw new Error('Rich editor scroll container is missing');
    return { page: document.scrollingElement.scrollHeight, viewport: innerHeight, scroll: scroller.scrollHeight, client: scroller.clientHeight };
  });
  check('D8a', sizes.page <= sizes.viewport && sizes.scroll > sizes.client, 'Notes page fits 1440×900 and long note scrolls inside the editor', JSON.stringify(sizes));
  const search = await page.getByPlaceholder('Search notes', { exact: true }).boundingBox();
  const add = await page.getByRole('button', { name: 'New note', exact: true }).first().boundingBox();
  check('D8b', !!search && !!add && add.y >= search.y + search.height && add.x < search.x + search.width, 'New note sits under the Notes search box', JSON.stringify({ search, add }));
});

// Cycle 7: daily habits and readable Calendar week rows.
const habit = (id, name = 'Read a chapter') => ({ id, name, order: 0, warnAfterDays: 3, addedOn: Y5, updatedAt: `${Y5}T08:00:00Z` });
const tickDay = (date, id) => ({ date, ticks: { [id]: { done: true, at: `${date}T08:00:00Z` } } });
const habitsBar = (page) => page.getByRole('region', { name: 'Daily habits', exact: true });
const disclosure = (page) => habitsBar(page).locator('button[aria-expanded]');
const openHabits = async (page) => {
  await disclosure(page).waitFor();
  if (await disclosure(page).getAttribute('aria-expanded') === 'false') await disclosure(page).click();
};
const goToday = async (page) => {
  await page.getByRole('button', { name: 'Today', exact: true }).first().click();
  await habitsBar(page).waitFor();
};
// Choose via month view first so yesterday/tomorrow also work across week/month boundaries.
const selectHabitDay = async (page, date) => {
  await calendarDay(page, date, { openDay: false });
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await page.locator(`button[data-date="${date}"]`).click();
};

await run('H1', async () => {
  for (const mobile of [false, true]) {
    const { page, context } = await fresh({ mobile });
    check(`H1-${mobile ? '390' : '1440'}`, await disclosure(page).getAttribute('aria-expanded') === 'false'
      && (await disclosure(page).innerText()).includes('Add a daily habit'), 'habits closed by default with Add a daily habit');
    await context.close();
  }
});

await run('H2', async () => {
  const { page } = await fresh();
  await openHabits(page); // Empty disclosure opens the editor.
  const editor = page.getByRole('dialog', { name: 'Daily habits', exact: true });
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await habitsBar(page).getByRole('button', { name: 'Edit', exact: true }).click();
  for (const name of ['Read a chapter', 'Take a walk']) {
    await editor.getByPlaceholder('Habit name', { exact: true }).fill(name);
    await editor.getByRole('button', { name: 'Add', exact: true }).click();
    await editor.getByLabel(`Name for ${name}`, { exact: true }).waitFor();
  }
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await habitsBar(page).getByRole('checkbox', { name: 'Read a chapter', exact: true }).check();
  await persisted(page, 'habits', (data, date) => data?.habits.length === 2
    && data.days.find((d) => d.date === date)?.ticks[data.habits.find((h) => h.name === 'Read a chapter')?.id]?.done === true, TODAY);
  await page.reload({ waitUntil: 'networkidle' });
  await openHabits(page);
  check('H2', await habitsBar(page).getByRole('checkbox', { name: 'Read a chapter', exact: true }).isChecked()
    && !await habitsBar(page).getByRole('checkbox', { name: 'Take a walk', exact: true }).isChecked()
    && (await disclosure(page).innerText()).includes('1 of 2'), 'adding two habits and ticking one persists through reload in kv habits and shows 1 of 2');
});

await run('H3', async () => {
  const { page } = await fresh({ habits: { habits: [habit('h3')], days: [] } });
  check('H3a', await disclosure(page).getAttribute('aria-expanded') === 'false'
    && (await disclosure(page).innerText()).includes('1 missed 5 days'), 'closed bar warns about a habit added Y5 and never ticked');
  await openHabits(page);
  await habitsBar(page).getByRole('checkbox', { name: 'Read a chapter', exact: true }).check();
  await persisted(page, 'habits', (data, date) => data?.days.find((d) => d.date === date)?.ticks.h3?.done === true, TODAY);
  await disclosure(page).click();
  check('H3b', !(await disclosure(page).innerText()).includes('missed')
    && (await disclosure(page).innerText()).includes('1 of 1'), 'ticking today clears the closed warning chip');
});

await run('H4', async () => {
  const { page } = await fresh({ habits: { habits: [habit('h4')], days: [tickDay(TODAY, 'h4')] } });
  await openHabits(page);
  const row = habitsBar(page).locator('li').filter({ has: page.getByRole('checkbox', { name: 'Read a chapter', exact: true }) });
  check('H4a', (await row.innerText()).includes('🔥 1'), 'Today starts with a one-day streak');
  await selectHabitDay(page, Y1);
  await page.getByRole('checkbox', { name: 'Read a chapter', exact: true }).check();
  await persisted(page, 'habits', (data, date) => data?.days.find((d) => d.date === date)?.ticks.h4?.done === true, Y1);
  await goToday(page);
  await openHabits(page);
  check('H4b', (await row.innerText()).includes('🔥 2'), 'Calendar yesterday backfill increases Today streak to two');
});

await run('H5', async () => {
  const items = Array.from({ length: 9 }, (_, i) => task(`h5-${i}`, 'not-started', TODAY, { title: `Week row task ${i + 1}`, order: i }));
  for (const mobile of [false, true]) {
    const { page, context } = await fresh({ mobile, docs: [doc(TODAY, items)] });
    await selectHabitDay(page, TODAY);
    const row = page.locator(`button[data-date="${TODAY}"]`);
    const visible = await Promise.all(items.map((item) => row.getByText(item.title, { exact: true }).isVisible()));
    check(`H5-${mobile ? '390' : '1440'}-titles`, visible.every(Boolean) && !/\+\d+ more/.test(await row.innerText()), 'week row displays all nine titles without +N more');
    const layout = await row.evaluate((el) => ({ row: el.getBoundingClientRect().width, card: el.closest('.dm-card').getBoundingClientRect().width }));
    if (mobile) {
      const first = await row.getByText(items[0].title, { exact: true }).boundingBox();
      const second = await row.getByText(items[1].title, { exact: true }).boundingBox();
      check('H5-phone-column', !!first && !!second && Math.abs(first.x - second.x) < 1 && second.y > first.y, '390px task titles form a single column', JSON.stringify({ first, second }));
    } else check('H5-desktop-width', layout.row >= layout.card * 0.9, '1440px week row occupies at least 90% of Calendar card', JSON.stringify(layout));
    await context.close();
  }
});

await run('H6', async () => {
  const { page } = await fresh({ habits: { habits: [habit('h6')], days: [tickDay(TODAY, 'h6')] } });
  check('H6a', (await disclosure(page).innerText()).includes('1 of 1'), 'today starts ticked');
  await settingsOpen(page);
  await page.getByRole('tab', { name: 'Advanced', exact: true }).click();
  await page.getByLabel('Date override', { exact: true }).fill(day(1));
  await page.getByLabel('Date override', { exact: true }).press('Enter');
  await persisted(page, 'settings', (s, date) => s.simulatedToday === date, day(1));
  await settingsClose(page);
  await settle(page);
  check('H6b', (await disclosure(page).innerText()).includes('0 of 1'), 'resolved tomorrow starts with zero ticks');
  await selectHabitDay(page, TODAY);
  check('H6c', await page.getByRole('checkbox', { name: 'Read a chapter', exact: true }).isChecked(), 'Calendar keeps yesterday tick after date override');
});

await run('H7', async () => {
  const title = 'H7 drag into a week row';
  const { page } = await fresh({ docs: [doc(TODAY, [task('h7', 'not-started', TODAY, { title })])] });
  await selectHabitDay(page, TODAY);
  const source = page.locator('li[draggable="true"]').filter({ hasText: title });
  // Native DataTransfer dispatch preserves Calendar's real drag payload and drop handlers.
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent('dragstart', { dataTransfer: transfer });
  if (!await page.locator(`button[data-date="${day(1)}"]`).count()) await page.getByRole('button', { name: 'Next week', exact: true }).click();
  const target = page.locator(`button[data-date="${day(1)}"]`);
  await target.dispatchEvent('dragover', { dataTransfer: transfer });
  await target.dispatchEvent('drop', { dataTransfer: transfer });
  await transfer.dispose();
  await persisted(page, 'daily_docs', (ds, dates) => {
    const tasks = (date) => ds.find((d) => d.date === date)?.headings.flatMap((h) => h.items) ?? [];
    return tasks(dates.target).filter((t) => t.id === 'h7').length === 1 && !tasks(dates.source).some((t) => t.id === 'h7');
  }, { source: TODAY, target: day(1) });
  check('H7', await target.getByText(title, { exact: true }).isVisible(), 'desktop drag moves task once from Today onto future week row');
});

await run('H8', async () => {
  const { page } = await fresh({ habits: { habits: [habit('h8')], days: [tickDay(Y1, 'h8')] } });
  await openHabits(page);
  await habitsBar(page).getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Daily habits', exact: true });
  await editor.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('alertdialog', { name: 'Remove "Read a chapter"?', exact: true }).getByRole('button', { name: 'Remove', exact: true }).click();
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await persisted(page, 'habits', (data, dates) => data?.habits.find((h) => h.id === 'h8')?.removedOn === dates.today
    && data.days.find((d) => d.date === dates.yesterday)?.ticks.h8?.done === true, { today: TODAY, yesterday: Y1 });
  check('H8a', await habitsBar(page).getByRole('checkbox', { name: 'Read a chapter', exact: true }).count() === 0, 'confirmed removal hides habit from Today');
  await selectHabitDay(page, Y1);
  check('H8b', await page.getByRole('checkbox', { name: 'Read a chapter', exact: true }).isChecked(), 'Calendar yesterday retains removed habit and its tick');
});

await run('E1', async () => {
  // With a background photo, cards get backdrop-filter (their own stacking contexts); an open task menu must still paint above the cards after it.
  const many = Array.from({ length: 3 }, (_, i) => task(`e1-${i}`, 'not-started', TODAY, { title: `E1 task ${i}`, heading: 'Work' }));
  const { page } = await fresh({ docs: [{ ...doc(TODAY, many), headings: [{ name: 'Work', items: many, notesContent: '' }, { name: 'Ideas', items: [task('e1-idea', 'not-started', TODAY, { title: 'E1 idea', heading: 'Ideas' })], notesContent: '' }, { name: 'Later', items: [], notesContent: '' }] }] });
  await settingsOpen(page);
  await page.getByLabel('Add background photo', { exact: true }).setInputFiles(await png(page, 1));
  await page.getByRole('button', { name: 'Select photo 1', exact: true }).waitFor();
  await settingsClose(page);
  await page.waitForFunction(() => document.documentElement.classList.contains('dm-glass'));
  await page.getByRole('button', { name: 'More actions for "E1 task 2"', exact: true }).click();
  const items = page.getByRole('menu').getByRole('menuitem');
  await items.first().waitFor();
  const covered = [];
  for (let i = 0; i < await items.count(); i++) {
    const box = await items.nth(i).boundingBox();
    const onTop = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[role="menu"]'), { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    if (!onTop) covered.push(await items.nth(i).innerText());
  }
  check('E1', covered.length === 0, 'task menu stays above the sections below it with a background photo', `covered: ${covered.join(', ')}`);
});

await run('E2', async () => {
  const { page } = await fresh({ docs: [doc(Y2, [task('e2-past', 'not-started', Y2, { title: 'E2 past work' })]), doc(TODAY, [task('e2-today', 'not-started', TODAY, { title: 'E2 today work' })])] });
  await calendarDay(page, Y2);
  await page.getByRole('button', { name: 'Mark "E2 past work" done' }).waitFor();
  await page.getByRole('button', { name: 'Calendar', exact: true }).first().click();
  await page.getByRole('button', { name: 'Today', exact: true }).first().click();
  await page.locator('[data-day-label]').filter({ hasText: /^Today$/ }).waitFor();
  check('E2', await page.getByRole('button', { name: 'Mark "E2 today work" done' }).isVisible(), 'clicking the Today tab after opening a past day shows today');
});

await run('E3', async () => {
  // A task carried from Y2 through Y1 to today: finishing it today closes the open copies on Y2 and Y1
  const carried = (date) => task('e3', 'in-progress', Y2, { title: 'E3 carried', ...(date !== Y2 ? { carriedFromDate: Y2 } : {}) });
  const { page } = await fresh({ docs: [doc(Y2, [carried(Y2)]), doc(Y1, [carried(Y1)]), doc(TODAY, [carried(TODAY)])] });
  await page.getByRole('button', { name: 'Mark "E3 carried" done' }).click();
  await persisted(page, 'daily_docs', (ds, dates) => dates.every((date) => ds.find((d) => d.date === date)?.headings.flatMap((h) => h.items).find((t) => t.id === 'e3')?.doneLaterDate === dates.at(-1) || date === dates.at(-1)), [Y2, Y1, TODAY]);
  const docs = await readDocs(page);
  const copy = (date) => docs.find((d) => d.date === date).headings.flatMap((h) => h.items).find((t) => t.id === 'e3');
  check('E3a', copy(Y2).status === 'done' && copy(Y1).doneLaterDate === TODAY && !copy(TODAY).doneLaterDate, 'finishing a carried task closes its earlier copies as done later', JSON.stringify([copy(Y2), copy(Y1)].map((t) => [t.status, t.doneLaterDate])));
  await calendarDay(page, Y1);
  await page.getByRole('button', { name: /^Done \(\d+\)$/ }).first().click();
  check('E3b', await page.getByText(/Done later, today/).first().isVisible(), 'an earlier day shows the copy as done later');
  await page.getByRole('button', { name: 'Calendar', exact: true }).first().click();
  const cell = cellFor(page, Y1);
  check('E3c', !(await cell.innerText()).includes('1/1'), 'the earlier day does not count the closed copy as done', await cell.innerText());
  await page.getByRole('button', { name: 'Today', exact: true }).first().click();
  const toggle = page.getByRole('button', { name: /^Done \(\d+\)$/ }).first();
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await page.getByRole('button', { name: 'Mark "E3 carried" not done' }).click();
  await persisted(page, 'daily_docs', (ds, date) => ds.find((d) => d.date === date)?.headings.flatMap((h) => h.items).find((t) => t.id === 'e3')?.status === 'in-progress', Y1);
  check('E3d', true, 'unticking today reopens the earlier copies');
});

await run('E4', async () => {
  // Phone: "Open this day" lands on that day, and the Today tab then returns to today
  const { page } = await fresh({ mobile: true, docs: [doc(Y2, [task('e4-past', 'not-started', Y2, { title: 'E4 past work' })]), doc(TODAY, [task('e4-today', 'not-started', TODAY, { title: 'E4 today work' })])] });
  await page.getByRole('button', { name: 'Calendar', exact: true }).first().click();
  await cellFor(page, Y2).click();
  await page.getByRole('button', { name: 'Open this day', exact: true }).click();
  check('E4a', await page.getByRole('button', { name: 'Mark "E4 past work" done' }).isVisible().catch(() => false)
    || await page.getByRole('button', { name: 'Mark "E4 past work" done' }).waitFor({ timeout: 5000 }).then(() => true, () => false), 'phone Open this day shows that day');
  await page.getByRole('button', { name: 'Today', exact: true }).last().click();
  check('E4b', await page.getByRole('button', { name: 'Mark "E4 today work" done' }).waitFor({ timeout: 5000 }).then(() => true, () => false), 'phone Today tab returns to today');
});

await run('E5', async () => {
  // Reopening the finished copy from the Calendar also reopens the earlier closed copies
  const carried = (date) => task('e5', 'in-progress', Y1, { title: 'E5 carried', ...(date !== Y1 ? { carriedFromDate: Y1 } : {}) });
  const { page } = await fresh({ docs: [doc(Y1, [carried(Y1)]), doc(TODAY, [carried(TODAY)])] });
  await page.getByRole('button', { name: 'Mark "E5 carried" done' }).click();
  await persisted(page, 'daily_docs', (ds, date) => ds.find((d) => d.date === date)?.headings.flatMap((h) => h.items).find((t) => t.id === 'e5')?.doneLaterDate, Y1);
  await calendarDay(page, TODAY, { openDay: false });
  await page.getByRole('button', { name: 'Reopen', exact: true }).first().click();
  await persisted(page, 'daily_docs', (ds, date) => {
    const t = ds.find((d) => d.date === date)?.headings.flatMap((h) => h.items).find((x) => x.id === 'e5');
    return t?.status === 'in-progress' && !t.doneLaterDate;
  }, Y1);
  check('E5', true, 'Calendar Reopen on the finished day reopens the earlier closed copies');
});

await run('E6', async () => {
  const many = Array.from({ length: 12 }, (_, i) => task(`e6-${i}`, 'not-started', TODAY, { title: `E6 task ${i}`, order: i }));
  for (const mobile of [true, false]) {
    const { context, page } = await fresh({ mobile, docs: [doc(TODAY, many)] });
    const id = mobile ? 'E6-phone' : 'E6-desktop';
    const trigger = page.getByRole('button', { name: 'More actions for "E6 task 11"', exact: true });
    await trigger.scrollIntoViewIfNeeded();
    // Put the desktop trigger at the window bottom so a downward popover would clip.
    if (!mobile) await trigger.evaluate((button) => button.scrollIntoView({ block: 'end' }));
    await trigger.click();
    const menu = page.getByRole('menu');
    await menu.getByRole('menuitem').first().waitFor();
    const bounds = await menu.boundingBox();
    const viewport = page.viewportSize();
    const tabTop = mobile ? await page.getByRole('navigation', { name: 'Main', exact: true }).evaluate((nav) => nav.getBoundingClientRect().top) : viewport.height;
    check(`${id}-bounds`, bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= tabTop,
      mobile ? 'last task sheet fits within 390×844 and above the tab bar' : 'bottom task popover fits within 1440×900', JSON.stringify({ bounds, tabTop }));
    const covered = await menu.getByRole('menuitem').evaluateAll((items) => items.filter((item) => {
      const box = item.getBoundingClientRect();
      return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('[role="menu"]') !== item.closest('[role="menu"]');
    }).map((item) => item.textContent));
    check(`${id}-hit`, covered.length === 0, 'every menuitem centre hit-tests to the menu', JSON.stringify(covered));
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'detached' });
    check(`${id}-focus`, await trigger.evaluate((button) => document.activeElement === button), 'Escape closes the menu and returns focus to its trigger');
    await context.close();
  }
});

await run('E7', async () => {
  const { page } = await fresh({ mobile: true, docs: [doc(TODAY, [
    task('e7-underneath', 'not-started', TODAY, { title: 'E7 underneath', order: 0 }),
    task('e7-menu', 'not-started', TODAY, { title: 'E7 menu', order: 1 }),
  ])] });
  const checkbox = page.getByRole('button', { name: 'Mark "E7 underneath" done', exact: true });
  await checkbox.scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'More actions for "E7 menu"', exact: true }).click();
  const menu = page.getByRole('menu');
  await menu.waitFor();
  const box = await checkbox.boundingBox();
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const backdropAtPoint = await page.evaluate(({ x, y }) => {
    const hit = document.elementFromPoint(x, y);
    return hit?.getAttribute('aria-hidden') === 'true' && hit.classList.contains('bg-black/40');
  }, point);
  check('E7a', backdropAtPoint, 'another task checkbox is underneath the sheet backdrop');
  if (!backdropAtPoint) throw new Error('E7 tap point is not on the backdrop');
  await page.touchscreen.tap(point.x, point.y);
  await menu.waitFor({ state: 'detached' });
  await settle(page);
  const saved = (await readDocs(page)).find((d) => d.date === TODAY)?.headings.flatMap((h) => h.items).find((t) => t.id === 'e7-underneath');
  check('E7b', await checkbox.isVisible() && saved?.status === 'not-started', 'backdrop tap closes the menu without completing the task underneath', JSON.stringify(saved?.status));
});

// Cycle 9: exercise the public editor surface and committed Markdown, never TipTap internals.
const note = (id, content, title = `Browser note ${id}`) => ({
  id, title, content, folder: 'Browser coverage', tags: [], pinned: false,
  createdAt: `${TODAY}T08:00:00Z`, updatedAt: `${TODAY}T08:00:00Z`,
});
const rich = (page) => page.getByRole('textbox', { name: 'Note rich text', exact: true });
// Open a note from the navigation tree, expanding collapsed folders until its row appears.
// In the 768-1099px drawer layout the navigation opens from the editor's Notes button.
const ensureTree = async (page) => {
  const tree = page.getByRole('tree', { name: 'Notes', exact: true });
  if (!await tree.count()) await page.locator('main').getByRole('button', { name: 'Notes', exact: true }).first().click();
  await tree.waitFor();
  return tree;
};
const openListNote = async (page, title) => {
  const tree = await ensureTree(page);
  const row = tree.getByRole('treeitem').filter({ has: page.getByText(title, { exact: true }) }).first();
  for (let i = 0; i < 6 && !await row.isVisible(); i++) await tree.locator('[role=treeitem][aria-expanded=false]').first().click();
  await row.click();
};
const openNote = async (page, title) => {
  await page.getByRole('button', { name: 'Notes', exact: true }).first().click();
  await (await ensureTree(page)).getByRole('treeitem').filter({ has: page.getByText(title, { exact: true }) }).first().click();
  await rich(page).waitFor();
};
const savedNote = (page, id, predicate, arg) => persisted(page, 'notes',
  (notes, { id, predicate, arg }) => new Function('note', 'arg', `return (${predicate})(note, arg)`)(notes?.find((n) => n.id === id), arg),
  { id, predicate: predicate.toString(), arg });
const pictureLoaded = (page) => page.waitForFunction(() => {
  const image = document.querySelector('.ProseMirror img[src]:not(.ProseMirror-separator)');
  return image?.complete && image.naturalWidth > 0;
});

await run('F1', async () => {
  const seeded = note('f1', '# Field journal\n\n## Observations\n\n| Sample | Result |\n| --- | --- |\n| River | Clear |\n\n- [ ] Collect sample\n- [x] Label bottle');
  const { page } = await fresh({ notes: [seeded] });
  await openNote(page, seeded.title);
  check('F1', await rich(page).locator('h1').innerText() === 'Field journal'
    && await rich(page).locator('h2').innerText() === 'Observations'
    && await rich(page).locator('table').getByText('Clear', { exact: true }).isVisible()
    && await rich(page).locator('input[type=checkbox]').count() === 2
    && await rich(page).locator('input[type=checkbox]').nth(1).isChecked(), 'seeded headings, table and task list render in rich mode');
});

await run('F2', async () => {
  const seeded = note('f2', '');
  const { page } = await fresh({ notes: [seeded] });
  await openNote(page, seeded.title);
  await rich(page).click();
  await page.keyboard.type('## ');
  await page.keyboard.type('Field observations');
  await savedNote(page, seeded.id, (n) => n?.content === '## Field observations');
  check('F2', await rich(page).locator('h2').innerText() === 'Field observations', 'typing ## space creates a heading saved as Markdown');
});

await run('F3', async () => {
  const seeded = note('f3', '');
  const { page } = await fresh({ notes: [seeded] });
  await openNote(page, seeded.title);
  await rich(page).click();
  const html = fs.readFileSync(new URL('../src/components/notes/fixtures/paste/chatgpt.html', import.meta.url), 'utf8');
  await rich(page).evaluate((element, html) => {
    const clipboardData = new DataTransfer(); clipboardData.setData('text/html', html);
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  }, html);
  await savedNote(page, seeded.id, (n) => /\|\s*Name\s*\|\s*Value\s*\|/.test(n?.content ?? '')
    && /```python\nprint\("hello"\)\n```/.test(n.content)
    && !/Copy code|<script>|<style>/.test(n.content));
  check('F3', await rich(page).locator('table').count() === 1 && await rich(page).locator('pre code').innerText() === 'print("hello")', 'ChatGPT HTML paste saves a Markdown table and code fence without copy chrome');
});

await run('F4', async () => {
  const seeded = note('f4', '');
  const { page } = await fresh({ notes: [seeded] });
  await openNote(page, seeded.title);
  await rich(page).click();
  await rich(page).evaluate((element) => {
    const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 60;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#386850'; ctx.fillRect(0, 0, 80, 60);
    const bytes = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), (c) => c.charCodeAt(0));
    const clipboardData = new DataTransfer(); clipboardData.items.add(new File([bytes], 'field-photo.png', { type: 'image/png' }));
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  });
  await savedNote(page, seeded.id, (n) => /!\[field-photo\]\(daymark-asset:[a-f0-9]{64}\.(webp|jpeg)\)/.test(n?.content ?? ''));
  await pictureLoaded(page);
  await page.reload({ waitUntil: 'load' });
  await openNote(page, seeded.title);
  await pictureLoaded(page);
  check('F4', await rich(page).locator('img[src]:not(.ProseMirror-separator)').isVisible(), 'pasted picture uses daymark-asset Markdown and decodes after reload');
});

await run('F5', async () => {
  const seeded = note('f5', '```mermaid\nflowchart LR\n  Collect --> Review\n  Review --> Archive\n```');
  const { page } = await fresh({ notes: [seeded] });
  await openNote(page, seeded.title);
  const diagram = rich(page).getByRole('button', { name: 'Edit Mermaid diagram', exact: true });
  await diagram.locator('svg').waitFor({ timeout: 20000 });
  check('F5', await diagram.locator('svg').isVisible(), 'Mermaid fence renders an SVG inside its node view');
});

await run('F6', async () => {
  const seeded = note('f6', '## Expedition\n\nOriginal **plan**.');
  const { page } = await fresh({ notes: [seeded] });
  await openNote(page, seeded.title);
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const source = page.getByRole('textbox', { name: 'Note text (Markdown)', exact: true });
  check('F6a', await source.inputValue() === seeded.content, 'Markdown toggle exposes the exact stored source');
  const edited = `${seeded.content}\n\n- Check supplies`;
  await source.fill(edited);
  await savedNote(page, seeded.id, (n, expected) => n?.content === expected, edited);
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await rich(page).locator('ul li').waitFor();
  check('F6b', await rich(page).locator('h2').innerText() === 'Expedition' && await rich(page).locator('ul li').innerText() === 'Check supplies', 'Markdown edit renders on return to rich mode');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  check('F6c', await source.inputValue() === edited, 'rich round trip preserves the Markdown edit');
});

await run('F7', async () => {
  const seeded = note('f7', '');
  const { page } = await fresh({ notes: [seeded, note('f7-target', 'Reference material', 'Field guide')] });
  await openNote(page, seeded.title);
  await rich(page).click();
  await page.keyboard.type('[[Field');
  await page.getByRole('listbox').getByRole('option', { name: 'Field guide', exact: true }).click();
  await savedNote(page, seeded.id, (n) => n?.content.includes('[[Field guide]]'));
  await page.keyboard.type(' [[New expedition');
  await page.getByRole('listbox').getByRole('option', { name: 'Create note "New expedition"', exact: true }).click();
  await persisted(page, 'notes', (notes) => notes?.some((n) => n.title === 'New expedition')
    && notes.find((n) => n.id === 'f7')?.content.includes('[[New expedition]]'));
  check('F7a', await rich(page).locator('[data-wiki-title="Field guide"]').count() === 1, 'autocomplete inserts an existing wiki link');
  await rich(page).locator('[data-wiki-title="New expedition"]').click();
  await page.waitForFunction(() => document.querySelector('#note-title')?.value === 'New expedition');
  check('F7b', true, 'Create note persists a linked note and the chip opens it');
});

await run('F8', async () => {
  const seeded = note('f8', '#  Unusual spacing\n\n<!-- keep this comment -->\n\n<div data-custom="yes">raw HTML</div>\n\n$$x_1 + y_2$$\n\n![[Embedded note]]\n');
  const { page } = await fresh({ notes: [seeded] });
  const syncNow = async () => {
    await openSync(page);
    const response = page.waitForResponse((r) => r.url().endsWith('/api/sync') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Sync now', exact: true }).click();
    if (!(await response).ok()) throw new Error('F8 manual sync failed');
    await page.getByText(/up to date/i).first().waitFor();
    await settingsClose(page);
  };
  await synced(page);
  await syncNow(); // Establish the server base before observing navigation.
  const pushed = [];
  const observe = (request) => {
    if (request.url().endsWith('/api/sync') && request.method() === 'POST') pushed.push(...(request.postDataJSON()?.changes ?? []));
  };
  page.on('request', observe);
  await openNote(page, seeded.title);
  await rich(page).click();
  await page.getByRole('button', { name: 'Today', exact: true }).first().click();
  await settle(page, 3000); // Longer than the 2500ms automatic sync debounce.
  await syncNow(); // Force collection even if no automatic request was scheduled.
  page.off('request', observe);
  await savedNote(page, seeded.id, (n, expected) => n?.content === expected.content && n.updatedAt === expected.updatedAt, seeded);
  check('F8', !pushed.some((change) => change.key === 'note:f8'), 'opening and leaving an unusual note keeps bytes/timestamp and pushes no note change', JSON.stringify(pushed.map((c) => c.key)));
});

// Desktop rail geometry, persisted side selection, focus, and resolved appearance.
await run('R1', async () => {
  for (const width of [1280, 800]) {
    const { page, context } = await fresh({ notes: [note('rail-note', '# Rail focus\n\nText stays editable.', 'Field journal')] });
    await page.setViewportSize({ width, height: 900 });
    const rail = page.getByRole('navigation', { name: 'Main', exact: true });
    const measure = () => page.evaluate(() => {
      const rail = document.querySelector('.dm-side-rail');
      const r = rail.getBoundingClientRect(), m = document.querySelector('main').getBoundingClientRect();
      return { rail: r.width, content: m.width, overlap: Math.min(r.right, m.right) - Math.max(r.left, m.left), rows: [...rail.children].map(el => el.getBoundingClientRect().height), overflow: document.documentElement.scrollWidth - innerWidth };
    });
    let layout = await measure();
    check(`R1-${width}-left`, layout.rail === 168 && layout.content >= width - 169 && layout.overlap <= 1 && layout.overflow <= 1 && layout.rows.length === 5 && Math.max(...layout.rows) - Math.min(...layout.rows) <= 1,
      'five equal rail parts leave all remaining width for content without overlap', JSON.stringify(layout));
    console.log(`Rail ${width}px viewport: ${layout.content}px content area (168px rail).`);
    await settingsOpen(page);
    await settingsBox(page).getByRole('button', { name: 'Right', exact: true }).click();
    await settingsClose(page);
    await page.waitForFunction(() => document.querySelector('.dm-side-rail')?.getAttribute('data-side') === 'right');
    layout = await measure();
    check(`R1-${width}-right`, layout.overlap <= 1 && layout.overflow <= 1 && await rail.evaluate(el => Math.abs(el.getBoundingClientRect().right - innerWidth) < 1), 'Appearance moves the rail to the right with no overlap', JSON.stringify(layout));
    await page.reload({ waitUntil: 'networkidle' });
    check(`R1-${width}-persist`, await rail.getAttribute('data-side') === 'right', 'right-side choice survives reload');
    await openNote(page, 'Field journal');
    await page.getByRole('button', { name: 'Focus mode', exact: true }).click();
    await rail.waitFor({ state: 'hidden' });
    const editorWidth = await page.locator('main').evaluate(el => el.getBoundingClientRect().width);
    check(`R1-${width}-focus`, editorWidth === width && await rich(page).isVisible(), 'Notes focus hides the rail and gives the editor full width');
    await page.getByRole('button', { name: 'Focus mode', exact: true }).click();
    await rail.waitFor();
    check(`R1-${width}-restore`, await rail.getAttribute('data-side') === 'right', 'leaving Notes focus restores the same rail side');
    await context.close();
  }
});
await run('R2', async () => {
  const { page } = await fresh();
  for (const dark of [false, true]) {
    await settingsOpen(page);
    await settingsBox(page).getByRole('button', { name: dark ? /Dark$/ : /Light$/ }).click();
    await settingsBox(page).getByRole('button', { name: 'Header colour #1e3a5f', exact: true }).click();
    if (dark) {
      await page.getByLabel('Add background photo', { exact: true }).setInputFiles(await png(page, 1));
      await page.getByRole('button', { name: 'Select photo 1', exact: true }).waitFor();
    }
    await settingsClose(page);
    const colors = await page.locator('.dm-side-rail').evaluate(el => {
      const s = getComputedStyle(el);
      const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
      const bg = rgb(s.backgroundColor), fg = rgb(s.color);
      return { bg: s.backgroundColor, fg: s.color, ratio: (Math.max(bg, fg) + .05) / (Math.min(bg, fg) + .05), photo: !!document.querySelector('.dm-photo') };
    });
    check(`R2-${dark ? 'dark-photo' : 'light'}`, colors.bg.startsWith('rgb(30, 58, 95') && colors.ratio >= 4.5 && (!dark || colors.photo), 'rail applies custom header colour with readable text in light/dark/photo modes', JSON.stringify(colors));
  }
});
await run('R3', async () => {
  const { page } = await fresh();
  for (const largeText of [false, true]) {
    if (largeText) {
      await settingsOpen(page);
      await settingsBox(page).getByRole('button', { name: 'L', exact: true }).click();
      await settingsClose(page);
    }
    for (const height of [480, 600, 640, 900]) {
    await page.setViewportSize({ width: 1280, height });
    // Move focus away before resetting the scroll position; focusing an already
    // focused Search button does not trigger the browser's focus scrolling.
    await page.locator('[data-rail-part="today"]').focus();
    const title = page.locator('[data-rail-part="title"]');
    const initial = await title.evaluate(el => {
      el.scrollTop = 0;
      const r = el.getBoundingClientRect(), brand = el.querySelector(':scope > span.font-bold').getBoundingClientRect(), date = el.querySelector('span[title]').getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, brandTop: brand.top, dateHeight: date.height, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, overflow: getComputedStyle(el).overflowY };
    });
    await title.getByRole('button', { name: 'Search (Ctrl Shift F)', exact: true }).focus();
    const focused = await title.evaluate(el => {
      const r = el.getBoundingClientRect(), search = document.activeElement.getBoundingClientRect();
      const hit = document.elementFromPoint(search.left + search.width / 2, search.top + search.height / 2);
      return { scroll: el.scrollTop, visible: search.top >= r.top && search.bottom <= r.bottom + 1, hit: el.contains(hit), overflow: document.documentElement.scrollWidth - innerWidth };
    });
    check(`R3-${largeText ? 'large-' : ''}${height}`, initial.brandTop >= initial.top && initial.dateHeight >= 16 && initial.overflow === 'auto' && focused.visible && focused.hit && focused.overflow <= 1
      && (initial.scrollHeight > initial.clientHeight ? focused.scroll > 0 : focused.scroll === 0), 'short-height Title preserves readable text and scrolls focused controls within its equal row', JSON.stringify({ initial, focused }));
    }
  }
});

await run('R4', async () => {
  const { page } = await fresh();
  for (const dark of [false, true]) {
    for (const size of ['S', 'M', 'L']) {
      await settingsOpen(page);
      await settingsBox(page).getByRole('button', { name: dark ? /Dark$/ : /Light$/ }).click();
      await settingsBox(page).getByRole('button', { name: size, exact: true }).click();
      await settingsClose(page);
      const geometry = await page.locator('.dm-side-rail').evaluate(nav => {
        const labels = [...nav.querySelectorAll('*')].filter(el => [...el.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()));
        return { minimumFont: Math.min(...labels.map(el => parseFloat(getComputedStyle(el).fontSize))), syncHeight: nav.querySelector('[aria-label^="Sync:"]').getBoundingClientRect().height,
          shortcutOpacity: getComputedStyle(nav.querySelector('kbd')).opacity };
      });
      const key = `${dark ? 'dark' : 'light'}-${size}`;
      check(`R4-${key}-geometry`, geometry.minimumFont >= 12 && geometry.syncHeight >= 24 && geometry.shortcutOpacity === '1', 'rail text is at least 12px, Sync target at least 24px, and shortcut keeps full contrast', JSON.stringify(geometry));
      await page.addScriptTag({ content: fs.readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8') });
      const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast', 'page-has-heading-one'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(node => node.target) })));
      check(`R4-${key}-axe`, violations.length === 0, 'axe finds no contrast or missing page heading violations', JSON.stringify(violations));
    }
  }
  for (const label of ['Today', 'Calendar', 'Notes', 'Backlog']) {
    await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name: label, exact: true }).click();
    const heading = page.locator('main > h1.sr-only');
    check(`R4-heading-${label}`, await heading.count() === 1 && await heading.innerText() === label, 'desktop page has its accessible heading while visible title remains removed');
  }
});

await run('C10-P8', async () => {
  const longCategory = 'A'.repeat(200);
  const { page, errors } = await fresh({ mobile: true,
    docs: [doc(TODAY, [task('phone-backlog', 'not-started', TODAY)])],
    backlog: { items: ['First phone idea', 'Second phone idea'].map((title, order) => ({ id: `phone-idea-${order}`, title, category: longCategory, order, createdAt: `${TODAY}T08:00:00Z`, updatedAt: `${TODAY}T08:00:00Z` })) },
  });
  const nav = page.getByRole('navigation', { name: 'Main', exact: true });
  const backlogRow = title => page.locator('main li').filter({ has: page.getByText(title, { exact: true }) });
  for (const { width, small } of [{ width: 360 }, { width: 320 }, { width: 700 }, { width: 360, small: true }]) {
    const caseId = `${width}${small ? '-small' : ''}`;
    await page.setViewportSize({ width, height: 740 });
    await page.evaluate(size => { document.documentElement.style.fontSize = size; }, small ? '15px' : '16px');
    await nav.getByRole('button', { name: 'Backlog', exact: true }).click();
    const geometry = await nav.evaluate(n => {
      const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
      return { buttons: [...n.querySelectorAll('button')].map(b => ({ ...rect(b), label: b.getAttribute('aria-label') || b.textContent, clipped: b.scrollWidth > b.clientWidth })), plus: rect(n.querySelector('[aria-label="New task"]')) };
    });
    check(`C10-P8-${caseId}-navigation`, geometry.buttons.map(b => b.label).join('|') === 'Today|Calendar|New task|Backlog|Notes'
      && geometry.buttons.every(b => b.width >= 44 && b.height >= 44 && !b.clipped)
      && Math.abs(geometry.plus.x + geometry.plus.width / 2 - width / 2) <= 1,
    'phone navigation fits with 44px targets, complete labels and centred capture', JSON.stringify(geometry));
    const headerSettings = page.locator('header').getByRole('button', { name: 'Settings', exact: true });
    const settingsGeometry = await headerSettings.evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, right: r.right, width: r.width, height: r.height }; });
    check(`C10-P8-${caseId}-header-settings`, settingsGeometry.width === 44 && settingsGeometry.height === 44 && settingsGeometry.x >= 0 && settingsGeometry.right <= width, 'header Settings has a visible 44px target', JSON.stringify(settingsGeometry));
    await headerSettings.click();
    check(`C10-P8-${caseId}-settings-open`, await settingsBox(page).isVisible(), 'header Settings opens the settings dialog');
    await settingsClose(page);
    console.log(`GEOMETRY ${width}: ${JSON.stringify(geometry)}`);
    const first = backlogRow('First phone idea');
    const pick = first.getByLabel('Pick a day');
    const controls = await first.locator('button, input').evaluateAll(elements => elements.map(el => {
      const r = el.getBoundingClientRect(); return { label: el.textContent || el.type, width: r.width, height: r.height, right: r.right };
    }));
    const date = await pick.boundingBox(), add = await first.getByRole('button', { name: 'Add to day', exact: true }).boundingBox();
    check(`C10-P8-${caseId}-content`, controls.every(b => b.width >= 44 && b.height >= 44 && b.right <= width)
      && Math.abs(date.width - add.width) <= 1 && add.y >= date.y + date.height
      && await page.getByRole('heading', { name: 'Backlog', exact: true }).isVisible()
      && await page.evaluate(() => document.querySelector('main').scrollWidth <= document.querySelector('main').clientWidth),
    'compact Backlog stacks full-width picking and retains touch-sized actions', JSON.stringify({ controls, date, add }));
    const heading = await page.locator('main h2').evaluate(el => ({ text: el.textContent, width: el.clientWidth, scroll: el.scrollWidth }));
    check(`C10-P8-${caseId}-category`, heading.text === longCategory && heading.scroll <= heading.width, '200-character category stays complete and wraps inside the phone content', JSON.stringify(heading));
    await nav.getByRole('button', { name: 'Today', exact: true }).click();
    await page.getByRole('button', { name: 'More actions for "Task phone-backlog"', exact: true }).click();
    const menu = await page.getByRole('menu').boundingBox(), bar = await nav.boundingBox();
    check(`C10-P8-${caseId}-sheet`, menu.y >= 0 && menu.y + menu.height <= bar.y + 1
      && await page.getByRole('menuitem', { name: 'Move to backlog', exact: true }).isVisible(), 'task sheet including Move to backlog fits above the bottom bar', JSON.stringify({ menu, bar }));
    await page.keyboard.press('Escape');
  }
  await nav.getByRole('button', { name: 'Backlog', exact: true }).click();
  await backlogRow('First phone idea').getByRole('button', { name: 'Move First phone idea down', exact: true }).click();
  check('C10-P8-reorder', (await page.locator('main li p.font-medium').allTextContents()).join('|') === 'Second phone idea|First phone idea', 'phone keeps manual reorder');
  await backlogRow('Second phone idea').getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('main').getByLabel('Task', { exact: true }).fill('Edited phone idea');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await backlogRow('Edited phone idea').getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  check('C10-P8-edit-delete', await backlogRow('Edited phone idea').count() === 1, 'phone edit, delete and Undo use shared state');
  await backlogRow('First phone idea').getByRole('button', { name: 'Add to day', exact: true }).click();
  const docs = await readDocs(page);
  check('C10-P8-pick', docs.find(d => d.date === TODAY)?.headings.flatMap(h => h.items).filter(t => t.title === 'First phone idea').length === 1, 'phone picking creates one daily task');
  check('C10-P8-errors', errors.length === 0, 'phone Backlog has no browser errors', errors.join(' | '));
});

await run('C10-X1', async () => {
  const title = 'Parked carried history';
  const { page } = await fresh({ docs: [
    doc(Y1, [task('park-history', 'in-progress', Y1, { title })], 'Keep yesterday journal'),
    doc(TODAY, [task('park-history', 'in-progress', Y1, { title, carriedFromDate: Y1 })], 'Keep today journal'),
  ] });
  await page.getByRole('button', { name: `More actions for "${title}"`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Move to backlog', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: title, exact: true }).waitFor();
  await page.waitForTimeout(600);
  await page.reload({ waitUntil: 'networkidle' });
  check('C10-X1-undo', await page.getByRole('button', { name: title, exact: true }).isVisible(), 'Undo cancels the park and keeps restored work open after reload');
  await page.getByRole('button', { name: `More actions for "${title}"`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Move to backlog', exact: true }).click();
  await page.getByRole('button', { name: 'Previous day', exact: true }).click();
  check('C10-X1-day', await page.getByRole('button', { name: 'Done (1)', exact: true }).count() === 0, 'parked carried history is not shown as completed work in historical Today');
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  check('C10-X1-week', await page.getByText(title, { exact: true }).count() === 0, 'parked carried history is absent from Week task lists');
  const saved = (await readDocs(page)).find(d => d.date === Y1);
  check('C10-X1-data', saved.headings[0].notesContent === 'Keep yesterday journal' && saved.headings[0].items.some(t => t.title === title && t.movedToBacklogDate), 'excluded historical task and journal stay in the stored document');
});

// Cycle 11 Task 6: related suggestions, explicit edits, dismissals and phone sheet.
await run('C11-Related', async () => {
  const { page, errors } = await fresh();
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.getByRole('button', { name: 'Notes', exact: true }).first().click();
  for (const title of ['Java stream', 'Java collectors']) {
    await page.getByRole('complementary', { name: 'Folder navigation', exact: true }).getByRole('button', { name: 'New note', exact: true }).click();
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
    await rich(page).fill('Java stream collectors pipeline processing');
  }
  const panel = page.getByRole('complementary', { name: 'Related panel', exact: true });
  const suggested = panel.getByRole('region', { name: 'Suggested notes', exact: true });
  await suggested.getByRole('button', { name: 'Link', exact: true }).waitFor();
  check('C11-Related-shares', (await suggested.innerText()).includes('shares:') && (await suggested.innerText()).includes('java'), 'two written Java notes show shared words');
  await suggested.getByRole('button', { name: 'Not related', exact: true }).click();
  await persisted(page, 'notemeta', meta => meta?.dismissed?.some(pair => !pair.restored));
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Notes', exact: true }).first().click();
  await panel.getByText('Hidden suggestions (1)', { exact: true }).waitFor();
  check('C11-Related-dismiss', await suggested.getByRole('button', { name: 'Link', exact: true }).count() === 0, 'dismissal survives reload');
  await panel.getByText('Hidden suggestions (1)', { exact: true }).click();
  await panel.getByRole('button', { name: 'Restore', exact: true }).click();
  await suggested.getByRole('button', { name: 'Link', exact: true }).waitFor();
  await persisted(page, 'notemeta', meta => meta?.dismissed?.some(pair => pair.restored));
  check('C11-Related-restore', true, 'restore records restored:true and brings back the suggestion');
  const source = await page.getByRole('textbox', { name: 'Title', exact: true }).inputValue();
  const target = await suggested.getByRole('button').first().innerText();
  await suggested.getByRole('button', { name: 'Link', exact: true }).click();
  await persisted(page, 'notes', (notes, { source, target }) => notes?.some(note => note.title === source && note.content.includes(`## Related`) && note.content.includes(`- [[${target}]]`)), { source, target });
  await suggested.getByRole('button', { name: 'Link', exact: true }).waitFor({ state: 'hidden' });
  await panel.getByRole('region', { name: 'Linked notes', exact: true }).getByRole('button', { name: target, exact: true }).click();
  await panel.getByRole('region', { name: 'Linked notes', exact: true }).getByRole('button', { name: source, exact: true }).waitFor();
  check('C11-Related-link', (await rich(page).innerText()).includes('Related') === false && (await panel.innerText()).includes('Incoming'), 'Link writes only the source; the target shows its incoming backlink');
  await page.getByRole('button', { name: 'Minimize Related', exact: true }).click();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Notes', exact: true }).first().click();
  await page.getByRole('button', { name: /^Expand Related,/ }).waitFor();
  check('C11-Related-prefs', true, 'Related minimized state survives reload');
  check('C11-Related-errors', errors.length === 0, 'Related actions have no browser errors', errors.join(' | '));
});

for (const width of [1200, 900, 390]) await run(`C11-Related-${width}`, async () => {
  const { page } = await fresh({ mobile: width === 390, notes: [note('related-a', 'Java stream collectors pipeline', 'Java stream'), note('related-b', 'Java stream collectors pipeline', 'Java collectors')] });
  await page.setViewportSize({ width, height: 900 });
  await page.getByRole('button', { name: 'Notes', exact: true }).first().click();
  await openListNote(page, 'Java stream');
  await rich(page).waitFor();
  const outDir = path.join(os.tmpdir(), 'daymark-task-6-qa'); fs.mkdirSync(outDir, { recursive: true });
  if (width === 1200) {
    const strip = page.getByRole('complementary', { name: 'Related minimized', exact: true });
    await strip.getByText('1', { exact: true }).waitFor();
    check('C11-Related-1200-strip', await strip.isVisible(), 'compact desktop starts minimized with a suggestion badge');
    await strip.getByRole('button', { name: /^Expand Related,/ }).click();
  } else {
    const opener = page.getByRole('button', { name: 'Related · 1', exact: true });
    await opener.click();
    const sheet = page.getByRole('dialog', { name: 'Related', exact: true });
    await sheet.getByRole('button', { name: 'Link', exact: true }).waitFor();
    const heights = await sheet.locator('button, summary').evaluateAll(els => els.filter(el => el.getClientRects().length).map(el => el.getBoundingClientRect().height));
    check(`C11-Related-${width}-targets`, heights.every(h => h >= 44), 'Related sheet actions have 44px targets', JSON.stringify(heights));
    if (width === 390) {
      const box = await sheet.boundingBox();
      check('C11-Related-390-bottom', Math.abs(box.y + box.height - 900) <= 1, 'phone sheet docks to the bottom');
    }
    await page.screenshot({ path: path.join(outDir, `related-${width}-sheet.png`) });
    // Select the real saved theme so dm-card variables follow the palette too.
    await page.keyboard.press('Escape');
    await settingsOpen(page);
    await settingsBox(page).getByRole('button', { name: /Dark$/ }).click();
    await settingsClose(page);
    await themeSaved(page, 'dark');
    await opener.click();
    await page.screenshot({ path: path.join(outDir, `related-${width}-sheet-dark.png`) });
    await page.keyboard.press('Escape');
    check(`C11-Related-${width}-focus`, await opener.evaluate(el => el === document.activeElement), 'closing Related returns focus to the note header');
    // Markdown Link uses the textarea's normal edit path.
    await page.getByRole('button', { name: 'Markdown', exact: true }).click();
    await opener.click();
    await sheet.getByRole('button', { name: 'Link', exact: true }).click();
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    check(`C11-Related-${width}-markdown`, (await page.getByRole('textbox', { name: 'Note text (Markdown)', exact: true }).inputValue()).includes('- [[Java collectors]]'), 'sheet Link edits the Markdown textarea');
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  check(`C11-Related-${width}-layout`, !overflow, 'Related fits the viewport');
  await page.screenshot({ path: path.join(outDir, `related-${width}.png`) });
});

// One 288px navigation column: Related fits inline from 1280px, so the overlay path is exercised at 1100 and 1200.
for (const width of [1100, 1200, 1280, 1366, 1440, 1600, 1920]) await run(`C11-Related-space-${width}`, async () => {
  const { page } = await fresh({ notes: [note('space-a', 'Java stream collectors pipeline', 'Java stream'), note('space-b', 'Java stream collectors pipeline', 'Java collectors')] });
  await page.setViewportSize({ width, height: 900 });
  await page.getByRole('button', { name: 'Notes', exact: true }).first().click();
  await rich(page).waitFor();
  const editor = page.getByRole('group', { name: 'Note editor', exact: true });
  const initial = await editor.boundingBox();
  check(`C11-Related-space-${width}-minimum`, initial.width >= 480, 'default editor stays at least 480px', String(initial.width));
  const expand = page.getByRole('button', { name: /^Expand Related,/ });
  const overlay = editor.getByRole('dialog', { name: 'Related', exact: true });
  if (width <= 1200) {
    await expand.click();
    await overlay.waitFor();
    const expanded = await editor.boundingBox();
    check(`C11-Related-space-${width}-overlay`, Math.abs(initial.width - expanded.width) <= 1, 'explicit expand overlays the editor without squeezing it');
    await page.setViewportSize({ width: width + 1, height: 900 });
    await settle(page, 100);
    check(`C11-Related-space-${width}-resize`, await overlay.isVisible(), 'a one-pixel resize keeps the overlay open');
    await page.keyboard.press('Escape');
    check(`C11-Related-space-${width}-escape`, await expand.evaluate(el => el === document.activeElement), 'Escape returns focus to the counted strip toggle');
    await expand.click();
    await page.getByRole('searchbox', { name: 'Search notes', exact: true }).click();
    check(`C11-Related-space-${width}-outside`, await overlay.count() === 0, 'outside click closes the overlay');
    await expand.click();
    if (width === 1100) {
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Notes', exact: true }).first().click();
      await overlay.waitFor();
      check('C11-Related-space-open-persisted', Math.abs((await editor.boundingBox()).width - initial.width) <= 1, 'explicit open preference survives reload as an overlay');
    }
    await overlay.getByRole('button', { name: 'Minimize Related', exact: true }).click();
    check(`C11-Related-space-${width}-toggle`, await overlay.count() === 0, 'the overlay toggle closes it');
    if (width === 1100) {
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Notes', exact: true }).first().click();
      await expand.waitFor();
      check('C11-Related-space-min-persisted', await overlay.count() === 0, 'explicit minimize survives reload');
    }
  } else {
    check(`C11-Related-space-${width}-inline`, await page.getByRole('complementary', { name: 'Related panel', exact: true }).isVisible() && await overlay.count() === 0, 'wide default opens Related inline');
  }
  check(`C11-Related-space-${width}-overflow`, !await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), 'desktop panes fit the viewport');
});

// Cycle 11 Task 4: folder operations use the public UI and persisted vault data.
await run('C11-Folders', async () => {
  const notes = [
    { ...note('folder-java', 'Keep Java body', 'Java notes'), folder: 'Tech/Java' },
    { ...note('folder-inbox', 'Keep inbox body', 'Inbox notes'), folder: 'Inbox' },
    { ...note('folder-root', 'Keep root body', 'Root note'), folder: ' / ' },
  ];
  const { page, errors } = await fresh({ notes });
  await page.getByRole('button', { name: 'Notes', exact: true }).first().click();
  // Cycle 12: one navigation column. Tree rows are named "<Folder>, folder, <n> notes" and carry data-folder-path.
  const tree = page.getByRole('tree', { name: 'Notes', exact: true });
  const folderRow = path => tree.locator(`[role=treeitem][data-folder-path="${path}"]`);
  const noteRow = title => tree.getByRole('treeitem', { name: title, exact: true });
  // Rows are hidden while an ancestor is collapsed, so expand the chain down to the folder.
  const reveal = async path => {
    const parts = path.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const row = folderRow(parts.slice(0, i).join('/'));
      await row.waitFor();
      if (await row.getAttribute('aria-expanded') === 'false') await row.click();
    }
  };
  const stripRow = path => page.getByRole('button', { name: 'Open folder ' + path, exact: true });
  const levelOf = async title => Number(await noteRow(title).getAttribute('aria-level'));
  await reveal('Tech/Java');
  check('C11-Folders-root-only', await levelOf('Root note') === 1 && await levelOf('Java notes') === 3 && (await noteRow('Inbox notes').count() === 0 || await levelOf('Inbox notes') === 2), 'a root note is a top-level row; nested and other-folder notes are not');
  await reveal('Inbox');
  check('C11-Folders-all', await noteRow('Root note').isVisible() && await noteRow('Java notes').isVisible() && await noteRow('Inbox notes').isVisible(), 'every note in the vault is reachable from the one tree');
  const action = async (path, name) => {
    await page.getByRole('button', { name: `Actions for ${path}`, exact: true }).click();
    await page.getByRole('menuitem', { name, exact: true }).click();
  };
  await noteRow('Root note').click(); // New folder nests in the current folder; a root note makes that the top level.
  await page.getByRole('button', { name: 'New folder', exact: true }).click();
  await page.getByRole('textbox', { name: 'Folder name', exact: true }).fill('Empty');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await folderRow('Empty').waitFor();
  await action('Empty', 'New folder inside');
  await page.getByRole('textbox', { name: 'Folder name', exact: true }).fill('Nested');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await reveal('Empty/Nested');
  check('C11-Folders-empty', await folderRow('Empty/Nested').getAttribute('aria-label') === 'Nested, folder, 0 notes' && await folderRow('Empty/Nested').getAttribute('aria-level') === '2', 'nested empty folders exist without overview notes');

  await reveal('Tech');
  check('C11-Folders-nested-filter', await folderRow('Tech').getAttribute('aria-label') === 'Tech, folder, 1 note' && await levelOf('Java notes') === 3 && await levelOf('Root note') === 1, 'a parent folder row counts and nests its descendants only');
  await noteRow('Java notes').click();
  await page.getByRole('button', { name: /Move to folder:/ }).click();
  await page.getByRole('menuitem', { name: 'Empty / Nested', exact: true }).click();
  await savedNote(page, 'folder-java', n => n.folder === 'Empty/Nested');
  check('C11-Folders-picker', await page.getByRole('textbox', { name: 'Title', exact: true }).inputValue() === 'Java notes', 'picker moves the note and keeps it open');
  await reveal('Tech/Java');
  await noteRow('Java notes').dragTo(folderRow('Tech/Java'));
  await savedNote(page, 'folder-java', n => n.folder === 'Tech/Java');
  check('C11-Folders-drag', true, 'desktop note drag persists its destination');

  await action('Tech', 'Rename folder');
  await page.getByRole('textbox', { name: 'Folder name', exact: true }).fill('Engineering');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await savedNote(page, 'folder-java', n => n.folder === 'Engineering/Java');
  await reveal('Engineering/Java');
  check('C11-Folders-rename', true, 'renaming a parent moves child paths');

  await reveal('Empty/Nested');
  await action('Empty/Nested', 'Move folder');
  await page.getByRole('combobox', { name: 'Destination folder', exact: true }).selectOption('Engineering');
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await reveal('Engineering/Nested');
  check('C11-Folders-move', true, 'folder Move dialog provides the keyboard alternative');
  await folderRow('Engineering/Nested').dragTo(folderRow('Empty'));
  await reveal('Empty/Nested');
  check('C11-Folders-folder-drag', true, 'desktop folder drag moves an empty subtree');

  await action('Inbox', 'Rename folder');
  await page.getByRole('textbox', { name: 'Folder name', exact: true }).fill('Engineering');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  const merge = page.getByRole('alertdialog', { name: 'Merge folders?', exact: true });
  await merge.waitFor();
  check('C11-Folders-merge-count', (await merge.innerText()).includes('2 notes'), 'merge confirmation reports all affected notes');
  await merge.getByRole('button', { name: 'Merge', exact: true }).click();
  await savedNote(page, 'folder-inbox', n => n.folder === 'Engineering');
  await action('Engineering', 'Delete folder');
  const deletion = page.getByRole('alertdialog', { name: 'Delete folder?', exact: true });
  check('C11-Folders-delete-message', (await deletion.innerText()).includes('No notes are deleted'), 'delete confirmation states where notes go and preserves notes');
  await deletion.getByRole('button', { name: 'Delete', exact: true }).click();
  await savedNote(page, 'folder-java', n => n.folder === '' && n.content === 'Keep Java body');
  await savedNote(page, 'folder-inbox', n => n.folder === '' && n.content === 'Keep inbox body');
  check('C11-Folders-delete-selection', await levelOf('Java notes') === 1 && await levelOf('Inbox notes') === 1 && await folderRow('Engineering').count() === 0, 'top-level delete shows the moved notes at the top level');
  check('C11-Folders-delete', true, 'folder delete preserves every note body at the parent');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await savedNote(page, 'folder-java', n => n.folder === 'Engineering/Java');
  check('C11-Folders-undo', true, 'Undo restores the subtree');
  await page.getByRole('button', { name: 'Minimize notes column', exact: true }).click();
  const strip = page.getByRole('complementary', { name: 'Folder navigation', exact: true });
  const stripBounds = await strip.boundingBox();
  check('C11-Folders-min-strip', await tree.count() === 0 && await strip.getByRole('button', { name: 'Search notes', exact: true }).isVisible() && await strip.getByRole('button', { name: 'New note', exact: true }).isVisible() && Math.abs(stripBounds.width - 56) <= 1, 'minimizing replaces the column with a 56px shortcut strip');
  await stripRow('Engineering').click(); await reveal('Engineering');
  check('C11-Folders-strip-select', await folderRow('Engineering').getAttribute('aria-current') === 'true' && await noteRow('Java notes').isVisible() && await noteRow('Inbox notes').isVisible(), 'folder shortcut expands the column with that folder current');
  await page.getByRole('button', { name: 'Minimize notes column', exact: true }).click();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByRole('button', { name: 'Expand notes column', exact: true }).waitFor();
  check('C11-Folders-prefs', await stripRow('Engineering').isVisible() && await tree.count() === 0, 'minimized shortcut strip survives reload');
  await strip.getByRole('button', { name: 'Search notes', exact: true }).click();
  check('C11-Folders-persist-search', await page.getByRole('searchbox', { name: 'Search notes', exact: true }).evaluate(el => el === document.activeElement) && await page.getByRole('button', { name: 'New note', exact: true }).isVisible() && await noteRow('Root note').isVisible(), 'strip Search restores the one column, focuses search and keeps all notes reachable');
  check('C11-Folders-errors', errors.length === 0, 'folder operations have no browser errors', errors.join(' | '));
});

for (const width of [1440, 1200, 900, 390]) await run(`C11-Width-${width}`, async () => {
  const { page } = await fresh({ mobile: width === 390, notes: [{ ...note('responsive-folder', 'Body', 'Responsive note'), folder: 'Tech/Java' }] });
  await page.setViewportSize({ width, height: 900 });
  await page.getByRole('button', { name: 'Notes', exact: true }).first().click();
  if (width >= 1100) {
    await page.getByRole('button', { name: /^(Minimize|Expand) notes column$/ }).waitFor();
    check(`C11-Width-${width}-tree`, await page.getByRole('treeitem', { name: 'Tech, folder, 1 note', exact: true }).isVisible(), 'desktop tree stays reachable');
  } else if (width >= 768) {
    const opener = page.getByRole('group', { name: 'Note editor', exact: true }).getByRole('button', { name: 'Notes', exact: true });
    await opener.click();
    const drawer = page.getByRole('dialog', { name: 'Notes', exact: true });
    await drawer.getByRole('treeitem', { name: 'Tech, folder, 1 note', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    check('C11-Width-' + width + '-escape', await opener.evaluate(el => el === document.activeElement), 'Escape closes Notes drawer and restores focus');
    await opener.click();
    await drawer.getByRole('treeitem', { name: 'Tech, folder, 1 note', exact: true }).click();
    check('C11-Width-' + width + '-folder', await drawer.isVisible(), 'folder activation keeps the Notes drawer open');
  } else {
    const heights = await page.getByRole('tree', { name: 'Notes', exact: true }).getByRole('treeitem').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height));
    check('C11-Width-390-rows', heights.length > 0 && heights.every(height => height >= 44), 'phone tree rows have 44px targets', JSON.stringify(heights));
  }
  await openListNote(page, 'Responsive note'); await rich(page).waitFor();
  if (width >= 768 && width < 1100) {
    const opener = page.getByRole('group', { name: 'Note editor', exact: true }).getByRole('button', { name: 'Notes', exact: true });
    check('C11-Width-' + width + '-selection', await page.getByRole('dialog', { name: 'Notes', exact: true }).count() === 0 && await opener.evaluate(el => el === document.activeElement), 'opening a note closes the drawer and returns focus to Notes');
  }
  const bounds = await page.getByRole('textbox', { name: 'Title', exact: true }).boundingBox();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  check(`C11-Width-${width}-layout`, !overflow && bounds.x >= 0 && bounds.x + bounds.width <= width, 'editor fits without horizontal overlap');
  const outDir = path.join(os.tmpdir(), 'daymark-task-4-qa'); fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `notes-${width}.png`) });
  // Select the saved app theme: a system colour scheme alone does not override sample settings.
  await settingsOpen(page);
  await settingsBox(page).getByRole('button', { name: /Dark$/ }).click();
  await settingsClose(page);
  await themeSaved(page, 'dark');
  await page.screenshot({ path: path.join(outDir, `notes-${width}-dark.png`) });
  if (width >= 768 && width < 1100) {
    await page.getByRole('group', { name: 'Note editor', exact: true }).getByRole('button', { name: 'Notes', exact: true }).click();
    await page.getByRole('dialog', { name: 'Notes', exact: true }).waitFor();
    await page.screenshot({ path: path.join(outDir, `folders-${width}-dark.png`) });
  }
});

// Cycle 12 Task 3: desktop one-column tree. Browser execution belongs to the controller.
const c12Note = (id, title, folder = '', content = 'Body') => ({ id, title, folder, content, tags: [], pinned: false, createdAt: '2026-10-29T08:00:00Z', updatedAt: '2026-10-29T08:00:00Z' });
const c12Open = async page => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByRole('tree', { name: 'Notes', exact: true }).waitFor();
};
const c12Tree = page => page.getByRole('tree', { name: 'Notes', exact: true });
const c12Fixtures = () => [c12Note('java', 'Java note', 'Tech/Java'), c12Note('root', 'Root note'), c12Note('garden', 'Garden note', 'Garden')];

await run('C12-Navigation', async () => {
  const { page, errors } = await fresh({ notes: c12Fixtures() }); await c12Open(page);
  const search = page.getByRole('searchbox', { name: 'Search notes', exact: true });
  const create = page.getByRole('button', { name: 'New note', exact: true }).first();
  const tree = c12Tree(page); const column = page.getByRole('complementary', { name: 'Folder navigation', exact: true });
  const [s, c, t, col, editor] = await Promise.all([search.boundingBox(), create.boundingBox(), tree.boundingBox(), column.boundingBox(), page.getByRole('group', { name: 'Note editor', exact: true }).boundingBox()]);
  check('C12-Navigation-order', s.y + s.height <= c.y && c.y + c.height <= t.y, 'search, creation, tree appear in order');
  // At 1440: old 224px tree + 256px list cost 480px; the new column costs 288px.
  check('C12-Navigation-width', Math.abs(col.width - 288) <= 1 && editor.width >= 600, 'one 288px column leaves at least 600px for the desktop editor', JSON.stringify({ column: col.width, editor: editor.width }));
  const tech = tree.getByRole('treeitem', { name: 'Tech, folder, 1 note', exact: true });
  await tech.click(); check('C12-Navigation-collapse', await tree.getByRole('treeitem', { name: 'Java, folder, 1 note', exact: true }).count() === 0, 'collapsing parent hides nested folders and notes');
  await tech.click(); await tree.getByRole('treeitem', { name: 'Java note', exact: true }).click();
  check('C12-Navigation-open', await page.getByRole('textbox', { name: 'Title', exact: true }).inputValue() === 'Java note', 'tree note opens in the editor');
  await page.getByRole('button', { name: 'Pin note to the top', exact: true }).click();
  check('C12-Navigation-pinned-selection', await tree.locator('[aria-selected=true]').count() === 1 && await tree.getByRole('group', { name: 'Pinned', exact: true }).locator('[aria-current=true]').count() === 1, 'only the folder copy is selected and the pinned copy announces current');
  await search.fill('Root'); await tree.getByRole('treeitem', { name: 'Root note', exact: true }).waitFor();
  check('C12-Navigation-search', await page.getByRole('status').filter({ hasText: /^1 note matches$/ }).count() === 1 && await tree.locator('[aria-selected="true"]').evaluate(el => getComputedStyle(el).opacity === '0.7') && await tree.locator('mark').innerText() === 'Root', 'search filters in place, highlights and announces one match while keeping the open note dimmed');
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await tech.focus(); await page.keyboard.press('Home'); await page.keyboard.press('End');
  check('C12-Navigation-end', await tree.getByRole('treeitem', { name: 'Root note', exact: true }).evaluate(el => el === document.activeElement), 'End reaches the last note');
  await page.keyboard.press('Enter'); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowUp');
  check('C12-Navigation-keyboard', await tree.locator('[tabindex="0"]').count() === 1 && await tree.evaluate(el => el.contains(document.activeElement)), 'keyboard-only tree walk keeps one roving tab stop');
  check('C12-Navigation-errors', errors.length === 0, 'navigation has no browser errors', errors.join(' | '));
});

await run('C12-Create', async () => {
  const { page } = await fresh({ notes: c12Fixtures() }); await c12Open(page);
  await c12Tree(page).getByRole('treeitem', { name: 'Java note', exact: true }).click();
  await page.getByRole('button', { name: 'New note', exact: true }).first().click();
  const title = page.getByRole('textbox', { name: 'Title', exact: true }); await title.fill('Created in Java');
  check('C12-Create-note', await c12Tree(page).getByRole('treeitem', { name: 'Created in Java', exact: true }).getAttribute('aria-level') === '3', 'New note lands inside the opened note folder');
  await page.getByRole('button', { name: 'New folder', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New folder', exact: true });
  check('C12-Create-context', (await dialog.innerText()).includes('In Tech/Java'), 'New folder dialog uses the current folder');
  await dialog.getByRole('textbox', { name: 'Folder name', exact: true }).fill('Drafts'); await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  check('C12-Create-folder', await c12Tree(page).getByRole('treeitem', { name: 'Drafts, folder, 0 notes', exact: true }).getAttribute('aria-level') === '3', 'New folder is nested inside the current folder');
});

await run('C12-DragRename', async () => {
  const { page, errors } = await fresh({ notes: c12Fixtures() }); await c12Open(page);
  const tree = c12Tree(page); const root = tree.getByRole('treeitem', { name: 'Root note', exact: true });
  const java = tree.getByRole('treeitem', { name: 'Java, folder, 1 note', exact: true });
  await root.dragTo(java);
  await tree.getByRole('treeitem', { name: 'Java, folder, 2 notes', exact: true }).waitFor();
  check('C12-DragRename-folder', await root.getAttribute('aria-level') === '3', 'dragging a note to a folder moves it');
  // Keep the pointer down while the conditional top-level strip mounts.
  const box = await root.boundingBox(); await page.mouse.move(box.x + 60, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + 80, box.y + box.height / 2 + 12, { steps: 5 });
  const strip = page.getByLabel('Move to top level', { exact: true }); await strip.waitFor(); const drop = await strip.boundingBox();
  await page.mouse.move(drop.x + drop.width / 2, drop.y + drop.height / 2, { steps: 10 }); await page.mouse.up();
  await tree.getByRole('treeitem', { name: 'Java, folder, 1 note', exact: true }).waitFor();
  check('C12-DragRename-root', await root.getAttribute('aria-level') === '1' && await strip.count() === 0, 'top-level drop moves the note and hides the drag strip');
  await page.getByRole('button', { name: 'Actions for Tech', exact: true }).click(); await page.getByRole('menuitem', { name: 'Rename folder', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Rename folder', exact: true }); await dialog.getByRole('textbox', { name: 'Folder name', exact: true }).fill('Engineering'); await dialog.getByRole('button', { name: 'Rename', exact: true }).click();
  await tree.getByRole('treeitem', { name: 'Engineering, folder, 1 note', exact: true }).waitFor();
  const nested = tree.getByRole('treeitem', { name: 'Java, folder, 1 note', exact: true }); if (await nested.getAttribute('aria-expanded') === 'false') await nested.click();
  await tree.getByRole('treeitem', { name: 'Java note', exact: true }).click();
  check('C12-DragRename-kept', await page.getByRole('textbox', { name: 'Title', exact: true }).inputValue() === 'Java note' && await root.count() === 1, 'renaming the parent preserves nested and top-level notes');
  check('C12-DragRename-errors', errors.length === 0, 'drag and rename have no browser errors', errors.join(' | '));
});

await run('C12-Performance', async () => {
  const notes = Array.from({ length: 1000 }, (_, i) => c12Note('load-' + i, 'Load ' + i, 'Performance/Batch', 'Research notes record the design review and the evidence behind our decisions. We compared several approaches and documented migration costs, accessibility requirements and follow-up experiments. The content lookup token is vault-token-' + i + '. These paragraphs represent an ordinary working note rather than an empty fixture.'));
  const { page, errors } = await fresh({ notes });
  let started = performance.now(); await c12Open(page); await c12Tree(page).getByRole('treeitem', { name: 'Load 0', exact: true }).waitFor();
  check('C12-Performance-open', performance.now() - started < 5000, 'open a 1,000-note vault in under 5,000ms', String(Math.round(performance.now() - started)) + 'ms');
  const tree = c12Tree(page); const batch = tree.getByRole('treeitem', { name: 'Batch, folder, 1000 notes', exact: true });
  await batch.focus(); await page.keyboard.press('ArrowLeft');
  started = performance.now(); await page.keyboard.press('ArrowRight'); await tree.getByRole('treeitem', { name: 'Load 0', exact: true }).waitFor();
  check('C12-Performance-expand', performance.now() - started < 2000 && await tree.getByRole('treeitem').count() < 80, 'expand all 1,000 notes in under 2,000ms with a bounded DOM', String(Math.round(performance.now() - started)) + 'ms');
  await page.keyboard.press('End'); await page.keyboard.press('Enter');
  check('C12-Performance-end', await page.getByRole('textbox', { name: 'Title', exact: true }).inputValue() === 'Load 999', 'End and Enter open a note beyond the first window');
  started = performance.now(); await page.getByRole('searchbox', { name: 'Search notes', exact: true }).fill('vault-token-123'); await tree.getByRole('treeitem', { name: 'Load 123', exact: true }).waitFor();
  check('C12-Performance-search', performance.now() - started < 1000 && await page.getByRole('status').filter({ hasText: /^1 note matches$/ }).count() === 1, 'filter 1,000 notes in under 1,000ms', String(Math.round(performance.now() - started)) + 'ms');
  check('C12-Performance-errors', errors.length === 0, 'large vault has no browser errors', errors.join(' | '));
});

await run('C12-MobileInstall320', async () => {
  const { page, errors } = await fresh({ mobile: true }); await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, { prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
    window.dispatchEvent(event);
  });
  const install = page.getByRole('button', { name: 'Install app', exact: true }); await install.waitFor();
  const geometry = await page.evaluate(() => {
    const install = document.querySelector('header [aria-label="Install app"]');
    const title = document.querySelector('[data-mobile-title]'); const bounds = install.getBoundingClientRect();
    const label = install.querySelector('[data-install-label]');
    const controls = [...install.closest('header').querySelectorAll('button')].map(button => button.getBoundingClientRect());
    return { titleWidth: title.getBoundingClientRect().width, installWidth: bounds.width, installHeight: bounds.height,
      labelHidden: getComputedStyle(label).display === 'none', fits: document.documentElement.scrollWidth <= 320,
      targetsFit: controls.every(rect => rect.x >= 0 && rect.right <= 320 && rect.height >= 44) };
  });
  check('C12-MobileInstall320-geometry', geometry.fits && geometry.targetsFit && geometry.titleWidth >= 64 && geometry.installWidth >= 44 && geometry.installHeight >= 44 && geometry.labelHidden, '320px install prompt keeps a readable title and 44px icon controls without horizontal overflow', JSON.stringify(geometry));
  check('C12-MobileInstall320-errors', errors.length === 0, 'install prompt has no browser errors', errors.join(' | '));
});

for (const width of [1440, 1280, 1100, 900, 390]) for (const theme of ['light', 'dark']) await run('C12-Responsive-' + width + '-' + theme, async () => {
  const { page, errors } = await fresh({ notes: responsiveNotesFixture(), mobile: width < 768 });
  await page.setViewportSize({ width, height: 900 });
  if (theme === 'dark') {
    await settingsOpen(page); await settingsBox(page).getByRole('button', { name: /Dark$/ }).click();
    await settingsClose(page); await themeSaved(page, 'dark');
  }
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name: 'Notes', exact: true }).click();
  await notesResponsiveScenario({ page, width, axe: fs.readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8'),
    verify: (name, ok, detail = '') => check('C12-Responsive-' + width + '-' + theme + '-' + name, ok, name, detail) });
  check('C12-Responsive-' + width + '-' + theme + '-errors', errors.length === 0, 'no browser errors', errors.join(' | '));
});

await knowledgeGraphQa({ run, fresh, check, settingsOpen, settingsBox, settingsClose, png });
await cycle11Qa({ run, fresh, check, settingsOpen, settingsBox, settingsClose, themeSaved });
await cycle10Qa({ run, fresh, check, TODAY, day, doc, task, readDocs });

console.log(`\n${results.filter((r) => !r.ok).length} failed / ${results.length} checks`);
fs.writeFileSync(path.join(os.tmpdir(), 'qa-results.json'), JSON.stringify(results, null, 2));
process.exitCode = results.some((r) => !r.ok) ? 1 : 0;
} finally {
  await browser?.close();
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  else server.kill();
}
