#!/usr/bin/env node
/**
 * Renders the Daymark app icon to PNG files in public/icons/ (needed for Android install:
 * Chrome requires real 192px and 512px PNG icons, not data-URI SVGs).
 * Usage: node scripts/generate-icons.mjs   (uses local Chrome or Edge via playwright-core)
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const outDir = path.resolve('public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

// `inset` shrinks the glyph so maskable icons keep it inside the 80% safe zone
const svg = (inset) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  <rect width="100" height="100" fill="#d97706"/>
  <g transform="translate(50 50) scale(${inset}) translate(-50 -50)">
    <path d="M30 50L45 65L72 32" stroke="white" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </g>
</svg>`;

const ICONS = [
  { file: 'icon-192.png', size: 192, inset: 1 },
  { file: 'icon-512.png', size: 512, inset: 1 },
  { file: 'icon-maskable-512.png', size: 512, inset: 0.7 },
];

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' }));
for (const icon of ICONS) {
  const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
  await page.setContent(`<body style="margin:0;width:${icon.size}px;height:${icon.size}px">${svg(icon.inset)}</body>`);
  await page.screenshot({ path: path.join(outDir, icon.file) });
  await page.close();
  console.log('wrote', path.join('public', 'icons', icon.file));
}
await browser.close();
