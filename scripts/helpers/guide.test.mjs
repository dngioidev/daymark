import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const topic = (meta, body) => `---\n${meta}\n---\n${body}`;
const META = 'title: First\norder: 1\ngroup: start\nsummary: Get going in five minutes.\nshow: today\nrelated: second';

test('guide loader parses metadata, platform sections and sorts topics', async () => {
  const { loadGuide } = await import('./guide.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'daymark-guide-'));
  try {
    writeFileSync(join(dir, 'second.md'), topic('title: Second\norder: 2\ngroup: features\nsummary: Second topic.', '## Web\n1. Desktop step.\n## Tablet\n1. Tablet step.\n## Phone\n1. Phone step.'));
    writeFileSync(join(dir, 'first.md'), topic(META, '## Web\n1. Web step.\n## Phone\n1. Phone step.'));
    assert.deepEqual(loadGuide(dir), [
      { slug: 'first', title: 'First', order: 1, group: 'start', summary: 'Get going in five minutes.', show: 'today', related: ['second'], web: '1. Web step.', tablet: '1. Phone step.', phone: '1. Phone step.' },
      { slug: 'second', title: 'Second', order: 2, group: 'features', summary: 'Second topic.', show: undefined, related: [], web: '1. Desktop step.', tablet: '1. Tablet step.', phone: '1. Phone step.' },
    ]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('guide parser names the topic when a required part is missing or wrong', async () => {
  const { parseGuide } = await import('./guide-format.mjs');
  const ok = '## Web\n1. a\n## Phone\n1. b';
  assert.throws(() => parseGuide(topic('title: X\norder: 1\ngroup: start', ok), 'x'), /x.*summary/i);
  assert.throws(() => parseGuide(topic('title: X\norder: 1\ngroup: other\nsummary: s', ok), 'x'), /x.*group/i);
  assert.throws(() => parseGuide(topic('title: X\norder: 1\ngroup: start\nsummary: s\nshow: nowhere', ok), 'x'), /x.*show/i);
  assert.throws(() => parseGuide(topic(`title: X\norder: 1\ngroup: start\nsummary: ${'s'.repeat(161)}`, ok), 'x'), /x.*summary/i);
  assert.throws(() => parseGuide(topic('title: X\norder: 1\ngroup: start\nsummary: s', '## Web\n1. a'), 'x'), /x.*Phone/i);
  assert.throws(() => parseGuide(topic('title: X\norder: 1\ngroup: start\nsummary: s', '## Web\n\n## Phone\n1. b'), 'x'), /x.*Web/i);
});

test('every shipped guide topic has a summary, numbered steps on every platform and valid links', async () => {
  const { loadGuide } = await import('./guide.mjs');
  const topics = loadGuide(new URL('../../docs/guide/', import.meta.url));
  assert.equal(topics.length, 20);
  assert.deepEqual(topics.filter(t => t.group === 'start').map(t => t.slug), ['first-5-minutes', 'whats-new']);
  assert.deepEqual(topics.slice(0, 2).map(t => t.slug), ['first-5-minutes', 'whats-new']);
  const slugs = new Set(topics.map(t => t.slug));
  for (const t of topics) {
    for (const slug of t.related) assert.ok(slugs.has(slug), `${t.slug}: related ${slug}`);
    for (const platform of ['web', 'tablet', 'phone']) {
      const words = t[platform].split(/\s+/).length;
      assert.ok(words >= 25 && words <= 220, `${t.slug} ${platform}: ${words} words`);
      assert.match(t[platform], /^1\. /m, `${t.slug} ${platform}: numbered steps`);
    }
  }
});

test('every screenshot a guide topic references exists', async () => {
  const { loadGuide, guideImages } = await import('./guide.mjs');
  const topics = loadGuide(new URL('../../docs/guide/', import.meta.url));
  const names = topics.flatMap(t => [t.web, t.tablet, t.phone].flatMap(guideImages));
  assert.ok(names.length >= 6, `${names.length} screenshots referenced`);
  for (const name of new Set(names)) assert.ok(existsSync(new URL(`../../docs/guide/images/${name}`, import.meta.url)), name);
});

test('feature topics explain tags, the pen tools and every keyboard shortcut', async () => {
  const { loadGuide } = await import('./guide.mjs');
  const topics = loadGuide(new URL('../../docs/guide/', import.meta.url));
  const bySlug = slug => topics.find(t => t.slug === slug);
  const tags = bySlug('tags');
  for (const platform of ['web', 'phone']) for (const phrase of [/#/, /Tags section/, /#project\/daymark/]) assert.match(tags[platform], phrase);
  assert.equal(tags.show, 'notes-tags');
  const pen = bySlug('handwriting');
  for (const platform of ['web', 'tablet', 'phone']) {
    for (const phrase of [/handwritten note/i, /lined.*grid/i, /S Pen button/, /Select/, /loop/, /resize/, /action bar/, /Text boxes work without a pen/, /Draw-and-hold/]) assert.match(pen[platform], phrase, `${platform} ${phrase}`);
  }
  for (const phrase of [/side rail/, /Move rail to right/]) assert.match(bySlug('full-screen').tablet, phrase);
  for (const phrase of [/Related panel/, /Hidden suggestions/, /Possibly related/]) assert.match(bySlug('related-and-graph').web, phrase);
  const keys = bySlug('shortcuts').web;
  for (const shortcut of ['Ctrl/⌘ K', 'Ctrl/⌘ Shift F', 'g t', 'g c', 'g n', 'g b', 'Ctrl/⌘ .', '?', 'Esc']) assert.ok(keys.includes(shortcut), shortcut);
});

test('built Guide links every topic and includes all three platforms without JavaScript', async () => {
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
  for (const platform of ['web', 'tablet', 'phone']) assert.match(html, new RegExp(`data-platform="${platform}"`));
  assert.match(html, /<ol>/);
  assert.match(html, /<img src="guide-images\//);
  assert.match(html, /src="zoom.js"/);
});
