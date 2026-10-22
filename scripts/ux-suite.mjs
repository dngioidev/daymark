#!/usr/bin/env node
/**
 * Automated part of docs/testing/ux-ui-test-suite.md. Runs every "A" test case by ID against the
 * PRODUCTION build (fresh server data, sample vault), plus axe-core, font-size, target-size,
 * overflow and truncation scans per screen/theme/viewport.
 *
 * Usage: npm run build && node scripts/ux-suite.mjs [--only=GL,TK] [--skip-scans]
 * Output: docs/reports/ux-ui/results.json, docs/reports/ux-ui/scans.json, docs/reports/ux-ui/screens/*.png
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import { signIn, resetServerVault, seedSample } from './helpers/server-session.mjs';

const require = createRequire(import.meta.url);
// A step that fails mid-test can leave a waitForEvent promise behind; don't let it kill the run
process.on('unhandledRejection', () => {});
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const OUT = path.resolve('docs', 'reports', 'ux-ui');
const SHOTS = path.join(OUT, 'screens');
fs.mkdirSync(SHOTS, { recursive: true });
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1]?.split(',');
const skipScans = process.argv.includes('--skip-scans');

const PORT = 3108;
const BASE = `http://localhost:${PORT}`;
const PASSWORD = 'ux-suite-password';
// A server left over from an aborted run would answer instead of a fresh one (and keep old data)
if (await fetch(`${BASE}/api/health`).then(() => true, () => false)) {
  console.error(`Port ${PORT} is already in use (a leftover test server?). Stop it and run again.`);
  process.exit(1);
}
const server = spawn('npx', ['tsx', 'server.ts', '--production'], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-ux-')), DAYMARK_PASSWORD: PASSWORD },
  shell: true,
  stdio: 'ignore',
});
const stopServer = () => (process.platform === 'win32' ? spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' }) : server.kill());

const ENVS = {
  D320: { viewport: { width: 320, height: 700 } },
  P360: { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  P412: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  T768: { viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  D1024: { viewport: { width: 1024, height: 768 } },
  D1280: { viewport: { width: 1280, height: 800 } },
  D1440: { viewport: { width: 1440, height: 900 } },
  D1920: { viewport: { width: 1920, height: 1080 } },
};
const isPhone = (env) => ENVS[env].hasTouch === true;

let browser;
const results = [];
const consoleErrors = [];
const log = (...a) => console.log(...a);

class Fail extends Error {}
const expect = (cond, message) => {
  if (!cond) throw new Fail(message);
};

/** Opens a signed-in profile with a sample or empty disposable server vault. */
async function open(env, { scheme = 'light', start = 'sample', url = BASE } = {}) {
  const ctx = await browser.newContext({ ...ENVS[env], colorScheme: scheme, acceptDownloads: true });
  const origin = new URL(url).origin;
  const session = await signIn(ctx, origin, PASSWORD);
  await resetServerVault(ctx, origin, session.accessToken);
  const page = await ctx.newPage();
  if (start === 'sample') await seedSample(page, origin);
  const dialogs = [];
  page.dialogPolicy = 'dismiss';
  page.promptAnswer = '';
  page.on('dialog', async (d) => {
    dialogs.push({ type: d.type(), message: d.message() });
    if (page.dialogPolicy === 'accept') await d.accept(d.type() === 'prompt' ? page.promptAnswer : undefined);
    else await d.dismiss();
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) consoleErrors.push({ env, url: page.url(), text: m.text().slice(0, 300) });
  });
  page.on('pageerror', (e) => consoleErrors.push({ env, url: page.url(), text: `pageerror: ${e.message}`.slice(0, 300) }));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /sync: synced/i }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);
  // The "loaded" toast would cover content in scans and screenshots
  await page.getByRole('button', { name: 'Dismiss' }).click({ timeout: 500 }).catch(() => {});
  return { ctx, page, dialogs, session };
}

async function tc(id, title, env, fn) {
  const area = id.split('-')[0];
  if (only && !only.includes(area) && !only.includes(id)) return;
  const started = Date.now();
  let status = 'pass';
  let details = '';
  try {
    const r = await fn();
    if (r && typeof r === 'object') {
      status = r.status || 'pass';
      details = r.details || '';
    } else if (typeof r === 'string') details = r;
  } catch (e) {
    status = 'fail';
    details = (e instanceof Fail ? '' : 'Error: ') + e.message.split('\n')[0];
  } finally {
    for (const context of browser.contexts()) await context.close();
  }
  results.push({ id, title, env, status, details, ms: Date.now() - started });
  log(`${status.toUpperCase().padEnd(4)} ${id} ${title}${details ? ` -- ${details}` : ''}`);
}

const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
const btn = (page, re) => page.getByRole('button', { name: re });
const visibleText = (page) => page.locator('body').innerText();
const count = (loc) => loc.count();
const taskCheckbox = (page, title) => page.getByRole('button', { name: `Mark "${title}" done` });
const T1 = 'Investigate build pipeline failure';
const T2 = 'Prepare QA test scenarios for offline sync';
const optionsButton = (page, title) => page.getByRole('button', { name: `More actions for "${title}"` });
const taskTitle = (page, title) => page.getByRole('button', { name: title, exact: true });
const statusChip = (page, title) =>
  page.locator('div.group').filter({ has: taskTitle(page, title) }).getByRole('button', { name: /^status:/i });
const newTask = (page) => page.getByRole('button', { name: /^new task/i }).first();

// ---------------------------------------------------------------- scans
function inPageAnalysis(minTarget) {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
  };
  const nameOf = (el) =>
    (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.getAttribute('placeholder') || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 50);
  const blocked = (el) => {
    // Element is covered by a modal overlay (not the topmost element at its centre)
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
    const top = document.elementFromPoint(x, y);
    return top && !el.contains(top) && !top.contains(el);
  };

  const smallText = [];
  const sizes = {};
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const el = node.parentElement;
    if (!el || seen.has(el) || !node.textContent.trim() || !visible(el)) continue;
    if (['SCRIPT', 'STYLE', 'TEXTAREA', 'OPTION'].includes(el.tagName)) continue;
    seen.add(el);
    const fs = parseFloat(getComputedStyle(el).fontSize);
    sizes[fs] = (sizes[fs] || 0) + 1;
    if (fs < 12) smallText.push({ size: fs, text: el.textContent.trim().slice(0, 40) });
  }

  const smallTargets = [];
  const unnamed = [];
  for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button]')) {
    if (!visible(el) || blocked(el)) continue;
    const r = el.getBoundingClientRect();
    // Pseudo-element hit areas, and inputs inside a full-size label (the label is the target)
    const label = el.closest('label')?.getBoundingClientRect();
    const enlarged = /before:-inset/.test(el.className || '') || (label && label.height >= minTarget && label.width >= minTarget);
    if (!enlarged && !['TEXTAREA'].includes(el.tagName) && (r.width < minTarget || r.height < minTarget)) {
      smallTargets.push({ name: nameOf(el) || `<${el.tagName.toLowerCase()}>`, w: Math.round(r.width), h: Math.round(r.height) });
    }
    if (['BUTTON', 'A'].includes(el.tagName) || el.getAttribute('role') === 'button') {
      const name = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim();
      if (!name && !el.getAttribute('aria-labelledby')) {
        const icon = el.querySelector('svg')?.getAttribute('class')?.match(/lucide-([\w-]+)/)?.[1];
        unnamed.push(icon ? `icon:${icon}` : el.outerHTML.slice(0, 80));
      }
    }
  }

  const truncated = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || el.children.length > 0 || el.getBoundingClientRect().width <= 1) continue; // skip screen-reader-only text
    const s = getComputedStyle(el);
    if ((s.overflow === 'hidden' || s.textOverflow === 'ellipsis' || s.whiteSpace === 'nowrap') && el.scrollWidth > el.clientWidth + 1 && el.textContent.trim()) {
      truncated.push(el.textContent.trim().slice(0, 50));
    }
  }

  const unlabeledFields = [];
  for (const el of document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]), select, textarea')) {
    if (!visible(el)) continue;
    const labelled = el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
    if (!labelled) unlabeledFields.push(el.getAttribute('placeholder') || el.name || el.tagName.toLowerCase());
  }

  return {
    overflowX: document.documentElement.scrollWidth - innerWidth,
    smallText,
    sizes,
    smallTargets,
    unnamed: [...new Set(unnamed)],
    truncated: [...new Set(truncated)].slice(0, 15),
    unlabeledFields: [...new Set(unlabeledFields)],
  };
}

