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
import { spawn } from 'node:child_process';
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
};

// { name, viewport, prepare?(page) } - extend per cycle.
// A fresh browser profile shows the welcome dialog; load the sample vault so shots show real content.
const loadSample = async (page) => {
  await page.getByRole('button', { name: /explore with sample data/i }).click();
  await page.waitForTimeout(500);
};
const SHOTS = [
  { name: 'desktop-today', viewport: 'desktop', prepare: loadSample },
  { name: 'android-today', viewport: 'android', prepare: loadSample },
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
  for (const shot of SHOTS) {
    const ctx = await browser.newContext({ ...VIEWPORTS[shot.viewport], colorScheme: 'light' });
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
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    else server.kill();
  }
}
