#!/usr/bin/env node
/**
 * Captures every main screen (phone 412x915 and desktop 1440x900, light and dark) with the
 * sample vault, for UI/UX review. Output: docs/releases/<cycle>/audit/<scheme>-<viewport>-<screen>.png
 *
 * Usage: npm run build && node scripts/ux-audit.mjs cycle-4 [--only=phone|desktop] [--scheme=light|dark]
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { signIn, resetServerVault, seedSample } from './helpers/server-session.mjs';

const cycle = process.argv[2] || 'cycle-4';
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];
const schemeArg = (process.argv.find((a) => a.startsWith('--scheme=')) || '').split('=')[1];
const outDir = path.resolve('docs', 'releases', cycle, 'audit');
fs.mkdirSync(outDir, { recursive: true });
const PORT = 3106;
const base = `http://localhost:${PORT}`;

const server = spawn('npx', ['tsx', 'server.ts', '--production'], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-audit-')), DAYMARK_PASSWORD: 'audit-password-1' },
  shell: true,
  stdio: 'ignore',
});
const killServer = () =>
  process.platform === 'win32' ? spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' }) : server.kill();

async function waitForServer() {
  for (let i = 0; i < 75; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('server did not start');
}

const tryClick = async (locator) => {
  await locator.first().click({ timeout: 10000 });
  return true;
};

const PHONE = [
  ['today', async () => {}],
  ['today-scrolled', async (p) => p.mouse.wheel(0, 1400)],
  ['quick-capture', async (p) => tryClick(p.getByRole('button', { name: /^new task$/i }))],
  ['task-details', async (p) => tryClick(p.getByRole('button', { name: 'Investigate build pipeline failure', exact: true }))],
  ['history', async (p) => tryClick(p.getByRole('button', { name: /^\s*history\s*$/i }))],
  ['notes', async (p) => tryClick(p.getByRole('button', { name: /^\s*notes\s*$/i }))],
  ['note-editor', async (p) => (await tryClick(p.getByRole('button', { name: /^\s*notes\s*$/i }))) && tryClick(p.getByText('Weekly Sprint Sync Notes'))],
  ['sync', async (p) => tryClick(p.getByRole('button', { name: /open sync settings/i }))],
  ['settings', async (p) => tryClick(p.getByRole('button', { name: /^settings$/i }))],
  ['markdown-mode', async (p) => {
    await tryClick(p.getByRole('button', { name: 'More options for this day' }));
    await tryClick(p.getByRole('menuitem', { name: 'Edit as Markdown' }));
  }],
];
const DESKTOP = [
  ['today', async () => {}],
  ['history', async (p) => tryClick(p.getByRole('button', { name: /^\s*history\s*$/i }))],
  ['notes', async (p) => tryClick(p.getByRole('button', { name: /^\s*notes\s*$/i }))],
  ['server', async (p) => tryClick(p.getByRole('button', { name: /open sync settings/i }))],
  ['settings', async (p) => tryClick(p.getByRole('button', { name: /^\s*settings\s*$/i }))],
  ['quick-capture', async (p) => tryClick(p.getByRole('button', { name: /^new task/i }))],
  ['split-mode', async (p) => tryClick(p.getByRole('button', { name: /^\s*split\s*$/i }))],
];

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' }));
  const schemes = schemeArg ? [schemeArg] : ['light', 'dark'];
  const viewports = [
    ['phone', { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, PHONE],
    ['desktop', { viewport: { width: 1440, height: 900 } }, DESKTOP],
  ].filter(([name]) => !only || only === name);
  for (const scheme of schemes) {
    for (const [vpName, opts, screens] of viewports) {
      for (const [screen, action] of screens) {
        const ctx = await browser.newContext({ ...opts, colorScheme: scheme });
        const session = await signIn(ctx, base, 'audit-password-1');
        await resetServerVault(ctx, base, session.accessToken);
        const page = await ctx.newPage();
        await seedSample(page, base);
        await page.goto(base, { waitUntil: 'networkidle' });
        await page.waitForTimeout(800);
        await action(page);
        await page.waitForTimeout(700);
        await page.screenshot({ path: path.join(outDir, `${scheme}-${vpName}-${screen}.png`) });
        console.log('Captured', `${scheme}-${vpName}-${screen}`);
        await ctx.close();
      }
    }
  }
  console.log('Audit screenshots in', path.relative('.', outDir));
} finally {
  await browser?.close();
  killServer();
}
