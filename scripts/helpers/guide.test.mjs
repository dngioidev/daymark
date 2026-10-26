import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('guide loader parses metadata, splits platforms and sorts topics', async () => {
  const { loadGuide } = await import('./guide.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'daymark-guide-'));
  try {
    writeFileSync(join(dir, 'second.md'), '---\ntitle: Second\norder: 2\n---\n## Web\nDesktop instructions.\n## Mobile\nPhone instructions.');
    writeFileSync(join(dir, 'first.md'), '---\ntitle: First\norder: 1\n---\n## Web\nWeb text.\n## Mobile\nMobile text.');
    assert.deepEqual(loadGuide(dir), [
      { slug: 'first', title: 'First', order: 1, web: 'Web text.', mobile: 'Mobile text.' },
      { slug: 'second', title: 'Second', order: 2, web: 'Desktop instructions.', mobile: 'Phone instructions.' },
    ]);
    writeFileSync(join(dir, 'broken.md'), '---\ntitle: Broken\norder: 3\n---\n## Web\nOnly web.');
    assert.throws(() => loadGuide(dir), /broken.*Mobile/i);
    writeFileSync(join(dir, 'broken.md'), '---\ntitle: Broken\norder: 3\n---\n## Web\nOnly web.\n## Mobile\n');
    assert.throws(() => loadGuide(dir), /broken.*Mobile/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('every shipped guide topic includes usable Web and Mobile instructions', async () => {
  const { loadGuide } = await import('./guide.mjs');
  const topics = loadGuide(new URL('../../docs/guide/', import.meta.url));
  assert.equal(topics.length, 13);
  assert.equal(topics[0].title, 'Getting started and install');
  assert.equal(topics.at(-1).title, 'Shortcuts and gestures');
  for (const topic of topics) {
    for (const platform of ['web', 'mobile']) {
      const words = topic[platform].split(/\s+/).length;
      assert.ok(words >= 80 && words <= 250, `${topic.slug} ${platform}: ${words} words`);
    }
  }
});

test('built Guide links every topic and includes both platforms without JavaScript', async () => {
  const { loadGuide } = await import('./guide.mjs');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    "globalThis.fetch = async () => ({ ok: false, status: 503 }); await import('./scripts/build-site.mjs')"],
  { cwd: new URL('../../', import.meta.url), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const html = readFileSync(new URL('../../_site/guide.html', import.meta.url), 'utf8');
  for (const topic of loadGuide(new URL('../../docs/guide/', import.meta.url))) {
    assert.ok(html.includes(`href="#${topic.slug}"`));
    assert.ok(html.includes(`id="${topic.slug}"`));
  }
  assert.match(html, /data-platform="web"/);
  assert.match(html, /data-platform="mobile"/);
  assert.match(html, /src="zoom.js"/);
});
