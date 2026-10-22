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
import { signIn, resetServerVault, seedSample } from './helpers/server-session.mjs';

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
  android: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
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
const SHOTS = [
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
  { name: 'phone-history', viewport: 'android', cycles: ['cycle-5'], prepare: then(click('button', /^history$/i)) },
  { name: 'phone-notes', viewport: 'android', cycles: ['cycle-5'], prepare: then(click('button', /^notes$/i)) },
  { name: 'phone-note', viewport: 'android', cycles: ['cycle-5'], prepare: then(click('button', /^notes$/i), click('button', /weekly sprint sync/i)) },
  { name: 'phone-settings', viewport: 'android', cycles: ['cycle-5'], prepare: then(click('button', /^settings$/i)) },
  { name: 'phone-settings-statuses', viewport: 'android', cycles: ['cycle-5'], prepare: then(click('button', /^settings$/i), click('tab', /statuses/i)) },
  { name: 'phone-sync', viewport: 'android', cycles: ['cycle-5'], prepare: then(click('button', /open sync settings/i)) },
  { name: 'desktop-today-light', viewport: 'desktop', cycles: ['cycle-5'], prepare: loadSample },
  { name: 'desktop-today-dark', viewport: 'desktop', dark: true, cycles: ['cycle-5'], prepare: loadSample },
  { name: 'desktop-split', viewport: 'desktop', cycles: ['cycle-5'], prepare: then(click('button', /^split$/i)) },
  { name: 'desktop-history', viewport: 'desktop', cycles: ['cycle-5'], prepare: then(click('button', /^history$/i)) },
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
    if (!externalUrl && !shot.signedOut) await seedSample(page, baseUrl);
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    if (shot.prepare) await shot.prepare(page);
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
