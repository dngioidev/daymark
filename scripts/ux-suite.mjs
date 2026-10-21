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

const require = createRequire(import.meta.url);
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const OUT = path.resolve('docs', 'reports', 'ux-ui');
const SHOTS = path.join(OUT, 'screens');
fs.mkdirSync(SHOTS, { recursive: true });
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1]?.split(',');
const skipScans = process.argv.includes('--skip-scans');

const PORT = 3108;
const BASE = `http://localhost:${PORT}`;
const PASSWORD = 'ux-suite-password';
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

/** Opens the app in a fresh profile. sample: 'sample' | 'empty' | 'none' (leave welcome open). */
async function open(env, { scheme = 'light', start = 'sample', url = BASE } = {}) {
  const ctx = await browser.newContext({ ...ENVS[env], colorScheme: scheme, acceptDownloads: true });
  const page = await ctx.newPage();
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
  if (start === 'sample') await page.getByRole('button', { name: /explore with sample data/i }).click();
  if (start === 'empty') await page.getByRole('button', { name: /start with an empty vault/i }).click();
  await page.waitForTimeout(400);
  return { ctx, page, dialogs };
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
const optionsButton = (page, title) =>
  page.locator('div.group').filter({ hasText: title }).first().locator('button:has(svg.lucide-ellipsis), button:has(svg.lucide-more-horizontal)').first();

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
    const enlarged = /before:-inset/.test(el.className || '');
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
    if (!visible(el) || el.children.length > 0) continue;
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
  welcome: { start: 'none', open: async () => {} },
  today: { open: async () => {} },
  'quick-capture': { open: async (p) => p.getByTitle('Quick Capture').click() },
  'task-status-menu': { open: async (p) => btn(p, /^in progress$/i).first().click() },
  'task-options-menu': { open: async (p) => optionsButton(p, T1).click() },
  'task-details': { open: async (p) => p.getByText('Details').first().click() },
  'historical-modal': { open: async (p) => p.getByText('Other past date').first().click() },
  'history-drawer': { open: async (p) => { await optionsButton(p, T1).click(); await btn(p, /view full history/i).click(); } },
  'markdown-mode': { open: async (p) => btn(p, /^markdown$/i).click() },
  history: { open: async (p) => btn(p, /^history$/i).click() },
  notes: { open: async (p) => btn(p, /^notes$/i).click() },
  'note-editor': { open: async (p) => { await btn(p, /^notes$/i).click(); await p.getByText('Weekly Sprint Sync Notes').click(); } },
  sync: { open: async (p) => btn(p, /^sync$/i).last().click() },
  'settings-backup': { open: async (p) => btn(p, /settings, backup and import/i).click() },
  'settings-statuses': { open: async (p) => { await btn(p, /settings, backup and import/i).click(); await btn(p, /^statuses$/i).click(); } },
};
const DESKTOP_SCREENS = {
  today: { open: async () => {} },
  'split-mode': { open: async (p) => btn(p, /^split$/i).click() },
  'quick-capture': { open: async (p) => btn(p, /quick capture/i).first().click() },
  history: { open: async (p) => btn(p, /^history$/i).click() },
  notes: { open: async (p) => btn(p, /^notes$/i).click() },
  sync: { open: async (p) => btn(p, /^sync$/i).first().click() },
  'settings-backup': { open: async (p) => btn(p, /^settings$/i).click() },
  'settings-statuses': { open: async (p) => { await btn(p, /^settings$/i).click(); await btn(p, /^statuses$/i).click(); } },
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
          return { overflowX: document.documentElement.scrollWidth - innerWidth, offenders: offenders.slice(0, 5), container: document.querySelector('main > div, main')?.getBoundingClientRect().width };
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
async function functional() {
  // ---- GL
  await tc('GL-01', 'First launch shows welcome', 'P412', async () => {
    const { ctx, page } = await open('P412', { start: 'none' });
    const dialog = page.getByRole('dialog', { name: /welcome to daymark/i });
    expect(await dialog.isVisible(), 'welcome dialog not visible');
    const behind = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /settings, backup/i.test(x.getAttribute('aria-label') || ''));
      if (!b) return 'n/a';
      const r = b.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return b.contains(top) ? 'clickable' : 'covered';
    });
    const focusable = await page.evaluate(() => {
      const d = document.querySelector('[role=dialog]');
      const all = [...document.querySelectorAll('button,input,select,textarea,a[href]')];
      return all.filter((el) => !d.contains(el) && !el.closest('[inert]') && el.tabIndex >= 0).length;
    });
    await ctx.close();
    expect(behind !== 'clickable', 'controls behind the welcome dialog are clickable');
    return focusable > 0 ? { status: 'warn', details: `${focusable} controls behind the dialog are still keyboard-focusable (background not inert)` } : '';
  });

  await tc('GL-02', 'Start empty', 'P412', async () => {
    const { ctx, page } = await open('P412', { start: 'empty' });
    const text = await visibleText(page);
    await ctx.close();
    expect(!text.includes(T1), 'sample tasks present');
    expect(/work/i.test(text), 'default sections missing');
  });

  await tc('GL-03', 'Load sample', 'P412', async () => {
    const { ctx, page } = await open('P412');
    const text = await visibleText(page);
    await ctx.close();
    expect(text.includes(T1) && /carried-forward tasks need attention/i.test(text), 'sample tasks or attention banner missing');
  });

  await tc('GL-04', 'Welcome not repeated', 'P412', async () => {
    const { ctx, page } = await open('P412', { start: 'empty' });
    await page.reload({ waitUntil: 'networkidle' });
    const shown = await page.getByRole('dialog', { name: /welcome/i }).isVisible().catch(() => false);
    await ctx.close();
    expect(!shown, 'welcome shown again after reload');
  });

  await tc('GL-05', 'Real date shown', 'P412+D1440', async () => {
    const long = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    for (const env of ['P412', 'D1440']) {
      const { ctx, page } = await open(env);
      const text = await visibleText(page);
      await ctx.close();
      expect(text.includes(long), `${env}: "${long}" not shown`);
    }
  });

  await tc('GL-07', 'Toast behaviour', 'P412', async () => {
    const { ctx, page } = await open('P412', { start: 'empty' });
    await page.getByTitle('Quick Capture').click();
    await page.getByPlaceholder(/what did you work on/i).fill('Toast check');
    await btn(page, /^capture$/i).click();
    const toast = page.getByText(/task added/i);
    await toast.waitFor({ timeout: 3000 });
    const box = await toast.boundingBox();
    const nav = await btn(page, /^today$/i).last().boundingBox();
    const t0 = Date.now();
    await toast.waitFor({ state: 'hidden', timeout: 8000 });
    const shownMs = Date.now() - t0;
    await ctx.close();
    expect(box.y + box.height <= nav.y + 2, 'toast overlaps the bottom navigation');
    return shownMs > 5000 ? { status: 'warn', details: `toast stayed ${Math.round(shownMs / 1000)} s` } : `visible ~${Math.round(shownMs / 1000)} s, above nav`;
  });

  // ---- NAV
  await tc('NAV-01', 'Bottom nav tabs', 'P412', async () => {
    const { ctx, page } = await open('P412');
    const checks = [
      [/^history$/i, /history/i],
      [/^notes$/i, /notes/i],
      [/^sync$/i, /sync with your own server/i],
      [/^today$/i, /tuesday|monday|wednesday|thursday|friday|saturday|sunday/i],
    ];
    for (const [name, expectText] of checks) {
      await btn(page, name).last().click();
      await page.waitForTimeout(300);
      expect(expectText.test(await visibleText(page)), `tab ${name} did not open`);
    }
    const sizes = await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .filter((b) => /^(Today|History|Notes|Sync)$/.test(b.textContent.trim()) && b.closest('[class*="bottom-0"]'))
        .map((b) => Math.round(Math.min(b.offsetWidth, b.offsetHeight)))
    );
    await ctx.close();
    expect(sizes.every((s) => s >= 44), `bottom nav target below 44 px: ${sizes.join(', ')}`);
  });

  await tc('NAV-02', 'Centre + opens Quick Capture with focus', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await page.getByTitle('Quick Capture').click();
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('placeholder') || '');
    await ctx.close();
    expect(/what did you work on/i.test(focused), `focus is on "${focused}"`);
  });

  await tc('NAV-03', 'Header gear opens full-screen Settings', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /settings, backup and import/i).click();
    const box = await page.getByRole('dialog', { name: 'Settings' }).boundingBox();
    await ctx.close();
    expect(box && box.width >= 400 && box.height >= 900, `settings not full screen (${box?.width}x${box?.height})`);
  });

  await tc('NAV-04', 'Header sync pill', 'P412', async () => {
    const { ctx, page } = await open('P412');
    const pill = btn(page, /local only/i);
    expect(await pill.isVisible(), 'sync pill missing');
    const size = await pill.boundingBox();
    await pill.click();
    const opened = /sync with your own server/i.test(await visibleText(page));
    await ctx.close();
    expect(opened, 'pill did not open Sync');
    return size.height < 44 ? { status: 'warn', details: `pill target ${Math.round(size.width)}x${Math.round(size.height)} px` } : '';
  });

  await tc('NAV-05', 'Desktop navbar items', 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    for (const [name, expectText] of [
      [/^history$/i, /daily history/i],
      [/^notes$/i, /new folder/i],
      [/^sync$/i, /sync with your own server/i],
    ]) {
      await btn(page, name).first().click();
      await page.waitForTimeout(300);
      expect(expectText.test(await visibleText(page)), `${name} view not shown`);
    }
    await btn(page, /^settings$/i).click();
    expect(await page.getByRole('dialog', { name: 'Settings' }).isVisible(), 'settings dialog not shown');
    await ctx.close();
  });

  await tc('NAV-06', 'Logo', 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    await btn(page, /^history$/i).first().click();
    await btn(page, /^daymark$/i).click();
    await page.waitForTimeout(300);
    const text = await visibleText(page);
    await ctx.close();
    return /carried-forward/i.test(text) ? '' : { status: 'warn', details: 'logo does not return to Today' };
  });

  await tc('NAV-07', 'Mobile App View and back', 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    await btn(page, /mobile app view/i).click();
    await page.waitForTimeout(300);
    expect(await btn(page, /desktop view/i).isVisible(), 'Desktop View button missing in mobile view');
    await btn(page, /desktop view/i).click();
    await page.waitForTimeout(300);
    const ok = await btn(page, /mobile app view/i).isVisible();
    await ctx.close();
    expect(ok, 'did not return to desktop');
  });

  await tc('NAV-08', 'Export ZIP (navbar)', 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    const dl = page.waitForEvent('download', { timeout: 8000 });
    await btn(page, /export/i).first().click();
    const file = await dl;
    await ctx.close();
    expect(/\.zip$/.test(file.suggestedFilename()), 'no zip');
  });

  await tc('NAV-09', 'Quick Capture via button and Ctrl K', 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    await btn(page, /quick capture/i).first().click();
    expect(await page.getByPlaceholder(/what did you work on/i).isVisible(), 'button did not open');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(200);
    const ok = await page.getByPlaceholder(/what did you work on/i).isVisible();
    await ctx.close();
    expect(ok, 'Ctrl K did not open');
  });

  await tc('NAV-11', 'Deep links', 'P412', async () => {
    const a = await open('P412', { url: `${BASE}/?action=capture`, start: 'empty' });
    const cap = await a.page.getByPlaceholder(/what did you work on/i).isVisible();
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
    const sizes = await page.evaluate(() => ['Previous Day', 'Next Day'].map((n) => document.querySelector(`button[title="${n}"]`)?.getBoundingClientRect().width));
    await ctx.close();
    expect(/yesterday/i.test(y), `previous day title "${y}"`);
    const tomorrowIssue = /tomorrow/i.test(t) ? '' : `next day is titled "${t}" (no "Tomorrow" label)`;
    const sizeIssue = sizes.some((s) => s < 44) ? `day arrows are ${sizes.map(Math.round).join('/')} px wide (< 44)` : '';
    const issues = [tomorrowIssue, sizeIssue].filter(Boolean);
    return issues.length ? { status: 'warn', details: issues.join('; ') } : '';
    return sizes.some((s) => s < 44) ? { status: 'warn', details: `day arrows are ${sizes.map(Math.round).join('/')} px wide (< 44)` } : '';
  });

  await tc('TD-02', 'Today button returns', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /previous day/i).click();
    await btn(page, /^today$/i).first().click();
    const h = await page.locator('h1').first().innerText();
    await ctx.close();
    expect(/today/i.test(h), `title "${h}"`);
  });

  await tc('TD-03', 'View modes', 'P412+D1440', async () => {
    const p = await open('P412');
    expect(!(await btn(p.page, /^split$/i).isVisible().catch(() => false)), 'Split visible on phone');
    await btn(p.page, /^markdown$/i).click();
    expect(await btn(p.page, /apply changes to notebook/i).isVisible(), 'markdown editor not shown');
    await btn(p.page, /^notebook$/i).click();
    expect(await taskCheckbox(p.page, T1).isVisible(), 'notebook not restored');
    await p.ctx.close();
    const d = await open('D1440');
    await btn(d.page, /^split$/i).click();
    const split = /rendered document/i.test(await visibleText(d.page));
    await d.ctx.close();
    expect(split, 'split view not shown on desktop');
  });

  await tc('TD-04', 'Reconcile Rollover', 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    const before = await count(page.getByRole('button', { name: /^Mark ".*" done$/ }));
    await btn(page, /reconcile rollover/i).click();
    await btn(page, /reconcile rollover/i).click();
    await page.waitForTimeout(300);
    const after = await count(page.getByRole('button', { name: /^Mark ".*" done$/ }));
    const toast = /rollover/i.test(await visibleText(page));
    await ctx.close();
    expect(before === after, `task count changed ${before} -> ${after}`);
    expect(toast, 'no feedback toast');
  });

  await tc('TD-05', 'Attention filter toggles', 'P412', async () => {
    const { ctx, page } = await open('P412');
    const all = await count(page.getByRole('button', { name: /^Mark ".*" done$/ }));
    await btn(page, /filter attention tasks/i).click();
    await page.waitForTimeout(200);
    const filtered = await count(page.getByRole('button', { name: /^Mark ".*" done$/ }));
    const toggleLabel = await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /attention|show all/i.test(b.textContent))?.textContent.trim());
    await page.getByRole('button', { name: /show all|filter attention|clear/i }).first().click();
    await page.waitForTimeout(200);
    const restored = await count(page.getByRole('button', { name: /^Mark ".*" done$/ }));
    await ctx.close();
    expect(filtered <= all, 'filter increased tasks');
    expect(restored === all, `toggle back did not restore (${restored}/${all}); button reads "${toggleLabel}"`);
    return `all ${all}, filtered ${filtered}; toggle label "${toggleLabel}"`;
  });

  await tc('TD-06', 'Section + Task inline add', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^task$/i).first().click();
    const input = page.getByPlaceholder(/what needs to be done/i);
    const focused = await input.evaluate((el) => el === document.activeElement);
    // Every control of the inline row (title, status, Add Task) must be on screen
    const rowFits = await page.evaluate(() => {
      const i = document.querySelector('input[placeholder="What needs to be done?"]');
      return [...i.parentElement.children].every((el) => el.getBoundingClientRect().right <= innerWidth);
    });
    expect(rowFits, 'inline add row does not fit on screen (Add Task button off-screen)');
    await btn(page, /^add task$/i).click();
    const emptyAdded = await count(page.getByRole('button', { name: 'Mark "" done' }));
    await input.fill('Inline added task');
    await input.press('Enter');
    await page.waitForTimeout(300);
    const added = await taskCheckbox(page, 'Inline added task').isVisible().catch(() => false);
    const inputWidth = (await input.boundingBox().catch(() => null))?.width;
    await ctx.close();
    expect(emptyAdded === 0, 'empty task was added');
    expect(added, 'task not added with Enter');
    return !focused ? { status: 'warn', details: 'input not focused on open' } : inputWidth && inputWidth < 200 ? { status: 'warn', details: `inline input only ${Math.round(inputWidth)} px wide on phone` } : '';
  });

  await tc('TD-07', 'Section + Note editor and toolbar', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^note$/i).nth(1).click();
    const ta = page.getByPlaceholder(/write rich markdown notes/i);
    await ta.fill('hello');
    await ta.selectText();
    await page.getByTitle('Bold').first().click();
    const v = await ta.inputValue();
    await btn(page, /save section notes/i).click();
    await page.waitForTimeout(300);
    const saved = /hello/.test(await visibleText(page));
    await ctx.close();
    expect(/\*\*hello\*\*/.test(v), `bold toolbar produced "${v}"`);
    expect(saved, 'notes not saved');
  });

  await tc('TD-08', 'Section notes Clear asks first (DS-03)', 'P412', async () => {
    const { ctx, page, dialogs } = await open('P412');
    const clear = btn(page, /^clear$/i).first();
    const has = await clear.isVisible().catch(() => false);
    if (!has) {
      await ctx.close();
      return { status: 'warn', details: 'no Clear button visible on phone' };
    }
    await clear.click();
    await page.waitForTimeout(300);
    const stillThere = /priority today/i.test(await visibleText(page));
    await ctx.close();
    expect(dialogs.length > 0 && stillThere, 'Clear deleted notes without confirmation');
  });

  await tc('TD-09', 'Add section heading', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /add section heading/i).click();
    const input = page.getByPlaceholder(/new section name/i);
    await input.fill('Errands');
    await btn(page, /^add section$/i).click();
    await page.waitForTimeout(200);
    const added = await page.getByRole('heading', { name: 'Errands' }).isVisible().catch(() => false);
    await btn(page, /add section heading/i).click();
    await page.getByPlaceholder(/new section name/i).fill('Errands');
    await btn(page, /^add section$/i).click();
    await page.waitForTimeout(200);
    const dupes = await count(page.getByRole('heading', { name: 'Errands' }));
    await ctx.close();
    expect(added, 'section not added');
    expect(dupes === 1, `duplicate section allowed (${dupes})`);
  });

  await tc('TD-10', 'Empty sections compact', 'P412', async () => {
    const { ctx, page } = await open('P412');
    const h = await page.locator('section').filter({ hasText: 'Meetings' }).first().boundingBox();
    await ctx.close();
    expect(h.height <= 72, `empty section ${Math.round(h.height)} px tall`);
  });

  // ---- TK
  await tc('TK-01', 'Complete / reopen', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await taskCheckbox(page, T1).click();
    await page.waitForTimeout(300);
    const done = await page.getByRole('button', { name: `Mark "${T1}" not done` }).isVisible();
    await page.getByRole('button', { name: `Mark "${T1}" not done` }).click();
    await page.waitForTimeout(300);
    const reopened = await taskCheckbox(page, T1).isVisible();
    await ctx.close();
    expect(done && reopened, 'toggle failed');
  });

  await tc('TK-02', 'Status menu', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^in progress$/i).first().click();
    const items = page.locator('button').filter({ hasText: /carry-forward|keep|archive/ });
    const n = await count(items);
    const boxes = await items.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { h: r.height, right: r.right, bottom: r.bottom }; }));
    const vw = 412;
    await items.filter({ hasText: /^Blocked/ }).first().click();
    await page.waitForTimeout(200);
    const applied = await btn(page, /^blocked$/i).count();
    // outside tap closes
    await btn(page, /^blocked$/i).first().click();
    await page.mouse.click(10, 400);
    await page.waitForTimeout(200);
    const stillOpen = await count(page.locator('button').filter({ hasText: /carry-forward/ }));
    await ctx.close();
    expect(n >= 5, `only ${n} statuses`);
    expect(applied >= 2, 'status not applied');
    const issues = [];
    if (boxes.some((b) => b.h < 44)) issues.push(`menu items ${Math.round(Math.min(...boxes.map((b) => b.h)))} px tall`);
    if (boxes.some((b) => b.right > vw)) issues.push('menu runs off screen');
    if (stillOpen > 0) issues.push('tapping outside does not close the menu');
    return issues.length ? { status: 'warn', details: issues.join('; ') } : '';
  });

  await tc('TK-03', 'Details expand / hide', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await page.getByText('Details').first().click();
    const open1 = await page.getByText(/notes \/ context/i).isVisible();
    await page.getByText('Hide').first().click();
    const closed = !(await page.getByText(/notes \/ context/i).isVisible().catch(() => false));
    const size = await page.getByText('Details').first().boundingBox();
    await ctx.close();
    expect(open1 && closed, 'expand/collapse failed');
    return size.height < 44 ? { status: 'warn', details: `"Details" target ${Math.round(size.width)}x${Math.round(size.height)} px` } : '';
  });

  await tc('TK-04', 'Edit description persists', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await page.getByText('Details').first().click();
    const ta = page.locator('textarea').first();
    await ta.fill('Edited context');
    await ta.blur();
    await page.waitForTimeout(300);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('Details').first().click();
    const v = await page.locator('textarea').first().inputValue();
    await ctx.close();
    expect(v === 'Edited context', `after reload: "${v.slice(0, 40)}"`);
  });

  await tc('TK-05', 'Checklist add / toggle / delete', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await page.getByText('Details').first().click();
    await btn(page, /^add$/i).first().click();
    const emptyItems = await page.evaluate(() => document.querySelectorAll('.group\\/item').length);
    await page.getByPlaceholder(/add subtask/i).fill('Sub one');
    await btn(page, /^add$/i).first().click();
    await page.waitForTimeout(200);
    const listed = await page.getByText('Sub one').isVisible();
    const delVisible = await page.evaluate(() => {
      const row = [...document.querySelectorAll('.group\\/item')].find((r) => r.textContent.includes('Sub one'));
      const del = row?.querySelectorAll('button')[1];
      return del ? Number(getComputedStyle(del).opacity) : -1;
    });
    await ctx.close();
    expect(emptyItems === 0, 'empty subtask added');
    expect(listed, 'subtask not added');
    return delVisible < 0.5 ? { status: 'warn', details: 'subtask delete button is invisible until mouse hover (unreachable on touch)' } : '';
  });

  await tc('TK-06', 'Inspect audit log drawer', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await page.getByText('Details').first().click();
    await btn(page, /inspect audit log/i).click();
    await page.waitForTimeout(300);
    const text = await visibleText(page);
    const closeBtn = page.locator('div.fixed.inset-0 button').first();
    const named = await closeBtn.evaluate((b) => !!(b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent.trim()));
    await closeBtn.click();
    await page.waitForTimeout(300);
    const closed = !(await page.locator('div.fixed.inset-0').isVisible().catch(() => false));
    await ctx.close();
    expect(/history|audit|carried/i.test(text), 'drawer content missing');
    expect(closed, 'drawer did not close');
    return named ? '' : { status: 'warn', details: 'drawer close button has no accessible name' };
  });

  await tc('TK-07', 'Snooze alert and restore', 'P412', async () => {
    const { ctx, page } = await open('P412');
    const banner = async () => (await visibleText(page)).match(/(\d+) carried-forward tasks need attention/)?.[1];
    const b0 = await banner();
    await page.getByText('Details').first().click();
    await btn(page, /snooze alert/i).click();
    await page.waitForTimeout(300);
    const b1 = await banner();
    await btn(page, /restore alert/i).click().catch(() => {});
    await page.waitForTimeout(300);
    const b2 = await banner();
    await ctx.close();
    expect(Number(b1) === Number(b0) - 1, `banner ${b0} -> ${b1} after snooze`);
    expect(b2 === b0, `banner not restored (${b2})`);
  });

  await tc('TK-08', 'Delete from details asks first (DS-01)', 'P412', async () => {
    const { ctx, page, dialogs } = await open('P412');
    await page.getByText('Details').first().click();
    await btn(page, /^delete$/i).first().click();
    await page.waitForTimeout(200);
    const kept = await taskCheckbox(page, T1).isVisible();
    page.dialogPolicy = 'accept';
    await btn(page, /^delete$/i).first().click();
    await page.waitForTimeout(300);
    const gone = !(await taskCheckbox(page, T1).isVisible().catch(() => false));
    await ctx.close();
    expect(dialogs.length >= 1 && kept, 'no confirmation / deleted on cancel');
    expect(gone, 'not deleted after confirm');
  });

  await tc('TK-09', 'Options menu visible on touch for every task', 'P412', async () => {
    const { ctx, page } = await open('P412');
    const info = await page.evaluate(() =>
      [...document.querySelectorAll('button')].filter((b) => b.querySelector('svg.lucide-ellipsis, svg.lucide-more-horizontal')).map((b) => {
        const r = b.getBoundingClientRect();
        return { opacity: Number(getComputedStyle(b).opacity), w: r.width, h: r.height, named: !!(b.getAttribute('aria-label') || b.title) };
      })
    );
    await optionsButton(page, T1).click();
    const items = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => /Rename Task|View Full History|Historical Done|Delete Task/.test(t)));
    await ctx.close();
    expect(info.length >= 4 && info.every((i) => i.opacity > 0.5), 'options button hidden for some tasks');
    expect(items.length === 4, `menu items: ${items.join(', ')}`);
    const issues = [];
    if (info.some((i) => !i.named)) issues.push('"…" button has no accessible name');
    if (info.some((i) => i.w < 44)) issues.push(`"…" target ${Math.round(info[0].w)} px`);
    return issues.length ? { status: 'warn', details: issues.join('; ') } : '';
  });

  await tc('TK-10', 'Rename task', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await optionsButton(page, T1).click();
    await btn(page, /rename task/i).click();
    const input = await page.locator(`input[value="${T1}"]`).elementHandle({ timeout: 3000 }).catch(() => null);
    expect(input, 'rename input not shown');
    await input.fill('Renamed task');
    await input.press('Enter');
    await page.waitForTimeout(300);
    const ok = await taskCheckbox(page, 'Renamed task').isVisible();
    await ctx.close();
    expect(ok, 'rename not applied');
  });

  await tc('TK-11', 'Quick "Done on <date>"', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await page.getByRole('button', { name: /done on/i }).first().click();
    await page.waitForTimeout(400);
    const gone = !(await taskCheckbox(page, T1).isVisible().catch(() => false));
    const toast = /marked .* done on/i.test(await visibleText(page));
    await ctx.close();
    expect(gone, 'task still in today');
    expect(toast, 'no confirmation toast');
  });

  await tc('TK-12', 'Other past date modal', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await page.getByText('Other past date').first().click();
    const modal = page.locator('div.fixed.inset-0').last();
    const box = await modal.locator('> div').first().boundingBox();
    await btn(page, /^cancel$/i).last().click();
    await page.waitForTimeout(200);
    const cancelled = await taskCheckbox(page, T1).isVisible();
    await page.getByText('Other past date').first().click();
    await btn(page, /2 days ago/i).click();
    await btn(page, /^record done/i).click();
    await page.waitForTimeout(300);
    const recorded = !(await taskCheckbox(page, T1).isVisible().catch(() => false));
    await ctx.close();
    expect(box.width <= 412, 'modal wider than screen');
    expect(cancelled, 'cancel changed data');
    expect(recorded, 'record did not move completion');
  });

  await tc('TK-13', 'Aging badges', 'P412', async () => {
    const { ctx, page } = await open('P412');
    const text = await visibleText(page);
    await ctx.close();
    expect(/carried forward · \d+ days/i.test(text.replace(/\s+/g, ' ')), 'no aging badge text');
  });

  await tc('TK-14', 'Long title wraps on 360 px', 'P360', async () => {
    const { ctx, page } = await open('P360', { start: 'empty' });
    await page.getByTitle('Quick Capture').click();
    const long = 'A very long task title that keeps going to check wrapping behaviour on small phones without breaking the layout or hiding actions';
    await page.getByPlaceholder(/what did you work on/i).fill(long);
    await btn(page, /^capture$/i).click();
    await page.waitForTimeout(400);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    const cb = await taskCheckbox(page, long).isVisible();
    await shot(page, 'TK-14-long-title-360');
    await ctx.close();
    expect(over <= 0, `horizontal overflow ${over}px`);
    expect(cb, 'task actions not visible');
  });

  // ---- QC
  await tc('QC-01', 'Quick Capture layout and labels', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await page.getByTitle('Quick Capture').click();
    const box = await page.getByPlaceholder(/what did you work on/i).boundingBox();
    const unlabeled = await page.evaluate(() =>
      [...document.querySelectorAll('.fixed input, .fixed textarea, .fixed select')].filter((e) => !(e.labels?.length || e.getAttribute('aria-label'))).length
    );
    const closeNamed = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.fixed button')].find((x) => x.querySelector('svg.lucide-x'));
      return b ? !!(b.getAttribute('aria-label') || b.title) : true;
    });
    await ctx.close();
    expect(box.y < 300, `title field at y=${Math.round(box.y)} (keyboard may cover)`);
    const issues = [];
    if (unlabeled) issues.push(`${unlabeled} fields without an accessible label`);
    if (!closeNamed) issues.push('close (X) button has no accessible name');
    return issues.length ? { status: 'warn', details: issues.join('; ') } : '';
  });

  await tc('QC-02', 'Capture with Enter and button', 'P412', async () => {
    const { ctx, page } = await open('P412', { start: 'empty' });
    await page.getByTitle('Quick Capture').click();
    await page.getByPlaceholder(/what did you work on/i).fill('By enter');
    await page.getByPlaceholder(/what did you work on/i).press('Enter');
    await page.waitForTimeout(300);
    await page.getByTitle('Quick Capture').click();
    await page.getByPlaceholder(/what did you work on/i).fill('By button');
    await btn(page, /^capture$/i).click();
    await page.waitForTimeout(300);
    const a = await taskCheckbox(page, 'By enter').isVisible();
    const b = await taskCheckbox(page, 'By button').isVisible();
    await ctx.close();
    expect(a && b, `enter ${a}, button ${b}`);
  });

  await tc('QC-03', 'Empty title rejected with feedback', 'P412', async () => {
    const { ctx, page } = await open('P412', { start: 'empty' });
    await page.getByTitle('Quick Capture').click();
    await btn(page, /^capture$/i).click();
    await page.waitForTimeout(300);
    const added = await count(page.getByRole('button', { name: /^Mark ".*" done$/ }));
    const stillOpen = await page.getByPlaceholder(/what did you work on/i).isVisible();
    const disabled = await btn(page, /^capture$/i).isDisabled().catch(() => false);
    const feedback = await page.evaluate(() => {
      const i = document.querySelector('input[placeholder*="What did you work on"]');
      return i ? !i.checkValidity() || i.getAttribute('aria-invalid') === 'true' : false;
    });
    await ctx.close();
    expect(added === 0, 'empty task added');
    return !disabled && !feedback && stillOpen ? { status: 'warn', details: 'nothing happens and no message explains why' } : '';
  });

  await tc('QC-04', 'Heading and status selects', 'P412', async () => {
    const { ctx, page } = await open('P412', { start: 'empty' });
    await page.getByTitle('Quick Capture').click();
    await page.getByPlaceholder(/what did you work on/i).fill('Idea task');
    const selects = page.locator('.fixed select');
    await selects.nth(0).selectOption({ label: '#Ideas' });
    await selects.nth(1).selectOption({ label: 'Blocked' });
    await btn(page, /^capture$/i).click();
    await page.waitForTimeout(300);
    const inIdeas = await page.locator('section').filter({ hasText: 'Ideas' }).filter({ hasText: 'Idea task' }).count();
    const blocked = await btn(page, /^blocked$/i).count();
    await ctx.close();
    expect(inIdeas >= 1, 'not in Ideas');
    expect(blocked >= 1, 'status not Blocked');
  });

  await tc('QC-05', 'Close via Cancel / X / Esc / backdrop', 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    const openQc = async () => {
      await btn(page, /quick capture/i).first().click();
      await page.getByPlaceholder(/what did you work on/i).waitFor();
    };
    const closed = async () => !(await page.getByPlaceholder(/what did you work on/i).isVisible().catch(() => false));
    const res = {};
    await openQc();
    await btn(page, /^cancel$/i).click();
    res.cancel = await closed();
    await openQc();
    await page.locator('.fixed button:has(svg.lucide-x)').first().click();
    res.x = await closed();
    await openQc();
    await page.keyboard.press('Escape');
    res.esc = await closed();
    await openQc();
    await page.mouse.click(5, 5);
    await page.waitForTimeout(200);
    res.backdrop = await closed();
    await ctx.close();
    const failed = Object.entries(res).filter(([, v]) => !v).map(([k]) => k);
    expect(res.cancel && res.x && res.esc, `not closed by: ${failed.join(', ')}`);
    return res.backdrop ? '' : { status: 'warn', details: 'tapping the backdrop does not close' };
  });

  // ---- HI
  await tc('HI-01', 'History opens on the latest note', 'P412+D1440', async () => {
    for (const env of ['P412', 'D1440']) {
      const { ctx, page } = await open(env);
      await btn(page, /^history$/i).last().click();
      await page.waitForTimeout(300);
      const t = await visibleText(page);
      await ctx.close();
      expect(!/no daily document exists/i.test(t), `${env}: empty day shown`);
    }
  });

  await tc('HI-02', 'Calendar day select', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^history$/i).last().click();
    await btn(page, /^15$/).first().click();
    await page.waitForTimeout(200);
    const t15 = await visibleText(page);
    await btn(page, /^3$/).first().click();
    await page.waitForTimeout(200);
    const t3 = await visibleText(page);
    await ctx.close();
    expect(/october 15/i.test(t15), 'Oct 15 not shown');
    return /no daily document exists/i.test(t3) ? { status: 'warn', details: 'empty day says "No daily document exists for 2026-10-03" (technical wording, no action offered)' } : '';
  });

  await tc('HI-03', 'Month navigation', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^history$/i).last().click();
    const navBtns = page.locator('button:has(svg.lucide-chevron-left), button:has(svg.lucide-chevron-right)');
    const info = await navBtns.evaluateAll((els) => els.map((b) => ({ named: !!(b.getAttribute('aria-label') || b.title), w: b.getBoundingClientRect().width })));
    const before = await visibleText(page);
    await navBtns.first().click();
    await page.waitForTimeout(200);
    const after = await visibleText(page);
    await ctx.close();
    expect(/september 2026/i.test(after) || before !== after, 'month did not change');
    const issues = [];
    if (info.some((i) => !i.named)) issues.push('month arrows have no accessible name');
    if (info.some((i) => i.w < 44)) issues.push(`month arrows ${Math.round(Math.min(...info.map((i) => i.w)))} px wide`);
    return issues.length ? { status: 'warn', details: issues.join('; ') } : '';
  });

  await tc('HI-04', 'Recorded notes list', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^history$/i).last().click();
    await page.getByRole('button', { name: /2026-10-14/ }).click();
    await page.waitForTimeout(200);
    const t = await visibleText(page);
    await ctx.close();
    expect(/october 14/i.test(t), 'list row did not open day');
  });

  // ---- NO
  await tc('NO-01', 'Notes list', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^notes$/i).last().click();
    const t = await visibleText(page);
    await ctx.close();
    expect(/4 notes/i.test(t), 'count missing');
    expect(/architecture decision/i.test(t.split('\n').slice(0, 30).join('\n')), 'pinned note not first');
  });

  await tc('NO-02', 'Search and empty result', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^notes$/i).last().click();
    await page.getByPlaceholder(/search notes/i).fill('reading');
    await page.waitForTimeout(200);
    const one = /1 notes|1 note/i.test(await visibleText(page));
    await page.getByPlaceholder(/search notes/i).fill('zzzzqq');
    await page.waitForTimeout(200);
    const empty = await visibleText(page);
    await ctx.close();
    expect(one, 'search did not filter to 1');
    const grammar = /\b1 notes\b/.test(empty) || /\b0 notes\b/.test(empty) ? '' : '';
    return /no notes|nothing|no match/i.test(empty) ? (/(^|\s)1 notes/.test(empty) ? { status: 'warn', details: '"1 notes" plural' } : grammar) : { status: 'warn', details: 'no empty-state message for a search with no results' };
  });

  await tc('NO-03', 'Folder chips', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^notes$/i).last().click();
    await btn(page, /^personal$/i).click();
    const t = await visibleText(page);
    const h = (await btn(page, /^personal$/i).boundingBox()).height;
    await ctx.close();
    expect(/reading list/i.test(t) && !/sprint sync/i.test(t), 'filter wrong');
    return h < 44 ? { status: 'warn', details: `folder chips ${Math.round(h)} px tall` } : '';
  });

  await tc('NO-04', 'New note opens editor with title focused', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^notes$/i).last().click();
    await btn(page, /new note/i).click();
    await page.waitForTimeout(300);
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('placeholder') || document.activeElement?.tagName);
    const editor = await page.locator('textarea').isVisible();
    await ctx.close();
    expect(editor, 'editor not open');
    return /note title/i.test(focused || '') ? '' : { status: 'warn', details: `focus on ${focused}, not the title` };
  });

  await tc('NO-05', 'Edit title / folder / body persists', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^notes$/i).last().click();
    await page.getByText('Weekly Sprint Sync Notes').click();
    await page.getByPlaceholder(/note title/i).fill('Renamed note');
    await page.locator('textarea').fill('Body text');
    await btn(page, /^notes$/i).first().click();
    await page.waitForTimeout(300);
    await page.reload({ waitUntil: 'networkidle' });
    await btn(page, /^notes$/i).last().click();
    const t = await visibleText(page);
    await ctx.close();
    expect(/renamed note/i.test(t) && /body text/i.test(t), 'edits not persisted');
  });

  await tc('NO-06', 'Note toolbar inserts Markdown', 'P412+D1440', async () => {
    const out = [];
    for (const env of ['P412', 'D1440']) {
      const { ctx, page } = await open(env);
      await btn(page, /^notes$/i).last().click();
      if (env === 'P412') await page.getByText('Weekly Sprint Sync Notes').click();
      const ta = page.locator('textarea').first();
      await ta.fill('word');
      await ta.selectText();
      await page.getByTitle('Bold').first().click();
      out.push(`${env}:${await ta.inputValue()}`);
      await ctx.close();
    }
    expect(out.every((v) => v.includes('**word**')), out.join(' | '));
  });

  await tc('NO-07', 'Preview modes', 'P412+D1440', async () => {
    const p = await open('P412');
    await btn(p.page, /^notes$/i).last().click();
    await p.page.getByText('Weekly Sprint Sync Notes').click();
    await btn(p.page, /^preview$/i).click();
    const rendered = await p.page.locator('h1, h2').filter({ hasText: /attendees|weekly sprint/i }).count();
    await p.ctx.close();
    const d = await open('D1440');
    await btn(d.page, /^notes$/i).first().click();
    await d.page.getByTitle('Rendered preview').click();
    const r2 = await d.page.locator('textarea').isVisible().catch(() => false);
    await d.ctx.close();
    expect(rendered > 0, 'phone preview not rendered');
    expect(!r2, 'desktop preview still shows editor');
  });

  await tc('NO-08', 'Pin note', 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    await btn(page, /^notes$/i).first().click();
    await page.getByText('Weekly Sprint Sync Notes').first().click();
    await page.getByTitle(/pin note/i).click();
    await page.waitForTimeout(200);
    const firstTwo = (await page.locator('button').filter({ hasText: /10\/1\d\/2026/ }).allInnerTexts()).slice(0, 2).join(' ');
    await ctx.close();
    expect(/weekly sprint/i.test(firstTwo), 'pinned note not moved to the top');
  });

  await tc('NO-09', 'Delete note asks first (DS-02)', 'P412', async () => {
    const { ctx, page, dialogs } = await open('P412');
    await btn(page, /^notes$/i).last().click();
    await page.getByText('Weekly Sprint Sync Notes').click();
    await page.getByTitle(/delete note/i).first().click();
    await page.waitForTimeout(200);
    const kept = await page.locator('textarea').isVisible();
    await ctx.close();
    expect(dialogs.length >= 1 && kept, 'deleted without confirmation');
  });

  await tc('NO-10', 'New folder', 'D1440', async () => {
    const { ctx, page, dialogs } = await open('D1440');
    await btn(page, /^notes$/i).first().click();
    await btn(page, /new folder/i).click();
    await page.getByPlaceholder(/folder name/i).fill('Projects');
    await page.getByPlaceholder(/folder name/i).press('Enter');
    await page.waitForTimeout(300);
    const t = await visibleText(page);
    await ctx.close();
    expect(/projects/i.test(t), 'folder not created');
    expect(dialogs.length === 0, 'unexpected browser dialog');
  });

  await tc('NO-11', 'Back to list', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^notes$/i).last().click();
    await page.getByText('Weekly Sprint Sync Notes').click();
    const back = btn(page, /^notes$/i).first();
    const box = await back.boundingBox();
    await back.click();
    const list = /new note/i.test(await visibleText(page));
    await ctx.close();
    expect(list, 'did not return');
    return box.height < 44 ? { status: 'warn', details: `back link ${Math.round(box.width)}x${Math.round(box.height)} px` } : '';
  });

  // ---- SY
  const syncForm = async (page, url, pass) => {
    await page.getByLabel('Server address').fill(url);
    await page.getByLabel('Password').fill(pass);
    await btn(page, /connect and sync/i).click();
  };
  await tc('SY-01', 'Sync form labels and input types', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^sync$/i).last().click();
    const types = await page.evaluate(() => [...document.querySelectorAll('form input')].map((i) => `${i.type}/${i.inputMode || '-'}`));
    const device = await page.getByLabel('Name for this device').inputValue();
    await ctx.close();
    expect(types[0].includes('url') || types[0].includes('/url'), `address input ${types[0]}`);
    expect(types.some((t) => t.startsWith('password')), 'password not masked');
    expect(device.length > 0, 'device name empty');
  });

  await tc('SY-02', 'Unreachable server', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^sync$/i).last().click();
    await syncForm(page, 'http://127.0.0.1:9', 'whatever1');
    await page.getByRole('alert').waitFor({ timeout: 8000 });
    const msg = await page.getByRole('alert').innerText();
    const kept = await page.getByLabel('Server address').inputValue();
    await ctx.close();
    expect(/cannot reach/i.test(msg), `message "${msg}"`);
    expect(kept.includes('127.0.0.1'), 'form cleared');
  });

  await tc('SY-03', 'Wrong password', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^sync$/i).last().click();
    await syncForm(page, BASE, 'wrong-password');
    await page.getByRole('alert').waitFor({ timeout: 8000 });
    const msg = await page.getByRole('alert').innerText();
    await ctx.close();
    expect(/wrong username or password/i.test(msg), `message "${msg}"`);
  });

  await tc('SY-04', 'Connect, status pill, Sync now', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /^sync$/i).last().click();
    await syncForm(page, BASE, PASSWORD);
    await page.getByText(/up to date/i).first().waitFor({ timeout: 15000 });
    const pill = await btn(page, /synced/i).first().isVisible();
    await btn(page, /sync now/i).click();
    await page.getByText(/up to date/i).first().waitFor({ timeout: 15000 });
    await ctx.close();
    expect(pill, 'header pill not "Synced"');
  });

  await tc('SY-05', 'Server view: devices, activity, password validation', 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    await btn(page, /^sync$/i).first().click();
    await syncForm(page, BASE, PASSWORD);
    await page.getByText(/connected devices/i).waitFor({ timeout: 15000 });
    await page.getByPlaceholder(/current password/i).fill('nope-wrong');
    await page.getByPlaceholder(/new password/i).fill('newpassword123');
    await btn(page, /change password/i).click();
    await page.waitForTimeout(800);
    const t = await visibleText(page);
    await shot(page, 'SY-05-server-view');
    await ctx.close();
    expect(/recent activity/i.test(t) && /this device/i.test(t), 'devices/activity missing');
    expect(/current password is wrong/i.test(t), 'wrong current password not reported');
  });

  await tc('SY-06', 'Disconnect this device asks first (DS-06)', 'P412', async () => {
    const { ctx, page, dialogs } = await open('P412');
    await btn(page, /^sync$/i).last().click();
    await syncForm(page, BASE, PASSWORD);
    await page.getByText(/up to date/i).first().waitFor({ timeout: 15000 });
    await btn(page, /disconnect this device/i).click();
    await page.waitForTimeout(300);
    const still = await btn(page, /sync now/i).isVisible();
    await ctx.close();
    expect(dialogs.length >= 1 && still, 'disconnected without confirmation');
  });

  // ---- SE
  await tc('SE-01', 'Settings tabs', 'P412+D1440', async () => {
    for (const env of ['P412', 'D1440']) {
      const { ctx, page } = await open(env);
      await (env === 'P412' ? btn(page, /settings, backup and import/i) : btn(page, /^settings$/i)).click();
      for (const tab of ['Backup & restore', 'Sync', 'Statuses', 'Aging alerts', 'Headings', 'Developer']) {
        const t = page.getByRole('button', { name: tab, exact: true }).last();
        expect(await t.isVisible(), `${env}: tab ${tab} not visible`);
        await t.click();
        expect((await t.getAttribute('aria-pressed')) === 'true', `${env}: ${tab} not marked active`);
      }
      await ctx.close();
    }
  });

  await tc('SE-02', 'Close settings (X, Done, Esc)', 'P412+D1440', async () => {
    const { ctx, page } = await open('D1440');
    const openS = () => btn(page, /^settings$/i).click();
    const isOpen = () => page.getByRole('dialog', { name: 'Settings' }).isVisible().catch(() => false);
    await openS();
    await btn(page, /close settings/i).click();
    const x = !(await isOpen());
    await openS();
    await btn(page, /^done$/i).click();
    const done = !(await isOpen());
    await openS();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const esc = !(await isOpen());
    await ctx.close();
    expect(x && done, `X ${x}, Done ${done}`);
    return esc ? '' : { status: 'warn', details: 'Esc does not close Settings' };
  });

  await tc('SE-03', 'Download Vault ZIP and JSON', 'P412', async () => {
    const { ctx, page } = await open('P412');
    await btn(page, /settings, backup and import/i).click();
    const z = page.waitForEvent('download', { timeout: 8000 });
    await btn(page, /download vault zip/i).click();
    const zf = await z;
    const j = page.waitForEvent('download', { timeout: 8000 });
    await btn(page, /download json backup/i).click();
    const jf = await j;
    await ctx.close();
    expect(/\.zip$/.test(zf.suggestedFilename()) && /\.json$/.test(jf.suggestedFilename()), 'downloads wrong');
  });

  await tc('SE-04', 'Restore JSON / ZIP / invalid file (DS-05)', 'P412', async () => {
    const { ctx, page, dialogs } = await open('P412');
    await btn(page, /settings, backup and import/i).click();
    const z = page.waitForEvent('download');
    await btn(page, /download json backup/i).click();
    const jsonPath = await (await z).path();
    const tmp = path.join(os.tmpdir(), `daymark-backup-${Date.now()}.json`);
    fs.copyFileSync(jsonPath, tmp);
    const bad = path.join(os.tmpdir(), `daymark-bad-${Date.now()}.json`);
    fs.writeFileSync(bad, '{"hello":1}');
    // cancelled confirm keeps data
    let chooser = page.waitForEvent('filechooser');
    await btn(page, /select file/i).click();
    await (await chooser).setFiles(tmp);
    await page.waitForTimeout(500);
    const confirmAsked = dialogs.some((d) => /replace/i.test(d.message));
    // invalid file
    await btn(page, /settings, backup and import/i).click().catch(() => {});
    await btn(page, /^backup & restore$/i).click().catch(() => {});
    chooser = page.waitForEvent('filechooser');
    await btn(page, /select file/i).click();
    await (await chooser).setFiles(bad);
    await page.waitForTimeout(500);
    const invalidMsg = dialogs.find((d) => /invalid|error/i.test(d.message))?.message;
    await ctx.close();
    expect(confirmAsked, 'restoring over a non-empty vault did not ask');
    expect(!!invalidMsg, 'invalid file not explained');
    return { status: 'warn', details: `messages use browser alert()/confirm() ("${invalidMsg}")` };
  });

  await tc('SE-05', 'Replace with sample asks first (DS-04)', 'P412', async () => {
    const { ctx, page, dialogs } = await open('P412', { start: 'empty' });
    await page.getByTitle('Quick Capture').click();
    await page.getByPlaceholder(/what did you work on/i).fill('My own task');
    await btn(page, /^capture$/i).click();
    await btn(page, /settings, backup and import/i).click();
    await btn(page, /^replace$/i).click();
    await page.waitForTimeout(300);
    await btn(page, /^done$/i).click();
    const kept = await taskCheckbox(page, 'My own task').isVisible();
    await ctx.close();
    expect(dialogs.some((d) => /replace all/i.test(d.message)) && kept, 'no clear confirmation or data replaced on cancel');
  });

  await tc('SE-06', 'Statuses: change, add, save, cancel', 'D1440+P412', async () => {
    const { ctx, page } = await open('D1440');
    await btn(page, /^settings$/i).click();
    await btn(page, /^statuses$/i).click();
    await page.getByPlaceholder(/new status name/i).fill('Review');
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: /^add/i }).first().click();
    await btn(page, /save changes/i).click();
    await btn(page, /^in progress$/i).first().click();
    const hasReview = await page.locator('button').filter({ hasText: /^Review/ }).count();
    await ctx.close();
    const p = await open('P412');
    await btn(p.page, /settings, backup and import/i).click();
    await btn(p.page, /^statuses$/i).click();
    const over = await p.page.evaluate(() => {
      const d = document.querySelector('[role=dialog]');
      return [...d.querySelectorAll('*')].some((el) => el.getBoundingClientRect().right > innerWidth + 1);
    });
    await shot(p.page, 'SE-06-statuses-phone');
    await p.ctx.close();
    expect(hasReview > 0, 'new status not available after save');
    return over ? { status: 'warn', details: 'Statuses tab content runs past the right edge on phones (add-status row clipped)' } : '';
  });

  await tc('SE-07', 'Aging thresholds', 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    await btn(page, /^settings$/i).click();
    await btn(page, /^aging alerts$/i).click();
    const inputs = page.getByRole('dialog', { name: 'Settings' }).locator('input[type=number]');
    const n = await inputs.count();
    if (n >= 2) {
      await inputs.nth(1).fill('30');
      await inputs.nth(0).fill('20');
    }
    await btn(page, /save changes/i).click();
    await page.waitForTimeout(300);
    const t = await visibleText(page);
    await ctx.close();
    expect(n >= 2, 'threshold inputs not found');
    expect(!/carried-forward tasks need attention/i.test(t), 'banner still shown after raising thresholds');
  });

  await tc('SE-08', 'Headings add / remove', 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    await btn(page, /^settings$/i).click();
    await btn(page, /^headings$/i).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await dialog.locator('input[type=text]').last().fill('Health');
    await btn(page, /add heading/i).click();
    const listed = /health/i.test(await dialog.innerText());
    await ctx.close();
    expect(listed, 'heading not listed');
  });

  await tc('SE-09', 'Developer date override', 'D1440', async () => {
    const { ctx, page } = await open('D1440');
    await btn(page, /^settings$/i).click();
    await btn(page, /^developer$/i).click();
    await btn(page, /real today \+1 day/i).click();
    await btn(page, /save changes/i).click();
    await page.waitForTimeout(300);
    const h1 = await page.locator('h1').first().innerText();
    await btn(page, /^settings$/i).click();
    await btn(page, /^developer$/i).click();
    await btn(page, /use real date/i).click();
    await btn(page, /save changes/i).click();
    await ctx.close();
    expect(/today/i.test(h1), `title "${h1}"`);
  });

  // ---- AX keyboard / dialogs
  await tc('AX-06', 'Dialog semantics, focus, inert background', 'P412', async () => {
    const { ctx, page } = await open('P412');
    const checks = {};
    for (const [name, openFn] of [
      ['Quick Capture', () => page.getByTitle('Quick Capture').click()],
      ['Settings', () => btn(page, /settings, backup and import/i).click()],
      ['Other past date', () => page.getByText('Other past date').first().click()],
    ]) {
      await openFn();
      await page.waitForTimeout(300);
      checks[name] = await page.evaluate(() => {
        const overlays = [...document.querySelectorAll('.fixed.inset-0')];
        const top = overlays[overlays.length - 1];
        const dialog = top?.querySelector('[role=dialog]') || (top?.getAttribute('role') === 'dialog' ? top : null);
        return {
          role: !!dialog,
          focusInside: top ? top.contains(document.activeElement) : false,
          inert: [...document.querySelectorAll('button')].filter((b) => !top.contains(b) && !b.closest('[inert],[aria-hidden=true]')).length === 0,
        };
      });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      await page.reload({ waitUntil: 'networkidle' });
    }
    await ctx.close();
    const problems = Object.entries(checks).flatMap(([n, c]) => [!c.role && `${n}: no role=dialog`, !c.focusInside && `${n}: focus not moved into dialog`, !c.inert && `${n}: background not inert`].filter(Boolean));
    return problems.length ? { status: 'warn', details: problems.join('; ') } : '';
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
        const visible = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
        return visible ? null : (el.getAttribute('aria-label') || el.title || el.textContent || el.tagName).trim().slice(0, 30);
      });
      if (r) noRing.push(r);
    }
    await ctx.close();
    return noRing.length ? { status: 'warn', details: `${noRing.length}/25 tab stops have no visible focus ring (e.g. ${[...new Set(noRing)].slice(0, 4).join(', ')})` } : '';
  });
}

// ---------------------------------------------------------------- main
try {
  for (let i = 0; i < 75; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
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
} finally {
  await browser?.close();
  stopServer();
}
