#!/usr/bin/env node
/**
 * Captures release-doc screenshots into docs/releases/<cycle>/images/.
 *
 * Usage: node scripts/capture-screenshots.mjs <cycle-name> [--url http://localhost:3100]
 * Example: node scripts/capture-screenshots.mjs cycle-0
 *
 * Starts `npm run dev` on port 3100 unless --url is given. Uses the locally
 * installed Chrome/Edge (no browser download). Shots are defined in SHOTS below;
 * add per-cycle shots there as features land.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const cycle = args.find((a) => !a.startsWith('--'));
if (!cycle) {
  console.error('Usage: node scripts/capture-screenshots.mjs <cycle-name> [--url <url>]');
  process.exit(2);
}
const urlFlag = args.indexOf('--url');
const externalUrl = urlFlag >= 0 ? args[urlFlag + 1] : null;
const PORT = 3100;
const baseUrl = externalUrl || `http://localhost:${PORT}`;
const outDir = path.resolve('docs', 'releases', cycle, 'images');
fs.mkdirSync(outDir, { recursive: true });

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  android: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  laptop: { viewport: { width: 1024, height: 768 } },
};

// { name, viewport, prepare?(page) } - extend per cycle.
// A fresh browser profile shows the welcome dialog; load the sample vault so shots show real content.
const loadSample = async (page) => {
  await page.getByRole('button', { name: /sample data/i }).click();
  await page.waitForTimeout(500);
  // Let the "sample loaded" toast go so it doesn't cover the shot
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
  server = spawn('npm', ['run', 'dev'], {
    env: { ...process.env, PORT: String(PORT), DISABLE_HMR: 'true' },
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
    const page = await ctx.newPage();
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
