#!/usr/bin/env node
/**
 * Read-only inventory of every visible interactive element per screen (phone + desktop),
 * used to make sure the UX/UI test suite covers every control.
 * Usage: npm run build && node scripts/ux-inventory.mjs > inventory.txt
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const PORT = 3107;
const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['tsx', 'server.ts', '--production'], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-inv-')), DAYMARK_PASSWORD: 'inventory-pass-1' },
  shell: true,
  stdio: 'ignore',
});
const stop = () => (process.platform === 'win32' ? spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' }) : server.kill());
for (let i = 0; i < 75; i++) {
  try {
    if ((await fetch(`${base}/api/health`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 400));
}

const click = async (page, locator) => {
  try {
    await locator.first().click({ timeout: 3000 });
    await page.waitForTimeout(500);
  } catch (e) {
    console.log(`  !! could not open: ${e.message.split('\n')[0]}`);
  }
};

const PHONE = {
  'today': async () => {},
  'quick-capture': async (p) => click(p, p.getByTitle('Quick Capture')),
  'task-status-menu': async (p) => click(p, p.getByRole('button', { name: /in progress/i })),
  'task-options-menu': async (p) => click(p, p.locator('button:has(svg.lucide-more-horizontal), button:has(svg.lucide-ellipsis)')),
  'task-details': async (p) => click(p, p.getByText('Details')),
  'historical-modal': async (p) => click(p, p.getByText('Other past date')),
  'section-add-task': async (p) => click(p, p.getByRole('button', { name: /^\s*task\s*$/i })),
  'section-add-note': async (p) => click(p, p.getByRole('button', { name: /^\s*note\s*$/i })),
  'markdown-mode': async (p) => click(p, p.getByRole('button', { name: /^\s*markdown\s*$/i })),
  'history': async (p) => click(p, p.getByRole('button', { name: /^\s*history\s*$/i })),
  'notes': async (p) => click(p, p.getByRole('button', { name: /^\s*notes\s*$/i })),
  'note-editor': async (p) => {
    await click(p, p.getByRole('button', { name: /^\s*notes\s*$/i }));
    await click(p, p.getByText('Weekly Sprint Sync Notes'));
  },
  'sync': async (p) => click(p, p.getByRole('button', { name: /^\s*sync\s*$/i })),
  'settings': async (p) => click(p, p.getByRole('button', { name: /settings, backup and import/i })),
};
const DESKTOP = {
  'today': async () => {},
  'split-mode': async (p) => click(p, p.getByRole('button', { name: /^\s*split\s*$/i })),
  'history': async (p) => click(p, p.getByRole('button', { name: /^\s*history\s*$/i })),
  'notes': async (p) => click(p, p.getByRole('button', { name: /^\s*notes\s*$/i })),
  'sync': async (p) => click(p, p.getByRole('button', { name: /^\s*sync\s*$/i })),
  'settings': async (p) => click(p, p.getByRole('button', { name: /^\s*settings\s*$/i })),
  'mobile-app-view': async (p) => click(p, p.getByRole('button', { name: /mobile app view/i })),
};

const describe = () =>
  [...document.querySelectorAll('button, a[href], input, select, textarea, [role=button], [role=tab]')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    })
    .map((el) => {
      const r = el.getBoundingClientRect();
      const name = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      return `${el.tagName.toLowerCase()}${el.type ? `[${el.type}]` : ''} "${name}" ${Math.round(r.width)}x${Math.round(r.height)}`;
    });

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' }));
try {
  for (const [vp, opts, screens] of [
    ['phone', { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true }, PHONE],
    ['desktop', { viewport: { width: 1440, height: 900 } }, DESKTOP],
  ]) {
    for (const [name, open] of Object.entries(screens)) {
      const ctx = await browser.newContext(opts);
      const page = await ctx.newPage();
      await page.goto(base, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /explore with sample data/i }).click();
      await page.waitForTimeout(600);
      await open(page);
      const items = await page.evaluate(describe);
      console.log(`\n## ${vp} / ${name} (${items.length})`);
      for (const it of [...new Set(items)]) console.log('  ' + it);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  stop();
}
