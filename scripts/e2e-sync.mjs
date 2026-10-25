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
import { signIn } from './helpers/server-session.mjs';

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

const synced = (page) => page.getByRole('button', { name: /sync: synced/i }).waitFor({ timeout: 20000 });

let server = startServer();
let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' }));
  const laptopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const phoneCtx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await signIn(laptopCtx, base, PASSWORD);
  await signIn(phoneCtx, base, PASSWORD);
  const laptop = await laptopCtx.newPage();
  const phone = await phoneCtx.newPage();

  // Laptop: sign in, capture a task, sync
  await laptop.goto(base, { waitUntil: 'networkidle' });
  await synced(laptop);
  await laptop.getByRole('button', { name: /^new task/i }).click();
  await laptop.getByPlaceholder(/what do you need to do/i).fill('Written on the laptop');
  await laptop.getByRole('button', { name: /^add task$/i }).click();
  await laptop.getByRole('button', { name: /open sync settings/i }).click();
  await laptop.getByRole('button', { name: /sync now/i }).click();
  await laptop.getByText(/up to date/i).first().waitFor({ timeout: 20000 });
  check(true, 'laptop connected and synced');
  await shot(laptop, 'sync-1-laptop-connected');

  // Phone: sign in and automatically receive the laptop's task
  await phone.goto(base, { waitUntil: 'networkidle' });
  await synced(phone);
  await phone.getByRole('button', { name: /open sync settings/i }).click();
  await shot(phone, 'sync-2-phone-account');
  await phone.getByText(/up to date/i).first().waitFor({ timeout: 20000 });
  await phone.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
  await phone.getByText('Written on the laptop').first().waitFor({ timeout: 15000 });
  check(true, 'phone received the laptop task');

  // Phone: tick it off and add another; auto-sync pushes it within a few seconds
  await phone.getByRole('button', { name: /^mark ".*" done$/i }).first().click();
  await phone.getByRole('button', { name: /^new task$/i }).click();
  await phone.getByPlaceholder(/what do you need to do/i).fill('Written on the phone');
  await phone.getByRole('button', { name: /^add task$/i }).click();
  await phone.waitForTimeout(5000);
  await shot(phone, 'sync-3-phone-today');

  // Laptop: sync and check both changes arrived
  await laptop.getByRole('button', { name: /sync now/i }).click();
  await laptop.getByText(/up to date/i).first().waitFor({ timeout: 15000 });
  await laptop.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
  await laptop.getByText('Written on the phone').first().waitFor({ timeout: 15000 });
  check(true, 'laptop received the phone task');
  // Finished tasks are grouped under a collapsed "Done (n)" row
  const doneOnLaptop = await laptop.getByRole('button', { name: /^done \(1\)$/i }).count();
  check(doneOnLaptop === 1, 'completion made on the phone shows on the laptop', `${doneOnLaptop} done group`);
  await shot(laptop, 'sync-4-laptop-today');

  // Cycle 6: move and appearance must survive a real two-device settings/doc sync.
  const syncNow = async (page) => {
    await page.getByRole('button', { name: /open sync settings/i }).click();
    const response = page.waitForResponse((r) => r.url().endsWith('/api/sync') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Sync now', exact: true }).click();
    if (!(await response).ok()) throw new Error('cycle-6 manual sync failed');
    await page.getByText(/up to date/i).first().waitFor();
    await page.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
  };
  await laptop.getByRole('button', { name: 'More actions for "Written on the phone"' }).click();
  await laptop.getByRole('menuitem', { name: 'Move to tomorrow', exact: true }).click();
  await laptop.getByRole('button', { name: 'Settings', exact: true }).first().click();
  await laptop.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('button', { name: /Dark$/ }).click();
  await laptop.waitForFunction(() => JSON.parse(localStorage.getItem('daymark_theme') || 'null')?.theme === 'dark');
  await laptop.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
  await syncNow(laptop);
  await syncNow(phone);
  await phone.waitForFunction(() => document.documentElement.classList.contains('dark')
    && JSON.parse(localStorage.getItem('daymark_theme') || 'null')?.theme === 'dark');
  const moved = await phone.waitForFunction(async () => {
    const db = await new Promise((resolve) => { const r = indexedDB.open('daymark', 1); r.onsuccess = () => resolve(r.result); });
    try {
      const get = (key) => new Promise((resolve) => { const r = db.transaction('kv').objectStore('kv').get(key); r.onsuccess = () => resolve(r.result); });
      const docs = await get('daily_docs'), settings = await get('settings');
      const copies = docs.flatMap((d) => d.headings.flatMap((h) => h.items.filter((t) => t.title === 'Written on the phone').map((t) => ({ date: d.date, id: t.id }))));
      const date = new Date(); const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      date.setDate(date.getDate() + 1);
      const tomorrow = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return settings?.appearance?.theme === 'dark' && copies.length === 1 && copies[0].date === tomorrow
        && docs.find((d) => d.date === today)?.removedTaskIds?.includes(copies[0].id);
    } finally { db.close(); }
  });
  check(await moved.jsonValue(), 'phone receives Dark appearance and exactly one moved task on tomorrow with source removal preserved');

  // Cycle 7: independent same-day offline ticks must merge, not replace the day.
  const bar = (page) => page.getByRole('region', { name: 'Daily habits', exact: true });
  const expandHabits = async (page) => {
    const toggle = bar(page).locator('button[aria-expanded]');
    if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  };
  await expandHabits(laptop); // The empty state opens the editor.
  const editor = laptop.getByRole('dialog', { name: 'Daily habits', exact: true });
  for (const name of ['Habit X', 'Habit Y']) {
    await editor.getByPlaceholder('Habit name', { exact: true }).fill(name);
    await editor.getByRole('button', { name: 'Add', exact: true }).click();
    await editor.getByLabel(`Name for ${name}`, { exact: true }).waitFor();
  }
  await editor.getByRole('button', { name: 'Done', exact: true }).click();
  await syncNow(laptop);
  await syncNow(phone);
  await bar(phone).locator('button[aria-expanded]').filter({ hasText: '0 of 2' }).waitFor();
  await expandHabits(phone);
  await bar(phone).getByRole('checkbox', { name: 'Habit Y', exact: true }).waitFor();
  await laptopCtx.setOffline(true);
  await phoneCtx.setOffline(true);
  await bar(laptop).getByRole('checkbox', { name: 'Habit X', exact: true }).check();
  await bar(phone).getByRole('checkbox', { name: 'Habit Y', exact: true }).check();
  // Freeze the pre-sync divergence and wait for each tick to reach local storage.
  for (const [page, name, other] of [[laptop, 'Habit X', 'Habit Y'], [phone, 'Habit Y', 'Habit X']]) {
    await page.waitForFunction(async (name) => {
      const db = await new Promise((resolve) => { const r = indexedDB.open('daymark', 1); r.onsuccess = () => resolve(r.result); });
      try {
        const data = await new Promise((resolve) => { const r = db.transaction('kv').objectStore('kv').get('habits'); r.onsuccess = () => resolve(r.result); });
        const habit = data?.habits.find((h) => h.name === name);
        return habit && data.days.find((d) => d.date === habit.addedOn)?.ticks[habit.id]?.done === true;
      } finally { db.close(); }
    }, name);
    check(!await bar(page).getByRole('checkbox', { name: other, exact: true }).isChecked(), `${name} device has only its own tick before reconnect`);
  }
  await laptopCtx.setOffline(false);
  await syncNow(laptop);
  await phoneCtx.setOffline(false);
  await syncNow(phone);
  await syncNow(laptop);
  for (const [page, label] of [[laptop, 'laptop'], [phone, 'phone']]) {
    await page.waitForFunction(() => ['Habit X', 'Habit Y'].every((name) =>
      document.querySelector(`section[aria-label="Daily habits"] input[aria-label="${name}"]`)?.checked));
    check(await bar(page).getByRole('checkbox', { name: 'Habit X', exact: true }).isChecked()
      && await bar(page).getByRole('checkbox', { name: 'Habit Y', exact: true }).isChecked()
      && (await bar(page).locator('button[aria-expanded]').innerText()).includes('2 of 2'), `${label} merges both same-day habit ticks`);
  }

  // Cycle 9: a pasted picture must travel as both note Markdown and binary asset.
  await laptop.getByRole('button', { name: 'Notes', exact: true }).first().click();
  await laptop.getByRole('button', { name: 'New note', exact: true }).first().click();
  await laptop.getByLabel('Title', { exact: true }).fill('Synced field photo');
  const richNote = laptop.getByRole('textbox', { name: 'Note rich text', exact: true });
  await richNote.click();
  await richNote.evaluate((element) => {
    const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 64;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#386850'; ctx.fillRect(0, 0, 96, 64);
    const bytes = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), (c) => c.charCodeAt(0));
    const clipboardData = new DataTransfer();
    clipboardData.items.add(new File([bytes], 'synced-field-photo.png', { type: 'image/png' }));
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  });
  const decodedPicture = (page) => page.waitForFunction(() => {
    const img = document.querySelector('.ProseMirror img[src]:not(.ProseMirror-separator)');
    return img?.complete && img.naturalWidth > 0;
  }, undefined, { timeout: 20000 });
  await decodedPicture(laptop);
  await laptop.getByRole('button', { name: 'Markdown', exact: true }).click();
  const pictureMarkdown = await laptop.getByLabel('Note text (Markdown)', { exact: true }).inputValue();
  check(/daymark-asset:[a-f0-9]{64}\.(webp|jpeg)/.test(pictureMarkdown), 'laptop picture is stored as a portable asset reference');
  await syncNow(laptop);
  await syncNow(phone);
  await phone.getByRole('button', { name: 'Notes', exact: true }).first().click();
  await phone.getByRole('button').filter({ has: phone.getByText('Synced field photo', { exact: true }) }).click();
  await decodedPicture(phone);
  check(await phone.locator('.ProseMirror img[src]:not(.ProseMirror-separator)').isVisible(), 'phone decodes the picture pasted on the laptop after both devices sync');
  await phone.getByRole('button', { name: 'Markdown', exact: true }).click();
  check(await phone.getByLabel('Note text (Markdown)', { exact: true }).inputValue() === pictureMarkdown, 'both devices keep the same picture Markdown');
  // Restore Today for the dashboard/restart checks below.
  for (const page of [laptop, phone]) await page.getByRole('button', { name: 'Today', exact: true }).first().click();

  // Server dashboard lists both devices
  await laptop.getByRole('button', { name: /open sync settings/i }).click();
  const deviceRows = laptop.getByRole('dialog', { name: 'Settings' }).locator('ul.divide-y > li').filter({ hasText: 'e2e' });
  await deviceRows.nth(1).waitFor({ timeout: 10000 });
  check(await deviceRows.count() === 2, 'server lists both signed-in browser devices');
  await shot(laptop, 'sync-5-server-dashboard');

  // Server restart keeps everything; a new device gets the full vault
  await killServer(server);
  server = startServer();
  await waitForServer();
  const thirdCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const third = await thirdCtx.newPage();
  await signIn(thirdCtx, base, PASSWORD);
  await third.goto(base, { waitUntil: 'networkidle' });
  await synced(third);
  await third.getByRole('button', { name: /open sync settings/i }).click();
  await third.getByText(/up to date/i).first().waitFor({ timeout: 20000 });
  await third.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
  await third.getByRole('button', { name: /^done \(1\)$/i }).click().catch(() => {});
  const completed = (await third.getByText('Written on the laptop').count()) > 0;
  await third.getByRole('button', { name: /next day/i }).click();
  await third.getByRole('button', { name: 'Mark "Written on the phone" done' }).waitFor();
  const both = completed && await third.locator('html').evaluate((el) => el.classList.contains('dark'));
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