async function scan(page, env, scheme, screen) {
  const minTarget = isPhone(env) ? 44 : 24;
  const a = await page.evaluate(inPageAnalysis, minTarget);
  await page.addScriptTag({ content: AXE });
  const axe = await page.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
      resultTypes: ['violations'],
    });
    return r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.length,
      samples: v.nodes.slice(0, 4).map((n) => (n.any[0]?.message || n.failureSummary || '').split('\n')[0].slice(0, 160) + ' @ ' + n.target.join(' ').slice(0, 80)),
    }));
  });
  const name = `${env}-${scheme}-${screen}`;
  await shot(page, name);
  return { env, scheme, screen, shot: `screens/${name}.png`, ...a, axe };
}

const PHONE_SCREENS = {
  'signed-in-start': { start: 'none', open: async () => {} },
  today: { open: async () => {} },
  'quick-capture': { open: async (p) => newTask(p).click() },
  'task-status-menu': { open: async (p) => statusChip(p, T1).click() },
  'task-options-menu': { open: async (p) => optionsButton(p, T1).click() },
  'task-details': { open: async (p) => taskTitle(p, T1).click() },
  'historical-modal': { open: async (p) => { await optionsButton(p, T1).click(); await p.getByRole('menuitem', { name: /another day/i }).click(); } },
  'markdown-mode': { open: async (p) => { await btn(p, /more options for this day/i).click(); await p.getByRole('menuitem', { name: /edit as markdown/i }).click(); } },
  history: { open: async (p) => btn(p, /^history$/i).click() },
  notes: { open: async (p) => btn(p, /^notes$/i).click() },
  'note-editor': { open: async (p) => { await btn(p, /^notes$/i).click(); await p.getByText('Weekly Sprint Sync Notes').click(); } },
  sync: { open: async (p) => btn(p, /open sync settings/i).click() },
  'settings-backup': { open: async (p) => btn(p, /^settings$/i).click() },
  'settings-statuses': { open: async (p) => { await btn(p, /^settings$/i).click(); await p.getByRole('tab', { name: /statuses/i }).click(); } },
};
const DESKTOP_SCREENS = {
  today: { open: async () => {} },
  'split-mode': { open: async (p) => btn(p, /^split$/i).click() },
  'quick-capture': { open: async (p) => newTask(p).click() },
  history: { open: async (p) => btn(p, /^history$/i).click() },
  notes: { open: async (p) => btn(p, /^notes$/i).click() },
  sync: { open: async (p) => btn(p, /open sync settings/i).click() },
  'settings-backup': { open: async (p) => btn(p, /^settings$/i).click() },
  'settings-statuses': { open: async (p) => { await btn(p, /^settings$/i).click(); await p.getByRole('tab', { name: /statuses/i }).click(); } },
};

async function runScans() {
  const scans = [];
  for (const [env, screens] of [['P412', PHONE_SCREENS], ['D1440', DESKTOP_SCREENS]]) {
    for (const scheme of ['light', 'dark']) {
      for (const [screen, def] of Object.entries(screens)) {
        const { ctx, page } = await open(env, { scheme, start: def.start || 'sample' });
        try {
          await def.open(page);
          await page.waitForTimeout(500);
          scans.push(await scan(page, env, scheme, screen));
          log(`scan ${env} ${scheme} ${screen}`);
        } catch (e) {
          scans.push({ env, scheme, screen, error: e.message.split('\n')[0] });
          log(`scan ${env} ${scheme} ${screen} FAILED: ${e.message.split('\n')[0]}`);
        }
        await ctx.close();
      }
    }
  }
  // Responsive: overflow per width for the main screens
  const responsive = [];
  for (const env of ['D320', 'P360', 'P412', 'T768', 'D1024', 'D1280', 'D1440', 'D1920']) {
    const phoneLayout = ENVS[env].viewport.width < 768;
    const screens = phoneLayout ? ['today', 'history', 'notes', 'sync', 'settings-backup', 'settings-statuses'] : ['today', 'history', 'notes', 'sync', 'settings-backup', 'settings-statuses'];
    for (const screen of screens) {
      const def = (phoneLayout ? PHONE_SCREENS : DESKTOP_SCREENS)[screen];
      const { ctx, page } = await open(env);
      try {
        await def.open(page);
        await page.waitForTimeout(400);
        const r = await page.evaluate(() => {
          const offenders = [];
          for (const el of document.querySelectorAll('body *')) {
            const b = el.getBoundingClientRect();
            if (b.width > 0 && b.right > innerWidth + 1 && getComputedStyle(el).position !== 'fixed') offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')} (${Math.round(b.right)}px)`);
          }
          return { overflowX: document.documentElement.scrollWidth - innerWidth, offenders: offenders.slice(0, 5), container: (document.querySelector('main > div') || document.querySelector('main'))?.getBoundingClientRect().width };
        });
        if (['D320', 'P360', 'D1024', 'D1920'].includes(env)) await shot(page, `responsive-${env}-${screen}`);
        responsive.push({ env, screen, ...r });
      } catch (e) {
        responsive.push({ env, screen, error: e.message.split('\n')[0] });
      }
      await ctx.close();
    }
  }
  return { scans, responsive };
}

// ---------------------------------------------------------------- functional test cases
const dialog = (page, name) => page.getByRole('dialog', name ? { name } : undefined);
const alertDialog = (page) => page.getByRole('alertdialog');
const isOpenDialog = (page, name) => dialog(page, name).isVisible().catch(() => false);
const capture = async (page, title, { section, status } = {}) => {
  await newTask(page).click();
  await page.getByPlaceholder(/what do you need to do/i).fill(title);
  if (section) await page.getByLabel('Section').selectOption(section);
  if (status) await page.getByLabel('Status', { exact: true }).selectOption({ label: status });
  await dialog(page, /new task/i).getByRole('button', { name: /^add task$/i }).click();
};
const openSettings = (page) => btn(page, /^settings$/i).first().click();
const openMenuItem = async (page, title, item) => {
  await optionsButton(page, title).click();
  await page.getByRole('menuitem', { name: item }).click();
};
const noIso = (text) => !/\b20\d\d-\d\d-\d\d\b/.test(text);

