#!/usr/bin/env node
/**
 * End-to-end check of the Android-installable PWA against the PRODUCTION build,
 * emulating a Pixel-class phone in Chrome/Edge. Also captures release screenshots.
 *
 * Usage: npm run build && npm run test:e2e              (checks only)
 *        npm run build && node scripts/e2e-android-pwa.mjs <cycle-name>   (also writes screenshots)
 *
 * Verifies: first-run welcome, real date, quick capture, persistence across reload,
 * service worker control, offline reload, offline capture persisting, manifest/icons.
 * Exits non-zero on any failed check.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const noShots = process.argv.includes('--no-shots');
const cycle = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'cycle-1';
const PORT = 3101;
const base = `http://localhost:${PORT}`;
const outDir = path.resolve('docs', 'releases', cycle, 'images');
if (!noShots) fs.mkdirSync(outDir, { recursive: true });

let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
};

const server = spawn('npx', ['tsx', 'server.ts'], {
  // Fresh data dir + password: the production server refuses to start without an account
  env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT), DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-e2e-pwa-')), DAYMARK_PASSWORD: 'e2e-password-123' },
  shell: true,
  stdio: 'ignore',
});

async function waitForServer(ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('production server did not start');
}

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' }));
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    serviceWorkers: 'allow',
  });
  const page = await context.newPage();
  const shot = (name) => (noShots ? undefined : page.screenshot({ path: path.join(outDir, `${name}.png`) }));

  // Manifest and icons
  const manifest = await (await fetch(`${base}/manifest.json`)).json();
  const iconSizes = manifest.icons.map((i) => i.sizes);
  check(iconSizes.includes('192x192') && iconSizes.includes('512x512'), 'manifest has 192 and 512 icons');
  for (const icon of manifest.icons) {
    const res = await fetch(base + icon.src);
    check(res.ok && res.headers.get('content-type') === 'image/png', `icon served as PNG: ${icon.src}`);
  }

  // First run: welcome dialog on an empty profile
  await page.goto(base, { waitUntil: 'networkidle' });
  check(await page.getByRole('dialog', { name: /welcome to daymark/i }).isVisible(), 'first-run welcome is shown');
  await shot('android-1-welcome');
  await page.getByRole('button', { name: /start with an empty vault/i }).click();

  // Real date, not the old demo date
  const today = localToday();
  const bodyText = await page.locator('body').innerText();
  const longToday = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  check(bodyText.includes(today) || bodyText.includes(longToday), 'page shows the real local date', longToday);
  check(!bodyText.includes('2026-10-16') || today === '2026-10-16', 'demo date is not shown');

  // Quick capture and persistence
  await page.getByTitle('Quick Capture').click();
  await page.getByPlaceholder(/what did you work on/i).fill('Buy milk (e2e)');
  await page.getByRole('button', { name: /^capture$/i }).click();
  await page.getByText('Buy milk (e2e)').first().waitFor();
  check(true, 'task captured');
  await shot('android-2-today-with-task');

  await page.reload({ waitUntil: 'networkidle' });
  check(await page.getByText('Buy milk (e2e)').first().isVisible(), 'task survives reload (IndexedDB)');
  check(!(await page.getByRole('dialog', { name: /welcome/i }).isVisible().catch(() => false)), 'welcome not shown again');

  // Service worker controls the page
  await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 }).catch(() => {});
  let controlled = await page.evaluate(() => !!navigator.serviceWorker?.controller);
  if (!controlled) {
    await page.reload({ waitUntil: 'networkidle' });
    controlled = await page.evaluate(() => !!navigator.serviceWorker?.controller);
  }
  check(controlled, 'service worker controls the page');

  // Offline: reload works and capture still persists
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Buy milk (e2e)').first().waitFor({ timeout: 10000 }).catch(() => {});
  check(await page.getByText('Buy milk (e2e)').first().isVisible().catch(() => false), 'offline reload shows saved task');
  check(await page.getByRole('status').filter({ hasText: /offline/i }).isVisible().catch(() => false), 'offline banner is shown');
  await page.getByTitle('Quick Capture').click();
  await page.getByPlaceholder(/what did you work on/i).fill('Captured offline (e2e)');
  await page.getByRole('button', { name: /^capture$/i }).click();
  await page.getByText('Captured offline (e2e)').first().waitFor();
  await shot('android-3-offline-capture');
  await page.reload({ waitUntil: 'domcontentloaded' });
  check(await page.getByText('Captured offline (e2e)').first().isVisible().catch(() => false), 'offline capture survives offline reload');
  // Export works offline too (JSZip is a lazy chunk the service worker precaches)
  await page.getByRole('button', { name: /settings, backup and import/i }).click();
  const download = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
  await page.getByRole('button', { name: /download vault zip/i }).click();
  const file = await download;
  check(!!file && /.zip$/.test(file.suggestedFilename()), 'offline vault ZIP export works', file ? file.suggestedFilename() : 'no download');
  await page.getByRole('button', { name: /^done$/i }).click().catch(() => {});
  await context.setOffline(false);

  // Deep link from manifest shortcut
  await page.goto(`${base}/?action=capture`, { waitUntil: 'networkidle' });
  check(await page.getByPlaceholder(/what did you work on/i).isVisible().catch(() => false), 'shortcut ?action=capture opens quick capture');
} catch (err) {
  console.error('E2E aborted:', err);
  failures++;
} finally {
  await browser?.close();
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  else server.kill();
}

console.log(failures === 0 ? '\nAll e2e checks passed' : `\n${failures} e2e check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
