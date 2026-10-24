#!/usr/bin/env node
/**
 * Captures release-doc screenshots into docs/releases/<cycle>/images/.
 *
 * Usage: node scripts/capture-screenshots.mjs <cycle-name> [--url http://localhost:3100]
 * Example: node scripts/capture-screenshots.mjs cycle-0
 *
 * Starts a disposable production server on port 3100 unless --url is given. Uses the locally
 * installed Chrome/Edge (no browser download). Shots are defined in SHOTS below;
 * add per-cycle shots there as features land. For --url, set DAYMARK_PASSWORD;
 * screenshots use that server vault without seeding or resetting it.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright-core';
import { signIn, resetServerVault, seedSample, seedVault } from './helpers/server-session.mjs';
import { cycle7Fixture } from './helpers/cycle-7-fixture.mjs';

const args = process.argv.slice(2);
const cycle = args.find((a) => !a.startsWith('--'));
if (!cycle) {
  console.error('Usage: node scripts/capture-screenshots.mjs <cycle-name> [--url <url>]');
  process.exit(2);
}
const urlFlag = args.indexOf('--url');
const externalUrl = urlFlag >= 0 ? args[urlFlag + 1] : null;
const PORT = 3100;
const password = externalUrl ? process.env.DAYMARK_PASSWORD : 'screenshots-password-123';
if (!password) throw new Error('Set DAYMARK_PASSWORD to sign in to --url');
const baseUrl = externalUrl || `http://localhost:${PORT}`;
const outDir = path.resolve('docs', 'releases', cycle, 'images');
fs.mkdirSync(outDir, { recursive: true });

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  wide: { viewport: { width: 1920, height: 1080 } },
  android: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  laptop: { viewport: { width: 1024, height: 768 } },
};

// { name, viewport, signedOut?, prepare?(page) } - extend per cycle.
// Context setup seeds the sample vault before opening the server app.
const loadSample = async (page) => {
  await page.getByRole('heading', { name: 'Today', exact: true }).waitFor();
  await page.getByRole('button', { name: /sync: synced/i }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);
  // Dismiss any toast so it does not cover the shot
  await page.getByRole('button', { name: 'Dismiss' }).click().catch(() => {});
};
const then = (...steps) => async (page) => {
  await loadSample(page);
  for (const step of steps) {
    await step(page);
    await page.waitForTimeout(350);
  }
};
const click = (role, name) => (page) => page.getByRole(role, { name }).first().click();
const settings = (page) => page.getByRole('dialog', { name: 'Settings', exact: true });
const closeSettings = (page) => settings(page).getByRole('button', { name: 'Close', exact: true }).click();
const chooseTheme = async (page, dark) => {
  await click('button', /^settings$/i)(page);
  await settings(page).getByRole('button', { name: dark ? /Dark$/ : /Light$/ }).click();
  await page.waitForFunction((theme) => JSON.parse(localStorage.getItem('daymark_theme') || 'null')?.theme === theme
    && document.documentElement.classList.contains('dark') === (theme === 'dark'), dark ? 'dark' : 'light');
  await closeSettings(page);
};
const photoToday = async (page) => {
  await click('button', /^settings$/i)(page);
  // A reproducible local landscape-like gradient; no downloaded or private photo.
  const data = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1600; c.height = 1000;
    const ctx = c.getContext('2d'), gradient = ctx.createLinearGradient(0, 0, 1600, 1000);
    gradient.addColorStop(0, '#86a5bb'); gradient.addColorStop(0.5, '#c4c8ab'); gradient.addColorStop(1, '#365b49');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, c.width, c.height);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('Add background photo', { exact: true }).setInputFiles({ name: 'calm-background.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') });
  await page.getByRole('button', { name: 'Select photo 1', exact: true }).waitFor();
  await closeSettings(page);
  await page.waitForFunction(() => [...document.querySelectorAll('[style]')].some((el) => el.style.backgroundImage.includes('blob:')));
};
const phoneHeader = async (page) => {
  await click('button', /^settings$/i)(page);
  await page.getByRole('button', { name: 'Header colour #1e3a5f', exact: true }).click();
  await closeSettings(page);
};
const weekRowsShot = async (page, today) => {
  await loadSample(page);
  await click('button', /^calendar$/i)(page);
  // Calendar initially selects the most recent past document. Select Today
  // before switching to Week, especially on Sundays and month boundaries.
  const todayCell = page.locator(`button[data-date="${today}"]`);
  // The initially selected yesterday can be in the preceding month's grid.
  if (!await todayCell.count()) await page.getByRole('button', { name: 'Next month', exact: true }).click();
  await todayCell.click();
  await click('button', /^week$/i)(page);
  await page.locator('button[data-date][aria-pressed="true"]').scrollIntoViewIfNeeded();
};
const SHOTS = [
  { name: 'week-rows', viewport: 'desktop', cycles: ['cycle-7'], prepare: weekRowsShot },
  { name: 'week-rows-phone', viewport: 'phone', cycles: ['cycle-7'], prepare: weekRowsShot },
  { name: 'habits-closed', viewport: 'desktop', cycles: ['cycle-7'], prepare: loadSample },
  { name: 'habits-open', viewport: 'desktop', cycles: ['cycle-7'], prepare: then((page) => page.locator('section[aria-label="Daily habits"] button[aria-expanded]').click()) },
  { name: 'habit-editor', viewport: 'desktop', cycles: ['cycle-7'], prepare: then(
    (page) => page.locator('section[aria-label="Daily habits"] button[aria-expanded]').click(),
    (page) => page.getByRole('region', { name: 'Daily habits', exact: true }).getByRole('button', { name: 'Edit', exact: true }).click(),
  ) },
  { name: 'habit-warning', viewport: 'desktop', cycles: ['cycle-7'], prepare: then(async (page) => {
    await page.getByRole('region', { name: 'Daily habits', exact: true }).getByText(/1 missed 7 days/).waitFor();
  }) },
  { name: 'calendar-day-habits', viewport: 'desktop', cycles: ['cycle-7'], prepare: then(click('button', /^calendar$/i), async (page) => {
    // Pick the seeded yesterday document even if it falls in the previous month.
    const d = new Date(); d.setDate(d.getDate() - 1);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const cell = page.locator(`button[data-date="${date}"]`);
    if (!await cell.count()) await page.getByRole('button', { name: 'Previous month', exact: true }).click();
    await cell.click();
    await page.getByRole('checkbox', { name: 'Read a chapter', exact: true }).waitFor();
  }) },
  { name: 'appearance', viewport: 'desktop', cycles: ['cycle-6'], prepare: then(click('button', /^settings$/i)) },
  { name: 'photo-today-light', viewport: 'desktop', cycles: ['cycle-6'], prepare: then(photoToday) },
  { name: 'photo-today-dark', viewport: 'desktop', dark: true, cycles: ['cycle-6'], prepare: then(photoToday) },
  { name: 'today-1920', viewport: 'wide', cycles: ['cycle-6'], prepare: loadSample },
  { name: 'notes-focus', viewport: 'desktop', cycles: ['cycle-6'], prepare: then(click('button', /^notes$/i), click('button', /weekly sprint sync/i), click('button', /^focus mode$/i)) },
  { name: 'calendar-month', viewport: 'desktop', cycles: ['cycle-6'], prepare: then(click('button', /^calendar$/i)) },
  { name: 'calendar-week', viewport: 'desktop', cycles: ['cycle-6'], prepare: then(click('button', /^calendar$/i), click('button', /^week$/i)) },
  { name: 'search', viewport: 'desktop', cycles: ['cycle-6'], prepare: then(async (page) => {
    await page.keyboard.press('Control+Shift+f');
    await page.getByRole('combobox', { name: 'Search tasks and notes' }).fill('pipeline');
    await page.getByRole('option').first().waitFor();
  }) },
  { name: 'settings-fixed-size', viewport: 'desktop', cycles: ['cycle-6'], prepare: then(click('button', /^settings$/i), click('tab', /^sections$/i)) },
  { name: 'phone-header-colour', viewport: 'android', cycles: ['cycle-6'], prepare: then(phoneHeader) },
  { name: 'phone-header-colour-dark', viewport: 'android', dark: true, cycles: ['cycle-6'], prepare: then(phoneHeader) },
  { name: 'desktop-today', viewport: 'desktop', prepare: loadSample },
  { name: 'android-today', viewport: 'android', prepare: loadSample },
  // Server sign-in: a phone viewport still runs the server web app, not native Android.
  { name: 'sign-in', viewport: 'desktop', signedOut: true, cycles: ['server-sign-in'], prepare: async (page) => {
    await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
  } },
  { name: 'sync-account', viewport: 'android', cycles: ['server-sign-in'], prepare: then(
    click('button', /open sync settings/i),
    (page) => page.getByRole('button', { name: 'Sign out', exact: true }).waitFor(),
  ) },
  { name: 'sign-out-warning', viewport: 'android', cycles: ['server-sign-in'], prepare: then(async (page) => {
    await page.route('**/api/**', (route) => route.abort());
    await page.getByRole('button', { name: 'New task', exact: true }).click();
    await page.getByRole('textbox', { name: 'Task', exact: true }).fill('Save this change when the server is back');
    await page.getByRole('button', { name: 'Add task', exact: true }).click();
    await page.getByRole('button', { name: /open sync settings/i }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('alertdialog', { name: 'Sign out?', exact: true }).waitFor();
    await page.getByText(/The server could not be reached\./).waitFor();
  }) },
  // Cycle 5: UX redesign
  { name: 'phone-today', viewport: 'android', cycles: ['cycle-5'], prepare: loadSample },
  { name: 'phone-today-dark', viewport: 'android', dark: true, cycles: ['cycle-5'], prepare: loadSample },
  { name: 'phone-task-menu', viewport: 'android', cycles: ['cycle-5'], prepare: then(click('button', /more actions for/i)) },
  { name: 'phone-status-menu', viewport: 'android', cycles: ['cycle-5'], prepare: then(click('button', /^status:/i)) },
  { name: 'phone-task-details', viewport: 'android', cycles: ['cycle-5'], prepare: then((p) => p.getByRole('button', { name: 'Investigate build pipeline failure', exact: true }).click()) },
  { name: 'phone-mark-done', viewport: 'android', cycles: ['cycle-5'], prepare: then(click('button', /more actions for/i), click('menuitem', /another day/i)) },
  { name: 'phone-new-task', viewport: 'android', cycles: ['cycle-5'], prepare: then(click('button', /^new task$/i)) },
  { name: 'phone-inline-add', viewport: 'android', cycles: ['cycle-5'], prepare: then(click('button', /^task$/i)) },
  { name: 'phone-markdown', viewport: 'android', cycles: ['cycle-5'], prepare: then(click('button', /more options for this day/i), click('menuitem', /edit as markdown/i)) },
  { name: 'phone-calendar', viewport: 'android', cycles: ['cycle-5'], prepare: then(click('button', /^calendar$/i)) },
  { name: 'phone-notes', viewport: 'android', cycles: ['cycle-5'], prepare: then(click('button', /^notes$/i)) },
  { name: 'phone-note', viewport: 'android', cycles: ['cycle-5'], prepare: then(click('button', /^notes$/i), click('button', /weekly sprint sync/i)) },
  { name: 'phone-settings', viewport: 'android', cycles: ['cycle-5'], prepare: then(click('button', /^settings$/i)) },
  { name: 'phone-settings-statuses', viewport: 'android', cycles: ['cycle-5'], prepare: then(click('button', /^settings$/i), click('tab', /statuses/i)) },
  { name: 'phone-sync', viewport: 'android', cycles: ['cycle-5'], prepare: then(click('button', /open sync settings/i)) },
  { name: 'desktop-today-light', viewport: 'desktop', cycles: ['cycle-5'], prepare: loadSample },
  { name: 'desktop-today-dark', viewport: 'desktop', dark: true, cycles: ['cycle-5'], prepare: loadSample },
  { name: 'desktop-split', viewport: 'desktop', cycles: ['cycle-5'], prepare: then(click('button', /^split$/i)) },
  { name: 'desktop-calendar', viewport: 'desktop', cycles: ['cycle-5'], prepare: then(click('button', /^calendar$/i)) },
  { name: 'desktop-notes', viewport: 'desktop', cycles: ['cycle-5'], prepare: then(click('button', /^notes$/i)) },
  { name: 'desktop-settings', viewport: 'desktop', cycles: ['cycle-5'], prepare: then(click('button', /^settings$/i)) },
  { name: 'desktop-new-task', viewport: 'desktop', cycles: ['cycle-5'], prepare: then((p) => p.keyboard.press('Control+k')) },
  { name: 'desktop-1024', viewport: 'laptop', cycles: ['cycle-5'], prepare: loadSample },
];

async function waitForServer(url, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url + '/api/health')).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not start at ${url}`);
}

let server;
if (!externalUrl) {
  server = spawn('npx', ['tsx', 'server.ts', '--production'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-shots-')), DAYMARK_PASSWORD: password },
    shell: true,
    stdio: 'ignore',
  });
}

let browser;
try {
  await waitForServer(baseUrl);
  browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' }));
  // Shots without `cycles` are the generic pair; tagged shots run only for their cycle
  for (const shot of SHOTS.filter((s) => (s.cycles ? s.cycles.includes(cycle) : !SHOTS.some((t) => t.cycles?.includes(cycle))))) {
    const ctx = await browser.newContext({ ...VIEWPORTS[shot.viewport], colorScheme: shot.dark ? 'dark' : 'light' });
    if (!shot.signedOut) {
      const session = await signIn(ctx, baseUrl, password);
      if (!externalUrl) await resetServerVault(ctx, baseUrl, session.accessToken);
    }
    const page = await ctx.newPage();
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!externalUrl && !shot.signedOut) {
      if (cycle === 'cycle-7') {
        await seedVault(page, baseUrl, cycle7Fixture(today));
      } else await seedSample(page, baseUrl);
    }
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    if (!shot.signedOut) await chooseTheme(page, !!shot.dark);
    if (shot.prepare) await shot.prepare(page, today);
    const file = path.join(outDir, `${shot.name}.png`);
    await page.screenshot({ path: file });
    console.log('captured', path.relative('.', file));
    await ctx.close();
  }
} finally {
  await browser?.close();
  if (server) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    else server.kill();
  }
}