async function functional() {
  // ---- GL
  await tc('GL-01', 'Server sign-in opens Today without welcome', 'P412', async () => {
    const { ctx, page } = await open('P412', { start: 'none' });
    const today = await page.getByRole('heading', { name: 'Today', exact: true }).isVisible();
    const welcome = await dialog(page, /welcome to daymark/i).isVisible();
    await ctx.close();
    expect(today && !welcome, 'signed-in server did not open Today directly');
  });

  await tc('GL-02', 'Start empty', 'P412', async () => {
    const { ctx, page } = await open('P412', { start: 'empty' });
    const text = await visibleText(page);
    await ctx.close();
    expect(!text.includes(T1), 'sample tasks present');
    expect(/your day starts here/i.test(text), 'first-day guidance missing');
  });

  await tc('GL-03', 'Load sample', 'P412', async () => {
    const { ctx, page } = await open('P412');
    const text = await visibleText(page);
    await ctx.close();
    expect(text.includes(T1) && /need attention/i.test(text), 'sample tasks or attention chip missing');
  });

  await tc('GL-04', 'Welcome not repeated', 'P412', async () => {
    const { ctx, page } = await open('P412', { start: 'empty' });
    await page.reload({ waitUntil: 'networkidle' });
    const shown = await isOpenDialog(page, /welcome/i);
    await ctx.close();
    expect(!shown, 'welcome shown again after reload');
  });

  await tc('GL-05', 'Real date shown, no ISO dates on Today', 'P412+D1440', async () => {
    const long = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    for (const env of ['P412', 'D1440']) {
      const { ctx, page } = await open(env);
      const text = await visibleText(page);
      await ctx.close();
      expect(text.includes(long), `${env}: "${long}" not shown`);
      expect(noIso(text), `${env}: ISO date visible on Today`);
    }
  });

  await tc('GL-07', 'Toast behaviour', 'P412', async () => {
    const { ctx, page } = await open('P412', { start: 'empty' });
    await capture(page, 'Toast check');
    const toast = page.getByRole('status').filter({ hasText: /added to/i });
    await toast.waitFor({ timeout: 3000 });
    const box = await toast.boundingBox();
    const nav = await page.getByRole('navigation', { name: 'Main' }).boundingBox();
    const t0 = Date.now();
    await toast.waitFor({ state: 'hidden', timeout: 8000 });
    const shownMs = Date.now() - t0;
    await ctx.close();
    expect(box.y + box.height <= nav.y + 2, 'toast overlaps the bottom navigation');
    return shownMs > 5000 ? { status: 'warn', details: `toast stayed ${Math.round(shownMs / 1000)} s` } : `visible ~${Math.round(shownMs / 1000)} s, above nav, dismissible`;
  });

  // ---- NAV
  await tc('NAV-01', 'Bottom nav tabs', 'P412', async () => {
    const { ctx, page } = await open('P412');
    const nav = page.getByRole('navigation', { name: 'Main' });
    for (const [name, check] of [
      [/^history$/i, async () => /last 7 days/i.test(await visibleText(page))],
      [/^notes$/i, async () => /new note/i.test(await visibleText(page))],
      [/^today$/i, async () => taskTitle(page, T1).isVisible()],
      [/^settings$/i, async () => isOpenDialog(page, 'Settings')],
    ]) {
      await nav.getByRole('button', { name }).click();
      await page.waitForTimeout(300);
      expect(await check(), `tab ${name} did not open`);
    }
    const sizes = await nav.evaluate((n) => [...n.querySelectorAll('button')].map((b) => Math.round(Math.min(b.offsetWidth, b.offsetHeight))));
    await ctx.close();
    expect(sizes.every((s) => s >= 44), `bottom nav target below 44 px: ${sizes.join(', ')}`);
  });

  await tc('NAV-02', 'Centre + opens the new-task sheet with focus', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await newTask(page).click();
    await page.waitForTimeout(200);
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('placeholder') || '');
    const box = await dialog(page, /new task/i).boundingBox();
    await ctx.close();
    expect(/what do you need to do/i.test(focused), `focus is on "${focused}"`);
    expect(box.y + box.height >= 915 - 2, 'sheet is not docked at the bottom');
  });

  await tc('NAV-03', 'Settings opens full screen on phones', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await openSettings(page);
    const box = await dialog(page, 'Settings').boundingBox();
    await ctx.close();
    expect(box && box.width >= 400 && box.height >= 900, `settings not full screen (${box?.width}x${box?.height})`);
  });

  await tc('NAV-04', 'Header sync status opens Sync settings', 'P412', async () => {
    const { ctx, page } = await open('P412');
    const pill = btn(page, /open sync settings/i);
    const size = await pill.boundingBox();
    await pill.click();
    const signOut = dialog(page, 'Settings').getByRole('button', { name: 'Sign out', exact: true });
    await signOut.waitFor();
    const opened = await signOut.isVisible();
    await ctx.close();
    expect(opened, 'status did not open Sync');
    expect(size.height >= 44, `status target ${Math.round(size.width)}x${Math.round(size.height)} px`);
  });

  await tc('NAV-05', 'Desktop navbar items fit at 1024-1920 px', 'D1024+D1440', async () => {
    for (const env of ['D1024', 'D1440']) {
      const { ctx, page } = await open(env);
      const fits = await page.evaluate(() => [...document.querySelectorAll('header button')].every((b) => b.getBoundingClientRect().right <= innerWidth));
      expect(fits, `${env}: navbar item off-screen`);
      await btn(page, /^history$/i).click();
      expect(/last 7 days/i.test(await visibleText(page)), `${env}: history not shown`);
      await btn(page, /^notes$/i).click();
      expect(/new folder/i.test(await visibleText(page)), `${env}: notes not shown`);
      await openSettings(page);
      expect(await isOpenDialog(page, 'Settings'), `${env}: settings not shown`);
      await ctx.close();
    }
  });

  await tc('NAV-06', 'Logo returns to Today', 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    await btn(page, /^history$/i).click();
    await btn(page, /^daymark$/i).click();
    await page.waitForTimeout(300);
    const ok = await taskTitle(page, T1).isVisible();
    await ctx.close();
    expect(ok, 'logo does not return to Today');
  });

  await tc('NAV-07', 'Phone preview is a developer tool', 'D1440', async () => {
    const a = await open('D1440');
    const hidden = !(await btn(a.page, /phone layout preview/i).isVisible().catch(() => false));
    await a.ctx.close();
    const b = await open('D1440', { url: `${BASE}/?dev` });
    await btn(b.page, /phone layout preview/i).click();
    await btn(b.page, /desktop layout/i).click();
    const back = await btn(b.page, /phone layout preview/i).isVisible();
    await b.ctx.close();
    expect(hidden, 'phone preview button shown to everyone');
    expect(back, 'did not return to desktop layout');
  });

  await tc('NAV-08', 'Back up now', 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    await openSettings(page);
    const dl = page.waitForEvent('download', { timeout: 8000 });
    await btn(page, /back up now/i).click();
    const file = await dl;
    await page.waitForTimeout(300);
    const t = await dialog(page, 'Settings').innerText();
    await ctx.close();
    expect(/\.zip$/.test(file.suggestedFilename()), 'no zip');
    expect(/last backup on this device: today/i.test(t), 'last backup not shown');
  });

  await tc('NAV-09', 'New task via button and Ctrl K', 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    await newTask(page).click();
    expect(await page.getByPlaceholder(/what do you need to do/i).isVisible(), 'button did not open');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(200);
    const ok = await page.getByPlaceholder(/what do you need to do/i).isVisible();
    await ctx.close();
    expect(ok, 'Ctrl K did not open');
  });

  await tc('NAV-11', 'Deep links', 'P412', async () => {
    const a = await open('P412', { url: `${BASE}/?action=capture`, start: 'empty' });
    const cap = await a.page.getByPlaceholder(/what do you need to do/i).isVisible();
    await a.ctx.close();
    const b = await open('P412', { url: `${BASE}/?tab=notes`, start: 'sample' });
    const notes = /new note/i.test(await visibleText(b.page));
    await b.ctx.close();
    expect(cap, '?action=capture failed');
    expect(notes, '?tab=notes failed');
  });

  // ---- TD
  await tc('TD-01', 'Previous / next day', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /previous day/i).click();
    const y = await page.locator('h1').first().innerText();
    await btn(page, /next day/i).click();
    await btn(page, /next day/i).click();
    const t = await page.locator('h1').first().innerText();
    const sizes = await page.evaluate(() => ['Previous day', 'Next day'].map((n) => document.querySelector(`button[aria-label="${n}"]`)?.getBoundingClientRect().width));
    await ctx.close();
    expect(/yesterday/i.test(y), `previous day title "${y}"`);
    expect(/tomorrow/i.test(t), `next day title "${t}"`);
    expect(sizes.every((s) => s >= 44), `day arrows ${sizes.map(Math.round).join('/')} px`);
  });

  await tc('TD-02', 'Today button returns', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /previous day/i).click();
    await btn(page, /^today$/i).first().click();
    const h = await page.locator('h1').first().innerText();
    await ctx.close();
    expect(/today/i.test(h), `title "${h}"`);
  });

  await tc('TD-03', 'View modes; Markdown hides task tags', 'P412+D1440', async () => {
    const p = await open('P412');
    expect(!(await btn(p.page, /^split$/i).isVisible().catch(() => false)), 'Split visible on phone');
    await btn(p.page, /more options for this day/i).click();
    await p.page.getByRole('menuitem', { name: /edit as markdown/i }).click();
    const md = await p.page.getByLabel(/^markdown for/i).inputValue();
    expect(md.includes(T1) && !md.includes('daymark:'), 'markdown missing tasks or shows task tags');
    await btn(p.page, /back to list/i).click();
    expect(await taskTitle(p.page, T1).isVisible(), 'list not restored');
    await p.ctx.close();
    const d = await open('D1440');
    await btn(d.page, /^split$/i).click();
    const both = (await taskTitle(d.page, T1).isVisible()) && (await d.page.getByLabel(/^markdown for/i).isVisible());
    await btn(d.page, /^list$/i).click();
    await d.ctx.close();
    expect(both, 'split view does not show list and Markdown');
  });

  await tc('TD-04', "Refresh today's list", 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    await btn(page, /more options for this day/i).click();
    await page.getByRole('menuitem', { name: /refresh today's list/i }).click();
    const ok = await page.getByRole('status').filter({ hasText: /up to date|moved to today/i }).isVisible();
    await ctx.close();
    expect(ok, 'no confirmation');
  });

  await tc('TD-05', 'Attention chip filters', 'P412', async () => {
    const { ctx, page } = await open('P412');
    const before = await page.getByRole('button', { name: /^more actions for/i }).count();
    const chip = btn(page, /^show$/i);
    await chip.click();
    const after = await page.getByRole('button', { name: /^more actions for/i }).count();
    await btn(page, /^show all$/i).click();
    const restored = await page.getByRole('button', { name: /^more actions for/i }).count();
    const h = (await chip.boundingBox())?.height ?? 0;
    await ctx.close();
    expect(after <= before && restored === before, `counts ${before}/${after}/${restored}`);
    expect(h >= 44, `chip button ${Math.round(h)} px tall`);
  });

  await tc('TD-06', 'Section + Task inline add fits on phones', 'P360+P412', async () => {
    for (const env of ['P360', 'P412']) {
      const { ctx, page } = await open(env);
      await btn(page, /^task$/i).first().click();
      const rowFits = await page.evaluate(() => {
        const i = document.querySelector('input[placeholder="What needs to be done?"]');
        return [...i.closest('form').querySelectorAll('input,select,button')].every((el) => el.getBoundingClientRect().right <= innerWidth);
      });
      if (env === 'P360') await shot(page, 'TD-06-inline-add-360');
      await page.getByPlaceholder('What needs to be done?').fill('Inline one');
      await page.keyboard.press('Enter');
      await page.getByPlaceholder('What needs to be done?').fill('Inline two');
      await page.getByRole('button', { name: /^add task$/i }).click();
      const added = (await taskTitle(page, 'Inline one').isVisible()) && (await taskTitle(page, 'Inline two').isVisible());
      await ctx.close();
      expect(rowFits, `${env}: inline add row does not fit on screen`);
      expect(added, `${env}: tasks not added (Enter and button)`);
    }
  });

  await tc('TD-07', 'Section notes editor; toolbar wraps the selection', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^note$/i).first().click();
    const area = page.locator('textarea[id^="notes-"]').first();
    await area.fill('hello world');
    await area.evaluate((el) => el.setSelectionRange(0, 5));
    await btn(page, /^bold$/i).click();
    const v = await area.inputValue();
    await btn(page, /save notes/i).click();
    await page.waitForTimeout(200);
    const rendered = await page.locator('strong', { hasText: 'hello' }).first().isVisible();
    await ctx.close();
    expect(v === '**hello** world', `toolbar result "${v}"`);
    expect(rendered, 'saved note not rendered');
  });

  await tc('TD-08', 'Section notes Clear asks first, with Undo (DS-03)', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^note$/i).first().click();
    await page.locator('textarea[id^="notes-"]').first().fill('keep me');
    await btn(page, /save notes/i).click();
    await btn(page, /^clear .* notes$/i).first().click();
    expect(await alertDialog(page).isVisible(), 'no confirmation');
    await alertDialog(page).getByRole('button', { name: /^cancel$/i }).click();
    expect(await page.getByText('keep me').isVisible(), 'cleared on cancel');
    await btn(page, /^clear .* notes$/i).first().click();
    await alertDialog(page).getByRole('button', { name: /^clear$/i }).click();
    await btn(page, /^undo$/i).click();
    const back = await page.getByText('keep me').isVisible();
    await ctx.close();
    expect(back, 'undo did not restore notes');
  });

  await tc('TD-09', 'New section', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^new section$/i).click();
    await page.getByLabel('New section name').fill('Errands');
    await btn(page, /^add section$/i).click();
    const shown = await page.getByLabel('New task in Errands').isVisible();
    await ctx.close();
    expect(shown, 'new section not opened for adding');
  });

  await tc('TD-10', 'Empty sections collapse into "Add to" chips', 'P412', async () => {
    const { ctx, page } = await open('P412');
    const chips = await page.getByRole('button', { name: /^\+?\s*(meetings|ideas)$/i }).count();
    const emptyHeadings = await page.getByRole('heading', { name: /^(meetings|ideas)$/i }).count();
    await ctx.close();
    expect(chips >= 2 && emptyHeadings === 0, `chips ${chips}, empty section cards ${emptyHeadings}`);
  });

  // ---- TK
  await tc('TK-01', 'Complete, Done group, Undo', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await taskCheckbox(page, T1).click();
    const grouped = await btn(page, /^done \(1\)$/i).isVisible();
    await btn(page, /^undo$/i).click();
    const back = await taskCheckbox(page, T1).isVisible();
    await ctx.close();
    expect(grouped, 'done task not grouped under Done (1)');
    expect(back, 'undo did not reopen');
  });

  await tc('TK-02', 'Status menu: options, outside tap and Esc close it', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await statusChip(page, T1).click();
    const items = await page.getByRole('menuitem').allInnerTexts();
    await page.mouse.click(20, 500);
    const closedOutside = !(await page.getByRole('menu').isVisible().catch(() => false));
    await statusChip(page, T1).click();
    await page.keyboard.press('Escape');
    const closedEsc = !(await page.getByRole('menu').isVisible().catch(() => false));
    await statusChip(page, T1).click();
    await page.getByRole('menuitem', { name: /^blocked$/i }).click();
    const label = await statusChip(page, T1).getAttribute('aria-label');
    await ctx.close();
    expect(!items.some((i) => /^note$/i.test(i.trim())), '"Note" offered as a task status');
    expect(!items.some((i) => /carry-forward|keep/i.test(i)), 'menu shows rollover policy jargon');
    expect(closedOutside && closedEsc, `outside ${closedOutside}, Esc ${closedEsc}`);
    expect(/blocked/i.test(label), `status not changed (${label})`);
  });

  await tc('TK-03', 'Tap title opens details sheet', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await taskTitle(page, T1).click();
    const open1 = await isOpenDialog(page, T1);
    const text = open1 ? await dialog(page, T1).innerText() : '';
    await page.keyboard.press('Escape');
    const closed = !(await isOpenDialog(page, T1));
    await ctx.close();
    expect(open1, 'details sheet not opened');
    expect(!/task-\d+/.test(text) && noIso(text), 'internal id or ISO dates shown');
    expect(closed, 'Esc did not close');
  });

  await tc('TK-04', 'Edit notes persists', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await taskTitle(page, T1).click();
    await page.getByLabel('Notes', { exact: true }).fill('Edited context');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await page.reload({ waitUntil: 'networkidle' });
    await taskTitle(page, T1).click();
    const v = await page.getByLabel('Notes', { exact: true }).inputValue();
    await ctx.close();
    expect(v === 'Edited context', `notes "${v}"`);
  });

  await tc('TK-05', 'Checklist add / toggle / remove on touch', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await taskTitle(page, T1).click();
    await page.getByLabel('New checklist item').fill('Step one');
    await page.keyboard.press('Enter');
    await btn(page, /^check "step one"$/i).click();
    const checked = (await btn(page, /^uncheck "step one"$/i).count()) === 1;
    const remove = btn(page, /^remove "step one"$/i);
    const box = await remove.boundingBox();
    await remove.click();
    const gone = (await btn(page, /step one/i).count()) === 0;
    await ctx.close();
    expect(checked, 'toggle failed');
    expect(box && box.width >= 44 && box.height >= 44, 'remove button not touch-sized');
    expect(gone, 'remove failed');
  });

  await tc('TK-06', 'History in details', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await openMenuItem(page, T1, /details & history/i);
    const text = await dialog(page, T1).innerText();
    await ctx.close();
    expect(/history/i.test(text) && /moved|carried|added|created/i.test(text), 'history missing');
    expect(noIso(text) && !/#\w/.test(text), 'raw ISO dates or #Section in history');
  });

  await tc('TK-07', 'Hide warning today and show again', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await openMenuItem(page, T1, /hide warning today/i);
    const menuHas = async () => {
      await optionsButton(page, T1).click();
      const r = await page.getByRole('menuitem', { name: /show warning again/i }).isVisible();
      await page.keyboard.press('Escape');
      return r;
    };
    const hidden = await menuHas();
    await openMenuItem(page, T1, /show warning again/i);
    await ctx.close();
    expect(hidden, 'warning not hidden');
  });

  await tc('TK-08', 'Delete asks first, Undo restores (DS-01)', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await openMenuItem(page, T1, /^delete$/i);
    expect(await alertDialog(page).isVisible(), 'no confirmation');
    await alertDialog(page).getByRole('button', { name: /^cancel$/i }).click();
    expect(await taskTitle(page, T1).isVisible(), 'deleted on cancel');
    await openMenuItem(page, T1, /^delete$/i);
    await alertDialog(page).getByRole('button', { name: /^delete$/i }).click();
    const gone = !(await taskTitle(page, T1).isVisible().catch(() => false));
    await btn(page, /^undo$/i).click();
    const back = await taskTitle(page, T1).isVisible();
    await ctx.close();
    expect(gone && back, `deleted ${gone}, undo ${back}`);
  });

  await tc('TK-09', 'Options button on every task, touch-sized', 'P412', async () => {
    const { ctx, page } = await open('P412');
    const boxes = await page.getByRole('button', { name: /^more actions for/i }).evaluateAll((els) => els.map((e) => [e.offsetWidth, e.offsetHeight]));
    const tasks = await page.getByRole('button', { name: /^mark ".*" done$/i }).count();
    await ctx.close();
    expect(boxes.length === tasks, `${boxes.length} menus for ${tasks} tasks`);
    expect(boxes.every(([w, h]) => w >= 44 && h >= 44), 'menu button below 44 px');
  });

  await tc('TK-10', 'Rename task', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await openMenuItem(page, T1, /^rename$/i);
    await page.getByLabel('Task title').fill('Renamed task');
    await page.keyboard.press('Enter');
    const ok = await taskTitle(page, 'Renamed task').isVisible();
    await ctx.close();
    expect(ok, 'rename failed');
  });

  await tc('TK-11', 'Quick "Mark done on <carried day>"', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await optionsButton(page, T1).click();
    const item = page.getByRole('menuitem', { name: /^mark done (yesterday|on (?!another))/i });
    const label = await item.innerText();
    await item.click();
    const gone = !(await taskTitle(page, T1).isVisible().catch(() => false));
    const toast = await page.getByRole('status').filter({ hasText: /marked/i }).isVisible();
    await ctx.close();
    expect(noIso(label), `menu label "${label}" shows an ISO date`);
    expect(gone && toast, `left today ${gone}, toast ${toast}`);
  });

  await tc('TK-12', '"Mark done on another day" dialog', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await openMenuItem(page, T1, /another day/i);
    const d = dialog(page, /when did you finish it/i);
    const text = await d.innerText();
    const chips = await d.getByRole('group', { name: /quick picks/i }).getByRole('button').allInnerTexts();
    await d.getByRole('button', { name: /^mark done$/i }).click();
    const gone = !(await taskTitle(page, T1).isVisible().catch(() => false));
    await ctx.close();
    expect(!/\(yesterday\)/i.test(text) && noIso(chips.join(' ')), `labels: ${chips.join(' | ')}`);
    expect(gone, 'task still on today');
  });

  await tc('TK-13', 'Age labels', 'P412', async () => {
    const { ctx, page } = await open('P412');
    const text = await visibleText(page);
    await ctx.close();
    expect(/\d+ days? old/.test(text), 'no "N days old" label');
    expect(!/carried forward/i.test(text), 'old "Carried forward" wording');
  });

  await tc('TK-14', 'Long title wraps on 360 px', 'P360', async () => {
    const { ctx, page } = await open('P360', { start: 'empty' });
    const title = 'A very long task title that keeps going to check wrapping behaviour on small phones without breaking the layout or hiding actions';
    await capture(page, title);
    const r = await page.evaluate((t) => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent === t).getBoundingClientRect();
      return { right: b.right, overflow: document.documentElement.scrollWidth - innerWidth };
    }, title);
    const menuVisible = await optionsButton(page, title).isVisible();
    await shot(page, 'TK-14-long-title-360');
    await ctx.close();
    expect(r.right <= 360 && r.overflow <= 0 && menuVisible, 'long title overflows or hides actions');
  });

  // ---- QC
  await tc('QC-01', 'New-task sheet layout and labels', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await newTask(page).click();
    const d = dialog(page, /new task/i);
    const text = await d.innerText();
    const labelled = (await page.getByLabel('Section').count()) === 1 && (await page.getByLabel('Status', { exact: true }).count()) === 1;
    await ctx.close();
    expect(labelled, 'Section/Status not labelled');
    expect(noIso(text) && !/#\w/.test(text) && !/notebook heading/i.test(text), 'ISO date, #Section or old labels');
  });

  await tc('QC-02', 'Add with Enter and with the button', 'P412', async () => {
    const { ctx, page } = await open('P412', { start: 'empty' });
    await newTask(page).click();
    await page.getByPlaceholder(/what do you need to do/i).fill('Via enter');
    await page.keyboard.press('Enter');
    await capture(page, 'Via button');
    const ok = (await taskTitle(page, 'Via enter').isVisible()) && (await taskTitle(page, 'Via button').isVisible());
    await ctx.close();
    expect(ok, 'capture failed');
  });

  await tc('QC-03', 'Empty title cannot be added', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await newTask(page).click();
    const disabled = await dialog(page, /new task/i).getByRole('button', { name: /^add task$/i }).isDisabled();
    await ctx.close();
    expect(disabled, 'Add task enabled with an empty title');
  });

  await tc('QC-04', 'Defaults and remembered section/status', 'P412', async () => {
    const { ctx, page } = await open('P412', { start: 'empty' });
    await newTask(page).click();
    const firstStatus = await page.getByLabel('Status', { exact: true }).inputValue();
    await page.keyboard.press('Escape');
    await capture(page, 'Meeting prep', { section: 'Meetings', status: 'Blocked' });
    await newTask(page).click();
    const section = await page.getByLabel('Section').inputValue();
    const status = await page.getByLabel('Status', { exact: true }).inputValue();
    await ctx.close();
    expect(firstStatus === 'not-started', `default status ${firstStatus}`);
    expect(section === 'Meetings' && status === 'blocked', `remembered ${section}/${status}`);
  });

  await tc('QC-05', 'Close via Cancel / X / Esc / backdrop', 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    const isOpen = () => isOpenDialog(page, /new task/i);
    const results = {};
    await newTask(page).click();
    await dialog(page, /new task/i).getByRole('button', { name: /^cancel$/i }).click();
    results.cancel = !(await isOpen());
    await newTask(page).click();
    await dialog(page, /new task/i).getByRole('button', { name: /^close$/i }).click();
    results.x = !(await isOpen());
    await newTask(page).click();
    await page.keyboard.press('Escape');
    results.esc = !(await isOpen());
    await newTask(page).click();
    await page.mouse.click(10, 450);
    results.backdrop = !(await isOpen());
    await ctx.close();
    const failed = Object.entries(results).filter(([, ok]) => !ok).map(([k]) => k);
    expect(!failed.length, `did not close via ${failed.join(', ')}`);
  });

  // ---- HI
  await tc('HI-01', 'History opens on the latest day', 'P412+D1440', async () => {
    for (const env of ['P412', 'D1440']) {
      const { ctx, page } = await open(env);
      await btn(page, /^history$/i).first().click();
      const h = await page.locator('h2').filter({ hasText: /day|,/ }).last().innerText();
      await ctx.close();
      expect(/\d/.test(h), `${env}: no day shown (${h})`);
    }
  });

  await tc('HI-02', 'Calendar day select, empty day wording', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^history$/i).click();
    const empty = page.getByRole('button', { name: /: nothing recorded$/i }).first();
    await empty.click();
    const text = await visibleText(page);
    const recorded = page.getByRole('button', { name: /\d+ of \d+ done$/i }).first();
    await recorded.click();
    const tasksShown = /tasks done/i.test(await visibleText(page));
    await ctx.close();
    expect(/nothing was recorded on/i.test(text) && noIso(text), 'empty day message');
    expect(tasksShown, 'recorded day not shown');
  });

  await tc('HI-03', 'Month navigation', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^history$/i).click();
    const m0 = await page.locator('h2').first().innerText();
    await btn(page, /previous month/i).click();
    const m1 = await page.locator('h2').first().innerText();
    await btn(page, /next month/i).click();
    const m2 = await page.locator('h2').first().innerText();
    const box = await btn(page, /next month/i).boundingBox();
    await ctx.close();
    expect(m0 !== m1 && m0 === m2, `${m0} / ${m1} / ${m2}`);
    expect(box.width >= 44, 'month arrows below 44 px');
  });

  await tc('HI-04', 'Recent days list and "Open this day"', 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    await btn(page, /^history$/i).click();
    const list = await page.getByRole('heading', { name: /recent days/i }).isVisible();
    await btn(page, /open this day/i).click();
    const onToday = await btn(page, /^today$/i).last().isVisible();
    await ctx.close();
    expect(list, 'recent days missing');
    expect(onToday, 'did not open the day');
  });

  // ---- NO
  await tc('NO-01', 'Notes list: pinned first, plain previews', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^notes$/i).click();
    const items = await page.locator('main li button').allInnerTexts();
    await ctx.close();
    expect(items.length >= 4, `${items.length} notes`);
    expect(!items.some((t) => /\[ \]|\[x\]|\*\*|^#/m.test(t)), 'Markdown syntax in previews');
    expect(noIso(items.join(' ')) && !/\d+\/\d+\/\d{4}/.test(items.join(' ')), 'numeric dates in list');
  });

  await tc('NO-02', 'Search and empty result', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^notes$/i).click();
    await page.getByLabel('Search notes').fill('sprint');
    const one = await page.locator('main li button').count();
    await page.getByLabel('Search notes').fill('zzzz');
    const none = /no notes match/i.test(await visibleText(page));
    await ctx.close();
    expect(one === 1 && none, `results ${one}, empty message ${none}`);
  });

  await tc('NO-03', 'Folder chips', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^notes$/i).click();
    await btn(page, /^meetings$/i).click();
    const n = await page.locator('main li button').count();
    await ctx.close();
    expect(n === 1, `${n} notes in Meetings`);
  });

  await tc('NO-04', 'New note focuses the title', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^notes$/i).click();
    await btn(page, /^new note$/i).click();
    await page.waitForTimeout(200);
    const focused = await page.evaluate(() => document.activeElement?.id);
    await ctx.close();
    expect(focused === 'note-title', `focus on ${focused}`);
  });

  await tc('NO-05', 'Edit title / folder / body persists', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^notes$/i).click();
    await btn(page, /^new note$/i).click();
    await page.getByLabel('Title').fill('Persisted note');
    await page.getByLabel(/note text/i).fill('Body text');
    await page.reload({ waitUntil: 'networkidle' });
    await btn(page, /^notes$/i).click();
    const ok = await page.getByText('Persisted note').first().isVisible();
    await ctx.close();
    expect(ok, 'note not persisted');
  });

  await tc('NO-06', 'Toolbar wraps the selection', 'P412+D1440', async () => {
    for (const env of ['P412', 'D1440']) {
      const { ctx, page } = await open(env);
      await btn(page, /^notes$/i).click();
      await btn(page, /^new note$/i).click();
      const area = page.getByLabel(/note text/i);
      await area.fill('word');
      await area.evaluate((el) => el.setSelectionRange(0, 4));
      await btn(page, /^bold$/i).click();
      const v = await area.inputValue();
      await ctx.close();
      expect(v === '**word**', `${env}: "${v}"`);
    }
  });

  await tc('NO-07', 'Edit / Read (/ Split) modes', 'P412+D1440', async () => {
    const p = await open('P412');
    await btn(p.page, /^notes$/i).click();
    await p.page.getByText('Weekly Sprint Sync Notes').click();
    const readDefault = (await btn(p.page, /^read$/i).getAttribute('aria-pressed')) === 'true';
    await p.ctx.close();
    const d = await open('D1440');
    await btn(d.page, /^notes$/i).click();
    await btn(d.page, /^split$/i).last().click();
    const split = (await d.page.getByLabel(/note text/i).isVisible()) && (await d.page.locator('main h1, main h2').count()) > 1;
    await d.ctx.close();
    expect(readDefault, 'phone does not open notes for reading');
    expect(split, 'split view missing');
  });

  await tc('NO-08', 'Pin moves a note to the top', 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    await btn(page, /^notes$/i).click();
    await page.getByText('Q4 Reading List & Research Papers').first().click();
    await btn(page, /pin note to the top/i).click();
    const first = await page.locator('main li button').first().innerText();
    await ctx.close();
    expect(/q4 reading list/i.test(first), `first note "${first.split('\n')[0]}"`);
  });

  await tc('NO-09', 'Delete note asks first, Undo restores (DS-02)', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^notes$/i).click();
    await page.getByText('Weekly Sprint Sync Notes').click();
    await btn(page, /more note actions/i).click();
    await page.getByRole('menuitem', { name: /delete note/i }).click();
    expect(await alertDialog(page).isVisible(), 'no confirmation');
    await alertDialog(page).getByRole('button', { name: /^delete$/i }).click();
    await btn(page, /^undo$/i).click();
    const back = await page.getByText('Weekly Sprint Sync Notes').first().isVisible();
    await ctx.close();
    expect(back, 'undo did not restore');
  });

  await tc('NO-10', 'New folder', 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    await btn(page, /^notes$/i).click();
    await btn(page, /new folder/i).click();
    await page.getByLabel('Folder name').fill('Recipes');
    await btn(page, /^create$/i).click();
    const ok = await btn(page, /^recipes$/i).isVisible();
    await ctx.close();
    expect(ok, 'folder chip missing');
  });

  await tc('NO-11', 'Back to list (button and Android Back)', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^notes$/i).click();
    await page.getByText('Weekly Sprint Sync Notes').click();
    const back = btn(page, /back to notes/i);
    const box = await back.boundingBox();
    await back.click();
    const list = await page.getByLabel('Search notes').isVisible();
    await ctx.close();
    expect(list, 'list not shown');
    expect(box.width >= 44, 'back button below 44 px');
  });

  // ---- SY: browser sync is automatic; address/password forms belong to native.
  await tc('SY-01', 'Account view replaces the connection form', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /open sync settings/i).click();
    expect(await page.getByText('admin', { exact: true }).isVisible(), 'account missing');
    expect(await btn(page, /^sign out$/i).isVisible(), 'Sign out missing');
    expect(await page.getByLabel('Server address').count() === 0, 'native connection form shown on server');
    await ctx.close();
  });

  await tc('SY-02', 'Offline account keeps changes locally', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await ctx.setOffline(true);
    await btn(page, /open sync settings/i).click();
    await btn(page, /^sync now$/i).click();
    await page.getByRole('status').filter({ hasText: /changes are saved here/i }).waitFor();
    expect(await btn(page, /^sign out$/i).isVisible(), 'account actions disappeared offline');
    await ctx.close();
  });

  await tc('SY-03', 'Sign out returns to the sign-in form', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /open sync settings/i).click();
    await btn(page, /^sign out$/i).click();
    await page.getByLabel('Password', { exact: true }).waitFor();
    expect(await page.getByRole('heading', { name: 'Sign in', exact: true }).isVisible(), 'sign-in form missing');
    await ctx.close();
  });

  await tc('SY-04', 'Automatic sync, header status, Sync now', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /open sync settings/i).click();
    const response = page.waitForResponse((r) => r.url().endsWith('/api/sync') && r.request().method() === 'POST');
    await btn(page, /^sync now$/i).click();
    expect((await response).ok(), 'manual sync failed');
    await page.getByText(/up to date/i).first().waitFor();
    await btn(page, /^done$/i).click();
    expect(await btn(page, /sync: synced/i).isVisible(), 'header status not Synced');
    await ctx.close();
  });

  await tc('SY-05', 'Devices, activity, password validation', 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    await btn(page, /open sync settings/i).click();
    await page.getByText(/this device/i).first().waitFor({ timeout: 15000 });
    await page.getByLabel('Current password').fill('nope-wrong');
    await page.getByLabel('New password').fill('newpassword123');
    await btn(page, /change password/i).click();
    await page.getByText(/current password is wrong/i).waitFor();
    const t = await dialog(page, 'Settings').innerText();
    await shot(page, 'SY-05-server-view');
    await ctx.close();
    expect(/recent activity/i.test(t) && /this device/i.test(t), 'devices/activity missing');
    expect(!/change\(s\)|conflict\(s\)/.test(t), 'raw server log wording');
  });

  await tc('SY-06', 'Unsent sign-out asks first and Cancel keeps the task', 'P412', async () => {
    const { ctx, page } = await open('P412', { start: 'empty' });
    await ctx.setOffline(true);
    await capture(page, 'Keep this offline task');
    await btn(page, /open sync settings/i).click();
    await btn(page, /^sign out$/i).click();
    const warning = alertDialog(page);
    await warning.waitFor();
    expect((await warning.innerText()).includes('1 change'), 'unsent count missing');
    await warning.getByRole('button', { name: /^cancel$/i }).click();
    await btn(page, /^done$/i).click();
    expect(await taskTitle(page, 'Keep this offline task').isVisible(), 'Cancel lost the task');
    await ctx.close();
  });

  await tc('SY-07', 'Restore on a synced device keeps server data', 'D1440', async () => {
    const b = await open('D1440', { start: 'empty' });
    await capture(b.page, 'Only task in backup');
    await openSettings(b.page);
    await b.page.getByRole('tab', { name: /^advanced$/i }).click();
    const dl = b.page.waitForEvent('download');
    await btn(b.page, /download \.json/i).click();
    const backup = path.join(os.tmpdir(), 'daymark-sy07-' + Date.now() + '.json');
    fs.copyFileSync(await (await dl).path(), backup);
    await b.ctx.close();
    const a = await open('D1440');
    await openSettings(a.page);
    const chooser = a.page.waitForEvent('filechooser');
    await btn(a.page, /choose a backup file/i).click();
    await (await chooser).setFiles(backup);
    await alertDialog(a.page).getByRole('button', { name: /^restore$/i }).click();
    await openSettings(a.page);
    await a.page.getByRole('tab', { name: /^sync$/i }).click();
    const response = a.page.waitForResponse((r) => r.url().endsWith('/api/sync') && r.request().method() === 'POST');
    await btn(a.page, /^sync now$/i).click();
    expect((await response).ok(), 'restored vault sync failed');
    await a.page.getByText(/up to date/i).first().waitFor();
    const stats = await a.ctx.request.get(BASE + '/api/server/stats', { headers: { Authorization: 'Bearer ' + a.session.accessToken } });
    expect(stats.ok() && (await stats.json()).notes >= 4, 'restore removed server notes');
    await btn(a.page, /^done$/i).click();
    expect(await taskTitle(a.page, 'Only task in backup').isVisible(), 'backup task missing after merge');
    await a.ctx.close();
  });

  await tc('SY-08', 'Reload keeps the same signed-in device', 'P412', async () => {
    const { ctx, page, session } = await open('P412');
    await page.reload({ waitUntil: 'networkidle' });
    await btn(page, /sync: synced/i).waitFor({ timeout: 20000 });
    const response = await ctx.request.get(BASE + '/api/devices', { headers: { Authorization: 'Bearer ' + session.accessToken } });
    expect(response.ok(), 'device list failed');
    const { devices } = await response.json();
    expect(devices.filter((d) => d.id === session.device.id).length === 1, 'reload duplicated or revoked device');
    await ctx.close();
  });

  // ---- SE
  await tc('SE-01', 'Settings tabs', 'P412+D1440', async () => {
    for (const env of ['P412', 'D1440']) {
      const { ctx, page } = await open(env);
      await openSettings(page);
      for (const name of ['Backup & restore', 'Sync', 'Statuses', 'Old-task warnings', 'Sections', 'Advanced']) {
        const t = page.getByRole('tab', { name, exact: true });
        expect(await t.isVisible(), `${env}: tab ${name} not visible`);
        await t.click();
        expect((await t.getAttribute('aria-selected')) === 'true', `${env}: ${name} not selected`);
      }
      await ctx.close();
    }
  });

  await tc('SE-02', 'Close settings (X, Done, Esc, backdrop)', 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    const isOpen = () => isOpenDialog(page, 'Settings');
    const r = {};
    await openSettings(page);
    await dialog(page, 'Settings').getByRole('button', { name: /^close$/i }).click();
    r.x = !(await isOpen());
    await openSettings(page);
    await btn(page, /^done$/i).click();
    r.done = !(await isOpen());
    await openSettings(page);
    await page.keyboard.press('Escape');
    r.esc = !(await isOpen());
    await openSettings(page);
    await page.mouse.click(10, 450);
    r.backdrop = !(await isOpen());
    await ctx.close();
    const failed = Object.entries(r).filter(([, ok]) => !ok).map(([k]) => k);
    expect(!failed.length, `did not close via ${failed.join(', ')}`);
  });

  await tc('SE-03', 'Back up (.zip) and technical backup (.json)', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await openSettings(page);
    const z = page.waitForEvent('download', { timeout: 8000 });
    await btn(page, /back up now/i).click();
    const zf = await z;
    await page.getByRole('tab', { name: /^advanced$/i }).click();
    const j = page.waitForEvent('download', { timeout: 8000 });
    await btn(page, /download \.json/i).click();
    const jf = await j;
    await ctx.close();
    expect(/\.zip$/.test(zf.suggestedFilename()) && /\.json$/.test(jf.suggestedFilename()), 'downloads wrong');
  });

  await tc('SE-04', 'Restore asks first; invalid file explained in-app (DS-05)', 'P412', async () => {
    const { ctx, page, dialogs } = await open('P412');
    await openSettings(page);
    await page.getByRole('tab', { name: /^advanced$/i }).click();
    const z = page.waitForEvent('download');
    await btn(page, /download \.json/i).click();
    const tmp = path.join(os.tmpdir(), `daymark-backup-${Date.now()}.json`);
    fs.copyFileSync(await (await z).path(), tmp);
    const bad = path.join(os.tmpdir(), `daymark-bad-${Date.now()}.json`);
    fs.writeFileSync(bad, '{"hello":1}');
    await page.getByRole('tab', { name: /backup & restore/i }).click();
    let chooser = page.waitForEvent('filechooser');
    await btn(page, /choose a backup file/i).click();
    await (await chooser).setFiles(tmp);
    const asked = await alertDialog(page).waitFor({ timeout: 5000 }).then(() => true, () => false);
    await alertDialog(page).getByRole('button', { name: /^cancel$/i }).click();
    await openSettings(page);
    chooser = page.waitForEvent('filechooser');
    await btn(page, /choose a backup file/i).click();
    await (await chooser).setFiles(bad);
    await alertDialog(page).waitFor({ timeout: 5000 }).catch(() => {});
    const msg = await alertDialog(page).innerText().catch(() => '');
    await ctx.close();
    expect(asked, 'restore did not ask');
    expect(/isn't a daymark backup/i.test(msg), `invalid file message "${msg}"`);
    expect(dialogs.length === 0, 'browser alert()/confirm() used');
  });

  await tc('SE-05', 'Sample replacement is unavailable while signed in (DS-04)', 'P412', async () => {
    const { ctx, page } = await open('P412', { start: 'empty' });
    await openSettings(page);
    await page.getByRole('tab', { name: /^advanced$/i }).click();
    expect(await btn(page, /replace with sample data/i).isDisabled(), 'sample replacement enabled on synced server');
    await ctx.close();
  });

  await tc('SE-06', 'Statuses: add, save; fits on phones', 'D1440+P412', async () => {
    const { ctx, page } = await open('D1440');
    await openSettings(page);
    await page.getByRole('tab', { name: /statuses/i }).click();
    await page.getByLabel('Status name').fill('Review');
    await btn(page, /^add status$/i).click();
    await btn(page, /save changes/i).click();
    await statusChip(page, T1).click();
    const hasReview = await page.getByRole('menuitem', { name: /^review$/i }).count();
    await ctx.close();
    const p = await open('P412');
    await openSettings(p.page);
    await p.page.getByRole('tab', { name: /statuses/i }).click();
    const over = await p.page.evaluate(() => {
      const d = document.querySelector('[role=dialog]');
      return [...d.querySelectorAll('*')].some((el) => el.getBoundingClientRect().right > innerWidth + 1);
    });
    const jargon = /participates in aging|lifecycle/i.test(await dialog(p.page, 'Settings').innerText());
    await shot(p.page, 'SE-06-statuses-phone');
    await p.ctx.close();
    expect(hasReview > 0, 'new status not available after save');
    expect(!over, 'Statuses tab runs past the right edge on phones');
    expect(!jargon, 'old jargon in Statuses');
  });

  await tc('SE-07', 'Old-task warning thresholds, inline validation', 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    await openSettings(page);
    await page.getByRole('tab', { name: /old-task warnings/i }).click();
    await page.getByLabel(/needs attention after/i).fill('9');
    await page.getByLabel(/urgent after/i).fill('5');
    await btn(page, /save changes/i).click();
    const err = await dialog(page, 'Settings').getByRole('alert').isVisible();
    await page.getByLabel(/needs attention after/i).fill('20');
    await page.getByLabel(/urgent after/i).fill('30');
    await btn(page, /save changes/i).click();
    await page.waitForTimeout(300);
    const t = await visibleText(page);
    await ctx.close();
    expect(err, 'invalid thresholds not explained');
    expect(!/need attention/i.test(t), 'chip still shown after raising thresholds');
  });

  await tc('SE-08', 'Sections add / remove', 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    await openSettings(page);
    await page.getByRole('tab', { name: /^sections$/i }).click();
    await page.getByLabel('New section name').fill('Health');
    await dialog(page, 'Settings').getByRole('button', { name: /^add$/i }).click();
    const listed = await btn(page, /remove section health/i).isVisible();
    await btn(page, /remove section health/i).click();
    const removed = !(await btn(page, /remove section health/i).isVisible());
    await ctx.close();
    expect(listed && removed, `listed ${listed}, removed ${removed}`);
  });

  await tc('SE-09', 'Pretend it is another day (Advanced)', 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    await openSettings(page);
    await page.getByRole('tab', { name: /^advanced$/i }).click();
    await btn(page, /^tomorrow$/i).click();
    await btn(page, /save changes/i).click();
    await page.waitForTimeout(300);
    const h1 = await page.locator('h1').first().innerText();
    await openSettings(page);
    await page.getByRole('tab', { name: /^advanced$/i }).click();
    await btn(page, /use real date/i).click();
    await btn(page, /save changes/i).click();
    await ctx.close();
    expect(/today/i.test(h1), `title "${h1}"`);
  });

  // ---- AX keyboard / dialogs
  await tc('AX-06', 'Dialog semantics, focus, inert background', 'P412', async () => {
    const { ctx, page } = await open('P412');
    const problems = [];
    for (const [name, openFn] of [
      ['New task', () => newTask(page).click()],
      ['Settings', () => openSettings(page)],
      ['Mark done on…', () => openMenuItem(page, T1, /another day/i)],
      ['Task details', () => taskTitle(page, T1).click()],
    ]) {
      await openFn();
      await page.waitForTimeout(300);
      const c = await page.evaluate(() => {
        const d = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].pop();
        return {
          role: !!d,
          modal: d?.getAttribute('aria-modal') === 'true',
          named: !!d?.getAttribute('aria-labelledby'),
          focusInside: d ? d.contains(document.activeElement) : false,
          inert: document.getElementById('root').hasAttribute('inert'),
        };
      });
      for (const [k, ok] of Object.entries(c)) if (!ok) problems.push(`${name}: ${k}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      if (await page.locator('[role=dialog]').count()) problems.push(`${name}: Esc did not close`);
    }
    await ctx.close();
    expect(!problems.length, problems.join('; '));
  });

  await tc('AX-07', 'Keyboard focus visible', 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    const noRing = [];
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      const r = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        const visible = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 && s.outlineColor !== 'rgba(0, 0, 0, 0)') || s.boxShadow !== 'none';
        return visible ? null : (el.getAttribute('aria-label') || el.title || el.textContent || el.tagName).trim().slice(0, 30);
      });
      if (r) noRing.push(r);
    }
    await ctx.close();
    expect(!noRing.length, `${noRing.length}/25 tab stops have no visible focus ring (e.g. ${[...new Set(noRing)].slice(0, 4).join(', ')})`);
  });
}
// ---------------------------------------------------------------- main
try {
  let ready = false;
  for (let i = 0; i < 75; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) { ready = true; break; }
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!ready) throw new Error('production server did not start');
  browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' }));
  await functional();
  let scanData = null;
  if (!skipScans && !only) {
    scanData = await runScans();
    fs.writeFileSync(path.join(OUT, 'scans.json'), JSON.stringify(scanData, null, 1));
  }
  results.push({ id: 'GL-09', title: 'Console clean', env: 'all', status: consoleErrors.length ? 'fail' : 'pass', details: consoleErrors.length ? `${consoleErrors.length} console errors, e.g. ${consoleErrors[0].text}` : '' });
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ ranAt: new Date().toISOString(), results, consoleErrors: consoleErrors.slice(0, 50) }, null, 1));
  const tally = results.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  log('\nSummary:', JSON.stringify(tally));
  process.exitCode = tally.fail ? 1 : 0;
} finally {
  await browser?.close();
  stopServer();
}
