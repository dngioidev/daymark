import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

test('gallery navigation wraps in both directions and tolerates an empty gallery', async () => {
  const { nextIndex } = await import('../../site/zoom.js');
  assert.equal(nextIndex(2, 3, 1), 0);
  assert.equal(nextIndex(0, 3, -1), 2);
  assert.equal(nextIndex(0, 1, -1), 0);
  assert.equal(nextIndex(0, 0, 1), 0);
});

test('swipes require the threshold and follow reading direction', async () => {
  const { swipeStep } = await import('../../site/zoom.js');
  assert.equal(swipeStep(-40), 1);
  assert.equal(swipeStep(40), -1);
  assert.equal(swipeStep(39), 0);
  assert.equal(swipeStep(-39), 0);
  assert.equal(swipeStep(-20, 20), 1);
});

test('offline site build gives every screenshot a plain image link and zoom hook', () => {
  // Replace fetch before loading the build, so tests never depend on GitHub.
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    "globalThis.fetch = async () => ({ ok: false, status: 503 }); await import('./scripts/build-site.mjs')"],
  { cwd: new URL('../../', import.meta.url), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const html = readFileSync(new URL('../../_site/index.html', import.meta.url), 'utf8');
  const screenshots = [...html.matchAll(/<img\b[^>]*src="(screens\/[^"]+)"/g)];
  const links = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*data-zoom[^>]*>\s*<img\b[^>]*src="([^"]+)"/g)];
  assert.equal(links.length, screenshots.length);
  assert.ok(links.length > 1);
  for (const [, href, src] of links) assert.equal(href, src);
  assert.match(html, /<script[^>]*type="module"[^>]*src="zoom.js"/);
});
