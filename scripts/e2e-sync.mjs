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
import { tsImport } from 'tsx/esm/api';
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
  return spawn(process.execPath, ['--import', 'tsx', 'server.ts', '--production'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, DAYMARK_PASSWORD: PASSWORD },
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
  new Promise((resolve, reject) => {
    if (server.exitCode !== null || server.signalCode !== null) return resolve();
    let forceTimeout;
    const finished = () => {
      clearTimeout(timeout);
      clearTimeout(forceTimeout);
      resolve();
    };
    const timeout = setTimeout(() => {
      server.kill('SIGKILL');
      forceTimeout = setTimeout(() => {
        server.removeListener('exit', finished);
        reject(new Error('Sync e2e server did not exit after SIGKILL'));
      }, 5000);
    }, 5000);
    server.once('exit', finished);
    server.kill();
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

  // Cycle 10: exercise real backlog operations through each browser's persisted vault.
  // Backlog controls arrive in later tasks; use the shared domain operations here.
  const { addBacklogItem, moveTaskToBacklog, pickBacklogItem, visibleBacklog } = await tsImport('../src/utils/backlog.ts', import.meta.url);
  const readVault = page => page.evaluate(async () => {
    const db = await new Promise(resolve => { const r = indexedDB.open('daymark', 1); r.onsuccess = () => resolve(r.result); });
    try {
      const get = key => new Promise(resolve => { const r = db.transaction('kv').objectStore('kv').get(key); r.onsuccess = () => resolve(r.result); });
      return { docs: await get('daily_docs'), backlog: await get('backlog') ?? { items: [] } };
    } finally { db.close(); }
  });
  const writeVault = async (page, docs, backlog) => {
    await page.evaluate(async ({ docs, backlog }) => {
      const db = await new Promise(resolve => { const r = indexedDB.open('daymark', 1); r.onsuccess = () => resolve(r.result); });
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put(docs, 'daily_docs'); tx.objectStore('kv').put(backlog, 'backlog');
          tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
        });
      } finally { db.close(); }
    }, { docs, backlog });
    await page.reload({ waitUntil: 'networkidle' });
  };
  await laptop.getByRole('button', { name: /^new task/i }).click();
  await laptop.getByPlaceholder(/what do you need to do/i).fill('Move Today to backlog');
  await laptop.getByRole('button', { name: /^add task$/i }).click();
  // Finish pending UI persistence before editing the vault fixture.
  await syncNow(laptop);
  await laptop.route('**/api/sync', route => route.abort());
  const beforeBacklog = await readVault(laptop);
  const source = beforeBacklog.docs.find(d => d.headings.some(h => h.items.some(t => t.title === 'Move Today to backlog')));
  const movedId = source.headings.flatMap(h => h.items).find(t => t.title === 'Move Today to backlog').id;
  const captured = addBacklogItem(beforeBacklog.backlog, { title: 'Home idea', category: 'Home' }, '2026-10-26T10:00:00Z', 'e2e-backlog-home');
  const parked = moveTaskToBacklog(beforeBacklog.docs, captured, movedId, source.date, '2026-10-26T10:01:00Z');
  if (!parked) throw new Error('could not move Today task to backlog');
  await writeVault(laptop, parked.docs, parked.data);
  await laptop.unroute('**/api/sync');
  await syncNow(laptop); await syncNow(phone);
  const receivedBacklog = await readVault(phone);
  check(visibleBacklog(receivedBacklog.backlog).length === 2
    && receivedBacklog.backlog.items.some(i => i.id === 'e2e-backlog-home' && i.category === 'Home')
    && receivedBacklog.backlog.items.some(i => i.id === movedId)
    && !receivedBacklog.docs.flatMap(d => d.headings.flatMap(h => h.items)).some(t => t.id === movedId),
    'phone receives the Home idea and the task moved out of Today');
  // Block sync on both devices so both picks start from the same agreed snapshot.
  for (const page of [laptop, phone]) await page.route('**/api/sync', route => route.abort());
  const pickDates = await laptop.evaluate(() => [2, 3].map(offset => {
    const date = new Date(); date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }));
  const pickedAt = Date.now();
  for (const [page, date, at] of [[laptop, pickDates[0], new Date(pickedAt).toISOString()], [phone, pickDates[1], new Date(pickedAt + 1000).toISOString()]]) {
    const local = await readVault(page);
    const picked = pickBacklogItem(local.docs, local.backlog, 'e2e-backlog-home', date, ['Work'], at);
    if (!picked) throw new Error('concurrent pick fixture did not start from a visible item');
    await writeVault(page, picked.docs, picked.data);
    const persisted = await readVault(page);
    check(persisted.backlog.items.find(i => i.id === 'e2e-backlog-home')?.pickedOn === date,
      `device independently picked the same item into ${date}`);
  }
  await laptop.unroute('**/api/sync'); await syncNow(laptop);
  await phone.unroute('**/api/sync'); await syncNow(phone);
  await syncNow(laptop); await syncNow(phone);
  for (const [page, label] of [[laptop, 'laptop'], [phone, 'phone']]) {
    const local = await readVault(page);
    const copies = local.docs.flatMap(d => d.headings.flatMap(h => h.items.filter(t => t.id === 'e2e-backlog-home').map(t => ({ date: d.date, id: t.id }))));
    check(copies.length === 2 && pickDates.every(date => copies.filter(copy => copy.date === date).length === 1)
      && !local.docs.some(d => d.removedTaskIds?.includes('e2e-backlog-home'))
      && !visibleBacklog(local.backlog).some(i => i.id === 'e2e-backlog-home'),
      `${label} keeps one task per picked day without deletions and hides the backlog item`);
  }

  // Cycle 11: use shared domain edits until the folder controls arrive in later tasks.
  const { buildFolderTree, createFolder, renameFolder } = await tsImport('../src/utils/noteFolders.ts', import.meta.url);
  const readNotes = page => page.evaluate(async () => {
    const db = await new Promise(resolve => { const r = indexedDB.open('daymark', 1); r.onsuccess = () => resolve(r.result); });
    try {
      const get = key => new Promise(resolve => { const r = db.transaction('kv').objectStore('kv').get(key); r.onsuccess = () => resolve(r.result); });
      return { notes: await get('notes') ?? [], meta: await get('notemeta') ?? { folders: [], dismissed: [] } };
    } finally { db.close(); }
  });
  const writeNotes = async (page, notes, meta) => {
    await page.evaluate(async ({ notes, meta }) => {
      const db = await new Promise(resolve => { const r = indexedDB.open('daymark', 1); r.onsuccess = () => resolve(r.result); });
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put(notes, 'notes'); tx.objectStore('kv').put(meta, 'notemeta');
          tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
        });
      } finally { db.close(); }
    }, { notes, meta });
    await page.reload({ waitUntil: 'networkidle' });
  };
  await laptop.route('**/api/sync', route => route.abort());
  const initialNotes = await readNotes(laptop);
  const folderAt = new Date().toISOString();
  const folderMeta = createFolder(createFolder(initialNotes.meta, 'Tech/Java', folderAt), 'Empty', folderAt);
  const folderNotes = [...initialNotes.notes, ...['e2e-folder-a', 'e2e-folder-b'].map(id => ({
    id, title: id, folder: 'Tech/Java', tags: [], content: 'Keep this note', createdAt: folderAt, updatedAt: folderAt,
  }))];
  folderMeta.dismissed = [...folderMeta.dismissed, { key: 'e2e-folder-a|e2e-folder-b', at: folderAt }];
  await writeNotes(laptop, folderNotes, folderMeta);
  await laptop.unroute('**/api/sync'); await syncNow(laptop); await syncNow(phone);
  const receivedMeta = await readNotes(phone);
  check(['Tech/Java', 'Empty'].every(path => receivedMeta.meta.folders.some(f => f.path === path && !f.removed))
    && receivedMeta.meta.dismissed.some(p => p.key === 'e2e-folder-a|e2e-folder-b' && !p.restored),
    'phone receives nested and empty folders and the dismissed suggestion pair');
  const idsBeforeRename = folderNotes.map(n => n.id).sort();
  for (const page of [laptop, phone]) await page.route('**/api/sync', route => route.abort());
  const renameAt = Date.now();
  for (const [page, destination, offset] of [[laptop, 'Tech/Kotlin', 0], [phone, 'Tech/JVM', 1000]]) {
    const local = await readNotes(page);
    const renamed = renameFolder(local.notes, local.meta, 'Tech/Java', destination, new Date(renameAt + offset).toISOString());
    if (!renamed) throw new Error('folder rename fixture failed');
    await writeNotes(page, renamed.notes, renamed.meta);
  }
  await laptop.unroute('**/api/sync'); await syncNow(laptop);
  await phone.unroute('**/api/sync'); await syncNow(phone);
  await syncNow(laptop); await syncNow(phone);
  const afterA = await readNotes(laptop), afterB = await readNotes(phone);
  const stable = value => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
  const sortedNotes = local => [...local.notes].sort((a, b) => a.id.localeCompare(b.id));
  check(stable(afterA.meta) === stable(afterB.meta) && stable(sortedNotes(afterA)) === stable(sortedNotes(afterB)),
    'concurrent folder renames converge on identical metadata and notes');
  for (const [local, label] of [[afterA, 'laptop'], [afterB, 'phone']]) {
    const treePaths = nodes => nodes.flatMap(node => [node.path, ...treePaths(node.children)]);
    check(!local.meta.folders.some(f => f.path.toLowerCase() === 'tech/java' && !f.removed)
      && !treePaths(buildFolderTree(local.notes, local.meta)).some(path => path.toLowerCase() === 'tech/java'),
      label + ' omits the old Tech/Java folder from the live list and tree, including empty folders');
    check(local.notes.filter(n => n.id.startsWith('e2e-folder-')).length === 2
      && local.notes.filter(n => n.id.startsWith('e2e-folder-')).every(n => n.folder === 'Tech/JVM'),
      label + ' keeps both renamed notes in the incoming destination Tech/JVM');
    check(idsBeforeRename.every(id => local.notes.some(n => n.id === id))
      && local.notes.filter(n => n.id.startsWith('e2e-folder-')).every(n => n.content === 'Keep this note'),
      label + ' retains every original note and its content after concurrent folder renames');
  }

  // A folder rename and an offline content edit merge field by field.
  for (const page of [laptop, phone]) await page.route('**/api/sync', route => route.abort());
  const beforeOfflineEdit = await readNotes(phone);
  const beforeFolderRename = await readNotes(laptop);
  const raceAt = Date.now() + 2000;
  const renamedForEdit = renameFolder(beforeFolderRename.notes, beforeFolderRename.meta, 'Tech', 'Code', new Date(raceAt).toISOString());
  if (!renamedForEdit) throw new Error('rename versus edit fixture failed');
  await writeNotes(laptop, renamedForEdit.notes, renamedForEdit.meta);
  await writeNotes(phone, beforeOfflineEdit.notes.map(note => note.id === 'e2e-folder-a'
    ? { ...note, content: 'Offline Streams edit', updatedAt: new Date(raceAt + 1000).toISOString() } : note), beforeOfflineEdit.meta);
  await laptop.unroute('**/api/sync'); await syncNow(laptop);
  await phone.unroute('**/api/sync'); await syncNow(phone);
  await syncNow(laptop); await syncNow(phone);
  for (const [page, label] of [[laptop, 'laptop'], [phone, 'phone']]) {
    const local = await readNotes(page);
    const edited = local.notes.filter(note => note.id === 'e2e-folder-a');
    check(edited.length === 1 && edited[0].content === 'Offline Streams edit' && edited[0].folder === 'Code/JVM'
      && local.notes.length === beforeOfflineEdit.notes.length
      && !local.notes.some(note => note.title === 'e2e-folder-a (conflict copy)'),
      label + ' keeps one edited note in the renamed folder without a conflict copy');
    const paths = nodes => nodes.flatMap(node => [node.path, ...paths(node.children)]);
    check(!paths(buildFolderTree(local.notes, local.meta)).some(path => /^tech(?:\/|$)/i.test(path))
      && !local.meta.folders.some(folder => !folder.removed && /^tech(?:\/|$)/i.test(folder.path)),
      label + ' does not resurrect the old folder after the offline content edit');
  }

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
