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

// Android launcher icons (Capacitor app): legacy square + round PNGs and the adaptive-icon foreground.
const androidRes = path.resolve('mobile', 'android', 'app', 'src', 'main', 'res');
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const glyph = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  <g transform="translate(50 50) scale(${scale}) translate(-50 -50)">
    <path d="M30 50L45 65L72 32" stroke="white" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </g></svg>`;
if (fs.existsSync(androidRes)) {
  for (const [density, factor] of Object.entries(DENSITIES)) {
    const dir = path.join(androidRes, `mipmap-${density}`);
    const legacy = Math.round(48 * factor);
    const adaptive = Math.round(108 * factor);
    const shots = [
      { file: 'ic_launcher.png', size: legacy, html: `<div style="width:100%;height:100%;background:#d97706;border-radius:18%">${glyph(1)}</div>` },
      { file: 'ic_launcher_round.png', size: legacy, html: `<div style="width:100%;height:100%;background:#d97706;border-radius:50%">${glyph(0.8)}</div>` },
      // Foreground sits inside the adaptive icon's central 66% safe zone on a transparent canvas
      { file: 'ic_launcher_foreground.png', size: adaptive, html: glyph(0.6), transparent: true },
    ];
    for (const shot of shots) {
      const page = await browser.newPage({ viewport: { width: shot.size, height: shot.size } });
      await page.setContent(`<body style="margin:0;width:${shot.size}px;height:${shot.size}px;background:transparent">${shot.html}</body>`);
      await page.screenshot({ path: path.join(dir, shot.file), omitBackground: true });
      await page.close();
    }
    console.log('wrote android launcher icons for', density);
  }
  fs.writeFileSync(
    path.join(androidRes, 'values', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#D97706</color>
</resources>
`
  );
}
await browser.close();
