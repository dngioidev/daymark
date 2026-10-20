#!/usr/bin/env node
/**
 * End-to-end check of self-hosted sync between two devices (a laptop browser and an Android
 * phone browser) against the PRODUCTION build and a fresh server data directory.
 *
 * Usage: npm run build && node scripts/e2e-sync.mjs [cycle-name]   (cycle name -> screenshots)
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const cycle = process.argv[2];
const outDir = cycle ? path.resolve('docs', 'releases', cycle, 'images') : null;
if (outDir) fs.mkdirSync(outDir, { recursive: true });
const PORT = 3103;
const base = `http://localhost:${PORT}`;
const PASSWORD = 'e2e-password-123';
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-e2e-sync-'));

let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
};
const shot = (page, name) => (outDir ? page.screenshot({ path: path.join(outDir, `${name}.png`) }) : undefined);

function startServer() {
  return spawn('npx', ['tsx', 'server.ts', '--production'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DAYMARK_PASSWORD: PASSWORD },
    shell: true,
    stdio: 'ignore',
  });
}
async function waitForServer(ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('server did not start');
}
const killServer = (server) =>
  new Promise((resolve) => {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' }).on('exit', resolve);
    else {
      server.kill();
      resolve();
    }
  });

async function connect(page, deviceName) {
  await page.getByLabel('Server address').fill(base);
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Name for this device').fill(deviceName);
  await page.getByRole('button', { name: /connect and sync/i }).click();
  await page.getByText(/up to date/i).first().waitFor({ timeout: 20000 });
}

let server = startServer();
let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' }));
  const laptopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const phoneCtx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const laptop = await laptopCtx.newPage();
  const phone = await phoneCtx.newPage();

  // Laptop: start empty, capture a task, connect
  await laptop.goto(base, { waitUntil: 'networkidle' });
  await laptop.getByRole('button', { name: /start with an empty vault/i }).click();
  await laptop.getByRole('button', { name: /quick capture/i }).click();
  await laptop.getByPlaceholder(/what did you work on/i).fill('Written on the laptop');
  await laptop.getByRole('button', { name: /^capture$/i }).click();
  await laptop.getByRole('button', { name: /self-hosted server/i }).click();
  await connect(laptop, 'Laptop');
  check(true, 'laptop connected and synced');
  await shot(laptop, 'sync-1-laptop-connected');

  // Phone: start empty, connect from the Sync tab, receive the laptop's task
  await phone.goto(base, { waitUntil: 'networkidle' });
  await phone.getByRole('button', { name: /start with an empty vault/i }).click();
  await phone.getByRole('button', { name: /^sync$/i }).click();
  await shot(phone, 'sync-2-phone-connect-form');
  await connect(phone, 'Phone');
  await phone.getByRole('button', { name: /^today$/i }).last().click();
  await phone.getByText('Written on the laptop').first().waitFor({ timeout: 15000 });
  check(true, 'phone received the laptop task');

  // Phone: tick it off and add another; auto-sync pushes it within a few seconds
  await phone.getByTitle('Mark completed today').first().click();
  await phone.getByTitle('Quick Capture').click();
  await phone.getByPlaceholder(/what did you work on/i).fill('Written on the phone');
  await phone.getByRole('button', { name: /^capture$/i }).click();
  await phone.waitForTimeout(5000);
  await shot(phone, 'sync-3-phone-today');

  // Laptop: sync and check both changes arrived
  await laptop.getByRole('button', { name: /sync now/i }).click();
  await laptop.getByText(/up to date/i).first().waitFor({ timeout: 15000 });
  await laptop.getByRole('button', { name: /^today/i }).first().click();
  await laptop.getByText('Written on the phone').first().waitFor({ timeout: 15000 });
  check(true, 'laptop received the phone task');
  const doneOnLaptop = await laptop.getByTitle('Mark uncompleted').count();
  check(doneOnLaptop === 1, 'completion made on the phone shows on the laptop', `${doneOnLaptop} done`);
  await shot(laptop, 'sync-4-laptop-today');

  // Server dashboard lists both devices
  await laptop.getByRole('button', { name: /self-hosted server/i }).click();
  await laptop.getByText('Phone', { exact: true }).waitFor({ timeout: 10000 }).catch(() => {});
  check(await laptop.getByText('Phone', { exact: true }).isVisible().catch(() => false), 'server lists the phone as a connected device');
  await shot(laptop, 'sync-5-server-dashboard');

  // Server restart keeps everything; a new device gets the full vault
  await killServer(server);
  server = startServer();
  await waitForServer();
  const thirdCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const third = await thirdCtx.newPage();
  await third.goto(base, { waitUntil: 'networkidle' });
  await third.getByRole('button', { name: /start with an empty vault/i }).click();
  await third.getByRole('button', { name: /self-hosted server/i }).click();
  await connect(third, 'Desktop 2');
  await third.getByRole('button', { name: /^today/i }).first().click();
  const both = (await third.getByText('Written on the laptop').count()) > 0 && (await third.getByText('Written on the phone').count()) > 0;
  check(both, 'after a server restart a new device receives everything');

  // Unauthenticated API access is refused
  check((await fetch(`${base}/api/sync`)).status === 401, 'API refuses requests without a token');
} catch (err) {
  console.error('E2E aborted:', err);
  failures++;
} finally {
  await browser?.close();
  await killServer(server);
  fs.rmSync(dataDir, { recursive: true, force: true });
}

console.log(failures === 0 ? '\nAll sync e2e checks passed' : `\n${failures} sync e2e check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
